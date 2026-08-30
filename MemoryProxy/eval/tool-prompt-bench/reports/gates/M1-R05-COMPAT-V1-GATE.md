# M1 → R05 compatibility Gate v1

## Conclusion

**No-model compatibility Gate: PASS.**

The compatibility merge preserves the M1 Pair Contract v2 schema, validator,
scorer, canonical evidence contract, synthetic fixture, and public tests while
retaining the complete R05 formal runner and production asset-adapter runtime.
It does not run a model, start a service, contact a provider, install a
dependency, or read or modify Codex authentication/configuration.

This Gate does not claim that M1 formal data is ready, and it does not replace
the still-unrun R05 blank-stack production Smoke.

## Frozen ancestry

| Item | Value |
|---|---|
| Branch | `codex/task1-measure-m1-r05-compat-v1` |
| Worktree | `D:\projects\TencentDB-Agent-Memory-task1-measure-m1-r05-compat-v1` |
| Merge base | `2dc7bc8b57442d2beae62efd5d570a83955b374d` |
| First parent (M1 v2.1) | `6bb57979d6a6c81b4d800995b36b4cd718be1ab5` |
| Second parent (R05) | `c86b154f9f597da0788592c66b93d574fd3f10f9` |
| Merge form | explicit non-squash, two-parent merge commit |
| Model runs | `0` |

The original M1 and R05 branches, worktrees, and commits remain untouched.

## Merge audit and compatibility decision

The parents are divergent: neither parent is an ancestor of the other. The M1
side changes eight paths from the merge base; R05 adds the formal data/runtime,
measurement, runner, and production adapter lineage. Only two paths are changed
on both sides:

- `measurement-v2/canonical-json.ts`
- `src/__tests__/tool-prompt-canonical-json-shared.test.ts`

For each overlap, the M1 and R05 Git blobs are byte-identical. The explicit
merge therefore completed without a textual or semantic conflict and required
no conflict-resolution edit. R05 has no M1 `pair-contract.ts`, `pair-scorer.ts`,
M1 fixture, manifest, Gate, or pair test, so those paths are retained directly
from the M1 parent. All R05 production runtime paths are retained directly from
the R05 parent.

The compatibility-only test hashes an M1 invariant through R05's
`formal-runtime/canonical.ts` seam and proves that the M1 validator accepts the
resulting approved pair. This exercises the shared runtime boundary rather than
only asserting that both files exist.

No compatibility resolution changes Prompt, Variant, Gold, query, frozen
formal data, runner behavior, production transport, adapter, auth, or config.

## Verification

| Gate | Result |
|---|---|
| Narrow M1/R05 canonical-validator seam | 1 file, `1/1` passed |
| M1 focused pair/canonical/compatibility tests | 3 files, `127/127` passed |
| Complete Measurement-v2 suite with its dedicated config | 5 files, `75/75` passed |
| R05 restore/import/inspect/preflight combination | 14 files, `79/79` passed |
| R03 real-chain regression | 7 files, `61/61` passed |
| Formal evaluation preparation regression | 10 files, `33/33` passed |
| Existing tool-prompt evaluator regression | 1 file, `31/31` passed |
| Targeted strict TypeScript for M1, shared canonical, and compatibility test | PASS |
| Parent-blob audit | M1 `8/8`; R05 `240/240` byte-identical |
| Compatibility diff check relative to R05 | PASS |

The first attempt to select Measurement-v2 files through the repository-root
Vitest config intentionally counted as a failure because it collected zero
tests. The suite was rerun with
`eval/tool-prompt-bench/measurement-v2/vitest.config.ts` and executed all 75
tests. The legacy evaluator's fixed five-second Git fixture test timed out only
while several suites were running concurrently; its isolated rerun passed all
31 tests in 4.21 seconds.

The targeted strict TypeScript command covered M1 `canonical-json.ts`,
`pair-contract.ts`, `pair-scorer.ts`, R05 `formal-runtime/canonical.ts`, the
shared canonical test, the M1 pair test, and the new compatibility test. The
repository-wide typecheck baseline is outside this compatibility Gate; R05's
existing Gate records its known unrelated diagnostics.

The first-parent `git diff --cached --check` reports only the inherited trailing
blank line at the end of
`reports/gates/R05-PRODUCTION-ASSET-ADAPTER-GATE.md`. That index blob is exactly
the frozen R05 parent blob and is deliberately not repaired in this merge.
`git diff --cached c86b154... --check`, which covers the M1 and
compatibility-authored delta relative to R05, passes with no whitespace error.

## Isolation and remaining Gates

- No model or provider request was issued.
- No MemoryCore, MemoryKnowledge, MemoryProxy, Docker, or Langfuse service was
  started.
- No Codex auth file or user configuration was read, copied, edited, or
  replaced.
- No dependency was installed. The isolated worktree uses an ignored local
  junction to an already installed dependency tree; the junction is not part
  of the commit.
- M1 remains `FORMAL_DATA_BLOCKED` until formal pairs satisfy the frozen M1
  validator/evidence contract. This merge does not publish PairExact results.
- R05's dedicated blank-stack V0 production Smoke remains unrun. This code Gate
  does not claim runtime production readiness.
- A later Integration branch must merge this compatibility commit without
  squashing so both reviewed parent ancestries remain auditable.
