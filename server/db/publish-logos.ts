/**
 * One-off (WI-018): copies to the logos bucket every recorded customer logo it does not hold
 * yet, e.g. logos uploaded before the app published them. Safe to run again: a second run
 * copies nothing. Run with the same environment as the app (`npm run logos:publish`).
 */
import { getEnv } from "~server/config";
import { documentsRepo } from "~server/repositories";
import { createDocumentStore, createLogoPublisher } from "~server/storage";
import { createDb } from "./client";

const env = getEnv();
const store = createDocumentStore(env);
const publisher = createLogoPublisher(env);
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const logos = await documentsRepo.listLogoDocuments(db);
  let copied = 0;
  let missing = 0;
  for (const logo of logos) {
    if (await publisher.isPublished(logo.objectPath)) continue;
    if (!(await store.stat(logo.objectPath))) {
      missing += 1;
      console.log(`logos: ${logo.objectPath} is recorded but not in the documents store; skipped`);
      continue;
    }
    await publisher.publish(logo.objectPath, logo.contentType);
    copied += 1;
    console.log(`logos: published ${logo.objectPath}`);
  }
  console.log(`logos: ${logos.length} recorded, ${copied} published now, ${missing} missing from the documents store`);
} finally {
  await close();
}
