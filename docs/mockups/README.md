# Mockups

Clickable HTML mockups of the MVP screens, used for review with Max and Christina. Not functional; all example data is fictional. Each file is published as a shared page; after editing a file, republish it to the same link so reviewers see the change.

| Mockup | Screens | Source | Shared link |
|---|---|---|---|
| Customer intake | E (tabs: Company & service, Security indicators, Documents) | [`customer-intake.html`](customer-intake.html) | https://claude.ai/artifact/WDpuTu3NEkoX474inoT2dG |
| Ignyte console | A sign-in, B customers list, C create customer, D customer page + Package Overview JSON | [`ignyte-console.html`](ignyte-console.html) | https://claude.ai/artifact/N18wcZ6j6EuuUydAqGVJk5 |

Each page has guided tours in its top note: the main tour, and one per review round ("What changed after review 05", "What changed after your answers of Oct 22", "Screen D as built (Oct 23)").

Both mockups use the Ignyte look Max and Christina chose on Oct 23, 2026: white background, Ignyte orange (`#c2410c` for text, links and buttons, `#d9661f` for bars and borders only), Work Sans for text and IBM Plex Mono for code-like values, light theme only, the name "Ignyte FedRAMP 20x" and no logo. The app theme follows them (`app/styles/app.css`, WI-015, IGN-17); unlike the mockups, the app serves its fonts itself from `public/fonts` and never calls Google Fonts.

Screen D in the console follows the built screen (`app/routes/package/`, WI-007, IGN-8). The project brain keeps the same table in `projects/maaz20x/docs/maaz20x-mvp-mockups.md`.
