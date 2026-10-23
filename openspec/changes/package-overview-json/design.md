# Design — Screen D — generate, validate and download the Package Overview JSON

> Brain work item: [[wi-maaz20x-007-package-overview-json]] · brain_commit 7b3564b46297fb485fbe79b8c5e83e1b82263acf · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md

## Behavior

- **Screen D shows the answers read-only.** Ignyte staff see every answer of tab 1 and cannot change them; changes go through unlocking the form ([[wi-maaz20x-004-intake-company-service]]). The uploaded logo is shown with its public address. When "FedRAMP package ID" is empty, its row says the value the file uses: "Not answered · the file uses “<fallback>” (provider name and service acronym) until FedRAMP assigns one".
- **Ignyte-only boxes on Screen D:** "Assessor name", "FedRAMP assessor ID" and "Advisor" (prefilled "Ignyte", editable). The JSON's `advisors` is the customer's list from tab 1 plus this entry when it is not empty and not already in that list (case-insensitive); no advisors at all means no `advisors` key. The customer never sees them. Next to the assessor boxes a checkbox "Assessor Confirmed on FedRAMP Marketplace"; when checked it shows who checked it and the date. The schema only checks that the ID has six digits, so while an assessor name is entered and the box is not checked, the file is a draft.
- **Generate JSON** builds the Package Overview from the stored answers and the Ignyte-only boxes, then validates it in two steps: (1) the vendored FedRAMP schema with `ajv`, formats on; (2) business checks the schema cannot do: `serviceProperties.nextOngoingCertificationReportDate`, if present, is after today; the assessor is confirmed (see above); the Ignyte-hosted logo URL answers with an image content type.
- **Result.** A green check "Valid against FedRAMP Package Overview <version>" or a list of problems. Each problem names the question (form label, else schema `title`, else field path) and says what is wrong in plain words.
- **Error messages come from the schema.** The question name is chosen as above; the sentence comes from the rule type: missing ("<title> is required"), format or pattern ("<title> is not in the expected format. <description>"), allowed values ("<title> must be one of: …"), dependent fields ("<title> is required when …"), list size ("Add at least <n> <title>", used for the Security and Sales contacts), and a generic fallback for any other rule ("<title> does not meet FedRAMP's rule: <description>"). No per-field message is written by hand, so a schema change updates the messages.
- **Download** always serves the stored file of the latest generation, never a rebuild; if answers changed since, Screen D says "Answers changed since this file was generated. Generate again." The button reads "Download" when the file is valid and "Download draft" when it is not; a file that fails any check, FedRAMP's or ours, is a draft. A passing file downloads as `<acronym>-package-overview.json`. A failing file can still be downloaded, as `<acronym>-package-overview-DRAFT.json`, to show the customer what is missing; nothing inside the JSON marks it as a draft (extra fields would break the schema).
- **Package ID fallback.** If "FedRAMP package ID" is empty, `fedRampPackageId` uses the provider name and the service acronym, separated by one space, exactly as playbook step S3-03 states it: "until FedRAMP assigns one, use the provider name plus the service acronym, for example \"Example Cloud Co. ERP\"; the schema says to use the CSP's name and acronym" (source: [[maaz20x-fedramp-app-templates]] (re-export 2026-10-22), confirmed 2026-10-22; the converter `pkg_convert.py` has no such convention). Christina confirmed it in chat on 2026-10-22 ([[maaz20x-chat-2026-10-21-christina-questions]]): the file is not held as a draft for a missing ID, because the schema itself says "If no FedRAMP ID is available, use the CSP's name and acronym"; the service acronym is used because the schema has no company acronym field. This is Ignyte's documented reading of FedRAMP's instruction, not FedRAMP's exact rule.
- **Logo.** `serviceIdentification.logo` is the public URL of the logo Ignyte hosts ([[maaz20x-contract-document-storage]]), ending with the file name (e.g. `…/logo.png`). Generation requests that URL (only Ignyte's own logo host is ever requested) and the file is a draft unless it answers with an image content type.
- **Publishing checklist.** Next to a passing file, Screen D shows a short "Publishing checklist" the consultant gives the customer with the file, in the order and wording of playbook step S3-03 items 11–14 (2026-10-22): (1) other websites can read the file (CORS allows web applications on other domains to load it); (2) the file is served with `Content-Type: application/json`; (3) it is served with `X-Content-Type-Options: nosniff`; (4) the logo link opens directly as an image in a browser, with no download, sign-in or processing (transparent PNG preferred; Drive links fail the schema, expiring signed links pass it but break later); (5) final test: load the file's public web address in FedRAMP's JSON Schema Validator and check that it passes (it fails if cross-origin access is blocked). Rule sources, checked 2026-10-22 against rules 2026.10.13.01: items 1–3 are FRC-CSO-JSN, item 4 is CDS-CSO-PUB, item 5 is S3-03. "The file is at a public web address" is not a separate item: the final test needs it.
- **Versions recorded and shown.** Every generation stores the schema version read from the vendored schema file (`$schemaVersion`), the schema commit from the vendored manifest, and the FedRAMP rules version in use ([[wi-maaz20x-005-intake-ksis]]). Screen D shows next to each file the schema version, the rules version and the date and time it was created. No version string lives in code.
- **Outdated schema flag.** If the customer's latest generated file used a schema version older than the one now vendored, Screen D and the customers list show "Built on Package Overview <old>; FedRAMP's current is <new>. Regenerate." until it is regenerated.

- **Error states.**
  - No acronym: generation is refused with "Service acronym is required to name the file" (it is also required by the schema).
  - No logo uploaded: reported as the schema's missing `logo` error; the file is a draft.
  - Vendored schema file does not match its manifest hash at start-up: the app refuses to start (same rule as wi-012).
  - Unexpected failure while generating: "Could not generate the file. Nothing was saved." and the previous file stays the latest.

## Data and fields

Output object = Package Overview as vendored (today v0.2.0, FedRAMP/schemas commit `0e836c0`), per [[maaz20x-contract-package-overview-json]]. Package Overview references Common Definitions (`logoUri`), so Common Definitions (today 0.4.1) is vendored with it; both use JSON Schema draft 2020-12.

Stored per generation (`package_overview_files`): `customer_id`, `generated_at`, `generated_by`, `schema_version`, `schema_commit`, `rules_version` (nullable: the vendored FedRAMP rules version at generation time, filled once [[wi-maaz20x-012-fedramp-rules-sync]] vendors the rules; not the per-KSI versions of wi-005), `valid` (boolean; "draft" is derived as not valid, no separate column), `errors` (list of path, question name, message, raw validator message), `answers_updated_at` (to detect answers changed since), the JSON itself.

Ignyte-only inputs stored on the customer: `assessor_name`, `assessor_id`, `assessor_confirmed_at`, `assessor_confirmed_by` (null until the checkbox is ticked; cleared when the name or ID changes), `advisor_name` (default "Ignyte").

`fedRampPackageId` fallback is `<providerName> <serviceAcronym>` (§3, S3-03). The golden example's "EXCSO" did not follow that rule; Christina gave the corrected value "Example Cloud Co. ERP" (2026-10-22, [[maaz20x-chat-2026-10-21-christina-questions]] question 1 and C2). The golden answers carry "Example Cloud Co. ERP" as a typed ID; the fallback test leaves the ID empty and expects the same value in the output.

## Validation

- Step 1: `ajv` (draft 2020-12) against the vendored Package Overview schema with Common Definitions registered, `format` checks on (`uri`, `email`, `date`, `date-time`), all errors collected. Validators are compiled once at start-up.
- Step 2 (business checks): `nextOngoingCertificationReportDate`, if present, is after today in the America/New_York calendar (FedRAMP's timezone); assessor confirmed when an assessor name is present; the Ignyte-hosted logo URL answers 200 with an `image/*` content type within 5 seconds (the request goes only to the configured logo host).
- Messages built as described in Behavior; the raw validator message is stored in `errors` for Ignyte's debugging but not shown.
- Assessor ID: schema check only (six digits); a person confirms it with the checkbox.

## Permissions

Every signed-in Ignyte user (one role in the MVP, [[wi-maaz20x-002-ignyte-login]]) can edit the assessor and advisor boxes, generate and download. Customer link tokens are refused on every route of this item, including the download endpoint.

## Flows

1. Consultant opens Screen D for a customer whose form was submitted (or partially filled).
2. Fills or confirms Assessor name, FedRAMP assessor ID and Advisor, and ticks "Assessor Confirmed on FedRAMP Marketplace" after checking the Marketplace.
3. Clicks **Generate JSON** → schema check → business checks → result shown and stored with versions.
4. Valid → **Download** gives `<acronym>-package-overview.json`. Not valid → errors listed; **Download draft** gives `<acronym>-package-overview-DRAFT.json`; the consultant asks the customer to fix the questions named (unlocking the form if needed) and regenerates.
5. After the vendored schema is bumped, customers with older files show the "Regenerate" flag until step 3 is run again.

## Integrations

- [[integration-maaz20x-to-fedramp-schemas-catalog]]
- [[maaz20x-contract-document-storage]] (public logo URL)

## Non-functional requirements

- Security: server-side validation only; schemas vendored and pinned with a manifest (version, commit, SHA-256), never fetched at runtime; customer tokens refused; the logo is the only public object ([[maaz20x-contract-document-storage]]).
- Performance: Generate JSON answers in under 2 seconds for a complete intake (validators compiled once at start-up).
- Idempotency: same inputs and versions give the same bytes (stable key order).
- Accessibility: the error list is a list of links that move focus to the question named (Ignyte-only problems to their box on Screen D; "not confirmed on the FedRAMP Marketplace" to the "Assessor Confirmed" checkbox; logo problems to the logo row); the green check and errors are announced to screen readers.
- Cost: none beyond the app and the database.
