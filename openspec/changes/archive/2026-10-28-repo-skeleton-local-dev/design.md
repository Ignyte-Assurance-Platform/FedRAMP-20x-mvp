# Design — Repo skeleton and local development environment (no cloud needed)

> Brain work item: [[wi-maaz20x-010-repo-skeleton-local-dev]] · brain_commit 58c518df04a96709bdbac4540966bb507399c39e · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-010-repo-skeleton-local-dev.md

## Risk and rollback

- Risk: the stack is still `proposed` (ADR-0001). It is Tanner's own proposal, so rework risk is low; if it changes, the skeleton is the only thing to redo.
- Risk: a dev-only login leaking to production. Mitigation: a start-time guard (configuration is read when the app starts, so the build never contains `DEV_LOGIN`) plus a test that starts the real entry point in production mode and fails if the flag is honoured.
- Rollback: revert the skeleton commits; nothing outside the repo is touched.
