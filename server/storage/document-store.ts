/**
 * Every read and write of customer files goes through this interface (ADR-0006 rule 5).
 * The browser uploads straight to the store with a short-lived URL; the app server only
 * records metadata (brain contract "customer document storage layout").
 */
export interface DocumentStore {
  readonly driver: "local" | "gcs";
  createUploadUrl(input: UploadUrlInput): Promise<SignedUrl>;
  /**
   * Opens a resumable upload session for one object (WI-006 §8): content type and exact size are
   * fixed when it opens, and the object is only created if it does not exist yet. The browser
   * sends the bytes in parts with Content-Range and, after a drop, asks for the stored range.
   */
  createResumableUpload(input: ResumableUploadInput): Promise<ResumableSession>;
  createDownloadUrl(objectPath: string, options?: DownloadUrlOptions): Promise<SignedUrl>;
  delete(objectPath: string): Promise<void>;
  /** null when the object does not exist. */
  stat(objectPath: string): Promise<ObjectStat | null>;
  /** The first `bytes` bytes of an object (file signature checks), or null when it does not exist. */
  readStart(objectPath: string, bytes: number): Promise<Buffer | null>;
}

export interface UploadUrlInput {
  objectPath: string;
  contentType: string;
  /** Upper bound the store enforces, in bytes. */
  maxBytes: number;
  expiresInSeconds?: number;
}

export interface ResumableUploadInput {
  objectPath: string;
  contentType: string;
  /** Exact size in bytes; the store refuses a final size that differs. */
  size: number;
  /** The app's origin, so the browser may talk to the session URL (CORS). */
  origin: string;
}

export interface ResumableSession {
  /** The session URL the browser PUTs parts to. It is the only credential for the upload. */
  url: string;
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
  /** Base64 MD5 and CRC32C (big-endian) as Cloud Storage reports them; null when the store has none. */
  md5: string | null;
  crc32c: string | null;
  updatedAt: Date;
}

export const DEFAULT_URL_TTL_SECONDS = 15 * 60;

export function urlExpiry(seconds = DEFAULT_URL_TTL_SECONDS): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function attachmentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}
