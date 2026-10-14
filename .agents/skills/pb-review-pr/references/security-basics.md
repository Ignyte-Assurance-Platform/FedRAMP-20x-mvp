# Security basics checklist (tech-agnostic)

- No secrets in code, config or logs; `.env` ignored; tokens never in URLs that get logged.
- Every route/handler checks authentication and authorization; tokenized links are long random values with expiry/revocation where the spec says.
- Inputs validated at the boundary (type, size, enum); file uploads restricted by type and size, served from private storage via signed URLs.
- Parameterized queries / ORM; no string-built SQL. No `eval`-style execution of user content.
- PII minimized in logs; errors do not leak stack traces to users.
- Dependencies pinned; new ones justified in the PR.
- Session lifetime and cookie flags per spec (HttpOnly, Secure, SameSite).
