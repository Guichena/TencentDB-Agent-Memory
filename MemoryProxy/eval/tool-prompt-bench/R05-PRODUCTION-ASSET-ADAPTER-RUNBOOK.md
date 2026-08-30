# R05 生产资产恢复与逐 Run 预检手册

> 本手册描述的是任务一所有 Prompt 创新共同继承的一次性公共准备链，不是任何一个创新方法，也不代表任何方法的模型行为结果。统一名称为 **R05 blank-stack preflight**：0 次模型调用，只做 restore、inspect 和 12 份 receipt。后续 **E01/R04 V0 runtime smoke** 才是 12 次 Luna，二者不能混称。R05 的生产 adapter 实现仍冻结在 `c86b154`；本复现分支只补一键编排、可执行 Gate 命令和文档，不回写冻结 R05。

## 1. 本阶段解决什么

R05 只补齐正式模型执行前的生产资产链路，不运行 Luna，也不评价资产回答质量：

1. 从 `task1-data-formal-v1.1` 构造 Gold-blind restore plan。
2. 通过真实 MemoryCore、MemoryKnowledge 接口创建 Team、Agent、Task 和可见资产。
3. 对每个 prepared run 绑定公开的 Space/Team/Agent/Task/Session。
4. 通过真实生产接口回读 Memory、Skill、Knowledge，并保存响应内容 hash 与 runtime locator。
5. 最后由 R04 的独立 evaluator 重算六项 preflight Gate；adapter 无权自报 `ready=true`。

任务一仍只评价“应不应该调用、选哪个工具、最短充分工具链是否完成、是否误调用，以及注入/Provider token 与 cache 证据”。R05 不验证最终代码、Knowledge 正文质量或 Memory 内容能否直接回答问题。它只回答“公共真实链路是否已经具备公平运行后续方法的条件”。

## 2. 冻结边界

| 项目 | 值 |
|---|---|
| 冻结 R05 实现 | `codex/task1-experiment-r05-production-assets-v1` @ `c86b154f9f597da0788592c66b93d574fd3f10f9` |
| Runtime Gate support 分支 | `codex/task1-r05-runtime-gate-repro-v1`（只增加编排、测试、Gate/手册修正；不跑 live Gate） |
| 上游代码检查点 | R04 `92da207` |
| 数据 tag | annotated tag `task1-data-formal-v1.1` |
| 模型 | `gpt-5.6-luna`，`high`；R05 本身不调用 |
| 数据面 | 本地 `server_team` 的 MemoryCore + MemoryKnowledge + MemoryProxy |
| 结果写入 | 只能写 worktree 外的新目录；所有 JSON 使用 create-new，不覆盖旧证据 |

严格分成两阶段：

1. **Support 离线阶段**：support worktree 只做离线 15-file / 85/85、双 PowerShell parser、合同 CLI 和 fail-closed dry-run；不得在该分支上跑 live blank-stack preflight。
2. **Integration live 阶段**：先建立最终 **Measurement-v2 integration provisional common-base**，non-squash 纳入本 support、M0/M1/M2 和 R02 最终 tip，并在 R05-compatible scorer 上得到真实 D0 42/42。然后才以该干净 worktree 作为 `RepositoryRoot` 跑一次 live R05 blank-stack preflight；通过后才冻结 Measurement-v2、Selection Contract 并打 candidate-base tag。

离线 support 检查示例只使用 `$SupportRoot`：

```powershell
$SupportRoot = "D:\projects\TencentDB-Agent-Memory-task1-r05-runtime-gate-repro-v1"
git -C $SupportRoot status --short --branch
Set-Location (Join-Path $SupportRoot "MemoryProxy")
npm test -- --run `
  src/__tests__/formal-production-restore-executor.test.ts `
  src/__tests__/formal-server-team-production-requirements.test.ts `
  src/__tests__/formal-server-team-production-transport.test.ts `
  src/__tests__/formal-server-team-memory-import-client.test.ts `
  src/__tests__/formal-server-team-production-adapter.test.ts `
  src/__tests__/formal-server-team-production-inspector.test.ts `
  src/__tests__/formal-benchmark-memory-import.test.ts `
  src/__tests__/formal-benchmark-preflight-session.test.ts `
  src/__tests__/formal-execution-preflight.test.ts `
  src/__tests__/formal-asset-restore-plan.test.ts `
  src/__tests__/formal-asset-restore-runtime.test.ts `
  src/__tests__/formal-dataset-registry.test.ts `
  src/__tests__/formal-build-frozen-restore-plan.test.ts `
  src/__tests__/formal-asset-restore-plan-contract.test.ts `
  src/__tests__/formal-r05-runtime-preflight-script.test.ts
```

live 阶段必须显式提供 integration worktree，不能复制 support 路径：

```powershell
$ExecutionRoot = "<Measurement-v2 integration provisional common-base 的绝对路径>"
$ProxyRoot = Join-Path $ExecutionRoot "MemoryProxy"
$BenchRoot = Join-Path $ProxyRoot "eval\tool-prompt-bench"
git -C $ExecutionRoot status --short --branch
git -C $ExecutionRoot rev-parse 'task1-data-formal-v1.1^{}'
```

必须保持传入的代码 worktree 和冻结数据 worktree 都干净。restore plan、observations、prepared runs 和 summary 都放在仓库外的新目录；脚本拒绝覆盖已有目录或 JSON。

## 3. 服务启动前必须由用户确定的参数

一键脚本不猜测部署值。启动三个服务前必须明确并记录：

1. `RepositoryRoot`：尚未打 candidate tag 的最终 Measurement-v2 integration provisional common-base 干净 worktree；`CodeRef` 必须解析为该 worktree 的 HEAD。
2. `Config`：MemoryProxy 实际启动时读取的 YAML 绝对路径；脚本会用 SHA-256 与 `/health` 回报值比对。
3. `RunRoot`：仓库外、尚不存在的新目录。失败后保留它，不在原目录重跑。
4. `FrozenDataRoot`：干净、HEAD 精确等于 `task1-data-formal-v1.1^{commit}` 的独立 checkout。
5. MemoryCore、MemoryKnowledge、MemoryProxy 三个无凭据 base URL；R05 的 blank stack 只接受 `localhost`、`127.0.0.1`、`::1` 等本机 loopback，拒绝远端 host。
6. 本轮专用 `RuntimeServiceId`（数据集 Space 到真实实例的唯一映射）。
7. `RuntimeAuthUserId`（本轮 user key 经 MemoryCore `/v3/meta/auth/verify` 解析出的真实 user id）。
8. 仅存在于当前终端环境的 `TDAI_EVAL_USER_KEY`；脚本不把它写入命令、JSON 或日志。
9. 唯一 `CampaignId`；正式 retry 必须换新 Campaign、RunRoot 和空白数据栈。

## 4. 源码能够证明的 blank-stack 启动合同

仓库没有一份能安全覆盖所有本地 `server_team` 存储后端的统一三服务启动命令，因此本手册不虚构 Docker Compose 或数据目录参数。可以从源码可靠确定的合同只有：

- Node.js 必须是 22；一键脚本在任何写操作或服务数据调用前校验。
- `TDAI_FORMAL_ASSET_IMPORT_ENABLED=1` 必须在 MemoryCore 进程启动前设置；源码在构造 gateway dependencies 时读取它。
- `TDAI_FORMAL_PREFLIGHT_ENABLED=1` 必须在 MemoryProxy 进程启动前设置；preflight route 的默认依赖在模块加载时读取它。
- MemoryProxy 必须以实际 config、`--tool-prompt-profile legacy --experiment-read-only` 启动。
- MemoryCore `/health` 必须为 `status=ok`，并报告 vector store 与 embedding service 可用；MemoryKnowledge `/health` 必须为 `status=ok`。
- MemoryProxy `/health` 必须报告 V0 `legacy`、官方 ChatGPT Codex upstream、`client-passthrough`、实际 config hash，以及全部 read-only 开关为真。
- 三个服务必须指向本轮专用且最初为空的数据库/目录/namespace。具体 SQLite、Redis、COS 或其他后端参数由本地部署决定，不能由评测脚本猜测。

MemoryProxy 的源码可验证启动形态为：

```powershell
$env:TDAI_FORMAL_PREFLIGHT_ENABLED = "1"
Set-Location (Join-Path $ExecutionRoot "MemoryProxy")
npm start -- --config $Config --tool-prompt-profile legacy --experiment-read-only
```

MemoryCore 和 MemoryKnowledge 仍按现有本地 `server_team` 方式人工启动。脚本不会运行 Docker、启动/停止服务、安装依赖或修改 config。

## 5. 一次性运行环境

以下值只在本次服务/命令进程环境中设置。`TDAI_EVAL_USER_KEY` 不写入 YAML、JSON、日志或 Git。

```powershell
$CampaignId = "task1-r05-blank-stack-preflight-r1"
$RunRoot = "D:\task1-formal-runtime-gates\$CampaignId"
$Config = "D:\task1-formal-config\v0-read-only.yaml"
$ArtifactRoot = Join-Path $RunRoot "evidence"
$CampaignRoot = Join-Path $RunRoot "prepared"
$PlanPath = Join-Path $ArtifactRoot "dev-restore-plan.json"
$RestorePath = Join-Path $ArtifactRoot "dev-restore-observations.json"
$FrozenDataRoot = "D:\projects\TencentDB-Agent-Memory-task1-data-formal-v1.1"

$env:TDAI_FORMAL_MEMORY_CORE_URL = "http://127.0.0.1:<MemoryCore端口>"
$env:TDAI_FORMAL_MEMORY_KNOWLEDGE_URL = "http://127.0.0.1:<MemoryKnowledge端口>"
$env:TDAI_FORMAL_MEMORY_PROXY_URL = "http://127.0.0.1:<MemoryProxy端口>"
$env:TDAI_FORMAL_RUNTIME_SERVICE_ID = "<本次专用Memory实例/Space ID>"
$env:TDAI_FORMAL_RUNTIME_AUTH_USER_ID = "<TDAI_EVAL_USER_KEY经auth/verify解析出的真实user_id>"
$env:TDAI_FORMAL_DATA_ROOT = $FrozenDataRoot
$env:TDAI_EVAL_USER_KEY = "<仅在当前终端输入>"
```

`$FrozenDataRoot` 必须是 `task1-data-formal-v1.1` 的独立只读 checkout，供 Skill manifest hash 匹配真实 `SKILL.md` 和资源文件；不能指向 raw source copy，也不能指向正在开发的数据分支。

服务启动时必须额外满足：

- MemoryCore：`TDAI_FORMAL_ASSET_IMPORT_ENABLED=1`，仅开放 R05 的 L1/L2 seed seam。
- MemoryProxy：`TDAI_FORMAL_PREFLIGHT_ENABLED=1`，并用 `--experiment-read-only` 启动。
- MemoryProxy health：`extractionDisabled=true`、`tdaiL0WriteDisabled=true`、`skillLlmWriteDisabled=true`、`analyseMarkerDisabled=true`、`ready=true`。
- MemoryProxy 仍使用现有官方 ChatGPT Codex endpoint 和 client-passthrough 登录；不改 `auth.json`，不 login/logout。
- 三个服务均使用本次专用、最初为空的数据目录/数据库。不要指向日常开发 SQLite、旧 SessionStore、旧 Redis/COS namespace。

R05 不自动启动 Docker或服务，避免影响当前 Codex 登录态；按现有 `server_team` 本地启动方式人工启动后再执行下述命令。

## 6. 推荐入口：一次运行完整 R05 blank-stack preflight（0 模型）

三个服务已经由用户启动并确认使用专用空白数据栈后，在另一个 Node 22 终端设置 user key。先做本地 dry-run；它只校验 Node、Git、tag、config、依赖路径与输出新路径，不联系服务、不建目录：

```powershell
$GateScript = Join-Path $BenchRoot "run-r05-runtime-preflight.ps1"

$GateArgs = @{
  RepositoryRoot = $ExecutionRoot
  Config = $Config
  RunRoot = $RunRoot
  FrozenDataRoot = $FrozenDataRoot
  MemoryCoreBaseUrl = $env:TDAI_FORMAL_MEMORY_CORE_URL
  MemoryKnowledgeBaseUrl = $env:TDAI_FORMAL_MEMORY_KNOWLEDGE_URL
  MemoryProxyBaseUrl = $env:TDAI_FORMAL_MEMORY_PROXY_URL
  RuntimeServiceId = $env:TDAI_FORMAL_RUNTIME_SERVICE_ID
  RuntimeAuthUserId = $env:TDAI_FORMAL_RUNTIME_AUTH_USER_ID
  CampaignId = $CampaignId
}

& $GateScript @GateArgs -DryRun
```

确认输出中的 commit、tag、config hash、预期 12-run 链路顺序和新 `RunRoot` 后，去掉 `-DryRun`：

```powershell
$env:TDAI_EVAL_USER_KEY = "<只在当前终端输入>"
& $GateScript @GateArgs
```

脚本严格串行完成并核验：

1. Node 22、代码/数据 worktree clean、annotated data tag、冻结 checkout、config/本地依赖。
2. 三服务 health 与 MemoryCore auth 映射；这些检查在创建输出目录、恢复资产之前完成。
3. create-new restore plan；在 restore 前独立断言 canonical `planSha256=49f9ad8549e293395671af8d17cc8604dcfbe741536855f7773155d8e5c1c3be`、318 actions、209 requirements、284 assets，然后只恢复一次 Dev 资产。
4. restore 后独立断言外层 `operation=restore`、`verification=unverified`、`formalMetricEligible=false`、`readyForFormalMeasurement=false`，以及内层 receipt `complete=true`、318 actions、209 requirements；adapter 不能自我授信。
5. 只生成冻结登记表中的 12 条 V0 Smoke PrepareOnly；在第一次 inspect/Session Init 前断言精确 case 集合、`repeat=1`、非空且唯一的 `run_id`/`session_id`；不执行任何模型命令。
6. 对每个 prepared run 执行真实 read-back inspect 和无模型 Session Init。
7. 独立 evaluator 生成六项全 pass 的 create-new receipt。
8. 再次校验 config hash、三服务 health、auth mapping，以及 MemoryProxy/MemoryKnowledge 实例没有漂移。
9. 写 summary 前再次断言 `RepositoryRoot`/`FrozenDataRoot` clean、代码 HEAD、数据 HEAD、annotated tag object 和 peeled commit 均与开始时一致。
10. 只有 12/12 receipt 为 `ready=true` 才以 `FileMode.CreateNew` 写 `r05-runtime-preflight-summary.json`；summary 保存 plan/restore 合同、plan/restore/manifest/inspect/receipt 文件 hash、冻结 Dev Smoke selection hash、12 个 case ID 和 final Git locks。

输出结构固定为：

```text
<RunRoot>/
├── evidence/
│   ├── dev-restore-plan.json
│   ├── dev-restore-observations.json
│   ├── inspect/<run-id>.json          # 12
│   └── preflight/<run-id>.json        # 12
├── prepared/<dataset>/<campaign>/.../run-manifest.json  # 12
└── r05-runtime-preflight-summary.json
```

任一步失败都立即停止。不要删除、覆盖或在同一半成品数据库继续；保留失败目录作为诊断证据，换新的 blank stack、`CampaignId` 与 `RunRoot` 重跑。

以下第 7～11 节保留为逐步审计说明和人工定位故障的等价命令；正常执行只使用上面的一键入口，避免漏掉某个 run。

## 7. 构造冻结 restore plan（等价展开）

```powershell
Set-Location $ProxyRoot
npm run eval:tool-prompt:formal:build-restore-plan -- `
  --repo-root $ExecutionRoot `
  --split dev `
  --output $PlanPath
```

成功输出必须精确等于：

```text
planSha256    49f9ad8549e293395671af8d17cc8604dcfbe741536855f7773155d8e5c1c3be
actions       318
requirements  209
assets         284
```

一键脚本会在 restore 前解析该 JSON 并 fail closed；不能只相信构造命令的退出码。命令使用 `flag=wx`；目标已存在会失败，不能覆盖。

## 8. 只恢复一次 Dev 快照（等价展开）

```powershell
$RestoreAdapter = Join-Path $BenchRoot "formal-assets\server-team-production-adapter.ts"

npm run eval:tool-prompt:formal:restore-assets -- `
  --plan $PlanPath `
  --split dev `
  --adapter $RestoreAdapter `
  --output $RestorePath
```

restore 顺序由冻结 plan 决定；不重试、不回滚、不启动模型。失败后不要在同一半成品数据库上继续；保留错误日志，换新的专用数据目录重新开始。

成功的 outer envelope 仍固定为：

```text
operation = restore
planSha256 = 49f9ad8549e293395671af8d17cc8604dcfbe741536855f7773155d8e5c1c3be
verification = unverified
formalMetricEligible = false
readyForFormalMeasurement = false
unverifiedObservations.complete = true
unverifiedObservations.actionCount = 318
unverifiedObservations.requirementCount = 209
```

这不是失败，而是防止 adapter 自我授信。真正 readiness 只能由第 11 节 evaluator 生成。

## 9. PrepareOnly（等价展开）

为 R05 blank-stack preflight 准备冻结的 12 条 Dev selection，不运行 Luna；这不是 E01/R04 V0 runtime smoke：

```powershell
& (Join-Path $BenchRoot "run-formal-prepare.ps1") `
  -Scope smoke `
  -Variant V0 `
  -Campaign $CampaignId `
  -RepositoryRoot $ExecutionRoot `
  -Config $Config `
  -OutputRoot $CampaignRoot `
  -ProxyBaseUrl $env:TDAI_FORMAL_MEMORY_PROXY_URL `
  -Repeats 1 `
  -Model "gpt-5.6-luna" `
  -ReasoningEffort "high" `
  -CodeRef HEAD `
  -PromptFreezeRef "task1-code-freeze"
```

冻结 Dev Smoke selection canonical SHA-256 是 `f300079fc408878cf2bf5921a9e6b3004ce9e5fa3034857221554c00a9a101ec`，精确有序 case 集合是：

```text
T01-MEMORY-006-P       T01-MEMORY-006-N
T02-MEMORY-001-P       T02-NATURAL-001
T03-SKILL-001-P        T03-SKILL-001-N
T04-SKILL-001-P        T04-NAT-001
T11-KNOWLEDGE-013-P    T11-KNOWLEDGE-013-N
T12-KNOWLEDGE-013-P    T12-NATURAL-001-N
```

PrepareOnly 为每条 case 生成独立 opaque session id 和公开 expected binding；一键脚本在任何 inspect/Session Init 前核验 case 集合、`repeat=1`、12 个非空唯一 `run_id` 和 12 个非空唯一 `session_id`。它不打开 private Gold，不执行 Codex。

## 10. 对每个 prepared run 生成 inspect observations（等价展开）

每个 run 都必须单独执行，因为 Team/Agent/Task/Session binding 不同：

```powershell
$RunDirectory = "<某一prepared run目录>"
$InspectPath = Join-Path $ArtifactRoot "inspect\<run-id>.json"
$Inspector = Join-Path $BenchRoot "formal-assets\server-team-production-inspector.ts"

npm run eval:tool-prompt:formal:inspect-assets -- `
  --plan $PlanPath `
  --restore-observations $RestorePath `
  --split dev `
  --run-dir $RunDirectory `
  --adapter $Inspector `
  --output $InspectPath
```

检查器执行顺序固定为：auth → runtime ID 映射 → Metadata/全部资产只读回读 → 无模型 Session Init。只有前面的回读全部成功才注册 opaque Session，避免某个坏资产先消耗 fresh namespace。

真实回读路径为：

- L0：`/v3/conversation/query`
- L1：`/v3/atomic/query`
- L2：`/v3/scenario/read`
- L3：`/v3/core/read`
- Skill：逐冻结 Skill 名称调用 `/v3/skill/search`，`scope=team`
- Knowledge：`/v3/meta/agent-fixed-asset/list-with-detail`

导入 Memory 按真实 owner Agent scope 回读；Skill/Knowledge 按当前 Session Agent 的生产可见性回读。每个成功响应保存 exact response bytes SHA-256、请求 body hash、非秘密 identity 和 locator；不保存响应正文、user key 或 header。

## 11. 独立生成 ready receipt（等价展开）

```powershell
$PreflightPath = Join-Path $ArtifactRoot "preflight\<run-id>.json"

& (Join-Path $BenchRoot "create-formal-preflight-receipt.ps1") `
  -RunDirectory $RunDirectory `
  -Plan $PlanPath `
  -InspectObservations $InspectPath `
  -Split dev `
  -Output $PreflightPath
```

必须六项全部 `pass`：

1. `auth-user-mapping`
2. `metadata-identity`
3. `session-identity`
4. `visible-assets`
5. `write-side-disabled`
6. `fresh-session-namespace`

其中 fresh namespace 实际检查 MemoryProxy 的 L1、L2a、L2b，并要求 prepared run 不携带旧 Session Init 历史。已有任何命中都会拒绝注册，不清理、不覆盖。

## 12. 公共准备链到后续方法分支的交接

12 条 preflight selection 全部得到 create-new `ready=true` receipt、final Git locks 通过且 summary 已生成后，R05 blank-stack preflight 才通过。随后冻结 Measurement-v2/Selection Contract，并在同一通过提交上打 candidate-base tag；之后才执行 **E01/R04 V0 runtime smoke**（12 次 Luna）和完整 Dev。

普通 Prompt 设计或措辞变化不重跑公共 Gate：它们从 tagged candidate-base 建立各自的后代 branch/worktree，为自己的 commit/config/profile 创建全新的 prepared run、Session、run-specific receipt 和结果证据。只有修改 adapter、runner、scorer、restore 或 preflight 基础设施时，公共 Gate 才必须在新的 provisional common-base 上重跑。不得复用其他方法已消费的 Session/result。

历史 R02 acceptance 审计的最终输入是 `codex/task1-r02-acceptance-v1` @ `bf19d1e6a8eaf69785ee015b047d1413de0a6f95`；其 ancestry 包含首次清单提交 `6b459b5`。本 Runtime Gate 分支只引用最终 tip，不 cherry-pick、squash 或直接合入：该审计基于历史 R02，清单也明确标记 `HISTORICAL_R02_ATTESTED_DOWNSTREAM_GATE_REQUIRED`，最新提交再补了 fail-closed provenance 修正。最终 common-base 必须以 non-squash 合并保留其 ancestry，在解决到 R05-compatible scorer 后重新捕获 freeze，并实际重跑 TypeScript D0 42/42；历史 41/42 不能改写成 PASS，也不能用 R05 runtime support 85/85 代替 D0 42/42。

最终结果包必须保存并比较：

- 最短充分工具决策链完成率、有效调用率/漏调用率、误调用率。
- 工具 family/terminal 选择正确率、ToolSPL、overcall、malformed/retry 等诊断指标。
- Static injected tool tokens、Provider input/output/cached tokens、cache write/read 证据。
- 每个 Variant、case、repeat、模型、reasoning effort、代码/data/config fingerprint 和全部 raw receipt/hash。

R05 通过不代表任务一实验或任何创新已经成功，只代表可被所有创新复用的真实资产适配、预检编排与公平性前置能力已经具备。
