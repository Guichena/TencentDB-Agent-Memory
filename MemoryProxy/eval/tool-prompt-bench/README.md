# TDAI-ToolPromptBench

This dataset evaluates only the atomic behavior required by Task 1: whether an agent should call a TDAI tool, which family and first action it should select, and whether the request is executable. It does not score the quality of returned Memory, Skill, or Knowledge assets.

Each case is a dialogue. `contextMessages` contains any preceding turns and `query` is the final user turn. When `contextMessages` is absent, the case is a valid one-turn dialogue.

All primary cases expose Memory, Skill, Wiki, and Code Graph read capabilities and preserve V0's currently exposed manual `skill_extract` action while disabling direct LLM writes. Manual extraction is forbidden unless a future, explicitly labelled lifecycle case requires it, so false calls remain observable without silently changing the baseline prompt surface.

The requested labels map directly to the schema: `must_call` is `gold.needTdaiTool`, `expected_tool_family` is `gold.family`, `allowed_call_count` is `gold.maxTdaiCalls`, and `expected_asset` is resolved by `fixtureIds` plus the Gold action predicates (`skill.gold_asset`, exact Knowledge id, session/path/filter constraints). They are not duplicated under second names, so the two copies cannot drift.

The 100 unique cases are selected by TDAI decision boundary, not randomly sampled. Public benchmarks provide suitable problem structures; every final query, fixture, and Gold action is rewritten against the current TencentDB-Agent-Memory contracts.

| Split | Memory | Skill | Knowledge | No Tool | Total |
|---|---:|---:|---:|---:|---:|
| Dev | 15 | 15 | 10 | 20 | 60 |
| Test | 10 | 10 | 6 | 14 | 40 |

The Test split is held out for the final V0 versus candidate comparison. It is public, not secret: operational freezing is enforced by `dataset-manifest.json` SHA-256 hashes. Prompt wording must be tuned only on Dev. Each `case x variant x repeat` must use a fresh Codex process, fresh session, reset fixture, and clean working directory.

The fixed 12-case Smoke list is a subset of Dev and adds no duplicate tasks. It covers semantic Memory search, exact conversation search, scene discovery, direct and searched Skills, Skill resources, code graph, wiki, self-contained coding, injected-L3 sufficiency, current-context/lexical overlap, and a mismatched repository.

Source selection is deliberate:

| Source | Cases | Selection reason |
|---|---:|---|
| SkillsBench | 25 | Coding tasks with a concrete workflow, reference file, or executable Skill asset |
| Project-authored | 22 | Current TDAI contracts and boundaries without a faithful public analogue |
| HumanEval | 15 | Fully specified coding tasks that should not call TDAI |
| LongMemEval | 11 | Preference, update, temporal, and multi-session memory structures |
| BFCL | 10 | Irrelevance and resource-mismatch structures |
| CrossCodeEval | 9 | Repository-matched cross-file relationship structures |
| MetaTool | 8 | Similar-tool and lexical-overlap hard negatives |

Content coverage is also fixed rather than inferred from the total count:

- Memory: 8 semantic-memory searches, 6 exact conversation searches, 3 structured atomic queries, 3 known-session queries, 3 direct scene reads, and 2 scene-discovery/read chains.
- Skill: 10 listed-Skill direct views, 8 team-library search/view chains, and 7 manifest-backed file reads. Queries describe a required team procedure without naming the bridge action.
- Knowledge: repository-matched code-graph exploration/callers/callees/impact and wiki search/read-page chains. Gold labels include the nested `tool_name` and parameter predicates, not only the generic `/tools/call` endpoint.
- No Tool: 15 self-contained coding tasks plus 19 current-context, lexical-overlap, repository-mismatch, or stale-snapshot negatives. Every negative still exposes at least one irrelevant TDAI asset.

For multi-step cases, `expectedFollowupActions` or `expectedKnowledgeCalls` records how the next request is bound to a previous response. This prevents a correct endpoint with invented Skill names, scene paths, wiki refs, or sub-tool parameters from being scored as correct.

Generate and validate:

```powershell
npm run eval:tool-prompt:generate
npm run eval:tool-prompt:validate
```

Generation also writes `dataset-manifest.json`. Any edit to Dev, Test, Smoke, fixtures, or source metadata must be followed by regeneration; validation and unit tests fail on stale hashes.

## Evaluation contract

`evaluator.ts` is the single scoring implementation for Tool/No-Tool, family, first action, full multi-step sequence, nested Knowledge sub-tool parameters, execution validity, and over-call detection. A positive case is an effective call only when its complete Gold sequence is executable; merely reaching the generic Knowledge `/tools/call` endpoint is insufficient.

`mock-bridge.ts` implements the production read-only endpoint surface against one isolated fixture. It enforces the service/session headers, required JSON fields, Skill search/view/file dependencies, Memory filters and pagination, scene discovery, and Knowledge list/call discovery. It deliberately does not evaluate the quality of the final coding answer.

The unit test synthesizes and executes the Gold sequence for every one of the 100 cases through this Mock Bridge, then scores the resulting trace. This is stronger than checking JSON shape: an invalid path, missing search result, wrong Knowledge sub-tool parameter, unsatisfied pagination offset, or stale generated file fails the test.

Collected traces use one JSONL record per run with `caseId`, `runId`, and ordered `attempts`. Score them with:

```powershell
npm run eval:tool-prompt:score -- --traces <trace.jsonl> --out <result.jsonl>
```

The scorer emits per-case states and an aggregate summary for Trigger Recall, Effective Call Rate, False Call Rate, FirstAction@1, conditional selection, argument accuracy, execution validity, and over-call rate. Infrastructure failures are counted separately and excluded from accuracy denominators; they are never silently converted into model failures.

Source revisions and licenses are pinned in `sources/manifest.json`. Cases marked `adapted` preserve a selected source task's decision structure but do not copy its answer. Cases marked `structural-template` use only an evaluation pattern. `project-authored` cases originate from current TDAI tool contracts.

## Execution layers

The benchmark keeps prompt construction, protocol execution, and model execution separate so failures can be attributed correctly:

1. `prompt-harness.ts` renders each fixture through the production `InjectionPipeline`, production `render*Block()` functions, and the selected production ToolPrompt Compiler profile. It does not maintain a second handwritten Prompt implementation.
2. `protocol-harness.ts` parses the exact read-only curl subset used by V0, rejects shell operators, off-origin URLs, unsupported methods, and unknown endpoints, then sends a structured HTTP request to a random-port Mock Bridge. Every attempt records `intentId`, `runId`, `sessionId`, and timestamp.
3. `codex-runner.ts` is the isolated model layer. Formal runs send the Responses request through a running MemoryProxy at `127.0.0.1:8096`; direct-to-provider runs are diagnostics only. Every repeat gets a new workspace, session, Mock Bridge, `CODEX_SQLITE_HOME`, `HOME`, and `USERPROFILE`; it uses `codex exec --ephemeral --ignore-rules --ignore-user-config --json`. Authentication points to the user's single existing `CODEX_HOME` and is never copied. Benchmark configuration is supplied only through invocation-scoped overrides. Codex skill instructions are disabled, so personal skills and the user's previous task state cannot affect the comparison. The same fixed Codex version, MemoryProxy build, and runner configuration must be used for V0 and candidate.

Prompt construction and live forwarding have different responsibilities. The case-specific fixture is rendered by MemoryProxy's production `InjectionPipeline` and production `render*Block()` functions before the request reaches the live Proxy. The running Proxy keeps its own injection disabled for this route, preventing a second injection, and provides the real Codex Responses forwarding and Langfuse observation path. This isolates the Task 1 variable while still exercising MemoryProxy as the model gateway.

### Frozen model protocol

- Iteration and primary reporting: `gpt-5.6-luna`, reasoning effort `high`, verbosity `medium`.
- The current protocol uses one model. Any later cross-model confirmation must be preregistered and reported separately; it must not be pooled into the Luna result.
- Standard Responses execution is used; Pro mode is not enabled.
- The runner writes the exact model, reasoning effort, verbosity, and Codex CLI version to `run-manifest.json`. Never compare variants whose recorded model settings or Codex version differ.
- `--reasoning-effort` and `--verbosity` are explicit experiment inputs. Reasoning defaults to `high` and verbosity defaults to `medium`, but formal commands must still spell them out.

### Asset provenance and optional real-service smoke

The 100 primary fixtures are deterministic benchmark-owned snapshots. Memory records, conversations, scenes, Skill listings, team-library Skills, and Knowledge bindings are defined in `case-definitions.ts`, frozen into JSONL, and served by the isolated Mock Bridge. They prove that every Gold sequence is executable under a fixed asset state; they do **not** prove that MemoryCore generated those assets or that MemoryPanel displayed them.

The deterministic fixture assets are sufficient for the Task 1 metrics. Asset extraction and MemoryPanel verification are not prerequisites for the formal V0 baseline.

If a production-contract demonstration is useful, run a separate real-service smoke for a small representative subset:

1. Upload or register representative Memory and Skill assets through the existing data-plane APIs. Automatic L1 extraction is optional because extraction quality is outside Task 1.
2. Confirm the resulting Memory through atomic/conversation reads and the resulting Skill through listing/search/get-by-name. Inspect the same assets in MemoryPanel.
3. Save non-secret generation receipts: case id, asset id, content hash, generation endpoint, request id, generation-log id when available, timestamps, and verification status. Never save credentials.
4. Freeze the verified assets into one snapshot and reuse it across every Variant. Do not let a prior Variant generate new Memory or Skills for a later Variant.

This smoke only demonstrates the real service contract. The primary metrics continue to score tool decision and execution against the deterministic Mock fixtures; asset-generation quality and final-answer quality remain outside Task 1's KPI.

Preview the Docker commands that start the benchmark MemoryProxy without changing `config.yaml`:

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\start-benchmark-proxy.ps1 -PrepareOnly
```

The start script mounts the inherited config read-only. It overrides the upstream at invocation time to the official ChatGPT Codex endpoint used by the installed client and maps the container's Langfuse host to `host.docker.internal:13000`.

Start MemoryProxy before any formal model run:

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\start-benchmark-proxy.ps1
```

Inspect an isolated prompt without making an LLM request:

```powershell
npm run eval:tool-prompt:codex -- --case memory-dev-preference-001 --model gpt-5.6-luna --reasoning-effort high --verbosity medium --variant V0 --repeat 1 --dry-run
```

`--variant` is a strict production-profile selector, not a result label:

| Variant | `injection.toolPromptProfile` |
|---|---|
| `V0` | `legacy` |
| `V0-C` | `contract-corrected` |
| `V1a` | `protocol-compact` |
| `V1` | `compact` |
| `V2` | `selection-calibrated` |
| `V3` | `capability-pruned` |

The runner writes both values and the effective Capability Signature into every `run-manifest.json`. Formal Task 1 runs disable automatic Skill extraction; V0 through V2 retain their frozen Prompt exposure, while V3 removes `skill_extract` through its production capability projection.

Run one real case through the required MemoryProxy route:

```powershell
npm run eval:tool-prompt:codex -- --case memory-dev-preference-001 --model gpt-5.6-luna --reasoning-effort high --verbosity medium --variant V0 --repeat 1 --provider-base-url http://127.0.0.1:8096/codex/tool-prompt-bench/v1
```

Runtime files are written below `eval/tool-prompt-bench/runs/` and are git-ignored. A run contains the exact rendered prompt, Codex's audited complete prompt input, SHA-256 values, injection-token measurements, model usage, the Codex version and invocation manifest, raw Codex JSONL, stderr, correlated Mock trace, and evaluation result. The prompt audit fails before an LLM call if the benchmark block is missing or client skill instructions reappear. Authentication remains in the user's existing `CODEX_HOME`; the runner never copies or persists an authentication file.

For the complete dataset, fairness, isolation, metric, token, and manual-run protocol, see `EXPERIMENT-DESIGN.md`.
