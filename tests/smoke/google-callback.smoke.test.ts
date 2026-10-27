/**
 * Smoke test of the real Google callback (WI-002 2.2, 2.3): only Google's token endpoint is
 * stubbed; the state, the callback route, our getUserInfo, the allowlist and /login are the built
 * app against the local Postgres. Same setup as app.smoke.test.ts, with the Google client set.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Hono } from "hono";
import type { ServerBuild } from "react-router";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

Object.assign(process.env, {
  NODE_ENV: "development",
  DEV_LOGIN: "1",
  DEV_LOGIN_EMAIL: "dev@ignyteplatform.com",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://maaz:maaz@localhost:5432/maaz20x",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "smoke-test-secret-0123456789abcdef0123",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: path.join(root, ".data", "smoke-storage-google"),
  GOOGLE_CLIENT_ID: "smoke-client-id",
  GOOGLE_CLIENT_SECRET: "smoke-client-secret",
  GOOGLE_ALLOWED_DOMAIN: "ignyteplatform.com",
});

let app: Hono;
let closeDb: () => Promise<void>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const server = await import("~server/index");
  const build = (await import(pathToFileURL(path.join(root, "build/server/index.js")).href)) as ServerBuild;
  app = server.createApp({ mode: "production", getBuild: async () => build });
  closeDb = (await import("~server/db")).closeDb;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  await closeDb?.();
});

/** An ID token as Google's token endpoint returns it; the claims are what matters here, not the signature. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.signature`;
}

/** Google's token endpoint answering the code exchange with these ID token claims. */
function stubGoogleTokenEndpoint(claims: Record<string, unknown>): void {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://oauth2.googleapis.com/token")) return realFetch(input, init);
    return Response.json({ access_token: "smoke-access", refresh_token: "smoke-refresh", id_token: idToken(claims), token_type: "Bearer", expires_in: 3600, scope: "openid email profile" });
  };
}

/** Starts the sign-in on /login (state row + state cookie), then returns from Google with the given account. */
async function backFromGoogle(claims: Record<string, unknown>): Promise<Response> {
  const start = await app.request("http://localhost:3000/login", { method: "POST" });
  expect(start.status).toBe(303);
  const google = new URL(start.headers.get("location")!);
  expect(google.origin).toBe("https://accounts.google.com");
  expect(google.searchParams.get("hd")).toBe("ignyteplatform.com");
  const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  stubGoogleTokenEndpoint(claims);
  return app.request(`http://localhost:3000/api/auth/callback/google?code=smoke-code&state=${google.searchParams.get("state")}`, { headers: { cookie } });
}

describe("Google callback (WI-002 error states)", () => {
  const ignyte = { hd: "ignyteplatform.com", email: "nobody@ignyteplatform.com", email_verified: true, name: "Nobody", sub: "smoke-sub" };

  it("2.2 sends a Google account outside ignyteplatform.com back to /login as not authorized, with no session", async () => {
    const res = await backFromGoogle({ ...ignyte, hd: "gmail.com", email: "nobody@gmail.com" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=not_authorized");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);

    const login = await app.request("/login?error=not_authorized");
    expect(await login.text()).toContain("This account is not authorized for Ignyte FedRAMP 20x");
  });

  it("2.3 sends an Ignyte account that is not on the allowlist back to /login as not authorized, with no session", async () => {
    const res = await backFromGoogle(ignyte);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=signup_disabled");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);

    const login = await app.request("/login?error=signup_disabled");
    expect(await login.text()).toContain("This account is not authorized for Ignyte FedRAMP 20x");
  });
});
