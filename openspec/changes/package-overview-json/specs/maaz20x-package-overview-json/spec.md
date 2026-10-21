## ADDED Requirements

### Requirement: Screen D — generate, validate and download the Package Overview JSON

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-007-package-overview-json]] at brain_commit 424d93a; scope in proposal.md).

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
- **THEN** validation lists every missing required field by its question name and the only download offered is `DRAFT-<acronym>-package-overview.json` (or generation is refused when the acronym itself is missing)

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

#### Scenario: the same inputs and versions are generated twice
- **WHEN** the same inputs and versions are generated twice
- **THEN** the two JSON files are identical byte for byte (stable key order)

#### Scenario: a customer link token calls any route of this item
- **WHEN** a customer link token calls any route of this item
- **THEN** it is refused
