# T17 formal-v2 Sol review

Status: reviewed for Team Gate. Dataset integration and real-service restoration remain integration-task work.

## Accepted construction

- 40 cases: 6 Memory Positive, 6 Skill Positive, 3 Knowledge Positive, 15 paired No-tool Negative, 10 natural coding Negative.
- 15 one-delta pairs; discovery/direct split is 10/5.
- Memory assets: 10 L0 sessions (12 messages each), 16 L1, 5 injected L2 indexes with non-leaking summaries, 1 L3 profile.
- Skill assets: 16 real MIT-licensed GitHub Skill files from two pinned repositories; six listed and ten same-Team searchable. Search Gold stops at skill_view_by_id using the prior search result skill_id.
- Knowledge assets: three ready synthetic wiki resources. They do not claim a repository, revision, license, external path, or external hash. Each freezes tools/list followed by one search tools/call.

## Sol corrections

- Rejected memory-replacement-01 because its browser values contradicted T17-L1-15; accepted memory-replacement-02 with Chromium 124, Firefox 125, Safari 17.5, Edge 124 and exact structured filters.
- Replaced the synthetic code-graph Knowledge candidates with wiki resources so synthetic material does not invent repository provenance.
- Rejected the original KNW-01 fixture because it could not answer the requested impact inventory; the accepted replacement returns the full frozen inventory.
- Corrected Skill discovery follow-up from name-based view to skill_view_by_id, as the search response exposes skill_id and the runbook freezes that chain.

## Semantic review

Every Positive lacks one required fact/procedure, has at least two same-domain distractors, and stops at the first response carrying the target. Every paired Negative retains identity (except fresh session id), snapshot, workspace, query, shared context, and full distractor pool; only the appended delta changes. Natural negatives are locally actionable from current context. Provider-visible case objects contain no Gold, target ids, pair ids, knowledge ids, route names, or source records.
