import type { Bucket, Storage } from "@google-cloud/storage";
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

export interface GcsDocumentStoreOptions {
  bucket: string;
  /** Injected in tests; otherwise created on first use from Application Default Credentials. */
  storage?: Storage;
}

/**
 * Cloud Storage implementation with V4 signed URLs. It holds no credentials: the client is
 * created lazily from Application Default Credentials, which exist only once the GCP project
 * and the Cloud Run service account do. Nothing here runs in local development.
 */
export class GcsDocumentStore implements DocumentStore {
  readonly driver = "gcs" as const;
  private bucketRef: Bucket | undefined;

  constructor(private readonly options: GcsDocumentStoreOptions) {}

  async createUploadUrl(input: UploadUrlInput): Promise<SignedUrl> {
    assertObjectPath(input.objectPath);
    const expiresAt = urlExpiry(input.expiresInSeconds);
    // Signed preconditions: size cap, and "only if the object does not exist yet", so a
    // replayed URL gets 412 instead of overwriting bytes whose SHA-256 is already recorded.
    const signed = {
      "x-goog-content-length-range": `0,${input.maxBytes}`,
      "x-goog-if-generation-match": "0",
    };
    const [url] = await (await this.bucket()).file(input.objectPath).getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: input.contentType,
      extensionHeaders: signed,
    });
    return { url, method: "PUT", headers: { "content-type": input.contentType, ...signed }, expiresAt };
  }

  async createDownloadUrl(objectPath: string, options: DownloadUrlOptions = {}): Promise<SignedUrl> {
    assertObjectPath(objectPath);
    const expiresAt = urlExpiry(options.expiresInSeconds);
    const [url] = await (await this.bucket()).file(objectPath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
      ...(options.filename ? { responseDisposition: attachmentDisposition(options.filename) } : {}),
    });
    return { url, method: "GET", headers: {}, expiresAt };
  }

  async delete(objectPath: string): Promise<void> {
    assertObjectPath(objectPath);
    await (await this.bucket()).file(objectPath).delete({ ignoreNotFound: true });
  }

  async stat(objectPath: string): Promise<ObjectStat | null> {
    assertObjectPath(objectPath);
    const file = (await this.bucket()).file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    const custom = meta.metadata?.sha256;
    return {
      size: Number(meta.size ?? 0),
      contentType: meta.contentType ?? "application/octet-stream",
      // Cloud Storage keeps MD5/CRC32C, not SHA-256; see docs/at-risk-notes-wi-010.md.
      sha256: typeof custom === "string" ? custom : null,
      updatedAt: new Date(meta.updated ?? Date.now()),
    };
  }

  private async bucket(): Promise<Bucket> {
    if (!this.bucketRef) {
      const storage = this.options.storage ?? new (await import("@google-cloud/storage")).Storage();
      this.bucketRef = storage.bucket(this.options.bucket);
    }
    return this.bucketRef;
  }
}
