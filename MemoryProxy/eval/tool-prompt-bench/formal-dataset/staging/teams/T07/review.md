# T07 Sol Review

- Status: PASSED
- Team: T07 SDK and Integration Engineering
- Cases: 40 (15 positive, 15 paired no-tool, 10 natural no-tool)
- Positive families: Memory 6, Skill 6, Knowledge 3
- Search/discovery first routes: 10; direct first routes: 5
- Pair context buckets: short 3, medium 9, long 3
- Skill pool: 16 real GitHub packages; 6 bound/listed; 10 unbound same-Team searchable
- External imports: 16, pinned to github/awesome-copilot f11a4e441c5ff061b4f8ae37952be8c602e4034e, MIT
- Memory density: 10 L0 sessions / 16 L1 / 4 L2 / 1 L3
- Knowledge: 3 ready synthetic fixtures with fixed read-only tool lists

## Sol decisions

Every accepted positive has one unique first route and a complete minimal sequence. Listed Skill targets are bound to the active agent; search targets are unbound and owned by same-Team asset agents. The resource-read case obtains references/typescript.md only after the Graph package manifest. Memory search targets are absent from current context and L3; the scenario-list target is not injected while the direct scene path is injected. Knowledge cases use exact workspace/repository matches against three simultaneously bound resources. Paired negatives retain identity, workspace, snapshot, shared messages and query, changing only the appended delta. Natural negatives remain self-contained under the full 50-asset distractor set.

Raw and adapted Skill package bytes are identical; the only accepted adaptation is neutral formal listing metadata (description/useWhen/doNotUseWhen), so every adaptation.diff is intentionally empty. No upstream dependency was installed and no upstream test or official patch was used.

## Local verifier evidence

The Team-local formal contract validator passed all 40 hidden cases with zero pair-integrity, provider-leakage, invalid-sequence, or missing-source-reference errors. The dependency-free source-tools Python suite passed 19 tests. The host Vitest suite could not start because this isolated worktree has no host node_modules; no dependency or link was added outside the authorized T07 paths, so integration must rerun that suite in its prepared environment.

## Integration follow-up

The integration task must run cross-Team Dev/Hidden n-gram, sentence, query-hash and context-hash duplicate checks, then regenerate the hidden snapshot and sealed manifest. This Team-local Gate does not freeze Hidden globally.
