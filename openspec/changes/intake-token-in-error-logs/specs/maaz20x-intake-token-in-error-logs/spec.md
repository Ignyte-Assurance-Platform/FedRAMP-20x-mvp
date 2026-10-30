## ADDED Requirements

### Requirement: Server error logs print the customer's intake token: redact `/intake/<token>` before logging

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-020-intake-token-in-error-logs]] at brain_commit 861ab30; scope in proposal.md).

#### Scenario: a request to a path under `/intake/<token>` or `/api/intake/<token>` ends in an error that the server logs
- **WHEN** a request to a path under `/intake/<token>` or `/api/intake/<token>` ends in an error that the server logs
- **THEN** the logged message and stack contain `[redacted]` in place of the token and never the token itself

#### Scenario: the token appears percent-encoded (`intake%2F<token>`) in a logged error
- **WHEN** the token appears percent-encoded (`intake%2F<token>`) in a logged error
- **THEN** it is redacted the same way

#### Scenario: an error is logged for any other route
- **WHEN** an error is logged for any other route
- **THEN** its message and stack are unchanged

#### Scenario: the request was aborted by the client
- **WHEN** the request was aborted by the client
- **THEN** nothing is logged (same as React Router's default)

#### Scenario: a server error happens on an intake route
- **WHEN** a server error happens on an intake route
- **THEN** the error type, the rest of the message and the stack are still logged, so it can be debugged

#### Scenario: the fix is deployed to Cloud Run dev and `GET /intake/<token>/does-not-exist` is requested
- **WHEN** the fix is deployed to Cloud Run dev and `GET /intake/<token>/does-not-exist` is requested
- **THEN** `run.googleapis.com/stderr` shows the 404 error with `/intake/[redacted]` (manual check by Jesús)
