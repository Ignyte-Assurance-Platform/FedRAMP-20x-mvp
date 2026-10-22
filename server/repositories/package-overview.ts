import { desc, eq } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type PackageOverviewFileRow = typeof schema.packageOverviewFiles.$inferSelect;
export type NewPackageOverviewFileRow = typeof schema.packageOverviewFiles.$inferInsert;

export interface PackageOverviewInputsRow {
  assessorName: string | null;
  assessorId: string | null;
  assessorConfirmedAt: Date | null;
  assessorConfirmedBy: string | null;
  advisorName: string;
}

export async function insertPackageOverviewFile(db: Database, row: NewPackageOverviewFileRow): Promise<PackageOverviewFileRow> {
  const [created] = await db.insert(schema.packageOverviewFiles).values(row).returning();
  if (!created) throw new Error("insert into package_overview_files returned no row");
  return created;
}

export async function findLatestPackageOverviewFile(db: Database, customerId: string): Promise<PackageOverviewFileRow | undefined> {
  return db.query.packageOverviewFiles.findFirst({
    where: eq(schema.packageOverviewFiles.customerId, customerId),
    orderBy: [desc(schema.packageOverviewFiles.generatedAt)],
  });
}

export async function findPackageOverviewInputs(db: Database, customerId: string): Promise<PackageOverviewInputsRow | undefined> {
  return db.query.customers.findFirst({
    where: eq(schema.customers.id, customerId),
    columns: { assessorName: true, assessorId: true, assessorConfirmedAt: true, assessorConfirmedBy: true, advisorName: true },
  });
}

export async function updatePackageOverviewInputs(
  db: Database,
  customerId: string,
  values: Partial<PackageOverviewInputsRow>,
): Promise<void> {
  await db
    .update(schema.customers)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.customers.id, customerId));
}
