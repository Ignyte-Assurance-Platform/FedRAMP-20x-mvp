import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  type SignedUrl,
  type UploadUrlInput,
} from "../document-store";
import { assertObjectPath } from "../paths";
import { signGrant, verifyGrant, type LocalGrant } from "./token";

export interface LocalDocumentStoreOptions {
  /** Directory that plays the role of the bucket. */
  rootDir: string;
  /** Base URL of the app; signed URLs point at the dev-only route /api/uploads/:token. */
  appUrl: string;
  secret: string;
}

class TooLargeError extends Error {}

/**
 * Local disk stand-in for Cloud Storage. Signed URLs point at the resource route
 * app/routes/api/uploads.$token.ts, which exists only for this driver and calls
 * receive() and send() below. Each object gets a sidecar `.meta.json` with its content
 * type and SHA-256, the way Cloud Storage keeps object metadata.
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
  }

  async stat(objectPath: string): Promise<ObjectStat | null> {
    const file = this.resolve(objectPath);
    try {
      const [info, meta] = await Promise.all([stat(file), readFile(`${file}.meta.json`, "utf8")]);
      const parsed = JSON.parse(meta) as { contentType: string; sha256: string };
      return { size: info.size, contentType: parsed.contentType, sha256: parsed.sha256, updatedAt: info.mtime };
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
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType: grant.ct ?? contentType, sha256: hash.digest("hex") }));
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
