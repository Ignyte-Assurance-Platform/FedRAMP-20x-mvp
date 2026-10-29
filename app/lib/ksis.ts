/**
 * Tab 2 rules shared by the browser and the server (WI-005 §3, E5): the shape of the stored
 * answers, the one status function behind every block label, the two counts, Screen D's
 * follow-ups, and the check every save goes through. The texts come from
 * form-definitions/ksis.v1.json and the KSI statements from the vendored rules; nothing here
 * reads or stores anything.
 */

/** "required": the question itself asks how often (no separate line); "optional": a separate line that never counts; "none": no line. */
export type HowOftenRule = "required" | "optional" | "none";

export interface KsiQuestion {
  id: string;
  text: string;
}

export interface KsiBlockDefinition {
  code: string;
  howOften: HowOftenRule;
  questions: KsiQuestion[];
  /** Christina's customer-facing "why we ask" line. */
  why: string;
}

export interface ReadinessQuestion extends KsiQuestion {
  why: string;
  /** Shown as "Recommended" and ignored by the status (question 19). */
  recommended?: boolean;
}

export interface KsisDefinition {
  form: "ksis";
  revision: number;
  labels: Record<"howOften" | "howOftenHelp" | "needHelp" | "recommended" | "rulesVersion", string>;
  limits: { answer: number; howOften: number };
  ksis: KsiBlockDefinition[];
  readiness: { key: "vulnerability_detection"; title: string; note: string; questions: ReadinessQuestion[] };
}

export interface KsiBlockAnswers {
  questions: Record<string, string>;
  /** A string where the block has the optional line, null where it has none. */
  how_often: string | null;
  need_help: boolean;
}

export interface ReadinessAnswers {
  questions: Record<string, string>;
  need_help: boolean;
}

/**
 * Tab 2 answers as the page edits and sends them. The stored section also holds `rules_version`,
 * stamped by the server on every save; it never comes back in this shape, so a page that reloads
 * or takes the stored answers sends only what checkKsisAnswers accepts (second opinion, bug A).
 */
export interface KsisAnswers {
  ksi: Record<string, KsiBlockAnswers>;
  readiness: { vulnerability_detection: ReadinessAnswers };
}

export type BlockStatus = "answered" | "partly" | "needs_help" | "not_answered";

export const STATUS_LABELS: Record<BlockStatus, string> = {
  answered: "Answered",
  partly: "Partly answered",
  needs_help: "Needs help",
  not_answered: "Not answered",
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown) => (typeof x === "string" ? x : "");
/** An answer counts when it has text after trimming; it is stored as typed. */
export const hasText = (x: unknown) => typeof x === "string" && x.trim() !== "";

/** Every block and question of the definition, with what is stored filled in and the rest empty. */
export function normalizeKsisAnswers(definition: KsisDefinition, stored: unknown): KsisAnswers {
  const source = isRecord(stored) ? stored : {};
  const ksi = isRecord(source.ksi) ? source.ksi : {};
  const readiness = isRecord(source.readiness) && isRecord(source.readiness.vulnerability_detection) ? source.readiness.vulnerability_detection : {};
  const questionsOf = (from: Record<string, unknown>, questions: KsiQuestion[]) => {
    const saved = isRecord(from.questions) ? from.questions : {};
    return Object.fromEntries(questions.map((q) => [q.id, text(saved[q.id])]));
  };
  const answers: KsisAnswers = {
    ksi: Object.fromEntries(
      definition.ksis.map((block) => {
        const raw = ksi[block.code];
        const saved: Record<string, unknown> = isRecord(raw) ? raw : {};
        return [
          block.code,
          {
            questions: questionsOf(saved, block.questions),
            how_often: block.howOften === "optional" ? text(saved.how_often) : null,
            need_help: saved.need_help === true,
          },
        ];
      }),
    ),
    readiness: {
      vulnerability_detection: { questions: questionsOf(readiness, definition.readiness.questions), need_help: readiness.need_help === true },
    },
  };
  return answers;
}

/**
 * The one status rule (E5). Only the counted questions decide: the optional "How often?" line is
 * not a question here, and a recommended question is left out. Needs help outranks everything.
 */
export function blockStatus(questions: { id: string; recommended?: boolean }[], block: { questions: Record<string, string>; need_help: boolean }): BlockStatus {
  const counted = questions.filter((q) => !q.recommended);
  const filled = counted.filter((q) => hasText(block.questions[q.id])).length;
  if (block.need_help) return "needs_help";
  if (counted.length > 0 && filled === counted.length) return "answered";
  return filled > 0 ? "partly" : "not_answered";
}

/** Every counted question has text, whatever the checkbox says (a Needs help block can still count as answered). */
function allAnswered(questions: { id: string; recommended?: boolean }[], block: { questions: Record<string, string> }): boolean {
  const counted = questions.filter((q) => !q.recommended);
  return counted.length > 0 && counted.every((q) => hasText(block.questions[q.id]));
}

export interface BlockSummary {
  /** The KSI code, or the readiness key for the Vulnerability detection block. */
  key: string;
  status: BlockStatus;
}

/** The status of each KSI block in playbook order, then the Vulnerability detection block. */
export function blockSummaries(definition: KsisDefinition, answers: KsisAnswers): BlockSummary[] {
  return [
    ...definition.ksis.map((block) => ({ key: block.code, status: blockStatus(block.questions, answers.ksi[block.code]!) })),
    { key: definition.readiness.key, status: blockStatus(definition.readiness.questions, answers.readiness.vulnerability_detection) },
  ];
}

/** The two counts over the seven KSI blocks; the Vulnerability detection block is not counted. */
export function ksiCounts(definition: KsisDefinition, answers: KsisAnswers): { answered: number; needsHelp: number; total: number } {
  let answered = 0;
  let needsHelp = 0;
  for (const block of definition.ksis) {
    const saved = answers.ksi[block.code]!;
    if (allAnswered(block.questions, saved)) answered++;
    if (saved.need_help) needsHelp++;
  }
  return { answered, needsHelp, total: definition.ksis.length };
}

/** "5/7 answered, 1 needs help". */
export function countsText(counts: { answered: number; needsHelp: number; total: number }): string {
  return `${counts.answered}/${counts.total} answered, ${counts.needsHelp} needs help`;
}

/** Screen D's follow-ups: the Needs help and Not answered blocks, computed live; Partly answered is not one. */
export function followUps(definition: KsisDefinition, answers: KsisAnswers): BlockSummary[] {
  return blockSummaries(definition, answers).filter((b) => b.status === "needs_help" || b.status === "not_answered");
}

export type KsisCheck = { ok: true; answers: KsisAnswers } | { ok: false; message: string };

export const KSIS_REFUSED_MESSAGE = "This form has answers it does not know. Reload the page and try again.";

/**
 * The check every tab 2 save goes through, in the browser and on the server (E3, E7): only the
 * blocks, questions and fields of the form definition, strings within their limits, a boolean
 * checkbox. Anything else, `rules_version` and Ignyte's consultant fields included, is refused.
 */
export function checkKsisAnswers(definition: KsisDefinition, input: unknown): KsisCheck {
  const refuse = (message = KSIS_REFUSED_MESSAGE): KsisCheck => ({ ok: false, message });
  const onlyKeys = (x: Record<string, unknown>, allowed: string[]) => Object.keys(x).every((k) => allowed.includes(k));
  const tooLong = `An answer is longer than ${definition.limits.answer.toLocaleString("en-US")} characters. Shorten it and try again.`;
  const questionsOk = (x: unknown, questions: KsiQuestion[]): string | null => {
    if (x === undefined) return null;
    if (!isRecord(x) || !onlyKeys(x, questions.map((q) => q.id))) return KSIS_REFUSED_MESSAGE;
    for (const value of Object.values(x)) {
      if (typeof value !== "string") return KSIS_REFUSED_MESSAGE;
      if (value.length > definition.limits.answer) return tooLong;
    }
    return null;
  };
  if (!isRecord(input) || !onlyKeys(input, ["ksi", "readiness"])) return refuse();
  if (input.ksi !== undefined) {
    if (!isRecord(input.ksi) || !onlyKeys(input.ksi, definition.ksis.map((b) => b.code))) return refuse();
    for (const block of definition.ksis) {
      const saved = input.ksi[block.code];
      if (saved === undefined) continue;
      if (!isRecord(saved) || !onlyKeys(saved, ["questions", "how_often", "need_help"])) return refuse();
      const problem = questionsOk(saved.questions, block.questions);
      if (problem) return refuse(problem);
      if (saved.need_help !== undefined && typeof saved.need_help !== "boolean") return refuse();
      if (saved.how_often !== undefined && saved.how_often !== null) {
        if (block.howOften !== "optional" || typeof saved.how_often !== "string") return refuse();
        if (saved.how_often.length > definition.limits.howOften) {
          return refuse(`"${definition.labels.howOften}" is longer than ${definition.limits.howOften} characters. Shorten it and try again.`);
        }
      }
    }
  }
  if (input.readiness !== undefined) {
    if (!isRecord(input.readiness) || !onlyKeys(input.readiness, [definition.readiness.key])) return refuse();
    const saved = input.readiness[definition.readiness.key];
    if (saved !== undefined) {
      if (!isRecord(saved) || !onlyKeys(saved, ["questions", "need_help"])) return refuse();
      const problem = questionsOk(saved.questions, definition.readiness.questions);
      if (problem) return refuse(problem);
      if (saved.need_help !== undefined && typeof saved.need_help !== "boolean") return refuse();
    }
  }
  return { ok: true, answers: normalizeKsisAnswers(definition, input) };
}
