---
name: pb-spec-handoff
description: Freezes an approved work item (stage 3 passed) — verifies the approved spec gate, records handoff.brain_commit, creates or updates the Linear issue via PB - Project Tickets, sets stage handed-off and prints the next step for the project repo. Triggers: "hand off", "handoff", "freeze the spec", "send to the project repo".
compatibility: Node >= 18 and git. Brain-owned; may commit directly to main under the Handoff Metadata Exception.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Spec Handoff

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root. `brain.marker: true` → you are in the brain (`BRAIN=.`). Otherwise it is a pointer with `brain_path` → `BRAIN=<brain_path>`. No file or no such path → explain how to clone the brain next to this repo and **stop**; never improvise a local copy. Then load `project.md` from this skill folder if present (overrides).

Brain-owned artifacts (work items, ADRs, integrations, knowledge notes) are always written under `$BRAIN`. From a project repo: branch in the brain (`<type>/<wi-id>-<short>`), write, open a PR unless the user is `people.owner`/`people.admin`. Run `node $BRAIN/scripts/linker.mjs` first (PB - Zettel Linker).

## 1. Preconditions (the script enforces them)

- `stage: validation`, an `approvals` entry with `gate: spec`, `decision: approved`.
- The approved spec is **committed** with no pending changes to the file. `brain_commit` is the last commit touching the spec.

## 2. Procedure

```bash
node $BRAIN/scripts/spec-handoff.mjs <wi-id> --check                       # verify only
node $BRAIN/scripts/spec-handoff.mjs <wi-id> --linear <TEAM-123> --repo <project-repo>
node $BRAIN/scripts/linker.mjs --fix && node $BRAIN/scripts/generate.mjs --hub
```

1. Create or update the Linear issue first with PB - Project Tickets (title = spec title, description links the brain spec and the commit). Until Linear exists use the placeholder `<TEAM_KEY-NNN>` and say so.
2. Run the script: it sets `stage: handed-off`, fills `handoff.{date, brain_commit, repo, linear}` and appends History.
3. Commit with the fixed message `chore(handoff): link <wi-id> artifacts`. This commit may go straight to `main` **only if** the diff is limited to the handoff block and the History line (Handoff Metadata Exception, `docs/governance/branch-protection.md` §3). Check the diff before pushing; abort otherwise.
4. Print the next step: in the target repo, run PB - Spec Compile with `<wi-id>@<brain_commit>`.

## 3. After handoff

The brain stops tracking stages 4–8 by hand. Status comes from Linear via PB - Delivery Board. An intent change reopens the item (`stage: draft`), needs a new gate-3 approval and produces a new `brain_commit`; the project re-compiles.

## 4. Never

- Hand off without a committed approved version.
- Touch the spec body, approvals, stage history or anything outside the handoff block in the handoff commit.
- Create the work item in the project repo.
