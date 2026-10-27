# maaz20x-ignyte-theme Specification

## Purpose
Every screen uses Ignyte's look: light theme only, Ignyte orange for accents and readable text, Work Sans and IBM Plex Mono served by the app, the product name from one constant and no Ignyte logo; all of it through the theme tokens in `app/styles/app.css` (brain wi-maaz20x-015, IGN-17).

## Requirements

### Requirement: Ignyte look for the app: Ignyte colors and fonts, light theme only, product name, no logo

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-015-ignyte-theme]] at brain_commit 4138086; scope in proposal.md).

#### Scenario: any Ignyte screen (A, B, C, D) or the customer intake (E) opens
- **WHEN** any Ignyte screen (A, B, C, D) or the customer intake (E) opens
- **THEN** the page background is white, primary buttons and links are `#c2410c` on white, bars and borders that carry the accent are `#d9661f`, and no element uses the previous neutral primary.

#### Scenario: the device prefers dark mode
- **WHEN** the device prefers dark mode
- **THEN** the app still renders the light theme (no dark palette, no toggle).

#### Scenario: the app loads
- **WHEN** the app loads
- **THEN** text uses Work Sans and code-like values (package ID, intake link, JSON, file names) use IBM Plex Mono, both served from the app's own origin with `font-display: swap`, and no request goes to fonts.googleapis.com or fonts.gstatic.com.

#### Scenario: the primary button, a link and body text are measured against their background
- **WHEN** the primary button, a link and body text are measured against their background
- **THEN** each contrast ratio is at least 4.5:1 (WCAG AA) [smoke].

#### Scenario: every screen is searched for "Maaz 20x", an `<img>` logo or a logo placeholder
- **WHEN** every screen is searched for "Maaz 20x", an `<img>` logo or a logo placeholder
- **THEN** none is found; the header and `<title>` show "Ignyte FedRAMP 20x" from `PRODUCT_NAME`.

#### Scenario: the theme commit is reverted
- **WHEN** the theme commit is reverted
- **THEN** the app builds and renders with the neutral theme again (no other file depends on the new tokens by name).
