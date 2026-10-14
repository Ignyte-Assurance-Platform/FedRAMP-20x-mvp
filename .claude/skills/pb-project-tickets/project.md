# Project overrides — PB - Project Tickets

<!-- Created once by sync-skills; owned by this project; never overwritten. -->
<!-- Keys here override the skill defaults. Delete what you do not need. -->

brain_path: <path to ignyte-project-brain, default: resolved from pb.config.yaml>
linear_team_key: <TEAM_KEY>
linear_project: <Linear project name or id>
labels_default: [pb]
state_mapping: shared/delivery/linear-state-mapping.yaml   # relative to brain
field_recipes:
  feature: { labels: [feature], priority: 3, estimate: null }
  bug:     { labels: [bug], priority: 2 }
  chore:   { labels: [chore], priority: 4 }
