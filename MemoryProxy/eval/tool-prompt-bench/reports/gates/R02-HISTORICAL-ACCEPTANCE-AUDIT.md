# R02 historical acceptance audit

- Branch: `codex/task1-r02-acceptance-v1`
- Historical implementation: `41bce09fd034c41f694f5fda5f776a09cb3efc69`
- R01 ancestor: `b7944f2ef252eb454de619382b87eb89da1ce0dc`
- Data: annotated `task1-data-formal-v1.1` → `02620d8313dcb883b7a57c4c2edc8f4286eb4bc9`
- Prompt freeze: annotated `task1-code-freeze` → `d0996809ed63f6cfc67504ad180db0d48ac70475`
- Status: `HISTORICAL_R02_ATTESTED_DOWNSTREAM_GATE_REQUIRED`
- Model, network, service, and Codex configuration changes: `0`

## Result

The historical R02 source can now be reconstructed through
`EXPERIMENT-FREEZE-MANIFEST.json`. The manifest binds the complete R02 Git tree,
the formal-v1.1 runtime freeze, the Prompt freeze, the adapter, runner, scorer,
configuration fingerprint, command set, and the acceptance overlay by Git blob
or SHA-256 identity.

This audit deliberately does **not** call historical R02 `PASSED`. The imported
D0 contract exposes one real semantic mismatch in the old evaluator:
`effectiveCall` remains true for an otherwise complete chain with an extra call.
That behavior was repaired downstream before R05. Rewriting R02 history would
make the ancestry less trustworthy, so final acceptance must rerun the same
contract on the R05-compatible common base.

## Deterministic identities

- Manifest canonical SHA-256:
  `c03ef93d1cfc1cfde0345d1e2736adac3acb44ca892eda6491b77b2c967057df`
- Command-set canonical SHA-256:
  `1bc17241369af39c9be00ad13bcedcbf909e357101cc03513ccd7f9e6c85ed57`
- R02 source tree:
  `61438c2f8d66c9fc5e8ee613964255e2f7ab6298`
- Data tag object:
  `6ba3a0e4098786882dd500f884823f2f8dfbb9d3`
- Prompt-freeze tag object:
  `edbf18309fbf100cdf5b26d64c0fbb6f12c8f3a5`

The generator fails closed unless those exact annotated Tag objects peel to
`02620d8...` and `d099680...`; it cannot silently re-sign a moved local Tag.
The manifest also encodes `candidateBaseEligible=false` and the required D0,
R05 runtime Smoke, Measurement-v2 Integration, and Selection Contract gates as
machine-readable fields.

## No-model evidence

| Check | Result |
|---|---|
| Manifest rebuild and contract tests | `3/3` passed |
| R02 tool, real-chain, and formal runner suites | `72/72` passed |
| D0 TypeScript/Vitest contract | `41/42`; one expected historical overcall failure |
| D0 Python source-tool contract | `19/19` passed |
| `git diff --check` | passed before commit |

All runs used local fixtures and frozen Git objects. No Provider request, Luna
call, production service, restore, login, logout, or Codex configuration change
occurred.

## Downstream closing condition

The common integration base must:

1. contain R05 `c86b154f9f597da0788592c66b93d574fd3f10f9` or a reviewed successor;
2. retain the repaired Measurement-v2 scorer contract;
3. expose the D0 command restored by this audit branch;
4. regenerate the experiment freeze manifest for the final common-base tree;
5. pass all 42 D0 TypeScript checks, 19 Python checks, and the final R04/R05
   no-model Gate.

Until those conditions pass together, this branch is evidence and preparation,
not `task1-candidate-base-v1`.
