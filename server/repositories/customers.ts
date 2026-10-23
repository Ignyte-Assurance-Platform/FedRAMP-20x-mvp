import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type CustomerRow = typeof schema.customers.$inferSelect;

export async function findCustomer(db: Database, id: string): Promise<CustomerRow | undefined> {
  return db.query.customers.findFirst({ where: eq(schema.customers.id, id) });
}

export async function findCustomerByName(db: Database, name: string): Promise<CustomerRow | undefined> {
  return db.query.customers.findFirst({ where: eq(schema.customers.name, name) });
}

/** Screen B (WI-003): every customer, newest first, with the schema version of its latest Package Overview file; one query. */
export async function listCustomers(db: Database): Promise<Array<CustomerRow & { latestSchemaVersion: string | null }>> {
  // The outer column is written out: inside a subquery Drizzle renders it as a bare "id", which binds to f.id.
  const latest = sql<string | null>`(select f.schema_version from package_overview_files f where f.customer_id = "customers"."id" order by f.generated_at desc limit 1)`;
  const rows = await db
    .select({ customer: schema.customers, latestSchemaVersion: latest })
    .from(schema.customers)
    .orderBy(desc(schema.customers.createdAt));
  return rows.map((r) => ({ ...r.customer, latestSchemaVersion: r.latestSchemaVersion }));
}

export async function findCustomerByTokenHash(db: Database, hash: string): Promise<CustomerRow | undefined> {
  return db.query.customers.findFirst({ where: eq(schema.customers.intakeTokenHash, hash) });
}

type CustomerUpdate = Partial<typeof schema.customers.$inferInsert>;

/** One atomic update of the customer row; returns the row, or undefined when it does not exist. */
export async function updateCustomer(db: Database, id: string, set: CustomerUpdate): Promise<CustomerRow | undefined> {
  const [row] = await db.update(schema.customers).set({ ...set, updatedAt: new Date() }).where(eq(schema.customers.id, id)).returning();
  return row;
}

/** Moves the status only from one of `from`; returns the row when it moved. */
export async function moveStatus(
  db: Database,
  id: string,
  from: Array<CustomerRow["status"]>,
  set: CustomerUpdate & { status: CustomerRow["status"] },
): Promise<CustomerRow | undefined> {
  const [row] = await db
    .update(schema.customers)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(schema.customers.id, id), inArray(schema.customers.status, from)))
    .returning();
  return row;
}

export async function insertCustomer(db: Database, row: typeof schema.customers.$inferInsert): Promise<CustomerRow> {
  const [created] = await db.insert(schema.customers).values(row).returning();
  if (!created) throw new Error("insert into customers returned no row");
  return created;
}
