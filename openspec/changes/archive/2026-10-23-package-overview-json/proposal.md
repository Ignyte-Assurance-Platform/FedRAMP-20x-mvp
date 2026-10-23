# Screen D — generate, validate and download the Package Overview JSON

> Brain work item: [[wi-maaz20x-007-package-overview-json]] · brain_commit 7b3564b46297fb485fbe79b8c5e83e1b82263acf · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-mvp-plan-v3-1]] §2.8–2.11, §3.6: read-only answers, Generate JSON, validate against the FedRAMP schema with `ajv`, errors or green check, download; Christina's converter as mapping reference.
- [[maaz20x-contract-package-overview-json]] §4–5: golden example, format checks on.
- [[maaz20x-cr26-work-package-findings]] §3: seven fault cases + blank rejection as regression tests.
- Ignyte fills `assessor` here (plan §2.13).
- **Gate-3 review by Christina, 2026-10-19** ([[maaz20x-brief-007-fedramp-file]], `07_fedramp-package-overview-file__REVIEW_Christina.docx`, 14 comments, "OK with my changes"):
  - Points 1, 6, 9 and question 3 (Ignyte types the assessor details; the customer never sees those boxes): Keep.
  - Point 3 and question 1: "Version 0.2.0 replaced 0.1.6 on 16 October 2026 … Don't hard-code any version. Read the version from FedRAMP's schema file at the moment the file is generated." Re-pin already done on 2026-10-20 ([[maaz20x-chat-2026-10-20-christina-app-changes]]).
  - Point 4: "Generate the error messages from the schema itself instead of writing them by hand. Also add the checks the schema cannot do: the logo link actually loads as an image, the website is live, and the next report date is in the future."
  - Point 5 and question 4: "Allow a draft download with 'DRAFT' in the file name, so we can show customers what is missing. Only a passing file gets the normal name."
  - Point 8: "Record both the schema version and the FedRAMP rules version used."
  - Point 2: the schema only checks that the assessor ID is six digits, so a person confirms the assessor is real. Since 0.1.5 the schema has an optional `advisors` list: "Ignyte is the advisor, so add a box for Ignyte's own entry."
  - Point 7: "Are we going to host it or just keep it as input/evidence? If we host it CDS-CSO-PUB requires the logo link to be public." Answer: hosted and public (Max, 2026-10-15; [[maaz20x-contract-document-storage]], the only public-read object).
  - Question 2: keep the schema check and add the checks above; once the customer publishes the file, FRC-CSO-JSN asks for CORS that lets other sites read it and the headers `Content-Type: application/json` and `X-Content-Type-Options: nosniff`, to go on the customer's publishing checklist.
- **Engineer decisions, Jesús, 2026-10-21** (on the review above):
  - D1 version: read from the vendored schema at generation time; never hard-coded, never fetched live. Customers whose last file used an older vendored version are flagged to regenerate. Detecting a new FedRAMP release is [[wi-maaz20x-012-fedramp-rules-sync]]; until it ships, Christina's Apps Script watcher alerts and the vendored schema is bumped by PR.
  - D2 extra checks: logo covered by the upload checks of [[wi-maaz20x-004-intake-company-service]]; next report date in the future is a blocking check in this item; "website is live" goes to [[wi-maaz20x-014-website-live-check]] (server-side requests to customer-typed URLs need SSRF protection) and is a manual check until then.
  - D3 error messages: built from the schema's own `title` and `description` of the field plus a plain sentence per rule type; never hand-written per field.
  - D4 advisors: a box on Screen D prefilled with "Ignyte", editable; empty means no `advisors` array.
- **Engineer review, Jesús, 2026-10-21** (four blockers resolved, decisions E1–E4):
  - E1 `advisors` has two sources: the customer's repeating Advisors section on tab 1 ([[wi-maaz20x-004-intake-company-service]]) and Ignyte's box here. The JSON carries the customer's list plus Ignyte's entry, added only if no advisor with the same name (case-insensitive) is already there.
  - E2 question name in errors: the form label when the form definition has one, else the schema `title` (all 37 Package Overview properties have one in v0.2.0), else the field path. Keeps this item independent of [[wi-maaz20x-011-form-engine]].
  - E3 golden example: compared by deep equality (key order ignored) against a fixture whose logo URL and advisor are fixed, not byte-for-byte against the converter's example.
  - E4 fault cases: each of Christina's seven faults is assigned to the layer that catches it (table in §9); three are prevented by the form (wi-004), not reported here.
- **Jesús's replies to Christina in review copy 07 (2026-10-20, final copy received 2026-10-21; 26 comments)** extend the approved spec. Reopened after handoff and applied with decisions F-a…F-f (Jesús, 2026-10-21); Christina has not answered the replies yet ([[maaz20x-gate3-review-2026-10-15]]):
  - F-a draft file name `<acronym>-package-overview-DRAFT.json`; buttons "Download" (valid) and "Download draft" (not valid); a file that fails any check, FedRAMP's or ours, is a draft.
  - F-b checkbox "Assessor Confirmed on FedRAMP Marketplace" next to the assessor boxes, showing who checked it and when; while an assessor name is entered and the box is not checked, the file stays a draft.
  - F-c the phone fault stays `555-0199` (Jesús's reply proposed `202-555-019`; both fail the pattern). Tell Christina.
  - F-d each generated file shows, next to it on Screen D, the schema version, the rules version and the date and time it was created.
  - F-e a "Publishing checklist" on Screen D next to a passing file, in FedRAMP's words (FRC-CSO-JSN): public web address, `Content-Type: application/json`, `X-Content-Type-Options: nosniff`, readable by other websites (CORS), logo link opens as an image. A "Check published file" button is for a later version ([[wi-maaz20x-014-website-live-check]]).
  - F-f generation checks that the Ignyte-hosted logo URL (fixed host, ends with the file name, e.g. `…/logo.png`) answers with an image. A logo URL on the customer's own site, typed by the consultant, is checked in [[wi-maaz20x-014-website-live-check]] (needs SSRF protection), not in the MVP.

## What changes

In: build the object from tab 1 answers + assessor and advisor fields entered by Ignyte; validate against the vendored schema plus the business checks below; show plain-language errors per question; download a passing file as `<acronym>-package-overview.json` or a failing one as `<acronym>-package-overview-DRAFT.json`; record and show the schema and rules versions per file; assessor confirmation checkbox; hosted logo URL check; publishing checklist next to a passing file; flag files built on an older vendored schema.

Out: KSI JSON, SDR, submission to FedRAMP, publishing the file (CORS and headers belong to the customer's publishing checklist), "website is live", customer-hosted logo URL and "Check published file" ([[wi-maaz20x-014-website-live-check]]), detecting new FedRAMP releases ([[wi-maaz20x-012-fedramp-rules-sync]]).

## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
