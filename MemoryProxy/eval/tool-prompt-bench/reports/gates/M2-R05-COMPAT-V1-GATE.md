# M2 → R05 compatibility Gate v1

## Conclusion

**No-model compatibility Gate: PASS.**

This merge preserves M2 token/cache/isolation measurement contracts and the
R05 production runner/asset-adapter path without changing either parent branch.
It does not run a model, start a service, contact an upstream provider, or read
or modify Codex authentication/configuration.

## Frozen ancestry

| Item | Value |
|---|---|
| Branch | `codex/task1-measure-m2-r05-compat-v1` |
| Worktree | `D:\projects\TencentDB-Agent-Memory-task1-measure-m2-r05-compat-v1` |
| First parent (M2 v2.1 PASS) | `6dfb0756c864fc470f85575965304c35a5892eca` |
| Second parent (R05 PASS) | `c86b154f9f597da0788592c66b93d574fd3f10f9` |
| Merge form | non-squash, two-parent merge commit |
| Model runs | `0` |

The containing commit is the compatibility merge identity. The original M2 and
R05 worktrees and branches remain untouched.

## Conflict decisions

### `measurement-v2/index.ts`

Both parents independently created the same path. The integrated barrel now
exports:

- M2 provider usage, request-usage, token, cache/isolation, eligibility, and
  canonical-JSON contracts; and
- R05's M0 chain scorer and aggregate plus their public types.

A direct combined barrel invalidated the frozen M0 artifact manifest because
its runtime surface expanded from two functions to the M2 exports as well.
`m0-index.ts` therefore preserves the independently reviewed M0 public seam:
exactly `scoreCaseChain` and `aggregateCaseChainFacts` at runtime. The M0
interface manifest and artifact test point to that narrow entrypoint, while the
integrated `index.ts` remains the composite Measurement-v2 API.

### `src/codexHandler.ts`

The only textual conflict was the import location. The resolution keeps both
behaviors unchanged:

- M2 rethrows `InjectionInfrastructureError`, so metadata/cache-contract loss
  cannot silently forward an uninjected provider request; and
- R05 keeps the optional `ProviderRequestObserver` request/completion stream,
  provider usage extraction, safe header selection, hashing, and fail-open
  observer isolation.

## TDD record

### RED

1. The unresolved add/add and import conflicts caused the M2 public API and
   real-chain suites to fail during transform on conflict markers.
2. After mechanically combining both barrels, the frozen M0 artifact test
   failed `1/1`: it expected two runtime exports but observed the expanded
   integrated M2 surface. This established the need for a separate narrow M0
   seam instead of weakening the manifest assertion.

### GREEN

| Gate | Result |
|---|---|
| Complete Measurement-v2 suite | 5 files, `75/75` passed |
| M2 ledger + real-chain compatibility seams | 2 files, `56/56` passed |
| R05 production restore/import/inspect/preflight combination | 14 files, `79/79` passed |
| R03 real-chain regression | 7 files, `61/61` passed |
| Formal evaluation preparation regression | 10 files, `33/33` passed |
| Provider-request usage + shared canonical JSON | 2 files, `8/8` passed |
| Measurement-v2 strict TypeScript check | passed |
| Compatibility diff check relative to R05 (`git diff --cached c86b154... --check`) | passed |

The repository-wide TypeScript check still reports the pre-existing
MemoryCore/MemoryKnowledge dependency and type baseline plus existing
session/config/handler diagnostics. It reports no diagnostic in the new
`m0-index.ts`, combined Measurement-v2 barrel, manifest, or compatibility test;
the existing `codexHandler.ts` diagnostics do not occur at either compatibility
line.

The inherited R05 Gate Markdown is byte-identical to its `c86b154` blob. Its
historical trailing blank line is deliberately not repaired here; a global
first-parent diff check can therefore repeat that inherited warning, while the
R05-relative compatibility diff check above is clean.

## Isolation and remaining runtime Gate

- No model or provider request was issued.
- No MemoryCore, MemoryKnowledge, MemoryProxy, Docker, or Langfuse service was
  started.
- No Codex auth file or user configuration was read, copied, edited, or
  replaced.
- No dependency was installed; the worktree used a local junction to the
  already installed dependency tree, which is ignored and not committed.
- R05's blank-stack V0 production Smoke remains unrun and is not claimed by
  this code Gate.
- A later Integration branch must merge this compatibility commit without
  squashing so both reviewed parent ancestries remain auditable.
