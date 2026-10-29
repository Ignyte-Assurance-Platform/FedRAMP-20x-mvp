import { and, eq, lt, sql } from "drizzle-orm";
import { schema, type Database } from "~server/db";
import { GOOGLE_RECHECK_MS, GROUP_RECHECK_MS } from "~server/auth/staff-session";

/**
 * Claims the 15-minute Google re-check for one request (WI-002 E3): one atomic update, so of
 * several requests of the same session only the one that gets the row calls Google.
 */
export async function claimGoogleCheck(db: Database, sessionId: string, now: Date): Promise<boolean> {
  const due = new Date(now.getTime() - GOOGLE_RECHECK_MS);
  const rows = await db
    .update(schema.sessions)
    .set({ lastGoogleCheckAt: now })
    .where(and(eq(schema.sessions.id, sessionId), lt(schema.sessions.lastGoogleCheckAt, due)))
    .returning({ id: schema.sessions.id });
  return rows.length === 1;
}

/** Puts back the last successful check time when Google was unreachable, unless another request moved it since. */
export async function releaseGoogleCheck(db: Database, sessionId: string, claimedAt: Date, previous: Date): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ lastGoogleCheckAt: previous })
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.lastGoogleCheckAt, claimedAt)));
}

/**
 * Claims the 5-minute staff group re-check for one request (WI-019 E2), the same way as
 * claimGoogleCheck: of several requests of one session only the one that gets the row asks the directory.
 */
export async function claimGroupCheck(db: Database, sessionId: string, now: Date): Promise<boolean> {
  const due = new Date(now.getTime() - GROUP_RECHECK_MS);
  const rows = await db
    .update(schema.sessions)
    .set({ lastGroupCheckAt: now })
    .where(and(eq(schema.sessions.id, sessionId), lt(schema.sessions.lastGroupCheckAt, due)))
    .returning({ id: schema.sessions.id });
  return rows.length === 1;
}

/** Puts back the last successful group check time when the directory was unreachable, unless another request moved it since. */
export async function releaseGroupCheck(db: Database, sessionId: string, claimedAt: Date, previous: Date): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ lastGroupCheckAt: previous })
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.lastGroupCheckAt, claimedAt)));
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function deleteUserSessions(db: Database, userId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** The stored (encrypted) Google refresh token of a user, or null. */
export async function findGoogleRefreshToken(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ refreshToken: schema.accounts.refreshToken })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "google"), sql`${schema.accounts.refreshToken} is not null`))
    .limit(1);
  return row?.refreshToken ?? null;
}
