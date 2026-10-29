# Screen E tab 1 — Company & service intake generated from the Package Overview schema

> Brain work item: [[wi-maaz20x-004-intake-company-service]] · brain_commit 68881d9cc32a5a2603e01d2b0268bb38038d1f76 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-004-intake-company-service.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-mvp-plan-v3-1]] §1.4–1.5, §2.12–2.13, §2.16–2.17: link without login, header with company and service, progress bar, Save/Submit, tab 1 fields, save/resume, submit locks.
- [[maaz20x-contract-package-overview-json]]: schema FRC-CSO-PKG v0.2.0, full field list with required flags, enumerations, golden example.
- [[maaz20x-fedramp-schemas-catalog]]: pinned commit `0e836c0`; schemas vendored, version recorded per package.
- [[maaz20x-cr26-work-package-findings]] §2 item 4 and §3: why the old form failed (objects collapsed to rows, repeating groups by position, category shorthand, missing advisors) and the seven fault cases.
- [[maaz20x-intake-questionnaire]] §3: questions 1–5 map to this tab.
- [[maaz20x-meeting-2026-10-14-max-christina]]: the form is generated from the schema instead of hand-built (how it fits in 5 days).
- Contradiction noted: plan §2.13 says "Assessor: left empty for the customer; Ignyte fills it" — kept.
- Max's mockup feedback (2026-10-15): "Logo URL — we should get their logo, have them upload it so it is hosted on our side versus theirs. Logo upload with instructions, and website is fine." Applied below (logo upload replaces the logo URL field; `website` stays a URL).
- Christina's gate-3 review of [[maaz20x-brief-005-intake-ksis]] (2026-10-19), question 5: "Lets take class A only approach for the moment, iron out issues and expand." The MVP serves Class A customers only; the class dropdown from her 2026-10-14 mockup feedback is withdrawn for the MVP. Applied below.
- **Christina's comments on Max's copy 04, 2026-10-22** (10 comments, no decision box; the copy she read predates the Class A and package ID changes; SME input, not a signature): points 1, 2, 4, 6, 7 and 8 Keep. Point 3 Change: use FedRAMP's label "Third-party information resources within the Minimum Assessment Scope" (MAS-CSO-TPR), since in-scope third parties are not limited to ones that touch federal data; and enforce at least one Security and one Sales contact (schema rule, CDS-CSO-PUB; her converter checks it). Point 5: she asked whether the class picker was forward thinking; the copy was stale, Class A only stands. Point 7: she asked for the customer's own public logo URL because document 06 says files are never public; answered that the hosted logo is the one public object (document 07 point 7), kept as is, customer-hosted URL deferred to [[wi-maaz20x-014-website-live-check]]. Question 1: "Yes, save automatically and keep the button." Question 2: "Keep it, and put it in the file": UEI is an optional Package Overview field (`serviceIdentification.ueiNumber`), the brief's question was wrong. Applied below; replies in the Word copy ([[maaz20x-gate3-review-2026-10-15]]). Thread 04.7 (2026-10-23, not yet in a downloaded copy): "I agree we host the image that needs to be public and wall off the customer documents as we should" ([[maaz20x-review-comments-2026-10-22-christina]]).
- [[maaz20x-chat-2026-10-22-christina-app-changes]] row 5 / B7: typed answers are never overwritten silently (E2). Row 3: a customer-facing "Why we ask (client)" column in the Intake tab ([[maaz20x-intake-questionnaire]] §2).
- Code on `main` (FedRAMP-20x-mvp, built for [[wi-maaz20x-007-package-overview-json]]): tab 1 is read from `intake_answers` section `company`; the logo is the newest `documents` row under `customers/<id>/logo/`; `upsertIntakeSection` (smoke test only) replaces a section with no version check (IGN-8 triage: pr-9 finding 7 deferred here, nit 9 "wi-004 must replace it, not reuse it").

## What changes

In: the customer-facing form for every Package Overview field except `assessor` (Ignyte-only), rendered from the vendored schema; save/resume by link; submit; read-only view on Screen D (display only; JSON generation is [[wi-maaz20x-007-package-overview-json]]).
Out: tabs 2 and 3, JSON generation/validation, consultant editing of answers, multi-language, file uploads, FedRAMP 20x Classes B, C and D (MVP is Class A only; Christina, 2026-10-19).

## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
