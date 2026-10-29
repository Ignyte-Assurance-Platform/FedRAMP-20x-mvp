import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listRulesVersions, loadRulesFolder, loadRulesLibrary, RULES_DIR, RulesManifestError } from "./rules";
import { FAKE_STATEMENT_PREFIX, makeRulesRoot } from "./testdata/rules-fixture";

/** WI-005 E1, 2.2, 2.17, 2.18: the vendored consolidated rules and their loader. */

const CLASS_A = ["KSI-CED-RAT", "KSI-CMT-LMC", "KSI-CNA-RNT", "KSI-IAM-AAM", "KSI-IAM-APM", "KSI-INR-RIR", "KSI-SVC-SIN"];

/** What the file itself says, read without the loader. */
function rawRules(version: string) {
  return JSON.parse(readFileSync(path.join(RULES_DIR, version, "fedramp-consolidated-rules.json"), "utf8")) as {
    info: { version: string };
    KSI: Record<string, { indicators: Record<string, { name: string; statement: string }> }>;
  };
}

describe("vendored FedRAMP rules", () => {
  it("finds the rules from the repo root, so the server bundle under build/ reads the same files", () => {
    expect(RULES_DIR).toBe(path.resolve(import.meta.dirname, "rules"));
  });

  it("2.2 returns the version from .info.version and every Class A KSI's name and statement word for word", () => {
    const library = loadRulesLibrary();
    const version = listRulesVersions().at(-1)!;
    const raw = rawRules(version);
    expect(library.current.version).toBe(raw.info.version);
    expect(library.current.version).toBe(version);
    const family = (id: string) => raw.KSI[id.split("-")[1]!]!.indicators[id]!;
    for (const id of CLASS_A) {
      expect(library.current.ksis[id]).toEqual({ id, name: family(id).name, statement: family(id).statement });
    }
    // Shown as FedRAMP wrote it, slip included, never corrected.
    expect(library.current.ksis["KSI-IAM-APM"]!.statement).toMatch(/phishing-resistant MFA is used\.$/);
  });

  it("2.18 refuses a rules file that does not match its manifest hash", () => {
    const fixture = makeRulesRoot({ tamper: "hash" });
    try {
      expect(() => loadRulesLibrary(fixture.root)).toThrow(RulesManifestError);
      expect(() => loadRulesLibrary(fixture.root)).toThrow(/Refusing to start: fedramp-consolidated-rules\.json .* does not match its SHA-256/);
    } finally {
      fixture.cleanup();
    }
  });

  it("2.18 refuses a rules file whose hash matches but that does not match its schema", () => {
    const fixture = makeRulesRoot({ tamper: "schema" });
    try {
      expect(() => loadRulesFolder(path.join(fixture.root, fixture.real))).toThrow(/Refusing to start: rules .* do not match their schema: \/info must have required property 'title'/);
    } finally {
      fixture.cleanup();
    }
  });

  it("2.18 refuses a version folder without a manifest, instead of starting on the previous version", () => {
    const fixture = makeRulesRoot({ newer: true });
    try {
      rmSync(path.join(fixture.root, fixture.fake!, "manifest.json"));
      expect(listRulesVersions(fixture.root)).toContain(fixture.fake);
      expect(() => loadRulesLibrary(fixture.root)).toThrow(/Refusing to start: .*manifest.json is missing/);
    } finally {
      fixture.cleanup();
    }
  });

  it("2.18 refuses a manifest that is not valid JSON, or that names a missing file, with the start-up message", () => {
    const fixture = makeRulesRoot();
    const dir = path.join(fixture.root, fixture.real);
    try {
      const manifest = readFileSync(path.join(dir, "manifest.json"), "utf8");
      writeFileSync(path.join(dir, "manifest.json"), manifest.slice(0, -5));
      expect(() => loadRulesFolder(dir)).toThrow(RulesManifestError);
      expect(() => loadRulesFolder(dir)).toThrow(/Refusing to start: .*manifest.json is not valid JSON/);
      writeFileSync(path.join(dir, "manifest.json"), manifest);
      rmSync(path.join(dir, "fedramp-consolidated-rules.json"));
      expect(() => loadRulesFolder(dir)).toThrow(RulesManifestError);
      expect(() => loadRulesFolder(dir)).toThrow(/Refusing to start: .*fedramp-consolidated-rules.json is named in manifest.json but missing/);
    } finally {
      fixture.cleanup();
    }
  });

  it("2.18 refuses an empty rules folder", () => {
    const fixture = makeRulesRoot();
    try {
      expect(() => loadRulesLibrary(path.join(fixture.root, "nothing-here"))).toThrow(/no vendored rules/);
    } finally {
      fixture.cleanup();
    }
  });

  it("2.17 keeps every version folder: the newest is current, an older one is still readable", () => {
    const fixture = makeRulesRoot({ newer: true });
    try {
      const library = loadRulesLibrary(fixture.root);
      expect(library.current.version).toBe(fixture.fake);
      expect(library.get(fixture.real)!.ksis["KSI-CED-RAT"]!.statement).toBe(rawRules(fixture.real).KSI.CED!.indicators["KSI-CED-RAT"]!.statement);
      expect(library.current.ksis["KSI-CED-RAT"]!.statement.startsWith(FAKE_STATEMENT_PREFIX)).toBe(true);
      expect(library.get("1999.01.01.01")).toBeUndefined();
    } finally {
      fixture.cleanup();
    }
  });
});
