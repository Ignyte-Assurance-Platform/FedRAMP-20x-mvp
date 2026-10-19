/**
 * Every read and write of customer files goes through this interface (ADR-0006 rule 5).
 * The browser uploads straight to the store with a short-lived URL; the app server only
 * records metadata (brain contract "customer document storage layout").
 */
export interface DocumentStore {
  readonly driver: "local" | "gcs";
  createUploadUrl(input: UploadUrlInput): Promise<SignedUrl>;
  createDownloadUrl(objectPath: string, options?: DownloadUrlOptions): Promise<SignedUrl>;
  delete(objectPath: string): Promise<void>;
  /** null when the object does not exist. */
  stat(objectPath: string): Promise<ObjectStat | null>;
}

export interface UploadUrlInput {
  objectPath: string;
  contentType: string;
  /** Upper bound the store enforces, in bytes. */
  maxBytes: number;
  expiresInSeconds?: number;
}

export interface DownloadUrlOptions {
  filename?: string;
  expiresInSeconds?: number;
}

export interface SignedUrl {
  url: string;
  method: "PUT" | "GET";
  /** Headers the client must send with the request. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStat {
  size: number;
  contentType: string;
  /** Hex SHA-256 of the content, when the store knows it. */
  sha256: string | null;
  updatedAt: Date;
}

export const DEFAULT_URL_TTL_SECONDS = 15 * 60;

export function urlExpiry(seconds = DEFAULT_URL_TTL_SECONDS): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function attachmentDisposition(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
