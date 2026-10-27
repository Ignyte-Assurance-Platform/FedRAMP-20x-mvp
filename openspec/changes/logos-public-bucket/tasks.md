# Tasks — Customer logos in the public logos bucket: checked in the private bucket, then published

> Brain work item: [[wi-maaz20x-018-logos-public-bucket]] · brain_commit 68380eb762891d3531eeaa5ef2322185b16b032c · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-018-logos-public-bucket.md

## 1. Setup
- [ ] 1.1 Read the frozen brain spec at brain_commit 68380eb; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-018-logos-public-bucket.md`)

## 2. Implement
- [ ] 2.1 WHEN a customer uploads a valid PNG or JPEG logo THEN after the finish check the same object exists in the logos bucket at `customers/<customer-id>/logo/<logo-id>.<ext>` and in the documents bucket, and one `documents` row is recorded
- [ ] 2.2 WHEN a logo fails the finish check (size, type or signature) THEN nothing is written to the logos bucket, the private object is deleted and nothing is recorded
- [ ] 2.3 WHEN copying to the logos bucket fails THEN nothing is recorded, the private object is deleted and the customer is asked to upload again
- [ ] 2.4 WHEN Generate JSON runs for a customer with a logo on Cloud Run dev THEN `serviceIdentification.logo` is `https://storage.googleapis.com/ignyte-customer-logos-dev/customers/<id>/logo/<logo-id>.<ext>`, that URL answers 200 with an image content type to an anonymous request, and the logo check passes
- [ ] 2.5 WHEN anyone requests any object of the documents bucket without credentials THEN it is refused (unchanged)
- [ ] 2.6 WHEN `LOGO_PUBLIC_BASE_URL` is set THEN the logo previews on Screens E and D use the public URL
- [ ] 2.7 WHEN the app starts in production without `GCS_LOGO_BUCKET` THEN it refuses to start with a message naming the setting
- [ ] 2.8 WHEN the app runs locally with `STORAGE_DRIVER=local` THEN logo upload, preview and Generate JSON behave as before this item, and the smoke tests pass
- [ ] 2.9 WHEN `npm run logos:publish` runs THEN every recorded logo missing from the logos bucket is copied, and a second run copies nothing

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
