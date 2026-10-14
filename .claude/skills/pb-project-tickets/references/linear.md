# Linear GraphQL recipes (https://api.linear.app/graphql, header `Authorization: <LINEAR_API_KEY>`)

Issues of a team by state:
```graphql
query($team: String!) { team(id: $team) { issues(first: 100) { nodes { identifier title state { name } updatedAt url description } } } }
```
Search issues that reference a brain work item:
```graphql
query($q: String!) { issueSearch(query: $q, first: 50) { nodes { identifier title state { name } url } } }
```
Create an issue:
```graphql
mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }
```
`input`: `{ teamId, title, description, labelIds, priority, projectId }`. Resolve `teamId` from the team key with `teams { nodes { id key } }`.

Link issues: `issueRelationCreate(input: { issueId, relatedIssueId, type: "related" })`.

Snapshot shape consumed by PB - Delivery Board: `shared/delivery/linear-snapshot.example.json`.
