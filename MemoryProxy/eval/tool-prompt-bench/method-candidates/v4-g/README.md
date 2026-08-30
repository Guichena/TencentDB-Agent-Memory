# V4-G Typed Action Graph

This directory is isolated from the frozen `variants/c00` through `variants/c05`
and `variants/code-freeze` trees.

- `V4-G1` / `typed-action-graph` adds the deterministic typed action graph to
  V3 without removing existing handoff wording.
- `V4-G2` / `typed-action-graph-deduplicated` inherits G1 and replaces only the
  handoff wording precisely represented by graph edges.

The capture uses the C05 full-readonly canonical input and `o200k_base`. It
first requires current V3 injection bytes, authoritative full-injection tokens,
static-component tokens, and SHA-256 to match the frozen C05 artifact. Each V4-G
candidate is then rendered independently twice; injection bytes, block hashes,
and token counts must agree before artifacts are written.

`artifacts/g1-to-g2-diff.json` is the exhaustive G2 replacement inventory and
records its token/hash delta from G1. Rendering fails if any listed source
phrase occurs other than exactly once on its owning family surface.

Run from `MemoryProxy`:

```powershell
npm run eval:tool-prompt:capture-v4-g
```

These artifacts contain static compiler evidence only. No model is invoked and
no ECR, FCR, TSR, PairExact, or other behavior claim is produced.
