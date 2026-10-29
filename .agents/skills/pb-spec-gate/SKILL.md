---
name: pb-spec-gate
description: Stage 3 of the delivery process — prepares the gate-3 checklist for a work item and records the HUMAN decision (approved/rejected) in the work item's approvals. It never approves on its own. Triggers: "gate 3", "approve the spec", "record approval", "reject the spec", "ready for validation".
compatibility: Node >= 18. Brain-owned; works from a project repo via the brain path.
version: 1.1.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Spec Gate

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root. `brain.marker: true` → you are in the brain (`BRAIN=.`). Otherwise it is a pointer with `brain_path` → `BRAIN=<brain_path>`. No file or no such path → explain how to clone the brain next to this repo and **stop**; never improvise a local copy. Then load `project.md` from this skill folder if present (overrides).

Brain-owned artifacts (work items, ADRs, integrations, knowledge notes) are always written under `$BRAIN`. From a project repo: branch in the brain (`<type>/<wi-id>-<short>`), write, open a PR unless the user is `people.owner`/`people.admin`. Run `node $BRAIN/scripts/linker.mjs` first (PB - Zettel Linker).

## 1. Prepare the gate

1. The item must be in `stage: validation`. If not, send it back to PB - Requirements Intake.
2. Build the checklist for its kind from `shared/delivery/gates.md` §1, pointing at the evidence in the spec for each line. Flag gaps. Check the cross-item lines yourself (search the brain for items that name what this one moves or delegates) and list each hit as a gap until it is fixed.
3. Name the required signers (gates.md §3); `integration-change` needs both integration owners.
4. Present checklist + gaps to the humans. Then **wait**.

## 2. Record the decision (human input required)

Only after a named human states the decision (in chat, PR review, or a cloud-doc comment ingested with provenance), append to `approvals:`:

```yaml
approvals:
  - gate: spec
    by: <name/role>        # the human, never an agent
    date: YYYY-MM-DD
    decision: approved | rejected
    notes: <short>
```

- **approved** → `status: approved`, History line, commit the spec (this commit becomes `brain_commit`), then hand to PB - Spec Handoff.
- **rejected** → `stage: draft`, `status: open`, History line with the reasons; back to PB - Requirements Intake.

Simulated approvals are allowed **only** in clearly labeled examples: `by: "SIMULATED — example walkthrough"`.

## 3. Never

- Record an approval nobody gave, or infer one from silence.
- Edit the spec body while recording a decision (that is rework, stage 2).
- Skip to handed-off.
