# T09 trial review

- Reviewer: `sol`
- Review status: `passed_for_expansion`
- Scope: the three first-trial Luna batches for memory, skill, and knowledge.

## Batch validation

All three raw trial drafts pass `validate-luna-batch.mjs` with one controlled positive/negative pair, no structural errors, the required generator model and reasoning effort, and isolated batch directories.

## Memory candidate review

- The pool contains 10 L0 conversations, 14 L1 atomic memories, 4 L2 scenes, and 1 L3 profile candidate.
- Every L0 conversation has 12 messages; session IDs and message IDs are unique.
- Required factual anchors are present at the intended level. Injected scene summaries do not disclose the scene-only detail that their cases are designed to retrieve.
- The L3 candidate contains only stable workflow principles and no case answer, endpoint, or tool name.
- Candidate project IDs will be normalized to the frozen T09 project IDs during staging.
- Placeholder L1 source-session references are trial annotations only. Staging must replace them with real L0 session/message references. Each L2 scene must receive at least two real supporting T09 sessions.

## Skill candidate review

- All 14 packages trace to immutable public GitHub commits and license files in `source-lock.json`.
- Adaptation is limited to neutral discovery metadata in YAML frontmatter. Core skill bodies must remain byte-equivalent after frontmatter removal.
- Direct-use and search-first roles match the frozen visibility plan. The Fortify resource remains part of the imported package and must be reachable through the file-read route.

## Knowledge candidate review

- The trial uses the frozen synthetic repository identity and the declared production knowledge route.
- The positive and negative contexts differ only in the controlled private fact; no answer is embedded in the query or shared context.
- The repo selection is exact and the proposed result shape is compatible with the production endpoint contract.

Expansion is authorized. Final Gold, asset support links, hashes, annotations, and staging ownership remain Sol-owned.
