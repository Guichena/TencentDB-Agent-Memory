# T18 Knowledge bulk-01 Sol questions

- Verify that the three ready wiki candidates are exactly T18-KNW-01 through T18-KNW-03 and are marked `internal_synthetic_fixture` without repository, revision, license, or path provenance.
- Verify that each candidate has the fixed `search` and `read_page` tools, a `tools/list` fixture, and one query fixture whose frozen params match the T18 input pack.
- Verify that KNW-01's result fully states SpanBudget p99 ownership, affected call surfaces, capacity boundary, and over-budget action.
- Verify that KNW-02's result fully states both direct consumers of `rebalancePartitions` and their roles.
- Verify that KNW-03's result fully states fallback triggers, local-execution and cache boundaries, and the reproducibility rationale.
- Verify that each pair changes only its appended delta, keeps the query identical, and uses the exact two-step list-then-call route with the frozen `search` name and params.
- Verify that provider-visible text contains no internal asset identifiers, route names, private proposal fields, or evaluation wording.
