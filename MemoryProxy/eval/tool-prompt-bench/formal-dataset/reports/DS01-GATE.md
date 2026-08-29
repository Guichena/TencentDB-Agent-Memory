# DS01 Gate report

## Result

**Passed** on branch `codex/task1-data-t01-python`.

DS01 migrated the existing W01-B draft into the formal T01 registry without a
model run or Luna batch.

## Counts

| Item | Result |
| --- | ---: |
| T01 pairs | 4 |
| T01 Cases | 8 |
| Positive / paired Negative | 4 / 4 |
| Memory / Skill Positive | 2 / 2 |
| Formal L0 conversations | 6 |
| Formal Skill packages | 2 |
| Knowledge assets | 0 |
| Model runs / Luna batches | 0 / 0 |

## Required validator output

| Check | Result |
| --- | ---: |
| provider leakage | 0 |
| invalid sequences | 0 |
| missing source refs | 0 |
| pair integrity errors | 0 |

`T01-SKILL-TARGET-001-P` uses `skill_view`. The unlisted searchable
`T01-SKILL-HARNESS-002-P` uses the complete
`skill_search -> skill_view_by_id` chain. All four Positive Cases carry their
own `stopAfter`; the formal contract contains no global first-decision stop.

## Artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| formal contract, canonical | `8b7fde1c44940938eae56b4ec24b16ea7e53b994d39a032d908eeef9ac622a10` |
| formal contract file | `22dfab4a015b30e0ea8a9f127a632a06eb31f460db2b1fbb883e0bd89a54d406` |
| T01 provenance file | `548147511a6041d095915bfb0e3c9257c198c0621fb2191e2ca901678977726d` |
| Dev private registry JSONL | `d221421ff1b066e7ddc0746f19f44da563a42e3636ab565070467ea1138a4a1b` |
| Dev provider JSONL file | `aabbcee29a95565493e8bb59c078ea5da89de98887c5418d64a2da725b893b58` |
| Dev private Gold JSONL file | `b15f5681d1030c05d3b21a3660f88606d17fd51998a78d62fc0b947e49bc637e` |
| Dev snapshot-input file | `0a8f420e9f085b72bc104b2522e17a54c62d1d88f7311cf82483425d32785572` |
| compiled provider, canonical | `2db4dfd90cc921b191f7dee14712dd1935d4e738a168dbd03eea0a670d2d3b6c` |
| Dev snapshot, canonical | `75c99ca3506759d9530b3a843578b6b7c271e29d84973a0f558aed83a8e06a26` |

Compiling the three Dev outputs twice produced byte-identical file hashes.

## Commands

```powershell
node eval/tool-prompt-bench/source-tools/validate_context_pair_draft.mjs `
  eval/tool-prompt-bench/formal-worlds/W01/drafts/w01-b-fuzzing-context-pairs.json

npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split dev `
  --report eval/tool-prompt-bench/formal-dataset/reports/DS01-VALIDATION.json

npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/compile-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split dev `
  --out eval/tool-prompt-bench/formal-dataset

npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
npm run typecheck
```

The two test suites passed. `typecheck` reported the pre-existing 54 unrelated
errors and no Task 1/formal-dataset errors.

## Next stage

DS02: run the three-family retrieval-pressure pilot, freeze the first T01
Knowledge asset, expand the L0 pool to the 8--12-session contract, then fill
T01 to 40 Cases in batches of at most five pairs with immediate Sol review.
