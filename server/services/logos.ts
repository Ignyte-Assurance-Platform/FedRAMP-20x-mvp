import type { DocumentRow } from "~server/repositories";
import type { DocumentStore, LogoPublisher } from "~server/storage";

export interface PublishMissingLogosDeps {
  /** Every recorded customer logo (documentsRepo.listLogoDocuments). */
  listLogos: () => Promise<Pick<DocumentRow, "objectPath" | "contentType">[]>;
  store: Pick<DocumentStore, "stat">;
  publisher: LogoPublisher;
  log?: (line: string) => void;
}

export interface PublishMissingLogosResult {
  recorded: number;
  published: number;
  missing: number;
  failed: number;
}

/**
 * One-off for logos recorded before WI-018: copies to the logos bucket every recorded logo it
 * does not hold yet. One failed copy does not stop the run; a second run copies nothing.
 */
export async function publishMissingLogos(deps: PublishMissingLogosDeps): Promise<PublishMissingLogosResult> {
  const log = deps.log ?? (() => undefined);
  const logos = await deps.listLogos();
  const result: PublishMissingLogosResult = { recorded: logos.length, published: 0, missing: 0, failed: 0 };
  for (const logo of logos) {
    try {
      if (await deps.publisher.isPublished(logo.objectPath)) continue;
      if (!(await deps.store.stat(logo.objectPath))) {
        result.missing += 1;
        log(`logos: ${logo.objectPath} is recorded but not in the documents store; skipped`);
        continue;
      }
      await deps.publisher.publish(logo.objectPath, logo.contentType);
      result.published += 1;
      log(`logos: published ${logo.objectPath}`);
    } catch (error) {
      result.failed += 1;
      log(`logos: failed ${logo.objectPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
