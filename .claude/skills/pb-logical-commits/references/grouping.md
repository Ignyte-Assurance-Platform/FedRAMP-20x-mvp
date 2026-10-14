# Grouping heuristics

| Signal | Group |
|---|---|
| New files under a feature folder + their tests | one `feat` |
| Changed behaviour + its test | one `fix`/`feat` |
| Renames/moves with no behaviour change | `refactor` |
| README, docs, notes, ADRs | `docs` |
| Generated tables, HUB/ARCHIVE, lockfiles, backlinks | `chore(generated)` — always separate |
| Skill changes under `skills/` | `feat(skills)`/`fix(skills)` + must be followed by sync-skills |
| CI, tooling, scripts | `build`/`ci`/`chore(scripts)` |

If one file holds two logical changes, commit it with the dominant one and say so in the body; do not split hunks unless the user asks.
