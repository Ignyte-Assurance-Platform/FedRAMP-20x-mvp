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
git clone https://github.com/jesusp-eng/FedRAMP-20x-mvp.git && cd FedRAMP-20x-mvp
cp .env.example .env
npm ci
npm run db:up     # starts Postgres (compose.yaml), runs migrations, seeds a dev user and a sample customer
npm run dev       # http://localhost:3000
```

Open http://localhost:3000 and choose **Dev sign-in (local only)**. That button exists only with `NODE_ENV=development` and `DEV_LOGIN=1` (both set in `.env.example`); in production the app refuses to start if `DEV_LOGIN` is set at all. Uploaded files land under `.data/storage/customers/<id>/intake/<document-id>/<filename>`.

`npm run db:up` uses Docker if it is running, otherwise Podman; force one with `CONTAINER_RUNTIME=podman`. `npm run db:down` stops the database.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint, including the ADR-0006 import rules |
| `npm run typecheck` | React Router type generation, then `tsc` |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Production build into `build/` |
| `npm run test:smoke` | Boots the built app against the local database (run `build` and `db:up` first) |
| `npm run db:generate` | New Drizzle migration after a schema change |
| `npm start` with `NODE_ENV=production` | Runs the built app; reads the real environment, not `.env`. Refuses to start if `DEV_LOGIN` is set or `STORAGE_DRIVER` is not `gcs` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the smoke test on every pull request and every push to `main`. It does not deploy.

## Status

WI-010 (local skeleton) is in progress on `feat/wi-010-local-skeleton`, started at risk before gate 3; open questions are in `docs/at-risk-notes-wi-010.md`. Clickable mockups of screens A–E: `docs/mockups/`.
