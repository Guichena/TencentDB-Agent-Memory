# R05 生产资产恢复与逐 Run 预检手册

## 1. 本阶段解决什么

R05 只补齐正式模型执行前的生产资产链路，不运行 Luna，也不评价资产回答质量：

1. 从 `task1-data-formal-v1.1` 构造 Gold-blind restore plan。
2. 通过真实 MemoryCore、MemoryKnowledge 接口创建 Team、Agent、Task 和可见资产。
3. 对每个 prepared run 绑定公开的 Space/Team/Agent/Task/Session。
4. 通过真实生产接口回读 Memory、Skill、Knowledge，并保存响应内容 hash 与 runtime locator。
5. 最后由 R04 的独立 evaluator 重算六项 preflight Gate；adapter 无权自报 `ready=true`。

任务一仍只评价“应不应该调用、选哪个工具、最短充分工具链是否完成、是否误调用，以及注入/Provider token 与 cache 证据”。R05 不验证最终代码、Knowledge 正文质量或 Memory 内容能否直接回答问题。

## 2. 冻结边界

| 项目 | 值 |
|---|---|
| R05 worktree | `D:\projects\TencentDB-Agent-Memory-task1-r05-production-assets-v1` |
| R05 branch | `codex/task1-experiment-r05-production-assets-v1` |
| 上游代码检查点 | R04 `92da207` |
| 数据 tag | annotated tag `task1-data-formal-v1.1` |
| 模型 | `gpt-5.6-luna`，`high`；R05 本身不调用 |
| 数据面 | 本地 `server_team` 的 MemoryCore + MemoryKnowledge + MemoryProxy |
| 结果写入 | 只能写 worktree 外的新目录；所有 JSON 使用 create-new，不覆盖旧证据 |

正式执行前先确认：

```powershell
$R05Root = "D:\projects\TencentDB-Agent-Memory-task1-r05-production-assets-v1"
$ProxyRoot = Join-Path $R05Root "MemoryProxy"
$BenchRoot = Join-Path $ProxyRoot "eval\tool-prompt-bench"

git -C $R05Root status --short --branch
git -C $R05Root rev-parse 'task1-data-formal-v1.1^{}'
```

必须保持 R05 worktree 干净。restore plan、observations、prepared runs、trace 和结果都放在仓库外。

## 3. 一次性运行环境

以下值只在本次服务/命令进程环境中设置。`TDAI_EVAL_USER_KEY` 不写入 YAML、JSON、日志或 Git。

```powershell
$CampaignId = "task1-dev-v0-smoke-r1"
$ArtifactRoot = "D:\task1-formal-assets\$CampaignId"
$CampaignRoot = "D:\task1-formal-runs\$CampaignId"
$TraceRoot = "D:\task1-formal-traces"
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

## 4. 构造冻结 restore plan

```powershell
Set-Location $ProxyRoot
npm run eval:tool-prompt:formal:build-restore-plan -- `
  --repo-root $R05Root `
  --split dev `
  --output $PlanPath
```

成功输出必须包含 `planSha256`、action/requirement/asset 数量。命令使用 `flag=wx`；目标已存在会失败，不能覆盖。

## 5. 只恢复一次 Dev 快照

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
verification = unverified
formalMetricEligible = false
readyForFormalMeasurement = false
```

这不是失败，而是防止 adapter 自我授信。真正 readiness 只能由第 8 节 evaluator 生成。

## 6. PrepareOnly

先按 R04 手册准备 V0 的 12 条 Dev Smoke，不运行 Luna：

```powershell
& (Join-Path $BenchRoot "run-formal-prepare.ps1") `
  -Scope smoke `
  -Variant V0 `
  -Campaign $CampaignId `
  -RepositoryRoot $R05Root `
  -Config "<实际只读正式config.yaml>" `
  -OutputRoot $CampaignRoot `
  -ProxyBaseUrl $env:TDAI_FORMAL_MEMORY_PROXY_URL `
  -Repeats 1 `
  -Model "gpt-5.6-luna" `
  -ReasoningEffort "high" `
  -CodeRef HEAD `
  -PromptFreezeRef "task1-code-freeze"
```

PrepareOnly 为每条 case 生成独立 opaque session id 和公开 expected binding；不打开 private Gold，不执行 Codex。

## 7. 对每个 prepared run 生成 inspect observations

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

## 8. 独立生成 ready receipt

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

## 9. R05 到 R04 正式运行的交接

12 条 Smoke 全部得到 create-new `ready=true` receipt 后，R05 完成。之后才按 `R04-FORMAL-CAMPAIGN-RUNBOOK.md` 的人工执行、drain/seal、Gold 离线 join 和评分步骤运行 Luna。

最终结果包必须保存并比较：

- 最短充分工具决策链完成率、有效调用率/漏调用率、误调用率。
- 工具 family/terminal 选择正确率、ToolSPL、overcall、malformed/retry 等诊断指标。
- Static injected tool tokens、Provider input/output/cached tokens、cache write/read 证据。
- 每个 Variant、case、repeat、模型、reasoning effort、代码/data/config fingerprint 和全部 raw receipt/hash。

R05 通过不代表任务一实验已经成功，只代表真实资产与公平性前置条件已经具备。
