# R04 Measurement / Runner Integration Gate

- code Gate: `PASSED`
- formal model Gate: `NOT_STARTED`
- branch: `codex/task1-experiment-r04-runner-v1`
- worktree: `D:\projects\TencentDB-Agent-Memory-task1-r04-runner-v1`
- parent R03 Gate commit: `7bd98fe89c2949806e7695c69f25e34d3f7cc0e5`
- verified implementation HEAD: `b6f7db239f8c33a3576b4696c38fee19b9c0688a`
- Prompt freeze tag: `task1-code-freeze`
- Prompt freeze tag object: `edbf18309fbf100cdf5b26d64c0fbb6f12c8f3a5`
- Prompt freeze commit: `d0996809ed63f6cfc67504ad180db0d48ac70475`
- formal data tag: `task1-data-formal-v1.1`
- checked at: `2026-08-30 Asia/Shanghai`
- model/service/network executions in R04: `0`

## Scope completed

R04 completes the experiment integration layer without changing any frozen Prompt text:

1. M0 scores the shortest sufficient tool-decision chain through the earliest accepted terminal. It preserves complete-chain, retry/repair, first-action, overcall, ToolSPL and malformed diagnostics without evaluating asset quality or final coding completion.
2. Production MemoryProxy Memory/Skill entries and MemoryKnowledge tools entries persist begin/completion evidence with process instance, campaign, sequence, wall time, session and sanitized request/response facts.
3. Both services drain in-flight HTTP work before sealing. Missing ready/completion/seal, sequence gaps, process drift, overlapping run windows and unassigned events fail formal eligibility.
4. MemoryProxy separately persists the Provider-bound request body hash, redacted body, safe correlation headers, response status/hash/request id and raw usage. Async SSE readers finish before provider evidence seals.
5. The Gold-blind runner verifies frozen public input, runtime health, prepared identity, clean code, Prompt freeze and isolated HOME/USERPROFILE/SQLite/workspace before running one Codex process.
6. Offline collection joins execution, tool and Provider identities before opening private Gold. A structurally ineligible campaign excludes the whole campaign; Pair metrics require both members at the same repeat to be eligible.
7. Formal results include shortest exact, complete chain, conditional terminal accuracy, false-call attempt, Pair success, static injection tokens and Provider input/cached/output/reasoning/total usage.
8. The hard cache Gate resolves the immutable Prompt tag, verifies Prompt-owned source paths did not change after freeze, and persists the C06 static-template hashes, unique cache namespaces, injection tokens and stable-prefix measurements. Provider cached-input tokens remain timing-dependent diagnostics.
9. Manual PowerShell commands exist for PrepareOnly, per-run preflight receipt, execution and sealed collection. They do not start Docker/services, install dependencies, mutate YAML or modify Codex authentication.

## Prompt cache Gate result

The real repository Gate was evaluated at the verified implementation HEAD and returned `passed=true`:

| Variant | Profile | Static injection tokens (`o200k_base`) | Adjacent stable prefix bytes |
|---|---|---:|---:|
| V0 | `legacy` | 4,863 | 17,436 (self length) |
| V0-C | `contract-corrected` | 5,126 | 903 |
| V1a | `protocol-compact` | 4,413 | 155 |
| V1 | `compact` | 4,027 | 155 |
| V2 | `selection-calibrated` | 2,308 | 443 |
| V3 | `capability-pruned` | 2,224 | 1,714 |

Additional immutable facts:

- tagged C06 manifest SHA-256: `f7b75e30123b1459dc7311b6cce782331f4d84e68191eb7b38e5187cd6d8afc1`
- all six runs must resolve the same Prompt freeze commit
- Prompt ownership paths are unchanged from freeze to R04 HEAD
- six cache namespaces are unique
- every frozen block has a static-template SHA-256
- every non-baseline Variant has an adjacent first-change measurement

V3 saves 2,639 static injection tokens relative to V0 (54.3%). This is a static code fact only; R04 has not produced behavior or real cache-hit conclusions.

## Verification

| Gate | Result |
|---|---|
| MemoryProxy production entry, trace, provider, prepare, preflight, execute and collect tests | 13 files, 89/89 passed |
| Measurement v2 independent Vitest config | 5 files, 75/75 passed |
| MemoryProxy drain/seal focused test | 6/6 passed |
| MemoryKnowledge drain/seal focused test | 3/3 passed |
| Measurement v2 strict TypeScript project | exit 0 |
| R04 file diagnostic filter over full MemoryProxy typecheck | 0 matching diagnostics |
| `git diff --check` from R03 through verified HEAD | passed |
| Real immutable cache-structure inspection | passed |

The repository-wide typecheck is not green. Its output still contains pre-existing MemoryCore typing issues, missing optional/package dependencies in the shared dependency layout, and existing host-source diagnostics outside R04. No diagnostic names an R04 formal/cache/provider/collector source after the two test callbacks were corrected to return `void`. These baseline errors are not changed or hidden by this Gate.

## Manual run boundary

[R04-FORMAL-CAMPAIGN-RUNBOOK.md](../../R04-FORMAL-CAMPAIGN-RUNBOOK.md) is the authoritative operator sequence. It requires:

- a clean final R04 execution commit;
- a unique external trace and run directory;
- one Variant, one Proxy instance and one Knowledge instance per Campaign;
- the existing official Codex login and `gpt-5.6-luna` with reasoning `high`;
- production asset restore/read-back;
- per-run six-check preflight receipt;
- serial execution;
- graceful drain and seal before private Gold collection.

`start-benchmark-proxy.ps1` remains a Mock/Pilot launcher and is prohibited for formal metrics.

## Remaining blocker

R03 intentionally froze a Gold-blind `executable:false` restore plan with unresolved runtime requirements. The current repository still lacks the deployment-specific production adapter that maps those requirements to the actual local `server_team` MemoryCore/Metadata/Skill/MemoryKnowledge interfaces and performs real read-back.

Until that adapter exists and produces observations accepted by the independent preflight evaluator:

- do not run the 12-case V0 formal Smoke;
- do not fabricate or hand-edit a ready receipt;
- do not treat Mock, pure-function or contract results as formal Task 1 behavior metrics;
- do not claim effective-call, false-call or terminal-selection improvement.

The adapter is a separate next-stage implementation because it changes asset/runtime integration, not R04 scoring or runner semantics.

## Decision

R04 code Gate passes and the branch can be preserved as the runner/measurement implementation checkpoint. The next implementation must be a separate production asset adapter branch/worktree. Only after that branch passes its own restore/read-back Gate may the user manually start the V0 Smoke described in the runbook.
