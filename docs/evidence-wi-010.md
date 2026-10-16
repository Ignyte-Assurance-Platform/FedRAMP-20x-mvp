# WI-010 acceptance evidence

Real command output for each acceptance criterion in brain work item `wi-maaz20x-010-repo-skeleton-local-dev` §5, captured on 2026-10-16 on branch `feat/wi-010-local-skeleton` (Windows 11, Node 24.16.0).

**Database.** Criteria were first checked against a stand-in Postgres 17 (Docker could not run before WSL was installed). After WSL was installed they were rerun on the real compose path: `npm run db:up` with Docker Desktop. See the update under criterion 1.

## Summary

| # | Criterion | Result |
| --- | --- | --- |
| 1 | Clean machine to a running, seeded app in under 10 minutes | Met: about 1.5 min including the Postgres image pull |
| 2 | Dev sign-in without Google when `DEV_LOGIN=1` and `NODE_ENV=development` | Met |
| 3 | Production with `DEV_LOGIN` set refuses to start with a clear error | Met |
| 4 | Local upload lands at `customers/<id>/intake/<document-id>/<filename>` with a `documents` row (path, size, type, SHA-256) | Met |
| 5 | CI runs lint, typecheck, tests and build on PRs and blocks the merge on failure | Workflow added; blocking needs branch protection (at-risk note 9); first CI run is on the draft PR |
| 6 | Static assets immutable; pages with customer data `no-store` | Met |
| 7 | `server/` imported only through per-module aliases, and only from routes or `server/index.ts`; ESLint fails otherwise | Met (ESLint plus a client-build guard) |
| 8 | `server/index.ts` is the only entry point | Met |

## 1. Clean machine, under 10 minutes

A fresh clone of the branch into an empty folder, following the README. In the `db:up` step, migrate and seed ran against a new, empty database on the stand-in Postgres.

```text
[2s rc=0]  git clone -q -b feat/wi-010-local-skeleton … clean
[0s rc=0]  cp .env.example .env
[39s rc=0] npm ci --no-audit --no-fund

> npm run db:migrate
migrations applied
> npm run db:seed
seeded 1 user(s): dev@ignyteplatform.com
seeded customer: Example Cloud Co (fictional seed) (0f52dc20-e6ac-4d60-b85a-891b8a373fb7)
migrate+seed: 5s

> npm run dev
dev ready in 7s
Maaz 20x (development) listening on http://localhost:3000 - dev sign-in ON
login 200 dev-button=True
home 200 signed-in=True cache=no-store
```

That totals about 53 s without the database container.

**Update, compose path with Docker Desktop (WSL 2):**

```text
> npm run db:up
 Container maaz20x-postgres-1 Healthy
migrations applied
seeded 1 user(s): dev@ignyteplatform.com
seeded customer: Example Cloud Co (fictional seed) (c3ca9e03-45d4-49b4-b5c7-0d1ea5ba4464)
db:up exit=0 in 35s   (includes pulling postgres:17-alpine)

> npm run test:smoke
 Test Files  1 passed (1)
      Tests  5 passed (5)

> npm run dev
Maaz 20x (development) listening on http://localhost:3000 (dev sign-in ON)
dev-login 303
home 200 no-store  (shows dev@ignyteplatform.com)
```

Clean machine total: clone 2 s + npm ci 39 s + db:up 35 s + dev ready 7 s, about 1.5 minutes.

## 2. Dev sign-in without Google

`npm run dev` with `.env` copied from `.env.example`, then curl:

```text
Maaz 20x (development) listening on http://localhost:3000 — dev sign-in ON
--- GET /login
200 cache-control:no-store
Dev sign-in (local only)
--- POST /api/dev-login
303 -> /
--- GET / with session
200 cache-control:no-store
Signed in as
dev@ignyteplatform.com
--- GET /api/health
{"status":"ok","database":"ok"}  200
```

Also covered by the smoke test: `✓ signs in without Google and shows a no-store page with the user's data`. Unit test: `✓ enables the dev sign-in only with NODE_ENV=development and DEV_LOGIN=1` (`DEV_LOGIN=true` or `NODE_ENV=test` leave it off).

## 3. Production refuses DEV_LOGIN

```text
$ NODE_ENV=production DEV_LOGIN=1 npm start
> tsx server/index.ts

Refusing to start: DEV_LOGIN is set while NODE_ENV=production. The dev-only sign-in exists for local development only; remove DEV_LOGIN from the environment.
exit=1
```

The test starts the real entry point in a child process (`tests/unit/production-guard.test.ts`). Any value counts as set:

```text
✓ production start-up guard > refuses to start when DEV_LOGIN="1" in production
✓ production start-up guard > refuses to start when DEV_LOGIN="0" in production
✓ production start-up guard > refuses to start when DEV_LOGIN="" in production
```

Without `DEV_LOGIN`, production starts and the dev sign-in does not exist:

```text
Maaz 20x (production) listening on http://localhost:3000
dev-login 404
login 200 cache-control:no-store
(login page contains "Dev sign-in": 0 times)
```

## 4. Local upload path and `documents` row

Smoke test `✓ stores an upload under the contract path and records its documents row`. It gets a signed upload URL from the service, PUTs the bytes through the app's dev-only route, records the row, and then checks:

- the row's `objectPath` is `customers/<customer id>/intake/<document id>/Smoke Test.pdf`, with `size`, `contentType` `application/pdf`, `sha256` equal to the SHA-256 of the bytes sent, and `uploadedBy`;
- the file is on disk at `<LOCAL_STORAGE_DIR>/customers/<customer id>/intake/<document id>/Smoke Test.pdf` with the same content.

Unit tests for the store: `✓ stores an upload at the contract path and reports size, type and SHA-256`, plus rejection of a tampered, expired or wrong-operation token, a mismatched content type, an over-size upload (nothing left behind), and path traversal.

## 5. CI on pull requests

`.github/workflows/ci.yml` runs on `pull_request` and on `push` to `main`. Steps: `npm ci`, lint, typecheck, unit tests, build, migrate and seed against a Postgres 17 service, smoke test. No deploy.

The same steps pass locally:

```text
lint exit=0
typecheck exit=0
test exit=0        Test Files  6 passed (6)   Tests  48 passed (48)
build exit=0       ✓ built in 286ms
test:smoke exit=0  Test Files  1 passed (1)   Tests  5 passed (5)
```

Still open: the first GitHub Actions run happens on the draft PR. Blocking the merge also needs `main` protected with this check marked required, a repository setting (at-risk note 9).

## 6. Cache headers

Production start, `curl` against the running app:

```text
asset 200 cache-control:public, max-age=31536000, immutable
login 200 cache-control:no-store
```

Smoke test:

```text
✓ reports a healthy database                              (/api/health: no-store)
✓ serves built assets with the immutable cache header
✓ signs in without Google and shows a no-store page with the user's data   (/ and /_root.data: no-store)
```

## 7. Server imports through per-module aliases, never from browser code

ESLint `no-restricted-imports` (`eslint.config.js`), proven by `tests/unit/import-rules.test.ts`:

```text
✓ lets a route module import a server module through its alias
✓ fails a relative import into server/
✓ fails a deep import past a module's entry
✓ fails any server import from browser code (app/components/ui/button.tsx)
✓ fails any server import from browser code (app/components/layout/app-shell.tsx)
✓ fails any server import from browser code (app/hooks/use-autosave.ts)
✓ fails any server import from browser code (app/lib/dates.ts)
✓ fails any server import from browser code (app/routes/intake/components/progress.tsx)
✓ fails a relative import from one server module into another
✓ allows relative imports inside one server module
```

ESLint can't tell a route's loader from its component inside one file, so the Vite client build also fails if any `server/` module reaches the browser bundle. Proof: a temporary route whose component called a server function:

```text
Build failed with 1 error:
[plugin maaz:server-only-guard]
Error: server-only module reached the client bundle: C:/Work/FedRAMP-20x-mvp/server/services/index.ts
```

## 8. One entry point

`package.json`: `"dev": "tsx server/index.ts"` and `"start": "tsx server/index.ts"`. Nothing else starts a server: no `react-router dev` and no `react-router-serve`. In development `server/index.ts` runs Vite in middleware mode; in production it loads `build/server/index.js` as a module. The migrate and seed scripts are one-off commands, not app entry points.
