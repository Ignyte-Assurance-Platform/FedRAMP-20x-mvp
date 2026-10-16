# WI-010 at-risk notes

WI-010 was built on `feat/wi-010-local-skeleton` before gate 3 (no approval recorded, no OpenSpec change). Where the spec was unclear, the simplest option was taken and recorded here. Each item is an **open question for Tanner**; once WI-010 is approved, compile the change and reconcile the branch with these answers.

## Open questions for Tanner

1. **Better Auth needs three more tables.** Section 3 lists `users`, `customers`, `intake_answers`, `documents`. Better Auth also needs `sessions`, `accounts` and `verifications`, so they are in the first migration (plural names, Better Auth's `usePlural`). Its "user" model is mapped onto `users`, with no password column. OK?

2. **`customers` and `intake_answers` are minimal on purpose.** `customers` has only `id`, `name`, `created_by` and timestamps. `intake_answers` has one row per customer and section: JSON answers, a form-definition version and a row version for ADR-0003's version check. WI-003 to WI-005 own the real columns, and the customer sign-in question (one-time email link) may change them. Nothing was added in anticipation.

3. **TypeScript 6.0.3, not 7.0.** TypeScript 7.0.2 is the latest release, but typescript-eslint 8.71.2 (the latest) supports only `<6.1.0`. Move to 7 when typescript-eslint supports it. Every other library is on its current stable release, pinned exactly in `package.json` and `package-lock.json`.

4. **No build-time DEV_LOGIN guard.** Section 4 mentions "build-time and start-time guards". React Router loads `.env` during `npm run build`, so a build guard would fail every local build (`.env.example` sets `DEV_LOGIN=1`). The build also never contains `DEV_LOGIN`, since config is read when the app starts. Only the start-time guard exists, with a test that starts the real entry point. Is that enough?

5. **SHA-256 on Cloud Storage.** The contract asks for SHA-256 in `documents`. Locally the store computes it while receiving the file. Cloud Storage keeps only MD5 and CRC32C, so `GcsDocumentStore.stat` reads a custom `sha256` metadata field. Who sets it is undecided: the browser (sends `x-goog-meta-sha256` on the signed PUT, which must then be signed too) or a check after upload that streams the object once. Decide before WI-006 runs on GCP.

6. **Signed upload URL, not resumable.** The GCS store issues a V4 signed PUT URL with `x-goog-content-length-range` capped at 100 MB. The architecture brief mentions resumable uploads. A signed PUT is simpler and fits the 100 MB MVP limit. Switch to resumable sessions only if large files fail in practice.

7. **The production start runs TypeScript through `tsx`.** `npm start` runs `tsx server/index.ts`, the same single entry point as dev; React Router's own build covers `app/`. This avoids a second bundler for `server/`. It adds a few hundred ms to cold start; bundling `server/index.ts` can come with the Dockerfile and deploy work. `.env` and `build/client` are resolved from the repo root, so the entry point works from any working directory. The one exception: tsx resolves the `~server/*` aliases through `tsconfig.json`, so outside the repo root start it with `tsx --tsconfig <repo>/tsconfig.json <repo>/server/index.ts` (npm scripts always run from the root). Verified from `C:\Users\dev`: assets are served immutable and `/api/health` is ok.

8. **No Dockerfile yet.** ADR-0006 lists a `Dockerfile`, but WI-010 excludes deploy, so it is left for the deploy work item.

9. **Blocking merges needs a branch protection rule.** CI runs on every PR and every push to `main`. "Blocks the merge on failure" also needs `main` protected with the `CI / lint, typecheck, test, build` check marked required. That is a repository setting, not a file, so it was not changed here. The repo owner needs to turn it on.

10. **A `home` route outside the feature folders.** `/` (`app/routes/home.tsx`) only shows who is signed in, so the skeleton has something behind the login. It is not one of the ADR-0006 features; WI-003 will likely make `/` the customer list and delete it.

11. **Only `/assets/*` is served as static files.** Hashed assets get the immutable header. There is no `public/` folder yet, so no un-hashed static files (favicon) are served. Add a rule with a short cache when one is added.

12. **Dev-only tool audit warnings.** `npm audit` reports 4 moderate findings, all from an old esbuild used inside `drizzle-kit` (GHSA-67mh-4wv8-2f99, the esbuild dev server). That path never runs here, and the suggested fix downgrades drizzle-kit to 0.18, so it was left as is. Recheck when drizzle-kit 1.0 is stable.

13. **Google sign-in can't be verified yet (TODO for WI-002).** Two things in `server/auth/auth.ts` wait for the OAuth client:
    - *Account linking.* A seeded staff user has a `users` row but no `accounts` row. With `disableSignUp: true`, the first Google sign-in must link to that user by verified email. This is now set explicitly (`account.accountLinking: { enabled: true, trustedProviders: ["google"] }`) rather than left to Better Auth's defaults.
    - *Readable refusal.* A non-Ignyte or unverified account now gets a `FORBIDDEN` `APIError` with code `NOT_IGNYTE_ACCOUNT`, and `onAPIError.errorURL` sends it to `/login?error=…`. The login page maps the code to "Only verified Ignyte Google Workspace accounts can sign in." The exact codes Better Auth puts on that redirect (including the one for disabled sign-up) are matched loosely in `signInErrorMessage` and must be checked against a real Google sign-in.

14. **`intake_answers.version` starts at 1.** A row is created by the first save of a section with `version = 1`; each later save checks the version it read and increments it. The WI-011 form-engine draft describes `default 0` with the first save bumping to 1. This table uses **1 on insert**; WI-011 should adopt that rather than add a migration to flip the default.

15. **Production refuses local storage.** Added from PR #1 review: with `NODE_ENV=production`, `STORAGE_DRIVER` must be `gcs`, or the app refuses to start (local disk on Cloud Run is ephemeral). A production start therefore needs `STORAGE_DRIVER=gcs` and `GCS_BUCKET`. The GCS client is created lazily, so the app starts without credentials, but uploads need the bucket.

16. **Uploads are create-only.** Added from PR #1 review: a signed upload URL can't overwrite a stored object. The local driver answers 409 when the object exists, and the GCS URL signs `x-goog-if-generation-match: 0`, so Cloud Storage answers 412. A failed partial upload leaves no object and can be retried with the same URL. A replacement file is a new document id.

## Evidence

Real command output for every section 5 criterion: [`docs/evidence-wi-010.md`](evidence-wi-010.md).
