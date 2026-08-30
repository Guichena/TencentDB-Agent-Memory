# Gate R01: Formal Real-chain Adapter

- branch: `codex/task1-real-chain-adapter-v1`
- base tag: `task1-c07-pass`
- base commit: `2dc7bc8b57442d2beae62efd5d570a83955b374d`
- freeze-metadata correction: `fd23e230b3b9ef66838f82c18673496535b966cc`
- run date: 2026-08-30
- model calls: `0`
- formal dataset cases loaded: `0`
- `formalMetricEligible`: `false`
- status: `PASSED`

## Decision

R01 passes its two no-model gates. The Adapter now reaches the production Session Init, prewarm, InjectionPipeline, Memory bridge, Skill bridge, and Knowledge tools request boundaries while keeping model attempts, actual entry calls, HTTP rejections, infrastructure failures, timeouts, and non-TDAI responses as separate facts.

This Gate proves the software boundary and stopping contract only. It does not prove that a model will call a tool, select the correct tool, complete a minimum sufficient chain, or improve any Task 1 metric.

## Implemented boundary

### Gold-blind runner input

- The Adapter accepts normalized identity, ordered conversation history, and final query without importing a World, split, private Gold, Pair contract, asset answer, or scorer.
- The official Codex CLI's single initial prompt is represented as a versioned user-plane envelope that preserves the ordered history and final query bytes. TDAI instructions are not added by runner developer instructions.
- Auth state remains outside manifests and CLI arguments. Evaluation HOME, USERPROFILE, and SQLite state are isolated; the Adapter contract keeps every pre-formal manifest ineligible.
- Codex JSONL parsing preserves malformed and unknown events instead of silently converting them into successful behavior.

### Production injection path

The no-model probe follows this path and stops at a capture upstream:

```text
Session Init
  -> production prewarm
  -> production InjectionPipeline
  -> exactly one <tdai_injections> wrapper
  -> capture upstream
```

Repeated injection for the same session produced identical wrapper SHA-256, token count, character count, and UTF-8 byte count. Prewarm fetched each enabled asset path once and did not refetch it for the repeated request.

### Actual entry observation

- Memory and Skill share one optional observer dependency injected by `MemoryProxy.createApp`. Each handler observes the actual `Request` at its first executable line, before path, header, session, or body validation.
- Knowledge has an equivalent optional observer at the separate `MemoryKnowledge` `/v3/tools/list` and `/v3/tools/call` production route boundary. `MemoryKnowledge.createApp` passes the dependency through while preserving the no-argument production default.
- With no observer, production handlers do not clone or read the body. Observer and clone failures are fail-open and cannot change the route response.
- Evidence is recursively frozen and contains only the actual path, method, parsed or raw body, generated correlation id, family, and an explicit correlation-header allowlist. Authorization and `x-tdai-user-key` are excluded.
- The replay executor no longer signs its own Memory, Skill, or Knowledge receipt. A response without a production callback receipt is classified as infrastructure evidence and cannot produce `tdai_entry` or `tdai_accepted`.

The production seam files extend the initial R01 file allowlist because an Adapter-only receipt cannot satisfy R01-B's actual-entry requirement. They are optional dependency-injection seams with no default production behavior change; no Prompt renderer, Variant map, persistent config, or asset content was changed.

## Event and stopping contract

The append-only ledger distinguishes:

```text
TDAI_ATTEMPT
MALFORMED_TDAI_ATTEMPT
ENTRY_CALL
NON_TDAI_RESPONSE
INFRASTRUCTURE_ERROR
TIMEOUT
```

- Canonical tools are resolved from the observed family, method, and actual endpoint through `RuntimeToolContract`; caller-supplied tool names cannot override them.
- A valid receipt plus 2xx records entry and accepted facts.
- A valid receipt plus 4xx records entry and factual rejection; later Measurement code owns behavioral classification.
- A valid receipt plus 5xx records entry and infrastructure failure.
- Network failure, timeout, or any response without a valid receipt cannot invent an entry.
- No-tool evaluation stops at the first TDAI attempt or the first substantive non-TDAI response. Earlier infrastructure facts are retained but are not behavior stopping points.
- Raw events remain intact; the evaluation prefix is derived separately.

## Verification

| Check | Result |
|---|---:|
| `npm run eval:tool-prompt:real-chain:gate` | 11 / 11 passed |
| `npm run eval:tool-prompt:test` | 31 / 31 passed |
| `npm run eval:tool-prompt:capture-freeze` | passed |
| Memory/Skill/Knowledge actual-entry and negative-receipt cases | passed |
| New observer targeted TypeScript diagnostics | 0 |
| `git diff --check` | passed |
| Full MemoryProxy TypeScript check | 54 pre-existing diagnostics |
| Model, container, network, or auth mutation | 0 |

The two `memory-bridge.ts` `agent_source` diagnostics also occur at the R01 base and are outside the changed hunks. The remaining full-check diagnostics are the previously recorded handler/session/storage baseline. MemoryKnowledge has no installed package-local `node_modules` in this worktree, so its package-wide `tsc` command was not installed or run; the real Knowledge route and new observer were compiled and executed by the R01 Vitest gate.

## Freeze evidence

`capture-freeze` exposed six old stage-report hashes that could not be reproduced from their recorded Git commits. The separate correction commit now hashes each C00-C05 Gate from the immutable blob at its recorded `tagCommit`, with an LF/CRLF regression. Only the six `stageInventory.gateSha256` values were repinned. All six Variant prompts, injection blocks, profile mappings, token counts, UTF-8 bytes, content hashes, and stable-prefix fields remain unchanged.

## Explicit non-claims and next gate

- No Luna or other model was called.
- No formal-v1.1 provider case or private Gold was loaded.
- No ECR, false-call rate, tool-selection accuracy, chain completion, token-effect, cache-effect, or Pair score was calculated.
- No adapter fixture, replay, or Gate artifact may set `formalMetricEligible=true`.
- No container, persistent MemoryProxy config, user Codex config, auth file, or local memory database was changed.

R02 may now integrate the exact annotated data tag `task1-data-formal-v1.1` into a new branch and implement only the formal loader, prepare-only runner, evidence paths, and experiment freeze manifest. R02 must still remain model-free and metric-ineligible.
