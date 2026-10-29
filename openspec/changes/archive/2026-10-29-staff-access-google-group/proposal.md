# Staff access through the Google group ignyteFedramp20x instead of the ADMIN_EMAILS allowlist

> Brain work item: [[wi-maaz20x-019-staff-access-google-group]] · brain_commit 23b302964bbd0ef54494f64d12d39787561bb35c · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-019-staff-access-google-group.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-chat-2026-10-28-staff-google-group]]: Max chose the Google group **ignyteFedramp20x** as the list of who may use the app; Adam created it (Max, Jesús, Christina). Members are decided by Max and Adam, Tanner as last resort. The message to Adam promises that someone removed from the group "loses access within minutes".
- [[wi-maaz20x-002-ignyte-login]] (handed off, shipped in IGN-14): Google sign-in with server-side `hd` and `email_verified` checks, 8-hour fixed session, one staff guard on `users.active`, Google account re-checked every 15 minutes with a 60-minute outage cap. The allowlist is `ADMIN_EMAILS`, applied at every container start by `db:seed:allowlist`. Its §1 says: "if Max decides otherwise later, the Escalation Rule applies". This item is that escalation: the access rule changes, the rest of wi-002 stays.
- [[adr-0004-maaz20x-google-workspace-login]]: "allowlist on top of the domain"; its consequences already foresee that "roles can later map to Workspace groups". Amended by this item.
- Christina (review copy 02 of brief 02, 2026-10-22, in wi-002 §1): "Approved list only … least privilege." A curated group keeps that: only people Max or Adam put in the group get in, not every Ignyte account.
- Code at `FedRAMP-20x-mvp` `main` @ `c413d43`, Better Auth 1.7.12:
  - `server/auth/auth.ts`: our `getUserInfo` (lines 48–56, used at 106) runs before Better Auth writes anything; `disableSignUp: true`; account linking by verified email for seeded users; `session.create.before` refuses inactive users (128); `lastGoogleCheckAt` additional field (143).
  - Better Auth callback order (verified in `node_modules`): `getUserInfo` → find user by email → link account, or create user (`user.create.before`, then `account.create.before`, one transaction) → `createSession` (`session.create.before`). A `user.create.before` hook only sees the row and the endpoint path, not an earlier check.
  - `server/auth/staff-session.ts` (`evaluateStaffSession`, `GOOGLE_RECHECK_MS`, `GOOGLE_OUTAGE_LIMIT_MS`), `server/repositories/sessions.ts` (atomic claim and release, lines 9–25), `server/services/session.ts` (`resolveStaffUser` line 58; `ACCOUNT_REFUSED` line 14: any other error code shows "Sign-in did not finish").
  - `server/auth/dev-login-plugin.ts`: calls `createSession` directly; its error text names `db:seed:allowlist` (line 18).
  - Allowlist: `server/db/seed-allowlist.ts`, `server/db/allowlist.ts`, `server/repositories/users.ts` (deactivates users not in the list and deletes their sessions), `server/config/env.ts`, `Dockerfile` CMD (line 19), `.github/workflows/ci.yml` (line 68), `package.json` (`db:up`, `db:seed:allowlist`), `deploy/cloud-run/ignyte-fedramp-20x.dev.yaml` (secret `ADMIN_EMAILS`; service account `web-app@ignyte-maaz20x-dev.iam.gserviceaccount.com`).
  - `google-auth-library` is present only as a transitive dependency of `@google-cloud/storage`.
- Google documentation, checked 2026-10-29:
  - Admin SDK Directory API `members.hasMember` (developers.google.com/admin-sdk/directory/reference/rest/v1/members/hasMember): returns `isMember`, direct or nested membership within one domain; scope `admin.directory.group.member.readonly` among others. Error responses for an unknown member are not documented.
  - Cloud Identity `checkTransitiveMembership` needs Workspace Enterprise or Cloud Identity Premium: **not** used.
  - Admin roles for service accounts without domain-wide delegation (docs.cloud.google.com/identity/docs/how-to/setup; Workspace admin help "Assign specific admin roles"): any prebuilt role except Super Admin can go to a service account; Google documents this path for the **Cloud Identity Groups API**. For the Directory API it works in practice but is **not documented**: hence the hand test in §8 and the fallback in §3.
  - The Cloud Run metadata server documents no `scopes` parameter (docs.cloud.google.com/run/docs/securing/service-identity); `google-auth-library` sends one and it is reported to work. The default token is `cloud-platform`, which `hasMember` does not accept, so the scope request must succeed: part of the hand test.
- [[adr-0010-sd360-workspace-service-account-groups]]: SD 360 reads groups with a key file, domain-wide delegation and the Cloud Identity Groups API, because it also **writes** groups and Drive permissions. Maaz only reads membership, so it avoids a key file and delegation; the difference is deliberate (ADR-0004 amendment).
- [[wi-maaz20x-012-fedramp-rules-sync]] (post-MVP) planned its approvers "in Secret Manager like `ADMIN_EMAILS`": no longer holds once `ADMIN_EMAILS` is gone (History line added there).
- Contradiction noted: on 2026-10-28 the plan was to enable the **Cloud Identity API** in `ignyte-maaz20x-dev`. With `hasMember` the API to enable is the **Admin SDK API** (`admin.googleapis.com`); the Cloud Identity API is only needed if the fallback is used.

## What changes

**Intent.** Who may use Ignyte FedRAMP 20x is whoever is in the Google group ignyteFedramp20x. Adding someone to the group lets them sign in, with no deploy. Removing someone ends their access at their next request after at most 5 minutes, and blocks every later sign-in.

In:
- Membership check at sign-in and every 5 minutes on open sessions, as the app's own service account.
- First sign-in of a group member creates their staff user (no seed needed).
- `ADMIN_EMAILS`, the allowlist seed and its start-up step are retired.
- A local driver so development and tests need no Google.

Out: roles (every member is a consultant with full access, as in wi-002); managing the group inside the app; who is in the group (Max and Adam); customers' access (the intake link does not change); a break-glass account (E4); the Google account re-check of wi-002 (unchanged in code).

## Out of scope

See "Scope" or "Change" in the brain spec; anything not listed there is out.
