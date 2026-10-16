import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getEnv } from "~server/config";
import { createDb } from "./client";

const { db, close } = createDb(getEnv().DATABASE_URL, { max: 1 });
try {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "migrations") });
  console.log("migrations applied");
} finally {
  await close();
}
