import { describe, expect, it } from "vitest";
import { parseEnv } from "~server/config";
import { createDocumentStore, GcsDocumentStore, LocalDocumentStore } from "./index";

const base = { DATABASE_URL: "postgres://localhost/x", BETTER_AUTH_SECRET: "x".repeat(32) };

describe("createDocumentStore", () => {
  it("uses local disk by default", () => {
    expect(createDocumentStore(parseEnv(base))).toBeInstanceOf(LocalDocumentStore);
  });

  it("uses Cloud Storage when STORAGE_DRIVER=gcs, without needing credentials to construct", () => {
    const store = createDocumentStore(parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs" }));
    expect(store).toBeInstanceOf(GcsDocumentStore);
    expect(store.driver).toBe("gcs");
  });
});
