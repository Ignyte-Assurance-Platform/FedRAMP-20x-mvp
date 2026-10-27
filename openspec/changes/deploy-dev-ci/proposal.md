# Deploy to Cloud Run dev from main through CI: Dockerfile, service definition and a GitHub Actions workflow

> Brain work item: [[wi-maaz20x-017-deploy-dev-ci]] · brain_commit 5ebd3210acd28ae3aed5b845c8d2f220317fcce3 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-017-deploy-dev-ci.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-architecture-workstream]] §6 setup log (2026-10-26/27): the dev environment exists and the app runs on Cloud Run, but every deploy so far was manual: image built by Cloud Build with Google buildpacks from a `git archive` plus a `project.toml` kept outside the repo, then `gcloud run services replace` with a service definition kept only in the session scratchpad. Deploys of 2026-10-26/27: `web:0eb83e2`, `web:e26fc73` (IGN-18 branch), `web:25b4513` (`main`, current).
- [[maaz20x-runbook-gcp-dev-console]] §2.4: the resources the deploy uses. Service `ignyte-fedramp-20x` (us-central1, service account `web-app`, `cloud-sql-proxy` sidecar with IAM login, secrets `BETTER_AUTH_SECRET`, `INTAKE_LINK_KEY`, `GOOGLE_CLIENT_SECRET`, public invoker); Artifact Registry `us-central1-docker.pkg.dev/ignyte-maaz20x-dev/maaz20x`; Workload Identity pool `github`, provider `fedramp-20x-mvp` (trusts only repository ID `1419716116` on `refs/heads/main`); service account `github-deployer` (Cloud Run Developer, Artifact Registry Writer on the repository, may act as `web-app`).
- Same runbook §2.6: open follow-ups. The default Compute service account has project Editor and is Cloud Build's identity; the deploy is manual.
- [[adr-0001-maaz20x-typescript-monolith-cloud-run]]: one container on Cloud Run; CI/CD position in the workstream §3: GitHub Actions free plan, build → Artifact Registry → Cloud Run, Workload Identity Federation, no keys in GitHub.
- [[adr-0007-maaz20x-gcp-project-layout]]: product project plus shared data project; the database is reached through the connector across projects.
- [[wi-maaz20x-016-login-origin-behind-proxy]]: production needs `APP_URL` equal to the public URL; the service definition must keep it.
- [[wi-maaz20x-010-repo-skeleton-local-dev]] §2: deploy, Cloud SQL and the real bucket were out of its scope "until the GCP project exists". It exists now.
- FedRAMP-20x-mvp `.github/workflows/ci.yml` on `main`: lint, typecheck, unit tests with coverage, build, migrate and seed, smoke tests on **Node 24**; runs on every PR and on push to `main`. The manual images were built on **Node 22**. `package.json` engines `>=22.22.0`; `npm start` runs `tsx server/index.ts` (`tsx` is a runtime dependency).
- **Logos are not in this item.** [[maaz20x-contract-document-storage]] §1 (amended 2026-10-26) puts customer logos in the public bucket `ignyte-customer-logos-dev`; FedRAMP-20x-mvp PR #25 (IGN-16, [[wi-maaz20x-004-intake-company-service]], open, by the developer) implements the logo upload in `server/storage/*` on the old layout. Changing the same files here would collide with that PR; the contract change is raised in the review of PR #25 instead.

## What changes



## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
