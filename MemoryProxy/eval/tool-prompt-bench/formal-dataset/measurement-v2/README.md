# Task 1 Measurement-v2 private overlay

This directory closes the measurement gap left by the frozen formal-v1 data
core. The provider dataset remains unchanged. Everything under `private/` is
scorer-only input and must never be serialized into a model request.

## Frozen binding

- Data core tag: `task1-data-core-formal-v1`
- Data core commit: `418ecd102fa2019c139da9eebf88b163eca5a208`
- Overlay schema: `task1.measurement-v2-overlay-manifest.v1`
- Gold schema: M0 `PrivateChainGoldV2`, `evaluationSchemaVersion: 2`
- Pair schema: M1 `PairContractV2`, `schemaVersion: "2"`

`private/manifest.private.json` binds the overlay to the exact provider dataset,
private annotations, snapshots, Case IDs, Pair IDs, production
`RuntimeToolContract` source revision, and every overlay file hash.

## Artifacts

- `private/gold/dev.private.jsonl`: 240 explicit Gold v2 records.
- `private/gold/hidden.private.jsonl`: 400 explicit Gold v2 records.
- `private/pairs/dev.private.jsonl`: 90 explicit Pair v2 records.
- `private/pairs/hidden.private.jsonl`: 150 explicit Pair v2 records.
- `private/runtime-contracts.private.json`: the 21 M0-compatible runtime
  contracts referenced by the Gold overlay.
- `private/manifest.private.json`: the strong binding and provider-exclusion
  contract.

No-tool Gold always has an empty `allowedSequences`. Tool-positive Gold stores
fully typed steps and never asks Integration to reconstruct steps from the
legacy shared `expectedFollowupActions` or `expectedKnowledgeCalls` fields.

Bindings are emitted only when the production response has a stable address:

- `skill_search -> skill_view_by_id` binds `skill_id` from
  `data.items.0.skill_id`.
- `skill_view -> skill_files_read` binds `skill_id` from `data.skill_id`.

The current production `conversation/search` response does not expose a
`session_id`; `scenario/ls` and Knowledge `tools/list` do not guarantee the
target's array index. These steps therefore keep `bindings: []` and are scored
using their frozen terminal endpoint, operation, and exact argument predicates.
No response path is invented.

## Rebuild and Gate

From `MemoryProxy`:

```powershell
.\node_modules\.bin\tsx.cmd eval\tool-prompt-bench\formal-dataset\scripts\build-measurement-v2-overlay.ts `
  --core-tag task1-data-core-formal-v1 `
  --core-commit 418ecd102fa2019c139da9eebf88b163eca5a208
```

The command fails closed on core/tag drift, count drift, missing runtime
contracts, endpoint drift, invalid terminal markers, Pair changes outside the
allowlist, invariant hash drift, duplicate independence keys, or provider
leakage. Its persisted-file result is recorded in
`reports/DS06-MEASUREMENT-V2-OVERLAY-VALIDATION.json`.

`measurementV2Ready=true` means the data and private scoring overlay are ready
for M0/M1 Integration. It does not mean a model campaign has run. Therefore
`formalMetricEligible` remains `false` until raw trace evidence and repeat slots
are frozen by the evaluation campaign.
