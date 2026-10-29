import { getEnv } from "~server/config";
import { getDb } from "~server/db";
import { createAuth, type Auth } from "./auth";
import { createStaffDirectory, type StaffDirectory } from "./staff-directory";

export { createAuth, type Auth } from "./auth";

let instance: Auth | undefined;
let directory: StaffDirectory | undefined;

/** One staff directory per process (WI-019), so the google driver reuses its cached access token. */
export function getStaffDirectory(): StaffDirectory {
  directory ??= createStaffDirectory(getEnv());
  return directory;
}

export function getAuth(): Auth {
  instance ??= createAuth(getEnv(), getDb(), getStaffDirectory());
  return instance;
}
