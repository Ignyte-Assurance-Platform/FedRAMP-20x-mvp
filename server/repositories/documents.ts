import { and, desc, eq, like } from "drizzle-orm";
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

/** Every recorded customer logo (`customers/<id>/logo/…`), oldest first. */
export async function listLogoDocuments(db: Database): Promise<DocumentRow[]> {
  return db.query.documents.findMany({
    where: like(schema.documents.objectPath, "customers/%/logo/%"),
    orderBy: [schema.documents.uploadedAt],
  });
}
