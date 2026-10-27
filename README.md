# FedRAMP 20x MVP (Maaz 20x)

The tool Ignyte consultants use to take a Cloud Service Provider through FedRAMP 20x Class A authorization. This repository owns execution; intent, decisions and specs live in the project brain (`../ignyte-project-brain/projects/maaz20x`). Read `AGENTS.md` before working here.

## Stack

One TypeScript app: React Router (framework mode) on Hono, in one container on Cloud Run. Postgres (Cloud SQL) through Drizzle ORM. Better Auth with Google sign-in for staff. shadcn UI, Valibot for forms, ajv for the final FedRAMP JSON. Documents in a private Cloud Storage bucket. Decided in brain ADR-0001; the document worker (phase 3) in ADR-0002.

## Folder structure

```text
app/                 React Router — browser-safe code only
  routes/<feature>/  one folder per feature (auth, customers, intake, package, api)
  components/        UI shared by 2+ routes: ui/ (shadcn), layout/, form-engine/
  hooks/  lib/  styles/
server/              server-only: config, auth, db (Drizzle), repositories, services,
                     storage (DocumentStore local + GCS), fedramp (schemas, rules, ajv, mapping), cache
form-definitions/    forms are data: one JSON per intake tab, versioned with its schema
worker/              phase 3 document worker, second entry point in the same repo
tests/  scripts/  docs/  openspec/
```

Why this way, in one paragraph: a route is a feature, so the top level says what the product does instead of listing file types; everything that touches the database, the bucket or a secret sits in `server/` and can never reach the browser bundle; FedRAMP knowledge is confined to `server/fedramp` and `form-definitions/` so screens never read a JSON Schema. Full tree, import rules, the monorepo question and the alternatives we rejected: [`docs/architecture/folder-structure.md`](docs/architecture/folder-structure.md) and brain ADR-0006.

## Run locally in 5 commands

You need Node 22.22+ (24 recommended) and a running container runtime: Docker Desktop, or Podman (`podman machine start` on macOS/Windows). No Google Cloud access is needed.

```bash
git clone https://github.com/Ignyte-Assurance-Platform/FedRAMP-20x-mvp.git && cd FedRAMP-20x-mvp
cp .env.example .env
npm ci
npm run db:up     # starts Postgres (compose.yaml), runs migrations, the allowlist seed (dev user) and a sample customer
npm run dev       # http://localhost:3000
```

Open http://localhost:3000 and choose **Dev sign-in (local only)**. That button exists only with `NODE_ENV=development` and `DEV_LOGIN=1` (both set in `.env.example`); in production the app refuses to start if `DEV_LOGIN` is set at all. Uploaded files land under `.data/storage/customers/<id>/intake/<document-id>/<filename>`.

`npm run db:up` uses Docker if it is running, otherwise Podman; force one with `CONTAINER_RUNTIME=podman`. `npm run db:down` stops the database.

### Screens and routes

| Screen | Route | Who |
| --- | --- | --- |
| A, sign in | `/login` | Anyone; Ignyte Google Workspace accounts on the allowlist get in |
| B, customers list | `/customers` (`/` redirects here) | Ignyte staff |
| C, create customer | `/customers/new` | Ignyte staff |
| D, customer page (intake link, Package Overview JSON) | `/customers/:customerId/package` | Ignyte staff |
| E, customer intake | `/intake/:token` (arrives with WI-004) | The customer, with the link; no sign-in. The link expires 30 days after it is issued |

Every staff route goes through one guard (`requireStaffUser`); a customer link token is never accepted there.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint, including the ADR-0006 import rules |
| `npm run typecheck` | React Router type generation, then `tsc` |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Production build into `build/` |
| `npm run test:smoke` | Boots the built app against the local database (run `build` and `db:up` first) |
| `npm run db:generate` | New Drizzle migration after a schema change |
| `npm run db:seed:allowlist` | Makes exactly `ADMIN_EMAILS` the active staff (plus the dev user outside production); removed emails are set inactive and their sessions deleted. The only seed production runs; it fails on an email outside `@ignyteplatform.com` or an empty list in production |
| `npm run db:seed` | Local fixture seed (a sample customer); refuses to run in production |
| `npm start` with `NODE_ENV=production` | Runs the built app; reads the real environment, not `.env`. Refuses to start if `DEV_LOGIN` is set, `STORAGE_DRIVER` is not `gcs`, or `LOGO_PUBLIC_BASE_URL` or `INTAKE_LINK_KEY` is empty |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the smoke test on every pull request and every push to `main`. It does not deploy.

## Deploy

Dev runs on Cloud Run: https://ignyte-fedramp-20x-631427647079.us-central1.run.app (project `ignyte-maaz20x-dev`, Postgres on the shared instance in `ignyte-data-dev`). Console links and the inventory of every resource are in the brain runbook `maaz20x-runbook-gcp-dev-console`.

- **How `main` reaches dev.** When CI passes on a push to `main`, `.github/workflows/deploy-dev.yml` builds the `Dockerfile` for that exact commit, pushes `web:<short sha>` to Artifact Registry, applies `deploy/cloud-run/ignyte-fedramp-20x.dev.yaml` as a new revision **with no traffic** (tag `candidate`), checks that revision's own `/api/health` and only then sends it 100 % of the traffic. If the check fails the job fails and users stay on the previous revision. It signs in to Google Cloud through Workload Identity Federation as `github-deployer`; the repo holds no Google key. PRs also build the image (CI job "production image builds"), without pushing it.
- **Deploy by hand.** Actions → "Deploy dev" → Run workflow on `main`. It deploys the tip of `main` and always makes a new revision. Use it after rotating a secret (Cloud Run reads `latest` only when a revision starts), after fixing something on the Google Cloud side that made a deploy fail, or to return to `main` after a rollback.
- **What runs at start-up.** The container migrates the database, applies the staff allowlist (`ADMIN_EMAILS`), then starts the app. Settings and secret references live in the service file; secret values live only in Secret Manager.
- **Migrations must work with the previous release.** They run when the new revision starts, while the previous one still serves, and a rollback does not undo them. Add first (columns, tables), remove only in a later release once no running code uses the old shape.
- **Roll back.** Cloud Run console → service `ignyte-fedramp-20x` → Revisions → send 100 % of traffic to the previous revision, then revert the commit on `main`: the next deploy moves the traffic to the newest revision again.

## Status

WI-010 (local skeleton) is in progress on `feat/wi-010-local-skeleton`, started at risk before gate 3; open questions are in `docs/at-risk-notes-wi-010.md`. Clickable mockups of screens A–E: `docs/mockups/` ([customer intake](https://claude.ai/artifact/WDpuTu3NEkoX474inoT2dG), [Ignyte console](https://claude.ai/artifact/N18wcZ6j6EuuUydAqGVJk5); sources and tours in [`docs/mockups/README.md`](docs/mockups/README.md)).
