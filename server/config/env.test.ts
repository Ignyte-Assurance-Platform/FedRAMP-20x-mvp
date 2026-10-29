import { describe, expect, it } from "vitest";
import { ConfigError, parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://maaz:maaz@localhost:5432/maaz20x",
  BETTER_AUTH_SECRET: "x".repeat(32),
};
const KEY = Buffer.alloc(32, 7).toString("base64");

describe("parseEnv", () => {
  it("applies defaults for local development", () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.devLoginEnabled).toBe(false);
    expect(env.googleEnabled).toBe(false);
  });

  it("enables the dev sign-in only with NODE_ENV=development and DEV_LOGIN=1", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development", DEV_LOGIN: "1" }).devLoginEnabled).toBe(true);
    expect(parseEnv({ ...base, NODE_ENV: "development", DEV_LOGIN: "true" }).devLoginEnabled).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: "test", DEV_LOGIN: "1" }).devLoginEnabled).toBe(false);
  });

  it.each(["1", "0", "", "false"])("refuses NODE_ENV=production with DEV_LOGIN=%j", (value) => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", DEV_LOGIN: value })).toThrowError(
      /Refusing to start: DEV_LOGIN is set while NODE_ENV=production/,
    );
  });

  it.each(["/tmp/rules", ""])("refuses NODE_ENV=production with FEDRAMP_RULES_DIR=%j (WI-005 E1)", (value) => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", FEDRAMP_RULES_DIR: value })).toThrowError(
      /Refusing to start: FEDRAMP_RULES_DIR is set while NODE_ENV=production/,
    );
  });

  it("accepts production without DEV_LOGIN, on Cloud Storage", () => {
    const env = parseEnv({ ...base, NODE_ENV: "production", STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-logos", LOGO_PUBLIC_BASE_URL: "https://logos.example.com/", INTAKE_LINK_KEY: KEY });
    expect(env.devLoginEnabled).toBe(false);
  });

  it.each([undefined, ""])("refuses production with LOGO_PUBLIC_BASE_URL=%j (WI-007: no file can carry a logo address)", (value) => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-logos", LOGO_PUBLIC_BASE_URL: value, INTAKE_LINK_KEY: KEY })).toThrowError(
      /Refusing to start: LOGO_PUBLIC_BASE_URL must be set in production/,
    );
  });

  it.each([undefined, "local"])("refuses production with STORAGE_DRIVER=%j", (driver) => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", STORAGE_DRIVER: driver })).toThrowError(
      /Refusing to start: STORAGE_DRIVER must be gcs in production/,
    );
  });

  it("reports every invalid variable at once", () => {
    try {
      parseEnv({ DATABASE_URL: "mysql://nope", BETTER_AUTH_SECRET: "short" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain("DATABASE_URL");
      expect((error as Error).message).toContain("BETTER_AUTH_SECRET");
    }
  });

  it("requires a bucket for the Cloud Storage driver", () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: "gcs" })).toThrowError(/GCS_BUCKET/);
    expect(parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-logos" }).GCS_BUCKET).toBe("maaz-docs");
  });

  it("requires the logos bucket for the Cloud Storage driver (WI-018)", () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs" })).toThrowError(/GCS_LOGO_BUCKET/);
    expect(parseEnv(base).LOCAL_LOGO_DIR).toBe(".data/logos");
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-docs" })).toThrowError(/must not be the documents bucket/);
  });

  it("treats Google as configured only when both id and secret are set", () => {
    expect(() => parseEnv({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrowError(/must be set together/);
    expect(parseEnv({ ...base, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }).googleEnabled).toBe(false);
    expect(parseEnv({ ...base, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).googleEnabled).toBe(true);
  });

  it("normalises the admin allowlist", () => {
    expect(parseEnv({ ...base, ADMIN_EMAILS: " A@ignyteplatform.com, ,b@ignyteplatform.com" }).adminEmails).toEqual([
      "a@ignyteplatform.com",
      "b@ignyteplatform.com",
    ]);
  });

  it("treats an empty logo base URL as not set and rejects one that is not a URL", () => {
    expect(parseEnv({ ...base, LOGO_PUBLIC_BASE_URL: "" }).LOGO_PUBLIC_BASE_URL).toBeUndefined();
    expect(parseEnv({ ...base, LOGO_PUBLIC_BASE_URL: "https://logos.example.com/", INTAKE_LINK_KEY: KEY }).LOGO_PUBLIC_BASE_URL).toBe("https://logos.example.com/");
    expect(() => parseEnv({ ...base, LOGO_PUBLIC_BASE_URL: "not a url" })).toThrow(ConfigError);
  });
});

describe("INTAKE_LINK_KEY (WI-003)", () => {
  const prod = { ...base, NODE_ENV: "production", STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs", GCS_LOGO_BUCKET: "maaz-logos", LOGO_PUBLIC_BASE_URL: "https://logos.example.com/" };
  it("refuses production without it and rejects a key that is not 32 bytes", () => {
    expect(() => parseEnv(prod)).toThrowError(/INTAKE_LINK_KEY must be set in production/);
    expect(() => parseEnv({ ...prod, INTAKE_LINK_KEY: "c2hvcnQ=" })).toThrowError(/32 bytes/);
    expect(parseEnv({ ...prod, INTAKE_LINK_KEY: KEY }).intakeLinkKey).toEqual(Buffer.alloc(32, 7));
  });

  it("derives a local key from BETTER_AUTH_SECRET outside production", () => {
    expect(parseEnv(base).intakeLinkKey).toHaveLength(32);
  });
});
