/**
 * Tab 1 form definition (WI-004): generated on the server from the vendored Package Overview
 * schema plus the overlay in form-definitions/, sent to the page as data. This file holds the
 * shape and the browser-side checks; it is pure so the server can import its types.
 */
import { fullFormats } from "ajv-formats/dist/formats";
import * as v from "valibot";

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

const required = (field: FormField) => v.custom<never>(() => false, `${field.label} is required`);

type FormatCheck = RegExp | ((s: string) => boolean) | { validate: RegExp | ((s: string) => boolean) };
const test = (check: FormatCheck, s: string): boolean => {
  const rule = typeof check === "object" && "validate" in check ? check.validate : check;
  return rule instanceof RegExp ? rule.test(s) : rule(s);
};
/** The very checks the server's ajv runs for these formats (ajv-formats "full" mode), so the two cannot disagree. */
const formatIs = (format: "email" | "uri" | "date") => (s: string) => test(fullFormats[format] as FormatCheck, s);

/** The rules a filled-in value must meet: type, string format (uri, email, date), enum membership. */
function filledSchema(field: FormField, hasLogo: boolean): v.GenericSchema {
  switch (field.kind) {
    case "group":
      return objectSchema(field.fields ?? [], hasLogo);
    case "list": {
      const item = objectSchema(field.fields ?? [], hasLogo);
      // Blank rows the customer added and left empty are not checked (the generator drops them).
      return v.array(v.lazy((value) => (isEmpty(value) ? v.unknown() : item)));
    }
    case "boolean":
      return v.boolean(`${field.label} is required`);
    case "select":
      return v.picklist(field.options ?? [], `${field.label} must be one of the listed options`);
    case "multiSelect":
      return v.array(v.picklist(field.options ?? [], `${field.label} must be one of the listed options`));
    case "stringList":
      return v.array(v.string());
    default:
      if (field.format === "email") return v.pipe(v.string(), v.check(formatIs("email"), `${field.label} must be an email address`));
      if (field.format === "uri") return v.pipe(v.string(), v.check(formatIs("uri"), `${field.label} must be a full web address (https://…)`));
      if (field.format === "date") return v.pipe(v.string(), v.check(formatIs("date"), `${field.label} must be a date`));
      return v.string();
  }
}

function fieldSchema(field: FormField, hasLogo: boolean): v.GenericSchema {
  if (field.kind === "logo") return field.required && !hasLogo ? required(field) : v.unknown();
  const filled = filledSchema(field, hasLogo);
  // Empty answers (blank text, unticked groups) count as missing, as in the generated file.
  return v.lazy((value) => (isEmpty(value) ? (field.required ? required(field) : v.unknown()) : filled));
}

function objectSchema(fields: FormField[], hasLogo: boolean): v.GenericSchema {
  const conditional = fields.filter((f) => f.requiredWhen && !f.required);
  const absent = Object.fromEntries(fields.map((f) => [f.key, undefined]));
  return v.pipe(
    v.custom<Record<string, unknown>>(isRecord, "Expected a group of answers"),
    // An unanswered question has no key at all; give it one so its own rule (required or not) runs.
    v.transform((input: Record<string, unknown>) => ({ ...absent, ...input })),
    v.looseObject(Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f, hasLogo)]))),
    // The schema's if/then: required once a sibling has the given value.
    // partialCheck still runs when another question of the group has a problem; its typing cannot
    // follow keys only known at run time, hence the cast.
    ...conditional.map(
      (f) =>
        v.forward(
          v.partialCheck(
            [[f.requiredWhen!.key], [f.key]],
            (input: Record<string, unknown>) => input[f.requiredWhen!.key] !== f.requiredWhen!.equals || !isEmpty(input[f.key]),
            `${f.label} is required`,
          ),
          [f.key],
        ) as unknown as v.PipeItem<Record<string, unknown>, Record<string, unknown>, v.BaseIssue<unknown>>,
    ),
  );
}

/** Valibot rules for tab 1, generated from the definition the server built from the vendored schema. */
export function answersSchema(fields: FormField[], hasLogo = true): v.GenericSchema {
  return objectSchema(fields, hasLogo);
}

/**
 * Browser-side check before Submit (§5: Valibot, generated from the schema): required, string
 * formats, enum membership. The server checks again against the schema itself; this one only
 * spares a round trip.
 */
export function checkAnswers(fields: FormField[], value: Record<string, unknown>, base = "", hasLogo = true): FieldProblem[] {
  const result = v.safeParse(answersSchema(fields, hasLogo), value);
  if (result.success) return [];
  return result.issues.map((issue) => ({
    path: `${base}/${(issue.path ?? []).map((p) => String(p.key)).join("/")}`,
    message: issue.message,
  }));
}
