/**
 * One-off (WI-018): copies to the logos bucket every recorded customer logo it does not hold
 * yet, e.g. logos uploaded before the app published them. Safe to run again: a second run
 * copies nothing. Run with the same environment as the app (`npm run logos:publish`).
 */
import { getEnv } from "~server/config";
import { documentsRepo } from "~server/repositories";
import { publishMissingLogos } from "~server/services";
import { createDocumentStore, createLogoPublisher } from "~server/storage";
import { createDb } from "./client";

const env = getEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const result = await publishMissingLogos({
    listLogos: () => documentsRepo.listLogoDocuments(db),
    store: createDocumentStore(env),
    publisher: createLogoPublisher(env),
    log: console.log,
  });
  console.log(
    `logos: ${result.recorded} recorded, ${result.published} published now, ${result.missing} missing from the documents store, ${result.failed} failed`,
  );
  if (result.failed) process.exitCode = 1;
} finally {
  await close();
}
