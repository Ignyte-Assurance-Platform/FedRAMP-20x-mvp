# Tasks — Staff access through the Google group ignyteFedramp20x instead of the ADMIN_EMAILS allowlist

> Brain work item: [[wi-maaz20x-019-staff-access-google-group]] · brain_commit 23b302964bbd0ef54494f64d12d39787561bb35c · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-019-staff-access-google-group.md

## 1. Setup
- [ ] 1.1 Read the frozen brain spec at brain_commit 23b3029; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-019-staff-access-google-group.md`)

## 2. Implement
- [ ] 2.1 WHEN a group member signs in for the first time THEN a staff user is created and active, a session of 8 hours is created and Screen B opens [unit]
- [ ] 2.2 WHEN an Ignyte account that is not in the group signs in THEN no session, no user and no account row is created and "not authorized" is shown [unit]
- [ ] 2.3 WHEN an existing active user who is no longer in the group signs in THEN no session is created, the user becomes inactive and "not authorized" is shown [unit]
- [ ] 2.4 WHEN an existing inactive user who is in the group signs in THEN the user becomes active and a session is created [unit]
- [ ] 2.5 WHEN the membership API times out or answers anything other than 200 at sign-in THEN nothing is written and "Sign-in did not finish. Try again." is shown [unit]
- [ ] 2.6 WHEN an open session's last group check is older than 5 minutes and the user is no longer in the group THEN that request is redirected to /login with "not authorized", the user becomes inactive and all their sessions are deleted [unit]
- [ ] 2.7 WHEN an open session's last group check is less than 5 minutes old THEN the membership API is not called [unit]
- [ ] 2.8 WHEN several requests of the same session arrive with the group check due THEN the membership API is called once [unit]
- [ ] 2.9 WHEN the membership API is unreachable during the re-check THEN the session continues and the next request retries, until 15 minutes after the last successful group check, after which the session is ended [unit]
- [ ] 2.10 WHEN the app starts with `STAFF_DIRECTORY=local` and `NODE_ENV=production`, or in production without `STAFF_GROUP_EMAIL`, or with a `STAFF_GROUP_EMAIL` outside the allowed domain THEN it refuses to start [unit]
- [ ] 2.11 WHEN the container starts THEN it runs the migrations and the app, and no allowlist seed runs [smoke]; AND `ADMIN_EMAILS` and `seed:allowlist` appear nowhere in `server/`, `deploy/`, `.github/`, `Dockerfile`, `package.json` and `README.md` [CI grep]
- [ ] 2.12 WHEN the dev user signs in with `DEV_LOGIN` and is listed in `LOCAL_STAFF_EMAILS` THEN Screen B opens; WHEN they are not listed THEN "not authorized" is shown [smoke]
- [ ] 2.13 WHEN a member of ignyteFedramp20x signs in on dev THEN Screen B opens; WHEN a non-member Ignyte account signs in THEN "not authorized" is shown [pre-prod]
- [ ] 2.14 WHEN Max or Adam removes a signed-in test member from the group THEN that person's first request made more than 5 minutes after their last group check is sent to /login [pre-prod]

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
