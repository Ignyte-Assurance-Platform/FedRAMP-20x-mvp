# Project overrides — PB - Update Base Files

<!-- Created once by sync-skills; owned by this project; never overwritten. -->
<!-- Keys here override the skill defaults. Delete what you do not need. -->

brain_path: <path to ignyte-project-brain, default: resolved from pb.config.yaml>
base_files:
  - README.md
  - AGENTS.md
  - CLAUDE.md
  - CONTRIBUTING.md
  - CHANGELOG.md
  - docs/onboarding/
  - docs/architecture/
triggers:                      # path globs whose change implies a base-file review
  - "src/**"
  - "openspec/**"
  - "package.json"
  - ".env.example"
