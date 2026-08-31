# Task 1 Measurement-v2 private overlay

This directory supplies the private data contract required by later
Measurement-v2 Integration. It does not complete Measurement Integration or
the real-chain gates. The provider dataset remains unchanged. Everything under
`private/` is scorer-only input and must never be serialized into a model
request.

## Frozen binding

- Formal data tag: `task1-data-formal-v2.1`
- Tag object: `6dcb766b0d9d831fe06cd45176da4d8d59cd0a78`
- Formal data commit: `a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6`
- Overlay schema: `task1.measurement-v2-overlay-manifest.v1`
- Gold schema: M0 `PrivateChainGoldV2`, `evaluationSchemaVersion: 2`
- Pair schema: M1 `PairContractV2`, `schemaVersion: "2"`

## Canonical contracts

The frozen provider data and snapshots keep the formal-snapshot v1 canonical
scheme recorded by formal-v2.1. The private overlay uses the strict shared
Measurement-v2 v2.1 helper:

- Contract: `task1.measurement-v2.canonical-json.v2.1`
- Source: `MemoryProxy/eval/tool-prompt-bench/measurement-v2/canonical-json.ts`
- Source blob: `a9fe41894fab2d5cb997a703ff11af5d99181655`
- Shared test blob: `6d10c5476956a310b6e800c6f2549dac477d4a8e`
- M1 v2.1: `task1-measure-m1-v2.1-pass` at
  `6bb57979d6a6c81b4d800995b36b4cd718be1ab5`
- M2 v2.1: `task1-measure-m2-v2.1-pass` at
  `6dfb0756c864fc470f85575965304c35a5892eca`

The overlay builder checks the exact canonical helper blobs, Measurement tags,
annotated formal-v2.1 data tag, status blob, contract and provider/snapshot
hashes before generating any artifact. Gold, Pair, invariant, runtime-contract
and overlay-manifest identities use Measurement-v2.1. Provider/snapshot
canonical identities remain formal-snapshot v1 and are labeled as such.

`private/manifest.private.json` binds the overlay to the exact provider dataset,
private annotations, snapshots, Case IDs, Pair IDs, production
`RuntimeToolContract` source revision, and every overlay file hash.

## Artifacts

- `private/gold/dev.private.jsonl`: 320 explicit Gold v2 records.
- `private/gold/hidden.private.jsonl`: 480 explicit Gold v2 records.
- `private/pairs/dev.private.jsonl`: 120 explicit Pair v2 records.
- `private/pairs/hidden.private.jsonl`: 180 explicit Pair v2 records.
- `private/runtime-contracts.private.json`: the 22 M0-compatible runtime
  contracts referenced by the Gold overlay.
- `private/approvals/pair-minimality-approval-ledger.json`: one private
  machine-readable approval ledger covering 20 Teams and all 300 Pair IDs.
- `private/manifest.private.json`: the strong binding and provider-exclusion
  contract.

No-tool Gold always has an empty `allowedSequences`. Tool-positive Gold stores
fully typed steps and never asks Integration to reconstruct steps from the
legacy shared `expectedFollowupActions` or `expectedKnowledgeCalls` fields.

Bindings are emitted only when the production response has a stable address:

- `skill_search -> skill_view_by_id` binds `skill_id` from
  `data.items.0.skill_id`.
- `skill_view -> skill_files_read` binds `skill_id` from `data.skill_id`.
- Eight prefix-filtered `tdai_scenario_ls -> tdai_read_scene` cases bind `path`
  from `data.entries.0.path`; the terminal also freezes the exact target path.

The current production `conversation/search` response exposes
`id/role/content/timestamp/score` but no `session_id` or `session_key`.
Therefore nine legacy `conversation_search -> conversation_query` cases are
explicitly scored with `conversation_search` as the terminal, with an attempt
budget of one. No `data.messages.0.session_id` path is invented and the
MemoryCore response schema is not changed for the benchmark. Knowledge
`tools/list` remains constrained by frozen operation and argument predicates.

The validator audits all 17 affected Memory cases: 9/9 conversation terminal
downgrades and 8/8 scenario bindings. Each scenario binding is exercised with a
production-shaped response and a wrong-path negative observation. The audit,
case lists, reasons, production router source commit/file SHA, error list and
strict canonical SHA are persisted in both the manifest and DS06 report.

The builder imports the exact shared M0 scorer from
`task1-candidate-base-v1` (`fa79ab94720545e1b6034b83f9b08d83ff2d6f9c`).
All 800 rebuilt Gold records must pass its input validator; the eight wrong-path
scenario traces must fail specifically at the binding layer.

`minimalityReviewStatus=approved` is not a builder default. It is emitted only
after the ledger proves that every Pair appears exactly once under its Team,
the referenced Team Gate is passed, and the Gate Git blob, source commit and
file SHA match. Missing, extra, duplicate or cross-Team approvals fail closed.
Pair independence is clustered by Team (`split:teamId`): 8 Dev clusters and 12
Hidden clusters, 15 pairs per cluster. PairExact point estimates remain per
Pair; bootstrap/CI must use these Team clusters.

## Rebuild and Gate

From `MemoryProxy`:

```powershell
.\node_modules\.bin\tsx.cmd eval\tool-prompt-bench\formal-dataset\scripts\build-measurement-v2-overlay.ts `
  --data-tag task1-data-formal-v2.1 `
  --data-commit a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6
```

The command fails closed on core/tag drift, count drift, missing runtime
contracts, endpoint drift, invalid terminal markers, Pair changes outside the
allowlist, invariant hash drift, invalid Team-cluster keys, approval-ledger
drift, frozen M0 incompatibility, or provider leakage. Its persisted-file result is recorded in
`reports/DS06-MEASUREMENT-V2-OVERLAY-VALIDATION.json`.

Passing `DS06-G01..G04` means only that the 800 Gold / 300 Pair private data
overlay contract is ready. The reserved real-chain R01-R04 gates, M0/M1/M2
Measurement Integration, and campaign evidence are still pending. Consequently:

```text
dataContractReady=true
realChainR01R04Status=pending
measurementIntegrationReady=false
formalCampaignReady=false
formalMetricEligible=false
```

Tag eligibility is explicit:

- `task1-data-core-formal-v1`: immutable data-core audit point.
- `task1-data-formal-v1`: immutable audit point only; never an Integration input.
- `task1-data-formal-v1.1`: superseded 640-case historical data contract.
- `task1-data-formal-v2.1`: current 800-case data-contract input. This still
  does not authorize a model campaign until the common-base and live R05 Gates pass.
