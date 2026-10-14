# Naming rules

| Type | Location | ID pattern |
|---|---|---|
| project README | `projects/<p>/README.md` | `<p>` |
| doc / runbook / onboarding / architecture / diagram | `projects/<p>/docs/` or `docs/` or `shared/` | `<p>-<topic>` (project) · `<topic>` (shared) |
| adr | `projects/<p>/adrs/` or `shared/adrs/` | `adr-<nnnn>-<short>` (global sequence) |
| integration | `shared/integrations/` | `integration-<source>-to-<target>-<topic>` |
| work-item | `projects/<p>/work-items/` | `wi-<p>-<nnn>-<short>` |
| zettel | `projects/<p>/zettels/` | `z-<p>-<topic>` |
| meeting notes / transcripts | `projects/<p>/docs/` | `<p>-meeting-<yyyy-mm-dd>-<who>` |

All lowercase, digits and hyphens only. No dates in IDs except meetings.
