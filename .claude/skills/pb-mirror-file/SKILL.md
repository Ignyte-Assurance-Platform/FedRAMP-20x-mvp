---
name: pb-mirror-file
description: Publishes ONE file to ONE cloud destination (e.g. "upload docs/x.md as Word to <url>") — converts with pandoc (Mermaid rendered to images), calls the provider adapter, updates the note's sync front-matter and the sync registry. Asks before overwriting a remote file. Conversion is real; upload is a stub until a provider is chosen. Triggers: "mirror", "publish to Drive/SharePoint", "upload as Word", "share this note with non-technical readers".
compatibility: Node >= 18, pandoc, optional Mermaid CLI (mmdc). Brain notes only (writes sync metadata into the brain).
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Mirror File

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project); it never writes brain-owned artifacts into a project repo.

## 1. Procedure

```bash
node $BRAIN/scripts/mirror-file.mjs <note-path> --to <destination> [--provider gdrive|sharepoint|onedrive] [--format docx|pdf|md] [--dry-run]
```

1. The script checks pandoc (and mmdc if `mermaid_render`), refuses on secrets-looking content, converts `.md → <format>` into `.pb-cache/mirror/`.
2. If the note's `sync` block already names this destination with a `last_remote_revision`, the script **asks for confirmation** before overwriting (prints the remote ref and last sync).
3. Calls the provider adapter (`scripts/sync/adapters/<provider>.mjs`, Phase 8). Today every adapter is a **stub** that logs the call and returns a fake revision prefixed `stub-`; no network, no credentials.
4. Updates the note's `sync` entry (`provider, remote_ref, format, direction: publish, source_of_truth: repo, last_synced, last_remote_revision`) and regenerates `shared/sync/SYNC-REGISTRY.md`.
5. Commit via PB - Logical Commits (`docs(sync): mirror <id> to <provider>`).

## 2. Rules

- Repo is the source of truth for `publish`; the mirror is read-only for readers. Comments made on the mirror come back through Cloud Sync ingest (Phase 8 design), never by editing the mirror.
- One file, one destination per run. Bulk publishing is PB - Cloud Sync.

## 3. Never

- Overwrite a remote file without confirmation.
- Pick a real provider or add credentials (open decision, `cloud.provider: none`).
