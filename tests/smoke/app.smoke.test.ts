/**
 * Smoke test: boots the real app (server/index.ts createApp + the production build) against
 * the local Postgres, migrated and seeded. Run `npm run build`, `npm run db:up`, then
 * `npm run test:smoke`. CI does the same with a Postgres service container.
 */
import { access, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Hono } from "hono";
import type { ServerBuild } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const storageDir = path.join(root, ".data", "smoke-storage");
const logoDir = path.join(root, ".data", "smoke-logos");

Object.assign(process.env, {
  NODE_ENV: "development",
  DEV_LOGIN: "1",
  DEV_LOGIN_EMAIL: "dev@ignyteplatform.com",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://maaz:maaz@localhost:5432/maaz20x",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "smoke-test-secret-0123456789abcdef0123",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: storageDir,
  LOCAL_LOGO_DIR: logoDir,
});

let app: Hono;
let build: ServerBuild;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
  await rm(logoDir, { recursive: true, force: true });
  const server = await import("~server/index");
  build = (await import(pathToFileURL(path.join(root, "build/server/index.js")).href)) as ServerBuild;
  app = server.createApp({ mode: "production", getBuild: async () => build });
  closeDb = (await import("~server/db")).closeDb;
});

afterAll(async () => {
  await closeDb?.();
});

describe("app against the local database", () => {
  it("reports a healthy database", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves built assets with the immutable cache header", async () => {
    const assets = await readdir(path.join(root, "build/client/assets"));
    const js = assets.find((f) => f.endsWith(".js"));
    expect(js).toBeDefined();
    const res = await app.request(`/assets/${js}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("redirects an anonymous visitor to the login page, which offers the dev sign-in", async () => {
    const home = await app.request("/");
    expect(home.status).toBe(302);
    expect(home.headers.get("location")).toBe("/login");

    const login = await app.request("/login");
    expect(login.status).toBe(200);
    expect(login.headers.get("cache-control")).toBe("no-store");
    expect(await login.text()).toContain("Dev sign-in (local only)");
  });

  it("WI-016 2.1, 2.2 behind a TLS-ending proxy, a same-origin action runs and a foreign one is still refused", async () => {
    const server = await import("~server/index");
    const behindProxy = server.createApp({ mode: "production", getBuild: async () => build, publicOrigin: "https://app.example.test" });
    // What Cloud Run's container sees: http on the public host, while the browser sends an https Origin.
    const post = (origin: string) =>
      behindProxy.request("http://app.example.test/login", {
        method: "POST",
        headers: { origin, "content-type": "application/x-www-form-urlencoded" },
        body: "",
      });

    const same = await post("https://app.example.test");
    expect(await same.text()).toContain("Google sign-in is not configured yet."); // the action ran

    const foreign = await post("https://evil.example");
    expect(foreign.status).toBe(400);
    expect(await foreign.text()).toBe("Bad Request"); // React Router's CSRF refusal
  });

  it("signs in without Google and shows a no-store page with the user's data", async () => {
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    expect(signIn.status).toBe(303);
    const cookies = signIn.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("session_token"))).toBe(true);

    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const home = await app.request("/", { headers: { cookie } });
    expect(home.status).toBe(302);
    expect(home.headers.get("location")).toBe("/customers");
    const list = await app.request("/customers", { headers: { cookie } });
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(await list.text()).toContain("dev@ignyteplatform.com");

    const data = await app.request("/_root.data", { headers: { cookie } });
    expect(data.headers.get("cache-control")).toBe("no-store");
  });

  it("generates, stores and downloads a Package Overview file (WI-007), stamped with the vendored rules version (WI-005 2.19)", async () => {
    const services = await import("~server/services");
    const { getDb, schema } = await import("~server/db");
    const goldenAnswers = (await import("../../server/fedramp/testdata/golden-answers.json")).default;
    const db = getDb();
    const [customer] = await db.select().from(schema.customers).limit(1);
    const [user] = await db.select().from(schema.users).limit(1);
    expect(customer && user, "seed missing: run npm run db:seed").toBeTruthy();

    const logoBaseUrl = "https://logos.example.test/";
    const deps = {
      db,
      generator: services.getPackageOverviewGenerator(),
      logoBaseUrl,
      fetch: async () => new Response("png", { status: 200, headers: { "content-type": "image/png" } }),
      now: () => new Date("2026-10-21T15:00:00Z"),
    };
    await services.savePackageOverviewInputs(
      { customerId: customer!.id, assessorName: "Example Assessor LLC", assessorId: "000123", advisorName: "Ignyte" },
      deps,
    );
    const request = {
      customerId: customer!.id,
      userId: user!.id,
      answers: goldenAnswers,
      answersUpdatedAt: new Date("2026-10-21T14:00:00Z"),
      logoUrl: `${logoBaseUrl}customers/${customer!.id}/logo/logo.png`,
    };

    const draft = await services.generatePackageOverview(request, deps);
    expect(draft.file.valid).toBe(false);
    expect(draft.file.fileName).toBe("ERP-package-overview-DRAFT.json");
    expect(draft.problems.map((p) => p.message)).toEqual(["Assessor Name has not been confirmed on the FedRAMP Marketplace"]);

    await services.setAssessorConfirmed(customer!.id, true, user!.id, deps);
    const passing = await services.generatePackageOverview(request, deps);
    expect(passing.file).toMatchObject({ valid: true, fileName: "ERP-package-overview.json", schemaVersion: deps.generator.schemaVersion });
    // WI-005 2.19: the vendored rules version, read from the loader, never null and never a literal.
    const { getRulesLibrary } = await import("~server/fedramp");
    expect(passing.file.rulesVersion).toBe(getRulesLibrary().current.version);
    expect(draft.file.rulesVersion).toBe(getRulesLibrary().current.version);

    const status = await services.getPackageOverviewStatus(customer!.id, new Date("2026-10-21T16:00:00Z"), deps);
    expect(status).toMatchObject({ downloadLabel: "Download", answersChanged: true, regenerate: undefined });
    const download = await services.downloadPackageOverview(customer!.id, deps);
    expect(download).toEqual({ fileName: "ERP-package-overview.json", body: passing.file.json });

    // A changed assessor ID clears the confirmation tick.
    await services.savePackageOverviewInputs(
      { customerId: customer!.id, assessorName: "Example Assessor LLC", assessorId: "000124", advisorName: "Ignyte" },
      deps,
    );
    const [after] = await db.select().from(schema.customers).where((await import("drizzle-orm")).eq(schema.customers.id, customer!.id));
    expect(after?.assessorConfirmedAt).toBeNull();
  });
});

describe("Screen D routes (WI-007 §6, §3)", () => {
  async function seedCustomerId(): Promise<string> {
    const { getDb, schema } = await import("~server/db");
    const [customer] = await getDb().select().from(schema.customers).limit(1);
    expect(customer, "seeded customer missing: run npm run db:seed").toBeDefined();
    return customer!.id;
  }

  async function staffCookie(): Promise<string> {
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    return signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }

  it("refuses the page and the download without a staff session, even with a customer link token", async () => {
    const customerId = await seedCustomerId();
    const page = await app.request(`/customers/${customerId}/package?token=link-abc`, {
      headers: { authorization: "Bearer link-abc" },
    });
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/login");

    const download = await app.request(`/api/customers/${customerId}/package-overview/download?token=link-abc`, {
      headers: { authorization: "Bearer link-abc" },
    });
    expect(download.status).toBe(401);
  });

  it("shows the answers, generates a draft with its problems and downloads it under the DRAFT name", async () => {
    const customerId = await seedCustomerId();
    const cookie = await staffCookie();
    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    const { TAB1_SECTION, savePackageOverviewInputs, setAssessorConfirmed } = await import("~server/services");
    const goldenAnswers = (await import("../../server/fedramp/testdata/golden-answers.json")).default;

    const current = await intakeAnswersRepo.findIntakeSection(getDb(), customerId, TAB1_SECTION);
    await intakeAnswersRepo.saveIntakeSection(getDb(), {
      customerId,
      section: TAB1_SECTION,
      formDefinitionVersion: "test",
      answers: goldenAnswers,
      expectedVersion: current?.version ?? 0,
    });
    // An assessor typed but not confirmed, and no hosted logo: both make the file a draft.
    await savePackageOverviewInputs({ customerId, assessorName: "Example Assessor LLC", assessorId: "000123", advisorName: "Ignyte" });
    await setAssessorConfirmed(customerId, false, "smoke");

    const page = await app.request(`/customers/${customerId}/package`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text();
    expect(html).toContain("Example Records Platform");
    expect(html).toContain("Assessor Confirmed on FedRAMP Marketplace");
    expect(html).toMatch(/Generate JSON|Regenerate JSON/);

    const generated = await app.request(`http://localhost:3000/customers/${customerId}/package`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: "intent=generate",
    });
    expect(generated.status).toBe(200);
    const result = await generated.text();
    expect(result).toContain("ERP-package-overview-DRAFT.json");
    expect(result).toContain("Download draft");
    expect(result).toContain("has not been confirmed on the FedRAMP Marketplace");
    expect(result).not.toContain("Publishing checklist");

    const download = await app.request(`/api/customers/${customerId}/package-overview/download`, { headers: { cookie } });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(download.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''ERP-package-overview-DRAFT.json");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await download.json()) as { serviceIdentification: { serviceAcronym: string } };
    expect(body.serviceIdentification.serviceAcronym).toBe("ERP");
  });
});

describe("Screen A, the staff guard (WI-002)", () => {
  async function signIn(): Promise<string> {
    const res = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    expect(res.status).toBe(303);
    return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }

  async function devUser() {
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, "dev@ignyteplatform.com"));
    expect(user, "dev user missing: run npm run db:seed").toBeDefined();
    const setActive = (active: boolean) => db.update(schema.users).set({ active }).where(eq(schema.users.id, user!.id));
    const sessionCount = async () => (await db.select().from(schema.sessions).where(eq(schema.sessions.userId, user!.id))).length;
    return { setActive, sessionCount };
  }

  it("2.5 does not send token routes to /login (intake links need no session)", async () => {
    const upload = await app.request("/api/uploads/not-a-real-token");
    expect(upload.status).not.toBe(302);
    expect(upload.headers.get("location")).toBeNull();
  });

  it("2.7, 2.11 refuses every staff route for a user set inactive, deletes the sessions and says not authorized", async () => {
    const cookie = await signIn();
    const { setActive, sessionCount } = await devUser();
    const { getDb, schema } = await import("~server/db");
    const [customer] = await getDb().select().from(schema.customers).limit(1);
    try {
      await setActive(false);
      const home = await app.request("/", { headers: { cookie } });
      expect(home.status).toBe(302);
      expect(home.headers.get("location")).toBe("/login?error=not_authorized");
      expect(await sessionCount()).toBe(0);

      const login = await app.request("/login?error=not_authorized");
      expect(await login.text()).toContain("This account is not authorized for Ignyte FedRAMP 20x");

      const page = await app.request(`/customers/${customer!.id}/package`, { headers: { cookie } });
      expect(page.status).toBe(302);
      const download = await app.request(`/api/customers/${customer!.id}/package-overview/download`, { headers: { cookie } });
      expect(download.status).toBe(401);

      // The dev sign-in goes through the same check.
      const again = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
      expect(again.headers.get("location")).toBe("/login?error=not_authorized");
      expect(again.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    } finally {
      await setActive(true);
    }
  });

  it("2.12 (WI-019) opens Screen B for the dev user listed in LOCAL_STAFF_EMAILS (default DEV_LOGIN_EMAIL)", async () => {
    const cookie = await signIn();
    const screenB = await app.request("http://localhost:3000/customers", { headers: { cookie } });
    expect(screenB.status).toBe(200);
  });

  it("2.8 (WI-019) gives the group re-check to exactly one of several requests of a session, and gives it back", async () => {
    const cookie = await signIn();
    const { getDb, schema } = await import("~server/db");
    const { sessionsRepo } = await import("~server/repositories");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const token = decodeURIComponent(cookie.match(/session_token=([^;.]+)/)![1]!);
    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.token, token));
    expect(row, "session row of the dev sign-in").toBeDefined();
    // A sign-in has just checked the group: the first re-check is due 5 minutes later.
    expect(Date.now() - row!.lastGroupCheckAt.getTime()).toBeLessThan(60_000);
    expect(await sessionsRepo.claimGroupCheck(db, row!.id, new Date())).toBe(false);

    const previous = new Date(Date.now() - 6 * 60_000);
    await db.update(schema.sessions).set({ lastGroupCheckAt: previous }).where(eq(schema.sessions.id, row!.id));
    const now = new Date();
    const claims = await Promise.all([1, 2, 3, 4].map(() => sessionsRepo.claimGroupCheck(db, row!.id, now)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    await sessionsRepo.releaseGroupCheck(db, row!.id, now, previous);
    const [released] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, row!.id));
    expect(released!.lastGroupCheckAt).toEqual(previous);

    // The guard then re-checks on the next request; the dev user is a member, so the session goes on.
    const home = await app.request("http://localhost:3000/customers", { headers: { cookie } });
    expect(home.status).toBe(200);
    const [checked] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, row!.id));
    expect(checked!.lastGroupCheckAt.getTime()).toBeGreaterThan(previous.getTime());
  });

  it("2.11 (WI-019) text check: the Dockerfile CMD runs the migrations, then the app, and no script seeds an allowlist", async () => {
    const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
    expect(dockerfile).toContain(`CMD ["sh", "-c", "npm run db:migrate && exec npm start"]`);
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(Object.keys(pkg.scripts).filter((name) => name.includes("allowlist"))).toEqual([]);
  });

  it("2.12 logs out: the session row is deleted and /login opens", async () => {
    const cookie = await signIn();
    const { sessionCount } = await devUser();
    const before = await sessionCount();
    const res = await app.request("http://localhost:3000/logout", { method: "POST", headers: { cookie } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(await sessionCount()).toBe(before - 1);
    const home = await app.request("/", { headers: { cookie } });
    expect(home.headers.get("location")).toBe("/login");
  });
});

describe("Screens B and C, the intake link (WI-003)", () => {
  async function staff(): Promise<{ cookie: string; userId: string }> {
    const res = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, "dev@ignyteplatform.com"));
    return { cookie, userId: user!.id };
  }

  async function row(id: string) {
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const [customer] = await getDb().select().from(schema.customers).where(eq(schema.customers.id, id));
    return customer!;
  }

  const form = (fields: Record<string, string>) => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

  async function create(cookie: string, name: string): Promise<{ id: string; token: string }> {
    const res = await app.request("http://localhost:3000/customers/new", {
      ...form({ name, serviceName: "Smoke Service", contactName: "Pat Smoke", contactEmail: "pat@smoke.example" }),
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    const token = /\/intake\/([A-Za-z0-9_-]{32})/.exec(html)?.[1];
    const id = /\/customers\/([0-9a-f-]{36})\/package/.exec(html)?.[1];
    expect(token && id, "the created page shows the link and the customer page").toBeTruthy();
    return { id: id!, token: token! };
  }

  it("2.1, 2.17 Save creates a Not started customer with a 32-character link; the database holds only its hash and encrypted copy", async () => {
    const { cookie, userId } = await staff();
    const { id, token } = await create(cookie, `Smoke Co ${Date.now()}`);
    const saved = await row(id);
    expect(saved.status).toBe("not_started");
    expect(Object.values(saved)).not.toContain(token);
    const { hashIntakeToken } = await import("~server/services");
    expect(saved.intakeTokenHash).toBe(hashIntakeToken(token));
    expect(saved.intakeTokenEncrypted).toBeTruthy();
    expect(saved.intakeTokenIssuedBy).toBe(userId);
    expect(saved.intakeTokenExpiresAt!.getTime() - saved.intakeTokenIssuedAt!.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("2.3 blocks Save with an empty required field and marks it, keeping what was typed", async () => {
    const { cookie } = await staff();
    const res = await app.request("http://localhost:3000/customers/new", {
      ...form({ name: "Typed Co", serviceName: "", contactName: "Pat", contactEmail: "pat@smoke.example" }),
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Service name is required.");
    expect(html).toMatch(/id="serviceName"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="serviceName"/);
    expect(html).toContain('value="Typed Co"');
  });

  it("2.2, 2.19 the list shows every customer with status and link, and a row reaches Screen D", async () => {
    const { cookie } = await staff();
    const name = `Listed Co ${Date.now()}`;
    const { id, token } = await create(cookie, name);
    const list = await app.request("/customers", { headers: { cookie } });
    expect(list.status).toBe(200);
    const html = await list.text();
    expect(html).toContain(name);
    expect(html).toContain("Not started");
    expect(html).toContain(`/intake/${token}`);
    const href = `/customers/${id}/package`;
    expect(html).toContain(`href="${href}"`);
    const screenD = await app.request(href, { headers: { cookie } });
    expect(screenD.status).toBe(200);
    expect(await screenD.text()).toContain("Intake link");
  });

  it("2.14 answers 404 for an unknown customer id", async () => {
    const { cookie } = await staff();
    const res = await app.request("/customers/00000000-0000-4000-8000-000000000000/package", { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("2.4, 2.5, 2.6 first save → In progress, Submit → Submitted and read-only, Unlock → In progress with who and when", async () => {
    const { cookie, userId } = await staff();
    const { id, token } = await create(cookie, `Status Co ${Date.now()}`);
    const services = await import("~server/services");
    await services.markIntakeStarted(id);
    expect((await row(id)).status).toBe("in_progress");
    await services.submitIntake(id);
    expect((await row(id)).status).toBe("submitted");
    const access = await services.resolveIntakeToken(token);
    expect(access).toMatchObject({ ok: true, locked: true });

    const unlock = await app.request(`http://localhost:3000/customers/${id}/package`, {
      ...form({ intent: "unlock" }),
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(unlock.status).toBe(200);
    const after = await row(id);
    expect(after.status).toBe("in_progress");
    expect(after.unlockedBy).toBe(userId);
    expect(after.unlockedAt).toBeInstanceOf(Date);
    expect(await services.resolveIntakeToken(token)).toMatchObject({ ok: true, locked: false });
  });

  it("2.9, 2.10, 2.12 Issue new link: old link refused at once, new one works, status, lock and answers untouched", async () => {
    const { cookie } = await staff();
    const { id, token } = await create(cookie, `Reissue Co ${Date.now()}`);
    const services = await import("~server/services");
    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    await intakeAnswersRepo.saveIntakeSection(getDb(), { customerId: id, section: "company", formDefinitionVersion: "test", answers: { a: 1 }, expectedVersion: 0 });
    await services.submitIntake(id);

    const res = await app.request(`http://localhost:3000/customers/${id}/package`, {
      ...form({ intent: "issue-link" }),
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(200);
    expect(await services.resolveIntakeToken(token)).toEqual({ ok: false, message: services.INTAKE_LINK_EXPIRED_MESSAGE });

    const after = await row(id);
    expect(after.status).toBe("submitted");
    const section = await services.getIntakeLinkSection(id);
    const fresh = /\/intake\/([A-Za-z0-9_-]{32})$/.exec(section.link.url!)?.[1];
    expect(fresh).not.toBe(token);
    expect(await services.resolveIntakeToken(fresh!)).toMatchObject({ ok: true, locked: true });
    const answers = await intakeAnswersRepo.findIntakeSection(getDb(), id, "company");
    expect(answers?.answers).toEqual({ a: 1 });
  });

  it("2.8, 2.13 an expired link is refused with the expired message and shows Expired in the list and on Screen D", async () => {
    const { cookie } = await staff();
    const name = `Expired Co ${Date.now()}`;
    const { id, token } = await create(cookie, name);
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    await getDb().update(schema.customers).set({ intakeTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.customers.id, id));
    const services = await import("~server/services");
    expect(await services.resolveIntakeToken(token)).toEqual({ ok: false, message: "This link has expired. Ask your Ignyte consultant for a new one." });
    const screenD = await (await app.request(`/customers/${id}/package`, { headers: { cookie } })).text();
    expect(screenD).toContain("Link expired — issue a new link");
    expect(screenD).not.toContain(`/intake/${token}`);
  });

  it("2.15 shows Regenerate when the latest Package Overview file used an older schema version", async () => {
    const { cookie } = await staff();
    const name = `Old Schema Co ${Date.now()}`;
    const { id } = await create(cookie, name);
    const { getDb, schema } = await import("~server/db");
    await getDb().insert(schema.packageOverviewFiles).values({
      customerId: id,
      schemaVersion: "0.0.1",
      schemaCommit: "old",
      valid: true,
      fileName: "OLD-package-overview.json",
      json: "{}",
    });
    const html = await (await app.request("/customers", { headers: { cookie } })).text();
    const rowHtml = html.slice(html.indexOf(name), html.indexOf(name) + 400);
    expect(rowHtml).toContain("Regenerate");
  });
});

describe("Screen E tab 1, the customer's intake (WI-004)", () => {
  const PNG_300 = (() => {
    // A real 300×1 PNG header is enough for the signature check; the width is checked in the browser.
    const bytes = Buffer.alloc(64);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
    return bytes;
  })();

  async function newCustomer(name = `Intake Co ${Date.now()}`) {
    const services = await import("~server/services");
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, "dev@ignyteplatform.com"));
    const { customer, link } = await services.createCustomer(
      { name, serviceName: "Example Records Platform", serviceDescription: "Records management.", contactName: "Pat", contactEmail: "pat@example.com" },
      user!.id,
    );
    const token = link.split("/intake/")[1]!;
    return { id: customer.id, token, userId: user!.id };
  }

  const api = (token: string, body: Record<string, unknown>) =>
    app.request(`http://localhost:3000/api/intake/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function customerRow(id: string) {
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await getDb().select().from(schema.customers).where(eq(schema.customers.id, id));
    return row!;
  }

  async function uploadLogo(token: string, bytes: Buffer, contentType = "image/png") {
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType, size: bytes.length, width: 300 });
    expect(start.status).toBe(200);
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    const put = await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(bytes) });
    expect(put.status).toBe(200);
    return api(token, { intent: "logo-finish", logoId, filename: "logo.png", contentType });
  }

  it("2.1, 2.27 opens without a session, header and prefill from Screen C, no-store and no-referrer", async () => {
    const { token } = await newCustomer("Prefill Co");
    const page = await app.request(`/intake/${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await page.text();
    expect(html).toContain("Prefill Co</h1>");
    expect(html).toContain('value="Prefill Co"');
    expect(html).toContain('value="Example Records Platform"');
    expect(html).toContain("Records management.");
  });

  it("2.24 a staff session grants nothing on an unknown token: only the expired message", async () => {
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const page = await app.request(`/intake/${"x".repeat(32)}`, { headers: { cookie } });
    expect(page.status).toBe(410);
    const html = await page.text();
    expect(html).toContain("This link has expired. Ask your Ignyte consultant for a new one.");
    expect(html).not.toContain("Provider Name");
  });

  it("2.5, 2.6, 2.14, 2.22 Save stores the object with its form definition version and a bumped version, sets In progress and Class A, drops Ignyte-owned fields", async () => {
    const { id, token } = await newCustomer();
    const { getCompanyFormDefinition } = await import("~server/fedramp");
    const answers = {
      serviceIdentification: { providerName: "Saved Co.", serviceAcronym: "SVC", certificationType: "20x", logo: "https://evil.example/x.png" },
      assessor: { name: "Not me", assessorID: "000001" },
    };
    const first = await api(token, { intent: "save", answers, version: 0 });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ kind: "saved", version: 1 });
    const second = await api(token, { intent: "save", answers, version: 1 });
    expect(await second.json()).toMatchObject({ kind: "saved", version: 2 });

    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    const row = await intakeAnswersRepo.findIntakeSection(getDb(), id, "company");
    expect(row?.formDefinitionVersion).toBe(getCompanyFormDefinition().version);
    expect(row?.answers).toEqual({ serviceIdentification: { providerName: "Saved Co.", serviceAcronym: "SVC", certificationType: "20x" } });
    const customer = await customerRow(id);
    expect(customer.status).toBe("in_progress");
    expect(customer.fedrampClass).toBe("A");

    const reopened = await (await app.request(`/intake/${token}`)).text();
    expect(reopened).toContain('value="Saved Co."');
    expect(reopened).toContain('value="SVC"');
  });

  it("2.20 a save with an older version gets a conflict with the stored answers, and stores nothing", async () => {
    const { id, token } = await newCustomer();
    await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "Window A" } }, version: 0 });
    const stale = await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "Window B" } }, version: 0 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ kind: "conflict", version: 1, answers: { serviceIdentification: { providerName: "Window A" } } });
    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    expect((await intakeAnswersRepo.findIntakeSection(getDb(), id, "company"))?.answers).toEqual({ serviceIdentification: { providerName: "Window A" } });
    // Keep mine: save again on top of the stored version.
    const keep = await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "Window B" } }, version: 1 });
    expect(await keep.json()).toMatchObject({ kind: "saved", version: 2 });
  });

  it("a save with a version the section never had is refused with reload, not a 500", async () => {
    const { token } = await newCustomer();
    const res = await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "Crafted" } }, version: 5 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ kind: "refused", message: "This page is out of date. Reload it and try again." });
  });

  it("refuses a request body over 512 KB with 413 and stores nothing", async () => {
    const { id, token } = await newCustomer();
    const res = await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "x".repeat(600 * 1024) } }, version: 0 });
    expect(res.status).toBe(413);
    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    expect(await intakeAnswersRepo.findIntakeSection(getDb(), id, "company")).toBeUndefined();
  });

  it("2.17 the first autosave, 2 s after typing stops, moves the customer from Not started to In progress", async () => {
    const { id, token } = await newCustomer();
    expect((await customerRow(id)).status).toBe("not_started");
    const { createIntakeSaver } = await import("../../app/routes/intake/components/intake-saver");
    let saved!: () => void;
    const autosaved = new Promise<void>((resolve) => (saved = resolve));
    const posted: Array<Record<string, unknown>> = [];
    const saver = createIntakeSaver({
      // The same request Screen E sends, against the real API.
      post: async (body) => {
        posted.push(body);
        const res = await api(token, body);
        return { status: res.status, data: (await res.json()) as Record<string, unknown> };
      },
      answers: {},
      version: 0,
      delayMs: 2000,
      onState: (state) => state.kind === "saved" && saved(),
      onConflict: () => undefined,
    });
    const typedAt = Date.now();
    saver.changed({ serviceIdentification: { providerName: "Autosaved Co." } });
    await autosaved;
    expect(Date.now() - typedAt).toBeGreaterThanOrEqual(1990);
    expect(posted).toEqual([{ intent: "save", answers: { serviceIdentification: { providerName: "Autosaved Co." } }, version: 0 }]);
    expect((await customerRow(id)).status).toBe("in_progress");
    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    expect((await intakeAnswersRepo.findIntakeSection(getDb(), id, "company"))?.answers).toEqual({ serviceIdentification: { providerName: "Autosaved Co." } });
  });

  it("a repeated logo-finish (double click, retry) answers the logo already recorded and adds no row", async () => {
    const { id, token } = await newCustomer();
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: PNG_300.length, width: 300 });
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(PNG_300) });
    const finish = () => api(token, { intent: "logo-finish", logoId, filename: "logo.png", contentType: "image/png" });
    const first = await finish();
    const again = await finish();
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { logo: { documentId: string } }).logo.documentId).toBe(logoId);
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    expect(await getDb().select().from(schema.documents).where(eq(schema.documents.customerId, id))).toHaveLength(1);
  });

  it("two logo-finishes at the same time both answer the one recorded logo, which stays public (IGN-21)", async () => {
    const { id, token } = await newCustomer();
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: PNG_300.length, width: 300 });
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(PNG_300) });

    const services = await import("~server/services");
    const { getDb, schema } = await import("~server/db");
    const { getDocumentStore, getLogoPublisher } = await import("~server/storage");
    const fedramp = await import("~server/fedramp");
    // Each publish waits until both finishes reach it, so both have found no row before either
    // inserts: the second insert collides on the primary key, as a double click can.
    const logos = getLogoPublisher();
    let arrived = 0;
    let bothArrived!: () => void;
    const barrier = new Promise<void>((resolve) => (bothArrived = resolve));
    const racing = {
      isPublished: (objectPath: string) => logos.isPublished(objectPath),
      unpublish: (objectPath: string) => logos.unpublish(objectPath),
      publish: async (objectPath: string, contentType: string) => {
        if (++arrived === 2) bothArrived();
        await barrier;
        return logos.publish(objectPath, contentType);
      },
    };
    const deps = { db: getDb(), store: getDocumentStore(), logos: racing, logoBaseUrl: undefined, now: () => new Date(), definition: fedramp.getCompanyFormDefinition(), checker: fedramp.createTab1Checker() };
    const finish = () => services.finishLogoUpload(token, { logoId, filename: "logo.png", contentType: "image/png" }, deps);
    const outcomes = await Promise.all([finish(), finish()]);
    expect(arrived).toBe(2);
    expect(outcomes).toEqual([expect.objectContaining({ kind: "stored", logo: expect.objectContaining({ documentId: logoId }) }), expect.objectContaining({ kind: "stored", logo: expect.objectContaining({ documentId: logoId }) })]);

    const { eq } = await import("drizzle-orm");
    expect(await getDb().select().from(schema.documents).where(eq(schema.documents.customerId, id))).toHaveLength(1);
    // The losing finish neither unpublished nor deleted the logo the winner recorded.
    await expect(access(path.join(logoDir, `customers/${id}/logo/${logoId}.png`))).resolves.toBeUndefined();
    expect(await getDocumentStore().stat(`customers/${id}/logo/${logoId}.png`)).not.toBeNull();
  });

  it("2.10, 2.12 stores a PNG logo on Ignyte's side and the file uses the hosted URL; a fake PNG is deleted and not recorded", async () => {
    const { id, token } = await newCustomer();
    const stored = await uploadLogo(token, PNG_300);
    expect(stored.status).toBe(200);
    const body = (await stored.json()) as { logo: { documentId: string; previewUrl: string } };
    expect(body.logo.previewUrl).toBeTruthy();

    const services = await import("~server/services");
    const { getDb } = await import("~server/db");
    const tab1 = await services.loadTab1Answers(id, { db: getDb(), logoBaseUrl: "https://logos.example.test/" });
    expect(tab1.logoUrl).toBe(`https://logos.example.test/customers/${id}/logo/${body.logo.documentId}.png`);
    // WI-018: the checked logo is copied to the logos bucket (locally LOCAL_LOGO_DIR), same path.
    await expect(access(path.join(logoDir, `customers/${id}/logo/${body.logo.documentId}.png`))).resolves.toBeUndefined();

    const fake = await uploadLogo(token, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"));
    expect(fake.status).toBe(400);
    expect(((await fake.json()) as { message: string }).message).toContain("not a PNG or JPEG");
    const { documentsRepo } = await import("~server/repositories");
    const latest = await documentsRepo.findLatestDocumentUnder(getDb(), id, `customers/${id}/logo/`);
    expect(latest?.id).toBe(body.logo.documentId);
    // The fake never reached the logos bucket: only its one checked logo is there.
    expect(await readdir(path.join(logoDir, `customers/${id}/logo`))).toEqual([`${body.logo.documentId}.png`]);
  });

  it("WI-018: when the copy to the logos bucket fails, nothing is recorded and the private upload is deleted", async () => {
    const { id, token } = await newCustomer();
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: PNG_300.length, width: 300 });
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(PNG_300) });

    const services = await import("~server/services");
    const { getDb } = await import("~server/db");
    const { getDocumentStore } = await import("~server/storage");
    const fedramp = await import("~server/fedramp");
    const store = getDocumentStore();
    const failing = { publish: () => Promise.reject(new Error("logos bucket unreachable")), isPublished: async () => false, unpublish: async () => undefined };
    const outcome = await services.finishLogoUpload(
      token,
      { logoId, filename: "logo.png", contentType: "image/png" },
      { db: getDb(), store, logos: failing, logoBaseUrl: undefined, now: () => new Date(), definition: fedramp.getCompanyFormDefinition(), checker: fedramp.createTab1Checker() },
    );
    expect(outcome).toMatchObject({ kind: "refused" });
    expect((outcome as { message: string }).message).toContain("did not arrive");
    const { documentsRepo } = await import("~server/repositories");
    expect(await documentsRepo.findDocument(getDb(), logoId)).toBeUndefined();
    expect(await store.stat(`customers/${id}/logo/${logoId}.png`)).toBeNull();
  });

  it("WI-018: with a logo host configured, Screen E previews the logo at its public address", async () => {
    const { id, token } = await newCustomer();
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: PNG_300.length, width: 300 });
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(PNG_300) });

    const services = await import("~server/services");
    const { getDb } = await import("~server/db");
    const { getDocumentStore, getLogoPublisher } = await import("~server/storage");
    const fedramp = await import("~server/fedramp");
    const deps = {
      db: getDb(),
      store: getDocumentStore(),
      logos: getLogoPublisher(),
      logoBaseUrl: "https://logos.example.test/",
      now: () => new Date(),
      definition: fedramp.getCompanyFormDefinition(),
      checker: fedramp.createTab1Checker(),
    };
    const publicUrl = `https://logos.example.test/customers/${id}/logo/${logoId}.png`;
    const outcome = await services.finishLogoUpload(token, { logoId, filename: "logo.png", contentType: "image/png" }, deps);
    expect(outcome).toMatchObject({ kind: "stored", logo: { previewUrl: publicUrl } });
    expect(await services.openIntake(token, deps)).toMatchObject({ kind: "open", logo: { previewUrl: publicUrl } });
  });

  it("2.11 refuses a 3 MB logo, an SVG and a WebP before any upload URL is issued", async () => {
    const { token } = await newCustomer();
    for (const [contentType, size] of [["image/png", 3 * 1024 * 1024], ["image/svg+xml", 1000], ["image/webp", 1000]] as const) {
      const res = await api(token, { intent: "logo-start", filename: "logo", contentType, size, width: 300 });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { message: string }).message).toContain("Upload a PNG or JPEG logo");
    }
  });

  it("2.9, 2.13, 2.7, 2.8, 2.23 Submit: blocked without a logo, then the golden answers submit, the tab locks, Unlock reopens it", async () => {
    const { id, token, userId } = await newCustomer();
    const golden = (await import("../../server/fedramp/testdata/golden-answers.json")).default;

    const noLogo = await api(token, { intent: "submit", answers: golden, version: 0 });
    expect(noLogo.status).toBe(422);
    const blocked = (await noLogo.json()) as { problems: Array<{ path: string; message: string }>; version: number };
    expect(blocked.problems).toEqual([expect.objectContaining({ path: "/serviceIdentification/logo" })]);
    expect((await customerRow(id)).status).toBe("in_progress");

    expect((await uploadLogo(token, PNG_300)).status).toBe(200);
    const submitted = await api(token, { intent: "submit", answers: golden, version: blocked.version });
    expect(submitted.status).toBe(200);
    expect((await customerRow(id)).status).toBe("submitted");

    const locked = await api(token, { intent: "save", answers: golden, version: blocked.version + 1 });
    expect(locked.status).toBe(423);
    const lockedLogo = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: 100, width: 300 });
    expect(lockedLogo.status).toBe(423);
    expect(await (await app.request(`/intake/${token}`)).text()).toContain("Tabs 1 and 2 are now read-only");

    const services = await import("~server/services");
    await services.unlockIntake(id, userId);
    expect((await customerRow(id)).status).toBe("in_progress");
    const again = await api(token, { intent: "save", answers: golden, version: blocked.version + 1 });
    expect(again.status).toBe(200);
  });

  it("2.23 an expired or replaced link stores nothing and answers expired", async () => {
    const { id, token, userId } = await newCustomer();
    const services = await import("~server/services");
    await services.issueNewIntakeLink(id, userId);
    const replaced = await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "Late" } }, version: 0 });
    expect(replaced.status).toBe(410);
    expect(await replaced.json()).toEqual({ kind: "expired", message: "This link has expired. Ask your Ignyte consultant for a new one." });

    const fresh = (await services.getIntakeLinkSection(id)).link.url!.split("/intake/")[1]!;
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    await getDb().update(schema.customers).set({ intakeTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.customers.id, id));
    expect((await api(fresh, { intent: "save", answers: {}, version: 0 })).status).toBe(410);
    expect((await api(fresh, { intent: "logo-start", filename: "l.png", contentType: "image/png", size: 10 })).status).toBe(410);
    expect((await app.request(`/intake/${fresh}`)).status).toBe(410);
    const { intakeAnswersRepo } = await import("~server/repositories");
    expect(await intakeAnswersRepo.findIntakeSection(getDb(), id, "company")).toBeUndefined();
  });

  it("2.14, 2.28 Screen D shows Class A next to the certification type and names problems with the tab 1 labels", async () => {
    const { id, token, userId } = await newCustomer();
    await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "Class Co.", serviceAcronym: "CC", certificationType: "20x" } }, version: 0 });
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const page = await (await app.request(`/customers/${id}/package`, { headers: { cookie } })).text();
    expect(page).toContain("20x · Class A");

    const services = await import("~server/services");
    const { getCompanyFormDefinition } = await import("~server/fedramp");
    const outcome = await services.generatePackageOverviewForCustomer(id, userId);
    const website = outcome.problems.find((p) => p.path === "/serviceIdentification/website");
    expect(website?.question).toBe(getCompanyFormDefinition().labels["/serviceIdentification/website"]);
  });
});

describe("Screen E tab 2, KSIs (WI-005)", () => {
  async function newCustomer() {
    const services = await import("~server/services");
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, "dev@ignyteplatform.com"));
    const { customer, link } = await services.createCustomer(
      { name: `KSI Co ${Date.now()}`, serviceName: "Example Records Platform", serviceDescription: "Records management.", contactName: "Pat", contactEmail: "pat@example.com" },
      user!.id,
    );
    return { id: customer.id, token: link.split("/intake/")[1]!, userId: user!.id };
  }

  const api = (token: string, body: Record<string, unknown>) =>
    app.request(`http://localhost:3000/api/intake/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const saveKsis = (token: string, answers: Record<string, unknown>, version: number) => api(token, { intent: "save", section: "ksis", answers, version });

  async function tab(token: string) {
    const view = await (await import("~server/services")).openIntake(token);
    if (view.kind !== "open") throw new Error(view.kind);
    return view;
  }

  async function storedSection(customerId: string) {
    const { getDb, schema } = await import("~server/db");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await getDb()
      .select()
      .from(schema.intakeAnswers)
      .where(and(eq(schema.intakeAnswers.customerId, customerId), eq(schema.intakeAnswers.section, "ksis")));
    return row;
  }

  async function submitWithLogo(token: string) {
    const golden = (await import("../../server/fedramp/testdata/golden-answers.json")).default;
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: PNG.length, width: 300 });
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(PNG) });
    await api(token, { intent: "logo-finish", logoId, filename: "logo.png", contentType: "image/png" });
    return api(token, { intent: "submit", answers: golden, version: 0 });
  }

  it("2.1, 2.2 the tab opens with seven KSI blocks in playbook order, each with FedRAMP's name and statement from the vendored rules and their version", async () => {
    const { token } = await newCustomer();
    const { getRulesLibrary } = await import("~server/fedramp");
    const rules = getRulesLibrary().current;
    const { ksis } = await tab(token);
    expect(ksis.definition.ksis.map((b) => b.code)).toEqual(Object.keys(ksis.statements));
    expect(ksis.rulesVersion).toBe(rules.version);
    for (const [code, shown] of Object.entries(ksis.statements)) {
      expect(shown).toEqual({ name: rules.ksis[code]!.name, statement: rules.ksis[code]!.statement });
    }
    expect(ksis.version).toBe(0);
    expect(ksis.answers.ksi["KSI-IAM-APM"]).toEqual({ questions: { "14": "", "14b": "" }, how_often: "", need_help: false });
    // Review of #49: the file's editor comment is not sent to the page.
    expect(ksis.definition).not.toHaveProperty("$comment");
  });

  it("2.11 Save stores answers, How often? and flags per KSI with rules_version set by the server; reopening shows them", async () => {
    const { id, token } = await newCustomer();
    const answers = {
      ksi: {
        "KSI-IAM-APM": { questions: { "14": "FIDO2 for admins", "14b": "Legacy VPN" }, how_often: "Quarterly", need_help: false },
        "KSI-SVC-SIN": { questions: { "16": "" }, how_often: "", need_help: true },
      },
      readiness: { vulnerability_detection: { questions: { "18": "Weekly scans", "19": "" }, need_help: false } },
    };
    const saved = await saveKsis(token, answers, 0);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ kind: "saved", version: 1 });
    const { getRulesLibrary } = await import("~server/fedramp");
    const row = (await storedSection(id))!;
    expect(row.formDefinitionVersion).toBe("ksis.v1");
    expect(row.answers).toMatchObject({ rules_version: getRulesLibrary().current.version, ...answers });
    const reopened = (await tab(token)).ksis;
    expect(reopened.version).toBe(1);
    expect(reopened.answers.ksi["KSI-IAM-APM"]).toEqual(answers.ksi["KSI-IAM-APM"]);
    expect(reopened.answers.ksi["KSI-SVC-SIN"]!.need_help).toBe(true);
    expect(reopened.answers.readiness.vulnerability_detection.questions["18"]).toBe("Weekly scans");

    // Tab 1 is a separate section: its version is untouched, and a stale tab 2 save conflicts with what is stored.
    expect((await tab(token)).version).toBe(0);
    const stale = await saveKsis(token, { ksi: {} }, 0);
    expect(stale.status).toBe(409);
    const conflict = (await stale.json()) as { version: number; answers: Record<string, unknown> };
    expect(conflict).toMatchObject({ kind: "conflict", version: 1, answers: { ksi: { "KSI-IAM-APM": { how_often: "Quarterly" } } } });

    // Second opinion, bug A: what the page holds after a reload, or after Take theirs, saves again as it is.
    expect(reopened.answers).not.toHaveProperty("rules_version");
    expect(conflict.answers).not.toHaveProperty("rules_version");
    const again = await saveKsis(token, { ...reopened.answers }, reopened.version);
    expect(again.status, await again.clone().text()).toBe(200);
    const theirs = await saveKsis(token, conflict.answers, 2);
    expect(theirs.status, await theirs.clone().text()).toBe(200);
    expect((await storedSection(id))!.answers.rules_version).toBe(getRulesLibrary().current.version);
  });

  it("2.12 refuses a key outside the form definition, rules_version from the browser, an answer over 10,000 or a How often? over 200, and stores nothing", async () => {
    const { id, token } = await newCustomer();
    const refused = [
      { ksi: { "KSI-MLA-OSM": { questions: { "1": "x" } } } },
      { ksi: { "KSI-CED-RAT": { questions: { "24": "x" } } } },
      { readiness: { vulnerability_detection: { questions: { "17": "logs" } } } },
      { rules_version: "1999.01.01.01", ksi: {} },
      { ksi: { "KSI-IAM-AAM": { questions: { "15": "x".repeat(10_001) } } } },
      { ksi: { "KSI-IAM-AAM": { how_often: "y".repeat(201) } } },
      { ksi: { "KSI-CED-RAT": { how_often: "Monthly" } } },
    ];
    for (const answers of refused) {
      const res = await saveKsis(token, answers, 0);
      expect(res.status, JSON.stringify(answers).slice(0, 80)).toBe(400);
      expect(await res.json()).toMatchObject({ kind: "refused" });
    }
    expect(await storedSection(id)).toBeUndefined();
    // Exactly the limits are fine.
    expect((await saveKsis(token, { ksi: { "KSI-IAM-AAM": { questions: { "15": "x".repeat(10_000) }, how_often: "y".repeat(200) } } }, 0)).status).toBe(200);
  });

  it("review of #49: every tab 2 answer at its 10,000-character limit in 3-byte characters (about 270 KB) saves", async () => {
    const { token } = await newCustomer();
    const services = await import("~server/services");
    const def = services.getKsisDefinition();
    const full = "€".repeat(10_000);
    const answers = {
      ksi: Object.fromEntries(def.ksis.map((b) => [b.code, { questions: Object.fromEntries(b.questions.map((q) => [q.id, full])) }])),
      readiness: { vulnerability_detection: { questions: Object.fromEntries(def.readiness.questions.map((q) => [q.id, full])) } },
    };
    expect(Buffer.byteLength(JSON.stringify({ intent: "save", section: "ksis", answers, version: 0 }))).toBeGreaterThan(256 * 1024);
    const res = await saveKsis(token, answers, 0);
    expect(res.status, (await res.clone().text()).slice(0, 200)).toBe(200);
  });

  it("review of #49: a tab 2 save with a version the section never had is refused with reload, not a 500", async () => {
    const { token } = await newCustomer();
    const res = await saveKsis(token, { ksi: {} }, 5);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ kind: "refused", message: "This page is out of date. Reload it and try again." });
  });

  it("review of #49: Submit's body is strict too: an extra key gets 400 and nothing is submitted", async () => {
    const { id, token } = await newCustomer();
    const res = await api(token, { intent: "submit", answers: {}, version: 0, cmvp_validated: true });
    expect(res.status).toBe(400);
    const { getDb } = await import("~server/db");
    const { customersRepo } = await import("~server/repositories");
    expect((await customersRepo.findCustomer(getDb(), id))!.status).toBe("not_started");
  });

  it("E3 the intake action takes a section of company or ksis only, never documents", async () => {
    const { token } = await newCustomer();
    const res = await api(token, { intent: "save", section: "documents", answers: {}, version: 0 });
    expect(res.status).toBe(400);
    expect((await api(token, { intent: "save", section: "company", answers: {}, version: 0 })).status).toBe(200);
  });

  it("2.16 the customer's intake action refuses Ignyte's consultant fields, and the intake data never holds them", async () => {
    const { id, token, userId } = await newCustomer();
    const services = await import("~server/services");
    await services.saveKsiReview(id, { cmvpValidated: true, cmvpNote: "Cert #4282, AWS-LC", logContextNote: "CloudWatch, 1 year" }, userId);
    for (const field of ["cmvp_validated", "cmvp_note", "log_context_note", "cmvpValidated"]) {
      expect((await api(token, { intent: "save", section: "ksis", answers: { ksi: {} }, version: 0, [field]: true })).status, field).toBe(400);
      expect((await saveKsis(token, { [field]: true }, 0)).status, field).toBe(400);
      expect((await saveKsis(token, { ksi: { "KSI-SVC-SIN": { [field]: true } } }, 0)).status, field).toBe(400);
    }
    const view = JSON.stringify(await tab(token));
    for (const text of ["cmvp_validated", "cmvpValidated", "cmvp_note", "cmvpNote", "Cert #4282", "log_context", "logContext", "CloudWatch, 1 year", "CMVP validated"]) expect(view).not.toContain(text);
    const page = await app.request(`http://localhost:3000/intake/${token}`);
    const html = await page.text();
    for (const text of ["Cert #4282", "CloudWatch, 1 year", "CMVP validated", "Log retention and review"]) expect(html).not.toContain(text);
    // Still stored for Ignyte.
    expect((await services.getKsisScreen(id)).review).toMatchObject({ cmvpValidated: true, cmvpNote: "Cert #4282, AWS-LC", logContextNote: "CloudWatch, 1 year", updatedBy: userId });
  });

  it("2.14 after Submit a tab 2 save is refused (423) and stores nothing; after Unlock it saves again", async () => {
    const { id, token, userId } = await newCustomer();
    expect((await saveKsis(token, { ksi: { "KSI-CMT-LMC": { questions: { "21": "Before" } } } }, 0)).status).toBe(200);
    expect((await submitWithLogo(token)).status).toBe(200);
    const locked = await saveKsis(token, { ksi: { "KSI-CMT-LMC": { questions: { "21": "After" }, need_help: true } } }, 1);
    expect(locked.status).toBe(423);
    expect((await storedSection(id))!.answers).toMatchObject({ ksi: { "KSI-CMT-LMC": { questions: { "21": "Before" }, need_help: false } } });
    expect((await tab(token)).locked).toBe(true);

    const services = await import("~server/services");
    await services.unlockIntake(id, userId);
    expect((await saveKsis(token, { ksi: { "KSI-CMT-LMC": { questions: { "21": "After" }, need_help: true } } }, 1)).status).toBe(200);
  });

  it("2.15 Submit with empty blocks is not blocked; Screen D lists Not answered and Needs help blocks as follow-ups, live, never Partly answered", async () => {
    const { id, token, userId } = await newCustomer();
    await saveKsis(
      token,
      {
        ksi: {
          "KSI-CED-RAT": { questions: { "22": "Quiz results, yearly" } },
          "KSI-IAM-APM": { questions: { "14": "FIDO2", "14b": "" } },
          "KSI-SVC-SIN": { questions: { "16": "TLS 1.3, AES-256" }, need_help: true },
        },
        readiness: { vulnerability_detection: { questions: { "19": "30 days" } } },
      },
      0,
    );
    expect((await submitWithLogo(token)).status).toBe(200);
    const services = await import("~server/services");
    const screen = await services.getKsisScreen(id);
    expect(screen.followUps.map((f) => `${f.key}:${f.statusLabel}`)).toEqual([
      "KSI-CMT-LMC:Not answered",
      "KSI-CNA-RNT:Not answered",
      "KSI-IAM-AAM:Not answered",
      "KSI-INR-RIR:Not answered",
      "KSI-SVC-SIN:Needs help",
      "vulnerability_detection:Not answered",
    ]);
    expect(screen.blocks.find((b) => b.key === "KSI-IAM-APM")!.statusLabel).toBe("Partly answered");
    expect(screen.counts).toBe("2/7 answered, 1 needs help");

    // Live: Ignyte unlocks, the customer answers, the follow-up goes away without another Submit.
    await services.unlockIntake(id, userId);
    await saveKsis(token, { ksi: { "KSI-CMT-LMC": { questions: { "21": "CloudTrail, daily" } } } }, 1);
    expect((await services.getKsisScreen(id)).followUps.map((f) => f.key)).not.toContain("KSI-CMT-LMC");
  });

  it("2.17 an older saved rules_version renders its own statements on Screen D with the note; the next save stamps the current version", async () => {
    const { id, token } = await newCustomer();
    const { makeRulesRoot, FAKE_STATEMENT_PREFIX } = await import("../../server/fedramp/testdata/rules-fixture");
    const fedramp = await import("~server/fedramp");
    const services = await import("~server/services");
    const { getDb } = await import("~server/db");
    const fixture = makeRulesRoot({ newer: true });
    try {
      // Saved while the real version was current.
      expect((await saveKsis(token, { ksi: {} }, 0)).status).toBe(200);
      expect((await storedSection(id))!.answers.rules_version).toBe(fixture.real);

      // A newer version is vendored.
      const rules = fedramp.loadRulesLibrary(fixture.root);
      const deps = { db: getDb(), rules, definition: services.getKsisDefinition(), now: () => new Date() };
      const before = await services.getKsisScreen(id, deps);
      expect(before.rulesVersion).toBe(fixture.real);
      expect(before.rulesNote).toBe(`Answered under FedRAMP rules ${fixture.real}; current rules ${fixture.fake}.`);
      const real = rules.get(fixture.real)!;
      expect(before.blocks[0]!.statement).toBe(real.ksis["KSI-CED-RAT"]!.statement);
      expect(before.blocks[0]!.statement!.startsWith(FAKE_STATEMENT_PREFIX)).toBe(false);

      // The customer's form shows the new statements; saving again moves the stamp.
      const view = await services.loadKsisTab(id, deps);
      expect(view.rulesVersion).toBe(fixture.fake);
      expect(view.statements["KSI-CED-RAT"]!.statement.startsWith(FAKE_STATEMENT_PREFIX)).toBe(true);
      const saved = await services.saveKsisSection({ id }, { answers: { ksi: {} }, version: 1 }, deps);
      expect(saved.kind).toBe("saved");
      expect((await storedSection(id))!.answers.rules_version).toBe(fixture.fake);
      const after = await services.getKsisScreen(id, deps);
      expect(after.rulesNote).toBeNull();
      expect(after.blocks[0]!.statement!.startsWith(FAKE_STATEMENT_PREFIX)).toBe(true);

      // Review of #49: saved under the real version, which a later build no longer vendors.
      await services.saveKsisSection({ id }, { answers: { ksi: {} }, version: 2 }, { ...deps, rules: { current: rules.get(fixture.real)!, get: () => undefined } });
      expect((await storedSection(id))!.answers.rules_version).toBe(fixture.real);
      const onlyFake = { current: rules.current, get: (version: string) => (version === fixture.fake ? rules.current : undefined) };
      const gone = await services.getKsisScreen(id, { ...deps, rules: onlyFake });
      expect(gone.rulesVersion).toBe(fixture.fake);
      expect(gone.rulesNote).toBe(`Answered under FedRAMP rules ${fixture.real}, which is no longer in this build; statements shown are from current rules ${fixture.fake}.`);

      // Review of #49: a version without one of the seven KSIs shows a placeholder, not an error page.
      const lacking = { ...rules.current, ksis: Object.fromEntries(Object.entries(rules.current.ksis).filter(([code]) => code !== "KSI-CED-RAT")) };
      const partial = await services.getKsisScreen(id, { ...deps, rules: { current: lacking, get: () => undefined } });
      expect(partial.blocks[0]).toMatchObject({ key: "KSI-CED-RAT", statement: `Statement not available in FedRAMP rules ${fixture.fake}.` });
    } finally {
      fixture.cleanup();
    }
  });

  it("the pages: the intake page renders tab 2 from the rules, and Screen D shows it with follow-ups and saves Ignyte's fields", async () => {
    const { id, token } = await newCustomer();
    const { getRulesLibrary } = await import("~server/fedramp");
    const rules = getRulesLibrary().current;
    await saveKsis(token, { ksi: { "KSI-SVC-SIN": { questions: { "16": "TLS 1.3 via AWS-LC" }, need_help: true } } }, 0);
    const intake = await (await app.request(`/intake/${token}`)).text();
    expect(intake).toContain(">2. Security indicators</button>");
    expect(intake).toContain(`>FedRAMP rules ${rules.version}</p>`);
    expect(intake).toContain("Logging Changes");
    expect(intake).toContain("TLS 1.3 via AWS-LC");
    expect(intake).not.toContain("CMVP validated?");

    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const page = await (await app.request(`/customers/${id}/package`, { headers: { cookie } })).text();
    expect(page).toContain(">Security indicators (tab 2)<");
    // Answered and help ticked: counts in both (2.9).
    expect(page).toContain(">1/7 answered, 1 needs help</p>");
    expect(page).toMatch(/aria-label="Follow-ups"[\s\S]*KSI-SVC-SIN Securing Information<\/a> · Needs help/);
    expect(page).toContain("CMVP validated?");
    expect(page).toContain("Log retention and review (optional context)");
    expect(page).toContain("TLS 1.3 via AWS-LC");

    const post = (body: Record<string, string>) =>
      app.request(`http://localhost:3000/customers/${id}/package`, {
        method: "POST",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000" },
        body: new URLSearchParams(body),
      });
    expect((await post({ intent: "ksi-review", cmvpValidated: "yes", cmvpNote: "Cert #4282", logContextNote: "CloudWatch, 1 year" })).status).toBe(200);
    const services = await import("~server/services");
    expect((await services.getKsisScreen(id)).review).toMatchObject({ cmvpValidated: true, cmvpNote: "Cert #4282", logContextNote: "CloudWatch, 1 year" });
    expect((await post({ intent: "ksi-review", cmvpValidated: "no", cmvpNote: "x".repeat(2001), logContextNote: "" })).status).toBe(400);
    expect((await services.getKsisScreen(id)).review.cmvpValidated).toBe(true);
    expect((await post({ intent: "ksi-review", cmvpValidated: "maybe", cmvpNote: "", logContextNote: "" })).status).toBe(400);
    // The customer's intake data still never holds them.
    expect(await (await app.request(`/intake/${token}`)).text()).not.toContain("Cert #4282");
  });

  it("review of #49: Screen D for an unknown customer is a 404, not an empty card", async () => {
    const services = await import("~server/services");
    await expect(services.getKsisScreen("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404 });
  });

  it("2.16 Ignyte's review fields: CMVP Not checked / Yes / No and two notes up to 2,000 characters", async () => {
    const { id, userId } = await newCustomer();
    const services = await import("~server/services");
    expect((await services.getKsisScreen(id)).review).toMatchObject({ cmvpValidated: null, cmvpNote: null, logContextNote: null, updatedAt: null });
    await services.saveKsiReview(id, { cmvpValidated: false, cmvpNote: "  ", logContextNote: "x".repeat(2000) }, userId);
    expect((await services.getKsisScreen(id)).review).toMatchObject({ cmvpValidated: false, cmvpNote: null, logContextNote: "x".repeat(2000), updatedAt: expect.any(Date) });
    await expect(services.saveKsiReview(id, { cmvpValidated: null, cmvpNote: "x".repeat(2001), logContextNote: "" }, userId)).rejects.toThrow("2,000");
    await services.saveKsiReview(id, { cmvpValidated: null, cmvpNote: "", logContextNote: "" }, userId);
    expect((await services.getKsisScreen(id)).review.cmvpValidated).toBeNull();
  });
});

describe("Screen E tab 3, documents (WI-006)", () => {
  const PDF = (size: number) => {
    const bytes = Buffer.alloc(size, 0x20);
    Buffer.from("%PDF-1.7\n").copy(bytes);
    return bytes;
  };
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
  const ZIP_CONTAINER = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(60, 1)]);
  const MB = 1024 * 1024;

  async function newCustomer() {
    const services = await import("~server/services");
    const { getDb, schema } = await import("~server/db");
    const { eq } = await import("drizzle-orm");
    const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, "dev@ignyteplatform.com"));
    const { customer, link } = await services.createCustomer(
      { name: `Docs Co ${Date.now()}`, serviceName: "Example Records Platform", serviceDescription: "Records management.", contactName: "Pat", contactEmail: "pat@example.com" },
      user!.id,
    );
    return { id: customer.id, token: link.split("/intake/")[1]!, userId: user!.id };
  }

  const api = (token: string, body: Record<string, unknown>) =>
    app.request(`http://localhost:3000/api/intake/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  /** fetch for the browser-side uploader, served by the app in process (the local driver's session route). */
  const appFetch = ((url: string, init?: RequestInit) => app.request(url, init)) as unknown as typeof fetch;

  type Stored = { kind: "stored"; document: { id: string; displayName: string; size: number; kind: string | null } };

  async function startUpload(token: string, filename: string, size: number, replaces?: string) {
    const { documentContentType } = await import("~/lib/documents");
    return api(token, { intent: "document-start", filename, contentType: documentContentType(filename) ?? "application/octet-stream", size, ...(replaces ? { replaces } : {}) });
  }

  async function uploadDocument(token: string, filename: string, bytes: Buffer, options: { replaces?: string; partBytes?: number; fetch?: typeof fetch } = {}) {
    const start = await startUpload(token, filename, bytes.length, options.replaces);
    expect(start.status, await start.clone().text()).toBe(200);
    const { documentId, upload } = (await start.json()) as { documentId: string; upload: { url: string } };
    const { uploadResumable } = await import("../../app/routes/intake/components/resumable-upload");
    await uploadResumable({ url: upload.url, file: new Blob([new Uint8Array(bytes)]), partBytes: options.partBytes ?? 8 * MB, fetch: options.fetch ?? appFetch, wait: async () => undefined });
    const finish = await api(token, { intent: "document-finish", documentId, filename, size: bytes.length, ...(options.replaces ? { replaces: options.replaces } : {}) });
    return { documentId, finish };
  }

  async function tab(token: string) {
    const services = await import("~server/services");
    const view = await services.openIntake(token);
    if (view.kind !== "open") throw new Error(view.kind);
    return view.documents;
  }

  async function screenD(customerId: string) {
    return (await import("~server/services")).getDocumentsScreen(customerId);
  }

  async function documentRows(customerId: string) {
    const { getDb, schema } = await import("~server/db");
    const { and, eq, like } = await import("drizzle-orm");
    return getDb()
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.customerId, customerId), like(schema.documents.objectPath, `customers/${customerId}/intake/%`)));
  }

  async function staffDownload(customerId: string, documentId: string) {
    const services = await import("~server/services");
    const url = await services.documentDownloadUrl(customerId, documentId);
    const res = await app.request(url);
    return { res, bytes: Buffer.from(await res.arrayBuffer()) };
  }

  async function submitWithLogo(token: string) {
    const golden = (await import("../../server/fedramp/testdata/golden-answers.json")).default;
    const start = await api(token, { intent: "logo-start", filename: "logo.png", contentType: "image/png", size: PNG.length, width: 300 });
    const { logoId, upload } = (await start.json()) as { logoId: string; upload: { url: string; method: string; headers: Record<string, string> } };
    await app.request(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(PNG) });
    await api(token, { intent: "logo-finish", logoId, filename: "logo.png", contentType: "image/png" });
    return api(token, { intent: "submit", answers: golden, version: 0 });
  }

  it("2.1–2.4 saves the certification and its dates before and after Submit; a date over 12 months old warns on both sides and blocks nothing", async () => {
    const { id, token } = await newCustomer();
    expect((await tab(token)).certification).toEqual({ type: null, period_end_date: null, next_report_expected: null });
    const saved = await api(token, { intent: "certification-save", certification: { type: "soc2_type2", period_end_date: "2024-06-30", next_report_expected: "2026-12-31" }, version: 0 });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ kind: "saved", version: 1, old: true });
    expect((await tab(token)).certification).toEqual({ type: "soc2_type2", period_end_date: "2024-06-30", next_report_expected: "2026-12-31" });
    const d = await screenD(id);
    expect(d.certification).toMatchObject({ label: "SOC 2 Type II", periodEnd: "2024-06-30", nextReport: "2026-12-31", old: true });
    expect(d.checklist.map((c) => c.kind).slice(0, 4)).toEqual(["soc2_report", "bridge_letter", "engagement_docs", "supplemental_evidence"]);

    // Another certification drops the next-report date (asked for SOC 2 only).
    const ready = await api(token, { intent: "certification-save", certification: { type: "fedramp_ready", period_end_date: "2026-09-01", next_report_expected: "2027-01-01" }, version: 1 });
    expect(await ready.json()).toMatchObject({ kind: "saved", version: 2, old: false, certification: { next_report_expected: null } });
    expect((await screenD(id)).checklist.map((c) => c.kind).slice(0, 2)).toEqual(["rar", "sap"]);

    // A stale version conflicts and returns what is stored.
    const conflict = await api(token, { intent: "certification-save", certification: { type: "govramp", period_end_date: null, next_report_expected: null }, version: 1 });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ kind: "conflict", version: 2, certification: { type: "fedramp_ready" } });

    // The old date never blocks Submit, and the tab still saves after it.
    await api(token, { intent: "certification-save", certification: { type: "soc2_type2", period_end_date: "2020-01-01", next_report_expected: null }, version: 2 });
    expect((await submitWithLogo(token)).status).toBe(200);
    const after = await api(token, { intent: "certification-save", certification: { type: "soc2_type2", period_end_date: "2026-03-31", next_report_expected: null }, version: 3 });
    expect(after.status).toBe(200);
  });

  it("2.5 a 250 MB PDF goes to the bucket in a resumable session and appears in both lists with Cloud Storage's checksums", { timeout: 180_000 }, async () => {
    const { id, token } = await newCustomer();
    const bytes = PDF(250 * MB);
    const { documentId, finish } = await uploadDocument(token, "SOC 2 report.pdf", bytes);
    expect(finish.status).toBe(200);
    expect(((await finish.json()) as Stored).document).toMatchObject({ id: documentId, displayName: "SOC 2 report.pdf", size: 250 * MB });
    expect((await tab(token)).documents.map((d) => d.id)).toEqual([documentId]);
    expect((await screenD(id)).files.map((f) => f.id)).toEqual([documentId]);

    const [row] = await documentRows(id);
    const { createHash } = await import("node:crypto");
    expect(row).toMatchObject({
      objectPath: `customers/${id}/intake/${documentId}/SOC 2 report.pdf`,
      contentType: "application/pdf",
      sha256: null,
      md5: createHash("md5").update(bytes).digest("base64"),
      addedAfterSubmit: false,
    });
    expect(row!.crc32c).toMatch(/^[A-Za-z0-9+/]{6}==$/);
  });

  it("2.6 when the connection drops halfway the upload continues from where it stopped, not from the start", async () => {
    const { token } = await newCustomer();
    const bytes = PDF(3 * 256 * 1024);
    const ranges: string[] = [];
    let calls = 0;
    const dropping = (async (url: string, init?: RequestInit) => {
      calls++;
      ranges.push(new Headers(init?.headers).get("content-range")!);
      if (calls === 2) {
        // Halfway through the second part the connection drops: the app receives half of it, then a broken stream.
        const half = (init!.body as Blob).slice(0, 128 * 1024);
        const body = new ReadableStream({
          async start(controller) {
            controller.enqueue(new Uint8Array(await half.arrayBuffer()));
            controller.error(new Error("connection reset"));
          },
        });
        await Promise.resolve(app.request(url, { method: "PUT", headers: init!.headers, body, duplex: "half" } as RequestInit)).catch(() => undefined);
        throw new TypeError("network error");
      }
      return app.request(url, init);
    }) as unknown as typeof fetch;
    const { finish } = await uploadDocument(token, "plan.pdf", bytes, { partBytes: 256 * 1024, fetch: dropping });
    expect(finish.status).toBe(200);
    expect(ranges).toEqual([`bytes 0-262143/786432`, `bytes 262144-524287/786432`, `bytes */786432`, `bytes 262144-524287/786432`, `bytes 524288-786431/786432`]);
    expect(ranges.filter((r) => r.startsWith("bytes 0-"))).toHaveLength(1);
  });

  it("2.7 an upload started but never finished writes no row and appears in neither list", async () => {
    const { id, token } = await newCustomer();
    const start = await startUpload(token, "half.pdf", 1000);
    const { upload } = (await start.json()) as { upload: { url: string } };
    await app.request(upload.url, { method: "PUT", headers: { "content-range": "bytes 0-499/1000" }, body: new Uint8Array(PDF(500)) });
    const complete = await startUpload(token, "never-finished.pdf", 100);
    const done = (await complete.json()) as { upload: { url: string } };
    await app.request(done.upload.url, { method: "PUT", headers: { "content-range": "bytes 0-99/100" }, body: new Uint8Array(PDF(100)) });
    expect(await documentRows(id)).toEqual([]);
    expect((await tab(token)).documents).toEqual([]);
    expect((await screenD(id)).files).toEqual([]);
  });

  it("2.8 a finished upload that fails the signature or size check is deleted and gets no row", async () => {
    const { id, token } = await newCustomer();
    const { getDocumentStore } = await import("~server/storage");
    for (const [filename, bytes] of [
      ["fake.pdf", Buffer.from("<html><script>alert(1)</script></html>")],
      ["fake.docx", PDF(64)],
      ["binary.csv", Buffer.from([0x61, 0x00, 0x62])],
    ] as const) {
      const { documentId, finish } = await uploadDocument(token, filename, bytes);
      expect(finish.status, filename).toBe(400);
      expect(((await finish.json()) as { message: string }).message).toContain("so it was not kept");
      expect(await getDocumentStore().stat(`customers/${id}/intake/${documentId}/${filename}`)).toBeNull();
    }
    // The size announced at finish must be the stored size.
    const start = await startUpload(token, "short.pdf", 64);
    const { documentId, upload } = (await start.json()) as { documentId: string; upload: { url: string } };
    await app.request(upload.url, { method: "PUT", headers: { "content-range": "bytes 0-63/64" }, body: new Uint8Array(PDF(64)) });
    expect((await api(token, { intent: "document-finish", documentId, filename: "short.pdf", size: 65 })).status).toBe(400);
    expect(await getDocumentStore().stat(`customers/${id}/intake/${documentId}/short.pdf`)).toBeNull();
    expect(await documentRows(id)).toEqual([]);
  });

  it("2.9 a 251 MB file, a .zip and an .exe are refused before any session opens, each with its message", async () => {
    const { token } = await newCustomer();
    const refusals = [
      ["big.pdf", 251 * MB, "Files can be up to 250 MB each"],
      ["package.zip", MB, "Please upload the files inside the zip one by one"],
      ["setup.exe", MB, "This file type is not accepted. Accepted: PDF, Word, Excel, PNG, JPG, SVG, Visio, CSV, JSON, XML"],
    ] as const;
    for (const [filename, size, message] of refusals) {
      const res = await api(token, { intent: "document-start", filename, contentType: "application/octet-stream", size });
      expect(res.status, filename).toBe(400);
      expect(await res.json()).toEqual({ kind: "refused", message });
    }
    // A content type that does not match the extension is refused too.
    expect((await api(token, { intent: "document-start", filename: "a.pdf", contentType: "text/html", size: 10 })).status).toBe(400);
  });

  it("2.10 PNG, SVG, VSDX, CSV, JSON and XML files are accepted", async () => {
    const { id, token } = await newCustomer();
    const files = [
      ["diagram.png", PNG],
      ["diagram.svg", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><rect width='1' height='1'/></svg>")],
      ["boundary.vsdx", ZIP_CONTAINER],
      ["assets.csv", Buffer.from("name,owner\nweb,ops\n")],
      ["sbom.json", Buffer.from('{"components":[]}')],
      ["config.xml", Buffer.from("<?xml version='1.0'?><config/>")],
    ] as const;
    for (const [filename, bytes] of files) {
      const { finish } = await uploadDocument(token, filename, bytes);
      expect(finish.status, filename).toBe(200);
    }
    expect((await documentRows(id)).map((r) => r.contentType).sort()).toEqual(
      ["application/json", "application/vnd.ms-visio.drawing.main+xml", "application/xml", "image/png", "image/svg+xml", "text/csv"].sort(),
    );
  });

  it("2.11 Submit is blocked with the file named while a file has no What is this?, an Other has no note or a policy lacks version or date", async () => {
    const { id, token } = await newCustomer();
    const { documentId } = await uploadDocument(token, "Policies.pdf", PDF(100));
    const blocked = await submitWithLogo(token);
    expect(blocked.status).toBe(422);
    const first = (await blocked.json()) as { problems: { path: string; message: string }[]; version: number };
    expect(first.problems).toEqual([expect.objectContaining({ path: `/documents/${documentId}`, message: "“Policies.pdf”: choose what this file is (“What is this?”)." })]);

    expect((await api(token, { intent: "document-update", documentId, kind: "policies" })).status).toBe(200);
    const policy = await api(token, { intent: "submit", answers: (await import("../../server/fedramp/testdata/golden-answers.json")).default, version: first.version });
    expect(((await policy.json()) as { problems: { message: string }[] }).problems.map((p) => p.message)).toEqual([
      "“Policies.pdf”: add the policy version.",
      "“Policies.pdf”: add the date the policy was last updated.",
    ]);
    expect((await api(token, { intent: "document-update", documentId, policyVersion: "3.1", policyUpdatedOn: "2026-09-01" })).status).toBe(200);
    const golden = (await import("../../server/fedramp/testdata/golden-answers.json")).default;
    const tab1 = await (await import("~server/services")).openIntake(token);
    const ok = await api(token, { intent: "submit", answers: golden, version: tab1.kind === "open" ? tab1.version : 0 });
    expect(ok.status).toBe(200);
    expect((await documentRows(id))[0]).toMatchObject({ kind: "policies", policyVersion: "3.1", policyUpdatedOn: "2026-09-01" });
  });

  it("2.12 Rename changes only the display name; the download still returns the original object", async () => {
    const { id, token } = await newCustomer();
    const bytes = PDF(300);
    const { documentId } = await uploadDocument(token, "scan-0042.pdf", bytes);
    const renamed = await api(token, { intent: "document-update", documentId, displayName: "Vulnerability scan Q3" });
    expect(((await renamed.json()) as { document: { displayName: string } }).document.displayName).toBe("Vulnerability scan Q3");
    const [row] = await documentRows(id);
    expect(row).toMatchObject({ displayName: "Vulnerability scan Q3", originalFilename: "scan-0042.pdf", objectPath: `customers/${id}/intake/${documentId}/scan-0042.pdf` });
    const { res, bytes: downloaded } = await staffDownload(id, documentId);
    expect(res.status).toBe(200);
    expect(downloaded.equals(bytes)).toBe(true);
    expect(res.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''scan-0042.pdf");
    expect((await screenD(id)).files[0]).toMatchObject({ displayName: "Vulnerability scan Q3", originalFilename: "scan-0042.pdf" });
  });

  it("2.13 Replace: the customer sees only the new version; Ignyte sees replaced on [date] and downloads both", async () => {
    const { id, token } = await newCustomer();
    const v1 = PDF(200);
    const v2 = PDF(400);
    const first = await uploadDocument(token, "IR plan v1.pdf", v1);
    await api(token, { intent: "document-update", documentId: first.documentId, kind: "ir_plan_test" });
    const second = await uploadDocument(token, "IR plan v2.pdf", v2, { replaces: first.documentId });
    expect(second.finish.status).toBe(200);
    expect(((await second.finish.json()) as Stored).document).toMatchObject({ displayName: "IR plan v2.pdf", kind: "ir_plan_test" });

    expect((await tab(token)).documents.map((d) => d.displayName)).toEqual(["IR plan v2.pdf"]);
    const [file] = (await screenD(id)).files;
    expect(file).toMatchObject({ id: second.documentId, kindLabel: "Incident response plan and last test" });
    expect(file!.versions).toEqual([expect.objectContaining({ id: first.documentId, originalFilename: "IR plan v1.pdf", replacedOn: expect.any(Date) })]);
    expect((await staffDownload(id, first.documentId)).bytes.equals(v1)).toBe(true);
    expect((await staffDownload(id, second.documentId)).bytes.equals(v2)).toBe(true);

    // The replaced version can no longer be renamed, replaced again or removed by the customer.
    expect((await api(token, { intent: "document-update", documentId: first.documentId, displayName: "x" })).status).toBe(400);
    expect((await startUpload(token, "v3.pdf", 10, first.documentId)).status).toBe(400);
    expect((await api(token, { intent: "document-remove", documentId: first.documentId })).status).toBe(400);
  });

  it("#42 review: a version Ignyte removed from the middle of a chain hides only that version on Screen D", async () => {
    const { id, token, userId } = await newCustomer();
    const services = await import("~server/services");
    const v1 = await uploadDocument(token, "Plan v1.pdf", PDF(100));
    const v2 = await uploadDocument(token, "Plan v2.pdf", PDF(100), { replaces: v1.documentId });
    const v3 = await uploadDocument(token, "Plan v3.pdf", PDF(100), { replaces: v2.documentId });
    await services.removeDocumentByStaff(id, v2.documentId, userId);
    const [file] = (await screenD(id)).files;
    expect(file!.id).toBe(v3.documentId);
    expect(file!.versions.map((v) => v.id)).toEqual([v1.documentId]);
    expect((await screenD(id)).files).toHaveLength(1);
  });

  it("#42 review: an update that sets the kind drops fields of another kind sent with it", async () => {
    const { token } = await newCustomer();
    const doc = await uploadDocument(token, "Policy.pdf", PDF(100));
    await api(token, { intent: "document-update", documentId: doc.documentId, kind: "other", kindNote: "old note" });
    const res = await api(token, { intent: "document-update", documentId: doc.documentId, kindNote: "stale", kind: "policies", policyVersion: "3" });
    expect(res.status).toBe(200);
    const [stored] = (await tab(token)).documents;
    expect(stored).toMatchObject({ kind: "policies", kindNote: null, policyVersion: "3" });
    const back = await api(token, { intent: "document-update", documentId: doc.documentId, policyVersion: "9", kind: "other", kindNote: "kept" });
    expect(back.status).toBe(200);
    expect((await tab(token)).documents[0]).toMatchObject({ kind: "other", kindNote: "kept", policyVersion: null, policyUpdatedOn: null });
  });

  it("2.14, 2.15 after Submit tab 1 is read-only, tab 3 still uploads, renames and replaces, the x is refused, and late files are labelled", async () => {
    const { id, token } = await newCustomer();
    const before = await uploadDocument(token, "Boundary.pdf", PDF(100));
    await api(token, { intent: "document-update", documentId: before.documentId, kind: "boundary_diagram" });
    expect((await submitWithLogo(token)).status).toBe(200);

    expect((await api(token, { intent: "save", answers: {}, version: 1 })).status).toBe(423);
    const late = await uploadDocument(token, "Training.pdf", PDF(100));
    expect(late.finish.status).toBe(200);
    expect((await api(token, { intent: "document-update", documentId: late.documentId, displayName: "Training records 2026", kind: "training" })).status).toBe(200);
    const replaced = await uploadDocument(token, "Boundary v2.pdf", PDF(150), { replaces: before.documentId });
    expect(replaced.finish.status).toBe(200);
    const removal = await api(token, { intent: "document-remove", documentId: late.documentId });
    expect(removal.status).toBe(423);
    expect(((await removal.json()) as { message: string }).message).toContain("can no longer be removed");

    const view = await tab(token);
    expect(view.submitted).toBe(true);
    expect(view.documents.map((d) => d.displayName).sort()).toEqual(["Boundary v2.pdf", "Training records 2026"]);
    const files = (await screenD(id)).files;
    expect(files.find((f) => f.id === late.documentId)?.addedAfterSubmit).toBe(true);
    expect(files.find((f) => f.id === replaced.documentId)?.addedAfterSubmit).toBe(true);
    expect((await documentRows(id)).find((r) => r.id === before.documentId)?.addedAfterSubmit).toBe(false);
  });

  it("2.16 a certification change saved while Submitted is labelled on Screen D; the same values, a change before Submit and a client-sent stamp are not; the label survives unlock and resubmit", async () => {
    const { id, token, userId } = await newCustomer();
    const save = (certification: Record<string, unknown>, version: number) => api(token, { intent: "certification-save", certification, version });
    const label = async () => (await screenD(id)).certification.changedAfterSubmitAt;
    const SOC2 = { type: "soc2_type2", period_end_date: "2026-03-31", next_report_expected: "2026-12-31" };

    // Before Submit: a change, even with a stamp sent by the browser, sets nothing.
    expect((await save(SOC2, 0)).status).toBe(200);
    expect((await save({ ...SOC2, period_end_date: "2026-04-30", changed_after_submit_at: "2020-01-01T00:00:00.000Z" }, 1)).status).toBe(200);
    expect(await label()).toBeNull();
    expect(await (await submitWithLogo(token)).json()).toEqual({ kind: "submitted" });

    // After Submit: the same values again are not a change.
    const same = await save({ ...SOC2, period_end_date: "2026-04-30" }, 2);
    expect(same.status, await same.clone().text()).toBe(200);
    expect(await label()).toBeNull();
    expect((await tab(token)).certification).toEqual({ ...SOC2, period_end_date: "2026-04-30" });

    // Each answer counts: the next-report date alone changes it, stamped with the save's time.
    const before = Date.now();
    const changed = await save({ ...SOC2, period_end_date: "2026-04-30", next_report_expected: "2027-01-31" }, 3);
    expect(changed.status, await changed.clone().text()).toBe(200);
    expect(await changed.json()).not.toHaveProperty("certification.changed_after_submit_at");
    const stamp = await label();
    expect(Date.parse(stamp!)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(stamp!)).toBeLessThanOrEqual(Date.now() + 1000);
    expect((await tab(token)).certification).not.toHaveProperty("changed_after_submit_at");

    // A later unchanged save keeps the stamp; a client-sent one (null or forged) is ignored.
    await save({ ...SOC2, period_end_date: "2026-04-30", next_report_expected: "2027-01-31", changed_after_submit_at: null }, 4);
    expect(await label()).toBe(stamp);
    await save({ ...SOC2, period_end_date: "2026-04-30", next_report_expected: "2027-01-31", changed_after_submit_at: "2020-01-01T00:00:00.000Z" }, 5);
    expect(await label()).toBe(stamp);

    // A second change moves the label to the latest one.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await save({ ...SOC2, period_end_date: "2026-05-31", next_report_expected: "2027-01-31" }, 6);
    const second = await label();
    expect(Date.parse(second!)).toBeGreaterThan(Date.parse(stamp!));

    // The type alone changes it too: FedRAMP Ready → GovRAMP with the same date.
    await save({ type: "fedramp_ready", period_end_date: "2026-05-31", next_report_expected: null }, 7);
    const ready = await label();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await save({ type: "govramp", period_end_date: "2026-05-31", next_report_expected: null }, 8);
    const latest = await label();
    expect(Date.parse(latest!)).toBeGreaterThan(Date.parse(ready!));

    // Unlock, a change while In progress, and a new Submit keep the label from the first Submit.
    const services = await import("~server/services");
    await services.unlockIntake(id, userId);
    await save({ ...SOC2, type: "fedramp_ready", next_report_expected: null }, 9);
    expect(await label()).toBe(latest);
    const golden = (await import("../../server/fedramp/testdata/golden-answers.json")).default;
    expect((await api(token, { intent: "submit", answers: golden, version: 1 })).status).toBe(200);
    expect(await label()).toBe(latest);
  });

  it("2.17 the checklist shows each listed item as received when a current file has that kind, and missing otherwise", async () => {
    const { id, token } = await newCustomer();
    await api(token, { intent: "certification-save", certification: { type: "fedramp_rev5", period_end_date: "2026-05-01", next_report_expected: null }, version: 0 });
    const sar = await uploadDocument(token, "Rev5 package.pdf", PDF(100));
    await api(token, { intent: "document-update", documentId: sar.documentId, kind: "rev5_package_sar" });
    const other = await uploadDocument(token, "Notes.pdf", PDF(100));
    await api(token, { intent: "document-update", documentId: other.documentId, kind: "other", kindNote: "Pen test summary" });
    const checklist = (await screenD(id)).checklist;
    expect(checklist).toHaveLength(9);
    expect(checklist.filter((c) => c.present).map((c) => c.kind)).toEqual(["rev5_package_sar"]);
    expect(checklist.find((c) => c.kind === "policies")).toEqual({ kind: "policies", label: "Security policies and procedures", present: false });
  });

  it("2.18 Ignyte's Remove hides the file on both sides and the object stays in the bucket; the customer's x before Submit does the same", async () => {
    const { id, token, userId } = await newCustomer();
    const services = await import("~server/services");
    const { getDocumentStore } = await import("~server/storage");
    const a = await uploadDocument(token, "a.pdf", PDF(100));
    const b = await uploadDocument(token, "b.pdf", PDF(100));

    await services.removeDocumentByStaff(id, a.documentId, userId);
    expect((await api(token, { intent: "document-remove", documentId: b.documentId })).status).toBe(200);

    expect((await tab(token)).documents).toEqual([]);
    expect((await screenD(id)).files).toEqual([]);
    const rows = await documentRows(id);
    expect(rows.find((r) => r.id === a.documentId)).toMatchObject({ removedBy: `user:${userId}`, removedAt: expect.any(Date) });
    expect(rows.find((r) => r.id === b.documentId)?.removedBy).toMatch(/^link:/);
    for (const doc of [a, b]) {
      const row = rows.find((r) => r.id === doc.documentId)!;
      expect(await getDocumentStore().stat(row.objectPath), row.objectPath).not.toBeNull();
    }
    await expect(services.documentDownloadUrl(id, a.documentId)).rejects.toThrow("File not found");
  });

  it("two finishes of the same upload at the same time give one row and no 500 (as IGN-21 for the logo)", async () => {
    const { id, token } = await newCustomer();
    const start = await startUpload(token, "same.pdf", 64);
    const { documentId, upload } = (await start.json()) as { documentId: string; upload: { url: string } };
    await app.request(upload.url, { method: "PUT", headers: { "content-range": "bytes 0-63/64" }, body: new Uint8Array(PDF(64)) });
    const services = await import("~server/services");
    const { getDb } = await import("~server/db");
    const { getDocumentStore } = await import("~server/storage");
    // Both finishes have found no row before either inserts: the second insert collides on the primary key.
    let arrived = 0;
    let bothArrived!: () => void;
    const barrier = new Promise<void>((resolve) => (bothArrived = resolve));
    const store = getDocumentStore();
    const racing = Object.assign(Object.create(Object.getPrototypeOf(store) as object) as typeof store, store, {
      stat: async (objectPath: string) => {
        const result = await store.stat(objectPath);
        if (++arrived === 2) bothArrived();
        await barrier;
        return result;
      },
    });
    const deps = { db: getDb(), store: racing, now: () => new Date(), definition: services.getDocumentsDefinition(), appOrigin: "http://localhost:3000" };
    const finish = () => services.finishDocumentUpload(token, { documentId, filename: "same.pdf", size: 64 }, deps);
    const outcomes = await Promise.all([finish(), finish()]);
    expect(arrived).toBe(2);
    expect(outcomes.map((o) => o.kind)).toEqual(["stored", "stored"]);
    expect(await documentRows(id)).toHaveLength(1);
    expect(await store.stat(`customers/${id}/intake/${documentId}/same.pdf`)).not.toBeNull();
  });

  it("the pages: Screen E shows tab 3; Screen D shows the card, downloads through a signed attachment URL for staff only, and Remove posts", async () => {
    const { id, token } = await newCustomer();
    await api(token, { intent: "certification-save", certification: { type: "soc2_type2", period_end_date: "2024-01-31", next_report_expected: null }, version: 0 });
    const bytes = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const { documentId } = await uploadDocument(token, "boundary.svg", bytes);
    await api(token, { intent: "document-update", documentId, kind: "boundary_diagram" });

    const intake = await (await app.request(`/intake/${token}`)).text();
    expect(intake).toContain("3. Documents");
    expect(intake).toContain("Which certification do you hold?");
    expect(intake).toContain("FRC-CLA-ASF");
    expect(intake).toContain("boundary.svg");

    const href = `/api/customers/${id}/documents/${documentId}/download`;
    expect((await app.request(`http://localhost:3000${href}`)).status).not.toBe(302);
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const page = await (await app.request(`/customers/${id}/package`, { headers: { cookie } })).text();
    expect(page).toContain("Documents (tab 3)");
    expect(page).toContain("FRC-CLA-ASF");
    expect(page).toContain('aria-label="received">✓</span>Authorization boundary or architecture diagram');
    expect(page).toContain(">missing</span>Complete SOC 2 Type II report");
    expect(page).toContain(href);

    const redirect = await app.request(`http://localhost:3000${href}`, { headers: { cookie } });
    expect(redirect.status).toBe(302);
    const file = await app.request(redirect.headers.get("location")!);
    expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
    expect(file.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''boundary.svg");

    const removed = await app.request(`http://localhost:3000/customers/${id}/package`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000" },
      body: new URLSearchParams({ intent: "remove-document", documentId }),
    });
    expect(removed.status).toBe(200);
    expect((await screenD(id)).files).toEqual([]);
    expect((await app.request(`http://localhost:3000${href}`, { headers: { cookie } })).status).toBe(404);
  });

  it("IGN-16 2.7 after Submit tab 1 is read-only and tab 3 still accepts files", async () => {
    const { token } = await newCustomer();
    expect((await submitWithLogo(token)).status).toBe(200);
    expect((await api(token, { intent: "save", answers: {}, version: 1 })).status).toBe(423);
    expect((await uploadDocument(token, "late.pdf", PDF(100))).finish.status).toBe(200);
  });
});

describe("Ignyte theme (WI-015 §5)", () => {
  /** WCAG 2 relative luminance of a #rgb or #rrggbb colour. */
  function luminance(hex: string): number {
    const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  async function builtCss(): Promise<string> {
    const assets = await readdir(path.join(root, "build/client/assets"));
    const files = assets.filter((f) => f.endsWith(".css"));
    expect(files.length).toBeGreaterThan(0);
    return (await Promise.all(files.map((f) => readFile(path.join(root, "build/client/assets", f), "utf8")))).join("\n");
  }

  it("serves the self-hosted fonts from the app's origin and never asks Google Fonts", async () => {
    const css = await builtCss();
    for (const host of ["fonts.googleapis.com", "fonts.gstatic.com"]) expect(css).not.toContain(host);
    expect(css).not.toContain("prefers-color-scheme");
    const urls = [...css.matchAll(/url\("?(\/fonts\/[^")]+\.woff2)"?\)/g)].map((m) => m[1]!);
    expect(new Set(urls).size).toBe(3);
    for (const url of new Set(urls)) {
      const res = await app.request(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get("content-type")).toBe("font/woff2");
      expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    }
    const login = await (await app.request("/login")).text();
    for (const host of ["fonts.googleapis.com", "fonts.gstatic.com"]) expect(login).not.toContain(host);
  });

  it("keeps button, link and body text at 4.5:1 or more (WCAG AA)", async () => {
    const css = await builtCss();
    const token = (name: string) => {
      const value = new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})\\b`, "i").exec(css)?.[1];
      expect(value, `--${name}`).toBeDefined();
      return value!;
    };
    const pairs: [string, string][] = [
      ["primary-foreground", "primary"], // primary button
      ["primary", "background"], // links and headings
      ["foreground", "background"], // body text
      ["muted-foreground", "background"], // secondary text
      ["accent-foreground", "accent"], // hovered and selected items
    ];
    for (const [fg, bg] of pairs) expect(contrast(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the product name and no 'Maaz 20x' on the sign-in page and the staff screens", async () => {
    const login = await (await app.request("/login")).text();
    expect(login).toContain("<title>Ignyte FedRAMP 20x</title>");
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    for (const page of ["/customers", "/customers/new"]) {
      const html = await (await app.request(page, { headers: { cookie } })).text();
      expect(html, page).toContain("Ignyte FedRAMP 20x");
      expect(html, page).not.toContain("Maaz 20x");
    }
    expect(login).not.toContain("Maaz 20x");
  });
});

describe("intake token in error logs (WI-020)", () => {
  it("2.1, 2.5 GET /intake/<token>/does-not-exist answers 404 and stderr shows /intake/[redacted], never the token", async () => {
    const { inspect } = await import("node:util");
    const token = "Zk3p9QvT_x2bLm7NcA-8rWyE4uHs6DfG";
    const printed: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation((...values: unknown[]) => void printed.push(values.map((v) => (typeof v === "string" ? v : inspect(v))).join(" ")));
    const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => (printed.push(String(chunk)), true));
    try {
      const res = await app.request(`http://localhost:3000/intake/${token}/does-not-exist`);
      expect(res.status).toBe(404);
      await res.text();
    } finally {
      log.mockRestore();
      write.mockRestore();
    }
    const stderr = printed.join("\n");
    expect(stderr).toContain("No route matches URL \"/intake/[redacted]/does-not-exist\"");
    expect(stderr).not.toContain(token);
  });
});
