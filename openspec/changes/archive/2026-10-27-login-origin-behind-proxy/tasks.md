# Tasks — Sign-in fails on Cloud Run: form actions rejected because the app sees http while the browser uses https

> Brain work item: [[wi-maaz20x-016-login-origin-behind-proxy]] · brain_commit 042863edf97aaa40aa9fcae28160e9d75d2992ac · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-016-login-origin-behind-proxy.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 042863e; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-016-login-origin-behind-proxy.md`)

## 2. Implement
- [x] 2.1 WHEN the app runs in production with `APP_URL` on `https` and receives a form action whose `Origin` equals `APP_URL`'s origin while the container sees `http` THEN the action runs and is not rejected with 400
- [x] 2.2 WHEN a form action arrives with an `Origin` different from `APP_URL`'s origin THEN it is still rejected (CSRF protection unchanged)
- [x] 2.3 WHEN the request is rewritten to the public origin THEN path, query string, method, headers and body are unchanged
- [x] 2.4 WHEN the app runs in development THEN requests are not rewritten and local sign-in and smoke tests behave as before
- [x] 2.5 WHEN the fix is deployed to Cloud Run dev THEN Jesús signs in with Google with `jesus.p@ignyteplatform.com` and reaches the customer list (manual check, wi-002 scenario 2.1) · verified 2026-10-27 on Cloud Run dev, image web:e26fc73: Jesús signed in with Google, reached the customer list and created a test customer

## 3. Verify
- [x] 3.1 Automated review (PB - Review PR) against this spec · `.pb-cache/reviews/pr-27-2026-10-27.md`: 5/5 criteria, 0 blockers, 0 major, 1 minor, 2 nits
- [x] 3.2 Human triage (gate 7) recorded in Linear  · IGN-18 comment 2118cf62 (findings 1–2 fixed in 68e053b, 3 accepted)
