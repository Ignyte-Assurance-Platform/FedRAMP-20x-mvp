# OpenSpec

How approved work arrives in this repo. The rules come from the project brain (`AGENTS.md`, Handoff Rule); this page only explains the folder.

## Flow

1. A work item is written and approved in the brain (gate 3: a subject-matter expert plus an engineer of this repo).
2. `PB - Spec Handoff` freezes it at a brain commit (`handoff.brain_commit`).
3. Here, `PB - Spec Compile` reads the spec **at that commit** and writes `openspec/changes/<name>/`:

   ```text
   openspec/changes/<name>/
   ├── proposal.md                  why and what changes, with the brain reference header
   ├── design.md                    behaviour, data, validation, permissions, flows, integrations, NFRs
   ├── specs/<capability>/spec.md   requirements and scenarios from the WHEN / THEN criteria
   └── tasks.md                     checklist; ends with automated review and human triage
   ```

   ```bash
   node ../ignyte-project-brain/scripts/spec-compile.mjs <wi-id> --dry-run
   node ../ignyte-project-brain/scripts/spec-compile.mjs <wi-id>
   openspec validate <name> --strict
   ```

4. Implement on a branch, ticking `tasks.md`. `openspec archive <name>` when merged moves it to `changes/archive/` and updates `specs/`.

## Rules

- Never create a change by hand (`/opsx:propose`) or keep an editable copy of a spec here. If the spec is wrong, fix it in the brain and recompile.
- `proposal.md` and `design.md` are read-only here; only `tasks.md` progress changes.
- `config.yaml` carries the project context OpenSpec shows to AI tools.

## Setup

OpenSpec CLI 1.14.2 or later (Node 20.19+): `npm i -g @fission-ai/openspec@latest`. Compiled changes must pass `openspec validate <name> --strict`. Initialised with `openspec init --tools none`, so it adds no slash commands or instruction files; `AGENTS.md` and `CLAUDE.md` stay managed by the brain.

## Status

No compiled changes yet: no work item has passed gate 3 (see the brain note `maaz20x-gate3-review-2026-10-15`).
