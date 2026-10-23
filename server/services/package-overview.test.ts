import { describe, expect, it } from "vitest";
import type { PackageOverviewFileRow } from "~server/repositories";
import { checkHostedLogo, compareVersions, logoCheckFor, packageIdForScreen, packageOverviewStatus, type FetchLike } from "./package-overview";

const BASE = "https://storage.googleapis.com/maaz20x-logos/";
const LOGO = `${BASE}customers/8a3c2f9e-1b2d-4c5e-9f00-112233445566/logo/0f1e2d3c.png`;

function fakeFetch(status: number, contentType: string | null, seen: string[] = []): FetchLike {
  return async (url) => {
    seen.push(url);
    return new Response("x", { status, headers: contentType ? { "content-type": contentType } : {} });
  };
}

describe("checkHostedLogo (WI-007 F-f)", () => {
  it("accepts a hosted logo that answers with an image", async () => {
    expect(await checkHostedLogo(LOGO, { logoBaseUrl: BASE, fetch: fakeFetch(200, "image/png") })).toEqual({ ok: true });
  });

  it("refuses a non-image answer or an error status", async () => {
    expect(await checkHostedLogo(LOGO, { logoBaseUrl: BASE, fetch: fakeFetch(200, "text/html") })).toEqual({ ok: false, reason: "answered text/html" });
    expect(await checkHostedLogo(LOGO, { logoBaseUrl: BASE, fetch: fakeFetch(404, "image/png") })).toEqual({ ok: false, reason: "answered 404" });
  });

  it("never requests a host other than Ignyte's", async () => {
    const seen: string[] = [];
    const result = await checkHostedLogo("https://www.example.com/logo.png", { logoBaseUrl: BASE, fetch: fakeFetch(200, "image/png", seen) });
    expect(result).toEqual({ ok: false, reason: "not hosted by Ignyte" });
    expect(seen).toEqual([]);
  });

  it("fails closed when the logo host is not configured or does not answer", async () => {
    expect(await checkHostedLogo(LOGO, { logoBaseUrl: undefined, fetch: fakeFetch(200, "image/png") })).toEqual({
      ok: false,
      reason: "the logo host is not configured",
    });
    const failing: FetchLike = async () => {
      throw new Error("timeout");
    };
    expect(await checkHostedLogo(LOGO, { logoBaseUrl: BASE, fetch: failing })).toEqual({ ok: false, reason: "did not answer within 5 seconds" });
  });

  it("leaves a missing logo to the schema", async () => {
    expect(await checkHostedLogo(null, { logoBaseUrl: BASE, fetch: fakeFetch(500, null) })).toEqual({ ok: true });
  });
});

describe("logoCheckFor", () => {
  it("reports an uploaded logo with no public address as a missing logo host, without requesting anything", async () => {
    const seen: string[] = [];
    const result = await logoCheckFor({ logoUrl: null, logoUploaded: true }, { logoBaseUrl: undefined, fetch: fakeFetch(200, "image/png", seen) });
    expect(result).toEqual({ ok: false, reason: "the logo host is not configured" });
    expect(seen).toEqual([]);
  });

  it("leaves a missing logo to the schema and checks a hosted one", async () => {
    expect(await logoCheckFor({ logoUrl: null, logoUploaded: false }, { logoBaseUrl: BASE, fetch: fakeFetch(500, null) })).toEqual({ ok: true });
    expect(await logoCheckFor({ logoUrl: LOGO, logoUploaded: true }, { logoBaseUrl: BASE, fetch: fakeFetch(200, "image/png") })).toEqual({ ok: true });
  });
});

describe("packageOverviewStatus (WI-007 §3)", () => {
  const file = (over: Partial<PackageOverviewFileRow> = {}): PackageOverviewFileRow => ({
    id: "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e",
    customerId: "8a3c2f9e-1b2d-4c5e-9f00-112233445566",
    generatedAt: new Date("2026-10-21T15:00:00Z"),
    generatedBy: null,
    schemaVersion: "0.2.0",
    schemaCommit: "0e836c0",
    rulesVersion: null,
    valid: true,
    errors: [],
    answersUpdatedAt: new Date("2026-10-21T14:00:00Z"),
    fileName: "ERP-package-overview.json",
    json: "{}\n",
    ...over,
  });

  it("has nothing to show before the first generation", () => {
    expect(packageOverviewStatus(undefined, "0.2.0", null)).toMatchObject({ regenerate: undefined, downloadLabel: undefined });
  });

  it("asks to regenerate a file built on an older vendored schema, and stops once rebuilt", () => {
    expect(packageOverviewStatus(file({ schemaVersion: "0.1.6" }), "0.2.0", null).regenerate).toEqual({ builtOn: "0.1.6", current: "0.2.0" });
    expect(packageOverviewStatus(file(), "0.2.0", null).regenerate).toBeUndefined();
  });

  it("flags answers saved after the file was generated", () => {
    expect(packageOverviewStatus(file(), "0.2.0", new Date("2026-10-21T16:00:00Z")).answersChanged).toBe(true);
    expect(packageOverviewStatus(file(), "0.2.0", new Date("2026-10-21T14:00:00Z")).answersChanged).toBe(false);
  });

  it("labels the download by validity", () => {
    expect(packageOverviewStatus(file(), "0.2.0", null).downloadLabel).toBe("Download");
    expect(packageOverviewStatus(file({ valid: false }), "0.2.0", null).downloadLabel).toBe("Download draft");
  });

  it("compares versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.1")).toBe(1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.1.6", "0.2.0")).toBe(-1);
  });
});

describe("packageIdForScreen (WI-007 §3 package ID fallback)", () => {
  const id = { providerName: "Example Cloud Co.", serviceAcronym: "ERP" };

  it("gives the fallback and an empty row when the package ID is missing or blank", () => {
    for (const answers of [{ serviceIdentification: { ...id } }, { serviceIdentification: { ...id, fedRampPackageId: "  " } }]) {
      const result = packageIdForScreen(answers);
      expect(result.fallback).toBe("Example Cloud Co. ERP");
      expect(result.answers.serviceIdentification).toMatchObject({ fedRampPackageId: "" });
    }
  });

  it("gives no fallback for a typed ID or when the provider name or acronym is missing", () => {
    const typed = { serviceIdentification: { ...id, fedRampPackageId: "FR2401234567" } };
    expect(packageIdForScreen(typed)).toEqual({ answers: typed, fallback: null });
    expect(packageIdForScreen({ serviceIdentification: { providerName: "Example Cloud Co." } }).fallback).toBeNull();
    expect(packageIdForScreen({}).fallback).toBeNull();
  });
});
