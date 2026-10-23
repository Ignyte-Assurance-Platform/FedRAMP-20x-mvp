/**
 * Local fixture seed: one fictional customer so uploads have somewhere to land. Staff users
 * come from the allowlist seed (seed-allowlist.ts, WI-002 E5); production never runs this file.
 */
import { getEnv } from "~server/config";
import { customersRepo, usersRepo } from "~server/repositories";
import { createDb } from "./client";

export const SEED_CUSTOMER_NAME = "Example Cloud Co (fictional seed)";

const env = getEnv();
if (env.NODE_ENV === "production") throw new Error("The fixture seed is for local development only; production runs db:seed:allowlist.");
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const devUser = await usersRepo.findUserByEmail(db, env.DEV_LOGIN_EMAIL);
  let customer = await customersRepo.findCustomerByName(db, SEED_CUSTOMER_NAME);
  customer ??= await customersRepo.insertCustomer(db, { name: SEED_CUSTOMER_NAME, createdBy: devUser?.id ?? null });
  console.log(`seeded customer: ${customer.name} (${customer.id})`);
} finally {
  await close();
}
