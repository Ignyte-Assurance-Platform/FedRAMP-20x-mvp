import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WI-010 §5: WHEN the app starts with NODE_ENV=production and DEV_LOGIN set THEN it refuses
 * to start with a clear error. Starts the real entry point (server/index.ts) in a child
 * process; the config check runs before anything connects to the database.
 */
const root = path.resolve(import.meta.dirname, "../..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
// Each start compiles server/index.ts in a fresh process: about 3 s, too close to vitest's 5 s default under a full run.
const SPAWN_TEST_TIMEOUT = 40_000;

function start(extraEnv: Record<string, string>) {
  return spawnSync(process.execPath, [tsx, "server/index.ts"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      DATABASE_URL: "postgres://nobody:nothing@127.0.0.1:1/none",
      BETTER_AUTH_SECRET: "x".repeat(32),
      ...extraEnv,
    },
  });
}

describe("production start-up guard", () => {
  it.each(["1", "0", ""])("refuses to start when DEV_LOGIN=%j in production", (value) => {
    const result = start({ NODE_ENV: "production", DEV_LOGIN: value });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to start: DEV_LOGIN is set while NODE_ENV=production");
  }, SPAWN_TEST_TIMEOUT);
});

describe("staff directory start-up guard (WI-019 2.10)", () => {
  // Everything else a production start needs, so the staff check is the one that stops it.
  const prod = {
    NODE_ENV: "production",
    STORAGE_DRIVER: "gcs",
    GCS_BUCKET: "maaz-docs",
    GCS_LOGO_BUCKET: "maaz-logos",
    LOGO_PUBLIC_BASE_URL: "https://logos.example.com/",
    INTAKE_LINK_KEY: Buffer.alloc(32, 7).toString("base64"),
  };

  it("refuses to start with STAFF_DIRECTORY=local in production", () => {
    const result = start({ ...prod, STAFF_DIRECTORY: "local", STAFF_GROUP_EMAIL: "ignytefedramp20x@ignyteplatform.com" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to start: STAFF_DIRECTORY must be google in production");
  }, SPAWN_TEST_TIMEOUT);

  it("refuses to start in production without STAFF_GROUP_EMAIL, or with one outside the allowed domain", () => {
    const missing = start({ ...prod, STAFF_DIRECTORY: "google" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Refusing to start: STAFF_GROUP_EMAIL must be set");
    const outside = start({ ...prod, STAFF_DIRECTORY: "google", STAFF_GROUP_EMAIL: "staff@gmail.com" });
    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain("STAFF_GROUP_EMAIL must end in @ignyteplatform.com");
  }, SPAWN_TEST_TIMEOUT * 2);
});

describe("vendored rules start-up guard (WI-005 2.18)", () => {
  it("refuses to start when FEDRAMP_RULES_DIR is set in production", () => {
    const result = start({ NODE_ENV: "production", FEDRAMP_RULES_DIR: root });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to start: FEDRAMP_RULES_DIR is set while NODE_ENV=production");
  }, SPAWN_TEST_TIMEOUT);

  it.each(["hash", "schema"] as const)("refuses to start when the rules file fails its %s check", async (tamper) => {
    const { makeRulesRoot } = await import("../../server/fedramp/testdata/rules-fixture");
    const fixture = makeRulesRoot({ tamper });
    try {
      const result = start({ NODE_ENV: "development", FEDRAMP_RULES_DIR: fixture.root, DEV_LOGIN: "1" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Refusing to start:");
      expect(result.stderr).toMatch(tamper === "hash" ? /does not match its SHA-256/ : /do not match their schema/);
    } finally {
      fixture.cleanup();
    }
  }, SPAWN_TEST_TIMEOUT);
});
