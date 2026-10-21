# Design — Screen D — generate, validate and download the Package Overview JSON

> Brain work item: [[wi-maaz20x-007-package-overview-json]] · brain_commit 424d93a75b8261c8c4c4305da5f7b97d2c5c3fa5 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md

## Behavior

- **Screen D shows the answers read-only.** Ignyte staff see every answer of tab 1 and cannot change them; changes go through unlocking the form ([[wi-maaz20x-004-intake-company-service]]).
- **Ignyte-only boxes on Screen D:** "Assessor name", "FedRAMP assessor ID" and "Advisor" (prefilled "Ignyte", editable). The JSON's `advisors` is the customer's list from tab 1 plus this entry when it is not empty and not already in that list (case-insensitive); no advisors at all means no `advisors` key. The customer never sees them. Under the assessor ID a grey line reads "The schema only checks that this is six digits. Confirm the assessor on the FedRAMP Marketplace."
- **Generate JSON** builds the Package Overview from the stored answers and the Ignyte-only boxes, then validates it in two steps: (1) the vendored FedRAMP schema with `ajv`, formats on; (2) business checks the schema cannot do: `serviceProperties.nextOngoingCertificationReportDate`, if present, is after today.
- **Result.** A green check "Valid against FedRAMP Package Overview <version>" or a list of problems. Each problem names the question (form label, else schema `title`, else field path) and says what is wrong in plain words.
- **Error messages come from the schema.** The question name is chosen as above; the sentence comes from the rule type: missing ("<title> is required"), format or pattern ("<title> is not in the expected format. <description>"), allowed values ("<title> must be one of: …"), dependent fields ("<title> is required when …"), list size ("Add at least <n> <title>", used for the Security and Sales contacts), and a generic fallback for any other rule ("<title> does not meet FedRAMP's rule: <description>"). No per-field message is written by hand, so a schema change updates the messages.
- **Download** always serves the stored file of the latest generation, never a rebuild; if answers changed since, Screen D says "Answers changed since this file was generated. Generate again." A passing file downloads as `<acronym>-package-overview.json`. A failing file can still be downloaded, as `DRAFT-<acronym>-package-overview.json`, to show the customer what is missing; nothing inside the JSON marks it as a draft (extra fields would break the schema).
- **Package ID fallback.** If "FedRAMP package ID" is empty, `fedRampPackageId` uses the provider name and the service acronym.
- **Logo.** `serviceIdentification.logo` is the public URL of the logo Ignyte hosts ([[maaz20x-contract-document-storage]]); the upload checks of wi-004 guarantee it is an image.
- **Versions recorded.** Every generation stores the schema version read from the vendored schema file (`$schemaVersion`), the schema commit from the vendored manifest, and the FedRAMP rules version in use ([[wi-maaz20x-005-intake-ksis]]). No version string lives in code.
- **Outdated schema flag.** If the customer's latest generated file used a schema version older than the one now vendored, Screen D and the customers list show "Built on Package Overview <old>; FedRAMP's current is <new>. Regenerate." until it is regenerated.

- **Error states.**
  - No acronym: generation is refused with "Service acronym is required to name the file" (it is also required by the schema).
  - No logo uploaded: reported as the schema's missing `logo` error; the file is a draft.
  - Vendored schema file does not match its manifest hash at start-up: the app refuses to start (same rule as wi-012).
  - Unexpected failure while generating: "Could not generate the file. Nothing was saved." and the previous file stays the latest.

## Data and fields

Output object = Package Overview as vendored (today v0.2.0, FedRAMP/schemas commit `0e836c0`), per [[maaz20x-contract-package-overview-json]]. Package Overview references Common Definitions (`logoUri`), so Common Definitions (today 0.4.1) is vendored with it; both use JSON Schema draft 2020-12.

Stored per generation (`package_overview_files`): `customer_id`, `generated_at`, `generated_by`, `schema_version`, `schema_commit`, `rules_version` (nullable: the vendored FedRAMP rules version at generation time, filled once [[wi-maaz20x-012-fedramp-rules-sync]] vendors the rules; not the per-KSI versions of wi-005), `valid` (boolean; "draft" is derived as not valid, no separate column), `errors` (list of path, question name, message, raw validator message), `answers_updated_at` (to detect answers changed since), the JSON itself.

Ignyte-only inputs stored on the customer: `assessor_name`, `assessor_id`, `advisor_name` (default "Ignyte").

`fedRampPackageId` fallback follows the converter's convention (provider name + service acronym); with the golden answers it yields `EXCSO`.

## Validation

- Step 1: `ajv` (draft 2020-12) against the vendored Package Overview schema with Common Definitions registered, `format` checks on (`uri`, `email`, `date`, `date-time`), all errors collected. Validators are compiled once at start-up.
- Step 2 (business checks): `nextOngoingCertificationReportDate`, if present, is after today in the America/New_York calendar (FedRAMP's timezone).
- Messages built as described in Behavior; the raw validator message is stored in `errors` for Ignyte's debugging but not shown.
- Assessor ID: schema check only (six digits); a person confirms it.

## Permissions

Every signed-in Ignyte user (one role in the MVP, [[wi-maaz20x-002-ignyte-login]]) can edit the assessor and advisor boxes, generate and download. Customer link tokens are refused on every route of this item, including the download endpoint.

## Flows

1. Consultant opens Screen D for a customer whose form was submitted (or partially filled).
2. Fills or confirms Assessor name, FedRAMP assessor ID and Advisor.
3. Clicks **Generate JSON** → schema check → business checks → result shown and stored with versions.
4. Valid → **Download** gives `<acronym>-package-overview.json`. Not valid → errors listed; **Download draft** gives `DRAFT-<acronym>-package-overview.json`; the consultant asks the customer to fix the questions named (unlocking the form if needed) and regenerates.
5. After the vendored schema is bumped, customers with older files show the "Regenerate" flag until step 3 is run again.

## Integrations

- [[integration-maaz20x-to-fedramp-schemas-catalog]]
- [[maaz20x-contract-document-storage]] (public logo URL)

## Non-functional requirements

- Security: server-side validation only; schemas vendored and pinned with a manifest (version, commit, SHA-256), never fetched at runtime; customer tokens refused; the logo is the only public object ([[maaz20x-contract-document-storage]]).
- Performance: Generate JSON answers in under 2 seconds for a complete intake (validators compiled once at start-up).
- Idempotency: same inputs and versions give the same bytes (stable key order).
- Accessibility: the error list is a list of links that move focus to the question named; the green check and errors are announced to screen readers.
- Cost: none beyond the app and the database.
