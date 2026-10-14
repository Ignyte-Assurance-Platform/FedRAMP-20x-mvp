---
name: pb-documentation
description: Writes or updates any knowledge note in the project brain (doc, runbook, onboarding, zettel, architecture, diagram) with front-matter, TOC and links, then refreshes HUB and README. Triggers: "write a note", "document this", "add a doc", "capture this meeting", "update the hub".
compatibility: Node >= 18. Works from the brain or from a project repo (writes into the brain).
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Documentation

## 0. Context detection (mandatory)

Same as PB - Zettel Linker §0. Brain-owned notes are **always** written under `$BRAIN`. From a project repo: create a branch in the brain (`docs/<wi-or-topic>`), write there, and open a PR unless the user is `people.owner` or `people.admin` in `pb.config.yaml`.

## 1. Procedure

1. **Linker first.** Run `node $BRAIN/scripts/linker.mjs`.
2. **Pick type and ID** (`references/naming.md` of the linker). Copy `shared/templates/<type>.md`.
3. **Front-matter.** Fill every field. `project` is the folder name or `shared`. `links` must contain at least one existing `[[id]]`. Leave `backlinks: []` to the linker.
4. **Body.** Keep the TOC in sync with `##` headings (numbered, GitHub-style anchors). Diagrams as Mermaid. No AI-vendor names in user-facing content.
5. **Ingested sources.** When loading an external document verbatim (brief, transcript, plan), keep its content intact, add `tags: [source]`, a `source:` field with provenance (origin path/URL, author, date), and a `## Related` section with links. Superseded versions get `status: deprecated` and `superseded_by: "[[id]]"`.
6. **Refresh.** `node $BRAIN/scripts/linker.mjs --fix` then `node $BRAIN/scripts/generate.mjs --all` (HUB, ARCHIVE, README table).
7. Hand over to PB - Logical Commits.

## 2. Never

- Hand-edit anything between `<!-- PB:*:START -->` / `END` markers or any file with `generated: true`.
- Create a note without a TOC or without a link.
- Write brain-owned notes inside a project repo.
