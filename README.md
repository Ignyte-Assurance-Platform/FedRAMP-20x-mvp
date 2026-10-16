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

## Status

Folder tree only (empty folders per ADR-0006) and OpenSpec initialised (`openspec/README.md`). The app, database and CI are built under brain work item WI-010 once its spec is approved. Clickable mockups of screens A–E: `docs/mockups/`.
