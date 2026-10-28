import { readFileSync } from "node:fs";
import path from "node:path";
import type { FieldKind, FormDefinition, FormField } from "~/lib/form-definition";
import { loadVendoredSchemas, type JsonSchema, type VendoredSchemas } from "./schemas";

/**
 * Tab 1 form definition (WI-004 E3, NFR "derives from the schema file"): fields, required
 * flags, enums, formats and if/then rules are read from the vendored Package Overview schema;
 * the overlay (form-definitions/company.v1.json) adds labels, help, notes and the "Why we ask
 * (client)" lines. A new schema version needs no hand-edited field. The definition version
 * carries the overlay revision and the schema version, both read from files (no literals).
 *
 * Built for wi-004 only (decision Jesús 2026-10-26: wi-011, the general form engine, is still a
 * draft); wi-011 may absorb or replace it.
 */

export interface FormOverlay {
  form: string;
  revision: number;
  hidden?: string[];
  logo?: string;
  optional?: string[];
  labels?: Record<string, string>;
  help?: Record<string, string>;
  notes?: Record<string, string>;
  placeholders?: Record<string, string>;
  longText?: string[];
  why?: Record<string, string[] | string>;
}

export const FORM_DEFINITIONS_DIR = path.resolve(import.meta.dirname, "../../form-definitions");

export function loadFormOverlay(file = path.join(FORM_DEFINITIONS_DIR, "company.v1.json")): FormOverlay {
  return JSON.parse(readFileSync(file, "utf8")) as FormOverlay;
}

const isObject = (v: unknown): v is JsonSchema => typeof v === "object" && v !== null && !Array.isArray(v);

class Resolver {
  private readonly roots = new Map<string, JsonSchema>();
  constructor(private readonly schemas: Pick<VendoredSchemas, "packageOverview" | "commonDefinitions">) {
    for (const root of [schemas.packageOverview, schemas.commonDefinitions]) {
      if (typeof root.$id === "string") this.roots.set(root.$id, root);
    }
  }

  /** Follows $ref; the referencing node's title and description win (as on Screen D). */
  resolve(node: unknown, root: JsonSchema = this.schemas.packageOverview): { node: JsonSchema; root: JsonSchema } {
    let current: JsonSchema = isObject(node) ? node : {};
    let currentRoot = root;
    while (typeof current.$ref === "string") {
      const { $ref, ...siblings } = current;
      const [base = "", fragment = ""] = $ref.split("#");
      const target = base ? this.roots.get(base) : currentRoot;
      if (!target) throw new Error(`unresolvable $ref ${$ref}`);
      let found: unknown = target;
      for (const key of fragment.split("/").filter(Boolean)) found = isObject(found) ? found[key] : undefined;
      if (!isObject(found)) throw new Error(`unresolvable $ref ${$ref}`);
      current = { ...found, ...siblings };
      currentRoot = target;
    }
    return { node: current, root: currentRoot };
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);

/** The schema's if/then on an object: `if: {properties: {k: {const}}}, then: {required: [...]}`. */
function conditionalRequired(node: JsonSchema): Map<string, { key: string; equals: unknown }> {
  const result = new Map<string, { key: string; equals: unknown }>();
  const ifNode = node.if;
  const thenNode = node.then;
  if (!isObject(ifNode) || !isObject(thenNode) || !isObject(ifNode.properties)) return result;
  const pinned = Object.entries(ifNode.properties).find(([, v]) => isObject(v) && "const" in v);
  if (!pinned) return result;
  for (const key of strings(thenNode.required) ?? []) result.set(key, { key: pinned[0], equals: (pinned[1] as JsonSchema).const });
  return result;
}

/** Examples of a free-text field, flattened ("Primary", "Security", "Sales"). */
function examples(node: JsonSchema): string[] | undefined {
  if (!Array.isArray(node.examples)) return undefined;
  const flat = (node.examples as unknown[]).flatMap((e) => (Array.isArray(e) ? e : [e])).filter((e): e is string => typeof e === "string");
  return flat.length ? [...new Set(flat)] : undefined;
}

export function buildFormDefinition(schemas: VendoredSchemas = loadVendoredSchemas(), overlay: FormOverlay = loadFormOverlay()): FormDefinition {
  const resolver = new Resolver(schemas);
  const hidden = new Set(overlay.hidden ?? []);
  const optional = new Set(overlay.optional ?? []);
  const longText = new Set(overlay.longText ?? []);
  const labels: Record<string, string> = {};

  const whyOf = (p: string): string[] | undefined => {
    const lines = overlay.why?.[p];
    if (lines === undefined) return undefined;
    const list = (Array.isArray(lines) ? lines : [lines]).map((l) => l.trim()).filter((l) => l && l !== "—");
    return list.length ? list : undefined;
  };

  function field(key: string, raw: unknown, parentRoot: JsonSchema, p: string, required: boolean, requiredWhen?: { key: string; equals: unknown }): FormField | undefined {
    if (hidden.has(p)) return undefined;
    const { node, root } = resolver.resolve(raw, parentRoot);
    const label = overlay.labels?.[p] ?? str(node.title) ?? key;
    labels[p] = label;
    const base: FormField = {
      path: p,
      key,
      label,
      kind: "text",
      required: required && !optional.has(p),
      ...(requiredWhen ? { requiredWhen } : {}),
      ...(overlay.help?.[p] ? { help: overlay.help[p] } : {}),
      ...(overlay.notes?.[p] ? { note: overlay.notes[p] } : {}),
      ...(whyOf(p) ? { why: whyOf(p) } : {}),
      ...(overlay.placeholders?.[p] ? { placeholder: overlay.placeholders[p] } : {}),
    };

    if (p === overlay.logo) return { ...base, kind: "logo", required: true };

    const type = node.type;
    if (type === "object") {
      const children = objectFields(node, root, p);
      return { ...base, kind: "group", fields: children };
    }
    if (type === "array") {
      const items = resolver.resolve(node.items, root);
      if (items.node.type === "object") {
        const itemTitle = str(items.node.title);
        return { ...base, kind: "list", fields: objectFields(items.node, items.root, `${p}/*`), ...(itemTitle ? { itemLabel: itemTitle } : {}) };
      }
      const options = strings(items.node.enum);
      if (options) return { ...base, kind: "multiSelect", options };
      const suggestions = examples(node) ?? examples(items.node);
      return { ...base, kind: "stringList", ...(suggestions ? { suggestions } : {}) };
    }
    if (type === "boolean") return { ...base, kind: "boolean" };
    const options = strings(node.enum);
    if (options) return { ...base, kind: "select", options };
    const format = str(node.format);
    const kind: FieldKind = longText.has(p) ? "longText" : format === "uri" ? "url" : format === "email" ? "email" : format === "date" ? "date" : "text";
    const suggestions = examples(node);
    return {
      ...base,
      kind,
      ...(format === "uri" || format === "email" || format === "date" ? { format } : {}),
      ...(suggestions ? { suggestions } : {}),
    };
  }

  function objectFields(node: JsonSchema, root: JsonSchema, p: string): FormField[] {
    const required = new Set(strings(node.required) ?? []);
    const conditional = conditionalRequired(node);
    const properties = isObject(node.properties) ? node.properties : {};
    return Object.entries(properties)
      .map(([key, child]) => field(key, child, root, `${p}/${key}`, required.has(key), conditional.get(key)))
      .filter((f): f is FormField => f !== undefined);
  }

  const fields = objectFields(schemas.packageOverview, schemas.packageOverview, "");
  return {
    form: overlay.form,
    version: `${overlay.form}.v${overlay.revision}+po-${schemas.schemaVersion}`,
    schemaVersion: schemas.schemaVersion,
    schemaCommit: schemas.schemaCommit,
    fields,
    labels,
  };
}

let cached: FormDefinition | undefined;

/** The tab 1 definition, built once per process from the vendored schema (ADR-0005: cached per version). */
export function getCompanyFormDefinition(): FormDefinition {
  cached ??= buildFormDefinition();
  return cached;
}
