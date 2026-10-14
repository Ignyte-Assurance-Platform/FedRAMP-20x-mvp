---
name: pb-requirements-intake
description: Stages 1–2 of the delivery process in the brain — Harvest every source of intent, then Draft a work-item spec from the kind template (epic, feature, bug, poc, spike, chore, tech-debt, integration-change). Triggers: "new feature", "write the spec", "harvest", "create a work item", "spec this", "promote this poc", "escalate intent change".
compatibility: Node >= 18. Works from the brain or from a project repo (writes into the brain).
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Requirements Intake

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root. `brain.marker: true` → you are in the brain (`BRAIN=.`). Otherwise it is a pointer with `brain_path` → `BRAIN=<brain_path>`. No file or no such path → explain how to clone the brain next to this repo and **stop**; never improvise a local copy. Then load `project.md` from this skill folder if present (overrides).

Brain-owned artifacts (work items, ADRs, integrations, knowledge notes) are always written under `$BRAIN`. From a project repo: branch in the brain (`<type>/<wi-id>-<short>`), write, open a PR unless the user is `people.owner`/`people.admin`. Run `node $BRAIN/scripts/linker.mjs` first (PB - Zettel Linker).

## 1. Stage 1 — Harvest

Gather **every** source of intent before writing a line of spec:
- existing code/systems, schemas, API contracts (link the integration note or contract note);
- cloud docs (Cloud Sync ingest notes), meeting transcripts, plans;
- Linear issues, ADRs, integration notes, previous work items.

Write them as the `## 1. Harvest` section: one bullet per source with a `[[link]]` or URL and a one-line summary of what it contributes. Also list them in front-matter `sources:`. Note contradictions explicitly (e.g. "plan says six KSIs; playbook has seven").

## 2. Stage 2 — Draft

1. Pick the kind (`shared/delivery/README.md` §4). ID: `wi-<project>-<nnn>-<short>`, next number across the project's `work-items/`.
2. Copy `shared/delivery/templates/<kind>.md`. Fill every section; "none" is an answer, blank is not.
3. **Acceptance criteria as WHEN/THEN bullets**, one per line (`- WHEN … THEN …`). PB - Spec Compile turns each into a scenario.
4. Link: parent epic, integrations touched (`integrations:`), ADRs (`adrs:`; create one via PB - Architecture if the item changes architecture), contract notes.
5. Set `stage: draft`, `status: open`, `target_repo`. Append a `## History` line.
6. `linker --fix`, `generate --hub`, commit via PB - Logical Commits, PR.

Promotion: a `poc`/`spike` becomes a new `feature` note with `promoted_from`; never change `kind` in place. Intent change from implementation (Escalation Rule): set the existing item back to `stage: draft`, record why in History, re-run gate 3.

## 3. Hand to gate 3

When the draft is complete, set `stage: validation` and ask the humans named in `shared/delivery/gates.md` §3 to review. **Do not record an approval yourself** — that is PB - Spec Gate, driven by a human decision.

## 4. Never

- Draft without a Harvest section.
- Write the work item inside a project repo.
- Approve, or set `stage: handed-off`.
