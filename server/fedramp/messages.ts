import type { ErrorObject } from "ajv";
import type { JsonSchema, VendoredSchemas } from "./schemas";

/**
 * Plain-language problems built from the vendored schema itself (WI-007 §3, decisions D3
 * and E2): the question name is the form label, else the schema `title`, else the field
 * path; the sentence depends only on the rule type. No per-field text lives here, so a
 * schema change updates the messages.
 */

export interface Problem {
  /** JSON pointer into the generated document, e.g. /contactInformation/1/contactPhone. */
  path: string;
  question: string;
  message: string;
  /** The validator's own message, kept for Ignyte's debugging, never shown. */
  raw: string;
}

/** Form labels by field path, with array indexes written as `*` (contactInformation, any item, contactPhone). */
export type FormLabels = Readonly<Record<string, string>>;

type Node = JsonSchema | undefined;

const isObject = (v: unknown): v is JsonSchema => typeof v === "object" && v !== null && !Array.isArray(v);

export class SchemaNavigator {
  private readonly roots = new Map<string, JsonSchema>();

  constructor(private readonly schemas: Pick<VendoredSchemas, "packageOverview" | "commonDefinitions">) {
    for (const root of [schemas.packageOverview, schemas.commonDefinitions]) {
      if (typeof root.$id === "string") this.roots.set(root.$id, root);
    }
  }

  /** Follows a JSON pointer fragment ("/$defs/repository/if") inside a root schema. */
  private walk(root: JsonSchema, fragment: string): Node {
    let node: unknown = root;
    for (const raw of fragment.split("/").filter(Boolean)) {
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      node = isObject(node) ? node[key] : Array.isArray(node) ? node[Number(key)] : undefined;
    }
    return isObject(node) ? node : undefined;
  }

  /** Resolves a schemaPath or $ref ("#/…" or "<schema id>#/…") from a given root. */
  at(ref: string, root: JsonSchema = this.schemas.packageOverview): { node: Node; root: JsonSchema } {
    const [base = "", fragment = ""] = ref.split("#");
    const target = base ? this.roots.get(base) : root;
    if (!target) return { node: undefined, root };
    return { node: this.walk(target, fragment), root: target };
  }

  private deref(node: Node, root: JsonSchema): { node: Node; root: JsonSchema } {
    let current = { node, root };
    while (current.node && typeof current.node.$ref === "string") current = this.at(current.node.$ref, current.root);
    return current;
  }

  /** The schema that describes the value at an instance path of the document. */
  fieldSchema(instancePath: string): Node {
    let current = this.deref(this.schemas.packageOverview, this.schemas.packageOverview);
    for (const segment of instancePath.split("/").filter(Boolean)) {
      const node = current.node;
      if (!node) return undefined;
      const next = /^\d+$/.test(segment)
        ? node.items
        : isObject(node.properties) ? node.properties[segment] : undefined;
      current = this.deref(isObject(next) ? next : undefined, current.root);
    }
    return current.node;
  }
}

const labelKey = (path: string): string => path.replace(/\/\d+(?=\/|$)/g, "/*");

function questionName(nav: SchemaNavigator, labels: FormLabels, path: string): string {
  const title = nav.fieldSchema(path)?.title;
  return labels[labelKey(path)] ?? (typeof title === "string" ? title : path || "/");
}

function describe(nav: SchemaNavigator, path: string): string {
  const description = nav.fieldSchema(path)?.description;
  return typeof description === "string" ? description : "";
}

/** "Authentication Required is true" from the `if` that triggered a `then` rule. */
function condition(nav: SchemaNavigator, schemaPath: string): string {
  const ifSchema = nav.at(schemaPath.replace(/\/then\/required$/, "/if")).node;
  const props = ifSchema && isObject(ifSchema.properties) ? ifSchema.properties : {};
  const parts = Object.entries(props).flatMap(([key, value]) =>
    isObject(value) && "const" in value ? [`${typeof value.title === "string" ? value.title : key} is ${String(value.const)}`] : [],
  );
  return parts.join(" and ") || "another answer requires it";
}

/** "with Contact Type "Sales"" from a `contains` subschema that pins a value. */
function containsDetail(schema: unknown): string {
  if (!isObject(schema) || !isObject(schema.properties)) return "";
  const pinned = Object.entries(schema.properties).find(([, v]) => isObject(v) && "const" in v);
  if (!pinned) return "";
  const [key, value] = pinned as [string, JsonSchema];
  return ` with ${typeof value.title === "string" ? value.title : key} "${String(value.const)}"`;
}

function toProblem(nav: SchemaNavigator, labels: FormLabels, error: ErrorObject): Problem | undefined {
  const raw = `${error.instancePath || "/"} ${error.message ?? error.keyword}`;
  const p = (path: string, message: string): Problem => ({ path: path || "/", question: questionName(nav, labels, path), message, raw });
  const params = error.params as Record<string, unknown>;

  switch (error.keyword) {
    case "if":
      return undefined; // the failing `then` rule is reported instead
    case "required": {
      const path = `${error.instancePath}/${String(params.missingProperty)}`;
      const name = questionName(nav, labels, path);
      return /\/then\/required$/.test(error.schemaPath)
        ? p(path, `${name} is required when ${condition(nav, error.schemaPath)}`)
        : p(path, `${name} is required`);
    }
    case "format":
    case "pattern": {
      const name = questionName(nav, labels, error.instancePath);
      const description = describe(nav, error.instancePath);
      return p(error.instancePath, `${name} is not in the expected format.${description ? ` ${description}` : ""}`);
    }
    case "enum":
      return p(error.instancePath, `${questionName(nav, labels, error.instancePath)} must be one of: ${(params.allowedValues as unknown[]).join(", ")}`);
    case "const":
      return p(error.instancePath, `${questionName(nav, labels, error.instancePath)} must be ${String(params.allowedValue)}`);
    case "minItems":
      return p(error.instancePath, `Add at least ${String(params.limit)} ${questionName(nav, labels, error.instancePath)}`);
    case "contains":
      return p(
        error.instancePath,
        `Add at least ${String(params.minContains ?? 1)} ${questionName(nav, labels, error.instancePath)}${containsDetail(error.schema)}`,
      );
    default: {
      const name = questionName(nav, labels, error.instancePath);
      const description = describe(nav, error.instancePath) || error.message || error.keyword;
      return p(error.instancePath, `${name} does not meet FedRAMP's rule: ${description}`);
    }
  }
}

export function problemsFromSchemaErrors(nav: SchemaNavigator, errors: ErrorObject[], labels: FormLabels = {}): Problem[] {
  const seen = new Set<string>();
  const problems: Problem[] = [];
  for (const error of errors) {
    // Inner failures of a `contains` check say only "this item is not the one"; the
    // `contains` error itself carries the message.
    if (/\/contains\//.test(error.schemaPath)) continue;
    const problem = toProblem(nav, labels, error);
    if (!problem) continue;
    const key = `${problem.path}\u0000${problem.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push(problem);
  }
  return problems;
}
