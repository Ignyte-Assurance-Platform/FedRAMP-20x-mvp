import { eq } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type CustomerRow = typeof schema.customers.$inferSelect;

export async function findCustomer(db: Database, id: string): Promise<CustomerRow | undefined> {
  return db.query.customers.findFirst({ where: eq(schema.customers.id, id) });
}

export async function findCustomerByName(db: Database, name: string): Promise<CustomerRow | undefined> {
  return db.query.customers.findFirst({ where: eq(schema.customers.name, name) });
}

export async function insertCustomer(db: Database, row: typeof schema.customers.$inferInsert): Promise<CustomerRow> {
  const [created] = await db.insert(schema.customers).values(row).returning();
  if (!created) throw new Error("insert into customers returned no row");
  return created;
}
