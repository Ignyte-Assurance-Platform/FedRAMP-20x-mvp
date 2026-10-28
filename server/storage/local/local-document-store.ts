import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import {
  attachmentDisposition,
  urlExpiry,
  type DocumentStore,
  type DownloadUrlOptions,
  type ObjectStat,
  type ResumableSession,
  type ResumableUploadInput,
  type SignedUrl,
  type UploadUrlInput,
} from "../document-store";
import { assertObjectPath } from "../paths";
import { crc32cBase64, crc32cUpdate } from "./crc32c";
import { signGrant, verifyGrant, type LocalGrant } from "./token";

export interface LocalDocumentStoreOptions {
  /** Directory that plays the role of the bucket. */
  rootDir: string;
  /** Base URL of the app; signed URLs point at the dev-only route /api/uploads/:token. */
  appUrl: string;
  secret: string;
}

class TooLargeError extends Error {}

/** Resumable sessions last a week on Cloud Storage; the local grant does the same. */
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface ObjectMeta {
  contentType: string;
  sha256: string | null;
  md5?: string;
  crc32c?: string;
}

/** "bytes 0-99/250" (a part), or a range of "*" over 250 (asking how much is stored). */
export function parseContentRange(header: string | null): { start: number; end: number; total: number } | { total: number } | null {
  const part = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header ?? "");
  if (part) {
    const [start, end, total] = [Number(part[1]), Number(part[2]), Number(part[3])];
    return start <= end && end < total ? { start, end, total } : null;
  }
  const query = /^bytes \*\/(\d+)$/.exec(header ?? "");
  return query ? { total: Number(query[1]) } : null;
}

/** 308 with the stored range, as Cloud Storage answers an unfinished session. */
function incomplete(stored: number): Response {
  return new Response(null, { status: 308, headers: stored > 0 ? { range: `bytes=0-${stored - 1}` } : {} });
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

/** MD5 and CRC32C of a whole file, the two checksums Cloud Storage reports. */
async function checksums(file: string): Promise<{ md5: string; crc32c: string }> {
  const md5 = createHash("md5");
  let crc = 0;
  for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) {
    md5.update(chunk);
    crc = crc32cUpdate(crc, chunk);
  }
  return { md5: md5.digest("base64"), crc32c: crc32cBase64(crc) };
}

/**
 * Local disk stand-in for Cloud Storage. Signed URLs point at /api/uploads/:token, which the
 * Hono server (server/index.ts) routes to this driver only, and which calls
 * put() and send() below. Each object gets a sidecar `.meta.json` with its content type,
 * MD5 and CRC32C (and SHA-256 for single uploads), the way Cloud Storage keeps object metadata.
 * Resumable sessions keep their bytes in `<object>.part` until the last byte arrives.
 */
export class LocalDocumentStore implements DocumentStore {
  readonly driver = "local" as const;
  readonly rootDir: string;

  constructor(private readonly options: LocalDocumentStoreOptions) {
    this.rootDir = path.resolve(options.rootDir);
  }

  async createUploadUrl(input: UploadUrlInput): Promise<SignedUrl> {
    assertObjectPath(input.objectPath);
    const expiresAt = urlExpiry(input.expiresInSeconds);
    const token = this.sign({ op: "put", path: input.objectPath, ct: input.contentType, max: input.maxBytes }, expiresAt);
    return { url: this.url(token), method: "PUT", headers: { "content-type": input.contentType }, expiresAt };
  }

  async createResumableUpload(input: ResumableUploadInput): Promise<ResumableSession> {
    assertObjectPath(input.objectPath);
    const token = this.sign({ op: "session", path: input.objectPath, ct: input.contentType, size: input.size }, urlExpiry(SESSION_TTL_SECONDS));
    return { url: this.url(token) };
  }

  async createDownloadUrl(objectPath: string, options: DownloadUrlOptions = {}): Promise<SignedUrl> {
    assertObjectPath(objectPath);
    const expiresAt = urlExpiry(options.expiresInSeconds);
    const grant: Omit<LocalGrant, "exp"> = { op: "get", path: objectPath };
    if (options.filename) grant.fn = options.filename;
    return { url: this.url(this.sign(grant, expiresAt)), method: "GET", headers: {}, expiresAt };
  }

  async delete(objectPath: string): Promise<void> {
    const file = this.resolve(objectPath);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
    await rm(`${file}.part`, { force: true });
  }

  async stat(objectPath: string): Promise<ObjectStat | null> {
    const file = this.resolve(objectPath);
    try {
      const [info, meta] = await Promise.all([stat(file), readFile(`${file}.meta.json`, "utf8")]);
      const parsed = JSON.parse(meta) as ObjectMeta;
      return { size: info.size, contentType: parsed.contentType, sha256: parsed.sha256, md5: parsed.md5 ?? null, crc32c: parsed.crc32c ?? null, updatedAt: info.mtime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async readStart(objectPath: string, bytes: number): Promise<Buffer | null> {
    const file = this.resolve(objectPath);
    try {
      const handle = await open(file, "r");
      try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /** Handles a PUT to a signed upload URL. */
  async receive(token: string, contentType: string | null, body: ReadableStream<Uint8Array> | null): Promise<Response> {
    const grant = verifyGrant(token, this.options.secret);
    if (!grant || grant.op !== "put") return new Response("invalid or expired upload URL", { status: 403 });
    if (grant.ct && contentType !== grant.ct) return new Response("content-type does not match the signed URL", { status: 400 });
    if (!body) return new Response("empty body", { status: 400 });

    const file = this.resolve(grant.path);
    // An object is final once stored: a replayed URL must not change bytes whose size and
    // SHA-256 are already recorded. A failed partial upload leaves nothing, so it can retry.
    if (await this.stat(grant.path)) return new Response("object already uploaded", { status: 409 });
    await mkdir(path.dirname(file), { recursive: true });
    const hash = createHash("sha256");
    const max = grant.max ?? Number.POSITIVE_INFINITY;
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > max) return callback(new TooLargeError("file too large"));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(body as NodeWebReadableStream<Uint8Array>), meter, createWriteStream(file));
    } catch (error) {
      await rm(file, { force: true });
      if (error instanceof TooLargeError) return new Response(error.message, { status: 413 });
      throw error;
    }
    const meta: ObjectMeta = { contentType: grant.ct ?? contentType ?? "application/octet-stream", sha256: hash.digest("hex"), ...(await checksums(file)) };
    await writeFile(`${file}.meta.json`, JSON.stringify(meta));
    return new Response(null, { status: 200 });
  }

  /** Every PUT to the dev-only route: a signed single upload, or a part of a resumable session. */
  async put(token: string, request: Request): Promise<Response> {
    const grant = verifyGrant(token, this.options.secret);
    if (grant?.op === "session") return this.receivePart(token, request.headers.get("content-range"), request.body);
    return this.receive(token, request.headers.get("content-type"), request.body);
  }

  /**
   * One request to a resumable session, answered the way Cloud Storage answers it: a part must
   * start where the stored bytes end (otherwise 308 with the stored range, so the client resyncs),
   * and a range of "*" asks for that range. The object appears, with its MD5 and CRC32C, only once
   * all N bytes are stored. A part cut off midway is dropped whole, so the next request resumes
   * at a part boundary.
   */
  async receivePart(token: string, contentRange: string | null, body: ReadableStream<Uint8Array> | null): Promise<Response> {
    const grant = verifyGrant(token, this.options.secret);
    if (!grant || grant.op !== "session" || grant.size === undefined) {
      await body?.cancel();
      return new Response("invalid or expired upload session", { status: 403 });
    }
    const range = parseContentRange(contentRange);
    if (!range || range.total !== grant.size) {
      await body?.cancel();
      return new Response("Content-Range must give the session's size", { status: 400 });
    }
    if (await this.stat(grant.path)) {
      await body?.cancel();
      return new Response(null, { status: 200 });
    }
    const file = this.resolve(grant.path);
    const part = `${file}.part`;
    const stored = await sizeOf(part);
    if (!("start" in range) || range.start !== stored || !body) {
      await body?.cancel();
      return incomplete(stored);
    }
    const expected = range.end - range.start + 1;
    let received = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > expected) return callback(new TooLargeError("part larger than its Content-Range"));
        callback(null, chunk);
      },
    });
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await pipeline(Readable.fromWeb(body as NodeWebReadableStream<Uint8Array>), meter, createWriteStream(part, { flags: "a" }));
      if (received !== expected) throw new TooLargeError("part shorter than its Content-Range");
    } catch (error) {
      if (stored > 0) await truncate(part, stored);
      else await rm(part, { force: true });
      if (error instanceof TooLargeError) return new Response(error.message, { status: 400 });
      throw error;
    }
    if (stored + received < grant.size) return incomplete(stored + received);
    const meta: ObjectMeta = { contentType: grant.ct ?? "application/octet-stream", sha256: null, ...(await checksums(part)) };
    await rename(part, file);
    await writeFile(`${file}.meta.json`, JSON.stringify(meta));
    return new Response(null, { status: 200 });
  }

  /** Handles a GET to a signed download URL. */
  async send(token: string): Promise<Response> {
    const grant = verifyGrant(token, this.options.secret);
    if (!grant || grant.op !== "get") return new Response("invalid or expired download URL", { status: 403 });
    const info = await this.stat(grant.path);
    if (!info) return new Response("not found", { status: 404 });
    const stream = Readable.toWeb(createReadStream(this.resolve(grant.path))) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "content-type": info.contentType,
        "content-length": String(info.size),
        "content-disposition": attachmentDisposition(grant.fn ?? path.posix.basename(grant.path)),
      },
    });
  }

  /** Absolute file path for an object path; never escapes rootDir. */
  resolve(objectPath: string): string {
    assertObjectPath(objectPath);
    const file = path.resolve(this.rootDir, ...objectPath.split("/"));
    if (!file.startsWith(this.rootDir + path.sep)) throw new Error(`invalid object path: ${objectPath}`);
    return file;
  }

  private sign(grant: Omit<LocalGrant, "exp">, expiresAt: Date): string {
    return signGrant({ ...grant, exp: Math.floor(expiresAt.getTime() / 1000) }, this.options.secret);
  }

  private url(token: string): string {
    return new URL(`/api/uploads/${token}`, this.options.appUrl).toString();
  }
}
