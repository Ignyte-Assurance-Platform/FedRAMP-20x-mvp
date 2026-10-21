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
let closeDb: () => Promise<void>;

beforeAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
  const server = await import("~server/index");
  const build = (await import(pathToFileURL(path.join(root, "build/server/index.js")).href)) as ServerBuild;
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

  it("signs in without Google and shows a no-store page with the user's data", async () => {
    const signIn = await app.request("http://localhost:3000/api/dev-login", { method: "POST" });
    expect(signIn.status).toBe(303);
    const cookies = signIn.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("session_token"))).toBe(true);

    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const home = await app.request("/", { headers: { cookie } });
    expect(home.status).toBe(200);
    expect(home.headers.get("cache-control")).toBe("no-store");
    expect(await home.text()).toContain("dev@ignyteplatform.com");

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
