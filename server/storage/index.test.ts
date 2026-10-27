import { describe, expect, it } from "vitest";
import { parseEnv } from "~server/config";
import { createDocumentStore, createLogoPublisher, GcsDocumentStore, GcsLogoPublisher, LocalDocumentStore, LocalLogoPublisher } from "./index";

const base = { DATABASE_URL: "postgres://localhost/x", BETTER_AUTH_SECRET: "x".repeat(32) };

describe("createDocumentStore", () => {
  it("uses local disk by default", () => {
    expect(createDocumentStore(parseEnv(base))).toBeInstanceOf(LocalDocumentStore);
  });

  it("uses Cloud Storage when STORAGE_DRIVER=gcs, without needing credentials to construct", () => {
    const store = createDocumentStore(parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-logos" }));
    expect(store).toBeInstanceOf(GcsDocumentStore);
    expect(store.driver).toBe("gcs");
  });
});

describe("createLogoPublisher", () => {
  it("copies between local folders by default", () => {
    expect(createLogoPublisher(parseEnv(base))).toBeInstanceOf(LocalLogoPublisher);
  });

  it("copies between the two buckets when STORAGE_DRIVER=gcs", () => {
    const env = parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-logos" });
    expect(createLogoPublisher(env)).toBeInstanceOf(GcsLogoPublisher);
  });
});
