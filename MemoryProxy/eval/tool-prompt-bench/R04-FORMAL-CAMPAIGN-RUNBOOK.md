# R04 正式 Campaign 操作手册

> 本文件中的 R04 branch/worktree 是**历史 checkpoint**，只说明 runner 能力的来源，不再是任何 live 执行路径。统一使用 `ExecutionRoot`：最终 Measurement-v2 integration provisional common-base 必须先提交无 TBD 的 Selection Contract 与 freeze manifest，再在该精确提交上执行 R05 blank-stack preflight；通过后不再修改 HEAD，只给同一提交打 Measurement-v2/candidate-base tag。**E01/R04 V0 runtime smoke**（40 次 Luna）与正式 V0–V3 使用 tagged candidate-base，各 Prompt 方法使用该 tag 的各自后代。

## 当前结论

| 项目 | 冻结值或状态 |
|---|---|
| 历史 R04 worktree | `D:\projects\TencentDB-Agent-Memory-task1-r04-runner-v1`（只读 checkpoint，不作 ExecutionRoot） |
| 分支 | `codex/task1-experiment-r04-runner-v1` |
| Prompt freeze | annotated tag `task1-code-freeze`，解引用 commit `d0996809ed63f6cfc67504ad180db0d48ac70475` |
| 数据 freeze | annotated tag `task1-data-formal-v2.1`，800 case；Dev 320、Hidden 480 |
| 主模型 | `gpt-5.6-luna` |
| 推理强度 | `high` |
| 输出详细度 | `medium` |
| R04 模型运行 | `0`；本手册生成时没有启动 Codex、MemoryProxy、MemoryKnowledge 或 Docker |
| 历史阻断项 | R04 当时尚无生产 adapter；现由 R05 blank-stack preflight 与 integration Gate 接管 |

R04 已经具备生产请求 trace、Provider-visible Prompt 与 usage trace、Gold-blind 执行、正式 eligibility、M0 链评分、Pair 汇总、Prompt cache 结构 Gate，以及人工执行和 sealed collection 命令。它不负责自动启动服务，也不修改持久化 YAML、Codex 登录态或用户配置。

生产资产 Gate 失败不是模型失败，也不能用手写 JSON 绕过。必须先在 provisional common-base 上通过 0 模型的 R05 blank-stack preflight，冻结 candidate-base；之后才允许在 tagged candidate-base 上开始 E01/R04 V0 runtime smoke。

## 运行边界

1. 一个 Campaign 只运行一个 Variant；Variant 对应的 profile 是 MemoryProxy 进程级设置。
2. 一个 Campaign 只允许一个 MemoryProxy 实例和一个 MemoryKnowledge 实例，所有 run 严格串行，run wall-time 窗口不得重叠。
3. `TDAI_EVAL_TRACE_DIR` 是绝对路径，`TDAI_EVAL_CAMPAIGN_ID` 每次唯一。目标 `${TraceRoot}\${CampaignId}` 必须在启动前不存在；trace sink 使用 create-new 语义，复用目录会使观测器 fail-open，最终 Campaign 被拒绝。
4. Campaign、runtime、trace 和结果目录全部放在 `ExecutionRoot` 外。执行 worktree 必须保持完全干净，准备或运行产物不能写进仓库。
5. 当前 `CODEX_HOME` 只用于复用官方登录。不得复制或编辑 `auth.json`，不得执行 `codex login`、`codex logout`，不得覆盖桌面 Codex 配置。
6. `TDAI_EVAL_USER_KEY` 只存在于启动/执行终端的进程环境，不写入命令文件、日志、JSON 或 Git。
7. 不使用 `start-benchmark-proxy.ps1` 采集正式结果。该文件属于旧 Mock/Pilot 链路，会启用 diagnostic Mock 空间，不满足正式 Campaign Gate。
8. Langfuse 可开可不开，只作排障；本地 sealed trace 和 Provider evidence 才是正式证据。

## 一、冻结变量

以下 PowerShell 变量只是路径示例。路径可调整，但都必须是明确的绝对路径。

```powershell
$ExecutionRoot = "<tagged candidate-base 或当前 Prompt 方法后代 worktree 的绝对路径>"
$ProxyRoot = Join-Path $ExecutionRoot "MemoryProxy"
$KnowledgeRoot = Join-Path $ExecutionRoot "MemoryKnowledge"
$BenchRoot = Join-Path $ProxyRoot "eval\tool-prompt-bench"

$CampaignId = "task1-e01-v0-runtime-smoke-r1"
$Variant = "V0"
$Profile = "legacy"
$TraceRoot = "D:\task1-formal-traces"
$CampaignRoot = "D:\task1-formal-runs\task1-e01-v0-runtime-smoke-r1"
$ResultPath = "D:\task1-formal-results\task1-e01-v0-runtime-smoke-r1.json"
$Config = "D:\path\to\the\actual-readonly-formal-config.yaml"
$ProxyBaseUrl = "http://127.0.0.1:8787"
$KnowledgeHealthUrl = "http://127.0.0.1:8790/health"
```

Variant/Profile 映射固定为：

| Variant | Profile |
|---|---|
| `V0` | `legacy` |
| `V0-C` | `contract-corrected` |
| `V1a` | `protocol-compact` |
| `V1` | `compact` |
| `V2` | `selection-calibrated` |
| `V3` | `capability-pruned` |

在任何服务启动前检查：

```powershell
git -C $ExecutionRoot status --short --branch
git -C $ExecutionRoot rev-parse 'task1-code-freeze^{}'
git -C $ExecutionRoot rev-parse 'task1-data-formal-v2.1^{}'
node --version
codex --version
Test-Path -LiteralPath (Join-Path $TraceRoot $CampaignId)
```

必须满足：worktree 干净；ExecutionRoot 是 tagged candidate-base（基线）或该 tag 的明确方法后代；Prompt freeze、Selection Contract 和 Measurement-v2 freeze 与该执行提交匹配；Campaign trace 目录返回 `False`；MemoryProxy 使用项目要求的 Node 22.x。若 Node、Codex CLI、模型 alias 或执行 HEAD 改变，前后 Campaign 不能合并。

## 二、生产资产恢复与 read-back

这一阶段在正式模型执行前完成，且必须使用同一冻结 split 的真实本地数据栈。

现有代码提供：

- `buildFrozenFormalAssetRestorePlan()`：从 `task1-data-formal-v2.1` 构造 Gold-blind restore plan。
- `formal-dataset/scripts/restore-formal-snapshot.ts`：校验 plan 后加载生产 restore adapter。
- `formal-dataset/scripts/inspect-formal-snapshot.ts`：校验 plan 和 restore observations 后加载生产 inspector。
- `create-formal-preflight-receipt.ps1`：把 prepared run 的公开身份与 inspect observations 绑定，独立重算六项 Gate。

R04 历史 checkpoint 当时没有生产 adapter；当前实现由 R05 support 和最终 integration common-base 提供。不要再按本节创建另一个 adapter，也不能用 Mock 代替。live 模型执行前，R05 blank-stack preflight 必须已经完成以下合同：

1. 解析 plan 的运行时 requirements：Space→service、dataset user→auth user、Skill 包 bytes、Knowledge snapshot、Memory L1/L2 import。
2. 通过现有 MemoryCore/Metadata/Skill/MemoryKnowledge 数据面接口执行 action，保存每个 action 的请求路径、HTTP/envelope 状态、响应 hash 和 capture。
3. 对每个 prepared run 使用真实 `/v3/meta/auth/verify`、Team/Agent/Task metadata、Session Init、Memory/Skill/Knowledge 列表/read-back 和 session namespace lookup 形成 `FormalExecutionPreflightInput`。
4. 不允许 adapter 自己写 `ready=true` 或 `formalMetricEligible=true`；R03 envelope 固定保持 `unverified`。
5. 不打印 user key、service token、Authorization header 或资产正文；只保留可交叉检查的非秘密映射、locator 和 hash。

如果缺少这一步，停止。不要创建假的 `formal-execution-preflight-receipt.json`。

## 三、人工启动两个生产服务

资产已恢复且专用数据目录已确定后，在两个独立终端设置同一个 trace root 和 Campaign id。下面只展示进程参数合同；实际 Knowledge 数据目录和数据库路径必须指向刚恢复并 read-back 通过的快照。

MemoryKnowledge 终端：

```powershell
Set-Location $KnowledgeRoot
$env:TDAI_EVAL_TRACE_DIR = $TraceRoot
$env:TDAI_EVAL_CAMPAIGN_ID = $CampaignId
$env:PORT = "8790"
$env:KNOWLEDGE_DATA_DIR = "D:\path\to\restored\knowledge-data"
$env:KNOWLEDGE_DB_PATH = "D:\path\to\restored\knowledge.db"
npm run dev
```

MemoryProxy 终端：

```powershell
Set-Location $ProxyRoot
$env:TDAI_EVAL_TRACE_DIR = $TraceRoot
$env:TDAI_EVAL_CAMPAIGN_ID = $CampaignId
$env:TDAI_EVAL_USER_KEY = "<仅在当前终端赋值，不写入文件>"
npm start -- --config $Config --tool-prompt-profile $Profile --experiment-read-only
```

MemoryProxy YAML 必须本来就指向官方 ChatGPT Codex endpoint，并由 `/health` 报告 `codexUpstreamAuth=client-passthrough`。本流程不临时改 YAML、不覆盖另一个旧上游，也不安装依赖。

检查两个 health：

```powershell
Invoke-RestMethod "$ProxyBaseUrl/health" | ConvertTo-Json -Depth 8
Invoke-RestMethod $KnowledgeHealthUrl | ConvertTo-Json -Depth 8
```

保存 Proxy `serverInstanceId`、Knowledge `serverInstanceId`、Proxy `serverStartedAt`、profile、只读开关、上游和配置 fingerprint。后续命令中的 Knowledge instance id 必须来自本次 health，不能手填旧值。

## 四、PrepareOnly

先为 E01/R04 V0 runtime smoke 准备 40 条 Dev run，不调用模型；下一节才各调用一次 Luna：

```powershell
& (Join-Path $BenchRoot "run-formal-prepare.ps1") `
  -Scope smoke `
  -Variant $Variant `
  -Campaign $CampaignId `
  -RepositoryRoot $ExecutionRoot `
  -Config $Config `
  -OutputRoot $CampaignRoot `
  -ProxyBaseUrl $ProxyBaseUrl `
  -Repeats 1 `
  -Model "gpt-5.6-luna" `
  -ReasoningEffort "high" `
  -CodeRef HEAD `
  -PromptFreezeRef "task1-code-freeze"
```

PrepareOnly 会验证真实 Proxy health、只读配置、Variant/Profile、官方上游、client-auth passthrough、冻结数据和 Git commit。它只生成公开 run 目录，不打开私有 Gold，不读取 `auth.json`，也不执行 Codex。

## 五、逐 run 生成 preflight receipt

生产 inspector 必须针对每个 prepared run 形成独立 inspect observations；其中 expected binding 必须与该 run 一致。然后执行：

```powershell
& (Join-Path $BenchRoot "create-formal-preflight-receipt.ps1") `
  -RunDirectory "<某一 prepared run 目录>" `
  -Plan "<冻结 Dev restore-plan.json>" `
  -InspectObservations "<该 run 的 inspect-observations.json>" `
  -Split dev `
  -Output "<该 run 目录外的 preflight-receipt.json>"
```

必须看到六项全部为 `pass`：`auth-user-mapping`、`metadata-identity`、`session-identity`、`visible-assets`、`write-side-disabled`、`fresh-session-namespace`。输出文件采用 create-new；失败后修复真实状态并创建新 Campaign，不覆盖旧证据。

## 六、用户人工运行 Luna

确认当前桌面 Codex 仍处于登录状态。每次只执行一个 run：

```powershell
$knowledgeHealth = Invoke-RestMethod $KnowledgeHealthUrl
& (Join-Path $BenchRoot "run-formal-execute.ps1") `
  -RunDirectory "<某一 prepared run 目录>" `
  -PreflightReceipt "<该 run 的 preflight-receipt.json>" `
  -KnowledgeHealthUrl $KnowledgeHealthUrl `
  -KnowledgeInstanceId $knowledgeHealth.serverInstanceId `
  -RepositoryRoot $ExecutionRoot `
  -TimeoutMs 180000
```

命令会自行验证：worktree 干净、执行 HEAD、`task1-code-freeze`、Prompt freeze ancestry、Proxy/Knowledge instance、preflight identity、隔离 HOME/USERPROFILE/SQLite/workspace、Provider prompt hash。每个 run 使用新的 Codex 进程和 session；运行结果不会在进程中打开私有 Gold。

任一 run 超时、Codex 非零退出、health 漂移或 evidence 缺失时，不要把它改记为漏调。保留原产物，使用新的 Campaign/repeat 重跑。

## 七、停止、drain 和 seal

全部 run 完成后，先停止接收新 run，再分别用 `Ctrl+C` 正常停止 MemoryProxy 和 MemoryKnowledge。两个服务会先 drain 在途请求，再写 seal。不要直接杀进程。

确认 `${TraceRoot}\${CampaignId}` 下存在且最后有 seal：

- `memory-proxy.events.jsonl`
- `memory-knowledge.events.jsonl`
- `memory-proxy.provider-requests.jsonl`

缺文件、缺 ready、缺 completion、缺 seal、sequence 不连续、run 窗口重叠、进程 instance 不一致或出现未归属事件，整个 Campaign 都不可进入正式分母。

## 八、Gold 离线 join、评分和结果包

服务完全停止并 seal 后才执行：

```powershell
& (Join-Path $BenchRoot "collect-formal-results.ps1") `
  -CampaignId $CampaignId `
  -CampaignRoot $CampaignRoot `
  -TraceCampaignDirectory (Join-Path $TraceRoot $CampaignId) `
  -RepositoryRoot $ExecutionRoot `
  -Split dev `
  -CampaignPhase dev-discovery `
  -OutputPath $ResultPath
```

阶段映射固定为：Dev 候选探索用 `-Split dev -CampaignPhase dev-discovery`，Dev 入围确认用 `-Split dev -CampaignPhase dev-confirmation`，Hidden 只能用 `-Split hidden_test -CampaignPhase hidden -AllowHiddenTest`。

collector 依次完成：

1. 发现全部 execution receipt，验证单 Proxy/Knowledge instance 和不重叠 run 窗口。
2. 解析 sealed MemoryProxy、MemoryKnowledge 和 Provider 日志。
3. 验证 Provider-visible TDAI wrapper、逐请求 usage、session 归属和注入 hash。
4. 验证 `task1-code-freeze` tag、候选只修改计划内 Prompt 源码、六个 baseline Variant 清单，以及候选实测的 Provider-visible source attestation、Token、hash 与 cache 结构证据。
5. 最后才打开冻结 private Gold/Pair，按 behavior-valid terminal horizon 计算 M0。
6. 以 create-new 方式写一个完整 bundle；不会重跑模型，也不会修改 raw evidence。

结果至少检查：

```text
measurement.formalCampaignEligible == true
measurement.excludedRunCount == 0
cacheStructureGate.passed == true
toolCollection.formalCampaignEligible == true
providerCollection.formalCampaignEligible == true
```

主表读取 Complete Chain Success、False Call Attempt、固定分母 Terminal Selection、PairExact、Positive Overcall 和 Static Tool Tokens；Conditional Terminal Accuracy 必须带分子/分母报告，但只作工具选择伴随指标。ShortestExact、Trigger、First Action、ToolSPL、Malformed、Runtime HTTP 与 Provider usage 是效率或诊断指标。不要评价资产正文质量或最终 coding 完成度。

## 九、推荐实际顺序

1. provisional common-base 先提交无 TBD 的 Measurement-v2 freeze manifest 与 Selection Contract，再在该精确提交上完成 0 模型 R05 blank-stack preflight；通过后不得修改 HEAD，只给同一提交打 Measurement-v2/candidate-base tag。
2. tagged candidate-base 先跑 E01/R04 V0 runtime smoke（40 次 Luna）。
3. runtime smoke 全部可收集且正式 eligible 后，跑 320 条 Dev V0。
4. 分别用新 Campaign 跑 V0-C、V1a、V1、V2、V3；同一 Variant 内 case/Pair 固定，跨 Variant 用离线 case id 配对。
5. 每个 Prompt 方法从 tagged candidate-base 建独立后代并创建新 run/Session/result；普通 Prompt 改动不重跑公共 blank-stack Gate，只有 adapter/runner/scorer/restore/preflight 基础设施变化才重跑。
6. 先比较相邻版本，保留所有中间版本；效果最好的中间产物可以胜过最终编号。
7. 只对 V0、V0-C 和最多两个候选做三次复核。
8. 冻结 Final 后才授权 Hidden Test；Hidden 命令必须显式增加 `-HeldOutAuthorized` 或 `-AllowHiddenTest`，且不再改 Prompt、Gold、scorer 或资产。

## R04 完成判定

R04 代码 Gate 与正式模型 Gate 是两件事：

- R04 代码 Gate：本分支测试、类型增量、Prompt freeze、trace seal、Gold-blind 边界、usage、eligibility、M0、Pair、cache Gate 和人工命令全部通过；可以在不运行模型的情况下完成。
- 正式模型 Gate：必须额外有已通过的 R05 blank-stack preflight、tagged candidate-base、40 条 E01/R04 V0 runtime smoke、sealed trace 和 `formalCampaignEligible=true` bundle。当前尚未满足，不能宣称已经得到任务一优化结论。
