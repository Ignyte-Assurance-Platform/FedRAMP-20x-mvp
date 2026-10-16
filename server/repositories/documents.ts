import { eq } from "drizzle-orm";
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
