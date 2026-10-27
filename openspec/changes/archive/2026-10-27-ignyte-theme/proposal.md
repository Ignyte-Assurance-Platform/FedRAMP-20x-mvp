# Ignyte look for the app: Ignyte colors and fonts, light theme only, product name, no logo

> Brain work item: [[wi-maaz20x-015-ignyte-theme]] · brain_commit 413808608aa5473dee4d97a43e48a01fec1d46c4 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-015-ignyte-theme.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-chat-2026-10-23-tab1-why-lines-and-branding]] §3–4: Christina asked for a "more maaz formatted" look (white background, orange accents, from a style example of another engagement); Max decided "use our colors and generic ignyte name but not logos at this stage"; Christina agreed. Decision 2 of that note fixes the palette: orange `#d9661f` only for bars and borders; text, links and buttons `#c2410c` (5.2:1 on white, WCAG AA); light theme only; fonts "Work Sans and IBM Plex Mono, served by the app". Decision 3: visible name **Ignyte FedRAMP 20x** from one constant, no logo mark.
- [[maaz20x-mvp-mockups]] revision 2026-10-23 (afternoon): both mockups republished with that look (customer intake v10, Ignyte console v8). **Contradiction:** the note says Work Sans, but both mockup files (`docs/mockups/customer-intake.html`, `docs/mockups/ignyte-console.html`) load IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500 from Google Fonts. Resolved at gate 3: Work Sans (Christina's example, Max's acceptance); the mockups follow (§3).
- [[wi-maaz20x-002-ignyte-login]] §5 and FedRAMP-20x-mvp PR #18 (merged 2026-10-26): the product name already comes from one constant `PRODUCT_NAME` (`app/lib/product.ts`) in the sign-in page, the header, the page title, Screen D and the refusal message. Not repeated here.
- [[wi-maaz20x-004-intake-company-service]]: the customer's own logo upload (PNG or JPEG) is the customer's branding on their public file, not Ignyte's; unaffected.
- [[adr-0006-maaz20x-repo-folder-structure]] and [[adr-0001-maaz20x-typescript-monolith-cloud-run]] (shadcn/ui, Tailwind): the components read the theme tokens in `app/styles/app.css` (`:root` and `@theme inline`), so one token change restyles every screen.
- FedRAMP-20x-mvp `app/styles/app.css` today: neutral shadcn palette in oklch, a `@media (prefers-color-scheme: dark)` block with a dark palette, no web fonts (system font stack), nothing served from `/public` for fonts.

## What changes



## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
