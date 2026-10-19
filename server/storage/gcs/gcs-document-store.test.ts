import type { Storage } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import { GcsDocumentStore } from "./gcs-document-store";

const objectPath = "customers/8a3c2f9e-1b2d-4c5e-9f00-112233445566/intake/0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e/a.pdf";

/** Records what would be signed; no network, no credentials. */
function fakeStorage() {
  const calls: Record<string, unknown>[] = [];
  const storage = {
    bucket: () => ({
      file: () => ({
        getSignedUrl: async (options: Record<string, unknown>) => {
          calls.push(options);
          return ["https://storage.googleapis.com/signed"];
        },
      }),
    }),
  } as unknown as Storage;
  return { storage, calls };
}

describe("GcsDocumentStore.createUploadUrl", () => {
  it("signs a size cap and a create-only precondition, and tells the client to send both", async () => {
    const { storage, calls } = fakeStorage();
    const store = new GcsDocumentStore({ bucket: "maaz-docs", storage });
    const upload = await store.createUploadUrl({ objectPath, contentType: "application/pdf", maxBytes: 100 });

    expect(calls[0]).toMatchObject({
      version: "v4",
      action: "write",
      contentType: "application/pdf",
      extensionHeaders: { "x-goog-content-length-range": "0,100", "x-goog-if-generation-match": "0" },
    });
    expect(upload.headers).toEqual({
      "content-type": "application/pdf",
      "x-goog-content-length-range": "0,100",
      "x-goog-if-generation-match": "0",
    });
  });
});
