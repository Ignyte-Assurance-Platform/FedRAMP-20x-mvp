---
name: pb-os-flag
description: Detects which workstation and operating system the current session runs on (Windows laptop, WSL, Linux, macOS) and gives the flag that commit subjects and pull-request titles and labels carry so one person's daily changes can be told apart per machine at stand-up (Windows → LP-OS by default). Use it every time you are about to commit, write or reword a commit message, open or retitle a pull request, or list the day's changes for stand-up, even when the user does not mention a flag. Also triggers on "which OS are we on", "what machine is this", "add the OS flag", "LP-OS", "flag my commits", "mark this as laptop work". Called by PB - Logical Commits and PB - Create PR.
compatibility: Node >= 18 and git. Any repo. GitHub CLI (gh) only for the PR label.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - OS Flag

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project) and writes nothing of its own: it only tells other steps which flag to carry.

## 1. Why a flag

The same person commits from more than one machine (today: a Windows laptop and a WSL clone), often on the same work item on the same day. At stand-up the question is "what did I change from where", and a plain `git log` cannot answer it. A short, fixed marker in every commit subject and pull-request title made from a flagged machine answers it with one `git log --grep`. The marker names the workstation, not the person, so it stays true when someone else uses the same laptop.

Default mapping (override in `project.md`, key `flags`):

| Detected OS | Flag |
|---|---|
| windows | `LP-OS` |
| wsl | none |
| linux | none |
| macos | none |

An empty flag means "add nothing". Do not invent a flag for an OS that has none in the table; add it to `project.md` instead so every machine agrees.

## 2. Detect

Run the bundled script from the skill folder (in a project repo it is `.claude/skills/pb-os-flag/`, in the brain `skills/pb-os-flag/`):

```bash
node <skill-folder>/scripts/detect-os.mjs
# → {"os":"windows","host":"DEV-LAPTOP","flag":"LP-OS","marker":"[LP-OS]"}
```

Detection rules, in order: `process.platform` `win32` → `windows`; `darwin` → `macos`; `linux` with "microsoft" in `/proc/version` → `wsl`; else `linux`. The script reads `flags` from the sibling `project.md` when present, so the output already applies the project's mapping. Run it once per session and reuse the result; the machine does not change mid-session. If Node is unavailable, fall back to the same rules by hand (`uname -s`, `$env:OS`, `/proc/version`) and say so.

Do not trust the shell alone: Git Bash on Windows reports `MINGW64_NT` from `uname`, and the assistant's own environment banner may say `win32` while a command runs inside WSL. The script runs where the commands run, which is what matters.

## 3. Apply the flag

**Commit subjects.** Append the marker at the end of the subject, after the summary: `feat(wi-maaz20x-007): add the download route [LP-OS]`. Keep the subject at 72 characters or fewer by shortening the summary, never by dropping or abbreviating the marker. One marker per commit: when amending, rebasing or rewording a commit that already carries it, keep it as is. The marker goes in the subject, not a trailer, so it shows in `git log --oneline`, in GitHub's commit list and in the PR's commit tab without extra flags.

**Pull requests.** Append the same marker to the title (`feat(wi-007): Screen D … [LP-OS]`) and add a label with the bare flag (`LP-OS`). Create the label once per repo if it is missing:

```bash
gh label create LP-OS --color 0E8A16 --description "Changes made from the Windows laptop (PB - OS Flag)" 2>/dev/null || true
gh pr create … --title "<type(scope): summary> [LP-OS]" --label LP-OS
gh pr edit <n> --add-label LP-OS            # when the PR already exists
```

When `gh` is not available, keep the title marker and tell the user the label is still to be added.

**Where the flag never goes.** Brain notes, front-matter, `tasks.md`, OpenSpec artifacts, code comments or file names. It marks a change event, not content.

**When the flag is empty.** Add nothing and do not mention it; an unflagged commit simply means "made from a machine without a flag".

## 4. Stand-up list

To list the day's flagged changes by the current git identity, run from any repo (add other repo paths to cover them all):

```bash
node <skill-folder>/scripts/standup.mjs [--since "yesterday"] [<repo-path> ...]
```

It prints, per repo, the commits whose subject carries the marker, newest first, with date and branch, and the unflagged ones by the same author in a second list so nothing made from another machine is missed. Use it when the user asks what they did today or yesterday, or for stand-up notes.

## 5. Never

- Rewrite or reflag commits that are already pushed, or anyone else's commits.
- Add the marker to a subject that already carries one, or two different markers to one commit.
- Decide the flag from the environment banner alone when a script can run.
