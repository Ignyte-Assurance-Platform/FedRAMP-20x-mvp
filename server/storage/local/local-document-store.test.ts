import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { intakeObjectPath } from "../paths";
import { LocalDocumentStore } from "./local-document-store";

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
