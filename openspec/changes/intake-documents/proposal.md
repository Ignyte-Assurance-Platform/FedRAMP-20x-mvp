# Screen E tab 3 — document upload to the private bucket

> Brain work item: [[wi-maaz20x-006-intake-documents]] · brain_commit af98c57a31cf67d1c4ae3d3af4c1ed0020914e43 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-006-intake-documents.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-mvp-plan-v3-1]] §2.15, §1.7, §3.3: drag-and-drop, PDF/Word/Excel, 100 MB each, list with delete, examples (boundary diagram, policies, previous package, SAR); stored only, no processing; private bucket, one folder per customer.
- [[maaz20x-contract-document-storage]]: layout, signed resumable URLs, metadata.
- [[integration-maaz20x-to-google-cloud-storage-documents]].
- Christina's gate-3 review (2026-10-19, follow-ups 2026-10-20), applied below:
  - Upload list tied to what FedRAMP requires: FRC-CLA-EAM for the existing certification (SOC 2: complete report, bridge or gap letter, verified engagement documentation, expected date of the next report, supplemental compliance evidence; FedRAMP Ready or GovRAMP: Readiness Assessment Report and Security Assessment Plan), with the report's period end date because FRC-CLA-ASF requires the certification to be within the past 12 months. "Previous FedRAMP package" and "SAR" merged into one item, shown only to Rev 5 holders. Policies kept, each with its current version and last-updated date (needed for the policy index). Crypto item renamed "Crypto modules with CMVP certificate numbers". Added: training materials or records (KSI-CED-RAT), change logs or monitoring evidence (KSI-CMT-LMC), third-party and subprocessor list.
  - "Verified audit engagement documentation" means "either an audit engagement letter, a certification from a successful audit, or a bridge letter (meaning they are currently under audit)" (2026-10-20).
  - Size: a standard Rev 5 package is "closer to 150/200MB" → 250 MB per file.
  - Types: add PNG, JPG and SVG, Visio, CSV (scanner exports), JSON and XML (OSCAL); refuse zip files until virus scanning exists.
  - A "What is this?" dropdown per file matching the list, so the consultant sees which items are missing.
  - Let the customer upload more files after "Submit to Ignyte". Jesús's proposal (tabs 1 and 2 lock, tab 3 stays open; later files flagged; removal only by Ignyte after Submit; rename and replace with history) — Christina: "Yes that works", then asked about rename and live update, answered by Jesús on 2026-10-20 (rename the display name; "Replace" keeps the previous version; no in-tool editing).
  - Retention: Christina asked for a written rule and deferred to Max. **Max, 2026-10-20: "remove the retention period for now. We sometimes have to hold records as auditors. Let's keep it until it grows and then we figure out a deletion."**

## What changes

In: certification question with period end date and 12-month warning; upload list that changes with the certification; drag-and-drop upload via signed resumable URL, 250 MB per file, the accepted types in §5; "What is this?" per file; policy version and date; rename; replace with version history; remove until Submit; uploads after Submit flagged for Ignyte; checklist of received/missing items and download on Screen D.
Out: virus scanning (and therefore zip files), duplicate detection, reading or analysing files (no AI), import from Google Drive, editing documents inside the tool, a retention period or automatic deletion (Max, 2026-10-20).

## Out of scope

See "Scope" or "Change" in the brain spec; anything not listed there is out.
