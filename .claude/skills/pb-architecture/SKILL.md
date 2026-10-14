---
name: pb-architecture
description: Writes ADRs, architecture views (C4-style, Mermaid) and diagram notes in the project brain. It is the landing point of the Escalation Rule — any architecture change discovered during implementation becomes an ADR here. Triggers: "ADR", "architecture decision", "we decided", "C4", "system context", "escalate architecture change", "supersede ADR".
compatibility: Node >= 18. Works from the brain or from a project repo (writes into the brain on a branch).
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Architecture

## 0. Context detection (mandatory)

Same as PB - Zettel Linker §0. ADRs, views and diagrams are brain-owned: always written under `$BRAIN`, on a branch, via PR unless the user is owner/admin. From a project repo, never create them locally.

## 1. When to use

| Situation | Output |
|---|---|
| A decision with lasting consequences (stack, hosting, tenancy, auth, data model, boundaries) | ADR |
| An implementation discovers that a decision must change (Escalation Rule) | New ADR that `supersedes` the old one; old one gets `status: superseded`, `superseded_by` |
| Someone needs to understand how a system fits together | `architecture` note with a C4 view (context / container / component) |
| A single diagram worth keeping (sequence, flow, ER) | `diagram` note |
| A work item changes architecture | It MUST link an ADR in its `adrs:` list; create one if missing |

## 2. ADR procedure

1. Linker report. Next ID = `adr-<nnnn>-<short>` with the next number across **all** ADR folders (`projects/*/adrs`, `shared/adrs`). Cross-project ADRs go to `shared/adrs/`.
2. Copy `shared/templates/adr.md`. `status: proposed` until a human accepts it; an agent never sets `accepted` on its own, except when recording a decision the humans already made and named (say so in Context with date and who).
3. Fill Context, Decision, Consequences, Alternatives. Link the work item / integration / architecture note that motivated it.
4. Link the ADR from the relevant `architecture` note's Decisions section and from the project README if it is foundational.
5. `linker --fix`, `generate --all`, commit via PB - Logical Commits.

## 3. Views and diagrams

- Diagrams as code: Mermaid (`C4Context`, `C4Container`, `flowchart`, `sequenceDiagram`, `erDiagram`). No images.
- One view per note; `view:` in front-matter (`context | container | component`).
- Integrations between systems are NOT drawn by hand: link [[integration-map]] (generated) and the integration notes.

## 4. Never

- Change an accepted ADR's Decision in place. Supersede it.
- Record a decision nobody made. Mark proposals as `proposed`.
- Draw integration edges by hand in a view when an integration note should exist.
