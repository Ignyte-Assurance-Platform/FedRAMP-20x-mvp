---
name: pb-zettel-linker
description: Validates and repairs the knowledge graph of the project brain — stable IDs, front-matter, TOC, [[links]], zero orphans, backlinks, ARCHIVE regeneration. Run before ANY note write in the brain, including writes started from a project repo. Triggers: "link check", "orphans", "backlinks", "validate notes", "before writing a note".
compatibility: Node >= 18, no dependencies. Works from the brain or from any sibling project repo.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Zettel Linker

The gatekeeper of the knowledge graph. Nothing is written to the brain without passing through it.

## 0. Context detection (mandatory)

1. Read `pb.config.yaml` in the current repo root.
   - If it has `brain.marker: true` → you are **in the brain**. `BRAIN=.`.
   - Otherwise it is a pointer file with `brain_path` → `BRAIN=<brain_path>`.
   - If there is no `pb.config.yaml`, or `BRAIN` does not exist: stop and tell the user to clone the brain next to this repo (`git clone <brain repo> ../ignyte-project-brain`). Never improvise a local copy.
2. Load `project.md` from this skill folder if present; its keys override defaults (e.g. `brain_path`).

## 1. What it enforces

| Rule | Check |
|---|---|
| Stable IDs | `id` == filename (kebab-case). Exception: `projects/<p>/README.md` has `id: <p>`. |
| Front-matter | `id, title, type, status, project` present. |
| TOC | `## Table of Contents` heading present. |
| Links | every `[[id]]` resolves; every note has ≥ 1 outgoing link (zero orphans). |
| Backlinks | `backlinks:` array mirrors incoming links (written by `--fix`). |
| Handoff integrity | a `work-item` in `stage: handed-off` has an approved `spec` gate and a `handoff.brain_commit`. |
| Generated files | `HUB.md`, `ARCHIVE.md`, anything with `generated: true` is skipped. |

## 2. Commands

```bash
node $BRAIN/scripts/linker.mjs            # report only, exit 1 on errors
node $BRAIN/scripts/linker.mjs --fix      # also write backlinks + regenerate ARCHIVE.md
node $BRAIN/scripts/linker.mjs --json     # machine-readable
```

## 3. Procedure before a note write

1. Run the linker (report). If it fails on notes you did not touch, report that first; do not hide it.
2. Choose the new note's `id` (see naming in `references/naming.md`). Confirm it does not exist (`ls`), because files never move or get renamed.
3. Write the note from `shared/templates/<type>.md` with at least one `[[link]]` to an existing note.
4. Run `--fix` so backlinks and ARCHIVE are updated. Commit the note and the touched backlink lines together.

## 4. Never

- Rename or move a note to "fix" an ID. Change `status` instead and create a new note if needed.
- Edit `backlinks:` by hand.
- Skip the linker because "it is a small change".
