---
name: pb-update-base-files
description: After meaningful changes, detects which base files (README, AGENTS/CLAUDE, CHANGELOG, onboarding, architecture overview, generated tables) need refreshing by diffing recent commits against the project's base-files list; proposes edits and applies them after confirmation. Calls generators for generated sections. Triggers: "update the docs", "refresh base files", "is the README stale", before PB - Create PR on structural changes.
compatibility: git. Any repo.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Update Base Files

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project); it never writes brain-owned artifacts into a project repo.

## 1. Detect

1. Range: `git diff --name-only <base>...HEAD` (default base `main`), or the last N commits.
2. Match changed paths against `triggers`; collect the areas touched (setup, structure, public API, skills, env vars, process).
3. For each file in `base_files`, decide **stale / fine / n.a.** with a one-line reason (e.g. "new env var in .env.example not in README setup").
4. In the brain also check generated sections: run `node scripts/generate.mjs --all` and `node scripts/linker.mjs`; if they change files, those are stale by definition.

## 2. Propose and apply

- Show a table: file · status · proposed change. Wait for confirmation.
- Apply hand-written edits with minimal diffs. Never hand-edit between `PB:*` markers or files with `generated: true`; call the generator.
- Managed sections of `AGENTS.md`/`CLAUDE.md` in project repos (`<!-- PB:MANAGED:START -->`) belong to sync-skills: do not edit; re-run the sync.
- CHANGELOG: add an Unreleased entry per conventional-commit type.

## 3. Never

- Rewrite a base file wholesale.
- Touch generated or managed sections by hand.
- Apply without confirmation.
