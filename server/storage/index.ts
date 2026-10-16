import { getEnv, type Env } from "~server/config";
import type { DocumentStore } from "./document-store";
import { GcsDocumentStore } from "./gcs/gcs-document-store";
import { LocalDocumentStore } from "./local/local-document-store";

export * from "./document-store";
export * from "./paths";
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
