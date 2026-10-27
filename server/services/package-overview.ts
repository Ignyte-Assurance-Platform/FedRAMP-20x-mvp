import * as v from "valibot";
import { getEnv } from "~server/config";
import { getDb, type Database } from "~server/db";
import {
  answerSections,
  getCompanyFormDefinition,
  createPackageOverviewGenerator,
  fallbackPackageId,
  LOGO_HOST_NOT_CONFIGURED,
  SchemaNavigator,
  todayInNewYork,
  type AnswerSection,
  type FormLabels,
  type LogoCheck,
  type PackageOverviewGenerator,
  type Problem,
} from "~server/fedramp";
import {
  customersRepo,
  documentsRepo,
  intakeAnswersRepo,
  packageOverviewRepo,
  usersRepo,
  type PackageOverviewFileRow,
} from "~server/repositories";
import { logoObjectPrefix, publicObjectUrl } from "~server/storage";

/**
 * Screen D use-cases (WI-007): Ignyte-only inputs, Generate JSON, status flags and
 * download. Tab 1 answers and the hosted logo URL are passed in by the caller until
 * WI-004 defines where they are stored.
 */

export type FetchLike = (url: string, init: { method: string; redirect: "manual"; signal: AbortSignal }) => Promise<Response>;

export interface PackageOverviewDeps {
  db: Database;
  generator: PackageOverviewGenerator;
  /** Base URL of the logos Ignyte hosts; the only host ever requested. */
  logoBaseUrl: string | undefined;
  fetch: FetchLike;
  now: () => Date;
}

let generator: PackageOverviewGenerator | undefined;
/** Compiled once per process (ADR-0005); start-up fails if the vendored schemas do not match the manifest. */
export function getPackageOverviewGenerator(): PackageOverviewGenerator {
  generator ??= createPackageOverviewGenerator();
  return generator;
}

let navigator: SchemaNavigator | undefined;
function getSchemaNavigator(): SchemaNavigator {
  navigator ??= new SchemaNavigator(getPackageOverviewGenerator().schemas);
  return navigator;
}

const defaultDeps = (): PackageOverviewDeps => ({
  db: getDb(),
  generator: getPackageOverviewGenerator(),
  logoBaseUrl: getEnv().LOGO_PUBLIC_BASE_URL,
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
});

export class PackageOverviewError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

const LOGO_TIMEOUT_MS = 5_000;

/**
 * WI-007 §5 step 2: the hosted logo must answer 200 with an image content type. Only URLs
 * under the configured base are requested, so no customer-controlled host is ever
 * contacted (customer-hosted logos are WI-014).
 */
export async function checkHostedLogo(url: string | null | undefined, deps: Pick<PackageOverviewDeps, "logoBaseUrl" | "fetch">): Promise<LogoCheck> {
  if (!url) return { ok: true }; // a missing logo is the schema's "Logo is required"
  if (!deps.logoBaseUrl) return { ok: false, reason: "the logo host is not configured" };
  const base = new URL(deps.logoBaseUrl);
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, reason: "not a valid address" };
  }
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    return { ok: false, reason: "not hosted by Ignyte" };
  }
  try {
    const response = await deps.fetch(target.href, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    const type = response.headers.get("content-type") ?? "";
    await response.body?.cancel();
    if (response.status !== 200) return { ok: false, reason: `answered ${response.status}` };
    if (!type.toLowerCase().startsWith("image/")) return { ok: false, reason: `answered ${type || "no content type"}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: "did not answer within 5 seconds" };
  }
}

/**
 * The logo check for one generation. A logo that was uploaded but has no public address
 * (LOGO_PUBLIC_BASE_URL empty) is never requested: the file cannot carry it, and the
 * problem must name the missing host, not say "Logo is required".
 */
export async function logoCheckFor(
  request: Pick<GenerateRequest, "logoUrl" | "logoUploaded">,
  deps: Pick<PackageOverviewDeps, "logoBaseUrl" | "fetch">,
): Promise<LogoCheck> {
  if (request.logoUploaded && !request.logoUrl) return { ok: false, reason: LOGO_HOST_NOT_CONFIGURED };
  return checkHostedLogo(request.logoUrl, deps);
}

export const AssessorInput = v.object({
  customerId: v.pipe(v.string(), v.uuid()),
  assessorName: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  assessorId: v.pipe(v.string(), v.trim(), v.maxLength(20)),
  advisorName: v.pipe(v.string(), v.trim(), v.maxLength(200)),
});

/** Saves the Ignyte-only boxes; a changed assessor name or ID clears the confirmation tick. */
export async function savePackageOverviewInputs(
  input: v.InferInput<typeof AssessorInput>,
  deps: Pick<PackageOverviewDeps, "db"> = defaultDeps(),
): Promise<void> {
  const parsed = v.parse(AssessorInput, input);
  const current = await packageOverviewRepo.findPackageOverviewInputs(deps.db, parsed.customerId);
  if (!current) throw new PackageOverviewError("customer not found", 404);
  const changed = (current.assessorName ?? "") !== parsed.assessorName || (current.assessorId ?? "") !== parsed.assessorId;
  await packageOverviewRepo.updatePackageOverviewInputs(deps.db, parsed.customerId, {
    assessorName: parsed.assessorName || null,
    assessorId: parsed.assessorId || null,
    advisorName: parsed.advisorName,
    ...(changed ? { assessorConfirmedAt: null, assessorConfirmedBy: null } : {}),
  });
}

/** The "Assessor Confirmed on FedRAMP Marketplace" box. */
export async function setAssessorConfirmed(
  customerId: string,
  confirmed: boolean,
  userId: string,
  deps: Pick<PackageOverviewDeps, "db" | "now"> = defaultDeps(),
): Promise<void> {
  await packageOverviewRepo.updatePackageOverviewInputs(deps.db, customerId, {
    assessorConfirmedAt: confirmed ? deps.now() : null,
    assessorConfirmedBy: confirmed ? userId : null,
  });
}

export interface GenerateRequest {
  customerId: string;
  userId: string;
  /** Tab 1 answers (WI-004) and when they were last saved. */
  answers: Record<string, unknown>;
  answersUpdatedAt: Date | null;
  logoUrl: string | null;
  /** Whether a logo was uploaded at all; with no public address it is reported as a logo-host problem. */
  logoUploaded?: boolean;
  labels?: FormLabels;
}

export interface GenerateOutcome {
  file: PackageOverviewFileRow;
  problems: Problem[];
}

/**
 * Generate JSON: builds, validates and stores a new file. If anything fails before the
 * insert, nothing is saved and the previous file stays the latest.
 */
export async function generatePackageOverview(request: GenerateRequest, deps: PackageOverviewDeps = defaultDeps()): Promise<GenerateOutcome> {
  const customer = await customersRepo.findCustomer(deps.db, request.customerId);
  if (!customer) throw new PackageOverviewError("customer not found", 404);
  const inputs = await packageOverviewRepo.findPackageOverviewInputs(deps.db, request.customerId);

  const result = deps.generator.generate({
    answers: request.answers,
    logoUrl: request.logoUrl,
    assessorName: inputs?.assessorName,
    assessorId: inputs?.assessorId,
    assessorConfirmedAt: inputs?.assessorConfirmedAt,
    advisorName: inputs?.advisorName,
    logoCheck: await logoCheckFor(request, deps),
    today: todayInNewYork(deps.now()),
    ...(request.labels ? { labels: request.labels } : {}),
  });

  const file = await packageOverviewRepo.insertPackageOverviewFile(deps.db, {
    customerId: request.customerId,
    generatedBy: request.userId,
    schemaVersion: result.schemaVersion,
    schemaCommit: result.schemaCommit,
    rulesVersion: null, // WI-012 vendors the rules
    valid: result.valid,
    errors: result.problems,
    answersUpdatedAt: request.answersUpdatedAt,
    fileName: result.fileName,
    json: result.json,
  });
  return { file, problems: result.problems };
}

export interface PackageOverviewStatus {
  latest: PackageOverviewFileRow | undefined;
  /** "Built on Package Overview <old>; FedRAMP's current is <new>. Regenerate." */
  regenerate: { builtOn: string; current: string } | undefined;
  answersChanged: boolean;
  downloadLabel: "Download" | "Download draft" | undefined;
}

/** Numeric dotted-version comparison ("0.10.0" > "0.9.1"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** Screen D flags for the latest file (WI-007 §3: outdated schema, answers changed, button). */
export function packageOverviewStatus(
  latest: PackageOverviewFileRow | undefined,
  currentSchemaVersion: string,
  answersUpdatedAt: Date | null,
): PackageOverviewStatus {
  if (!latest) return { latest, regenerate: undefined, answersChanged: false, downloadLabel: undefined };
  const outdated = compareVersions(latest.schemaVersion, currentSchemaVersion) < 0;
  const answersChanged =
    answersUpdatedAt !== null && (latest.answersUpdatedAt === null || answersUpdatedAt.getTime() > latest.answersUpdatedAt.getTime());
  return {
    latest,
    regenerate: outdated ? { builtOn: latest.schemaVersion, current: currentSchemaVersion } : undefined,
    answersChanged,
    downloadLabel: latest.valid ? "Download" : "Download draft",
  };
}

export async function getPackageOverviewStatus(
  customerId: string,
  answersUpdatedAt: Date | null,
  deps: Pick<PackageOverviewDeps, "db" | "generator"> = defaultDeps(),
): Promise<PackageOverviewStatus> {
  const latest = await packageOverviewRepo.findLatestPackageOverviewFile(deps.db, customerId);
  return packageOverviewStatus(latest, deps.generator.schemaVersion, answersUpdatedAt);
}

/** Download always serves the stored bytes of the latest generation, never a rebuild. */
export async function downloadPackageOverview(
  customerId: string,
  deps: Pick<PackageOverviewDeps, "db"> = defaultDeps(),
): Promise<{ fileName: string; body: string }> {
  const latest = await packageOverviewRepo.findLatestPackageOverviewFile(deps.db, customerId);
  if (!latest) throw new PackageOverviewError("no file generated yet", 404);
  return { fileName: latest.fileName, body: latest.json };
}

/**
 * Tab 1 of the customer form (WI-004) stores a partial Package Overview object as the
 * "company" section (form-definitions/company.v1.json). The hosted logo is the newest
 * document under customers/<id>/logo/ (contract §1); its public URL needs the logo host.
 */
export const TAB1_SECTION = "company";

export interface Tab1Answers {
  answers: Record<string, unknown>;
  updatedAt: Date | null;
  logoUrl: string | null;
  logoUploaded: boolean;
}

export async function loadTab1Answers(
  customerId: string,
  deps: Pick<PackageOverviewDeps, "db" | "logoBaseUrl"> = defaultDeps(),
): Promise<Tab1Answers> {
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, customerId, TAB1_SECTION);
  const logo = await documentsRepo.findLatestDocumentUnder(deps.db, customerId, logoObjectPrefix(customerId));
  return {
    answers: section?.answers ?? {},
    updatedAt: section?.updatedAt ?? null,
    logoUrl: logo && deps.logoBaseUrl ? publicObjectUrl(deps.logoBaseUrl, logo.objectPath) : null,
    logoUploaded: Boolean(logo),
  };
}

/** "Generate JSON" from Screen D: the stored tab 1 answers and hosted logo of the customer. */
export async function generatePackageOverviewForCustomer(
  customerId: string,
  userId: string,
  deps: PackageOverviewDeps = defaultDeps(),
): Promise<GenerateOutcome> {
  const tab1 = await loadTab1Answers(customerId, deps);
  return generatePackageOverview(
    {
      customerId,
      userId,
      answers: tab1.answers,
      answersUpdatedAt: tab1.updatedAt,
      logoUrl: tab1.logoUrl,
      logoUploaded: tab1.logoUploaded,
      // Problems name each question with the label the customer sees on tab 1 (WI-004, WI-007 E2).
      labels: getCompanyFormDefinition().labels,
    },
    deps,
  );
}

export interface PackageOverviewScreen {
  customer: { id: string; name: string };
  inputs: {
    assessorName: string;
    assessorId: string;
    advisorName: string;
    assessorConfirmedAt: Date | null;
    /** Display name of who ticked the box; null until it is ticked. */
    assessorConfirmedBy: string | null;
  };
  /** Tab 1 answers, read-only, in schema order. */
  answers: AnswerSection[];
  /** The package ID the file uses when the customer left it empty ("<provider name> <acronym>"); null otherwise. */
  packageIdFallback: string | null;
  logoUrl: string | null;
  logoUploaded: boolean;
  /** The vendored Package Overview version the next generation will use. */
  schemaVersion: string;
  status: Omit<PackageOverviewStatus, "latest">;
  latest: {
    id: string;
    fileName: string;
    valid: boolean;
    generatedAt: Date;
    schemaVersion: string;
    schemaCommit: string;
    rulesVersion: string | null;
    problems: Problem[];
  } | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * WI-007 §3 package ID fallback, for Screen D: the value the file will carry when the customer
 * left "FedRAMP package ID" empty, and the answers with an empty package ID row so the
 * read-only list can show it in schema order.
 */
export function packageIdForScreen(answers: Record<string, unknown>): { answers: Record<string, unknown>; fallback: string | null } {
  const identification = isRecord(answers.serviceIdentification) ? answers.serviceIdentification : undefined;
  const typed = identification?.fedRampPackageId;
  if (!identification || (typeof typed === "string" && typed.trim())) return { answers, fallback: null };
  const fallback = fallbackPackageId(identification.providerName, identification.serviceAcronym) || null;
  if (!fallback) return { answers, fallback: null };
  return { answers: { ...answers, serviceIdentification: { ...identification, fedRampPackageId: "" } }, fallback };
}

const CERTIFICATION_TYPE_PATH = "/serviceIdentification/certificationType";

/** WI-004: the class is read-only text next to the certification type ("20x · Class A"); the customer never picks it. */
export function withFedrampClass(sections: AnswerSection[], fedrampClass: string | null): AnswerSection[] {
  if (!fedrampClass) return sections;
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => (row.path === CERTIFICATION_TYPE_PATH && row.value ? { ...row, value: `${row.value} · Class ${fedrampClass}` } : row)),
  }));
}

/** Everything Screen D shows for one customer (WI-007 §3). */
export async function getPackageOverviewScreen(
  customerId: string,
  deps: PackageOverviewDeps = defaultDeps(),
): Promise<PackageOverviewScreen> {
  const customer = await customersRepo.findCustomer(deps.db, customerId);
  if (!customer) throw new PackageOverviewError("customer not found", 404);
  const inputs = await packageOverviewRepo.findPackageOverviewInputs(deps.db, customerId);
  const confirmedBy = inputs?.assessorConfirmedBy ? await usersRepo.findUser(deps.db, inputs.assessorConfirmedBy) : undefined;
  const tab1 = await loadTab1Answers(customerId, deps);
  const { latest, ...status } = await getPackageOverviewStatus(customerId, tab1.updatedAt, deps);
  const packageId = packageIdForScreen(tab1.answers);

  return {
    customer: { id: customer.id, name: customer.name },
    inputs: {
      assessorName: inputs?.assessorName ?? "",
      assessorId: inputs?.assessorId ?? "",
      advisorName: inputs?.advisorName ?? "",
      assessorConfirmedAt: inputs?.assessorConfirmedAt ?? null,
      assessorConfirmedBy: confirmedBy?.name ?? (inputs?.assessorConfirmedAt ? "an Ignyte user" : null),
    },
    answers: withFedrampClass(answerSections(getSchemaNavigator(), packageId.answers, getCompanyFormDefinition().labels), customer.fedrampClass),
    packageIdFallback: packageId.fallback,
    logoUrl: tab1.logoUrl,
    logoUploaded: tab1.logoUploaded,
    schemaVersion: deps.generator.schemaVersion,
    status,
    latest: latest
      ? {
          id: latest.id,
          fileName: latest.fileName,
          valid: latest.valid,
          generatedAt: latest.generatedAt,
          schemaVersion: latest.schemaVersion,
          schemaCommit: latest.schemaCommit,
          rulesVersion: latest.rulesVersion,
          problems: latest.errors,
        }
      : null,
  };
}
