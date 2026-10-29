import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listRulesVersions, RULES_DIR } from "../rules";

/**
 * Test fixtures for the vendored rules (WI-005 2.17, 2.18), built in a temp folder from the real
 * files, never committed as a version: a copy of every real version, optionally a fake newer
 * one, optionally a tampered file. No version number is written here; the fake one is derived.
 */

export const FAKE_STATEMENT_PREFIX = "[fake newer rules] ";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export interface RulesFixture {
  root: string;
  real: string;
  /** Set when `newer` was asked. */
  fake?: string;
  cleanup(): void;
}

export function makeRulesRoot(options: { newer?: boolean; tamper?: "hash" | "schema" } = {}): RulesFixture {
  const root = mkdtempSync(path.join(tmpdir(), "rules-"));
  cpSync(RULES_DIR, root, { recursive: true });
  const real = listRulesVersions(root).at(-1)!;
  const realDir = path.join(root, real);
  const rulesFile = (dir: string) => path.join(dir, "fedramp-consolidated-rules.json");
  const rehash = (dir: string, version: string) => {
    const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { version: string; files: { file: string; sha256: string }[] };
    manifest.version = version;
    for (const f of manifest.files) f.sha256 = sha256(readFileSync(path.join(dir, f.file)));
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  };

  let fake: string | undefined;
  if (options.newer) {
    // One year later, same shape: sorts after the real version.
    fake = `${Number(real.slice(0, 4)) + 1}${real.slice(4)}`;
    const dir = path.join(root, fake);
    cpSync(realDir, dir, { recursive: true });
    const rules = JSON.parse(readFileSync(rulesFile(dir), "utf8")) as { info: { version: string }; KSI: Record<string, { indicators: Record<string, { statement: string }> }> };
    rules.info.version = fake;
    for (const family of Object.values(rules.KSI)) {
      for (const indicator of Object.values(family.indicators ?? {})) {
        if (typeof indicator.statement === "string") indicator.statement = FAKE_STATEMENT_PREFIX + indicator.statement;
      }
    }
    writeFileSync(rulesFile(dir), JSON.stringify(rules));
    rehash(dir, fake);
  }
  if (options.tamper === "hash") {
    writeFileSync(rulesFile(realDir), `${readFileSync(rulesFile(realDir), "utf8")} `);
  }
  if (options.tamper === "schema") {
    // Valid JSON with a matching hash, but not what the schema allows: the required info.title removed.
    const rules = JSON.parse(readFileSync(rulesFile(realDir), "utf8")) as { info: Record<string, unknown> };
    delete rules.info.title;
    writeFileSync(rulesFile(realDir), JSON.stringify(rules));
    rehash(realDir, real);
  }
  return { root, real, fake, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
