# maaz20x-ignyte-login Specification

## Purpose
TBD - created by archiving change ignyte-login. Update Purpose after archive.

## Requirements

### Requirement: Screen A — Ignyte login (Sign in with Google, Ignyte Workspace accounts)

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-002-ignyte-login]] at brain_commit 554fc7c; scope in proposal.md).

#### Scenario: an allowlisted Ignyte account signs in with Google
- **WHEN** an allowlisted Ignyte account signs in with Google
- **THEN** a session of 8 hours is created and Screen B opens [pre-prod]

#### Scenario: a Google account outside ignyteplatform.com completes the Google flow
- **WHEN** a Google account outside ignyteplatform.com completes the Google flow
- **THEN** no session is created and "not authorized" is shown [unit]

#### Scenario: an Ignyte account that is not in the allowlist signs in
- **WHEN** an Ignyte account that is not in the allowlist signs in
- **THEN** no session is created and "not authorized" is shown [unit]

#### Scenario: an Ignyte route is requested without a session
- **WHEN** an Ignyte route is requested without a session
- **THEN** the user is redirected to /login [smoke]

#### Scenario: an intake link is opened without a session
- **WHEN** an intake link is opened without a session
- **THEN** it opens (no login required) [smoke]

#### Scenario: the session is older than 8 hours
- **WHEN** the session is older than 8 hours
- **THEN** the next Ignyte request redirects to /login, however active the user was [unit]

#### Scenario: a signed-in user is set `active = false`
- **WHEN** a signed-in user is set `active = false`
- **THEN** their sessions are deleted and their next Ignyte request redirects to /login with "not authorized", including a session still in the cookie cache [unit, smoke]

#### Scenario: the Google refresh for a session fails with `invalid_grant` (account suspended or deleted)
- **WHEN** the Google refresh for a session fails with `invalid_grant` (account suspended or deleted)
- **THEN** the session is ended and the next request redirects to /login; WHEN Google is unreachable THEN the session stays and the check is retried on the next request; WHEN the last successful check is older than 60 minutes THEN the session is ended [unit]

#### Scenario: several requests of one session arrive after 15 minutes
- **WHEN** several requests of one session arrive after 15 minutes
- **THEN** Google is called once [unit]

#### Scenario: a Google sign-in ends without a refresh token
- **WHEN** a Google sign-in ends without a refresh token
- **THEN** no session is created and "not authorized" is shown [unit]

#### Scenario: any Ignyte route (home, Screen B, C, D, the JSON download) is requested by an inactive user or with a customer link token
- **WHEN** any Ignyte route (home, Screen B, C, D, the JSON download) is requested by an inactive user or with a customer link token
- **THEN** it is refused [smoke]

#### Scenario: the user clicks Log out
- **WHEN** the user clicks Log out
- **THEN** the session row is deleted and /login opens [smoke]

#### Scenario: a suspended test account's session reaches its next 15-minute check
- **WHEN** a suspended test account's session reaches its next 15-minute check
- **THEN** it is ended [pre-prod, E4]

#### Scenario: a session's last Google check is younger than 15 minutes
- **WHEN** a session's last Google check is younger than 15 minutes
- **THEN** no call to Google is made [unit]

#### Scenario: the seed runs with ADMIN_EMAILS
- **WHEN** the seed runs with ADMIN_EMAILS
- **THEN** exactly those users are `active` (removed emails are set inactive, rows kept), and an email outside ignyteplatform.com, or an empty ADMIN_EMAILS in production, makes the seed fail [unit]
