import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { GoogleOptions } from "better-auth/social-providers";
import { eq } from "drizzle-orm";
import { PRODUCT_NAME } from "~/lib/product";
import type { Env } from "~server/config";
import { schema, type Database } from "~server/db";
import { sessionsRepo, usersRepo } from "~server/repositories";
import { devLoginPlugin } from "./dev-login-plugin";
import { createStaffDirectory, type MembershipResult, type StaffDirectory } from "./staff-directory";

const EIGHT_HOURS = 8 * 60 * 60;
/** Error code on /login?error= for every account that fails a sign-in check (WI-002: one message, no detail). */
export const NOT_AUTHORIZED_CODE = "not_authorized";
/** The one message for every refused account (WI-002 §5 error states). */
export const NOT_AUTHORIZED_MESSAGE = `This account is not authorized for ${PRODUCT_NAME}`;
const NOT_AUTHORIZED_URL = `/login?error=${NOT_AUTHORIZED_CODE}`;
/**
 * Error code on /login?error= when the staff directory did not answer at sign-in (WI-019): outside
 * the refused-account codes, so the page says "Sign-in did not finish. Try again."
 */
export const STAFF_CHECK_UNFINISHED_CODE = "staff_check_unfinished";

/** Thrown from database hooks: the OAuth callback maps the code to /login?error=not_authorized. */
function notAuthorized(): APIError {
  return new APIError("FORBIDDEN", { message: NOT_AUTHORIZED_MESSAGE, code: NOT_AUTHORIZED_CODE });
}

/**
 * Thrown from the provider's getUserInfo, which runs outside that mapping (an APIError there
 * would answer the browser with a JSON 403), so the refusal is the redirect itself.
 */
function notAuthorizedRedirect(): APIError {
  return new APIError("FOUND", undefined, { location: NOT_AUTHORIZED_URL });
}

/**
 * Users are created only by a Google sign-in, after our getUserInfo found the account in the
 * staff group (WI-019): disableSignUp is off, so no other endpoint may create one.
 * Any other social provider added later passes this path test too: it must use a getUserInfo
 * that runs checkStaffAtSignIn, or it would create users without the group check.
 */
export function assertUserCreatedBySignIn(path: string | undefined): void {
  if (!path?.startsWith("/callback/")) throw notAuthorized();
}

export interface SignInMembershipDeps {
  isMember(email: string): Promise<MembershipResult>;
  findUserByEmail(email: string): Promise<{ id: string; active: boolean } | undefined>;
  setUserActive(userId: string, active: boolean): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
}

/**
 * The staff group check at sign-in (WI-019 §3), before Better Auth writes any row. A member who
 * exists inactive is reactivated, so session.create.before lets them in; an existing user who is
 * no longer a member is set inactive and loses every session; unreachable writes nothing.
 */
export async function checkStaffAtSignIn(email: string, deps: SignInMembershipDeps): Promise<MembershipResult> {
  const result = await deps.isMember(email);
  if (result === "unreachable") return result;
  const user = await deps.findUserByEmail(email);
  if (!user) return result;
  if (result === "member") {
    if (!user.active) await deps.setUserActive(user.id, true);
  } else {
    await deps.setUserActive(user.id, false);
    await deps.deleteUserSessions(user.id);
  }
  return result;
}

/** A Google sign-in that ends without a refresh token cannot be re-checked, so it is refused (WI-002 E3). */
export function assertGoogleRefreshToken(account: { providerId?: string; refreshToken?: string | null }, path: string | undefined): void {
  if (account.providerId === "google" && path?.startsWith("/callback/") && !account.refreshToken) throw notAuthorized();
}

/** Google's ID token must carry the Ignyte hosted domain and a verified email; the hd login hint alone is never trusted. */
export function assertIgnyteProfile(profile: GoogleProfile, domain: string): void {
  if (profile.hd !== domain || profile.email_verified !== true || typeof profile.email !== "string") throw notAuthorizedRedirect();
}

/**
 * The provider's user-info step (WI-002 §5). Better Auth's own getUserInfo checks the `hd`
 * option before mapProfileToUser and answers a mismatch with ?error=unable_to_get_user_info
 * ("Sign-in did not finish"), while the spec wants "not authorized" for every failed account
 * check; so the profile is read and checked here. Like the library, the claims are taken from
 * the ID token that Google's token endpoint returned over TLS.
 */
export async function googleUserInfo(
  tokens: { idToken?: string },
  domain: string,
  checkStaff: (email: string) => Promise<MembershipResult>,
): Promise<GoogleUserInfo | null> {
  if (!tokens.idToken) return null;
  const profile = decodeJwtPayload(tokens.idToken);
  assertIgnyteProfile(profile, domain);
  const email = profile.email.toLowerCase();
  const membership = await checkStaff(email);
  if (membership === "not_member") throw notAuthorizedRedirect();
  if (membership === "unreachable") throw new APIError("FOUND", undefined, { location: `/login?error=${STAFF_CHECK_UNFINISHED_CODE}` });
  return {
    user: { name: profile.name, email, image: profile.picture, emailVerified: profile.email_verified === true },
    data: profile,
  };
}

function decodeJwtPayload(token: string): GoogleProfile {
  const [, payload = ""] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleProfile;
}

export type GoogleProfile = Parameters<NonNullable<GoogleOptions["mapProfileToUser"]>>[0];
type GoogleUserInfo = NonNullable<Awaited<ReturnType<NonNullable<GoogleOptions["getUserInfo"]>>>>;

/**
 * Better Auth for Ignyte staff (ADR-0004, WI-002).
 * - Google is configured here but stays inactive until GOOGLE_CLIENT_ID/SECRET exist
 *   (the OAuth client needs the GCP project). The domain check reads the ID token's hd
 *   claim in our own getUserInfo (the library's would answer "did not finish"), not the
 *   login hint, and only members of the staff Google group can sign in (WI-019): the group
 *   is checked there before any row is written, and every 5 minutes in the staff guard.
 * - Offline access with consent, so every sign-in stores a refresh token (encrypted) for the
 *   15-minute re-check in the staff guard; a sign-in without one is refused.
 * - No email + password: there is no password flow at all.
 * - Session fixed at 8 hours, never extended, no cookie cache: the staff guard reads the
 *   database on every request (WI-002 E2; ADR-0005 to be amended).
 * - The dev-only sign-in plugin is added only when env.devLoginEnabled; it creates sessions
 *   through the same hooks, so inactive users are refused there too.
 */
export function createAuth(env: Env, db: Database, directory: StaffDirectory = createStaffDirectory(env)) {
  const membershipDeps: SignInMembershipDeps = {
    isMember: (email) => directory.isMember(email),
    findUserByEmail: (email) => usersRepo.findUserByEmail(db, email),
    setUserActive: (userId, active) => usersRepo.setUserActive(db, userId, active),
    deleteUserSessions: (userId) => sessionsRepo.deleteUserSessions(db, userId),
  };
  const checkStaff = (email: string) => checkStaffAtSignIn(email, membershipDeps);
  const options = {
    appName: PRODUCT_NAME,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: env.googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            hd: env.GOOGLE_ALLOWED_DOMAIN,
            prompt: "select_account consent",
            accessType: "offline",
            // Verified before production, once the OAuth client exists (WI-002 [pre-prod]).
            getUserInfo: (tokens) => googleUserInfo(tokens, env.GOOGLE_ALLOWED_DOMAIN, checkStaff),
          },
        }
      : {},
    // Users that exist without an `accounts` row (the allowlist seed wrote them before WI-019)
    // get the Google account linked by verified email on their first sign-in.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] }, encryptOAuthTokens: true },
    user: {
      additionalFields: {
        active: { type: "boolean", required: false, defaultValue: true, input: false },
        lastLoginAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: { before: async (_user, ctx) => assertUserCreatedBySignIn(ctx?.path) },
      },
      account: {
        create: { before: async (account, ctx) => assertGoogleRefreshToken(account, ctx?.path) },
        update: { before: async (account, ctx) => assertGoogleRefreshToken(account, ctx?.path) },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db.select({ active: schema.users.active }).from(schema.users).where(eq(schema.users.id, session.userId));
            if (!user?.active) throw notAuthorized();
          },
          after: async (session) => {
            await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, session.userId));
          },
        },
      },
    },
    // OAuth errors redirect to /login?error=<code>, which shows a readable message.
    onAPIError: { errorURL: "/login" },
    session: {
      expiresIn: EIGHT_HOURS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      additionalFields: {
        lastGoogleCheckAt: { type: "date", required: false, input: false, defaultValue: () => new Date() },
        // A sign-in has just checked the group, so the first re-check is 5 minutes later (WI-019 E2).
        lastGroupCheckAt: { type: "date", required: false, input: false, defaultValue: () => new Date() },
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: () => crypto.randomUUID() },
    },
    telemetry: { enabled: false },
    plugins: env.devLoginEnabled ? [devLoginPlugin({ email: env.DEV_LOGIN_EMAIL, staffDirectory: env.STAFF_DIRECTORY, isMember: (email) => directory.isMember(email) })] : [],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
