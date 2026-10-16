import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type UserRow = typeof schema.users.$inferSelect;

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
}

/** Creates the staff user if missing (allowlist seed, ADR-0004). Returns the row either way. */
export async function ensureUser(db: Database, email: string, name: string): Promise<UserRow> {
  const normalized = email.toLowerCase();
  await db
    .insert(schema.users)
    .values({ id: randomUUID(), email: normalized, name, emailVerified: true })
    .onConflictDoNothing({ target: schema.users.email });
  const row = await findUserByEmail(db, normalized);
  if (!row) throw new Error(`could not create user ${normalized}`);
  return row;
}
