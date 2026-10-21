import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Vendored FedRAMP schemas (WI-007 §4, WI-012). They are read from this repo, checked
 * against schemas/manifest.json and never fetched at runtime. Versions come from the
 * schema files themselves (`$schemaVersion`) and the commit from the manifest, so no
 * version literal lives in code.
 */

export type JsonSchema = Record<string, unknown>;

export interface VendoredSchemas {
  packageOverview: JsonSchema;
  commonDefinitions: JsonSchema;
  /** `$schemaVersion` of the Package Overview schema, e.g. "0.2.0". */
  schemaVersion: string;
  /** FedRAMP/schemas commit the files were taken from. */
  schemaCommit: string;
}

interface ManifestFile {
  role: "package-overview" | "common-definitions";
  file: string;
  sha256: string;
}

interface Manifest {
  commit: string;
  files: ManifestFile[];
}

export class SchemaManifestError extends Error {
  override name = "SchemaManifestError";
}

export const SCHEMAS_DIR = path.join(import.meta.dirname, "schemas");

function readManifest(dir: string): Manifest {
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Partial<Manifest>;
  if (typeof manifest.commit !== "string" || !Array.isArray(manifest.files)) {
    throw new SchemaManifestError("schemas/manifest.json must have a commit and a files list");
  }
  return manifest as Manifest;
}

function readChecked(dir: string, entry: ManifestFile): JsonSchema {
  const bytes = readFileSync(path.join(dir, entry.file));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) {
    throw new SchemaManifestError(
      `Refusing to start: ${entry.file} does not match its SHA-256 in schemas/manifest.json (expected ${entry.sha256}, got ${actual}).`,
    );
  }
  return JSON.parse(bytes.toString("utf8")) as JsonSchema;
}

/** Reads and verifies the vendored schemas. Throws SchemaManifestError on any mismatch. */
export function loadVendoredSchemas(dir: string = SCHEMAS_DIR): VendoredSchemas {
  const manifest = readManifest(dir);
  const byRole = (role: ManifestFile["role"]): JsonSchema => {
    const entry = manifest.files.find((f) => f.role === role);
    if (!entry) throw new SchemaManifestError(`schemas/manifest.json has no ${role} entry`);
    return readChecked(dir, entry);
  };
  const packageOverview = byRole("package-overview");
  const commonDefinitions = byRole("common-definitions");
  const schemaVersion = packageOverview.$schemaVersion;
  if (typeof schemaVersion !== "string" || schemaVersion === "") {
    throw new SchemaManifestError("the Package Overview schema has no $schemaVersion");
  }
  return { packageOverview, commonDefinitions, schemaVersion, schemaCommit: manifest.commit };
}
