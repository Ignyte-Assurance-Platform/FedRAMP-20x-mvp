import { createHash, randomUUID } from "node:crypto";
import * as v from "valibot";
import type { FormDefinition } from "~/lib/form-definition";
import { createTab1Checker, getCompanyFormDefinition, type Problem, type Tab1Checker } from "~server/fedramp";
import { customersRepo, documentsRepo, intakeAnswersRepo, type CustomerRow } from "~server/repositories";
import { getEnv } from "~server/config";
import { getDb, type Database } from "~server/db";
import { getDocumentStore, getLogoPublisher, logoObjectPath, logoObjectPrefix, publicObjectUrl, type DocumentStore, type LogoPublisher } from "~server/storage";
import { CustomerError, markIntakeStarted, resolveIntakeToken, submitIntake } from "./customers";
import { documentsSubmitProblems, getDocumentsDefinition, loadDocumentsTab, type DocumentsTabView } from "./intake-documents";
import { loadKsisTab, saveKsisSection, type KsisDeps, type KsisTabView } from "./intake-ksis";
import { INTAKE_LINK_EXPIRED_MESSAGE } from "./intake-link";
import { TAB1_SECTION } from "./package-overview";

/**
 * Screen E tab 1 (WI-004): everything the customer does through the private link. The customer
 * is always taken from the token (E5), never from the URL or the body; an expired or replaced
 * token stores nothing, and after Submit tabs 1 and 2 are read-only until Ignyte unlocks.
 */

export interface IntakeDeps {
  db: Database;
  store: DocumentStore;
  /** Copies a checked logo to the public logos bucket (WI-018). */
  logos: LogoPublisher;
  /** LOGO_PUBLIC_BASE_URL; when set, previews use the public address instead of a signed URL. */
  logoBaseUrl: string | undefined;
  now: () => Date;
  definition: FormDefinition;
  checker: Tab1Checker;
  /** Tab 2 (WI-005): the vendored rules and ksis.v1.json; the process-wide ones when left out. */
  rules?: KsisDeps["rules"];
  ksisDefinition?: KsisDeps["definition"];
}

let checker: Tab1Checker | undefined;
const defaultDeps = (): IntakeDeps => ({
  db: getDb(),
  store: getDocumentStore(),
  logos: getLogoPublisher(),
  logoBaseUrl: getEnv().LOGO_PUBLIC_BASE_URL,
  now: () => new Date(),
  definition: getCompanyFormDefinition(),
  checker: (checker ??= createTab1Checker()),
});

export const INTAKE_LOCKED_MESSAGE = "This intake was submitted. Ask your Ignyte consultant to unlock it if something needs to change.";

/** Ignyte-owned parts of tab 1 are never taken from the browser (E4). */
const IGNYTE_OWNED = { serviceIdentification: ["logo"], root: ["assessor"] } as const;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function withoutIgnyteOwned(answers: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = structuredClone(answers);
  for (const key of IGNYTE_OWNED.root) delete copy[key];
  if (isRecord(copy.serviceIdentification)) {
    for (const key of IGNYTE_OWNED.serviceIdentification) delete copy.serviceIdentification[key];
  }
  return copy;
}

/** Tab 1 before the first save starts with what Ignyte typed on Screen C (2.27). */
export function prefillFromCustomer(customer: Pick<CustomerRow, "name" | "serviceName" | "serviceDescription">): Record<string, unknown> {
  const serviceIdentification: Record<string, string> = {};
  if (customer.name) serviceIdentification.providerName = customer.name;
  if (customer.serviceName) serviceIdentification.serviceName = customer.serviceName;
  if (customer.serviceDescription) serviceIdentification.serviceDescription = customer.serviceDescription;
  return Object.keys(serviceIdentification).length ? { serviceIdentification } : {};
}

/** 20x means Class A for the MVP (Class A only, no picker); Rev5 or empty means no class. */
export function fedrampClassFor(answers: Record<string, unknown>): "A" | null {
  const id = isRecord(answers.serviceIdentification) ? answers.serviceIdentification : {};
  return id.certificationType === "20x" ? "A" : null;
}

export type IntakeRefusal = { kind: "expired"; message: string } | { kind: "locked"; message: string };

export interface IntakeLogo {
  documentId: string;
  fileName: string;
  /** The public logo address, or a short-lived signed one when no logo host is configured (local). */
  previewUrl: string;
}

export interface IntakeView {
  kind: "open";
  customer: { name: string; serviceName: string | null };
  status: CustomerRow["status"];
  locked: boolean;
  definition: FormDefinition;
  answers: Record<string, unknown>;
  version: number;
  savedAt: Date | null;
  logo: IntakeLogo | null;
  /** Tab 2 (WI-005): read-only with tab 1 after Submit. Never holds Ignyte's consultant fields. */
  ksis: KsisTabView;
  /** Tab 3 (WI-006): open before and after Submit. */
  documents: DocumentsTabView;
}

async function logoView(row: { id: string; originalFilename: string; objectPath: string }, deps: Pick<IntakeDeps, "store" | "logoBaseUrl">): Promise<IntakeLogo> {
  const previewUrl = deps.logoBaseUrl
    ? publicObjectUrl(deps.logoBaseUrl, row.objectPath)
    : (await deps.store.createDownloadUrl(row.objectPath, { expiresInSeconds: 60 * 60 })).url;
  return { documentId: row.id, fileName: row.originalFilename, previewUrl };
}

async function currentLogo(customerId: string, deps: Pick<IntakeDeps, "db" | "store" | "logoBaseUrl">): Promise<IntakeLogo | null> {
  const row = await documentsRepo.findLatestDocumentUnder(deps.db, customerId, logoObjectPrefix(customerId));
  return row ? logoView(row, deps) : null;
}

export async function openIntake(token: string, deps: IntakeDeps = defaultDeps()): Promise<IntakeView | IntakeRefusal> {
  const access = await resolveIntakeToken(token, deps);
  if (!access.ok) return { kind: "expired", message: access.message };
  const { customer } = access;
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, customer.id, TAB1_SECTION);
  return {
    kind: "open",
    customer: { name: customer.name, serviceName: customer.serviceName },
    status: customer.status,
    locked: access.locked,
    definition: deps.definition,
    answers: section?.answers ?? prefillFromCustomer(customer),
    version: section?.version ?? 0,
    savedAt: section?.updatedAt ?? null,
    logo: await currentLogo(customer.id, deps),
    ksis: await loadKsisTab(customer.id, ksisDeps(deps)),
    documents: await loadDocumentsTab(customer, { db: deps.db, now: deps.now, definition: getDocumentsDefinition() }),
  };
}

const ksisDeps = (deps: IntakeDeps) => ({
  db: deps.db,
  now: deps.now,
  ...(deps.rules ? { rules: deps.rules } : {}),
  ...(deps.ksisDefinition ? { definition: deps.ksisDefinition } : {}),
});

/** The sections a customer saves through the link: tab 1 (company) and tab 2 (ksis), never tab 3's (E3). */
export const SAVE_SECTIONS = ["company", "ksis"] as const;

const SaveInput = v.object({
  section: v.optional(v.picklist(SAVE_SECTIONS)),
  answers: v.record(v.string(), v.unknown()),
  version: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type SaveIntakeInput = v.InferInput<typeof SaveInput>;

export const INTAKE_STALE_MESSAGE = "This page is out of date. Reload it and try again.";

export type SaveOutcome =
  | IntakeRefusal
  | { kind: "refused"; message: string }
  | { kind: "saved"; version: number; savedAt: Date }
  | { kind: "conflict"; answers: Record<string, unknown>; version: number; savedAt: Date };

/** Tab 2 save (WI-005 E3, E4): the same lock as tab 1 through writable(), then the ksis section. */
async function saveKsis(token: string, input: { answers: unknown; version: number }, deps: IntakeDeps): Promise<SaveOutcome> {
  const access = await writable(token, deps);
  if ("kind" in access) return access;
  const outcome = await saveKsisSection(access.customer, input, ksisDeps(deps));
  return outcome.kind === "conflict" ? { ...outcome, answers: outcome.answers as unknown as Record<string, unknown> } : outcome;
}

async function writable(token: string, deps: Pick<IntakeDeps, "db" | "now">): Promise<{ customer: CustomerRow } | IntakeRefusal> {
  const access = await resolveIntakeToken(token, deps);
  if (!access.ok) return { kind: "expired", message: access.message };
  if (access.locked) return { kind: "locked", message: INTAKE_LOCKED_MESSAGE };
  return { customer: access.customer };
}

/** Save and autosave (E2): written only if the page's version is still current; status to In progress on the first save. Tab 2 when `section` is "ksis". */
export async function saveIntake(token: string, input: SaveIntakeInput, deps: IntakeDeps = defaultDeps()): Promise<SaveOutcome> {
  const { section, answers, version } = v.parse(SaveInput, input);
  if (section === "ksis") return saveKsis(token, { answers, version }, deps);
  const access = await writable(token, deps);
  if ("kind" in access) return access;
  const clean = withoutIgnyteOwned(answers);
  const result = await intakeAnswersRepo.saveIntakeSection(deps.db, {
    customerId: access.customer.id,
    section: TAB1_SECTION,
    formDefinitionVersion: deps.definition.version,
    answers: clean,
    expectedVersion: version,
  });
  if ("stale" in result) return { kind: "refused", message: INTAKE_STALE_MESSAGE };
  if ("conflict" in result) {
    return { kind: "conflict", answers: result.conflict.answers, version: result.conflict.version, savedAt: result.conflict.updatedAt };
  }
  await markIntakeStarted(access.customer.id, deps);
  const fedrampClass = fedrampClassFor(clean);
  if (fedrampClass !== access.customer.fedrampClass) await customersRepo.updateCustomer(deps.db, access.customer.id, { fedrampClass });
  return { kind: "saved", version: result.saved.version, savedAt: result.saved.updatedAt };
}

export type SubmitOutcome = SaveOutcome | { kind: "problems"; problems: Problem[]; version: number; savedAt: Date } | { kind: "submitted" };

/**
 * Submit: saves what is on the page (same version rule), then checks tab 1 against the schema
 * and the logo rule, and tab 3's files (WI-006 2.11). With problems nothing is locked; without, tabs 1 and 2 lock (Submitted).
 */
export async function submitTab1(token: string, input: SaveIntakeInput, deps: IntakeDeps = defaultDeps()): Promise<SubmitOutcome> {
  const saved = await saveIntake(token, { ...input, section: "company" }, deps);
  if (saved.kind !== "saved") return saved;
  const access = await resolveIntakeToken(token, deps);
  if (!access.ok) return { kind: "expired", message: access.message };
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, access.customer.id, TAB1_SECTION);
  const logo = await documentsRepo.findLatestDocumentUnder(deps.db, access.customer.id, logoObjectPrefix(access.customer.id));
  const problems = [
    ...deps.checker.check(section?.answers ?? {}, { hasLogo: Boolean(logo), labels: deps.definition.labels }),
    // Tab 3 (WI-006 2.11): a file without "What is this?", an Other without its note, a policy without version or date.
    ...(await documentsSubmitProblems(access.customer.id, deps)).map((p) => ({ ...p, question: "Documents", raw: "" })),
  ];
  if (problems.length) return { kind: "problems", problems, version: saved.version, savedAt: saved.savedAt };
  try {
    await submitIntake(access.customer.id, deps);
  } catch (error) {
    // Another window submitted between the save and here: the intake is locked either way.
    if (error instanceof CustomerError && error.status === 409) return { kind: "locked", message: INTAKE_LOCKED_MESSAGE };
    throw error;
  }
  return { kind: "submitted" };
}

// ---------- Logo (WI-004 §5: PNG or JPEG, ≤ 2 MB, ≥ 256 px wide; signature checked after upload)

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIN_WIDTH = 256;
export const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg" } as const;
export const LOGO_INSTRUCTIONS = "Upload a PNG or JPEG logo, at least 256 px wide and up to 2 MB.";

/** PNG: 89 50 4E 47 0D 0A 1A 0A. JPEG: FF D8 FF. Anything else is not a logo we host. */
export function sniffLogo(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** The checks the browser runs before uploading (2.11), repeated here so a crafted request gets the same answer. */
export function logoRefusal(input: { contentType: string; size: number; width?: number }): string | null {
  if (!(input.contentType in LOGO_TYPES)) return `This file type is not accepted. ${LOGO_INSTRUCTIONS}`;
  if (input.size > LOGO_MAX_BYTES) return `This file is larger than 2 MB. ${LOGO_INSTRUCTIONS}`;
  if (input.size <= 0) return `This file is empty. ${LOGO_INSTRUCTIONS}`;
  if (input.width !== undefined && input.width < LOGO_MIN_WIDTH) return `This image is narrower than 256 px. ${LOGO_INSTRUCTIONS}`;
  return null;
}

const StartLogoInput = v.object({
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  contentType: v.string(),
  size: v.pipe(v.number(), v.integer()),
  width: v.optional(v.pipe(v.number(), v.integer())),
});

export type LogoStartOutcome =
  | IntakeRefusal
  | { kind: "refused"; message: string }
  | { kind: "upload"; logoId: string; upload: { url: string; method: "PUT" | "GET"; headers: Record<string, string> } };

export async function startLogoUpload(token: string, input: v.InferInput<typeof StartLogoInput>, deps: IntakeDeps = defaultDeps()): Promise<LogoStartOutcome> {
  const parsed = v.parse(StartLogoInput, input);
  const access = await writable(token, deps);
  if ("kind" in access) return access;
  const refusal = logoRefusal(parsed);
  if (refusal) return { kind: "refused", message: refusal };
  const logoId = randomUUID();
  const objectPath = logoObjectPath(access.customer.id, logoId, LOGO_TYPES[parsed.contentType as keyof typeof LOGO_TYPES]);
  const upload = await deps.store.createUploadUrl({ objectPath, contentType: parsed.contentType, maxBytes: LOGO_MAX_BYTES });
  return { kind: "upload", logoId, upload: { url: upload.url, method: upload.method, headers: upload.headers } };
}

const FinishLogoInput = v.object({
  logoId: v.pipe(v.string(), v.uuid()),
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  contentType: v.string(),
});

export type LogoFinishOutcome = IntakeRefusal | { kind: "refused"; message: string } | { kind: "stored"; logo: IntakeLogo };

/**
 * Finish check (2.12): the object must exist, be at most 2 MB, carry a PNG or JPEG content type
 * and start with that type's signature; otherwise it is deleted and nothing is recorded. A logo
 * that passes is copied to the public logos bucket before its row is written (WI-018). Replace
 * adds a row; the newest row is the current logo. A repeated finish (double click, network retry)
 * answers the logo already recorded instead of inserting it twice.
 */
export async function finishLogoUpload(token: string, input: v.InferInput<typeof FinishLogoInput>, deps: IntakeDeps = defaultDeps()): Promise<LogoFinishOutcome> {
  const parsed = v.parse(FinishLogoInput, input);
  const access = await writable(token, deps);
  if ("kind" in access) return access;
  const extension = LOGO_TYPES[parsed.contentType as keyof typeof LOGO_TYPES];
  if (!extension) return { kind: "refused", message: `This file type is not accepted. ${LOGO_INSTRUCTIONS}` };
  const objectPath = logoObjectPath(access.customer.id, parsed.logoId, extension);
  const recorded = await documentsRepo.findDocument(deps.db, parsed.logoId);
  if (recorded) {
    if (recorded.customerId !== access.customer.id || recorded.objectPath !== objectPath) {
      return { kind: "refused", message: `This upload was already used. ${LOGO_INSTRUCTIONS}` };
    }
    return { kind: "stored", logo: await logoView(recorded, deps) };
  }
  const stat = await deps.store.stat(objectPath);
  if (!stat) return { kind: "refused", message: `The upload did not arrive. ${LOGO_INSTRUCTIONS}` };
  // A logo is at most 2 MB, so the whole object is read once: its signature and its SHA-256
  // (Cloud Storage reports none) come from the same bytes.
  const bytes = stat.size <= LOGO_MAX_BYTES ? await deps.store.readStart(objectPath, LOGO_MAX_BYTES + 1) : null;
  const sniffed = bytes ? sniffLogo(bytes) : null;
  if (!bytes || bytes.length > LOGO_MAX_BYTES || !(stat.contentType in LOGO_TYPES) || sniffed === null || sniffed !== stat.contentType) {
    await deps.store.delete(objectPath);
    return { kind: "refused", message: `This file is not a PNG or JPEG image. ${LOGO_INSTRUCTIONS}` };
  }
  // Only a checked logo becomes public (WI-018). If the copy or the row fails, the public copy and
  // the upload are removed and the customer uploads again, so no row ever points at a logo the
  // logos bucket does not hold, and no public logo is left without a row.
  let row;
  try {
    await deps.logos.publish(objectPath, stat.contentType);
    row = await documentsRepo.insertDocument(deps.db, {
      id: parsed.logoId,
      customerId: access.customer.id,
      objectPath,
      originalFilename: parsed.filename,
      size: bytes.length,
      contentType: stat.contentType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedBy: `link:${access.customer.intakeTokenHash?.slice(0, 16) ?? "unknown"}`,
    });
  } catch (error) {
    // A second finish for the same logo (double click) may have recorded it meanwhile: keep it.
    const raced = await documentsRepo.findDocument(deps.db, parsed.logoId);
    if (raced?.customerId === access.customer.id && raced.objectPath === objectPath) return { kind: "stored", logo: await logoView(raced, deps) };
    console.error(`logo publish failed for ${objectPath}:`, error);
    await deps.logos.unpublish(objectPath).catch(() => undefined);
    await deps.store.delete(objectPath);
    return { kind: "refused", message: `The upload did not arrive. ${LOGO_INSTRUCTIONS}` };
  }
  await markIntakeStarted(access.customer.id, deps);
  return { kind: "stored", logo: await logoView(row, deps) };
}

export { INTAKE_LINK_EXPIRED_MESSAGE };
