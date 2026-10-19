import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { Env } from "~server/config";
import { schema, type Database } from "~server/db";
import { devLoginPlugin } from "./dev-login-plugin";

const EIGHT_HOURS = 8 * 60 * 60;
export const NOT_IGNYTE = "Only verified Ignyte Google Workspace accounts can sign in.";

interface GoogleProfile {
  email?: string;
  email_verified?: boolean;
  hd?: string;
}

/**
 * Better Auth for Ignyte staff (ADR-0004).
 * - Google is configured here but stays inactive until GOOGLE_CLIENT_ID/SECRET exist
 *   (the OAuth client needs the GCP project). The domain check uses the ID token's hd
 *   claim, not the login hint, and only allowlisted users (rows in `users`) can sign in.
 * - No email + password: there is no password flow at all.
 * - Session 8 hours; signed cookie cache of 5 minutes (ADR-0005).
 * - The dev-only sign-in plugin is added only when env.devLoginEnabled.
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
            prompt: "select_account",
            disableSignUp: true,
            // TODO(WI-002): verify once the OAuth client exists (at-risk note 13).
            mapProfileToUser: (profile: GoogleProfile) => {
              if (profile.hd !== env.GOOGLE_ALLOWED_DOMAIN || profile.email_verified !== true) {
                throw new APIError("FORBIDDEN", { message: NOT_IGNYTE, code: "NOT_IGNYTE_ACCOUNT" });
              }
              return {};
            },
          },
        }
      : {},
    // Seeded staff have a `users` row but no `accounts` row; the first Google sign-in links
    // the Google account to that user by verified email instead of being refused as a sign-up.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    // OAuth errors redirect to /login?error=<code>, which shows a readable message.
    onAPIError: { errorURL: "/login" },
    session: {
      expiresIn: EIGHT_HOURS,
      updateAge: 60 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
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
