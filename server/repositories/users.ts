import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type UserRow = typeof schema.users.$inferSelect;

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
}

/** Sets whether the user may pass the staff guard (WI-019: written by the group membership checks). */
export async function setUserActive(db: Database, id: string, active: boolean): Promise<void> {
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, id));
}

/** The dev sign-in user, created by the local fixture seed instead of the allowlist seed (WI-019); an existing row is reactivated. */
export async function ensureDevUser(db: Database, email: string): Promise<UserRow> {
  const [row] = await db
    .insert(schema.users)
    .values({ id: randomUUID(), email: email.toLowerCase(), name: email, emailVerified: true })
    .onConflictDoUpdate({ target: schema.users.email, set: { active: true } })
    .returning();
  return row!;
}

export async function findUser(db: Database, id: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(schema.users.id, id) });
}
