/**
 * Idempotent local seed: the staff allowlist (ADR-0004: ADMIN_EMAILS plus the dev sign-in
 * user outside production) and one fictional customer so uploads have somewhere to land.
 */
import { getEnv } from "~server/config";
import { customersRepo, usersRepo } from "~server/repositories";
import { createDb } from "./client";

export const SEED_CUSTOMER_NAME = "Example Cloud Co (fictional seed)";

const env = getEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const emails = new Set(env.adminEmails);
  if (env.NODE_ENV !== "production") emails.add(env.DEV_LOGIN_EMAIL.toLowerCase());

  const users = [];
  for (const email of emails) {
    users.push(await usersRepo.ensureUser(db, email, email === env.DEV_LOGIN_EMAIL.toLowerCase() ? "Dev User" : email));
  }

  let customer = await customersRepo.findCustomerByName(db, SEED_CUSTOMER_NAME);
  customer ??= await customersRepo.insertCustomer(db, { name: SEED_CUSTOMER_NAME, createdBy: users[0]?.id ?? null });

  console.log(`seeded ${users.length} user(s): ${users.map((u) => u.email).join(", ") || "none"}`);
  console.log(`seeded customer: ${customer.name} (${customer.id})`);
} finally {
  await close();
}
