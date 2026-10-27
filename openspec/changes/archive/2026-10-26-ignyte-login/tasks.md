# Tasks — Screen A — Ignyte login (Sign in with Google, Ignyte Workspace accounts)

> Brain work item: [[wi-maaz20x-002-ignyte-login]] · brain_commit 554fc7c8b8e40651417f6c5fe2ee2efb36858cce · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-002-ignyte-login.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 554fc7c; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-002-ignyte-login.md`)

## 2. Implement
- [ ] 2.1 WHEN an allowlisted Ignyte account signs in with Google THEN a session of 8 hours is created and Screen B opens [pre-prod]
- [x] 2.2 WHEN a Google account outside ignyteplatform.com completes the Google flow THEN no session is created and "not authorized" is shown [unit]
- [x] 2.3 WHEN an Ignyte account that is not in the allowlist signs in THEN no session is created and "not authorized" is shown [unit]
- [x] 2.4 WHEN an Ignyte route is requested without a session THEN the user is redirected to /login [smoke]
- [x] 2.5 WHEN an intake link is opened without a session THEN it opens (no login required) [smoke]
- [x] 2.6 WHEN the session is older than 8 hours THEN the next Ignyte request redirects to /login, however active the user was [unit]
- [x] 2.7 WHEN a signed-in user is set `active = false` THEN their sessions are deleted and their next Ignyte request redirects to /login with "not authorized", including a session still in the cookie cache [unit, smoke]
- [x] 2.8 WHEN the Google refresh for a session fails with `invalid_grant` (account suspended or deleted) THEN the session is ended and the next request redirects to /login; WHEN Google is unreachable THEN the session stays and the check is retried on the next request; WHEN the last successful check is older than 60 minutes THEN the session is ended [unit]
- [x] 2.9 WHEN several requests of one session arrive after 15 minutes THEN Google is called once [unit]
- [x] 2.10 WHEN a Google sign-in ends without a refresh token THEN no session is created and "not authorized" is shown [unit]
- [x] 2.11 WHEN any Ignyte route (home, Screen B, C, D, the JSON download) is requested by an inactive user or with a customer link token THEN it is refused [smoke]
- [x] 2.12 WHEN the user clicks Log out THEN the session row is deleted and /login opens [smoke]
- [ ] 2.13 WHEN a suspended test account's session reaches its next 15-minute check THEN it is ended [pre-prod, E4]
- [x] 2.14 WHEN a session's last Google check is younger than 15 minutes THEN no call to Google is made [unit]
- [x] 2.15 WHEN the seed runs with ADMIN_EMAILS THEN exactly those users are `active` (removed emails are set inactive, rows kept), and an email outside ignyteplatform.com, or an empty ADMIN_EMAILS in production, makes the seed fail [unit]

## 3. Verify
- [x] 3.1 Automated review (PB - Review PR) against this spec (`.pb-cache/reviews/pr-18-2026-10-26.md`)
- [x] 3.2 Human triage (gate 7) recorded in Linear IGN-14 (comment b1cd2800, 2026-10-26)
