import { describe, expect, it } from "vitest";
import { ConfigError, parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://maaz:maaz@localhost:5432/maaz20x",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

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

  it("accepts production without DEV_LOGIN, on Cloud Storage", () => {
    const env = parseEnv({ ...base, NODE_ENV: "production", STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs" });
    expect(env.devLoginEnabled).toBe(false);
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
    expect(parseEnv({ ...base, STORAGE_DRIVER: "gcs", GCS_BUCKET: "maaz-docs" }).GCS_BUCKET).toBe("maaz-docs");
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
});
