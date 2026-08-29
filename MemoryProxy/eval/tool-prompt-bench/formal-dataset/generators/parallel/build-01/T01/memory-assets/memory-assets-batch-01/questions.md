# T01 DS02 memory-asset self-check

## Uncertainty

- The non-authoritative assets are deliberately conservative T01 workflow guidance or scope boundaries. They do not claim unprovided implementation details, outcomes, metrics, revisions, or test results.
- CI and parallel-search items are expressed only as review dimensions or separation guidance because the frozen pack supplies project streams and constraints but no additional CI/search outcomes.

## Self-check

- Count: exactly 20 assets: 15 L1, 4 L2, and 1 L3.
- IDs: every asset uses a unique `T01-L1-`, `T01-L2-`, or `T01-L3-` prefix; required IDs are present exactly: `T01-L1-MYPY-PARAMSPEC-OPTIONAL-BOUND`, `T01-L1-MYPY-STUBGEN-STAR-EXPANSION`, and `T01-L1-MOTO-PRESENCE-PREDICATE`.
- Sources: every `source_ids` entry is nonempty and drawn only from the frozen pack allowlist.
- Members: all L1 `member_ids` arrays are empty; every L2 references existing L1 IDs; the L3 references existing L2 IDs.
- Leakage: titles, content, and grounding notes contain no provider/model names, benchmark answers, repository URLs, revisions, licenses, hashes, or fabricated provenance; synthetic assets are labeled as T01 guidance or boundaries.
- Required mappings: `T01-L1-MYPY-PARAMSPEC-OPTIONAL-BOUND` is formal `decision` with runtime `instruction`; `T01-L1-MOTO-PRESENCE-PREDICATE` is formal `decision` with runtime `instruction`; `T01-L1-MYPY-STUBGEN-STAR-EXPANSION` is formal `fact` with runtime `fact`.
- Required dates and facts: the three authoritative contents retain their supplied facts and dates `2023-02-17`, `2023-12-08`, and `2022-05-13` respectively.
