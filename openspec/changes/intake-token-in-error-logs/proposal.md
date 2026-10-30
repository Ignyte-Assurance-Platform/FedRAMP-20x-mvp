# Server error logs print the customer's intake token: redact `/intake/<token>` before logging

> Brain work item: [[wi-maaz20x-020-intake-token-in-error-logs]] · brain_commit 861ab302bce17d761dedf6c1ff1ec32a3f835aca · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-020-intake-token-in-error-logs.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[wi-maaz20x-004-intake-company-service]] E5: on `/intake/<token>` the token is the only credential; anyone holding a valid, unexpired link can read and change the customer's intake. [[wi-maaz20x-003-customers-list-and-create]] stores only `intake_token_hash` and `intake_token_encrypted`, and shows the link only to signed-in staff. A token in plain text in the logs breaks that: anyone with log read access on the project gets working links.
- [[maaz20x-architecture-workstream]] §6 item 10 (from the FedRAMP-20x-mvp #25 triage, m10): "The intake token in request URLs is kept by Cloud Run's request logs: exclude or redact it in Cloud Logging."
- Cloud Logging in `ignyte-maaz20x-dev`, read on 2026-10-30 (last 30 days): the token appears in three places. (1) `run.googleapis.com/requests`, `httpRequest.requestUrl` of `/intake/<token>` and `/api/intake/<token>` (23 entries). (2) The same log, `/__manifest?p=…intake%2F<token>…` (React Router's lazy route discovery, 1 entry). (3) `run.googleapis.com/stderr`, 1 entry from revision `ignyte-fedramp-20x-00008-tqb` on 2026-10-27: `Error: No route matches URL "/intake/<token>"` with its stack trace.
- (1) and (2) are infrastructure and are **not** part of this item: Cloud Logging cannot redact a field, so they are handled by an exclusion filter on the `_Default` sink, set up by us (decision of 2026-10-30, recorded in the workstream setup log). (3) cannot be fixed the same way without losing every server error on the intake routes, which are the ones needed to debug uploads (IGN-24). Decision of 2026-10-30 (Jesús): fix (3) in the app.
- React Router 8.5.0, `lib/server-runtime/server.js`: when `entry.server` exports no `handleError`, the default calls `console.error(error)` (or `error.error` for a route error response) for every error that is not an aborted request. A 404 with no matching route carries an inner `Error("No route matches URL \"<path>\"")`, so the full path, token included, is printed with the stack.
- FedRAMP-20x-mvp `main` @ `090bbfa`, `app/entry.server.tsx`: no `handleError` export; `onError` of `renderToPipeableStream` (line 80) also calls `console.error(error)` unchanged. `app/routes.ts`: the token travels in `intake/:token` and `api/intake/:token`.
- Existing entries in `_Default` (30-day retention) are left to expire; they belong to test customers in dev (decision of 2026-10-30).

## What changes

- **Expected:** server logs never contain an intake token. Where the path is useful, it appears as `/intake/[redacted]` (and `/api/intake/[redacted]`); the error type, the rest of the message and the stack stay, so errors on intake routes can still be debugged.
- **Actual:** the token is printed in plain text by React Router's default error handler and by `onError` in `app/entry.server.tsx`.

## Out of scope

See "Scope" or "Change" in the brain spec; anything not listed there is out.
