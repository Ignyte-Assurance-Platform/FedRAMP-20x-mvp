# maaz20x-staff-access-google-group Specification

## Purpose
Who may use the Ignyte console: members of the Google group `ignyteFedramp20x`, checked with the Directory API (`hasMember`) as the runtime service account at sign-in and again every 5 minutes, failing closed when the directory cannot answer (sessions survive 15 minutes after the last successful check). It replaces the `ADMIN_EMAILS` allowlist and its start-up seed. Source: brain work item [[wi-maaz20x-019-staff-access-google-group]] at brain_commit 23b3029; archived change `2026-10-29-staff-access-google-group`.

## Requirements

### Requirement: Staff access through the Google group ignyteFedramp20x instead of the ADMIN_EMAILS allowlist

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-019-staff-access-google-group]] at brain_commit 23b3029; scope in proposal.md).

#### Scenario: a group member signs in for the first time
- **WHEN** a group member signs in for the first time
- **THEN** a staff user is created and active, a session of 8 hours is created and Screen B opens [unit]

#### Scenario: an Ignyte account that is not in the group signs in
- **WHEN** an Ignyte account that is not in the group signs in
- **THEN** no session, no user and no account row is created and "not authorized" is shown [unit]

#### Scenario: an existing active user who is no longer in the group signs in
- **WHEN** an existing active user who is no longer in the group signs in
- **THEN** no session is created, the user becomes inactive and "not authorized" is shown [unit]

#### Scenario: an existing inactive user who is in the group signs in
- **WHEN** an existing inactive user who is in the group signs in
- **THEN** the user becomes active and a session is created [unit]

#### Scenario: the membership API times out or answers anything other than 200 at sign-in
- **WHEN** the membership API times out or answers anything other than 200 at sign-in
- **THEN** nothing is written and "Sign-in did not finish. Try again." is shown [unit]

#### Scenario: an open session's last group check is older than 5 minutes and the user is no longer in the group
- **WHEN** an open session's last group check is older than 5 minutes and the user is no longer in the group
- **THEN** that request is redirected to /login with "not authorized", the user becomes inactive and all their sessions are deleted [unit]

#### Scenario: an open session's last group check is less than 5 minutes old
- **WHEN** an open session's last group check is less than 5 minutes old
- **THEN** the membership API is not called [unit]

#### Scenario: several requests of the same session arrive with the group check due
- **WHEN** several requests of the same session arrive with the group check due
- **THEN** the membership API is called once [unit]

#### Scenario: the membership API is unreachable during the re-check
- **WHEN** the membership API is unreachable during the re-check
- **THEN** the session continues and the next request retries, until 15 minutes after the last successful group check, after which the session is ended [unit]

#### Scenario: the app starts with `STAFF_DIRECTORY=local` and `NODE_ENV=production`, or in production without `STAFF_GROUP_EMAIL`, or with a `STAFF_GROUP_EMAIL` outside the allowed domain
- **WHEN** the app starts with `STAFF_DIRECTORY=local` and `NODE_ENV=production`, or in production without `STAFF_GROUP_EMAIL`, or with a `STAFF_GROUP_EMAIL` outside the allowed domain
- **THEN** it refuses to start [unit]

#### Scenario: the container starts
- **WHEN** the container starts
- **THEN** it runs the migrations and the app, and no allowlist seed runs [smoke]; AND `ADMIN_EMAILS` and `seed:allowlist` appear nowhere in `server/`, `deploy/`, `.github/`, `Dockerfile`, `package.json` and `README.md` [CI grep]

#### Scenario: the dev user signs in with `DEV_LOGIN` and is listed in `LOCAL_STAFF_EMAILS`
- **WHEN** the dev user signs in with `DEV_LOGIN` and is listed in `LOCAL_STAFF_EMAILS`
- **THEN** Screen B opens; WHEN they are not listed THEN "not authorized" is shown [smoke]

#### Scenario: a member of ignyteFedramp20x signs in on dev
- **WHEN** a member of ignyteFedramp20x signs in on dev
- **THEN** Screen B opens; WHEN a non-member Ignyte account signs in THEN "not authorized" is shown [pre-prod]

#### Scenario: Max or Adam removes a signed-in test member from the group
- **WHEN** Max or Adam removes a signed-in test member from the group
- **THEN** that person's first request made more than 5 minutes after their last group check is sent to /login [pre-prod]
