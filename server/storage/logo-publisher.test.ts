import type { Storage } from "@google-cloud/storage";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GcsLogoPublisher, LOGO_CACHE_CONTROL, LocalLogoPublisher } from "./logo-publisher";

const objectPath = "customers/1b0e8a4e-3a61-4d0a-9d2c-6c1b2b9f6f10/logo/5f0c6f2e-8e3b-4a57-9b0e-2b8c1d7a9e11.png";

describe("LocalLogoPublisher", () => {
  let root: string;
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("copies the object to the logos folder at the same path", async () => {
    root = await mkdtemp(path.join(tmpdir(), "logos-"));
    const documentsDir = path.join(root, "documents");
    const logosDir = path.join(root, "logos");
    await mkdir(path.dirname(path.join(documentsDir, objectPath)), { recursive: true });
    await writeFile(path.join(documentsDir, objectPath), "png bytes");
    const publisher = new LocalLogoPublisher({ documentsDir, logosDir });

    expect(await publisher.isPublished(objectPath)).toBe(false);
    await publisher.publish(objectPath);
    expect(await readFile(path.join(logosDir, objectPath), "utf8")).toBe("png bytes");
    expect(await publisher.isPublished(objectPath)).toBe(true);
    await publisher.unpublish(objectPath);
    expect(await publisher.isPublished(objectPath)).toBe(false);
  });

  it("fails when the checked object is missing, and refuses paths outside customers/", async () => {
    root = await mkdtemp(path.join(tmpdir(), "logos-"));
    const publisher = new LocalLogoPublisher({ documentsDir: path.join(root, "d"), logosDir: path.join(root, "l") });
    await expect(publisher.publish(objectPath)).rejects.toThrow();
    await expect(publisher.publish("../secrets/x.png")).rejects.toThrow(/not a logo object path/);
    // A customer document under customers/ is never publishable, only the logo path is.
    await expect(
      publisher.publish("customers/1b0e8a4e-3a61-4d0a-9d2c-6c1b2b9f6f10/intake/5f0c6f2e-8e3b-4a57-9b0e-2b8c1d7a9e11/contract.pdf"),
    ).rejects.toThrow(/not a logo object path/);
  });
});

describe("GcsLogoPublisher", () => {
  it("copies server-side from the documents bucket to the logos bucket with type and cache header", async () => {
    const copy = vi.fn().mockResolvedValue([]);
    const files: Record<string, { copy: typeof copy; exists: () => Promise<[boolean]> }> = {};
    const storage = {
      bucket: (name: string) => ({
        file: (p: string) => (files[`${name}/${p}`] ??= { copy, exists: async () => [name === "logos"] }),
      }),
    } as unknown as Storage;
    const publisher = new GcsLogoPublisher({ documentsBucket: "docs", logosBucket: "logos", storage });

    await publisher.publish(objectPath, "image/png");
    expect(copy).toHaveBeenCalledWith(files[`logos/${objectPath}`], { contentType: "image/png", cacheControl: LOGO_CACHE_CONTROL });
    expect(files[`docs/${objectPath}`]).toBeDefined();
    expect(await publisher.isPublished(objectPath)).toBe(true);
  });
});
