/**
 * Smoke test of the real Google callback (WI-002 2.2, 2.3; WI-019 2.1–2.4, 2.12): only Google's
 * token endpoint is stubbed; the state, the callback route, our getUserInfo, the staff group check
 * (local driver, LOCAL_STAFF_EMAILS below) and /login are the built app against the local Postgres.
 * Same setup as app.smoke.test.ts, with the Google client set. The dev user is not in the group here.
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
  STAFF_DIRECTORY: "local",
  LOCAL_STAFF_EMAILS: "member-smoke@ignyteplatform.com,inactive-smoke@ignyteplatform.com",
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

  it("2.2 (WI-019) refuses an Ignyte account outside the staff group with no session, no user and no account row", async () => {
    await deleteUser(ignyte.email); // a row left by an earlier run would hide a regression
    const res = await backFromGoogle(ignyte);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=not_authorized");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    expect(await rowsFor(ignyte.email)).toEqual({ user: undefined, accounts: 0, sessions: 0 });

    const login = await app.request("/login?error=not_authorized");
    expect(await login.text()).toContain("This account is not authorized for Ignyte FedRAMP 20x");
  });
});

/** The users, accounts and sessions rows of one email. */
async function rowsFor(email: string) {
  const { getDb, schema } = await import("~server/db");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) return { user: undefined, accounts: 0, sessions: 0 };
  const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, user.id));
  const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id));
  return { user, accounts: accounts.length, sessions: sessions.length, sessionRows: sessions };
}

async function insertUser(email: string, active: boolean) {
  const { getDb, schema } = await import("~server/db");
  await getDb().insert(schema.users).values({ id: crypto.randomUUID(), email, name: email, emailVerified: true, active });
}

async function deleteUser(email: string) {
  const { getDb, schema } = await import("~server/db");
  const { eq } = await import("drizzle-orm");
  await getDb().delete(schema.users).where(eq(schema.users.email, email));
}

describe("staff group check at sign-in (WI-019)", () => {
  const claims = (email: string, sub: string) => ({ hd: "ignyteplatform.com", email, email_verified: true, name: "Smoke Member", sub });
  const member = "member-smoke@ignyteplatform.com";
  const inactive = "inactive-smoke@ignyteplatform.com";
  const leaver = "leaver-smoke@ignyteplatform.com";

  afterEach(async () => {
    for (const email of [member, inactive, leaver]) await deleteUser(email);
  });

  it("2.1 creates an active staff user and an 8-hour session for a group member's first sign-in, and Screen B opens", async () => {
    await deleteUser(member);
    const res = await backFromGoogle(claims(member, "smoke-sub-member"));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!, "http://localhost:3000").pathname).toBe("/customers");
    const rows = await rowsFor(member);
    expect(rows.user?.active).toBe(true);
    expect(rows.user?.name).toBe("Smoke Member");
    expect(rows.accounts).toBe(1);
    expect(rows.sessions).toBe(1);
    const [session] = rows.sessionRows!;
    expect(session!.expiresAt.getTime() - session!.createdAt.getTime()).toBeCloseTo(8 * 60 * 60 * 1000, -4);

    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const screenB = await app.request("http://localhost:3000/customers", { headers: { cookie } });
    expect(screenB.status).toBe(200);
  });

  it("2.3 sets an existing active user who is no longer in the group inactive, with no session and no account row", async () => {
    await insertUser(leaver, true);
    const res = await backFromGoogle(claims(leaver, "smoke-sub-leaver"));
    expect(res.headers.get("location")).toBe("/login?error=not_authorized");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    const rows = await rowsFor(leaver);
    expect(rows.user?.active).toBe(false);
    expect(rows.accounts).toBe(0);
    expect(rows.sessions).toBe(0);
  });

  it("2.4 reactivates an existing inactive user who is in the group and creates their session", async () => {
    await insertUser(inactive, false);
    const res = await backFromGoogle(claims(inactive, "smoke-sub-inactive"));
    expect(new URL(res.headers.get("location")!, "http://localhost:3000").pathname).toBe("/customers");
    const rows = await rowsFor(inactive);
    expect(rows.user?.active).toBe(true);
    expect(rows.sessions).toBe(1);
  });

  it("2.12 refuses the dev sign-in when the dev user is not in LOCAL_STAFF_EMAILS", async () => {
    const res = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?error=not_authorized");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    const login = await app.request("/login?error=not_authorized");
    expect(await login.text()).toContain("This account is not authorized for Ignyte FedRAMP 20x");
  });
});
