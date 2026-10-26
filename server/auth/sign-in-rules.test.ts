import { google } from "better-auth/social-providers";
import { describe, expect, it } from "vitest";
import { assertGoogleRefreshToken, googleUserInfo, NOT_AUTHORIZED_CODE } from "./auth";

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code;
  }
  return undefined;
}

const DOMAIN = "ignyteplatform.com";

/** An ID token as Google's token endpoint returns it; the claims are what matters here, not the signature. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.signature`;
}

// The Google provider as Better Auth builds it from createAuth's options: `hd` stays the login
// hint, our getUserInfo replaces the library's (which would answer "did not finish" on a bad hd).
const provider = google({ clientId: "id", clientSecret: "secret", hd: DOMAIN, getUserInfo: (tokens) => googleUserInfo(tokens, DOMAIN) });

/** Where the callback sends the browser when the profile is refused, or undefined when it is accepted. */
async function refusalOf(claims: Record<string, unknown>): Promise<string | undefined> {
  try {
    await provider.getUserInfo({ idToken: idToken(claims) });
  } catch (e) {
    const error = e as { status?: string; headers?: Record<string, string> };
    expect(error.status).toBe("FOUND");
    return error.headers?.location;
  }
  return undefined;
}

describe("sign-in checks (WI-002)", () => {
  const ignyte = { hd: DOMAIN, email: "max@ignyteplatform.com", email_verified: true, name: "Max", picture: "https://example.test/max.png" };

  it("2.2 refuses a Google account outside ignyteplatform.com or with an unverified email", async () => {
    const refused = `/login?error=${NOT_AUTHORIZED_CODE}`;
    expect(await refusalOf({ ...ignyte, hd: "gmail.com" })).toBe(refused);
    expect(await refusalOf({ ...ignyte, hd: undefined })).toBe(refused);
    expect(await refusalOf({ ...ignyte, email_verified: false })).toBe(refused);
    expect(await refusalOf(ignyte)).toBeUndefined();
  });

  it("2.2 passes an Ignyte profile on to Better Auth with its email, name and picture", async () => {
    const info = await provider.getUserInfo({ idToken: idToken(ignyte) });
    expect(info?.user).toEqual({ name: "Max", email: "max@ignyteplatform.com", image: "https://example.test/max.png", emailVerified: true });
    expect(info?.data.hd).toBe(DOMAIN);
    // Google's token response always carries an ID token; without one there is no profile at all.
    expect(await provider.getUserInfo({})).toBeNull();
  });

  it("2.10 refuses a Google sign-in that ends without a refresh token", () => {
    expect(codeOf(() => assertGoogleRefreshToken({ providerId: "google" }, "/callback/:id"))).toBe(NOT_AUTHORIZED_CODE);
    expect(codeOf(() => assertGoogleRefreshToken({ providerId: "google", refreshToken: "rt" }, "/callback/:id"))).toBeUndefined();
    // Account writes outside the sign-in callback are not sign-ins.
    expect(codeOf(() => assertGoogleRefreshToken({ providerId: "google" }, "/update-account"))).toBeUndefined();
  });
});
