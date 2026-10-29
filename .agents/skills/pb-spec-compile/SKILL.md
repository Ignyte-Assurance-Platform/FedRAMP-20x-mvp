---
name: pb-spec-compile
description: Stage 4, run INSIDE the target project repo — reads the frozen brain spec (pinned to handoff.brain_commit) and compiles it into an OpenSpec change (proposal, design, specs, tasks) that references the brain work item; writes handoff.spec_artifacts back into the brain. Refuses to run unless the work item is handed-off with an approved spec gate. Triggers: "compile the spec", "openspec change from the brain", "start implementation of wi-…".
compatibility: Node >= 18 and git; OpenSpec CLI optional (npm i -g @fission-ai/openspec@latest, Node 20.19+). Project repo only.
version: 1.1.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Spec Compile

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root. `brain.marker: true` → you are in the brain (`BRAIN=.`). Otherwise it is a pointer with `brain_path` → `BRAIN=<brain_path>`. No file or no such path → explain how to clone the brain next to this repo and **stop**; never improvise a local copy. Then load `project.md` from this skill folder if present (overrides).

Brain-owned artifacts (work items, ADRs, integrations, knowledge notes) are always written under `$BRAIN`. From a project repo: branch in the brain (`<type>/<wi-id>-<short>`), write, open a PR unless the user is `people.owner`/`people.admin`. Run `node $BRAIN/scripts/linker.mjs` first (PB - Zettel Linker).

This skill is the one exception to "brain-owned writes happen in the brain": its **output** (compiled artifacts) belongs to the project repo; its **back-link** goes to the brain under the Handoff Metadata Exception.

## 1. Preconditions

- Running from the project repo named in `handoff.repo` (not the brain).
- Work item is `stage: handed-off`, has an approved `spec` gate and `handoff.brain_commit`.
- The compiler reads the spec **at that commit** (`git show <commit>:<path>`), never the working tree.
- Neither tree is on its default branch (the script refuses otherwise): the project repo on a branch, and the brain that receives the back-link on a branch too. Usual layout: one folder with a worktree of each, `<folder>/<project-repo>` and `<folder>/<brain>`, so the project's `brain_path` (`../<brain>`) points at the brain worktree. Otherwise pass `--brain <brain worktree>`, or `--no-backlink` to print the back-link and apply it by hand.

## 2. Procedure

```bash
node $BRAIN/scripts/spec-compile.mjs <wi-id> --dry-run        # show what would be written
node $BRAIN/scripts/spec-compile.mjs <wi-id>                  # write openspec/changes/<name>/… here
node $BRAIN/scripts/spec-compile.mjs <wi-id> --brain <dir>    # back-link into that brain worktree
node $BRAIN/scripts/spec-compile.mjs <wi-id> --no-backlink    # print the back-link instead of writing it
```

Output (OpenSpec adapter, structure verified against the OpenSpec README on 2026-10-14; `openspec validate --strict` clean on CLI 1.14.2 on 2026-10-16):

```
openspec/changes/<name>/
├── proposal.md          why + what changes, with the brain reference header
├── design.md            behavior, data, validation, permissions, flows, integrations, NFRs
├── specs/<capability>/spec.md   "## ADDED Requirements" / "### Requirement:" / "#### Scenario:" from WHEN/THEN criteria
└── tasks.md             checklist; last items are automated review + human triage
```

**Changes to existing capabilities.** The compiler only writes `## ADDED Requirements` for the item's own capability. When the item changes behavior already in `openspec/specs/<capability>/` (the script lists the capabilities that come from work items this one links to), write that delta by hand in `openspec/changes/<name>/specs/<capability>/spec.md`: REMOVED + ADDED of the requirement, because under `--strict` a MODIFIED block must keep every current scenario. Then re-run the compiler: generated files come out the same, `handoff.spec_artifacts` picks up every file in the change folder, and the History gets a new line only if `spec_artifacts` changed (a re-run with the same files adds none, on any day).

Then: verify the brain diff touches only `handoff.spec_artifacts` + a History line and commit it in the brain with `chore(handoff): link <wi-id> artifacts`. If OpenSpec CLI is installed, run `openspec validate <name> --strict` in the project repo (optional; must be clean).

## 3. Adapter boundary

Everything after `renderOpenSpec()` in `scripts/spec-compile.mjs` is the OpenSpec adapter. To target another tool, implement a function with the same signature (frozen front-matter + sections → `{path: content}`) and select it with `spec_tool` in `project.md`.

## 4. Never

- Compile from the working tree or from a copy of the spec in the project repo.
- Edit `proposal.md`/`design.md` to change intent; escalate to the brain instead.
- Run when the gate check fails "just to get started".
