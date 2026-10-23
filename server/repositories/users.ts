import { randomUUID } from "node:crypto";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type UserRow = typeof schema.users.$inferSelect;

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
}

/**
 * Makes exactly `emails` the active users (WI-002 E5): missing ones are created, listed ones
 * reactivated, every other user set inactive with all their sessions deleted, in one
 * transaction. Rows are never deleted (they record who created what).
 */
export async function applyAllowlist(db: Database, emails: string[]): Promise<{ active: string[]; deactivated: string[] }> {
  return db.transaction(async (tx) => {
    for (const email of emails) {
      await tx
        .insert(schema.users)
        .values({ id: randomUUID(), email, name: email, emailVerified: true })
        .onConflictDoUpdate({ target: schema.users.email, set: { active: true } });
    }
    const removed = await tx
      .update(schema.users)
      .set({ active: false })
      .where(and(eq(schema.users.active, true), emails.length ? notInArray(schema.users.email, emails) : undefined))
      .returning({ id: schema.users.id, email: schema.users.email });
    const ids = removed.map((u) => u.id);
    if (ids.length) await tx.delete(schema.sessions).where(inArray(schema.sessions.userId, ids));
    return { active: emails, deactivated: removed.map((u) => u.email) };
  });
}

export async function findUser(db: Database, id: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(schema.users.id, id) });
}
