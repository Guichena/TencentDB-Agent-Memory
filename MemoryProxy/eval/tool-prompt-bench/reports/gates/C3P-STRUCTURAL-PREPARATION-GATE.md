# C-3P Structural Preparation Gate

## Verdict

**PASS — engineering preparation only.**

This Gate proves that the isolated C-3P branch can inventory conservative
Decision / Execution / Runtime-Binding plane candidates and validate exact
UTF-8 byte coverage without changing any provider-visible Prompt. It does
**not** prove semantic plane ownership and is not a complete `C-3P-EQ` Gate.

## Frozen inputs

- Shared infrastructure ancestor: R05
  `c86b154f9f597da0788592c66b93d574fd3f10f9`
- Method branch: `codex/task1-method-c3p-eq`
- Worktree: `D:\projects\TencentDB-Agent-Memory-task1-method-c3p-eq`
- C-3P-0 membership commit:
  `e06e66e4b83a3991794f3c3dcf165fbc7a362724`
- C-3P-1 structural byte-coverage commit:
  `27b0188253c4e8f5a73ba161e0a84b08bc913bed`
- Merge base with R05:
  `c86b154f9f597da0788592c66b93d574fd3f10f9`

R05 is reused as a read-only common infrastructure ancestor. The method is
implemented only in this independent worktree; no change is written back to
R05 or to the user's current development branch.

## Scope proved by this Gate

1. Every compiler unit receives a detached, deterministic and recursively
   frozen conservative plane-candidate membership.
2. Generic `policy`, `tool-card` and `legacy-body` units fail closed as mixed;
   they are not declared semantically exact merely because of their unit kind.
3. Structurally exact maps use UTF-8 byte offsets, reject code-point splits,
   gaps, overlaps, unknown units, duplicate partitions and planes outside the
   unit's candidate set.
4. Non-empty mixed units must structurally exercise every candidate plane;
   empty units own no provider-visible bytes.
5. Inventory identity binds compiler version, profile lineage, capability
   signature, contracts, specs, unit content and unit source provenance.
6. The inventory was exercised for all five production surfaces under all
   five compiled profiles.
7. `semanticOwnershipAttested` is deliberately and unconditionally `false`.

## Verification evidence

### Focused C-3P tests

```text
npm test -- --run src/__tests__/tool-prompt-three-plane.test.ts
Test Files  1 passed (1)
Tests       14 passed (14)
```

### Compiler regression set

```text
npm test -- --run \
  src/__tests__/tool-prompt-three-plane.test.ts \
  src/__tests__/tool-prompt-compiler.test.ts \
  src/__tests__/tool-prompt-canonical-json-shared.test.ts
Test Files  3 passed (3)
Tests       38 passed (38)
```

### Provider-visible neutrality

- The production source search finds no caller of
  `buildToolPromptPlaneInventory` or `buildToolPromptPlaneSourceMap`; only the
  tool-prompt barrel re-exports the detached helpers.
- Tests snapshot compiler content before inventory construction and prove that
  content, content hash and ordered unit bytes remain unchanged.
- No injector, pipeline, adapter, tool schema, cache marker, renderer or
  runtime configuration file is changed by this branch.
- Therefore injected bytes, injected token count, tool order and prompt-cache
  prefix are unchanged by this engineering-preparation branch.

### Type checking

`npm run typecheck` still fails on the repository's pre-existing MemoryCore,
MemoryKnowledge, handler and missing-dependency diagnostics. None of the
diagnostics points to:

- `src/injection/tool-prompt/three-plane.ts`
- `src/injection/tool-prompt/index.ts`
- `src/__tests__/tool-prompt-three-plane.test.ts`

Those unrelated baseline failures were intentionally not modified.

### Static hygiene

- `git diff --check`: PASS
- DCO `Signed-off-by`: present on both C-3P implementation commits
- `model_runs=0`
- `service_runs=0`
- `prompt_variants_changed=0`

## Explicit non-claims

This Gate does not authorize C-3P as the parent of model-visible candidates.
It does not claim:

- that a conservative candidate plane set is reviewed semantic ownership;
- that arbitrary structural partitions are semantically correct;
- that V0 through V3 have byte-for-byte, token, cache-metadata and system-block
  parity after a three-plane renderer exists;
- that any Task 1 behavior metric improved;
- that a formal model experiment was executed.

## Requirements for the complete C-3P-EQ Gate

The later complete Gate must be created only after the formal V0–V3 Dev run
freezes `STATIC-PARENT-MANIFEST`. It must then add and verify:

1. a reviewed per-unit/per-anchor semantic UTF-8 byte-span catalog with source
   provenance;
2. lint rules separating stable contracts from runtime bindings;
3. a renderer that reconstructs the exact frozen parent bytes from the three
   planes;
4. full family, surface, capability and runtime fixtures for V0, V0-C, V1a,
   V1, V2 and V3;
5. equality of system blocks, tool schema/order, injected token count,
   cache-control metadata and provider-visible bytes.

Until those conditions pass, the accurate status is:

```text
C-3P structural preparation: PASS
C-3P semantic ownership: NOT ATTESTED
C-3P-EQ complete Gate: DEFERRED
```
