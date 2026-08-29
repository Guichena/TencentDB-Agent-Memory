# M0 Measurement v2 synthetic Gate

- Candidate: `M0`
- Branch: `codex/task1-measure-m0-chain-scorer-v2`
- Parent: `2dc7bc8b57442d2beae62efd5d570a83955b374d` (`task1-c07-pass`)
- Evaluation schema: `2`
- Gate status: `SYNTHETIC_GATE_PASSED`
- Formal data status: `FORMAL_DATA_BLOCKED`
- Model runs: `0`
- Network calls: `0`
- Dependency installs: `0`

## Public seam and ownership

All case behavior is tested through `scoreCaseChain({ observation, gold, runtimeContracts })` from `index.ts`. M0 consumes a raw trace observation, independent per-sequence typed private Gold, and frozen runtime contracts. It returns trace facts and decision outcomes only. The same entrypoint validates schema/case alignment, typed sequence/terminal/binding invariants, and exact referenced runtime-contract identity/operation before scoring; bad data throws instead of becoming a model outcome.

`aggregateCaseChainFacts(CaseChainScoreV2[])` is a second frozen public seam. `interface-manifest.json` records separate input/output signatures and fields for the case scorer and the provided-trace-facts aggregate.

M0 does **not** emit or own `formalMetricEligible`. Measurement-v2 Integration must combine these trace facts with M2 usage, isolation, and infrastructure evidence to make the only final eligibility decision.

## Synthetic canonical fixture

- Source: `synthetic-fixtures.ts`
- Canonicalization: raw UTF-8 file bytes
- Bytes: `14795`
- SHA-256: `611985055db9421111ae38076ad5d1d73fbb2b1e60e8723afea957482a0f92dc`
- Freeze assertion: `__tests__/artifacts.test.ts`

## No-model Gate results

| Gate | Result |
|---|---|
| Focused M0 Vitest (`vitest .../measurement-v2/vitest.config.ts`) | 52/52 passed |
| Measurement-v2 strict TypeScript check (`tsc -p .../measurement-v2/tsconfig.json`) | passed |
| Existing Pilot v1 (`npm run eval:tool-prompt:test`) | 30/30 passed; files unchanged |
| V0–V3 capture freeze (`npm run eval:tool-prompt:capture-freeze`) | command passed; prompt inventory unchanged |
| Same trace/Gold/contract repeat | 逐字段与 JSON serialization 一致 |
| Evaluation schema output | explicitly `2` |
| Final formal eligibility field | absent by contract and test |
| Allowlist | only new files under `eval/tool-prompt-bench/measurement-v2/` |
| `git diff --check` | passed before commit |

The capture command rewrote only historical gate-document SHA values because of worktree line-ending normalization. Those existing values were restored exactly; the final diff contains no code-freeze, Prompt, Variant, runner, adapter, config, data, evaluator, or score change.

## Synthetic behavior coverage

- Positive no-call and single-step success.
- Wrong family, endpoint, Knowledge operation, and Gold-relevant arguments.
- Exact referenced RuntimeToolContract acceptance, contract 4xx, provider 5xx, and timeout.
- Runtime operation-selector/body agreement, distinct none/value/conflict/invalid normalization, conflicting explicit operation rejection, and multiple selector-path resolution.
- Memory, Skill, and Knowledge multi-step chains with prior-output binding.
- A second legal Knowledge sequence with branch-local operation, argument, and binding predicates.
- Earliest binding-valid terminal and branch-order-independent matching, including overlapping exact legal sequences.
- ECR/Strict separation for pre-terminal duplicate/unexpected/over-budget attempts.
- A terminal call whose own args/binding are invalid can be repaired, but the first terminal with valid own args/binding and exact contract acceptance freezes the horizon; prerequisite args/binding failures and their earliest failure layer cannot be washed out by a later complete retry.
- Forbidden wrong-family and typed wrong-terminal barriers; a genuinely premature accepted terminal cannot be repaired later, while a later barrier cannot erase an already-reached Qi terminal.
- `terminalAttemptIndex` identifies the accepted terminal horizon (including when an earlier Qi terminal was contract-rejected), otherwise the scored complete/Qi terminal, and never points beyond a failed evaluation horizon.
- Attempt indexes use executor-bound ordinals even when unbound raw facts precede a bound attempt; normalizer and scorer share one JSON-path implementation.
- Terminal-post behavior is ignored by decision metrics while its raw infrastructure evidence is preserved.
- No-tool clean, accepted false call, and recognizable unbound malformed intent with or without optional reason metadata.
- Multi-step first-divergence failure attribution for wrong tool, endpoint, and operation.
- Raw trace incompleteness/infrastructure facts, CTA zero denominator, ToolSPL success/failure, ShortestExact, and failure-layer aggregation.
- Public input-invariant rejection plus independently pinned public exports, score/aggregate output fields, blocker text, fixture bytes, and fixture SHA.

## FORMAL_DATA_BLOCKED

Formal-ready Gate is intentionally stopped. Frozen formal data still cannot represent the interface required by M0:

1. `schema.ts:69` stores `allowedSequences` as `string[][]`, not per-sequence typed predicates.
2. `schema.ts:71` and `schema.ts:73` store shared `expectedFollowupActions` / `expectedKnowledgeCalls`, so branch-local follow-up conditions cannot be expressed safely.
3. This branch has no new formal Gold v2 revision/tag and no closed production contract decision for `skill_view` versus `skill_view_by_id`.

The implementation therefore scores only explicit synthetic typed Gold. It does not adapt v1 formal data, does not read `allowedSequences[0]`, and does not guess a terminal, operation, binding, or Gold predicate. Formal integration must wait for a new data revision/tag and the closed RuntimeToolContract.

## Isolation

No existing evaluator, score module, Pilot semantics, Prompt/Variant, dataset, fixture JSONL, runner, adapter, YAML, or user Codex configuration was modified. Annotated pass tagging is deferred to the root task's independent review.
