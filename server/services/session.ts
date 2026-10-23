import { decryptOAuthToken } from "better-auth/oauth2";
import { getAuth } from "~server/auth";
import { NOT_AUTHORIZED_CODE } from "~server/auth/auth";
import { checkGoogleGrant } from "~server/auth/google-token";
import { evaluateStaffSession, type StaffSessionDeps } from "~server/auth/staff-session";
import { getEnv } from "~server/config";
import { getDb } from "~server/db";
import { sessionsRepo } from "~server/repositories";

export const NOT_AUTHORIZED_MESSAGE = "This account is not authorized for Maaz 20x";
export const SIGN_IN_UNFINISHED_MESSAGE = "Sign-in did not finish. Try again.";

/** Codes Better Auth puts on /login?error= when the account itself fails a check (WI-002 error states). */
const ACCOUNT_REFUSED = [NOT_AUTHORIZED_CODE, "signup_disabled", "account_not_linked", "email_not_found"];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface SignInOptions {
  devLogin: boolean;
  google: boolean;
}

/** Which sign-in buttons the login screen may show. */
export function getSignInOptions(): SignInOptions {
  const env = getEnv();
  return { devLogin: env.devLoginEnabled, google: env.googleEnabled };
}

/**
 * Text for the `?error=` code on /login (WI-002 error states): one message for any account
 * that fails a check, with no detail on which one; anything else (cancelled at Google, an
 * OAuth error, Google unreachable) is "did not finish". Codes are confirmed [pre-prod].
 */
export function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.toLowerCase().replaceAll(" ", "_");
  return ACCOUNT_REFUSED.includes(normalized) ? NOT_AUTHORIZED_MESSAGE : SIGN_IN_UNFINISHED_MESSAGE;
}

export type StaffResolution = { user: SessionUser } | { refused: "no_session" | "expired" | "revoked" | "not_authorized" };

/**
 * The staff session of a request, read from the database (never the cookie cache) and checked
 * by the one staff guard (WI-002 E1–E3): fixed 8 hours, active user, Google re-check every 15 minutes.
 */
export async function resolveStaffUser(request: Request): Promise<StaffResolution> {
  const found = await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!found) return { refused: "no_session" };
  const verdict = await evaluateStaffSession(
    {
      id: found.session.id,
      userId: found.session.userId,
      expiresAt: new Date(found.session.expiresAt),
      lastGoogleCheckAt: new Date(found.session.lastGoogleCheckAt ?? found.session.createdAt),
    },
    { id: found.user.id, active: found.user.active !== false },
    staffSessionDeps(),
  );
  if (!verdict.ok) return { refused: verdict.reason };
  return { user: { id: found.user.id, email: found.user.email, name: found.user.name } };
}

function staffSessionDeps(): StaffSessionDeps {
  const env = getEnv();
  const db = getDb();
  return {
    now: new Date(),
    googleEnabled: env.googleEnabled,
    devLoginEnabled: env.devLoginEnabled,
    claimGoogleCheck: (id, now) => sessionsRepo.claimGoogleCheck(db, id, now),
    releaseGoogleCheck: (id, claimedAt, previous) => sessionsRepo.releaseGoogleCheck(db, id, claimedAt, previous),
    findRefreshToken: async (userId) => {
      const stored = await sessionsRepo.findGoogleRefreshToken(db, userId);
      if (!stored) return null;
      // $context is typed with this app's options; decryptOAuthToken takes the generic AuthContext.
      const context = (await getAuth().$context) as unknown as Parameters<typeof decryptOAuthToken>[1];
      return decryptOAuthToken(stored, context);
    },
    checkGoogle: (refreshToken) =>
      checkGoogleGrant(refreshToken, { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! }),
    deleteSession: (id) => sessionsRepo.deleteSession(db, id),
    deleteUserSessions: (userId) => sessionsRepo.deleteUserSessions(db, userId),
  };
}

/**
 * Runs the dev-only sign-in and returns a redirect home carrying the session cookie.
 * Returns null when the dev sign-in is off, so the caller answers 404.
 */
export async function signInDev(request: Request): Promise<Response | null> {
  if (!getEnv().devLoginEnabled) return null;
  const url = new URL("/api/auth/dev/sign-in", request.url);
  const result = await getAuth().handler(new Request(url, { method: "POST", headers: request.headers }));
  if (!result.ok) return result;
  return redirectWithCookies("/", result.headers);
}

/** Starts Google sign-in; null while Google is not configured (ADR-0004). */
export async function startGoogleSignIn(request: Request): Promise<Response | null> {
  if (!getEnv().googleEnabled) return null;
  const result = await getAuth().api.signInSocial({
    body: { provider: "google", callbackURL: "/" },
    headers: request.headers,
    asResponse: true,
  });
  const { url } = (await result.clone().json()) as { url?: string };
  if (!result.ok || !url) return result;
  return redirectWithCookies(url, result.headers);
}

export async function signOut(request: Request): Promise<Response> {
  const result = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  return redirectWithCookies("/login", result.headers);
}

function redirectWithCookies(location: string, from: Headers): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of from.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/**
 * The one staff guard (WI-002 E1, WI-007 §6): every Ignyte loader and action calls it. The only
 * credential accepted is a valid staff session; a customer link token (WI-004) is not a
 * session, so a request that presents one, or nothing, is refused: pages are sent to /login
 * (with "not authorized" when the account was refused), resource routes answer 401.
 * Thrown Responses are returned as-is by React Router.
 */
export async function requireStaffUser(request: Request, kind: "page" | "api" = "page"): Promise<SessionUser> {
  const result = await resolveStaffUser(request);
  if ("user" in result) return result.user;
  if (kind === "api") throw new Response("Unauthorized", { status: 401 });
  const location = result.refused === "not_authorized" ? `/login?error=${NOT_AUTHORIZED_CODE}` : "/login";
  throw new Response(null, { status: 302, headers: { Location: location } });
}
