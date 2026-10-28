import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as v from "valibot";
import {
  ACCEPTED_EXTENSIONS,
  asksNextReport,
  documentContentType,
  documentFileRefusal,
  documentProblems,
  DISPLAY_NAME_MAX,
  DOCUMENT_MAX_BYTES,
  EMPTY_CERTIFICATION,
  extensionOf,
  isCertificationOld,
  ISO_DATE,
  isKnownKind,
  itemsFor,
  KIND_NOTE_MAX,
  kindLabel,
  OTHER_KIND,
  POLICIES_KIND,
  POLICY_VERSION_MAX,
  signatureMatches,
  todayIso,
  type CertificationAnswers,
  type CertificationKey,
  type CustomerDocument,
  type DocumentProblem,
  type DocumentsDefinition,
} from "~/lib/documents";
import { getEnv } from "~server/config";
import { getDb, type Database } from "~server/db";
import { FORM_DEFINITIONS_DIR } from "~server/fedramp";
import { customersRepo, documentsRepo, intakeAnswersRepo, type CustomerRow, type DocumentRow } from "~server/repositories";
import { getDocumentStore, intakeObjectPath, type DocumentStore } from "~server/storage";
import { markIntakeStarted, resolveIntakeToken } from "./customers";

/**
 * Screen E tab 3 (WI-006): the certification and the customer's documents. Files go straight to
 * the private bucket in a resumable session the app opens; a row is written only when an upload
 * finishes and passes the checks (§8.3). Tab 3 stays open after Submit: uploads, renames and
 * replacements still work, the customer's x does not. Removal is soft (§8.4). Nothing reads the
 * files beyond the first bytes for the signature.
 */

export interface IntakeDocumentsDeps {
  db: Database;
  store: DocumentStore;
  now: () => Date;
  definition: DocumentsDefinition;
  /** The app's origin, given to Cloud Storage so the browser may PUT to the session (CORS). */
  appOrigin: string;
}

let definition: DocumentsDefinition | undefined;

export function loadDocumentsDefinition(file = path.join(FORM_DEFINITIONS_DIR, "documents.v1.json")): DocumentsDefinition {
  return JSON.parse(readFileSync(file, "utf8")) as DocumentsDefinition;
}

export function getDocumentsDefinition(): DocumentsDefinition {
  definition ??= loadDocumentsDefinition();
  return definition;
}

const defaultDeps = (): IntakeDocumentsDeps => ({
  db: getDb(),
  store: getDocumentStore(),
  now: () => new Date(),
  definition: getDocumentsDefinition(),
  appOrigin: new URL(getEnv().APP_URL).origin,
});

/** Tab 3 answers live in intake_answers like tab 1's, as their own section. */
export const DOCUMENTS_SECTION = "documents";

export const DOCUMENT_GONE_MESSAGE = "This file was replaced or removed meanwhile. Reload the page.";
export const DOCUMENT_REMOVE_LOCKED_MESSAGE = "After Submit, files can no longer be removed. Ask your Ignyte consultant if one should go.";
export const DOCUMENT_NOT_ARRIVED_MESSAGE = "The upload did not arrive. Upload the file again.";

type Refusal = { kind: "expired"; message: string } | { kind: "locked"; message: string } | { kind: "refused"; message: string };

async function access(token: string, deps: Pick<IntakeDocumentsDeps, "db" | "now">): Promise<{ customer: CustomerRow; submitted: boolean } | Refusal> {
  const resolved = await resolveIntakeToken(token, deps);
  if (!resolved.ok) return { kind: "expired", message: resolved.message };
  return { customer: resolved.customer, submitted: resolved.customer.status === "submitted" };
}

const uploadedBy = (customer: CustomerRow) => `link:${customer.intakeTokenHash?.slice(0, 16) ?? "unknown"}`;

export function toCustomerDocument(row: DocumentRow): CustomerDocument {
  return {
    id: row.id,
    displayName: row.displayName ?? row.originalFilename,
    size: row.size,
    kind: row.kind,
    kindNote: row.kindNote,
    policyVersion: row.policyVersion,
    policyUpdatedOn: row.policyUpdatedOn,
  };
}

function certificationOf(answers: Record<string, unknown> | undefined): CertificationAnswers {
  const stored = answers?.certification as Partial<CertificationAnswers> | undefined;
  return { ...EMPTY_CERTIFICATION, ...stored };
}

export interface DocumentsTabView {
  definition: DocumentsDefinition;
  certification: CertificationAnswers;
  certificationVersion: number;
  /** Current files only: the customer never sees earlier versions or removed files. */
  documents: CustomerDocument[];
  submitted: boolean;
  today: string;
}

export async function loadDocumentsTab(customer: Pick<CustomerRow, "id" | "status">, deps: Pick<IntakeDocumentsDeps, "db" | "now" | "definition"> = defaultDeps()): Promise<DocumentsTabView> {
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, customer.id, DOCUMENTS_SECTION);
  const rows = await documentsRepo.listIntakeDocuments(deps.db, customer.id, { current: true });
  return {
    definition: deps.definition,
    certification: certificationOf(section?.answers),
    certificationVersion: section?.version ?? 0,
    documents: rows.map(toCustomerDocument),
    submitted: customer.status === "submitted",
    today: todayIso(deps.now()),
  };
}

/** Submit (2.11): the current files' problems, each naming its file. */
export async function documentsSubmitProblems(customerId: string, deps: Pick<IntakeDocumentsDeps, "db"> = defaultDeps()): Promise<DocumentProblem[]> {
  const rows = await documentsRepo.listIntakeDocuments(deps.db, customerId, { current: true });
  return documentProblems(rows.map(toCustomerDocument));
}

// ---------- Certification

const IsoDateOrNull = v.nullable(v.pipe(v.string(), v.regex(ISO_DATE)));
const CertificationInput = v.object({
  certification: v.object({
    type: v.nullable(v.picklist(["soc2_type2", "fedramp_ready", "fedramp_rev5", "govramp"] satisfies CertificationKey[])),
    period_end_date: IsoDateOrNull,
    next_report_expected: IsoDateOrNull,
  }),
  version: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type CertificationOutcome =
  | Refusal
  | { kind: "saved"; version: number; certification: CertificationAnswers; old: boolean }
  | { kind: "conflict"; version: number; certification: CertificationAnswers };

/** The certification and its dates (2.1–2.4): saved with the same version rule as tab 1, before and after Submit. The 12-month warning never blocks. */
export async function saveCertification(token: string, input: v.InferInput<typeof CertificationInput>, deps: IntakeDocumentsDeps = defaultDeps()): Promise<CertificationOutcome> {
  const parsed = v.parse(CertificationInput, input);
  const found = await access(token, deps);
  if ("kind" in found) return found;
  const certification: CertificationAnswers = {
    ...parsed.certification,
    next_report_expected: asksNextReport(deps.definition, parsed.certification.type) ? parsed.certification.next_report_expected : null,
  };
  const result = await intakeAnswersRepo.saveIntakeSection(deps.db, {
    customerId: found.customer.id,
    section: DOCUMENTS_SECTION,
    formDefinitionVersion: `documents.v${deps.definition.revision}`,
    answers: { certification },
    expectedVersion: parsed.version,
  });
  if ("stale" in result) return { kind: "refused", message: "This page is out of date. Reload it and try again." };
  if ("conflict" in result) return { kind: "conflict", version: result.conflict.version, certification: certificationOf(result.conflict.answers) };
  await markIntakeStarted(found.customer.id, deps);
  return { kind: "saved", version: result.saved.version, certification, old: isCertificationOld(certification.period_end_date, todayIso(deps.now())) };
}

// ---------- Upload: start (session) and finish (checks, then the row)

const Filename = v.pipe(v.string(), v.minLength(1), v.maxLength(DISPLAY_NAME_MAX));

const StartInput = v.object({
  filename: Filename,
  contentType: v.string(),
  size: v.pipe(v.number(), v.integer()),
  replaces: v.optional(v.pipe(v.string(), v.uuid())),
});

export type DocumentStartOutcome = Refusal | { kind: "upload"; documentId: string; upload: { url: string } };

async function currentDocument(customerId: string, id: string, deps: Pick<IntakeDocumentsDeps, "db">): Promise<DocumentRow | null> {
  const row = await documentsRepo.findIntakeDocument(deps.db, customerId, id);
  return row && !row.supersededAt && !row.removedAt ? row : null;
}

/** Refused before upload (2.9) with the matching message; otherwise a resumable session for a new document id (2.5). */
export async function startDocumentUpload(token: string, input: v.InferInput<typeof StartInput>, deps: IntakeDocumentsDeps = defaultDeps()): Promise<DocumentStartOutcome> {
  const parsed = v.parse(StartInput, input);
  const found = await access(token, deps);
  if ("kind" in found) return found;
  const refusal = documentFileRefusal(deps.definition, { name: parsed.filename, size: parsed.size });
  if (refusal) return { kind: "refused", message: refusal };
  const contentType = documentContentType(parsed.filename);
  if (!contentType || parsed.contentType !== contentType) return { kind: "refused", message: deps.definition.messages.type };
  if (parsed.replaces && !(await currentDocument(found.customer.id, parsed.replaces, deps))) return { kind: "refused", message: DOCUMENT_GONE_MESSAGE };

  const documentId = randomUUID();
  const objectPath = intakeObjectPath(found.customer.id, documentId, parsed.filename);
  const session = await deps.store.createResumableUpload({ objectPath, contentType, size: parsed.size, origin: deps.appOrigin });
  return { kind: "upload", documentId, upload: { url: session.url } };
}

const FinishInput = v.object({
  documentId: v.pipe(v.string(), v.uuid()),
  filename: Filename,
  size: v.pipe(v.number(), v.integer()),
  replaces: v.optional(v.pipe(v.string(), v.uuid())),
});

export type DocumentFinishOutcome = Refusal | { kind: "stored"; document: CustomerDocument };

/** Enough of the start of a file for every signature, and for the NUL check of text files. */
export const SIGNATURE_BYTES = 8 * 1024;

/**
 * Finish (2.5, 2.8): the object must exist with the announced size (≤ 250 MB), the content type
 * of its extension and that type's signature; otherwise it is deleted and no row is written. A
 * replacement copies "What is this?" and the policy fields and supersedes the version it replaces.
 * A repeated or concurrent finish answers the row already recorded, as the logo does (IGN-21).
 */
export async function finishDocumentUpload(token: string, input: v.InferInput<typeof FinishInput>, deps: IntakeDocumentsDeps = defaultDeps()): Promise<DocumentFinishOutcome> {
  const parsed = v.parse(FinishInput, input);
  const found = await access(token, deps);
  if ("kind" in found) return found;
  const { customer } = found;
  const accepted = ACCEPTED_EXTENSIONS[extensionOf(parsed.filename)];
  if (!accepted) return { kind: "refused", message: deps.definition.messages.type };
  const objectPath = intakeObjectPath(customer.id, parsed.documentId, parsed.filename);

  const recordedAs = async (): Promise<DocumentFinishOutcome | null> => {
    const recorded = await documentsRepo.findDocument(deps.db, parsed.documentId);
    if (!recorded) return null;
    if (recorded.customerId !== customer.id || recorded.objectPath !== objectPath || recorded.removedAt) {
      return { kind: "refused", message: "This upload was already used. Upload the file again." };
    }
    return { kind: "stored", document: toCustomerDocument(recorded) };
  };
  const already = await recordedAs();
  if (already) return already;

  const stat = await deps.store.stat(objectPath);
  if (!stat) return { kind: "refused", message: DOCUMENT_NOT_ARRIVED_MESSAGE };
  const start = stat.size > 0 ? await deps.store.readStart(objectPath, SIGNATURE_BYTES) : null;
  const passes =
    stat.size === parsed.size &&
    stat.size > 0 &&
    stat.size <= DOCUMENT_MAX_BYTES &&
    stat.contentType === accepted.contentType &&
    start !== null &&
    signatureMatches(accepted.signature, start);
  if (!passes) {
    await deps.store.delete(objectPath);
    return { kind: "refused", message: `This file is not a valid .${extensionOf(parsed.filename)} file, so it was not kept.` };
  }

  const previous = parsed.replaces ? await currentDocument(customer.id, parsed.replaces, deps) : null;
  if (parsed.replaces && !previous) {
    const raced = await recordedAs();
    if (raced) return raced;
    await deps.store.delete(objectPath);
    return { kind: "refused", message: DOCUMENT_GONE_MESSAGE };
  }
  const row = {
    id: parsed.documentId,
    customerId: customer.id,
    objectPath,
    originalFilename: parsed.filename,
    size: stat.size,
    contentType: stat.contentType,
    sha256: null,
    md5: stat.md5,
    crc32c: stat.crc32c,
    uploadedBy: uploadedBy(customer),
    displayName: parsed.filename,
    addedAfterSubmit: found.submitted,
    kind: previous?.kind ?? null,
    kindNote: previous?.kindNote ?? null,
    policyVersion: previous?.policyVersion ?? null,
    policyUpdatedOn: previous?.policyUpdatedOn ?? null,
  };
  let stored: DocumentRow | null;
  try {
    stored = previous
      ? await documentsRepo.insertReplacement(deps.db, { ...row, replacesDocumentId: previous.id }, deps.now())
      : await documentsRepo.insertDocument(deps.db, row);
  } catch (error) {
    // A second finish for the same upload (double click, retry) recorded it meanwhile: keep it.
    const raced = await recordedAs();
    if (raced) return raced;
    throw error;
  }
  if (!stored) {
    const raced = await recordedAs();
    if (raced) return raced;
    await deps.store.delete(objectPath);
    return { kind: "refused", message: DOCUMENT_GONE_MESSAGE };
  }
  await markIntakeStarted(customer.id, deps);
  return { kind: "stored", document: toCustomerDocument(stored) };
}

// ---------- Rename, "What is this?", remove

const OptionalText = (max: number) => v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))));
const UpdateInput = v.object({
  documentId: v.pipe(v.string(), v.uuid()),
  displayName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1, "The name cannot be empty."), v.maxLength(DISPLAY_NAME_MAX))),
  kind: v.optional(v.nullable(v.string())),
  kindNote: OptionalText(KIND_NOTE_MAX),
  policyVersion: OptionalText(POLICY_VERSION_MAX),
  policyUpdatedOn: v.optional(v.nullable(v.pipe(v.string(), v.regex(ISO_DATE)))),
});

export type DocumentUpdateOutcome = Refusal | { kind: "updated"; document: CustomerDocument };

/**
 * Rename (2.12) changes only the name shown; the object and its original name are untouched.
 * "What is this?" and the policy fields work the same way, before and after Submit. Fields that
 * only belong to another kind are cleared when the kind changes.
 */
export async function updateDocument(token: string, input: v.InferInput<typeof UpdateInput>, deps: IntakeDocumentsDeps = defaultDeps()): Promise<DocumentUpdateOutcome> {
  const parsed = v.parse(UpdateInput, input);
  const found = await access(token, deps);
  if ("kind" in found) return found;
  if (parsed.kind && !isKnownKind(deps.definition, parsed.kind)) return { kind: "refused", message: "Choose one of the listed items, or Other." };
  const fields: documentsRepo.DocumentFields = {};
  if (parsed.displayName !== undefined) fields.displayName = parsed.displayName;
  if (parsed.kind !== undefined) {
    fields.kind = parsed.kind || null;
    if (fields.kind !== OTHER_KIND) fields.kindNote = null;
    if (fields.kind !== POLICIES_KIND) Object.assign(fields, { policyVersion: null, policyUpdatedOn: null });
  }
  if (parsed.kindNote !== undefined) fields.kindNote = parsed.kindNote || null;
  if (parsed.policyVersion !== undefined) fields.policyVersion = parsed.policyVersion || null;
  if (parsed.policyUpdatedOn !== undefined) fields.policyUpdatedOn = parsed.policyUpdatedOn;
  const row = await documentsRepo.updateCurrentIntakeDocument(deps.db, found.customer.id, parsed.documentId, fields);
  if (!row) return { kind: "refused", message: DOCUMENT_GONE_MESSAGE };
  return { kind: "updated", document: toCustomerDocument(row) };
}

const RemoveInput = v.object({ documentId: v.pipe(v.string(), v.uuid()) });

/** The customer's x (2.14): until Submit only; soft, the object stays (2.17). */
export async function removeDocumentByCustomer(token: string, input: v.InferInput<typeof RemoveInput>, deps: IntakeDocumentsDeps = defaultDeps()): Promise<Refusal | { kind: "removed" }> {
  const parsed = v.parse(RemoveInput, input);
  const found = await access(token, deps);
  if ("kind" in found) return found;
  if (found.submitted) return { kind: "locked", message: DOCUMENT_REMOVE_LOCKED_MESSAGE };
  const row = await documentsRepo.removeIntakeDocument(deps.db, found.customer.id, parsed.documentId, uploadedBy(found.customer), deps.now(), { currentOnly: true });
  return row ? { kind: "removed" } : { kind: "refused", message: DOCUMENT_GONE_MESSAGE };
}

// ---------- Screen D (staff)

export class IntakeDocumentError extends Error {
  constructor(
    message: string,
    readonly status: 404 = 404,
  ) {
    super(message);
  }
}

export interface ScreenDVersion {
  id: string;
  originalFilename: string;
  size: number;
  uploadedAt: Date;
  /** When the next version replaced it. */
  replacedOn: Date;
}

export interface ScreenDFile {
  id: string;
  displayName: string;
  originalFilename: string;
  size: number;
  kindLabel: string | null;
  kindNote: string | null;
  policyVersion: string | null;
  policyUpdatedOn: string | null;
  addedAfterSubmit: boolean;
  uploadedAt: Date;
  /** Earlier versions, newest first: Ignyte can download each one. */
  versions: ScreenDVersion[];
}

export interface DocumentsScreen {
  certification: { label: string | null; periodEnd: string | null; nextReport: string | null; old: boolean; oldMessage: string };
  checklist: { kind: string; label: string; present: boolean }[];
  files: ScreenDFile[];
}

/** Screen D (2.13, 2.15, 2.16): the certification, the received/missing checklist and every current file with its earlier versions. */
export async function getDocumentsScreen(customerId: string, deps: Pick<IntakeDocumentsDeps, "db" | "now" | "definition"> = defaultDeps()): Promise<DocumentsScreen> {
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, customerId, DOCUMENTS_SECTION);
  const certification = certificationOf(section?.answers);
  const rows = await documentsRepo.listIntakeDocuments(deps.db, customerId, { current: false });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const current = rows.filter((row) => !row.supersededAt);
  const files = current.map((row): ScreenDFile => {
    const versions: ScreenDVersion[] = [];
    for (let earlier = row.replacesDocumentId ? byId.get(row.replacesDocumentId) : undefined; earlier; earlier = earlier.replacesDocumentId ? byId.get(earlier.replacesDocumentId) : undefined) {
      versions.push({ id: earlier.id, originalFilename: earlier.originalFilename, size: earlier.size, uploadedAt: earlier.uploadedAt, replacedOn: earlier.supersededAt ?? earlier.uploadedAt });
    }
    return {
      id: row.id,
      displayName: row.displayName ?? row.originalFilename,
      originalFilename: row.originalFilename,
      size: row.size,
      kindLabel: kindLabel(deps.definition, row.kind),
      kindNote: row.kindNote,
      policyVersion: row.policyVersion,
      policyUpdatedOn: row.policyUpdatedOn,
      addedAfterSubmit: row.addedAfterSubmit,
      uploadedAt: row.uploadedAt,
      versions,
    };
  });
  const kinds = new Set(current.map((row) => row.kind));
  return {
    certification: {
      label: deps.definition.certifications.find((c) => c.key === certification.type)?.label ?? null,
      periodEnd: certification.period_end_date,
      nextReport: certification.next_report_expected,
      old: isCertificationOld(certification.period_end_date, todayIso(deps.now())),
      oldMessage: deps.definition.messages.old,
    },
    checklist: itemsFor(deps.definition, certification.type).map((item) => ({ kind: item.kind, label: item.label, present: kinds.has(item.kind) })),
    files,
  };
}

/** Ignyte's Remove (2.17): any version, soft; the object stays in the bucket. */
export async function removeDocumentByStaff(customerId: string, documentId: string, userId: string, deps: Pick<IntakeDocumentsDeps, "db" | "now"> = defaultDeps()): Promise<void> {
  const row = await documentsRepo.removeIntakeDocument(deps.db, customerId, documentId, `user:${userId}`, deps.now(), { currentOnly: false });
  if (!row) throw new IntakeDocumentError("This file was already removed.");
}

/**
 * Ignyte's download of any version that is not removed: a short-lived signed GET of the stored
 * object, always as an attachment (an SVG can carry scripts, so it is never shown inline).
 */
export async function documentDownloadUrl(customerId: string, documentId: string, deps: Pick<IntakeDocumentsDeps, "db" | "store"> = defaultDeps()): Promise<string> {
  const customer = await customersRepo.findCustomer(deps.db, customerId);
  const row = customer ? await documentsRepo.findIntakeDocument(deps.db, customerId, documentId) : undefined;
  if (!row || row.removedAt) throw new IntakeDocumentError("File not found.");
  return (await deps.store.createDownloadUrl(row.objectPath, { filename: row.originalFilename, expiresInSeconds: 5 * 60 })).url;
}
