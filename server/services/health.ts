import { sql } from "drizzle-orm";
import { getDb, type Database } from "~server/db";

export interface Health {
  status: "ok" | "degraded";
  database: "ok" | "unreachable";
}

export async function checkHealth(db: Database = getDb()): Promise<Health> {
  try {
    await db.execute(sql`select 1`);
    return { status: "ok", database: "ok" };
  } catch {
    return { status: "degraded", database: "unreachable" };
  }
}
