# maaz20x-repo-skeleton-local-dev Specification

## Purpose
The repo skeleton and a local development environment that need no cloud: React Router on Hono, Drizzle with a local Postgres, Better Auth with a dev-only sign-in, a `DocumentStore` with local-disk and Cloud Storage drivers chosen by environment, a typed environment loader, CI and tests. Every cloud dependency sits behind an interface so the app switches to GCP by configuration only. Source: brain work item [[wi-maaz20x-010-repo-skeleton-local-dev]] at brain_commit 58c518d; archived change `2026-10-28-repo-skeleton-local-dev`.

## Requirements

### Requirement: Repo skeleton and local development environment (no cloud needed)

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-010-repo-skeleton-local-dev]] at brain_commit 58c518d; scope in proposal.md).

#### Scenario: a developer follows the README on a clean machine with Node and a container runtime
- **WHEN** a developer follows the README on a clean machine with Node and a container runtime
- **THEN** the app runs at `http://localhost` with a seeded database in under 10 minutes

#### Scenario: `DEV_LOGIN=1` and `NODE_ENV=development`
- **WHEN** `DEV_LOGIN=1` and `NODE_ENV=development`
- **THEN** a developer can sign in without Google

#### Scenario: the app starts with `NODE_ENV=production` and `DEV_LOGIN` set
- **WHEN** the app starts with `NODE_ENV=production` and `DEV_LOGIN` set
- **THEN** it refuses to start with a clear error

#### Scenario: a file is uploaded locally
- **WHEN** a file is uploaded locally
- **THEN** it lands under `customers/<id>/intake/<document-id>/<filename>` on disk and a `documents` row records path, size, type and SHA-256 (for customer documents on Cloud Storage, superseded by MD5 and CRC32C in [[wi-maaz20x-006-intake-documents]] §8)

#### Scenario: a PR is opened
- **WHEN** a PR is opened
- **THEN** CI runs lint, typecheck, tests and build and blocks the merge on failure

#### Scenario: a static asset is requested
- **WHEN** a static asset is requested
- **THEN** it carries the immutable cache header, and a page with customer data carries `no-store`

#### Scenario: code imports `server/`
- **WHEN** code imports `server/`
- **THEN** it does so through a per-module alias (`~server/db`, `~server/fedramp`, `~server/storage`) and only from loaders, actions, resource routes or `server/index.ts`; ESLint fails otherwise (ADR-0006 rules 2 and 8)

#### Scenario: the app starts
- **WHEN** the app starts
- **THEN** `server/index.ts` is the only entry point (keeps the move to workspaces mechanical, ADR-0006)
