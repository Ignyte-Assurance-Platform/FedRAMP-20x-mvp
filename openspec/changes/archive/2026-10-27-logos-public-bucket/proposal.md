# Customer logos in the public logos bucket: checked in the private bucket, then published

> Brain work item: [[wi-maaz20x-018-logos-public-bucket]] · brain_commit 68380eb762891d3531eeaa5ef2322185b16b032c · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-018-logos-public-bucket.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

The Package Overview file needs a logo URL anyone can open. Today the app stores the logo in the private documents bucket, where it can never be public, so on dev every generated file carries a logo URL that answers 404 and Generate JSON reports the logo as missing. The public logos bucket exists and is configured; the app does not use it yet.

- [[maaz20x-contract-document-storage]] §1, amended 2026-10-26: two buckets per environment. Documents in `ignyte-maaz20x-dev-documents` (private, Public Access Prevention enforced, IAM only); customer logos in `ignyte-customer-logos-dev` (public read, nothing but logos), same object path `customers/<customer-id>/logo/<logo-id>.<ext>`, public URL = `LOGO_PUBLIC_BASE_URL` + object path. Why: Public Access Prevention makes a public object inside the documents bucket impossible; the logo URL is copied into each customer's published file, so it must not depend on the app's domain.
- [[wi-maaz20x-004-intake-company-service]] §5 (frozen at `68881d9`, before the amendment): logo upload with a signed URL, finish check (size ≤ 2 MB, PNG or JPEG content type, file signature), the object deleted and nothing recorded on failure; the newest `documents` row under `customers/<id>/logo/` is the current logo; Replace adds a row and keeps the old one. Built in FedRAMP-20x-mvp PR #25 (IGN-16) on the old layout, one bucket: `startLogoUpload`, `finishLogoUpload` in `server/services/intake.ts`, `getDocumentStore()` in `server/storage/index.ts` (one store, `GCS_BUCKET`), `publicObjectUrl(LOGO_PUBLIC_BASE_URL, objectPath)` in `server/services/package-overview.ts`. The PR #25 review (2026-10-27) left the move to this item.
- [[wi-maaz20x-007-package-overview-json]]: Generate JSON fetches the logo URL and fails the logo check unless it answers with an `image/*` type; a logo uploaded while `LOGO_PUBLIC_BASE_URL` is empty is reported as "host not configured".
- [[maaz20x-runbook-gcp-dev-console]] §2.4 and [[maaz20x-architecture-workstream]] §6 (2026-10-26): `ignyte-customer-logos-dev` exists (us-central1, uniform access, soft delete 7 days, `allUsers` Storage Object Viewer); `web-app` has Storage Object Admin on both buckets; CORS is set only on the documents bucket. Cloud Run dev already sets `LOGO_PUBLIC_BASE_URL=https://storage.googleapis.com/ignyte-customer-logos-dev/` (`deploy/cloud-run/ignyte-fedramp-20x.dev.yaml`, [[wi-maaz20x-017-deploy-dev-ci]]).
- Consequence today (PR #25 re-check, 2026-10-27): on dev the logo uploads and previews, but the URL in the generated file points at the logos bucket while the file sits in the documents bucket, so it answers 404 and the logo check fails.
- [[maaz20x-chat-2026-10-23-tab1-why-lines-and-branding]] decision 4: public names say Ignyte (the logos bucket name already does).
- `.env.example` (local): `STORAGE_DRIVER=local`, `LOGO_PUBLIC_BASE_URL=` empty; locally a logo has no public address.
- No contradiction with the frozen wi-004 criteria: they say "stored on Ignyte's side" and "the generated JSON uses the Ignyte-hosted URL"; this item changes where the hosted copy lives, not what the customer or Ignyte sees.

## What changes

All in FedRAMP-20x-mvp, after PR #25 is merged. No change to screens, routes, the database schema or the customer's steps.

1. **Upload and check stay in the private bucket.** `startLogoUpload` keeps signing the upload to the documents bucket at `customers/<id>/logo/<logo-id>.<ext>`, and `finishLogoUpload` keeps its checks there. A file that has not passed the checks is never public.
2. **Publish after the check.** When the checks pass, `finishLogoUpload` copies the object to the logos bucket at the same path (server-side copy, no download), with its content type and `Cache-Control: public, max-age=3600`, then records the `documents` row. If the copy fails, nothing is recorded, the private object is deleted and the customer sees the "did not arrive" message to try again.
3. **A second store.** New setting `GCS_LOGO_BUCKET` (required when `STORAGE_DRIVER=gcs`; refusing to start without it in production, like `GCS_BUCKET`). `server/storage` gets a logo store next to the document store; locally it is a second folder (`LOCAL_LOGO_DIR`, default `.data/logos`), and `LOGO_PUBLIC_BASE_URL` stays empty locally as today.
4. **Previews use the public URL** when `LOGO_PUBLIC_BASE_URL` is set (Screen E and Screen D), instead of a one-hour signed URL (PR #25 nit 19); otherwise the signed URL as today.
5. **Existing logos.** A one-off script `npm run logos:publish` copies to the logos bucket every recorded logo that is not there yet, and reports what it copied. Run once on dev after the deploy (expected: zero or a few test logos).
6. **Config and docs.** `deploy/cloud-run/ignyte-fedramp-20x.dev.yaml` adds `GCS_LOGO_BUCKET=ignyte-customer-logos-dev`; `.env.example` and the README list the new settings; the runbook inventory notes that the app writes to the logos bucket. No IAM change: `web-app` already has Storage Object Admin on both buckets.

Out of scope: the production buckets (not created yet), deleting replaced logos from the public bucket (Replace keeps the old object, as the contract says for every document), CDN or a custom logo domain, SVG logos.

## Out of scope

See "Scope" or "Change" in the brain spec; anything not listed there is out.
