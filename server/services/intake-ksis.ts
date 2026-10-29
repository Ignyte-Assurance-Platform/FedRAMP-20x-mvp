import { readFileSync } from "node:fs";
import path from "node:path";
import * as v from "valibot";
import {
  blockSummaries,
  checkKsisAnswers,
  followUps,
  ksiCounts,
  normalizeKsisAnswers,
  STATUS_LABELS,
  type BlockStatus,
  type KsisAnswers,
  type KsisDefinition,
} from "~/lib/ksis";
import { getDb, type Database } from "~server/db";
import { FORM_DEFINITIONS_DIR, getRulesLibrary, type RulesLibrary, type VendoredRules } from "~server/fedramp";
import { customersRepo, intakeAnswersRepo, type CustomerRow } from "~server/repositories";
import { CustomerError, markIntakeStarted } from "./customers";

/**
 * Screen E tab 2 (WI-005): the seven Class A KSI blocks and the Vulnerability detection block.
 * Answers are only stored (no AI, no result file), in the `ksis` section of intake_answers with
 * tab 1's version check; the server stamps `rules_version` with the vendored rules version in
 * force at each save. The lock is the caller's (`writable()` in intake.ts, E4). Screen D reads
 * the tab with its follow-ups and writes Ignyte's consultant fields on `customers` (E6).
 */

export const KSIS_SECTION = "ksis";

let definition: KsisDefinition | undefined;

export function loadKsisDefinition(file = path.join(FORM_DEFINITIONS_DIR, "ksis.v1.json")): KsisDefinition {
  // The file's $comment is for editors; the definition is sent to the customer's page.
  const definition = JSON.parse(readFileSync(file, "utf8")) as KsisDefinition & { $comment?: string };
  delete definition.$comment;
  return definition;
}

export function getKsisDefinition(): KsisDefinition {
  definition ??= loadKsisDefinition();
  return definition;
}

export interface KsisDeps {
  db: Database;
  rules: RulesLibrary;
  definition: KsisDefinition;
  now: () => Date;
}

const defaultDeps = (): KsisDeps => ({ db: getDb(), rules: getRulesLibrary(), definition: getKsisDefinition(), now: () => new Date() });

/** The KSI name and FedRAMP's statement, word for word, from one vendored rules version. */
export type KsiStatements = Record<string, { name: string; statement: string }>;

export const missingStatement = (version: string) => `Statement not available in FedRAMP rules ${version}.`;

/** A version without one of the codes (renamed or retired) shows a placeholder instead of failing the page. */
function statementsFrom(rules: VendoredRules, codes: string[]): KsiStatements {
  return Object.fromEntries(
    codes.map((code) => {
      const ksi = rules.ksis[code];
      return [code, ksi ? { name: ksi.name, statement: ksi.statement } : { name: code, statement: missingStatement(rules.version) }];
    }),
  );
}

export interface KsisTabView {
  definition: KsisDefinition;
  /** The current vendored rules version, shown as "FedRAMP rules <version>" under each statement. */
  rulesVersion: string;
  statements: KsiStatements;
  answers: KsisAnswers;
  version: number;
  savedAt: Date | null;
}

/** Tab 2 as the customer sees it: always the current rules (the stamp moves on the next save). */
export async function loadKsisTab(customerId: string, deps: Partial<KsisDeps> & Pick<KsisDeps, "db">): Promise<KsisTabView> {
  const { rules, definition: def } = { ...defaultDepsLazy(), ...deps };
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, customerId, KSIS_SECTION);
  return {
    definition: def,
    rulesVersion: rules.current.version,
    statements: statementsFrom(rules.current, def.ksis.map((b) => b.code)),
    answers: normalizeKsisAnswers(def, section?.answers),
    version: section?.version ?? 0,
    savedAt: section?.updatedAt ?? null,
  };
}

/** Rules and definition without a database handle (callers pass their own `db`). */
function defaultDepsLazy(): Pick<KsisDeps, "rules" | "definition" | "now"> {
  return { rules: getRulesLibrary(), definition: getKsisDefinition(), now: () => new Date() };
}

export type KsisSaveOutcome =
  | { kind: "refused"; message: string }
  /** The page's version is one the section never had; the caller says "out of date", as for tab 1. */
  | { kind: "stale" }
  | { kind: "saved"; version: number; savedAt: Date }
  | { kind: "conflict"; answers: KsisAnswers; version: number; savedAt: Date };

/**
 * Save and autosave of tab 2 (E3) for a customer the caller found writable: only the form
 * definition's keys, within the limits; `rules_version` is the server's, never the browser's.
 */
export async function saveKsisSection(
  customer: Pick<CustomerRow, "id">,
  input: { answers: unknown; version: number },
  deps: Partial<KsisDeps> & Pick<KsisDeps, "db" | "now">,
): Promise<KsisSaveOutcome> {
  const { rules, definition: def } = { ...defaultDepsLazy(), ...deps };
  const checked = checkKsisAnswers(def, input.answers);
  if (!checked.ok) return { kind: "refused", message: checked.message };
  const result = await intakeAnswersRepo.saveIntakeSection(deps.db, {
    customerId: customer.id,
    section: KSIS_SECTION,
    formDefinitionVersion: `ksis.v${def.revision}`,
    answers: { ...checked.answers, rules_version: rules.current.version },
    expectedVersion: input.version,
  });
  if ("stale" in result) return { kind: "stale" };
  if ("conflict" in result) {
    return { kind: "conflict", answers: normalizeKsisAnswers(def, result.conflict.answers), version: result.conflict.version, savedAt: result.conflict.updatedAt };
  }
  await markIntakeStarted(customer.id, deps);
  return { kind: "saved", version: result.saved.version, savedAt: result.saved.updatedAt };
}

// ---------- Screen D (staff)

export interface ScreenDKsiBlock {
  /** The KSI code, or the readiness key of the Vulnerability detection block. */
  key: string;
  title: string;
  /** KSI blocks only: FedRAMP's statement from the saved rules version. */
  name?: string;
  statement?: string;
  status: BlockStatus;
  statusLabel: string;
  questions: { id: string; text: string; answer: string; recommended: boolean }[];
  /** Blocks with the optional line only. */
  howOften?: string;
  needHelp: boolean;
}

export interface KsiReview {
  cmvpValidated: boolean | null;
  cmvpNote: string | null;
  logContextNote: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface KsisScreen {
  /** The version the statements are rendered from: the saved one, or the current one before any save. */
  rulesVersion: string;
  /**
   * "Answered under FedRAMP rules <saved>; current rules <current>." when they differ, or, when the
   * saved version is no longer vendored, a note saying the statements shown are the current ones.
   */
  rulesNote: string | null;
  counts: string;
  followUps: { key: string; title: string; statusLabel: string }[];
  blocks: ScreenDKsiBlock[];
  review: KsiReview;
  savedAt: Date | null;
}

/** Screen D (2.6, 2.15, 2.16, 2.17): tab 2 read-only, follow-ups computed live from the saved answers, and Ignyte's fields. */
export async function getKsisScreen(customerId: string, deps: KsisDeps = defaultDeps()): Promise<KsisScreen> {
  const def = deps.definition;
  const customer = await customersRepo.findCustomer(deps.db, customerId);
  if (!customer) throw new CustomerError("customer not found", 404);
  const section = await intakeAnswersRepo.findIntakeSection(deps.db, customerId, KSIS_SECTION);
  const answers = normalizeKsisAnswers(def, section?.answers);
  const current = deps.rules.current;
  // The stamp lives next to the answers in the stored section, never in the answers the page edits.
  const stamp = typeof section?.answers.rules_version === "string" ? section.answers.rules_version : undefined;
  const saved = stamp ? deps.rules.get(stamp) : undefined;
  const rules = saved ?? current;
  const statements = statementsFrom(rules, def.ksis.map((b) => b.code));
  const status = Object.fromEntries(blockSummaries(def, answers).map((b) => [b.key, b.status]));
  const titleOf = (key: string) => (key === def.readiness.key ? def.readiness.title : `${key} ${statements[key]!.name}`);

  const blocks: ScreenDKsiBlock[] = [
    ...def.ksis.map((block): ScreenDKsiBlock => {
      const stored = answers.ksi[block.code]!;
      return {
        key: block.code,
        title: titleOf(block.code),
        name: statements[block.code]!.name,
        statement: statements[block.code]!.statement,
        status: status[block.code]!,
        statusLabel: STATUS_LABELS[status[block.code]!],
        questions: block.questions.map((q) => ({ id: q.id, text: q.text, answer: stored.questions[q.id] ?? "", recommended: false })),
        ...(block.howOften === "optional" ? { howOften: stored.how_often ?? "" } : {}),
        needHelp: stored.need_help,
      };
    }),
    {
      key: def.readiness.key,
      title: def.readiness.title,
      status: status[def.readiness.key]!,
      statusLabel: STATUS_LABELS[status[def.readiness.key]!],
      questions: def.readiness.questions.map((q) => ({
        id: q.id,
        text: q.text,
        answer: answers.readiness.vulnerability_detection.questions[q.id] ?? "",
        recommended: Boolean(q.recommended),
      })),
      needHelp: answers.readiness.vulnerability_detection.need_help,
    },
  ];

  return {
    rulesVersion: rules.version,
    rulesNote:
      !stamp || stamp === current.version
        ? null
        : saved
          ? `Answered under FedRAMP rules ${stamp}; current rules ${current.version}.`
          : `Answered under FedRAMP rules ${stamp}, which is no longer in this build; statements shown are from current rules ${current.version}.`,
    counts: (() => {
      const c = ksiCounts(def, answers);
      return `${c.answered}/${c.total} answered, ${c.needsHelp} needs help`;
    })(),
    followUps: followUps(def, answers).map((b) => ({ key: b.key, title: titleOf(b.key), statusLabel: STATUS_LABELS[b.status] })),
    blocks,
    review: {
      cmvpValidated: customer.cmvpValidated,
      cmvpNote: customer.cmvpNote,
      logContextNote: customer.logContextNote,
      updatedAt: customer.ksiReviewUpdatedAt,
      updatedBy: customer.ksiReviewUpdatedBy,
    },
    savedAt: section?.updatedAt ?? null,
  };
}

export const KSI_REVIEW_NOTE_MAX = 2_000;

const ReviewNote = v.pipe(v.string(), v.trim(), v.maxLength(KSI_REVIEW_NOTE_MAX, `Notes are limited to ${KSI_REVIEW_NOTE_MAX.toLocaleString("en-US")} characters.`));
const KsiReviewInput = v.object({
  cmvpValidated: v.nullable(v.boolean()),
  cmvpNote: ReviewNote,
  logContextNote: ReviewNote,
});

/** Ignyte's "CMVP validated?" and notes on Screen D (2.16, E6), saved like the assessor boxes; empty notes are stored as null. */
export async function saveKsiReview(
  customerId: string,
  input: v.InferInput<typeof KsiReviewInput>,
  userId: string,
  deps: Pick<KsisDeps, "db" | "now"> = defaultDeps(),
): Promise<void> {
  const parsed = v.parse(KsiReviewInput, input);
  const row = await customersRepo.updateCustomer(deps.db, customerId, {
    cmvpValidated: parsed.cmvpValidated,
    cmvpNote: parsed.cmvpNote || null,
    logContextNote: parsed.logContextNote || null,
    ksiReviewUpdatedAt: deps.now(),
    ksiReviewUpdatedBy: userId,
  });
  if (!row) throw new CustomerError("customer not found", 404);
}
