# T18 formal-v2 Sol review

Status: reviewed for Team Gate. Dataset integration and real-service restoration remain integration-task work.

## Accepted construction

- 40 cases: 6 Memory Positive, 6 Skill Positive, 3 Knowledge Positive, 15 paired No-tool Negative, 10 natural coding Negative.
- 15 one-delta pairs; discovery/direct split is 10/5.
- Memory assets: 10 L0 sessions (12-20 messages each), 16 L1, 5 injected L2 indexes with non-leaking summaries, 1 L3 profile.
- Skill assets: 16 real MIT-licensed GitHub Skill files from two pinned repositories; six listed and ten same-Team searchable. Search Gold stops at skill_view_by_id using the prior search result skill_id.
- Knowledge assets: three ready synthetic wiki resources. They do not claim a repository, revision, license, external path, or external hash. Each freezes tools/list followed by one search tools/call.

## Sol review decisions

- Kept the structured CPU profiling query as a direct atomic query with explicit type and time filters.
- Kept synthetic Knowledge resources as wiki fixtures without repository provenance; each accepted response fully carries its registered answer boundary.
- Skill discovery follow-up uses skill_view_by_id because the search response supplies skill_id; listed Skills use skill_view by injected name.
- The resource-read case uses the frozen go-concurrency-patterns manifest path references/details.md.

## Semantic review

Every Positive lacks one required fact/procedure, has at least two same-domain distractors, and stops at the first response carrying the target. Every paired Negative retains identity (except fresh session id), snapshot, workspace, query, shared context, and full distractor pool; only the appended delta changes. Natural negatives are locally actionable from current context. Provider-visible case objects contain no Gold, target ids, pair ids, knowledge ids, route names, or source records.
