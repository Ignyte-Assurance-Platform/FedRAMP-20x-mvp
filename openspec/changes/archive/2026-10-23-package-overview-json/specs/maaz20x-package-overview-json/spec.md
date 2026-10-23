## ADDED Requirements

### Requirement: Screen D — generate, validate and download the Package Overview JSON

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-007-package-overview-json]] at brain_commit 7b3564b; scope in proposal.md).

#### Scenario: the golden answers are present with a fixed logo URL and the default advisor
- **WHEN** the golden answers are present with a fixed logo URL and the default advisor
- **THEN** Generate JSON reports 0 errors and the stored JSON deep-equals the golden fixture (key order ignored), and the download is named `ERP-package-overview.json`

#### Scenario: each fault that this item owns is injected
- **WHEN** each fault that this item owns is injected
- **THEN** validation reports it at the path in the table below; the faults owned by wi-004 are covered by wi-004's tests

#### Scenario: a contact phone is `(800) 555-0199 ext. 42` or `+1 202.555.0123`
- **WHEN** a contact phone is `(800) 555-0199 ext. 42` or `+1 202.555.0123`
- **THEN** validation reports no phone error

#### Scenario: the form is blank
- **WHEN** the form is blank
- **THEN** validation lists every missing required field by its question name and the only download offered is `<acronym>-package-overview-DRAFT.json` (or generation is refused when the acronym itself is missing)

#### Scenario: the next ongoing certification report date is today or earlier (America/New_York)
- **WHEN** the next ongoing certification report date is today or earlier (America/New_York)
- **THEN** validation reports it and the file is a draft

#### Scenario: a field has a form label
- **WHEN** a field has a form label
- **THEN** its error uses that label; WHEN it has none THEN the schema `title` is used; no per-field message text exists in application code

#### Scenario: a rule type has no message pattern
- **WHEN** a rule type has no message pattern
- **THEN** the generic fallback sentence is shown

#### Scenario: a file is generated
- **WHEN** a file is generated
- **THEN** `schema_version` equals the vendored schema's `$schemaVersion`, `schema_commit` comes from the manifest, `rules_version` is stored (null until rules are vendored), and no version literal exists in application code

#### Scenario: the vendored schema version is raised
- **WHEN** the vendored schema version is raised
- **THEN** customers whose latest file used the older version show the "Regenerate" flag on Screen D, and the flag clears after regenerating (the flag in the customers list follows when [[wi-maaz20x-003-customers-list-and-create]] ships)

#### Scenario: answers change after a generation
- **WHEN** answers change after a generation
- **THEN** Download still serves the stored file and Screen D shows "Answers changed since this file was generated"

#### Scenario: the customer listed advisor "Ignyte" on tab 1 and the Advisor box says "Ignyte"
- **WHEN** the customer listed advisor "Ignyte" on tab 1 and the Advisor box says "Ignyte"
- **THEN** `advisors` contains "Ignyte" once; WHEN the box is emptied and the customer listed none THEN the JSON has no `advisors`

#### Scenario: "FedRAMP package ID" is empty and the provider name is "Example Cloud Co." and the acronym "ERP"
- **WHEN** "FedRAMP package ID" is empty and the provider name is "Example Cloud Co." and the acronym "ERP"
- **THEN** `fedRampPackageId` is exactly "Example Cloud Co. ERP", no error names the package ID, and the file can still be valid; WHEN the box holds a value THEN it is copied as typed

#### Scenario: "FedRAMP package ID" is empty
- **WHEN** "FedRAMP package ID" is empty
- **THEN** Screen D's read-only row for it reads "Not answered · the file uses “Example Cloud Co. ERP” (provider name and service acronym) until FedRAMP assigns one"; WHEN the problem "Assessor Name has not been confirmed on the FedRAMP Marketplace" is clicked THEN focus moves to the "Assessor Confirmed on FedRAMP Marketplace" checkbox

#### Scenario: the same inputs and versions are generated twice
- **WHEN** the same inputs and versions are generated twice
- **THEN** the two JSON files are identical byte for byte (stable key order)

#### Scenario: a customer link token calls any route of this item
- **WHEN** a customer link token calls any route of this item
- **THEN** it is refused

#### Scenario: an assessor name is entered and "Assessor Confirmed on FedRAMP Marketplace" is not ticked
- **WHEN** an assessor name is entered and "Assessor Confirmed on FedRAMP Marketplace" is not ticked
- **THEN** the file is a draft with a problem naming the assessor; WHEN it is ticked THEN Screen D shows who ticked it and the date; WHEN the assessor name or ID changes THEN the tick is cleared

#### Scenario: the Ignyte-hosted logo URL does not answer with an image
- **WHEN** the Ignyte-hosted logo URL does not answer with an image
- **THEN** the file is a draft with a problem naming the logo

#### Scenario: a file is shown on Screen D
- **WHEN** a file is shown on Screen D
- **THEN** its schema version, rules version and creation date and time are shown next to it

#### Scenario: the latest file is valid
- **WHEN** the latest file is valid
- **THEN** the Publishing checklist with its five items (CORS and the two headers from FRC-CSO-JSN, the logo item from CDS-CSO-PUB, the validator test from S3-03) is shown next to it; WHEN it is a draft THEN the checklist is not shown

#### Scenario: the file is a draft
- **WHEN** the file is a draft
- **THEN** the button reads "Download draft" and the file is named `<acronym>-package-overview-DRAFT.json`
