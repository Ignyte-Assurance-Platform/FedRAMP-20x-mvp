/**
 * Allowlist seed (WI-002 E5), the only seed production runs: makes exactly ADMIN_EMAILS the
 * active staff (plus the dev sign-in user outside production). Removed emails are set
 * inactive and their sessions deleted; rows are kept.
 */
import { getEnv } from "~server/config";
import { usersRepo } from "~server/repositories";
import { allowlistEmails } from "./allowlist";
import { createDb } from "./client";

const env = getEnv();
const emails = allowlistEmails({
  adminEmails: env.adminEmails,
  nodeEnv: env.NODE_ENV,
  devLoginEmail: env.DEV_LOGIN_EMAIL,
  domain: env.GOOGLE_ALLOWED_DOMAIN,
});
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const result = await usersRepo.applyAllowlist(db, emails);
  console.log(`allowlist: ${result.active.length} active (${result.active.join(", ")})`);
  if (result.deactivated.length) console.log(`allowlist: set inactive ${result.deactivated.join(", ")}`);
} finally {
  await close();
}
