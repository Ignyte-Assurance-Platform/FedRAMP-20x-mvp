import type { SchemaNavigator } from "./messages";

/**
 * The read-only view of tab 1 on Screen D (WI-007 §3): the stored answers listed section
 * by section in the schema's order, each question named by the form label when the form
 * definition has one, else the schema `title`, else the field path (decision E2).
 */

export interface AnswerRow {
  /** JSON pointer into the answers, e.g. /contactInformation/1/contactPhone; also the anchor problems link to. */
  path: string;
  question: string;
  value: string;
}

export interface AnswerSection {
  path: string;
  title: string;
  rows: AnswerRow[];
}

export type AnswerLabels = Readonly<Record<string, string>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const labelKey = (path: string): string => path.replace(/\/\d+(?=\/|$)/g, "/*");

function name(nav: SchemaNavigator, labels: AnswerLabels, path: string): string {
  const title = nav.fieldSchema(path)?.title;
  const fallback = typeof title === "string" ? title : (path.split("/").pop() ?? path);
  return labels[labelKey(path)] ?? fallback;
}

function orderedKeys(nav: SchemaNavigator, path: string, value: Record<string, unknown>): string[] {
  const properties = nav.fieldSchema(path)?.properties;
  const known = isRecord(properties) ? Object.keys(properties) : [];
  return [...known.filter((k) => k in value), ...Object.keys(value).filter((k) => !known.includes(k)).sort()];
}

function text(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "";
  return String(value);
}

function rowsOf(nav: SchemaNavigator, labels: AnswerLabels, path: string, value: unknown, prefix: string): AnswerRow[] {
  if (Array.isArray(value)) {
    if (value.every((item) => !isRecord(item) && !Array.isArray(item))) {
      return [{ path, question: `${prefix}${name(nav, labels, path)}`, value: value.map(text).join(", ") }];
    }
    // Items are numbered by their own title when the schema gives one, else by the list's name.
    const itemSchemaTitle = nav.fieldSchema(`${path}/0`)?.title;
    const itemTitle = typeof itemSchemaTitle === "string" ? itemSchemaTitle : name(nav, labels, path);
    return value.flatMap((item, i) => rowsOf(nav, labels, `${path}/${i}`, item, `${prefix}${itemTitle} ${i + 1} · `));
  }
  if (isRecord(value)) {
    return orderedKeys(nav, path, value).flatMap((key) => rowsOf(nav, labels, `${path}/${key}`, value[key], prefix));
  }
  return [{ path, question: `${prefix}${name(nav, labels, path)}`, value: text(value) }];
}

export function answerSections(nav: SchemaNavigator, answers: Record<string, unknown>, labels: AnswerLabels = {}): AnswerSection[] {
  return orderedKeys(nav, "", answers).map((key) => {
    const path = `/${key}`;
    const value = answers[key];
    const rows = isRecord(value) || Array.isArray(value) ? rowsOf(nav, labels, path, value, "") : rowsOf(nav, labels, path, value, "");
    return { path, title: name(nav, labels, path), rows };
  });
}
