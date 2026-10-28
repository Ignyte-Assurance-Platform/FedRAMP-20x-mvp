# Tasks — Repo skeleton and local development environment (no cloud needed)

> Brain work item: [[wi-maaz20x-010-repo-skeleton-local-dev]] · brain_commit 58c518df04a96709bdbac4540966bb507399c39e · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-010-repo-skeleton-local-dev.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 58c518d; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-010-repo-skeleton-local-dev.md`) (compiled 2026-10-28 from the reconciled spec; the code was built at risk and merged in #1 on 2026-10-19)

## 2. Implement
- [x] 2.1 WHEN a developer follows the README on a clean machine with Node and a container runtime THEN the app runs at `http://localhost` with a seeded database in under 10 minutes (docs/evidence-wi-010.md §1: about 1.5 min including the Postgres image pull)
- [x] 2.2 WHEN `DEV_LOGIN=1` and `NODE_ENV=development` THEN a developer can sign in without Google (docs/evidence-wi-010.md §2)
- [x] 2.3 WHEN the app starts with `NODE_ENV=production` and `DEV_LOGIN` set THEN it refuses to start with a clear error (docs/evidence-wi-010.md §3; start-time guard with a test on the real entry point)
- [x] 2.4 WHEN a file is uploaded locally THEN it lands under `customers/<id>/intake/<document-id>/<filename>` on disk and a `documents` row records path, size, type and SHA-256 (for customer documents on Cloud Storage, superseded by MD5 and CRC32C in [[wi-maaz20x-006-intake-documents]] §8) (docs/evidence-wi-010.md §4)
- [x] 2.5 WHEN a PR is opened THEN CI runs lint, typecheck, tests and build and blocks the merge on failure (docs/evidence-wi-010.md §5; blocking enforced on 2026-10-28: `lint, typecheck, test, build` is a required status check on `main`)
- [x] 2.6 WHEN a static asset is requested THEN it carries the immutable cache header, and a page with customer data carries `no-store` (docs/evidence-wi-010.md §6)
- [x] 2.7 WHEN code imports `server/` THEN it does so through a per-module alias (`~server/db`, `~server/fedramp`, `~server/storage`) and only from loaders, actions, resource routes or `server/index.ts`; ESLint fails otherwise (ADR-0006 rules 2 and 8) (docs/evidence-wi-010.md §7; ESLint plus a client-build guard)
- [x] 2.8 WHEN the app starts THEN `server/index.ts` is the only entry point (keeps the move to workspaces mechanical, ADR-0006) (docs/evidence-wi-010.md §8)

## 3. Verify
- [x] 3.1 Automated review (PB - Review PR) against this spec (PB - Review PR on #1, 2026-10-16: 7/8 criteria, 2 majors fixed on the branch before merge)
- [x] 3.2 Human triage (gate 7) recorded in Linear (retroactive gate 3 and close-out recorded on IGN-9, 2026-10-28)
