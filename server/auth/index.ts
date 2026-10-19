import { getEnv } from "~server/config";
import { getDb } from "~server/db";
import { createAuth, type Auth } from "./auth";

export { createAuth, type Auth } from "./auth";

let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth(getEnv(), getDb());
  return instance;
}
