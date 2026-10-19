import { randomUUID } from "node:crypto";
import * as v from "valibot";
import { getDb, type Database } from "~server/db";
import { customersRepo, documentsRepo, type DocumentRow } from "~server/repositories";
import {
  ALLOWED_CONTENT_TYPES,
  getDocumentStore,
  intakeObjectPath,
  LocalDocumentStore,
  MAX_UPLOAD_BYTES,
  type DocumentStore,
  type SignedUrl,
} from "~server/storage";

/**
 * Serves the local driver's signed URLs (dev-only route api/uploads/:token).
 * With the Cloud Storage driver the browser talks to the bucket, so this answers 404.
 */
export async function handleLocalStorageRequest(token: string, request: Request): Promise<Response> {
  const store = getDocumentStore();
  if (!(store instanceof LocalDocumentStore)) return new Response("not found", { status: 404 });
  if (request.method === "PUT") return store.receive(token, request.headers.get("content-type"), request.body);
  if (request.method === "GET") return store.send(token);
  return new Response("method not allowed", { status: 405, headers: { allow: "GET, PUT" } });
}

/**
 * The upload plumbing WI-010 needs to prove the storage contract end to end:
 * 1. startIntakeUpload: picks the document id and object path, returns a signed upload URL.
 * 2. the browser PUTs the bytes straight to the store.
 * 3. completeIntakeUpload: checks the object exists and records the documents row.
 * The intake documents screen itself is WI-006.
 */

export interface DocumentDeps {
  db: Database;
  store: DocumentStore;
}

const defaultDeps = (): DocumentDeps => ({ db: getDb(), store: getDocumentStore() });

export const StartUploadInput = v.object({
  customerId: v.pipe(v.string(), v.uuid()),
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  contentType: v.pipe(
    v.string(),
    v.check((ct) => ALLOWED_CONTENT_TYPES.has(ct), "Only PDF, Word and Excel files are accepted."),
  ),
  size: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_UPLOAD_BYTES, "Files are limited to 100 MB.")),
});

export interface StartedUpload {
  documentId: string;
  objectPath: string;
  upload: SignedUrl;
}

export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export async function startIntakeUpload(
  input: v.InferInput<typeof StartUploadInput>,
  deps: DocumentDeps = defaultDeps(),
): Promise<StartedUpload> {
  const parsed = v.parse(StartUploadInput, input);
  const customer = await customersRepo.findCustomer(deps.db, parsed.customerId);
  if (!customer) throw new DocumentError("customer not found", 404);

  const documentId = randomUUID();
  const objectPath = intakeObjectPath(parsed.customerId, documentId, parsed.filename);
  const upload = await deps.store.createUploadUrl({
    objectPath,
    contentType: parsed.contentType,
    maxBytes: MAX_UPLOAD_BYTES,
  });
  return { documentId, objectPath, upload };
}

export const CompleteUploadInput = v.object({
  customerId: v.pipe(v.string(), v.uuid()),
  documentId: v.pipe(v.string(), v.uuid()),
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  uploadedBy: v.pipe(v.string(), v.regex(/^(user|link):.+$/)),
});

export async function completeIntakeUpload(
  input: v.InferInput<typeof CompleteUploadInput>,
  deps: DocumentDeps = defaultDeps(),
): Promise<DocumentRow> {
  const parsed = v.parse(CompleteUploadInput, input);
  const objectPath = intakeObjectPath(parsed.customerId, parsed.documentId, parsed.filename);
  if (await documentsRepo.findDocument(deps.db, parsed.documentId)) {
    throw new DocumentError("document already recorded", 409);
  }
  const stat = await deps.store.stat(objectPath);
  if (!stat) throw new DocumentError("no uploaded file at the expected path", 404);
  if (!stat.sha256) throw new DocumentError("the store did not report a SHA-256 for the file", 400);

  return documentsRepo.insertDocument(deps.db, {
    id: parsed.documentId,
    customerId: parsed.customerId,
    objectPath,
    originalFilename: parsed.filename,
    size: stat.size,
    contentType: stat.contentType,
    sha256: stat.sha256,
    uploadedBy: parsed.uploadedBy,
  });
}
