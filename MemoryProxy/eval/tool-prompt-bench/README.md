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

1. `prompt-harness.ts` renders each fixture through the production `InjectionPipeline` and the production `render*Block()` functions. It does not maintain a second handwritten copy of V0.
2. `protocol-harness.ts` parses the exact read-only curl subset used by V0, rejects shell operators, off-origin URLs, unsupported methods, and unknown endpoints, then sends a structured HTTP request to a random-port Mock Bridge. Every attempt records `intentId`, `runId`, `sessionId`, and timestamp.
3. `codex-runner.ts` is the optional model layer. Every repeat gets a new workspace, session, Mock Bridge, `CODEX_HOME`, `CODEX_SQLITE_HOME`, `HOME`, and `USERPROFILE`; it uses `codex exec --ephemeral --ignore-rules --json`. The fresh Codex home contains only the benchmark profile and a temporary authentication copy. Codex skill instructions are disabled, so personal skills and the user's previous task state cannot affect the comparison. The same fixed Codex version and runner configuration must be used for V0 and candidate.

### Frozen model protocol

- Iteration and primary reporting: `gpt-5.6-sol`, reasoning effort `medium`, verbosity `medium`.
- Cross-model confirmation of shortlisted variants only: `gpt-5.6-terra`, reasoning effort `medium`, verbosity `medium`.
- Standard Responses execution is used; Pro mode is not enabled.
- The runner writes the exact model, reasoning effort, verbosity, and Codex CLI version to `run-manifest.json`. Never compare variants whose recorded model settings or Codex version differ.
- `--reasoning-effort` and `--verbosity` are explicit experiment inputs. Both default to `medium`, but formal commands should still spell them out.

Inspect an isolated run without making an LLM request:

```powershell
npm run eval:tool-prompt:codex -- --case memory-dev-preference-001 --model gpt-5.6-sol --reasoning-effort medium --verbosity medium --variant V0 --repeat 1 --dry-run
```

Run one real case through a Responses-compatible endpoint (for example the project-local MemoryProxy/Langfuse route):

```powershell
npm run eval:tool-prompt:codex -- --case memory-dev-preference-001 --model gpt-5.6-sol --reasoning-effort medium --verbosity medium --variant V0 --repeat 1 --provider-base-url http://127.0.0.1:8096/codex/tool-prompt-bench/v1
```

Runtime files are written below `eval/tool-prompt-bench/runs/` and are git-ignored. A run contains the exact rendered prompt, Codex's audited complete prompt input, both SHA-256 values, the Codex version and invocation manifest, raw Codex JSONL, stderr, correlated Mock trace, and evaluation result. The prompt audit fails before an LLM call if the benchmark block is missing or client skill instructions reappear. Authentication is copied only into the temporary Codex home for the process and removed in `finally`; it is never written to the manifest.
