# Tasks — Customer logos in the public logos bucket: checked in the private bucket, then published

> Brain work item: [[wi-maaz20x-018-logos-public-bucket]] · brain_commit 68380eb762891d3531eeaa5ef2322185b16b032c · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-018-logos-public-bucket.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 68380eb; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-018-logos-public-bucket.md`) · checked 2026-10-27: only the handoff back-link touched the note after 68380eb

## 2. Implement
- [x] 2.1 WHEN a customer uploads a valid PNG or JPEG logo THEN after the finish check the same object exists in the logos bucket at `customers/<customer-id>/logo/<logo-id>.<ext>` and in the documents bucket, and one `documents` row is recorded · Cloud Run dev rev 00013 (`5cfa137`): test logo uploaded through the intake API, stored in `ignyte-customer-logos-dev` at `customers/<id>/logo/<logo-id>.png`; anonymous GET 200 `image/png`, `Cache-Control: public, max-age=3600`
- [x] 2.2 WHEN a logo fails the finish check (size, type or signature) THEN nothing is written to the logos bucket, the private object is deleted and nothing is recorded · smoke "2.10, 2.12 …": the fake PNG is refused and the logos folder holds only the checked logo
- [x] 2.3 WHEN copying to the logos bucket fails THEN nothing is recorded, the private object is deleted and the customer is asked to upload again · smoke "WI-018: when the copy to the logos bucket fails…": refused with "did not arrive", no row, private object deleted
- [x] 2.4 WHEN Generate JSON runs for a customer with a logo on Cloud Run dev THEN `serviceIdentification.logo` is `https://storage.googleapis.com/ignyte-customer-logos-dev/customers/<id>/logo/<logo-id>.<ext>`, that URL answers 200 with an image content type to an anonymous request, and the logo check passes · demo customer "Sample Cloud Co (demo)" with the golden answers and a logo: Generate JSON on dev → "Valid against FedRAMP Package Overview 0.2.0", no logo problem; `serviceIdentification.logo` is the logos-bucket URL
- [x] 2.5 WHEN anyone requests any object of the documents bucket without credentials THEN it is refused (unchanged) · same logo path on `ignyte-maaz20x-dev-documents` answers 403 to an anonymous request
- [x] 2.6 WHEN `LOGO_PUBLIC_BASE_URL` is set THEN the logo previews on Screens E and D use the public URL · Screen D already used the public URL (`loadTab1Answers`); Screen E now too: smoke "WI-018: with a logo host configured…" (finish and open)
- [x] 2.7 WHEN the app starts in production without `GCS_LOGO_BUCKET` THEN it refuses to start with a message naming the setting · `env.test.ts` "requires the logos bucket for the Cloud Storage driver" (GCS_LOGO_BUCKET is required whenever STORAGE_DRIVER=gcs, so production too)
- [x] 2.8 WHEN the app runs locally with `STORAGE_DRIVER=local` THEN logo upload, preview and Generate JSON behave as before this item, and the smoke tests pass · lint, typecheck, 226 unit and 40 smoke tests green locally
- [x] 2.9 WHEN `npm run logos:publish` runs THEN every recorded logo missing from the logos bucket is copied, and a second run copies nothing · run twice locally against the smoke data: "4 recorded, 3 published now, 1 missing", then "0 published now"; loop moved to `publishMissingLogos` with unit tests (second run copies nothing, one failure does not stop the run, exit code 1)

## 3. Verify
- [x] 3.1 Automated review (PB - Review PR) against this spec · independent review of #34: 0 major, 4 minor, 2 nits
- [x] 3.2 Human triage (gate 7) recorded in Linear  · Jesús, 2026-10-27, IGN-20: minors 1–4 changed in #34, nits 5–6 accepted
