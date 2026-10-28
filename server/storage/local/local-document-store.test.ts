import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { intakeObjectPath } from "../paths";
import { crc32cBase64, crc32cUpdate } from "./crc32c";
import { LocalDocumentStore, parseContentRange } from "./local-document-store";

const customerId = "8a3c2f9e-1b2d-4c5e-9f00-112233445566";
const documentId = "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";
const objectPath = intakeObjectPath(customerId, documentId, "plan.pdf");
const pdf = "application/pdf";

let rootDir: string;
let store: LocalDocumentStore;

const tokenOf = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").pop()!);
const bodyOf = (text: string) => new Response(text).body!;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "maaz-store-"));
  store = new LocalDocumentStore({ rootDir, appUrl: "http://localhost:3000", secret: "s".repeat(32) });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("LocalDocumentStore", () => {
  it("stores an upload at the contract path and reports size, type and SHA-256", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024 });
    expect(upload.method).toBe("PUT");
    expect(upload.url).toMatch(/^http:\/\/localhost:3000\/api\/uploads\//);

    const res = await store.receive(tokenOf(upload.url), pdf, bodyOf("%PDF-1.7 hello"));
    expect(res.status).toBe(200);

    const onDisk = path.join(rootDir, "customers", customerId, "intake", documentId, "plan.pdf");
    expect(await readFile(onDisk, "utf8")).toBe("%PDF-1.7 hello");
    expect(await store.stat(objectPath)).toMatchObject({
      size: 14,
      contentType: pdf,
      sha256: createHash("sha256").update("%PDF-1.7 hello").digest("hex"),
    });
  });

  it("serves a download through a signed URL", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024 });
    await store.receive(tokenOf(upload.url), pdf, bodyOf("data"));
    const download = await store.createDownloadUrl(objectPath, { filename: "Plan v1.pdf" });
    const res = await store.send(tokenOf(download.url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("data");
    expect(res.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''Plan%20v1.pdf");
  });

  it("rejects a tampered, expired or wrong-operation token", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024 });
    const token = tokenOf(upload.url);
    expect((await store.receive(`${token}x`, pdf, bodyOf("a"))).status).toBe(403);

    const expired = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024, expiresInSeconds: -1 });
    expect((await store.receive(tokenOf(expired.url), pdf, bodyOf("a"))).status).toBe(403);

    expect((await store.send(token)).status).toBe(403);
  });

  it("rejects a content type that differs from the signed one", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024 });
    expect((await store.receive(tokenOf(upload.url), "text/html", bodyOf("a"))).status).toBe(400);
  });

  it("rejects an upload over the size limit and leaves nothing behind", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 4 });
    expect((await store.receive(tokenOf(upload.url), pdf, bodyOf("12345"))).status).toBe(413);
    expect(await store.stat(objectPath)).toBeNull();
  });

  it("rejects a replayed upload URL and keeps the stored content", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024 });
    const token = tokenOf(upload.url);
    expect((await store.receive(token, pdf, bodyOf("original"))).status).toBe(200);
    const before = await store.stat(objectPath);

    expect((await store.receive(token, pdf, bodyOf("replaced"))).status).toBe(409);
    expect(await readFile(store.resolve(objectPath), "utf8")).toBe("original");
    expect((await store.stat(objectPath))?.sha256).toBe(before?.sha256);
  });

  it("lets a failed upload be retried with the same URL", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 4 });
    const token = tokenOf(upload.url);
    expect((await store.receive(token, pdf, bodyOf("too long"))).status).toBe(413);
    expect((await store.receive(token, pdf, bodyOf("ok"))).status).toBe(200);
  });

  it("deletes an object", async () => {
    const upload = await store.createUploadUrl({ objectPath, contentType: pdf, maxBytes: 1024 });
    await store.receive(tokenOf(upload.url), pdf, bodyOf("a"));
    await store.delete(objectPath);
    expect(await store.stat(objectPath)).toBeNull();
  });

  it("never resolves outside its root", () => {
    expect(() => store.resolve("customers/../../outside")).toThrow();
  });
});

/** A body that sends `sent` and then breaks, as a dropped connection does. */
const brokenBody = (sent: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sent));
      controller.error(new Error("connection reset"));
    },
  });

describe("LocalDocumentStore resumable sessions (WI-006 §8)", () => {
  const content = "%PDF-1.7 0123456789abcdefghij"; // 29 bytes
  const size = content.length;
  const open = async () => tokenOf((await store.createResumableUpload({ objectPath, contentType: pdf, size, origin: "http://localhost:3000" })).url);
  const part = (token: string, start: number, end: number, body = content.slice(start, end + 1)) =>
    store.receivePart(token, `bytes ${start}-${end}/${size}`, bodyOf(body));
  const status = (token: string) => store.receivePart(token, `bytes */${size}`, null);

  it("parses Content-Range parts and status queries, and refuses anything else", () => {
    expect(parseContentRange("bytes 0-9/29")).toEqual({ start: 0, end: 9, total: 29 });
    expect(parseContentRange("bytes */29")).toEqual({ total: 29 });
    expect(parseContentRange("bytes 9-0/29")).toBeNull();
    expect(parseContentRange("bytes 0-29/29")).toBeNull();
    expect(parseContentRange(null)).toBeNull();
  });

  it("stores the object only when the last part arrives, with Cloud Storage's MD5 and CRC32C and no SHA-256", async () => {
    const token = await open();
    const first = await part(token, 0, 9);
    expect(first.status).toBe(308);
    expect(first.headers.get("range")).toBe("bytes=0-9");
    expect(await store.stat(objectPath)).toBeNull();

    expect((await part(token, 10, size - 1)).status).toBe(200);
    expect(await readFile(store.resolve(objectPath), "utf8")).toBe(content);
    expect(await store.stat(objectPath)).toMatchObject({
      size,
      contentType: pdf,
      sha256: null,
      md5: createHash("md5").update(content).digest("base64"),
      crc32c: crc32cBase64(crc32cUpdate(0, Buffer.from(content))),
    });
  });

  it("answers a status query with the stored range, and none before the first byte", async () => {
    const token = await open();
    const empty = await status(token);
    expect(empty.status).toBe(308);
    expect(empty.headers.get("range")).toBeNull();
    await part(token, 0, 9);
    expect((await status(token)).headers.get("range")).toBe("bytes=0-9");
  });

  it("a part cut off midway is dropped whole: the status query names the last complete part, and the upload resumes there", async () => {
    const token = await open();
    await part(token, 0, 9);
    await expect(store.receivePart(token, `bytes 10-19/${size}`, brokenBody("0123"))).rejects.toThrow("connection reset");
    expect((await status(token)).headers.get("range")).toBe("bytes=0-9");
    expect((await part(token, 10, size - 1)).status).toBe(200);
    expect(await readFile(store.resolve(objectPath), "utf8")).toBe(content);
  });

  it("a part that does not start where the stored bytes end gets 308 with the stored range, and nothing is written", async () => {
    const token = await open();
    await part(token, 0, 9);
    const skipped = await part(token, 20, size - 1);
    expect(skipped.status).toBe(308);
    expect(skipped.headers.get("range")).toBe("bytes=0-9");
    const again = await part(token, 0, 9);
    expect(again.headers.get("range")).toBe("bytes=0-9");
  });

  it("refuses a size other than the session's, a body longer or shorter than its range, and a tampered token", async () => {
    const token = await open();
    expect((await store.receivePart(token, "bytes 0-9/30", bodyOf(content.slice(0, 10)))).status).toBe(400);
    expect((await part(token, 0, 9, "too long for the range")).status).toBe(400);
    expect((await part(token, 0, 9, "short")).status).toBe(400);
    expect((await status(token)).headers.get("range")).toBeNull();
    expect((await part(`${token}x`, 0, 9)).status).toBe(403);
  });

  it("a finished session answers 200 and never changes the stored object", async () => {
    const token = await open();
    await part(token, 0, size - 1);
    expect((await part(token, 0, size - 1, "X".repeat(size))).status).toBe(200);
    expect(await readFile(store.resolve(objectPath), "utf8")).toBe(content);
  });

  it("put() routes a session token to the session and a signed upload URL to the single upload", async () => {
    const token = await open();
    const res = await store.put(token, new Request("http://localhost/", { method: "PUT", headers: { "content-range": `bytes 0-${size - 1}/${size}` }, body: content }));
    expect(res.status).toBe(200);
    const other = intakeObjectPath(customerId, "1f1e2d3c-4b5a-4968-8778-695a4b3c2d1e", "b.pdf");
    const single = await store.createUploadUrl({ objectPath: other, contentType: pdf, maxBytes: 100 });
    expect((await store.put(tokenOf(single.url), new Request("http://localhost/", { method: "PUT", headers: { "content-type": pdf }, body: "x" }))).status).toBe(200);
  });
});
