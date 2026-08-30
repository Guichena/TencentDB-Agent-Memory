# M0 Measurement v2 synthetic Gate

- Candidate: `M0`
- Branch: `codex/task1-measure-m0-chain-scorer-v2`
- Parent: `2dc7bc8b57442d2beae62efd5d570a83955b374d` (`task1-c07-pass`)
- Evaluation schema: `2`
- Gate status: `SYNTHETIC_GATE_PASSED`
- Formal data status: `FORMAL_DATA_V1_1_AVAILABLE_METRIC_INELIGIBLE`
- Model runs: `0`
- Network calls: `0`
- Dependency installs: `0`

## Public seam and ownership

All case behavior is tested through `scoreCaseChain({ observation, gold, runtimeContracts })`. The original M0 branch exposed it from `index.ts`; the integrated Measurement-v2 tree preserves that exact two-function surface at `m0-index.ts`, while `index.ts` additionally exposes the independently reviewed M2 usage and isolation contracts. M0 consumes a raw trace observation, independent per-sequence typed private Gold, and frozen runtime contracts. It returns trace facts and decision outcomes only. The same entrypoint validates schema/case alignment, typed sequence/terminal/binding invariants, and exact referenced runtime-contract identity/operation before scoring; bad data throws instead of becoming a model outcome.

`aggregateCaseChainFacts(CaseChainScoreV2[])` is a second frozen public seam. `interface-manifest.json` records separate input/output signatures and fields for the case scorer and the provided-trace-facts aggregate.

M0 does **not** emit or own `formalMetricEligible`. Measurement-v2 Integration must combine these trace facts with M2 usage, isolation, and infrastructure evidence to make the only final eligibility decision.

## Synthetic canonical fixture

- Source: `synthetic-fixtures.ts`
- Canonicalization: raw UTF-8 file bytes
- Bytes: `15720`
- SHA-256: `aab4f994b9fb8aaacbd840977fc651823223aace44c0f3de7a1a219fe2b2bd53`
- Freeze assertion: `__tests__/artifacts.test.ts`

## No-model Gate results

| Gate | Result |
|---|---|
| Focused M0 Vitest (`vitest .../measurement-v2/vitest.config.ts`) | 61/61 passed |
| Measurement-v2 strict TypeScript check (`tsc -p .../measurement-v2/tsconfig.json`) | passed |
| Existing Pilot v1 (`npm run eval:tool-prompt:test`) | 30/30 passed; files unchanged |
| V0–V3 capture freeze (`npm run eval:tool-prompt:capture-freeze`) | command passed; prompt inventory unchanged |
| Same trace/Gold/contract repeat | 逐字段与 JSON serialization 一致 |
| Evaluation schema output | explicitly `2` |
| Final formal eligibility field | absent by contract and test |
| Allowlist | only new files under `eval/tool-prompt-bench/measurement-v2/` |
| `git diff --check` | passed before commit |

The capture command rewrote only historical gate-document SHA values because of worktree line-ending normalization. Those existing values were restored exactly; the final diff contains no code-freeze, Prompt, Variant, runner, adapter, config, data, evaluator, or score change.

## P1 TDD repair record

- Operation selector RED: focused scorer run exited `1`; all five present non-string selector cases (`42`, `null`, object, array, boolean) failed because they incorrectly produced TSR/ECR/Strict success. Missing-selector and pure-none controls passed.
- Operation selector GREEN: the same focused scorer suite passed `55/55` after present non-string selectors became an explicit invalid normalization state.
- Prerequisite repair RED: focused scorer run exited `1`; two exact cases failed because corrected prerequisite arguments/bindings before the accepted terminal were incorrectly blocked, producing ECR failure and zero ToolSPL.
- Prerequisite repair GREEN: the same focused scorer suite passed `58/58` after a corrected prerequisite before the accepted terminal could complete the chain; the first accepted terminal still freezes the evaluation horizon, so retries after it cannot repair the result.

## Synthetic behavior coverage

- Positive no-call and single-step success.
- Wrong family, endpoint, Knowledge operation, and Gold-relevant arguments.
- Exact referenced RuntimeToolContract acceptance, contract 4xx, provider 5xx, and timeout.
- Runtime operation-selector/body agreement, distinct none/value/conflict/invalid normalization, conflicting explicit operation rejection, present non-string selector rejection, genuinely missing selector and pure-none controls, and multiple selector-path resolution.
- Memory, Skill, and Knowledge multi-step chains with prior-output binding.
- A second legal Knowledge sequence with branch-local operation, argument, and binding predicates.
- Earliest binding-valid terminal and branch-order-independent matching, including overlapping exact legal sequences.
- ECR/Strict separation for pre-terminal duplicate/unexpected/over-budget attempts.
- A terminal call whose own args/binding are invalid can be repaired. A prerequisite argument/binding failure can also be repaired before the first behavior-valid terminal, with Strict/ShortestExact/positive-overcall/ToolSPL retaining the extra-attempt penalty. The first behavior-valid terminal freezes the horizon independent of HTTP acceptance, so retries after it cannot repair the result.
- Forbidden wrong-family and typed wrong-terminal barriers; a genuinely premature behavior-valid terminal cannot be repaired later, while a later barrier cannot erase an already-reached Qi terminal.
- `behaviorValidTerminalAttemptIndex` is the sole evaluation/usage horizon ordinal. `terminalAttemptIndex` remains a diagnostic that may instead identify the scored complete/Qi terminal or an in-prefix raw terminal candidate; it must not drive M2 Token/cache or Integration infrastructure boundaries.
- Attempt indexes use executor-bound ordinals even when unbound raw facts precede a bound attempt; normalizer and scorer share one JSON-path implementation.
- Terminal-post behavior is ignored by decision metrics while its raw infrastructure evidence is preserved.
- No-tool clean, accepted false call, and recognizable unbound malformed intent with or without optional reason metadata.
- Multi-step first-divergence failure attribution for wrong tool, endpoint, and operation.
- Raw trace incompleteness/infrastructure facts, CTA zero denominator, ToolSPL success/failure, ShortestExact, and failure-layer aggregation.
- Public input-invariant rejection plus independently pinned public exports, score/aggregate output fields, blocker text, fixture bytes, and fixture SHA.

## FORMAL_DATA_V1_1_AVAILABLE_METRIC_INELIGIBLE

The original M0 branch was created before formal Gold v2 was available. The current R04 integration now carries the exact annotated `task1-data-formal-v1.1` freeze, typed private Gold v2, Pair v2, RuntimeToolContract v2, and frozen public runtime artifacts.

This availability does not change M0 ownership: `scoreCaseChain` consumes explicitly supplied typed Gold and contracts but does not open private data, resolve the formal freeze, or emit `formalMetricEligible`. Formal eligibility remains an R04 Integration decision that must combine scorer facts with the real-chain runtime, usage, isolation, and infrastructure evidence.

## Isolation

No existing evaluator, score module, Pilot semantics, Prompt/Variant, dataset, fixture JSONL, runner, adapter, YAML, or user Codex configuration was modified. Annotated pass tagging is deferred to the root task's independent review.
