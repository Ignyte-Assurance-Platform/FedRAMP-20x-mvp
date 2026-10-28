import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { repoRoot } from "./schemas";

/**
 * Vendored FedRAMP consolidated rules (WI-005 E1, later read by WI-012). One folder per rules
 * version under rules/, each with the rules file, its JSON schema and a manifest.json (source,
 * commit, version, date taken, SHA-256 per file). Old folders are kept: Screen D renders a
 * customer's KSI statements from the version they answered under. Nothing is fetched at runtime,
 * and no version literal lives in code: the current version is the newest folder, and its
 * number is read from the rules file itself.
 */

export interface KsiRule {
  id: string;
  name: string;
  /** FedRAMP's statement exactly as written, slips included. */
  statement: string;
}

export interface VendoredRules {
  /** `.info.version` of the rules file. */
  version: string;
  /** FedRAMP/rules commit the files were taken from. */
  commit: string;
  ksis: Record<string, KsiRule>;
}

interface ManifestFile {
  role: "rules" | "schema";
  file: string;
  sha256: string;
}

interface Manifest {
  source: string;
  commit: string;
  version: string;
  takenAt: string;
  files: ManifestFile[];
}

export class RulesManifestError extends Error {
  override name = "RulesManifestError";
}

export const RULES_DIR = path.join(repoRoot(import.meta.dirname), "server", "fedramp", "rules");

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function readManifest(dir: string): Manifest {
  const file = path.join(dir, "manifest.json");
  if (!existsSync(file)) throw new RulesManifestError(`Refusing to start: ${file} is missing.`);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as Partial<Manifest>;
  if (typeof manifest.commit !== "string" || typeof manifest.version !== "string" || !Array.isArray(manifest.files)) {
    throw new RulesManifestError(`${file} must have a commit, a version and a files list`);
  }
  return manifest as Manifest;
}

function readChecked(dir: string, manifest: Manifest, role: ManifestFile["role"]): unknown {
  const entry = manifest.files.find((f) => f.role === role);
  if (!entry) throw new RulesManifestError(`${path.join(dir, "manifest.json")} has no ${role} entry`);
  const bytes = readFileSync(path.join(dir, entry.file));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) {
    throw new RulesManifestError(
      `Refusing to start: ${entry.file} (rules ${manifest.version}) does not match its SHA-256 in manifest.json (expected ${entry.sha256}, got ${actual}).`,
    );
  }
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

/** Reads, hashes and schema-validates one version folder. Throws RulesManifestError on any mismatch. */
export function loadRulesFolder(dir: string): VendoredRules {
  const manifest = readManifest(dir);
  const schema = readChecked(dir, manifest, "schema");
  const rules = readChecked(dir, manifest, "rules");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv, ["uri", "date"]);
  const validate = ajv.compile(schema as object);
  if (!validate(rules)) {
    const first = (validate.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || "/"} ${e.message}`);
    throw new RulesManifestError(`Refusing to start: rules ${manifest.version} do not match their schema: ${first.join("; ")}`);
  }
  const doc = rules as { info: { version: string }; KSI: Record<string, unknown> };
  if (doc.info.version !== manifest.version || path.basename(dir) !== manifest.version) {
    throw new RulesManifestError(`Refusing to start: folder ${path.basename(dir)}, manifest ${manifest.version} and rules ${doc.info.version} must name the same version.`);
  }
  const ksis: Record<string, KsiRule> = {};
  for (const family of Object.values(doc.KSI)) {
    const indicators = isRecord(family) && isRecord(family.indicators) ? family.indicators : {};
    for (const [id, indicator] of Object.entries(indicators)) {
      if (isRecord(indicator) && typeof indicator.name === "string" && typeof indicator.statement === "string") {
        ksis[id] = { id, name: indicator.name, statement: indicator.statement };
      }
    }
  }
  return { version: doc.info.version, commit: manifest.commit, ksis };
}

/** The vendored versions, oldest first (versions are YYYY.MM.DD.NN, so they sort as text). */
export function listRulesVersions(root: string = RULES_DIR): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();
}

export interface RulesLibrary {
  /** The newest vendored version: what the customer form shows and what a save stamps. */
  current: VendoredRules;
  /** A vendored version by number, or undefined when that folder is not in this build. */
  get(version: string): VendoredRules | undefined;
}

/** Loads and checks every vendored version. Throws RulesManifestError when any of them fails, or when there is none. */
export function loadRulesLibrary(root: string = RULES_DIR): RulesLibrary {
  const versions = listRulesVersions(root);
  if (versions.length === 0) throw new RulesManifestError(`Refusing to start: no vendored rules under ${root}.`);
  const byVersion = new Map(versions.map((version) => [version, loadRulesFolder(path.join(root, version))]));
  return { current: byVersion.get(versions.at(-1)!)!, get: (version) => byVersion.get(version) };
}

let library: RulesLibrary | undefined;
/**
 * Loaded once per process; start-up calls it so a bad file stops the app before it listens.
 * FEDRAMP_RULES_DIR points it at another root: tests only (a tampered copy, a fake newer version).
 */
export function getRulesLibrary(): RulesLibrary {
  library ??= loadRulesLibrary(process.env.FEDRAMP_RULES_DIR || RULES_DIR);
  return library;
}

/** Tests only: drop the loaded library so the next call reads FEDRAMP_RULES_DIR again. */
export function resetRulesLibraryForTests(): void {
  library = undefined;
}
