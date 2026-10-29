import { google } from "better-auth/social-providers";
import { describe, expect, it, vi } from "vitest";
import {
  assertGoogleRefreshToken,
  assertUserCreatedBySignIn,
  checkStaffAtSignIn,
  googleUserInfo,
  NOT_AUTHORIZED_CODE,
  STAFF_CHECK_UNFINISHED_CODE,
  type SignInMembershipDeps,
} from "./auth";
import type { MembershipResult } from "./staff-directory";

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
// The staff group check is stubbed here (every Ignyte account a member unless the test says otherwise).
function providerWith(checkStaff: (email: string) => Promise<MembershipResult>) {
  return google({ clientId: "id", clientSecret: "secret", hd: DOMAIN, getUserInfo: (tokens) => googleUserInfo(tokens, DOMAIN, checkStaff) });
}
const provider = providerWith(async () => "member");

/** Where the callback sends the browser when the profile is refused, or undefined when it is accepted. */
async function refusalOf(claims: Record<string, unknown>, p = provider): Promise<string | undefined> {
  try {
    await p.getUserInfo({ idToken: idToken(claims) });
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
    // A token without an email is refused as well, not a 500 when it is lowercased.
    expect(await refusalOf({ ...ignyte, email: undefined })).toBe(refused);
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

/** One users table in memory, with the writes the membership check may make. */
function usersTable(rows: { id: string; email: string; active: boolean }[], isMember: (email: string) => Promise<MembershipResult>) {
  const sessions = new Map(rows.map((r) => [r.id, 2]));
  const deps: SignInMembershipDeps = {
    isMember: vi.fn(isMember),
    findUserByEmail: vi.fn(async (email: string) => rows.find((r) => r.email === email)),
    setUserActive: vi.fn(async (id: string, active: boolean) => {
      rows.find((r) => r.id === id)!.active = active;
    }),
    deleteUserSessions: vi.fn(async (id: string) => {
      sessions.set(id, 0);
    }),
  };
  return { rows, sessions, deps };
}

describe("staff group check at sign-in (WI-019)", () => {
  const ignyte = { hd: DOMAIN, email: "Max@IgnytePlatform.com", email_verified: true, name: "Max" };

  it("2.1 passes a group member on to Better Auth, which creates the user; nothing is written before", async () => {
    const t = usersTable([], async () => "member");
    const info = await providerWith((email) => checkStaffAtSignIn(email, t.deps)).getUserInfo({ idToken: idToken(ignyte) });
    expect(info?.user.email).toBe("max@ignyteplatform.com");
    // Asked with the verified, lowercased email.
    expect(t.deps.isMember).toHaveBeenCalledWith("max@ignyteplatform.com");
    expect(t.deps.setUserActive).not.toHaveBeenCalled();
  });

  it("2.2 refuses an Ignyte account outside the group as not authorized and writes nothing", async () => {
    const t = usersTable([], async () => "not_member");
    const p = providerWith((email) => checkStaffAtSignIn(email, t.deps));
    expect(await refusalOf(ignyte, p)).toBe(`/login?error=${NOT_AUTHORIZED_CODE}`);
    expect(t.deps.setUserActive).not.toHaveBeenCalled();
    expect(t.deps.deleteUserSessions).not.toHaveBeenCalled();
  });

  it("2.3 sets an existing user who left the group inactive, deletes their sessions and refuses them", async () => {
    const t = usersTable([{ id: "u1", email: "max@ignyteplatform.com", active: true }], async () => "not_member");
    const p = providerWith((email) => checkStaffAtSignIn(email, t.deps));
    expect(await refusalOf(ignyte, p)).toBe(`/login?error=${NOT_AUTHORIZED_CODE}`);
    expect(t.rows[0]!.active).toBe(false);
    expect(t.sessions.get("u1")).toBe(0);
  });

  it("2.4 reactivates an existing inactive user who is in the group, before the session is created", async () => {
    const t = usersTable([{ id: "u1", email: "max@ignyteplatform.com", active: false }], async () => "member");
    expect(await refusalOf(ignyte, providerWith((email) => checkStaffAtSignIn(email, t.deps)))).toBeUndefined();
    expect(t.rows[0]!.active).toBe(true);
    expect(t.deps.deleteUserSessions).not.toHaveBeenCalled();
  });

  it("2.5 sends the browser to 'did not finish' and writes nothing when the directory does not answer", async () => {
    const t = usersTable([{ id: "u1", email: "max@ignyteplatform.com", active: true }], async () => "unreachable");
    expect(await refusalOf(ignyte, providerWith((email) => checkStaffAtSignIn(email, t.deps)))).toBe(`/login?error=${STAFF_CHECK_UNFINISHED_CODE}`);
    expect(t.deps.findUserByEmail).not.toHaveBeenCalled();
    expect(t.rows[0]!.active).toBe(true);
    expect(t.sessions.get("u1")).toBe(2);
  });

  it("asks the directory only after the hd and email_verified checks passed", async () => {
    const checkStaff = vi.fn(async (): Promise<MembershipResult> => "member");
    await refusalOf({ ...ignyte, hd: "gmail.com" }, providerWith(checkStaff));
    expect(checkStaff).not.toHaveBeenCalled();
  });

  it("allows creating a user only on the Google sign-in callback", () => {
    expect(codeOf(() => assertUserCreatedBySignIn("/callback/:id"))).toBeUndefined();
    for (const path of ["/sign-up/email", "/dev/sign-in", "/update-user", undefined]) {
      expect(codeOf(() => assertUserCreatedBySignIn(path))).toBe(NOT_AUTHORIZED_CODE);
    }
  });
});
