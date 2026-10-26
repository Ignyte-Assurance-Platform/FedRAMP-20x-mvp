/**
 * Tab 1 form definition (WI-004): generated on the server from the vendored Package Overview
 * schema plus the overlay in form-definitions/, sent to the page as data. This file holds the
 * shape and the browser-side checks; it is pure so the server can import its types.
 */

export type FieldKind =
  | "text"
  | "longText"
  | "url"
  | "email"
  | "date"
  | "select"
  | "multiSelect"
  | "stringList"
  | "boolean"
  | "group"
  | "list"
  | "logo";

export interface FormField {
  /** Schema path with `*` for list items, e.g. /contactInformation/*\/contactPhone. */
  path: string;
  key: string;
  label: string;
  kind: FieldKind;
  /** Required within its parent (a required field of an optional group is required once the group is filled). */
  required: boolean;
  /** Required when a sibling has a value (the schema's if/then, e.g. access instructions when authentication is required). */
  requiredWhen?: { key: string; equals: unknown };
  help?: string;
  note?: string;
  /** "Why we ask (client)" lines, word for word; none when the questionnaire says "—". */
  why?: string[];
  placeholder?: string;
  /** Exact schema strings of an enum. */
  options?: string[];
  /** Schema examples offered as suggestions for free text. */
  suggestions?: string[];
  format?: "email" | "uri" | "date";
  fields?: FormField[];
  /** Label of one item of a list ("Contact 1"). */
  itemLabel?: string;
}

export interface FormDefinition {
  form: string;
  /** Stored as intake_answers.form_definition_version. */
  version: string;
  schemaVersion: string;
  schemaCommit: string;
  fields: FormField[];
  /** Question labels by schema path (`*` for list items); Screen D names problems with them. */
  labels: Record<string, string>;
}

export interface FieldProblem {
  /** JSON pointer into the answers (list items by index). */
  path: string;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isEmpty);
  if (isRecord(value)) return Object.values(value).every(isEmpty);
  return false;
}

/** Same rule as the generator's fallback (WI-007 §3): "<provider name> <service acronym>", empty when either is missing. */
export function packageIdFallback(answers: Record<string, unknown>): string {
  const id = isRecord(answers.serviceIdentification) ? answers.serviceIdentification : {};
  const provider = typeof id.providerName === "string" ? id.providerName.trim() : "";
  const acronym = typeof id.serviceAcronym === "string" ? id.serviceAcronym.trim() : "";
  return provider && acronym ? `${provider} ${acronym}` : "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isUri(value: string): boolean {
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Browser-side check before Submit (required, formats, enum membership), from the definition.
 * The server checks again against the schema itself; this one only spares a round trip.
 */
export function checkAnswers(fields: FormField[], value: Record<string, unknown>, base = "", hasLogo = true): FieldProblem[] {
  const problems: FieldProblem[] = [];
  for (const field of fields) {
    const path = `${base}/${field.key}`;
    const current = value[field.key];
    if (field.kind === "logo") {
      if (field.required && !hasLogo) problems.push({ path, message: `${field.label} is required` });
      continue;
    }
    const required = field.required || (field.requiredWhen !== undefined && value[field.requiredWhen.key] === field.requiredWhen.equals);
    if (isEmpty(current) && field.kind !== "boolean") {
      if (required) problems.push({ path, message: `${field.label} is required` });
      continue;
    }
    if (field.kind === "boolean" && required && typeof current !== "boolean") {
      problems.push({ path, message: `${field.label} is required` });
      continue;
    }
    if (field.kind === "group" && isRecord(current) && field.fields) problems.push(...checkAnswers(field.fields, current, path, hasLogo));
    if (field.kind === "list" && Array.isArray(current) && field.fields) {
      current.forEach((item, i) => {
        if (isRecord(item) && !isEmpty(item)) problems.push(...checkAnswers(field.fields!, item, `${path}/${i}`, hasLogo));
      });
    }
    if (typeof current === "string" && current.trim()) {
      const text = current.trim();
      if (field.format === "email" && !EMAIL.test(text)) problems.push({ path, message: `${field.label} must be an email address` });
      if (field.format === "uri" && !isUri(text)) problems.push({ path, message: `${field.label} must be a full web address (https://…)` });
      if (field.format === "date" && !DATE.test(text)) problems.push({ path, message: `${field.label} must be a date` });
      if (field.options && field.kind === "select" && !field.options.includes(text)) {
        problems.push({ path, message: `${field.label} must be one of the listed options` });
      }
    }
  }
  return problems;
}
