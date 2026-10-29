## ADDED Requirements

### Requirement: Screen E tab 1 — Company & service intake generated from the Package Overview schema

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-004-intake-company-service]] at brain_commit 68881d9; scope in proposal.md).

#### Scenario: the intake link is opened without a session
- **WHEN** the intake link is opened without a session
- **THEN** tab 1 renders with the customer's company and service name in the header

#### Scenario: the vendored Package Overview schema has a required field
- **WHEN** the vendored Package Overview schema has a required field
- **THEN** the form marks it required and Submit is blocked while it is empty

#### Scenario: an enumerated field is shown
- **WHEN** an enumerated field is shown
- **THEN** its options are exactly the schema strings (e.g. "Artificial Intelligence (AI)", "Government Community Cloud")

#### Scenario: Trust Center has authenticationRequired true and no accessRequestInstructions
- **WHEN** Trust Center has authenticationRequired true and no accessRequestInstructions
- **THEN** Submit shows an error on that group

#### Scenario: Save is clicked
- **WHEN** Save is clicked
- **THEN** the partial object is stored with its `form_definition_version` and a bumped `version`, the form definition's schema version and commit equal those read from the vendored manifest (no literals), and the customer status becomes In progress

#### Scenario: the link is reopened after Save
- **WHEN** the link is reopened after Save
- **THEN** every saved answer is shown

#### Scenario: Submit succeeds
- **WHEN** Submit succeeds
- **THEN** tabs 1 and 2 are read-only, tab 3 still accepts files, and the customer status is Submitted

#### Scenario: Ignyte unlocks the customer
- **WHEN** Ignyte unlocks the customer
- **THEN** the link is editable again and status returns to In progress

#### Scenario: the golden example values (`server/fedramp/testdata/golden-answers.json`) are entered
- **WHEN** the golden example values (`server/fedramp/testdata/golden-answers.json`) are entered
- **THEN** tab 1 submits with zero validation errors

#### Scenario: a PNG logo of 300 px width and 500 KB is uploaded
- **WHEN** a PNG logo of 300 px width and 500 KB is uploaded
- **THEN** a preview is shown, the file is stored on Ignyte's side and the generated JSON uses the Ignyte-hosted URL as `serviceIdentification.logo`

#### Scenario: a 3 MB logo, an SVG or a WebP is uploaded
- **WHEN** a 3 MB logo, an SVG or a WebP is uploaded
- **THEN** it is rejected before upload with the instructions shown

#### Scenario: a file renamed to .png that is not a PNG reaches the bucket
- **WHEN** a file renamed to .png that is not a PNG reaches the bucket
- **THEN** the finish check deletes it and nothing is recorded

#### Scenario: no logo is uploaded
- **WHEN** no logo is uploaded
- **THEN** Submit is blocked with an error naming the logo

#### Scenario: the certification type is 20x
- **WHEN** the certification type is 20x
- **THEN** no class picker is shown, the customer record stores `fedramp_class = "A"`, and Screen D shows "Class A" as read-only text next to the certification type

#### Scenario: the package ID is left empty
- **WHEN** the package ID is left empty
- **THEN** Submit is not blocked by it, the box shows "<provider name> <service acronym>" (for example "Example Cloud Co. ERP") with the note "Filled in automatically until FedRAMP assigns your ID", and nothing is stored for the field; WHEN a value is typed THEN the note disappears and the typed value is stored

#### Scenario: the contacts list has no Security contact or no Sales contact
- **WHEN** the contacts list has no Security contact or no Sales contact
- **THEN** Submit is blocked with an error on the Contacts section, built from the schema rule and the tab 1 label; WHEN both are present THEN that check passes

#### Scenario: the customer stops typing for 2 seconds
- **WHEN** the customer stops typing for 2 seconds
- **THEN** the draft is saved without pressing Save and the status becomes In progress on the first autosave; the Save button still works

#### Scenario: the UEI box is filled
- **WHEN** the UEI box is filled
- **THEN** the stored object and the generated file contain `serviceIdentification.ueiNumber`; WHEN it is empty THEN the key is absent

#### Scenario: tab 1 is rendered
- **WHEN** tab 1 is rendered
- **THEN** the third-party section is labelled "Third-party information resources within the Minimum Assessment Scope"

#### Scenario: two windows edit tab 1 and the second saves with an older version
- **WHEN** two windows edit tab 1 and the second saves with an older version
- **THEN** it gets a conflict, the stored answers are unchanged, and the customer chooses Keep mine or Take theirs

#### Scenario: the code is built
- **WHEN** the code is built
- **THEN** no write to `intake_answers` happens without a version check (`upsertIntakeSection` removed)

#### Scenario: the browser posts `serviceIdentification.logo` or `assessor`
- **WHEN** the browser posts `serviceIdentification.logo` or `assessor`
- **THEN** neither is stored

#### Scenario: Save, autosave, Submit or a logo upload uses an expired or replaced token
- **WHEN** Save, autosave, Submit or a logo upload uses an expired or replaced token
- **THEN** nothing is stored and the expired page is shown; WHEN tabs 1 and 2 are Submitted THEN autosave and Save are refused

#### Scenario: a staff session opens `/intake/<token>` without a valid token
- **WHEN** a staff session opens `/intake/<token>` without a valid token
- **THEN** nothing is shown

#### Scenario: the provider name or acronym changes and the package ID is empty
- **WHEN** the provider name or acronym changes and the package ID is empty
- **THEN** the shown fallback follows; WHEN either is empty THEN no value and no note are shown

#### Scenario: a question has a line in the "Why we ask (client)" column
- **WHEN** a question has a line in the "Why we ask (client)" column
- **THEN** it is shown under the question word for word; WHEN the column says "—" THEN nothing is shown

#### Scenario: a customer is created on Screen C
- **WHEN** a customer is created on Screen C
- **THEN** tab 1 starts with the provider name, service name and description typed there

#### Scenario: tab 1's labels are published
- **WHEN** tab 1's labels are published
- **THEN** Screen D names a tab 1 problem with the same label the customer sees
