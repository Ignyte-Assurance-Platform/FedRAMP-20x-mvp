# Sign-in fails on Cloud Run: form actions rejected because the app sees http while the browser uses https

> Brain work item: [[wi-maaz20x-016-login-origin-behind-proxy]] · brain_commit 042863edf97aaa40aa9fcae28160e9d75d2992ac · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-016-login-origin-behind-proxy.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- First deploy to Cloud Run dev on 2026-10-26 ([[maaz20x-architecture-workstream]] §6 setup log): service `ignyte-fedramp-20x`, image from `main` @ `0eb83e2`, `NODE_ENV=production`, `APP_URL=https://ignyte-fedramp-20x-631427647079.us-central1.run.app`. Sign-in tried by Jesús the same evening: "Something went wrong · Please try again."
- Cloud Run logs of that attempt: `Error: Bad Request` thrown from `singleFetchAction` (`react-router/dist/production/lib/server-runtime/single-fetch.js`), right after `throwIfPotentialCSRFAttack`.
- React Router 8.4.0, `lib/actions.js` `throwIfPotentialCSRFAttack`: for any action, compares `new URL(origin header).origin` with `new URL(request.url).origin`; on mismatch, and with no `allowedActionOrigins` in the build, it throws, and `singleFetchAction` answers 400. Document actions take the same check (`server-runtime/server.js`).
- `server/index.ts` on `main`: `createServer(getRequestListener(app.fetch))` from `@hono/node-server`, which builds `request.url` from the `Host` header with scheme `http`, since the container itself serves plain HTTP. Cloud Run ends TLS in front of the container and passes the original scheme only in `X-Forwarded-Proto: https`; nothing reads it.
- [[wi-maaz20x-002-ignyte-login]]: the sign-in flow (Screen A, Sign in with Google). Its acceptance criteria are not met on Cloud Run. Its pre-production checklist ([[maaz20x-architecture-workstream]] §6 item 8, scenario 2.1) is the manual check this bug blocks.
- [[adr-0004-maaz20x-google-workspace-login]]: Better Auth uses `APP_URL` as `baseURL`, so its own origin checks already see `https`. Only React Router's check is affected.
- [[adr-0001-maaz20x-typescript-monolith-cloud-run]]: the app runs on Cloud Run, so a TLS-ending proxy in front of it is the normal setup, not an edge case.
- Not affected locally: dev and the smoke tests use `http://localhost:3000`, so the browser origin and the request URL are both `http`.

## What changes



## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
