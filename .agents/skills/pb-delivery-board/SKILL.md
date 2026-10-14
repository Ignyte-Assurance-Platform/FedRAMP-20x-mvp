---
name: pb-delivery-board
description: Regenerates the "work by stage" board in every projects/<p>/HUB.md by merging brain stages (1–3, from work-item front-matter) with Linear states (4–8, from a fetched snapshot) using shared/delivery/linear-state-mapping.yaml. Read-only towards Linear. Triggers: "delivery board", "where is wi-…", "refresh the hub board", "status of handed-off work".
compatibility: Node >= 18. Linear API key via LINEAR_API_KEY (see .env.example); works without it using the mocked snapshot, clearly labeled.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Delivery Board

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root. `brain.marker: true` → you are in the brain (`BRAIN=.`). Otherwise it is a pointer with `brain_path` → `BRAIN=<brain_path>`. No file or no such path → explain how to clone the brain next to this repo and **stop**; never improvise a local copy. Then load `project.md` from this skill folder if present (overrides).

Brain-owned artifacts (work items, ADRs, integrations, knowledge notes) are always written under `$BRAIN`. From a project repo: branch in the brain (`<type>/<wi-id>-<short>`), write, open a PR unless the user is `people.owner`/`people.admin`. Run `node $BRAIN/scripts/linker.mjs` first (PB - Zettel Linker).

## 1. Fetch the snapshot (read-only)

With `LINEAR_API_KEY` set, query the team's issues whose description or label references a brain work item (`wi-<project>-…`) and write `.pb-cache/linear-snapshot.json` in the brain (git-ignored) with the shape of `shared/delivery/linear-snapshot.example.json`: `fetched_at`, `issues[] {id, title, state, work_item, updated_at, url}`. Use PB - Project Tickets' query recipe; never mutate anything in Linear here.

Without a key: say so and use the example snapshot; the board prints **MOCKED** in its footer.

## 2. Regenerate

```bash
node $BRAIN/scripts/generate.mjs --hub
```

The board rows are: 1 Harvest · 2 Draft · 3 Validation (brain), then one row per Linear-mapped stage for handed-off items (4 Compile … 8 Shipped), and "Handed off — no Linear state" for items the snapshot does not know. Footer shows the fetch time. Runs on demand and **before any HUB refresh**.

## 3. Mirrored statuses

When Linear reports `Done`/`Canceled`, the board shows it; mirroring `status: done|cancelled` into the work item front-matter is a small direct commit allowed under the Handoff Metadata Exception only if it changes nothing else — otherwise open a PR.

## 4. Never

- Edit the board by hand or create/transition Linear issues from this skill.
- Guess a stage for an item missing from the snapshot.
