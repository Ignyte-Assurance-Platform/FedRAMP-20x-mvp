---
name: pb-project-directory
description: Regenerates the root README project table, every projects/<p>/HUB.md and ARCHIVE.md from note front-matter. Also the procedure to add a sub-project to the brain. Triggers: "regenerate readme", "refresh hub", "add a project", "project table".
compatibility: Node >= 18. Brain only (from a project repo it runs against the resolved brain path).
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Project Directory

## 1. Regenerate

```bash
node $BRAIN/scripts/generate.mjs --all        # README table + HUB + ARCHIVE
node $BRAIN/scripts/generate.mjs --readme     # only the root table
```

The README table is built from `projects/<p>/README.md` front-matter: `display_name`, `project_status`, `owner`, `repo`. HUB sections: work by stage (brain stages; Linear snapshot added by PB - Delivery Board), recent decisions, integrations, documents, zettels. ARCHIVE lists notes whose status is `deprecated | superseded | retired | archived | done | cancelled`.

## 2. Add a sub-project

1. `mkdir -p projects/<p>/{adrs,architecture,work-items,docs,zettels}`.
2. Create `projects/<p>/README.md` from `shared/templates/doc.md` with `id: <p>`, `project: <p>` and the table fields (`display_name`, `project_status`, `repo`, `linear_team`). Link it from `shared/glossary.md` or another note.
3. Add the project to `pb.config.yaml` (`projects:` and `linear.teams`) and to `distribution.yaml`.
4. Run the linker `--fix` and `generate.mjs --all`.
5. Commit via PB - Logical Commits; PR requires owner/admin (CODEOWNERS).

## 3. Never

- Edit the table, HUB or ARCHIVE by hand.
- Remove a project folder; set `project_status: retired` instead.
