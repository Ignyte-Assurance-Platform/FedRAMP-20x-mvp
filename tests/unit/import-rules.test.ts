import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** ADR-0006 rules 2 and 8, as enforced by eslint.config.js (no-restricted-imports). */
const eslint = new ESLint({ cwd: process.cwd() });

async function importErrors(filePath: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${source}\nexport {};\n`, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

describe("server import rules", () => {
  it("lets a route module import a server module through its alias", async () => {
    expect(await importErrors("app/routes/customers/index.tsx", 'import { getDb } from "~server/db";')).toEqual([]);
    expect(await importErrors("app/routes/api/health.ts", 'import { schemas } from "~server/fedramp";')).toEqual([]);
  });

  it("fails a relative import into server/", async () => {
    const errors = await importErrors("app/routes/customers/index.tsx", 'import { getDb } from "../../../server/db";');
    expect(errors.join()).toMatch(/module alias/);
  });

  it("fails a deep import past a module's entry", async () => {
    const errors = await importErrors("app/routes/customers/index.tsx", 'import { createDb } from "~server/db/client";');
    expect(errors.join()).toMatch(/through its entry/);
  });

  it.each([
    "app/components/ui/button.tsx",
    "app/components/layout/app-shell.tsx",
    "app/hooks/use-autosave.ts",
    "app/lib/dates.ts",
    "app/routes/intake/components/progress.tsx",
  ])("fails any server import from browser code (%s)", async (file) => {
    const errors = await importErrors(file, 'import { getDocumentStore } from "~server/storage";');
    expect(errors.join()).toMatch(/never import server/);
  });

  it("fails a relative import from one server module into another", async () => {
    expect((await importErrors("server/services/x.ts", 'import { getDb } from "../db";')).join()).toMatch(/~server/);
    expect((await importErrors("server/storage/local/x.ts", 'import { getDb } from "../../db";')).join()).toMatch(/~server/);
  });

  it("allows relative imports inside one server module", async () => {
    expect(await importErrors("server/storage/local/x.ts", 'import { assertObjectPath } from "../paths";')).toEqual([]);
    expect(await importErrors("server/db/index.ts", 'import { createDb } from "./client";')).toEqual([]);
  });
});
