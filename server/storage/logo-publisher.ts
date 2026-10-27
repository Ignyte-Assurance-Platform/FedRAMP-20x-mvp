import type { Storage } from "@google-cloud/storage";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { assertObjectPath } from "./paths";

/**
 * Customer logos are uploaded and checked in the private documents store, then copied to the
 * public logos bucket at the same object path (WI-018, contract "customer document storage
 * layout" §1). Only a logo that passed the finish check is ever published.
 */
export interface LogoPublisher {
  /** Copies a checked logo from the documents store to the logos bucket, same path. */
  publish(objectPath: string, contentType: string): Promise<void>;
  /** True when the logos bucket already holds the object. */
  isPublished(objectPath: string): Promise<boolean>;
}

/** Browsers and FedRAMP's tooling may cache a logo for an hour; a replaced logo gets a new path. */
export const LOGO_CACHE_CONTROL = "public, max-age=3600";

export interface GcsLogoPublisherOptions {
  documentsBucket: string;
  logosBucket: string;
  /** Injected in tests; otherwise created on first use from Application Default Credentials. */
  storage?: Storage;
}

/** Server-side copy between the two buckets: the bytes never pass through the app. */
export class GcsLogoPublisher implements LogoPublisher {
  private storageRef: Storage | undefined;

  constructor(private readonly options: GcsLogoPublisherOptions) {}

  async publish(objectPath: string, contentType: string): Promise<void> {
    assertObjectPath(objectPath);
    const storage = await this.storage();
    const target = storage.bucket(this.options.logosBucket).file(objectPath);
    await storage
      .bucket(this.options.documentsBucket)
      .file(objectPath)
      .copy(target, { contentType, cacheControl: LOGO_CACHE_CONTROL });
  }

  async isPublished(objectPath: string): Promise<boolean> {
    assertObjectPath(objectPath);
    const [exists] = await (await this.storage()).bucket(this.options.logosBucket).file(objectPath).exists();
    return exists;
  }

  private async storage(): Promise<Storage> {
    this.storageRef ??= this.options.storage ?? new (await import("@google-cloud/storage")).Storage();
    return this.storageRef;
  }
}

export interface LocalLogoPublisherOptions {
  /** Root of the local documents store (LOCAL_STORAGE_DIR). */
  documentsDir: string;
  /** Folder that plays the role of the logos bucket (LOCAL_LOGO_DIR). */
  logosDir: string;
}

/** Local stand-in: a second folder. Locally a logo still has no public address. */
export class LocalLogoPublisher implements LogoPublisher {
  private readonly documentsDir: string;
  private readonly logosDir: string;

  constructor(options: LocalLogoPublisherOptions) {
    this.documentsDir = path.resolve(options.documentsDir);
    this.logosDir = path.resolve(options.logosDir);
  }

  async publish(objectPath: string): Promise<void> {
    assertObjectPath(objectPath);
    const target = path.join(this.logosDir, objectPath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(this.documentsDir, objectPath), target);
  }

  async isPublished(objectPath: string): Promise<boolean> {
    assertObjectPath(objectPath);
    try {
      await stat(path.join(this.logosDir, objectPath));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}
