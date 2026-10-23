import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { Env } from "~server/config";
import { schema, type Database } from "~server/db";
import { devLoginPlugin } from "./dev-login-plugin";

const EIGHT_HOURS = 8 * 60 * 60;
/** Error code on /login?error= for every account that fails a sign-in check (WI-002: one message, no detail). */
export const NOT_AUTHORIZED_CODE = "not_authorized";

function notAuthorized(): APIError {
  return new APIError("FORBIDDEN", { message: "This account is not authorized for Maaz 20x", code: NOT_AUTHORIZED_CODE });
}

/** A Google sign-in that ends without a refresh token cannot be re-checked, so it is refused (WI-002 E3). */
export function assertGoogleRefreshToken(account: { providerId?: string; refreshToken?: string | null }, path: string | undefined): void {
  if (account.providerId === "google" && path?.startsWith("/callback/") && !account.refreshToken) throw notAuthorized();
}

/** Google's ID token must carry the Ignyte hosted domain and a verified email; the hd login hint alone is never trusted. */
export function assertIgnyteProfile(profile: GoogleProfile, domain: string): void {
  if (profile.hd !== domain || profile.email_verified !== true) throw notAuthorized();
}

interface GoogleProfile {
  email?: string;
  email_verified?: boolean;
  hd?: string;
}

/**
 * Better Auth for Ignyte staff (ADR-0004, WI-002).
 * - Google is configured here but stays inactive until GOOGLE_CLIENT_ID/SECRET exist
 *   (the OAuth client needs the GCP project). The domain check uses the ID token's hd
 *   claim, not the login hint, and only allowlisted, active users can sign in.
 * - Offline access with consent, so every sign-in stores a refresh token (encrypted) for the
 *   15-minute re-check in the staff guard; a sign-in without one is refused.
 * - No email + password: there is no password flow at all.
 * - Session fixed at 8 hours, never extended, no cookie cache: the staff guard reads the
 *   database on every request (WI-002 E2; ADR-0005 to be amended).
 * - The dev-only sign-in plugin is added only when env.devLoginEnabled; it creates sessions
 *   through the same hooks, so inactive users are refused there too.
 */
export function createAuth(env: Env, db: Database) {
  const options = {
    appName: "Maaz 20x",
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
            disableSignUp: true,
            // Verified before production, once the OAuth client exists (WI-002 [pre-prod]).
            mapProfileToUser: (profile: GoogleProfile) => {
              assertIgnyteProfile(profile, env.GOOGLE_ALLOWED_DOMAIN);
              return {};
            },
          },
        }
      : {},
    // Seeded staff have a `users` row but no `accounts` row; the first Google sign-in links
    // the Google account to that user by verified email instead of being refused as a sign-up.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] }, encryptOAuthTokens: true },
    user: {
      additionalFields: {
        active: { type: "boolean", required: false, defaultValue: true, input: false },
        lastLoginAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
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
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: () => crypto.randomUUID() },
    },
    telemetry: { enabled: false },
    plugins: env.devLoginEnabled ? [devLoginPlugin({ email: env.DEV_LOGIN_EMAIL })] : [],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
