import type { SchemaNavigator } from "../messages";

/**
 * Answers → Package Overview document (WI-007 §3, port of Christina's converter). Tab 1
 * stores a partial Package Overview object (WI-004 §4), so the mapping adds only what
 * Ignyte owns: the hosted logo URL, the assessor and the advisor entry.
 */

export interface PackageOverviewInputs {
  /** Tab 1 answers: a partial Package Overview object. */
  answers: Record<string, unknown>;
  /** Public URL of the logo Ignyte hosts; replaces whatever tab 1 holds. */
  logoUrl?: string | null;
  assessorName?: string | null;
  assessorId?: string | null;
  /** Ignyte's advisor entry, "Ignyte" by default; empty adds none (decision E1). */
  advisorName?: string | null;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: string | null | undefined): string => (v ?? "").trim();

/** Drops empty strings, arrays and objects: an unanswered optional field is omitted, never "N/A". */
function prune(value: unknown): Json | undefined {
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v): v is Json => v !== undefined);
    return items.length ? items : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter((e): e is readonly [string, Json] => e[1] !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (typeof value === "boolean" || typeof value === "number") return value;
  return undefined;
}

function mergeAdvisors(existing: unknown, ignyte: string): Json[] | undefined {
  const list = Array.isArray(existing) ? existing.filter(isRecord) : [];
  const names = new Set(list.map((a) => String(a.name ?? "").trim().toLowerCase()));
  const merged = ignyte && !names.has(ignyte.toLowerCase()) ? [...list, { name: ignyte }] : list;
  return merged.length ? (merged as Json[]) : undefined;
}

export function buildPackageOverview(inputs: PackageOverviewInputs): Record<string, Json> {
  const doc: Record<string, unknown> = structuredClone(inputs.answers);

  const serviceIdentification = isRecord(doc.serviceIdentification) ? doc.serviceIdentification : {};
  if (text(inputs.logoUrl)) serviceIdentification.logo = text(inputs.logoUrl);
  doc.serviceIdentification = serviceIdentification;

  const assessorName = text(inputs.assessorName);
  const assessorId = text(inputs.assessorId);
  if (assessorName || assessorId) doc.assessor = { name: assessorName, assessorID: assessorId };
  else delete doc.assessor;

  const advisors = mergeAdvisors(doc.advisors, text(inputs.advisorName ?? "Ignyte"));
  if (advisors) doc.advisors = advisors;
  else delete doc.advisors;

  const pruned = prune(doc);
  return isRecord(pruned) ? (pruned as Record<string, Json>) : {};
}

/**
 * Same inputs, same bytes (WI-007 §10): keys follow the schema's property order, unknown
 * keys come after in alphabetical order.
 */
export function orderBySchema(value: Json, nav: SchemaNavigator, path = ""): Json {
  if (Array.isArray(value)) return value.map((item, i) => orderBySchema(item, nav, `${path}/${i}`));
  if (!isRecord(value)) return value;
  const properties = nav.fieldSchema(path)?.properties;
  const known = isRecord(properties) ? Object.keys(properties) : [];
  const keys = [...known.filter((k) => k in value), ...Object.keys(value).filter((k) => !known.includes(k)).sort()];
  return Object.fromEntries(keys.map((k) => [k, orderBySchema(value[k] as Json, nav, `${path}/${k}`)]));
}

export function serializePackageOverview(document: Json): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
