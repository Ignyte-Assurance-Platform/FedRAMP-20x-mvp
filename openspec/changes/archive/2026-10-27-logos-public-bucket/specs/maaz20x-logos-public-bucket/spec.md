## ADDED Requirements

### Requirement: Customer logos in the public logos bucket: checked in the private bucket, then published

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-018-logos-public-bucket]] at brain_commit 68380eb; scope in proposal.md).

#### Scenario: a customer uploads a valid PNG or JPEG logo
- **WHEN** a customer uploads a valid PNG or JPEG logo
- **THEN** after the finish check the same object exists in the logos bucket at `customers/<customer-id>/logo/<logo-id>.<ext>` and in the documents bucket, and one `documents` row is recorded

#### Scenario: a logo fails the finish check (size, type or signature)
- **WHEN** a logo fails the finish check (size, type or signature)
- **THEN** nothing is written to the logos bucket, the private object is deleted and nothing is recorded

#### Scenario: copying to the logos bucket fails
- **WHEN** copying to the logos bucket fails
- **THEN** nothing is recorded, the private object is deleted and the customer is asked to upload again

#### Scenario: Generate JSON runs for a customer with a logo on Cloud Run dev
- **WHEN** Generate JSON runs for a customer with a logo on Cloud Run dev
- **THEN** `serviceIdentification.logo` is `https://storage.googleapis.com/ignyte-customer-logos-dev/customers/<id>/logo/<logo-id>.<ext>`, that URL answers 200 with an image content type to an anonymous request, and the logo check passes

#### Scenario: anyone requests any object of the documents bucket without credentials
- **WHEN** anyone requests any object of the documents bucket without credentials
- **THEN** it is refused (unchanged)

#### Scenario: `LOGO_PUBLIC_BASE_URL` is set
- **WHEN** `LOGO_PUBLIC_BASE_URL` is set
- **THEN** the logo previews on Screens E and D use the public URL

#### Scenario: the app starts in production without `GCS_LOGO_BUCKET`
- **WHEN** the app starts in production without `GCS_LOGO_BUCKET`
- **THEN** it refuses to start with a message naming the setting

#### Scenario: the app runs locally with `STORAGE_DRIVER=local`
- **WHEN** the app runs locally with `STORAGE_DRIVER=local`
- **THEN** logo upload, preview and Generate JSON behave as before this item, and the smoke tests pass

#### Scenario: `npm run logos:publish` runs
- **WHEN** `npm run logos:publish` runs
- **THEN** every recorded logo missing from the logos bucket is copied, and a second run copies nothing
