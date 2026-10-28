# Repo skeleton and local development environment (no cloud needed)

> Brain work item: [[wi-maaz20x-010-repo-skeleton-local-dev]] · brain_commit 58c518df04a96709bdbac4540966bb507399c39e · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-010-repo-skeleton-local-dev.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

The GCP project, Cloud SQL, bucket and OAuth client are pending. Building the skeleton so that every cloud dependency sits behind an interface with a local implementation lets the MVP screens start now and switch to GCP by configuration only.

- [[maaz20x-mvp-plan-v3-1]] §3.1–3.8 and §6 day 1: React Router + Hono skeleton, Drizzle + Postgres, Better Auth, repo structure per Tanner (route-local UI, shared UI in `app/components`, API as resource routes, repository layer).
- [[adr-0001-maaz20x-typescript-monolith-cloud-run]] (stack), [[adr-0004-maaz20x-google-workspace-login]] (login), [[adr-0005-maaz20x-caching-strategy]] (static asset headers, in-memory caches).
- [[maaz20x-contract-document-storage]]: bucket layout and `documents` metadata.
- [[maaz20x-architecture-workstream]] §4: the GCP project does not exist yet; everything here must run on a laptop.

## What changes

- **App:** React Router (framework mode) on Hono, TypeScript strict, shadcn set up, the folder tree and import rules of [[adr-0006-maaz20x-repo-folder-structure]] (ESLint `no-restricted-imports` included). Static assets served with `Cache-Control: public, max-age=31536000, immutable`; HTML and data responses `no-store`.
- **Database:** Postgres in a local container (Podman or Docker, `compose.yaml`), Drizzle schema and migrations for `users`, `customers`, `intake_answers`, `documents`, plus the tables Better Auth needs (`sessions`, `accounts`, `verifications`; its user model is mapped onto `users`, with no password column); seed script. `customers` and `intake_answers` start minimal; the screen work items own their real columns.
- **Storage interface** `DocumentStore` (`createUploadUrl`, `createDownloadUrl`, `delete`, `stat`, `readStart`) with two implementations: local disk (dev, served by a dev-only route) and Cloud Storage (signed URLs), chosen by environment. Upload URLs are create-only (a signed URL cannot overwrite a stored object). With `NODE_ENV=production` the app refuses to start unless `STORAGE_DRIVER=gcs`. Object paths follow [[maaz20x-contract-document-storage]]. The upload method and checksums for customer documents were decided later in [[wi-maaz20x-006-intake-documents]] §8 (resumable session opened by the server, MD5 and CRC32C from Cloud Storage); this item ships the single signed PUT the logo still uses.
- **Auth:** Better Auth wired with the Google provider (config only, inactive until the OAuth client exists) plus a **dev-only sign-in** enabled solely when `NODE_ENV=development` and `DEV_LOGIN=1`; the production build refuses to start if `DEV_LOGIN` is set.
- **Config:** typed environment loader (Valibot); `.env.example` committed, real `.env` never.
- **CI (GitHub Actions, no deploy):** install, lint, typecheck, unit tests, build, on every PR and push to `main`.
- **Tests:** Vitest for units; one smoke test that boots the app against the local database.
- **Docs:** README "run locally in 5 commands".

Out of scope: deploy, Cloud SQL, real bucket, Google OAuth client, Workload Identity Federation (they need the GCP project; tracked in [[maaz20x-architecture-workstream]]).

## Out of scope

See "Scope" or "Change" in the brain spec; anything not listed there is out.
