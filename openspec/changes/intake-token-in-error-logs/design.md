# Design — Server error logs print the customer's intake token: redact `/intake/<token>` before logging

> Brain work item: [[wi-maaz20x-020-intake-token-in-error-logs]] · brain_commit 861ab302bce17d761dedf6c1ff1ec32a3f835aca · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-020-intake-token-in-error-logs.md

## Repro

Environment: production build (`npm run build && npm start`) or Cloud Run dev, any token-shaped string.

1. Request `GET /intake/<token>/does-not-exist` (or `GET /api/intake/<token>/does-not-exist`).
2. The app answers 404, as it should.
3. stderr shows `Error: No route matches URL "/intake/<token>/does-not-exist"` followed by the stack trace, with the token in plain text. On Cloud Run that line lands in `run.googleapis.com/stderr`.

Any other error whose message or stack contains the request path or URL takes the same way out.

Confirmed on Cloud Run dev on 2026-10-30 (revision `ignyte-fedramp-20x-00035-fzc`, `main` @ `090bbfa`) with a fake, token-shaped value: the request answered 404 and `run.googleapis.com/stderr` stored `Error: No route matches URL "/intake/<value>/does-not-exist"` with the value in full. A real token takes the same path, since the route match does not depend on the token being valid.

## Expected vs actual

- **Expected:** server logs never contain an intake token. Where the path is useful, it appears as `/intake/[redacted]` (and `/api/intake/[redacted]`); the error type, the rest of the message and the stack stay, so errors on intake routes can still be debugged.
- **Actual:** the token is printed in plain text by React Router's default error handler and by `onError` in `app/entry.server.tsx`.

## Root-cause hypothesis

The app relies on React Router's default `handleError`, which logs the raw error. Nothing in the app removes the token from what it logs. The fix is a single redaction helper used by an exported `handleError` in `app/entry.server.tsx` and by `onError` there, which replaces the token segment after `/intake/` (plain and percent-encoded, `intake%2F`) in the message, the stack and, for route error responses, the inner error. The error is logged once, as today (the default skips aborted requests; keep that).

Out of scope:
- Request logs and `/__manifest` in Cloud Logging (infrastructure, handled by us with the exclusion filter).
- Changing how the token travels (URL path, per [[wi-maaz20x-004-intake-company-service]]); that is a spec change, not this bug.
- The other `console.error` calls (`customer-new.tsx`, `customer-package.tsx`, `server/index.ts`, `intake.ts` logo publish): they log staff-route errors or object paths, not the token. Check each while doing the change and note any that can carry it.

## Regression test

- **Unit**: the redaction helper turns `/intake/<token>`, `/api/intake/<token>/x`, `?p=%2Fintake%2F<token>` and a full URL into their `[redacted]` form, and leaves other paths (`/customers/123/package`, `/login`) unchanged.
- **Unit, `handleError`**: given an `Error("No route matches URL \"/intake/<token>/x\"")` and a route error response wrapping it, what reaches `console.error` contains `/intake/[redacted]` and not the token; given an aborted request, nothing is logged.
- **Smoke** (`tests/smoke/app.smoke.test.ts`, production build): `GET /intake/<token>/does-not-exist` answers 404 and the captured server stderr does not contain `<token>`. Today it does, which is the failure.
