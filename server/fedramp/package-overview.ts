import {
  buildPackageOverview,
  orderBySchema,
  serializePackageOverview,
  type PackageOverviewInputs,
} from "./mapping/package-overview";
import { problemsFromSchemaErrors, SchemaNavigator, type FormLabels, type Problem } from "./messages";
import { loadVendoredSchemas, type VendoredSchemas } from "./schemas";
import { createSchemaValidator } from "./validate";

/**
 * Generate JSON (WI-007 §3, §5): build the document, validate it against the vendored
 * schema (step 1), then run the checks the schema cannot do (step 2). Any problem makes
 * the file a draft. Pure apart from the inputs: "today" and the logo check are passed in.
 */

export type LogoCheck = { ok: true } | { ok: false; reason: string };

/** The reason a hosted logo cannot be published because LOGO_PUBLIC_BASE_URL is empty. */
export const LOGO_HOST_NOT_CONFIGURED = "the logo host is not configured";

export interface GenerateInput extends PackageOverviewInputs {
  /** When the "Assessor Confirmed on FedRAMP Marketplace" box was ticked; null if not. */
  assessorConfirmedAt?: Date | null;
  /** Result of requesting the Ignyte-hosted logo URL (done by the caller). */
  logoCheck: LogoCheck;
  /** Today's date in America/New_York, YYYY-MM-DD (see todayInNewYork). */
  today: string;
  labels?: FormLabels;
}

export interface GeneratedPackageOverview {
  document: Record<string, unknown>;
  /** Stable bytes of the document: what is stored and downloaded. */
  json: string;
  valid: boolean;
  problems: Problem[];
  fileName: string;
  schemaVersion: string;
  schemaCommit: string;
}

export class MissingAcronymError extends Error {
  override name = "MissingAcronymError";
  constructor() {
    super("Service acronym is required to name the file");
  }
}

/** YYYY-MM-DD in FedRAMP's timezone. */
export function todayInNewYork(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function packageOverviewFileName(acronym: string, valid: boolean): string {
  const safe = acronym.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return valid ? `${safe}-package-overview.json` : `${safe}-package-overview-DRAFT.json`;
}

export const LOGO_PATH = "/serviceIdentification/logo";
const ASSESSOR_NAME_PATH = "/assessor/name";

/** The `raw` of the "not confirmed on the FedRAMP Marketplace" problem; Screen D links it to the tick, not the name box. */
export const ASSESSOR_NOT_CONFIRMED = "assessor not confirmed";
const NEXT_REPORT_PATH = "/serviceProperties/nextOngoingCertificationReportDate";

function businessProblems(nav: SchemaNavigator, doc: Record<string, unknown>, input: GenerateInput): Problem[] {
  const labels = input.labels ?? {};
  const name = (path: string): string => {
    const title = nav.fieldSchema(path)?.title;
    return labels[path] ?? (typeof title === "string" ? title : path);
  };
  const problems: Problem[] = [];

  const props = doc.serviceProperties as Record<string, unknown> | undefined;
  const next = props?.nextOngoingCertificationReportDate;
  if (typeof next === "string" && next <= input.today) {
    problems.push({ path: NEXT_REPORT_PATH, question: name(NEXT_REPORT_PATH), message: `${name(NEXT_REPORT_PATH)} must be after today`, raw: `${next} <= ${input.today}` });
  }

  if ((input.assessorName ?? "").trim() && !input.assessorConfirmedAt) {
    problems.push({
      path: ASSESSOR_NAME_PATH,
      question: name(ASSESSOR_NAME_PATH),
      message: `${name(ASSESSOR_NAME_PATH)} has not been confirmed on the FedRAMP Marketplace`,
      raw: ASSESSOR_NOT_CONFIRMED,
    });
  }

  if (!input.logoCheck.ok) {
    const identification = doc.serviceIdentification as Record<string, unknown> | undefined;
    // With no public address at all (logo uploaded, host not configured) the schema would
    // say "Logo is required", which sends the consultant to the wrong place; name the cause.
    const message =
      typeof identification?.logo === "string"
        ? `${name(LOGO_PATH)} does not open as an image (${input.logoCheck.reason})`
        : `${name(LOGO_PATH)} cannot be published: ${input.logoCheck.reason}`;
    problems.push({ path: LOGO_PATH, question: name(LOGO_PATH), message, raw: input.logoCheck.reason });
  }
  return problems;
}

export interface PackageOverviewGenerator {
  schemaVersion: string;
  schemaCommit: string;
  /** The vendored schemas the generator was compiled from (for navigation, never mutated). */
  schemas: VendoredSchemas;
  generate(input: GenerateInput): GeneratedPackageOverview;
}

export function createPackageOverviewGenerator(schemas: VendoredSchemas = loadVendoredSchemas()): PackageOverviewGenerator {
  const nav = new SchemaNavigator(schemas);
  const validator = createSchemaValidator(schemas);
  return {
    schemaVersion: schemas.schemaVersion,
    schemaCommit: schemas.schemaCommit,
    schemas,
    generate(input) {
      const built = buildPackageOverview(input);
      const acronym = (built.serviceIdentification as Record<string, unknown> | undefined)?.serviceAcronym;
      if (typeof acronym !== "string" || acronym.trim() === "") throw new MissingAcronymError();

      const document = orderBySchema(built, nav) as Record<string, unknown>;
      const schemaProblems = problemsFromSchemaErrors(nav, validator.validate(document), input.labels).filter(
        // A failed logo check explains the logo better than the schema's "is required".
        (problem) => input.logoCheck.ok || problem.path !== LOGO_PATH,
      );
      const problems = [...schemaProblems, ...businessProblems(nav, document, input)];
      const valid = problems.length === 0;
      return {
        document,
        json: serializePackageOverview(document as Parameters<typeof serializePackageOverview>[0]),
        valid,
        problems,
        fileName: packageOverviewFileName(acronym, valid),
        schemaVersion: schemas.schemaVersion,
        schemaCommit: schemas.schemaCommit,
      };
    },
  };
}
