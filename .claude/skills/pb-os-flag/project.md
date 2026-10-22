# Project overrides — PB - OS Flag

<!-- Created once by sync-skills; owned by this project; never overwritten. -->
<!-- Keys here override the skill defaults. Delete what you do not need. -->

brain_path: <path to ignyte-project-brain, default: resolved from pb.config.yaml>
# One flag per detected OS. Empty means "add nothing". Keep the same table on every machine.
flags:
  windows: LP-OS
  wsl: ""
  linux: ""
  macos: ""
pr_label: true              # also add the bare flag as a GitHub label on pull requests
