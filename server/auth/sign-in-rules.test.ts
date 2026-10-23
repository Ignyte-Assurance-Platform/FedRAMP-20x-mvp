import { describe, expect, it } from "vitest";
import { assertGoogleRefreshToken, assertIgnyteProfile, NOT_AUTHORIZED_CODE } from "./auth";

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code;
  }
  return undefined;
}

const DOMAIN = "ignyteplatform.com";

describe("sign-in checks (WI-002)", () => {
  it("2.2 refuses a Google account outside ignyteplatform.com or with an unverified email", () => {
    expect(codeOf(() => assertIgnyteProfile({ hd: "gmail.com", email_verified: true }, DOMAIN))).toBe(NOT_AUTHORIZED_CODE);
    expect(codeOf(() => assertIgnyteProfile({ email_verified: true }, DOMAIN))).toBe(NOT_AUTHORIZED_CODE);
    expect(codeOf(() => assertIgnyteProfile({ hd: DOMAIN, email_verified: false }, DOMAIN))).toBe(NOT_AUTHORIZED_CODE);
    expect(codeOf(() => assertIgnyteProfile({ hd: DOMAIN, email_verified: true }, DOMAIN))).toBeUndefined();
  });

  it("2.10 refuses a Google sign-in that ends without a refresh token", () => {
    expect(codeOf(() => assertGoogleRefreshToken({ providerId: "google" }, "/callback/:id"))).toBe(NOT_AUTHORIZED_CODE);
    expect(codeOf(() => assertGoogleRefreshToken({ providerId: "google", refreshToken: "rt" }, "/callback/:id"))).toBeUndefined();
    // Account writes outside the sign-in callback are not sign-ins.
    expect(codeOf(() => assertGoogleRefreshToken({ providerId: "google" }, "/update-account"))).toBeUndefined();
  });
});
