import { getEnv } from "~server/config";
import { createDb, type Database } from "./client";

export { createDb, type Database } from "./client";
export * as schema from "./schema";

let instance: ReturnType<typeof createDb> | undefined;

/** The process-wide database handle, created on first use. */
export function getDb(): Database {
  instance ??= createDb(getEnv().DATABASE_URL);
  return instance.db;
}

export async function closeDb(): Promise<void> {
  await instance?.close();
  instance = undefined;
}
