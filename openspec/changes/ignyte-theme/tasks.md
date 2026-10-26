# Tasks — Ignyte look for the app: Ignyte colors and fonts, light theme only, product name, no logo

> Brain work item: [[wi-maaz20x-015-ignyte-theme]] · brain_commit 413808608aa5473dee4d97a43e48a01fec1d46c4 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-015-ignyte-theme.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 4138086; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-015-ignyte-theme.md`)

## 2. Implement
- [x] 2.1 WHEN any Ignyte screen (A, B, C, D) or the customer intake (E) opens THEN the page background is white, primary buttons and links are `#c2410c` on white, bars and borders that carry the accent are `#d9661f`, and no element uses the previous neutral primary.
- [x] 2.2 WHEN the device prefers dark mode THEN the app still renders the light theme (no dark palette, no toggle).
- [x] 2.3 WHEN the app loads THEN text uses Work Sans and code-like values (package ID, intake link, JSON, file names) use IBM Plex Mono, both served from the app's own origin with `font-display: swap`, and no request goes to fonts.googleapis.com or fonts.gstatic.com.
- [x] 2.4 WHEN the primary button, a link and body text are measured against their background THEN each contrast ratio is at least 4.5:1 (WCAG AA) [smoke].
- [x] 2.5 WHEN every screen is searched for "Maaz 20x", an `<img>` logo or a logo placeholder THEN none is found; the header and `<title>` show "Ignyte FedRAMP 20x" from `PRODUCT_NAME`.
- [x] 2.6 WHEN the theme commit is reverted THEN the app builds and renders with the neutral theme again (no other file depends on the new tokens by name).

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear IGN-17
