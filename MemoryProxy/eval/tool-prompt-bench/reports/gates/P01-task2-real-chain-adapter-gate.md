# Gate P01 / Task 2: Real-chain Adapter

- branch: `codex/task1-real-chain-adapter`
- parent: `938b2de` (`codex/task1-p01-world-integration`)
- run date: 2026-08-29
- model calls: `0`
- status: `PASS`

## Scope

Task 2 establishes the formal evaluation seam from Codex to the production MemoryProxy path. It does not load Worlds, observe real Memory/Skill/Knowledge entry calls, run Luna, score cases, or mark any output as formal-metric eligible.

The Adapter now owns this boundary:

```text
Codex provider config
  -> /codex/{spaceId}/v1/responses
  -> Auth verify
  -> validated header Session Init
  -> production prewarm + InjectionPipeline
  -> one provider-visible <tdai_injections> wrapper
  -> configured Codex upstream
```

## Implemented contract

- `real-chain-adapter.ts` generates an ephemeral, user-config-isolated Codex invocation with the official authenticated `CODEX_HOME` left in place.
- `session-id`, `x-team-id`, `x-agent-id`, and optional `x-task-id` use the production `headerAutoSelect` path. No debug forced identity is used.
- `x-tdai-user-key` is configured only through `TDAI_EVAL_USER_KEY`; its value never enters CLI args or manifests.
- The runner does not set `developer_instructions` for TDAI content. MemoryProxy is the sole injection owner.
- The formal Adapter never sends `x-tdai-eval-mode` and never activates `mock-contract`.
- The no-model probe sends a normal Responses request into `createApp(config)` and terminates at a capture upstream. It does not render or simulate Prompt content in the test.
- Captured requests must contain exactly one TDAI wrapper. The audit surface retains injection SHA-256, `o200k_base` token count, character count, and UTF-8 byte count, plus present tool families and Session Context presence.
- Adapter-only manifests remain `formalMetricEligible=false`; World Loader and first-entry Observer are independent remaining gates.

## Verification

| Check | Result |
|---|---:|
| `npm run eval:tool-prompt:real-chain:gate` | 3 / 3 passed |
| Existing ToolPromptBench regression | 30 / 30 passed |
| Existing World runner regression | 4 / 4 passed |
| Existing ToolPrompt Compiler regression | 20 / 20 passed |
| `git diff --check` | passed |
| Full TypeScript check | 54 pre-existing errors |
| Task 2 files matched by TypeScript errors | 0 |

The production-chain test observed Auth verify, Team/Agent/Task list and detail reads, capability lookup, Skill listing, per-Agent Knowledge bindings, Knowledge detail loading, all enabled production Memory/Skill/Knowledge injectors, and exactly one upstream request. The captured wrapper contained all three tool families. The provider bearer reached the upstream; `x-tdai-user-key` and `x-tdai-eval-mode` did not.

## Gate decision

Task 2 passes. The real-chain Adapter seam is ready for the separate World Loader task. Formal P01 remains incomplete, and no Luna campaign may start from this Gate alone.
