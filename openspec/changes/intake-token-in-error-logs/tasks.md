# Tasks — Server error logs print the customer's intake token: redact `/intake/<token>` before logging

> Brain work item: [[wi-maaz20x-020-intake-token-in-error-logs]] · brain_commit 861ab302bce17d761dedf6c1ff1ec32a3f835aca · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-020-intake-token-in-error-logs.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 861ab30; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-020-intake-token-in-error-logs.md`)

## 2. Implement
- [x] 2.1 WHEN a request to a path under `/intake/<token>` or `/api/intake/<token>` ends in an error that the server logs THEN the logged message and stack contain `[redacted]` in place of the token and never the token itself
- [x] 2.2 WHEN the token appears percent-encoded (`intake%2F<token>`) in a logged error THEN it is redacted the same way
- [x] 2.3 WHEN an error is logged for any other route THEN its message and stack are unchanged
- [x] 2.4 WHEN the request was aborted by the client THEN nothing is logged (same as React Router's default)
- [x] 2.5 WHEN a server error happens on an intake route THEN the error type, the rest of the message and the stack are still logged, so it can be debugged
- [ ] 2.6 WHEN the fix is deployed to Cloud Run dev and `GET /intake/<token>/does-not-exist` is requested THEN `run.googleapis.com/stderr` shows the 404 error with `/intake/[redacted]` (manual check by Jesús)

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
