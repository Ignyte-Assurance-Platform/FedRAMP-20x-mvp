import { getEnv, type Env } from "~server/config";
import type { DocumentStore } from "./document-store";
import { GcsDocumentStore } from "./gcs/gcs-document-store";
import { LocalDocumentStore } from "./local/local-document-store";
import { GcsLogoPublisher, LocalLogoPublisher, type LogoPublisher } from "./logo-publisher";

export * from "./document-store";
export * from "./paths";
export * from "./logo-publisher";
export { GcsDocumentStore } from "./gcs/gcs-document-store";
export { LocalDocumentStore } from "./local/local-document-store";

/** STORAGE_DRIVER picks the implementation; nothing else in the app knows which one runs. */
export function createDocumentStore(env: Env): DocumentStore {
  if (env.STORAGE_DRIVER === "gcs") {
    if (!env.GCS_BUCKET) throw new Error("GCS_BUCKET is required when STORAGE_DRIVER=gcs");
    return new GcsDocumentStore({ bucket: env.GCS_BUCKET });
  }
  return new LocalDocumentStore({ rootDir: env.LOCAL_STORAGE_DIR, appUrl: env.APP_URL, secret: env.BETTER_AUTH_SECRET });
}

let instance: DocumentStore | undefined;

export function getDocumentStore(): DocumentStore {
  instance ??= createDocumentStore(getEnv());
  return instance;
}

/** Same driver as the document store: Cloud Storage copies between the two buckets, local copies between two folders. */
export function createLogoPublisher(env: Env): LogoPublisher {
  if (env.STORAGE_DRIVER === "gcs") {
    if (!env.GCS_BUCKET || !env.GCS_LOGO_BUCKET) throw new Error("GCS_BUCKET and GCS_LOGO_BUCKET are required when STORAGE_DRIVER=gcs");
    return new GcsLogoPublisher({ documentsBucket: env.GCS_BUCKET, logosBucket: env.GCS_LOGO_BUCKET });
  }
  return new LocalLogoPublisher({ documentsDir: env.LOCAL_STORAGE_DIR, logosDir: env.LOCAL_LOGO_DIR });
}

let publisher: LogoPublisher | undefined;

export function getLogoPublisher(): LogoPublisher {
  publisher ??= createLogoPublisher(getEnv());
  return publisher;
}
