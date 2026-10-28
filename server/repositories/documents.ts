import { and, asc, desc, eq, isNull, like } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type DocumentRow = typeof schema.documents.$inferSelect;
export type NewDocumentRow = typeof schema.documents.$inferInsert;

export async function insertDocument(db: Database, row: NewDocumentRow): Promise<DocumentRow> {
  const [created] = await db.insert(schema.documents).values(row).returning();
  if (!created) throw new Error("insert into documents returned no row");
  return created;
}

export async function findDocument(db: Database, id: string): Promise<DocumentRow | undefined> {
  return db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
}

/** The newest document of a customer whose object path starts with `prefix` (e.g. the hosted logo). */
export async function findLatestDocumentUnder(db: Database, customerId: string, prefix: string): Promise<DocumentRow | undefined> {
  return db.query.documents.findFirst({
    where: and(eq(schema.documents.customerId, customerId), like(schema.documents.objectPath, `${prefix}%`)),
    orderBy: [desc(schema.documents.uploadedAt)],
  });
}

/** customers/<id>/intake/: tab 3 documents only, never the logo (WI-006). */
const intakeOf = (customerId: string) =>
  and(eq(schema.documents.customerId, customerId), like(schema.documents.objectPath, `customers/${customerId}/intake/%`));

/** A customer's tab 3 documents that are not removed, oldest first; `current` leaves out replaced versions. */
export async function listIntakeDocuments(db: Database, customerId: string, options: { current: boolean }): Promise<DocumentRow[]> {
  return db.query.documents.findMany({
    where: and(intakeOf(customerId), isNull(schema.documents.removedAt), options.current ? isNull(schema.documents.supersededAt) : undefined),
    orderBy: [asc(schema.documents.uploadedAt), asc(schema.documents.id)],
  });
}

/** One tab 3 document of this customer, removed or not. */
export async function findIntakeDocument(db: Database, customerId: string, id: string): Promise<DocumentRow | undefined> {
  return db.query.documents.findFirst({ where: and(intakeOf(customerId), eq(schema.documents.id, id)) });
}

export type DocumentFields = Partial<Pick<NewDocumentRow, "displayName" | "kind" | "kindNote" | "policyVersion" | "policyUpdatedOn">>;

/** Rename and "What is this?": only a current, not removed document of this customer changes. */
export async function updateCurrentIntakeDocument(db: Database, customerId: string, id: string, fields: DocumentFields): Promise<DocumentRow | undefined> {
  const [row] = await db
    .update(schema.documents)
    .set(fields)
    .where(and(intakeOf(customerId), eq(schema.documents.id, id), isNull(schema.documents.supersededAt), isNull(schema.documents.removedAt)))
    .returning();
  return row;
}

/**
 * Replace (2.13): inserts the new version and marks the one it replaces superseded, together. Null
 * when the replaced version is no longer current (replaced or removed meanwhile): nothing is written.
 */
export async function insertReplacement(db: Database, row: NewDocumentRow & { replacesDocumentId: string }, now: Date): Promise<DocumentRow | null> {
  try {
    return await db.transaction(async (tx) => {
      const created = await insertDocument(tx as unknown as Database, row);
      const [replaced] = await tx
        .update(schema.documents)
        .set({ supersededAt: now })
        .where(
          and(
            intakeOf(row.customerId),
            eq(schema.documents.id, row.replacesDocumentId),
            isNull(schema.documents.supersededAt),
            isNull(schema.documents.removedAt),
          ),
        )
        .returning();
      if (!replaced) throw new NotCurrent();
      return created;
    });
  } catch (error) {
    if (error instanceof NotCurrent) return null;
    throw error;
  }
}

class NotCurrent extends Error {}

/** Soft removal (2.17): the row is hidden on both sides, the object stays. Null when it is not there or already removed; the customer's x only reaches current versions. */
export async function removeIntakeDocument(db: Database, customerId: string, id: string, removedBy: string, now: Date, options: { currentOnly: boolean }): Promise<DocumentRow | undefined> {
  const [row] = await db
    .update(schema.documents)
    .set({ removedAt: now, removedBy })
    .where(
      and(intakeOf(customerId), eq(schema.documents.id, id), isNull(schema.documents.removedAt), options.currentOnly ? isNull(schema.documents.supersededAt) : undefined),
    )
    .returning();
  return row;
}

/** Every recorded customer logo (`customers/<id>/logo/…`), oldest first. */
export async function listLogoDocuments(db: Database): Promise<DocumentRow[]> {
  return db.query.documents.findMany({
    where: like(schema.documents.objectPath, "customers/%/logo/%"),
    orderBy: [schema.documents.uploadedAt],
  });
}
