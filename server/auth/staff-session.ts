import type { GoogleCheckResult } from "./google-token";

export const GOOGLE_RECHECK_MS = 15 * 60 * 1000;
/** Google unreachable: the session survives only this long after its last successful check (decision 2026-10-23). */
export const GOOGLE_OUTAGE_LIMIT_MS = 60 * 60 * 1000;

export interface StaffSession {
  id: string;
  userId: string;
  expiresAt: Date;
  lastGoogleCheckAt: Date;
}

export interface StaffSessionDeps {
  now: Date;
  /** Google sign-in configured: only then are sessions re-checked against Google. */
  googleEnabled: boolean;
  /** Sessions with no Google account (the dev sign-in) skip the re-check only when this is on. */
  devLoginEnabled: boolean;
  /** Claims the re-check for one request: true when this request moved last_google_check_at to `now`. */
  claimGoogleCheck(sessionId: string, now: Date): Promise<boolean>;
  /** Gives the claim back (Google unreachable) so the next request retries. */
  releaseGoogleCheck(sessionId: string, claimedAt: Date, previous: Date): Promise<void>;
  /** The user's Google refresh token, decrypted, or null when there is no Google account. */
  findRefreshToken(userId: string): Promise<string | null>;
  checkGoogle(refreshToken: string): Promise<GoogleCheckResult>;
  deleteSession(sessionId: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
}

/** expired and revoked return to /login; not_authorized adds the "not authorized" message. */
export type StaffSessionVerdict = { ok: true } | { ok: false; reason: "expired" | "revoked" | "not_authorized" };

/**
 * The staff guard's decision for a session read from the database (WI-002 E1–E3): fixed 8-hour
 * lifetime, the user must be active, and every 15 minutes one request re-checks the Google grant.
 */
export async function evaluateStaffSession(
  session: StaffSession,
  user: { id: string; active: boolean },
  deps: StaffSessionDeps,
): Promise<StaffSessionVerdict> {
  const now = deps.now.getTime();
  if (session.expiresAt.getTime() <= now) {
    await deps.deleteSession(session.id);
    return { ok: false, reason: "expired" };
  }
  if (!user.active) {
    await deps.deleteUserSessions(user.id);
    return { ok: false, reason: "not_authorized" };
  }
  if (!deps.googleEnabled) return { ok: true };
  if (now - session.lastGoogleCheckAt.getTime() < GOOGLE_RECHECK_MS) return { ok: true };
  if (!(await deps.claimGoogleCheck(session.id, deps.now))) return { ok: true };

  const refreshToken = await deps.findRefreshToken(user.id);
  if (!refreshToken) {
    if (deps.devLoginEnabled) return { ok: true };
    await deps.deleteSession(session.id);
    return { ok: false, reason: "not_authorized" };
  }
  const result = await deps.checkGoogle(refreshToken);
  if (result === "ok") return { ok: true };
  if (result === "revoked") {
    await deps.deleteSession(session.id);
    return { ok: false, reason: "revoked" };
  }
  if (now - session.lastGoogleCheckAt.getTime() > GOOGLE_OUTAGE_LIMIT_MS) {
    await deps.deleteSession(session.id);
    return { ok: false, reason: "revoked" };
  }
  await deps.releaseGoogleCheck(session.id, deps.now, session.lastGoogleCheckAt);
  return { ok: true };
}
