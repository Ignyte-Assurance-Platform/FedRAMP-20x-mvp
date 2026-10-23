import { describe, expect, it } from "vitest";
import { AllowlistError, allowlistEmails } from "./allowlist";

const base = { devLoginEmail: "dev@ignyteplatform.com", domain: "ignyteplatform.com" };

describe("allowlist seed (WI-002 E5)", () => {
  it("2.15 makes exactly ADMIN_EMAILS active in production, normalised", () => {
    const adminEmails = ["Max@ignyteplatform.com", " jesus.p@ignyteplatform.com", "max@ignyteplatform.com"];
    expect(allowlistEmails({ ...base, nodeEnv: "production", adminEmails })).toEqual(["max@ignyteplatform.com", "jesus.p@ignyteplatform.com"]);
  });

  it("2.15 fails on an email outside ignyteplatform.com", () => {
    const adminEmails = ["max@ignyteplatform.com", "max@gmail.com"];
    expect(() => allowlistEmails({ ...base, nodeEnv: "development", adminEmails })).toThrow(AllowlistError);
  });

  it("2.15 fails on an empty ADMIN_EMAILS in production only", () => {
    expect(() => allowlistEmails({ ...base, nodeEnv: "production", adminEmails: [] })).toThrow(/empty/);
    expect(allowlistEmails({ ...base, nodeEnv: "development", adminEmails: [] })).toEqual(["dev@ignyteplatform.com"]);
  });

  it("adds the dev sign-in user outside production, exempt from the domain check", () => {
    const result = allowlistEmails({ ...base, devLoginEmail: "dev@example.test", nodeEnv: "test", adminEmails: ["max@ignyteplatform.com"] });
    expect(result).toEqual(["max@ignyteplatform.com", "dev@example.test"]);
  });
});
