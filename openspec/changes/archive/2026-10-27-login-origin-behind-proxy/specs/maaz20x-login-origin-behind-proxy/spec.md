## ADDED Requirements

### Requirement: Sign-in fails on Cloud Run: form actions rejected because the app sees http while the browser uses https

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-016-login-origin-behind-proxy]] at brain_commit 042863e; scope in proposal.md).

#### Scenario: the app runs in production with `APP_URL` on `https` and receives a form action whose `Origin` equals `APP_URL`'s origin while the container sees `http`
- **WHEN** the app runs in production with `APP_URL` on `https` and receives a form action whose `Origin` equals `APP_URL`'s origin while the container sees `http`
- **THEN** the action runs and is not rejected with 400

#### Scenario: a form action arrives with an `Origin` different from `APP_URL`'s origin
- **WHEN** a form action arrives with an `Origin` different from `APP_URL`'s origin
- **THEN** it is still rejected (CSRF protection unchanged)

#### Scenario: the request is rewritten to the public origin
- **WHEN** the request is rewritten to the public origin
- **THEN** path, query string, method, headers and body are unchanged

#### Scenario: the app runs in development
- **WHEN** the app runs in development
- **THEN** requests are not rewritten and local sign-in and smoke tests behave as before

#### Scenario: the fix is deployed to Cloud Run dev
- **WHEN** the fix is deployed to Cloud Run dev
- **THEN** Jesús signs in with Google with `jesus.p@ignyteplatform.com` and reaches the customer list (manual check, wi-002 scenario 2.1)
