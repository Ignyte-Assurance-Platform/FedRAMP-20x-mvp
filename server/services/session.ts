import { getAuth } from "~server/auth";
import { getEnv } from "~server/config";

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

/** The signed-in staff user for a request, or null. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
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
