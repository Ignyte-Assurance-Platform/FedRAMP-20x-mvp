# WI-010 at-risk notes

WI-010 was built on `feat/wi-010-local-skeleton` before gate 3 (no approval recorded, no OpenSpec change). Where the spec was unclear, the simplest option was taken and recorded here. Each item is an **open question for Tanner**; once WI-010 is approved, compile the change and reconcile the branch with these answers.

## Open questions for Tanner

1. **Better Auth needs three more tables.** Section 3 lists `users`, `customers`, `intake_answers`, `documents`. Better Auth also needs `sessions`, `accounts` and `verifications`, so they are in the first migration (plural names, Better Auth's `usePlural`). Its "user" model is mapped onto `users`, with no password column. OK?

2. **`customers` and `intake_answers` are minimal on purpose.** `customers` has only `id`, `name`, `created_by` and timestamps. `intake_answers` has one row per customer and section: JSON answers, a form-definition version and a row version for ADR-0003's version check. WI-003 to WI-005 own the real columns, and the customer sign-in question (one-time email link) may change them. Nothing was added in anticipation.

3. **TypeScript 6.0.3, not 7.0.** TypeScript 7.0.2 is the latest release, but typescript-eslint 8.71.2 (the latest) supports only `<6.1.0`. Move to 7 when typescript-eslint supports it. Every other library is on its current stable release, pinned exactly in `package.json` and `package-lock.json`.

4. **No build-time DEV_LOGIN guard.** Section 4 mentions "build-time and start-time guards". React Router loads `.env` during `npm run build`, so a build guard would fail every local build (`.env.example` sets `DEV_LOGIN=1`). The build also never contains `DEV_LOGIN`, since config is read when the app starts. Only the start-time guard exists, with a test that starts the real entry point. Is that enough?

5. **SHA-256 on Cloud Storage.** The contract asks for SHA-256 in `documents`. Locally the store computes it while receiving the file. Cloud Storage keeps only MD5 and CRC32C, so `GcsDocumentStore.stat` reads a custom `sha256` metadata field. Who sets it is undecided: the browser (sends `x-goog-meta-sha256` on the signed PUT, which must then be signed too) or a check after upload that streams the object once. Decide before WI-006 runs on GCP.

6. **Signed upload URL, not resumable.** The GCS store issues a V4 signed PUT URL with `x-goog-content-length-range` capped at 100 MB. The architecture brief mentions resumable uploads. A signed PUT is simpler and fits the 100 MB MVP limit. Switch to resumable sessions only if large files fail in practice.

7. **The production start runs TypeScript through `tsx`.** `npm start` runs `tsx server/index.ts`, the same single entry point as dev; React Router's own build covers `app/`. This avoids a second bundler for `server/`. It adds a few hundred ms to cold start; bundling `server/index.ts` can come with the Dockerfile and deploy work.

8. **No Dockerfile yet.** ADR-0006 lists a `Dockerfile`, but WI-010 excludes deploy, so it is left for the deploy work item.

9. **Blocking merges needs a branch protection rule.** CI runs on every PR and every push to `main`. "Blocks the merge on failure" also needs `main` protected with the `CI / lint, typecheck, test, build` check marked required. That is a repository setting, not a file, so it was not changed here. The repo owner needs to turn it on.

10. **A `home` route outside the feature folders.** `/` (`app/routes/home.tsx`) only shows who is signed in, so the skeleton has something behind the login. It is not one of the ADR-0006 features; WI-003 will likely make `/` the customer list and delete it.

11. **Only `/assets/*` is served as static files.** Hashed assets get the immutable header. There is no `public/` folder yet, so no un-hashed static files (favicon) are served. Add a rule with a short cache when one is added.

12. **Dev-only tool audit warnings.** `npm audit` reports 4 moderate findings, all from an old esbuild used inside `drizzle-kit` (GHSA-67mh-4wv8-2f99, the esbuild dev server). That path never runs here, and the suggested fix downgrades drizzle-kit to 0.18, so it was left as is. Recheck when drizzle-kit 1.0 is stable.

## Evidence

Real command output for every section 5 criterion: [`docs/evidence-wi-010.md`](evidence-wi-010.md).
