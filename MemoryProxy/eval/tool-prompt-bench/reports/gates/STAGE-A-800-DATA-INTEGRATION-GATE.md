# Stage A 800-case data integration gate

## Decision

**PASS for Stage A freeze.** The frozen `formal-v2.1` data facts are integrated into the candidate common base by path ownership. The strict 800-case contract, deterministic rebuild, candidate regression, and protected-path gates pass. This decision does not claim that the Stage B overlay, runtime, restore, Smoke, or live preflight work is complete.

No model was called. No Docker, MemoryCore, MemoryKnowledge, MemoryProxy, or Langfuse service was started, and no real-service asset was imported.

## Execution identity

| Item | Value |
| --- | --- |
| Worktree | `D:\projects\TencentDB-Agent-Memory-task1-common-base-formal-v2.1-stage-a` |
| Branch | `codex/task1-common-base-formal-v2.1-stage-a` |
| Initial and base HEAD | `fa79ab94720545e1b6034b83f9b08d83ff2d6f9c` |
| Candidate annotated tag | `task1-candidate-base-v1` |
| Candidate tag object | `22a044b27198a4e006edd1702b2e60b92c7edf51` |
| Candidate peeled commit | `fa79ab94720545e1b6034b83f9b08d83ff2d6f9c` |
| Data annotated tag | `task1-data-formal-v2.1` |
| Data tag object | `6dcb766b0d9d831fe06cd45176da4d8d59cd0a78` |
| Data peeled commit | `a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6` |
| Common historical merge-base | `2dc7bc8b57442d2beae62efd5d570a83955b374d` |
| DS09 data content commit | `4144bdbd3954f473e800465ab0cb9c75ea418128` |
| Frozen status blob | `7a262b13836fd843637e74312ca5b6c9b7e43396` |
| Frozen normalized status SHA-256 | `acd98947d3892047c9479287325bb502a0a892c2710c5e248c86968c0dcf22cc` |
| Node / npm | `v24.16.0` / `11.13.0` |
| Initial `git status --short` | empty |

The two annotated-tag objects, peeled commits, status blob, normalized status hash, and merge-base were verified before the worktree was created. No branch merge or whole-commit cherry-pick was used.

## Path ownership and integrated files

The read-only pre-integration inventory contained 1,846 tracked path changes: 1,842 additions and four modifications. The modified paths were the frozen status, `registry/space.json`, the validator, and the registry test.

The data-facts commit integrates 1,844 exact data-owned paths:

| Data-owned group | Paths |
| --- | ---: |
| `.gitattributes` formal-v2 EOL/binary rules | 1 |
| `DATASET-BUILD-STATUS.json` | 1 |
| `generators/` | 689 |
| `registry/` | 10 |
| DS07/DS08/DS09 reports | 7 |
| `revisions/formal-v2/` | 6 |
| `scripts/integrate-formal-v2.ts` | 1 |
| `source-material/` | 1,033 |
| `staging/` | 96 |
| **Total** | **1,844** |

The two semantic-merge paths are:

- `formal-dataset/scripts/validate-formal-dataset.ts`: adds the formal-v2 20-Team contract, 800/320/480/300 counts, undefined-safe pair comparison, and fail-closed local source-byte SHA-256 validation while retaining the candidate formal-v1 Gate. The semantic result is byte-equivalent to the data-tag validator.
- `src/__tests__/formal-dataset-registry.test.ts`: adds T17-T20, formal-v2 full/count-drift coverage, and `integrate-formal-v2.ts` while retaining the candidate `build-formal-restore-plan.ts` inventory and R05 `--output` plus `flag: "wx"` create-new evidence assertions.

Exact-data audit after the semantic merge reports zero drift across every data-owned path, including the validator. The final registry test differs from the data tag only by the intentionally retained candidate-owned R05 coverage.

## Candidate-owned protection

The following candidate-owned surfaces were compared with `task1-candidate-base-v1` after integration and have zero changed paths:

- `formal-assets/`
- `formal-runtime/`
- root-level `restore-formal-snapshot.ts` and `inspect-formal-snapshot.ts` remain absent, as in the candidate base
- `evaluator.ts`
- `codex-runner.ts`
- `measurement-v2/`
- `package.json` and `package-lock.json`

The complete changed-path allowlist reports 1,846 expected tracked paths and zero unexpected paths. Runner, scorer, usage, cache, isolation, and real-chain code were not modified.

Candidate ownership is required because the data branch carries older restore, inspect, package-script, evaluator, and runner surfaces that would remove or overwrite R03, R05, the formal runner, and shortest-sufficient-chain regressions.

Historical `formal-dataset/measurement-v2/`, root-level `provider/`, root-level `snapshots/`, and `registry/contracts/formal-v1.json` remain present for history and compatibility. They are not declared to be the current formal-v2.1 overlay or runtime input. No old root restore/inspect entry point, old Pilot World, root parallel-prompts package, old Codex runner, or old package script was imported.

## Strict validation

| Scope | Teams | Cases | Pairs | Valid | Pair errors | Freeze errors | Provider leakage | Invalid sequence | Missing source ref |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Dev | 8 selected of 20 | 320 | 120 | yes | 0 | 0 | 0 | 0 | 0 |
| Frozen Holdout | 12 selected of 20 | 480 | 180 | yes | 0 | 0 | 0 | 0 | 0 |
| Full | 20 | 800 | 300 | yes | 0 | 0 | 0 | 0 | 0 |

Full distribution also remains fixed at 120 Memory positives, 120 Skill positives, 60 Knowledge positives, 300 paired negatives, and 200 natural coding negatives.

Canonical provider hashes:

- Dev: `2b4d0645d8111699f7a6a06d4fb387b767122037b2c813583fe393068dbcde10`
- Frozen Holdout: `34e01c72495d4617ff8951d2c4b0b2a574b9dabc9b621fcd5385bb27c4699566`
- Full: `813301956cd33099aa675b4d81ccf53139ac2f3827162f0323512b1b9be4dd64`

The frozen status remains Git blob `7a262b13836fd843637e74312ca5b6c9b7e43396`; the CRLF/LF-normalized working-tree content remains SHA-256 `acd98947d3892047c9479287325bb502a0a892c2710c5e248c86968c0dcf22cc`.

## Deterministic reconstruction

`integrate-formal-v2.ts` was run independently into two temporary contract directories. Each contract was then compiled for Dev and Frozen Holdout. The two runs had identical relative filenames, byte counts, and SHA-256 values. Every run-1 artifact also matched the frozen official artifact byte-for-byte.

| Canonical artifact | Bytes per run | SHA-256 |
| --- | ---: | --- |
| `contract/formal-v2.json` | 7,403,821 | `0d398c9e4c46b60f86f245265769062b9ede2ffdf53a80088fe0421fdd797d9d` |
| `artifacts/provider/dev.jsonl` | 488,714 | `b062d284cb849edd6504340e81f4f34e1dc37b126dca53edab6062749b1c2ed4` |
| `artifacts/provider/hidden.sealed.jsonl` | 708,169 | `0a38a9433761adaf286b00a62b2bbda6526c41ab83dcad844b0f7b83929118fc` |
| `artifacts/snapshots/dev/scorer-gold.private.jsonl` | 280,067 | `bbe6fa20aa46a00d484e5d22e5b9c2a8b4d8afb42fb4205de2e459541d25cf1c` |
| `artifacts/snapshots/dev/snapshot-input.json` | 21,358 | `3ae4b58c1ece2e871a9e4eec4ffafc18807a98b15ac080fd2c6b5a360faa9fb0` |
| `artifacts/snapshots/hidden/scorer-gold.private.jsonl` | 464,293 | `859ba15c0b50f96d34844f415e411e444283a9cf83948e12bf0636b7204a9723` |
| `artifacts/snapshots/hidden/snapshot-input.json` | 39,779 | `d2014bc57f5235fad86c1a3155604526c7b4a21b554ee144335c7faa38fc73bc` |

The reconstructed contract canonical SHA-256 is `eb04b26cfe03810030f6b7d0a06f82dfedf7c8011ce11bb181db8af0b94b58b7` in both runs.

## Regression and type gates

| Gate | Result |
| --- | --- |
| D0 Vitest | 8 files, 46/46 tests passed |
| D0 Python source-tool tests | 19/19 passed |
| Tool-prompt contract | 31/31 passed |
| Explicit registry regression | 7/7 passed; formal-v2 and retained R05 assertions both executed |
| Full repository typecheck | exit 2 with 113 parent-base error lines |
| Typecheck filter for Stage A validator, integration script, and registry test | 0 error lines |
| Candidate-protected path audit | 0 changed paths |
| Data-owned exact-path audit | 0 changed paths |
| Changed-path ownership audit | 0 unexpected paths |

The full typecheck result was captured before filtering at `.stage-a-validation/typecheck-full.log`. Its failures are the parent-base dependency/type errors, beginning in MemoryCore and MemoryKnowledge; none reference a Stage A changed TypeScript file. The temporary log is not a release artifact.

### Whitespace-check source conflict

The standard pre-commit `git diff --check` passed before each authored commit, and the staged semantic-code check passed. A stronger whole-range diagnostic (`git diff <candidate>..HEAD --check`) reports trailing whitespace and blank final lines inside byte-frozen upstream source snapshots and construction records imported from the data tag. Editing those paths would break local source hashes and violate the frozen path-ownership contract. The chosen resolution is therefore to preserve those bytes, keep strict source-hash validation enabled, record this conflict explicitly, and require the final clean-tree `git diff --check` to pass. No provider, pair, source, split, count, or tool-sequence rule was weakened.

## Stage B handoff

The following work is intentionally incomplete and must remain serially after this Stage A freeze:

- build and freeze the 800-case Measurement-v2 private Gold/Pair overlay;
- update formal-v2.1 overlay/provider bindings and provider loader identity;
- build runtime bindings and the runtime freeze;
- update restore-plan and asset-restore contracts where Stage B requires them;
- complete Smoke, live preflight, and any real-service asset verification;
- run any model campaign only after the Stage B gates pass.

Stage A does not modify `formal-runtime/freeze.ts`, the provider loader, overlay builder, bindings, runtime freeze, restore plan, or Smoke contract.
