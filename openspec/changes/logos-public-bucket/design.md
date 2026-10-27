# Design — Customer logos in the public logos bucket: checked in the private bucket, then published

> Brain work item: [[wi-maaz20x-018-logos-public-bucket]] · brain_commit 68380eb762891d3531eeaa5ef2322185b16b032c · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-018-logos-public-bucket.md

## Risk and rollback

- **Risk: a replaced logo stays public.** Old logos remain readable at their old URL. Accepted: the contract keeps every version, a logo is public by nature, and the URL holds a random id.
- **Risk: copy succeeds, row insert fails.** The public copy is left without a row; the next upload uses a new id. Harmless (a public logo nobody links to); the script in 3.5 ignores objects without a row.
- **Risk: wrong bucket setting on deploy.** The app refuses to start without `GCS_LOGO_BUCKET`; the new revision then never gets traffic ([[wi-maaz20x-017-deploy-dev-ci]] candidate flow) and the previous one keeps serving.
- **Rollback:** revert the PR. Logos already copied stay in the logos bucket and do no harm; the reverted app goes back to the private-bucket URLs (404 on dev, as today).
