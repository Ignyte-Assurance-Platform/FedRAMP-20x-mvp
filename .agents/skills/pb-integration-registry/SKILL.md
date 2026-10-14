---
name: pb-integration-registry
description: Creates and maintains integration notes (one per contract between two systems) in shared/integrations/, regenerates the integration map and the HUB integration tables. Any contract change goes through an integration-change work item. Triggers: "integration", "API contract", "we connect to", "webhook", "data contract", "integration map", "who consumes".
compatibility: Node >= 18. Works from the brain or from a project repo (writes into the brain on a branch).
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Integration Registry

Integrations are first-class citizens: one note each, both endpoints link it, the map is generated from front-matter.

## 0. Context detection (mandatory)

Same as PB - Zettel Linker §0. Integration notes are brain-owned.

## 1. Front-matter contract

```yaml
type: integration
source: <project-or-system>         # the side that owns/initiates
target: <project-or-system>
direction: push | pull | bidirectional
protocol: rest | graphql | event | file | sdk | other
auth: <mechanism, no secrets>
data_contract: "[[note-id]]" | null  # schema / payload note
owner: <handle>
status: planned | in-design | in-progress | live | retired
sla: <text or null>
```

`source`/`target` use the project folder name when the endpoint is a sub-project (so its HUB picks it up) or a stable external name otherwise (`fedramp-schemas-github`, `google-cloud-storage`).

## 2. Procedure

1. Linker report. ID: `integration-<source>-to-<target>-<topic>`.
2. Copy `shared/templates/integration.md`. Fill Purpose, Contract (endpoints, payloads, versioning), Failure modes (retries, idempotency, timeouts), Consumers.
3. Link it from both endpoints' notes (project README or architecture note). Work items that touch it list it under `integrations:`.
4. `node $BRAIN/scripts/linker.mjs --fix` then `node $BRAIN/scripts/generate.mjs --map --hub`.
5. Commit via PB - Logical Commits. `shared/integrations/` requires owner/admin review.

## 3. Changing a contract

A contract change is never edited silently: create an `integration-change` work item (PB - Requirements Intake) linked to the integration note; gate 3 needs **both** owners. Only after approval update the integration note and bump its contract version in the Contract section.

## 4. Never

- Draw the map by hand ([[integration-map]] is generated).
- Put credentials in `auth`.
- Use a different name for the same external system in two notes.
