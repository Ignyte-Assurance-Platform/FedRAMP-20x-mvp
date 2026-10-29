/**
 * Local fixture seed: the dev sign-in user (WI-010; WI-019 retired the allowlist seed that made it), then one fictional
 * customer (with an intake link, WI-003) so uploads have somewhere to land. Production never runs this file: staff
 * users there are created by their first Google sign-in, once the staff group has them.
 */
import { getEnv } from "~server/config";
import { customersRepo, usersRepo } from "~server/repositories";
import { intakeLinkUrl, newIntakeLinkColumns } from "~server/services";
import { createDb } from "./client";

export const SEED_CUSTOMER_NAME = "Example Cloud Co (fictional seed)";

const env = getEnv();
if (env.NODE_ENV === "production") throw new Error("The fixture seed is for local development only.");
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const devUser = await usersRepo.ensureDevUser(db, env.DEV_LOGIN_EMAIL);
  console.log(`seeded dev user: ${devUser.email}`);
  let customer = await customersRepo.findCustomerByName(db, SEED_CUSTOMER_NAME);
  customer ??= await customersRepo.insertCustomer(db, { name: SEED_CUSTOMER_NAME, createdBy: devUser.id });
  if (!customer.serviceName) {
    const { token, columns } = newIntakeLinkColumns(env.intakeLinkKey, devUser.id, new Date());
    customer = (await customersRepo.updateCustomer(db, customer.id, {
      serviceName: "Example Records Platform",
      contactName: "Pat Example",
      contactEmail: "pat@example.com",
      ...columns,
    }))!;
    console.log(`seeded intake link: ${intakeLinkUrl(env.APP_URL, token)}`);
  }
  console.log(`seeded customer: ${customer.name} (${customer.id})`);
} finally {
  await close();
}
