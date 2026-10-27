## ADDED Requirements

### Requirement: Deploy to Cloud Run dev from main through CI: Dockerfile, service definition and a GitHub Actions workflow

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-017-deploy-dev-ci]] at brain_commit 5ebd321; scope in proposal.md).

#### Scenario: a PR is merged to `main` and CI passes on that push
- **WHEN** a PR is merged to `main` and CI passes on that push
- **THEN** the deploy workflow builds the image of that exact commit, pushes it as `web:<sha>` and Cloud Run serves a new revision with it

#### Scenario: CI fails on a push to `main`
- **WHEN** CI fails on a push to `main`
- **THEN** no deploy runs

#### Scenario: the workflow authenticates to Google Cloud
- **WHEN** the workflow authenticates to Google Cloud
- **THEN** it uses the Workload Identity provider and `github-deployer`, and the repository holds no Google key or secret

#### Scenario: the new revision is ready
- **WHEN** the new revision is ready
- **THEN** `/api/health` answers 200 with database ok, or the job fails and the previous revision keeps serving

#### Scenario: the workflow is started by hand on `main`
- **WHEN** the workflow is started by hand on `main`
- **THEN** it deploys `main`'s latest commit the same way

#### Scenario: the image is built
- **WHEN** the image is built
- **THEN** it runs on Node 24, as a non-root user, and contains no `.env` file

#### Scenario: the deployed app is opened after the first CI deploy
- **WHEN** the deployed app is opened after the first CI deploy
- **THEN** Jesús signs in with Google and reaches the customer list (manual check)

#### Scenario: the first CI deploy has succeeded
- **WHEN** the first CI deploy has succeeded
- **THEN** the default Compute service account no longer has project Editor, and the setup log and runbook say so

#### Scenario: someone reads `README.md`
- **WHEN** someone reads `README.md`
- **THEN** it explains how `main` reaches dev, how to deploy by hand and how to roll back
