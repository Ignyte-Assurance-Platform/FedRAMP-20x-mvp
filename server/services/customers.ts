import * as v from "valibot";
import { getEnv } from "~server/config";
import { getDb, type Database } from "~server/db";
import { customersRepo, type CustomerRow } from "~server/repositories";
import {
  decryptIntakeToken,
  hashIntakeToken,
  INTAKE_LINK_EXPIRED_MESSAGE,
  intakeLinkUrl,
  isIntakeLinkExpired,
  newIntakeLinkColumns,
} from "./intake-link";
import { compareVersions, getPackageOverviewGenerator } from "./package-overview";

/**
 * Screens B and C and the "Intake link" section of Screen D (WI-003): create a customer with
 * its intake link, list customers, issue a new link, unlock a submitted intake. The token
 * checks the intake side calls (resolve, first save, submit) live here too so every route
 * that takes a token answers the same way; the intake pages are WI-004's.
 */

export interface CustomerDeps {
  db: Database;
  now: () => Date;
  key: Buffer;
  appUrl: string;
  /** The vendored Package Overview version; older files show "Regenerate" in the list. */
  schemaVersion: string;
  /** Token source, replaceable in tests. */
  issueToken?: () => string;
}

const defaultDeps = (): CustomerDeps => {
  const env = getEnv();
  return { db: getDb(), now: () => new Date(), key: env.intakeLinkKey, appUrl: env.APP_URL, schemaVersion: getPackageOverviewGenerator().schemaVersion };
};

export type IntakeStatus = CustomerRow["status"];
export const STATUS_LABELS: Record<IntakeStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};

export class CustomerError extends Error {
  override name = "CustomerError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const required = (label: string) => v.pipe(v.string(), v.trim(), v.nonEmpty(`${label} is required.`), v.maxLength(200, `${label} is too long.`));

/** Screen C: company name, service name, contact name and email required; description optional. */
export const CustomerInput = v.object({
  name: required("Company name"),
  serviceName: required("Service name"),
  serviceDescription: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000, "Service description is too long.")), ""),
  contactName: required("Primary contact name"),
  contactEmail: v.pipe(v.string(), v.trim(), v.nonEmpty("Primary contact email is required."), v.email("Enter a valid email address.")),
});
export type CustomerInputValues = v.InferInput<typeof CustomerInput>;

export interface IntakeLinkView {
  /** The full link, or null when it has expired (Screen B shows "Expired", Copy disabled). */
  url: string | null;
  expired: boolean;
  issuedAt: Date | null;
  expiresAt: Date | null;
  issuedBy: string | null;
}

/**
 * The link as staff see it. A stored copy that no longer decrypts (INTAKE_LINK_KEY changed) is
 * shown as expired, so the consultant issues a new link instead of the page failing.
 */
export function intakeLinkView(row: CustomerRow, deps: Pick<CustomerDeps, "key" | "appUrl" | "now">): IntakeLinkView {
  let token: string | null = null;
  if (row.intakeTokenEncrypted && !isIntakeLinkExpired(row.intakeTokenExpiresAt, deps.now())) {
    try {
      token = decryptIntakeToken(row.intakeTokenEncrypted, deps.key);
    } catch {
      token = null;
    }
  }
  return {
    url: token ? intakeLinkUrl(deps.appUrl, token) : null,
    expired: token === null,
    issuedAt: row.intakeTokenIssuedAt,
    expiresAt: row.intakeTokenExpiresAt,
    issuedBy: row.intakeTokenIssuedBy,
  };
}

const isTokenCollision = (error: unknown): boolean => {
  const e = error as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const pg = e.cause ?? e;
  return pg.code === "23505" && (pg.constraint_name ?? "").includes("intake_token_hash");
};

/**
 * Save on Screen C: the customer starts Not started with a fresh link. A token collision on
 * the unique hash is retried with a new token (E3); the token is never user-supplied.
 */
export async function createCustomer(
  input: CustomerInputValues,
  userId: string,
  deps: CustomerDeps = defaultDeps(),
): Promise<{ customer: CustomerRow; link: string }> {
  const values = v.parse(CustomerInput, input);
  for (let attempt = 0; ; attempt++) {
    const { token, columns } = newIntakeLinkColumns(deps.key, userId, deps.now(), deps.issueToken?.());
    try {
      const customer = await customersRepo.insertCustomer(deps.db, {
        ...values,
        serviceDescription: values.serviceDescription || null,
        status: "not_started",
        createdBy: userId,
        ...columns,
      });
      return { customer, link: intakeLinkUrl(deps.appUrl, token) };
    } catch (error) {
      if (!isTokenCollision(error) || attempt >= 2) throw error;
    }
  }
}

export interface CustomerListRow {
  id: string;
  name: string;
  serviceName: string | null;
  status: IntakeStatus;
  statusLabel: string;
  createdAt: Date;
  link: IntakeLinkView;
  /** The latest Package Overview file used an older schema version (WI-007). */
  regenerate: boolean;
}

export async function listCustomers(deps: CustomerDeps = defaultDeps()): Promise<CustomerListRow[]> {
  const rows = await customersRepo.listCustomers(deps.db);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    serviceName: row.serviceName,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    createdAt: row.createdAt,
    link: intakeLinkView(row, deps),
    regenerate: row.latestSchemaVersion !== null && compareVersions(row.latestSchemaVersion, deps.schemaVersion) < 0,
  }));
}

/** Screen D's "Intake link" section. */
export async function getIntakeLinkSection(customerId: string, deps: CustomerDeps = defaultDeps()) {
  const row = await customersRepo.findCustomer(deps.db, customerId);
  if (!row) throw new CustomerError("customer not found", 404);
  return { status: row.status, statusLabel: STATUS_LABELS[row.status], link: intakeLinkView(row, deps), unlockedAt: row.unlockedAt, unlockedBy: row.unlockedBy };
}

/**
 * Issue new link (Screen D): one atomic update replaces the token, its issue and expiry dates
 * and who issued it, so the old link stops matching at once. Status, lock and answers are untouched.
 */
export async function issueNewIntakeLink(customerId: string, userId: string, deps: CustomerDeps = defaultDeps()): Promise<string> {
  const { token, columns } = newIntakeLinkColumns(deps.key, userId, deps.now(), deps.issueToken?.());
  const row = await customersRepo.updateCustomer(deps.db, customerId, columns);
  if (!row) throw new CustomerError("customer not found", 404);
  return intakeLinkUrl(deps.appUrl, token);
}

/** Unlock (Screen D): Submitted → In progress, with who and when. Does not extend the link. */
export async function unlockIntake(customerId: string, userId: string, deps: CustomerDeps = defaultDeps()): Promise<CustomerRow> {
  const row = await customersRepo.moveStatus(deps.db, customerId, ["submitted"], {
    status: "in_progress",
    unlockedAt: deps.now(),
    unlockedBy: userId,
  });
  if (!row) throw new CustomerError("Only a submitted intake can be unlocked.", 409);
  return row;
}

export type IntakeAccess = { ok: true; customer: CustomerRow; locked: boolean } | { ok: false; message: string };

/**
 * The check every route that takes a token runs (E4): an unknown, replaced or expired token
 * gets the same answer, and nothing is stored. A Submitted intake is read-only.
 */
export async function resolveIntakeToken(token: string, deps: Pick<CustomerDeps, "db" | "now"> = defaultDeps()): Promise<IntakeAccess> {
  const row = /^[A-Za-z0-9_-]{32}$/.test(token) ? await customersRepo.findCustomerByTokenHash(deps.db, hashIntakeToken(token)) : undefined;
  if (!row || isIntakeLinkExpired(row.intakeTokenExpiresAt, deps.now())) {
    return { ok: false, message: INTAKE_LINK_EXPIRED_MESSAGE };
  }
  return { ok: true, customer: row, locked: row.status === "submitted" };
}

/** The first answer the customer stores (Save, autosave or upload): Not started → In progress. */
export async function markIntakeStarted(customerId: string, deps: Pick<CustomerDeps, "db"> = defaultDeps()): Promise<void> {
  await customersRepo.moveStatus(deps.db, customerId, ["not_started"], { status: "in_progress" });
}

/** Submit: the intake becomes Submitted and the link read-only. */
export async function submitIntake(customerId: string, deps: Pick<CustomerDeps, "db"> = defaultDeps()): Promise<void> {
  const row = await customersRepo.moveStatus(deps.db, customerId, ["not_started", "in_progress"], { status: "submitted" });
  if (!row) throw new CustomerError("The intake is already submitted.", 409);
}
