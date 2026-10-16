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
  });
});
