# Stage B2 800-case runtime freeze gate

## Decision

**READY_FOR_USER_LIVE_PREFLIGHT.** The formal-v2.1 800-case public base,
Measurement-v2 private overlay, 800 runtime bindings, 40-case Smoke v2
preregistration, restore-plan contract and R05 preparation path are aligned and
all offline Gates pass.

This is not a model result and does not make the base formally eligible. The
candidate manifest intentionally remains `status=awaiting-r05` and
`modelRunsAtFreeze=0`. The next state-changing step is the user-operated R05
blank-stack `Restore`, followed by `Inspect -KnowledgeReadyConfirmed` after the
Knowledge code graphs are ready.

No model case was run. No Docker service was started. No asset was restored.
No Codex login, endpoint, persistent configuration or external system was
changed while closing this Gate.

## Frozen input identity

| Item | Value |
| --- | --- |
| Stage A tag | `task1-common-base-formal-v2.1-stage-a-v1` |
| Stage A tag object | `c316e01b804d2e47cfa315a44f7e0586ed356f60` |
| Stage A peeled commit | `a22cebd5cf58c1502bb47687a5955dae9f80f7b4` |
| Data tag | `task1-data-formal-v2.1` |
| Data tag object | `6dcb766b0d9d831fe06cd45176da4d8d59cd0a78` |
| Data peeled commit | `a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6` |
| Status blob | `7a262b13836fd843637e74312ca5b6c9b7e43396` |
| Normalized status SHA-256 | `acd98947d3892047c9479287325bb502a0a892c2710c5e248c86968c0dcf22cc` |

Both annotated data identities are verified by the builders before reading the
frozen data.

## Resolution of the former counterfactual blocker

The old Smoke requirement incorrectly made counterfactual-type diversity a
hard Gate. Task 1 requires correct tool/no-tool and tool-family decisions; it
does not require a particular distribution of diagnostic labels. The frozen
300 Pairs intentionally use `answer_in_current_context`, and no post-hoc labels
were inferred or added.

Smoke v2 therefore freezes eight actual Pair counterparts with the required
family allocation of three Memory, three Skill and two Knowledge negatives.
The frozen Pair content, controlled delta and private Gold remain unchanged.

Repository/version mismatch is retained as a future auxiliary diagnostic:

- if mismatch is visible in the input, the expected decision is no call;
- if mismatch can only be discovered through Knowledge list/search, the
  shortest discovery chain is allowed and must stop once mismatch is known;
- no such label is retrofitted onto the current 800 cases.

## Frozen cardinalities and coverage

| Artifact | Full | Dev | Hidden |
| --- | ---: | ---: | ---: |
| Provider cases / private Gold | 800 | 320 | 480 |
| Pair v2 | 300 | 120 | 180 |
| Teams | 20 | 8 | 12 |

Additional frozen counts:

- 22 runtime contracts;
- 800 public case bindings;
- 40 Smoke cases across eight Dev Teams;
- 300 positives, 300 paired no-tool negatives and 200 natural coding
  negatives;
- Memory/Skill/Knowledge positives: 120/120/60;
- provider leakage: 0;
- Pair validation errors: 0;
- M0 Gold input validation: 800/800, errors 0;
- all 22 runtime contracts are referenced by at least one case.

Two frozen cases, `T17-MEM-05-P` and `T17-MEM-05-N`, have no `difficulty`
label. They are reported as `unlabeled`; difficulty is not a Task 1 scoring
input and was not invented after freeze.

## Deterministic identities

Overlay generation, runtime-freeze generation and coverage generation were
each executed twice with stable output.

| Artifact | Canonical SHA-256 |
| --- | --- |
| Gold v2 full | `0f57a9b87d6c6a044fcb627e75c701fb63e90d1fce47a22be011b200b54635fe` |
| Pair v2 full | `b99596e3f60da8dc2b9080c7b218ca48829347ed13f73a25a7a853147a4ac85d` |
| Runtime contracts | `3bd16cf3563711ce08df9da9d71d52db8dffdc200715265b6812961d63dc73d1` |
| Private overlay manifest | `a9756066d59ea2a972fb48910bf8099fd218a4541bf8451393114cd5feeb13bc` |
| Pair approval ledger | `143053f23b41d67c7b6993c180b5e7337970dadbfe82063581a15b5bde00fb83` |
| Case bindings | `3e2886a8fa0c63f380f875410e0de7628f03a5f94b214ee81f0ace647e03cdd5` |
| Smoke selection | `523788fad4c50750049ea8efb53e9c4ce43d43d0b05de8696fd403e7efd68bee` |
| Runtime freeze | `64c86aa6743714514b4e27384308bd3afc8e073be93c2fd23c11e1d600317854` |
| Coverage matrix | `54507c9d709e81db8f6b4faed18e2af70cdf965080547648b43ccd598094cae3` |
| Selection Contract | `5dca2bf5df8cf0f1d6de1284934ed6c754ba4ff980ce7d59fc9ec576f25314f9` |
| Provisional candidate manifest | `8967296f3c21b43b092e5d9e1c0b3b4749842baff2f8a4d170632cb890b7d21e` |

Exact-file SHA-256 values used by public loaders:

- runtime freeze: `69480e56ae6281711c926fda743a38c7ff9d76874f94e19a0e430b5d9a9596e4`;
- coverage JSON: `de95b7df1741acf6784a34df39cbb94f428b0a9df04606722f3138ef4d7be1f5`;
- coverage Markdown: `d3a281e4c321799e4bcb2f143832529f9fdd2d4e29572b4d0c5efebc73b94361`;
- provisional candidate manifest: `4987e3bf5b7549cf81055c65e0166a0f6fdc6d530ff1b1dc5cdbb45dda9d2222`.

## R05 public preparation contract

The Dev Gold-blind restore plan is derived from public bindings only:

| Field | Frozen value |
| --- | --- |
| `planSha256` | `e8babf994edb93fbbc71f5e3ef8450536df3367b17003d279a11a7d5619c4bb4` |
| Actions | 432 |
| Requirements | 285 |
| Assets | 386 |

The public wrapper is frozen to `task1-data-formal-v2.1`, Node.js 22 and the
exact 40-case ordered Smoke selection. `Restore` prepares 40 V0 manifests but
does not invoke Luna. `Inspect` reuses the same run root and requires explicit
user confirmation after asynchronous Knowledge indexing is ready.

## Offline Gate evidence

The final command `npm run eval:tool-prompt:integration:gate` exited 0 on
2026-09-01 and covered:

| Gate | Result |
| --- | --- |
| D0 TypeScript | 46/46 |
| D0 Python | 19/19 |
| Tool Prompt bench | 31/31 |
| Selection/Pair/collector integration | 192/192 |
| Measurement-v2 | 116/116 plus focused `tsc` |
| R05 | 96/96 |
| R03 | 63/63 |
| Formal runtime | 34/34 |

The large repository-wide TypeScript check is not used as this Gate because it
contains previously recorded unrelated baseline errors. The focused
Measurement-v2 type check and every changed execution-path test pass.

## Next user-operated step

Follow `R05-PRODUCTION-ASSET-ADAPTER-RUNBOOK.md` on the exact committed
common-base revision:

1. use Node.js 22 and a clean code worktree;
2. use a clean read-only checkout whose HEAD is
   `task1-data-formal-v2.1^{commit}`;
3. start the dedicated blank local MemoryCore, MemoryKnowledge and MemoryProxy
   stack with the read-only V0 configuration;
4. run `run-r05-runtime-preflight.ps1 -Stage Restore` once;
5. wait for all visible code graphs to reach `ready`;
6. rerun the same command with `-Stage Inspect -KnowledgeReadyConfirmed` and
   the same `RunRoot`;
7. do not run a model until the resulting receipt is accepted and the exact
   commit is tagged as the candidate base.
