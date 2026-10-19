# Folder structure

Source of truth: brain ADR-0006 (`../ignyte-project-brain/projects/maaz20x/adrs/adr-0006-maaz20x-repo-folder-structure.md`). This page is the developer-facing copy; if they disagree, the ADR wins and this page gets fixed.

## Why

Three layouts were compared: by type (`components/`, `hooks/`, `services/`), by type then feature, and screaming architecture (one folder per feature with its own components, hooks and services). We chose **screaming architecture adapted to React Router**: framework mode already groups code by route, and in this product a route is a feature (login, customers, intake, package). That satisfies Tanner's rule (route-specific UI next to its route, shared UI in `app/components`, API as resource routes, a repository layer before the database) without an extra `modules/` layer. The other two spread one feature across five folders.

Two constraints shape the rest: server-only code (Drizzle, Better Auth, Cloud Storage, ajv) must never reach the browser bundle, and the phase 3 document worker will share the database, storage and FedRAMP code with the app.

## Tree

```text
FedRAMP-20x-mvp/
├── app/                          # React Router framework mode — browser-safe code only
│   ├── root.tsx · routes.ts · entry.client.tsx · entry.server.tsx
│   ├── routes/                   # ONE FOLDER PER FEATURE
│   │   ├── auth/                 # staff login, Google callback, logout (ADR-0004)
│   │   ├── customers/            # Screen B: list + create (WI-003)
│   │   ├── intake/               # customer side, tokenized link: company, ksis, documents (WI-004/005/006)
│   │   ├── package/              # Package Overview JSON: generate, validate, download (WI-007)
│   │   └── api/                  # resource routes, JSON/file responses only (uploads, section save, health, dev-login)
│   │   (each feature has a private components/ folder)
│   ├── components/               # shared UI, used by 2+ routes
│   │   ├── ui/                   # shadcn primitives (generated)
│   │   ├── layout/               # app shell, page header, nav
│   │   └── form-engine/          # the one renderer of form definitions (ADR-0003)
│   ├── hooks/                    # shared client hooks (useAutosave, useLocalDraft)
│   ├── lib/                      # pure helpers safe on both sides (cn, dates, formatting)
│   └── styles/
├── server/                       # server-only. Imported ONLY from loaders, actions, resource routes and server/index.ts
│   ├── index.ts                  # Hono app: static assets + cache headers (ADR-0005), React Router handler. The only entry point
│   ├── config/                   # typed environment (Valibot); DEV_LOGIN production guard
│   ├── auth/                     # Better Auth instance, hd check, allowlist, session cookie cache
│   ├── db/                       # Drizzle: schema/, migrations/, client.ts, seed.ts
│   ├── repositories/             # one file per table; the only code that talks to Drizzle
│   ├── services/                 # use-cases: intake section merge + version check, progress, package build
│   ├── storage/                  # DocumentStore interface + local/ + gcs/
│   ├── fedramp/                  # the ONLY place that knows FedRAMP schema shapes
│   │   ├── schemas/              # vendored JSON Schemas, pinned by version
│   │   ├── rules/                # KSI ↔ control crosswalk, pinned rules version (WI-012)
│   │   ├── validate.ts           # ajv, compiled once at start-up
│   │   └── mapping/              # answers → Package Overview JSON (port of Christina's converter)
│   └── cache/                    # in-memory caches keyed by version (ADR-0005)
├── form-definitions/             # forms are data (ADR-0003): company.v1.json, ksis.v1.json, documents.v1.json
├── worker/                       # phase 3 (ADR-0002): second entry point + container; imports server/db, server/storage, server/fedramp
├── tests/                        # smoke and end-to-end; unit tests sit next to the code as *.test.ts
├── scripts/                      # dev helpers (seed, local storage reset)
├── docs/                         # mockups and repo-local docs (intent stays in the brain)
├── openspec/                     # compiled frozen specs (PB - Spec Compile)
├── .github/workflows/ci.yml
├── compose.yaml · Dockerfile · react-router.config.ts · vite.config.ts · drizzle.config.ts · tsconfig.json · .env.example
```

## Rules

Enforced by ESLint `no-restricted-imports` and React Router's `.server` convention.

1. **A route folder owns its screens.** It may import `app/components`, `app/hooks`, `app/lib`; its `components/` is private. Something used by two routes moves to `app/components`, not before.
2. **`server/` is never imported by a component or hook.** Only loaders, actions, resource routes and `server/index.ts` import it. Server-only files inside `app/` take the `.server.ts` suffix.
3. **No domain logic in routes.** A loader or action validates input (Valibot), calls one function in `server/services`, returns data. Services call `server/repositories`; only repositories call Drizzle.
4. **FedRAMP knowledge lives in `server/fedramp` and `form-definitions/`.** Screens render a form definition, never a JSON Schema.
5. **Storage goes through `DocumentStore`.** No route touches disk or Cloud Storage directly.
6. **The worker is a second entry point, not a second package.**
7. **Naming:** folders and route files kebab-case; React components PascalCase; one component per file; tests `*.test.ts(x)` next to the code. Exception: tests of a cross-cutting rule that belongs to no single file (the ESLint import rules, the production start-up guard that spawns `server/index.ts`) live in `tests/unit/`; smoke tests live in `tests/smoke/`.
8. **Monorepo-ready without a monorepo.** Imports into `server/` use one alias per module (`~server/db`, `~server/fedramp`, `~server/storage`), never relative paths across modules; `server/index.ts` is the only start-up point.

## Monorepo: not now, and when

Decided against for the MVP (2026-10-16): one engineer, five days, one deployable. Workspaces add half a day of setup with no benefit until a second deployable exists. Revisit when any of these happens: the worker is built and its dependencies diverge from the app; the PDF step moves to Python; a second engineer joins; `server/fedramp` must be published on its own. Target layout then: `apps/web`, `apps/worker`, `packages/db`, `packages/fedramp`, `packages/storage`. Rule 8 keeps that move mechanical.

## Rejected alternatives

- **By type:** one change (a new intake tab) touches five folders; reviewers cannot see the feature boundary.
- **By type, then feature:** same spread, deeper nesting; contradicts "UI next to its route".
- **Literal `src/modules/<feature>/`:** `app/routes` already is the module level; a second feature tree would drift from it.
- **Monorepo from day one:** see above.
- **Hexagonal layering inside `server/`** (`domain/`, `application/`, `infrastructure/`): same dependency direction with more folders than the MVP needs.
