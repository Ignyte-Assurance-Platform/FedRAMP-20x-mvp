# Screen A — Ignyte login (Sign in with Google, Ignyte Workspace accounts)

> Brain work item: [[wi-maaz20x-002-ignyte-login]] · brain_commit 537ea5b73a3b21864c7e8405999642a11046b09f · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-002-ignyte-login.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-mvp-plan-v3-1]] §2.1–2.2 said username + password; clarified 2026-10-15 (Jesús): that was for the mockups only. The MVP signs Ignyte staff in with Google.
- [[adr-0004-maaz20x-google-workspace-login]]: Better Auth Google provider, Internal consent screen, server-side `hd` check, allowlist, no passwords.
- §2.2: session expires after 8 hours.
- Open: allowlist only (default) vs. every Ignyte Workspace account (question for Max). Christina (review copy 02, 2026-10-22): "Approved list only. The tool holds customers' security architecture answers, so access should be least privilege." **Decided by Jesús (engineer), 2026-10-23: allowlist only (the default).** Gate 3 is signed by the SME and an engineer ([[gates]] §3), so Max's answer is not awaited; if Max decides otherwise later, the Escalation Rule applies.
- Christina (review copy 02, 2026-10-22): points 1–5 and 7 Keep. Point 6 (leavers): closing the Google account only blocked the next sign-in, so a leaver could keep an open session for up to 8 h. Mitigation below (§3): allowlist re-checked on every request, Google account re-checked every 15 minutes, 8 h stays the ceiling. Names for the first-day allowlist (question 2): **decided by Jesús (engineer), 2026-10-23: Max and Jesús** (the default); more people are added through `ADMIN_EMAILS`. Not awaited from Max; if he decides otherwise later, the Escalation Rule applies.

## What changes

Login page with "Sign in with Google", session, logout, allowlist seed, one staff guard for every Ignyte route. Out: roles, sign-up, passwords; customer sign-in (Tanner's proposal, not taken for the MVP, [[wi-maaz20x-001-mvp-v3-1]] §2); managing the allowlist inside the app (it is `ADMIN_EMAILS`); Identity-Aware Proxy.

## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
