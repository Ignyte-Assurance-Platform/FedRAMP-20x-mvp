# Tasks — Deploy to Cloud Run dev from main through CI: Dockerfile, service definition and a GitHub Actions workflow

> Brain work item: [[wi-maaz20x-017-deploy-dev-ci]] · brain_commit 5ebd3210acd28ae3aed5b845c8d2f220317fcce3 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-017-deploy-dev-ci.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 5ebd321; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-017-deploy-dev-ci.md`)

## 2. Implement
- [x] 2.1 WHEN a PR is merged to `main` and CI passes on that push THEN the deploy workflow builds the image of that exact commit, pushes it as `web:<sha>` and Cloud Run serves a new revision with it · Deploy dev ran after CI on the merges of #29 (`web:70f7cc1`, revision 00006) and #26 (`web:69d5317`, revision 00007), each the SHA CI tested
- [x] 2.2 WHEN CI fails on a push to `main` THEN no deploy runs · by inspection: the job runs only when `workflow_run.conclusion == 'success'` on a push; no CI failure on `main` yet to observe
- [x] 2.3 WHEN the workflow authenticates to Google Cloud THEN it uses the Workload Identity provider and `github-deployer`, and the repository holds no Google key or secret · by inspection: `google-github-actions/auth` with the WIF provider and `github-deployer`, workflow permissions `contents: read` + `id-token: write`, no secrets used
- [x] 2.4 WHEN the new revision is ready THEN `/api/health` answers 200 with database ok, or the job fails and the previous revision keeps serving · run 40531534606: revision 00007 ready, `/api/health` → `{"status":"ok","database":"ok"}`
- [x] 2.5 WHEN the workflow is started by hand on `main` THEN it deploys `main`'s latest commit the same way · manual run 40539013523 on `main` (69d5317) succeeded; same image and definition, so Cloud Run kept revision 00007
- [x] 2.6 WHEN the image is built THEN it runs on Node 24, as a non-root user, and contains no `.env` file · checked locally with podman: Node v24.22.1, user `node`, no `/app/.env`; started in production mode against local Postgres, `/api/health` 200
- [ ] 2.7 WHEN the deployed app is opened after the first CI deploy THEN Jesús signs in with Google and reaches the customer list (manual check)
- [x] 2.8 WHEN the first CI deploy has succeeded THEN the default Compute service account no longer has project Editor, and the setup log and runbook say so · 2026-10-27: Editor removed from `631427647079-compute@developer.gserviceaccount.com`, Cloud Build API disabled; recorded in the brain workstream §6 and runbook §2.6
- [x] 2.9 WHEN someone reads `README.md` THEN it explains how `main` reaches dev, how to deploy by hand and how to roll back

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
