/**
 * Smoke test: boots the real app (server/index.ts createApp + the production build) against
 * the local Postgres, migrated and seeded. Run `npm run build`, `npm run db:up`, then
 * `npm run test:smoke`. CI does the same with a Postgres service container.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Hono } from "hono";
import type { ServerBuild } from "react-router";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const storageDir = path.join(root, ".data", "smoke-storage");

Object.assign(process.env, {
  NODE_ENV: "development",
  DEV_LOGIN: "1",
  DEV_LOGIN_EMAIL: "dev@ignyteplatform.com",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://maaz:maaz@localhost:5432/maaz20x",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "smoke-test-secret-0123456789abcdef0123",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: storageDir,
});

let app: Hono;
let build: ServerBuild;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
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

  it("stores an upload under the contract path and records its documents row", async () => {
    const { startIntakeUpload, completeIntakeUpload } = await import("~server/services");
    const { getDb, schema } = await import("~server/db");
    const [customer] = await getDb().select().from(schema.customers).limit(1);
    expect(customer, "seeded customer missing: run npm run db:seed").toBeDefined();

    const content = "%PDF-1.7 smoke test";
    const started = await startIntakeUpload({
      customerId: customer!.id,
      filename: "Smoke Test.pdf",
      contentType: "application/pdf",
      size: content.length,
    });

    const put = await app.request(started.upload.url, {
      method: "PUT",
      headers: started.upload.headers,
      body: content,
    });
    expect(put.status).toBe(200);

    const row = await completeIntakeUpload({
      customerId: customer!.id,
      documentId: started.documentId,
      filename: "Smoke Test.pdf",
      uploadedBy: "user:smoke",
    });

    const expectedPath = `customers/${customer!.id}/intake/${started.documentId}/Smoke Test.pdf`;
    expect(row).toMatchObject({
      objectPath: expectedPath,
      size: content.length,
      contentType: "application/pdf",
      sha256: createHash("sha256").update(content).digest("hex"),
      uploadedBy: "user:smoke",
    });
    const onDisk = path.join(storageDir, "customers", customer!.id, "intake", started.documentId, "Smoke Test.pdf");
    expect(await readFile(onDisk, "utf8")).toBe(content);
  });

  it("generates, stores and downloads a Package Overview file (WI-007)", async () => {
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
    expect(user, "dev user missing: run npm run db:seed:allowlist").toBeDefined();
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
      expect(again.status).not.toBe(303);
    } finally {
      await setActive(true);
    }
  });

  it("2.15 applyAllowlist: an email taken off the list is set inactive, keeps its row and loses its sessions", async () => {
    const cookie = await signIn();
    const { sessionCount } = await devUser();
    const { getDb, schema } = await import("~server/db");
    const { usersRepo } = await import("~server/repositories");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const dev = "dev@ignyteplatform.com";
    const newcomer = "allowlist-smoke@ignyteplatform.com";
    const activeBefore = (await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.active, true))).map((u) => u.email);
    expect(activeBefore).toContain(dev);
    try {
      const result = await usersRepo.applyAllowlist(db, [newcomer]);
      expect(result).toEqual({ active: [newcomer], deactivated: expect.arrayContaining([dev]) });
      const devRow = await usersRepo.findUserByEmail(db, dev);
      expect(devRow?.active).toBe(false);
      expect(await sessionCount()).toBe(0);
      expect((await usersRepo.findUserByEmail(db, newcomer))?.active).toBe(true);
      const home = await app.request("/", { headers: { cookie } });
      expect(home.status).toBe(302);

      const back = await usersRepo.applyAllowlist(db, activeBefore);
      expect(back.deactivated).toEqual([newcomer]);
      expect((await usersRepo.findUserByEmail(db, dev))?.active).toBe(true);
      expect((await usersRepo.findUserByEmail(db, newcomer))?.active).toBe(false);
    } finally {
      await usersRepo.applyAllowlist(db, activeBefore);
      await db.delete(schema.users).where(eq(schema.users.email, newcomer));
    }
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

  it("refuses a request body over 256 KB with 413 and stores nothing", async () => {
    const { id, token } = await newCustomer();
    const res = await api(token, { intent: "save", answers: { serviceIdentification: { providerName: "x".repeat(300 * 1024) } }, version: 0 });
    expect(res.status).toBe(413);
    const { getDb } = await import("~server/db");
    const { intakeAnswersRepo } = await import("~server/repositories");
    expect(await intakeAnswersRepo.findIntakeSection(getDb(), id, "company")).toBeUndefined();
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

    const fake = await uploadLogo(token, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"));
    expect(fake.status).toBe(400);
    expect(((await fake.json()) as { message: string }).message).toContain("not a PNG or JPEG");
    const { documentsRepo } = await import("~server/repositories");
    const latest = await documentsRepo.findLatestDocumentUnder(getDb(), id, `customers/${id}/logo/`);
    expect(latest?.id).toBe(body.logo.documentId);
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
