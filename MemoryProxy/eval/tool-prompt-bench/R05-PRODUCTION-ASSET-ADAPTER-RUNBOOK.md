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

冻结数据里的 `resetSnapshotBeforeCase=true` 是兼容既有 tag 的字段名，只表示每个 Case 使用新的 Session 与 case-local overlay/local-state namespace；它**不表示**逐 Case 恢复持久化数据库。Memory/Skill/Knowledge 资产严格 `restoreOncePerCampaign`：一个 Campaign 的空白栈只恢复一次，所有配对 Variant 共享该只读资产快照。

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

1. **Support 离线阶段**：support worktree 只完成 R05 support 的离线测试、双 PowerShell parser、合同 CLI 和 fail-closed dry-run；不得在该分支上跑 live blank-stack preflight。历史测试数只属于当时的 support checkpoint，不能代替当前集成 Gate。
2. **Integration live 阶段**：先建立最终 **Measurement-v2 integration provisional common-base**，non-squash 纳入本 support、M0/M1/M2 和 R02 最终 tip，在 R05-compatible scorer 上通过当前 `eval:tool-prompt:d0:test`，并提交无 TBD 的 Selection Contract 与 freeze manifest。然后以该精确、干净提交作为 `RepositoryRoot` 跑一次 live R05 blank-stack preflight；通过后不得再修改 HEAD，只给同一提交打 Measurement-v2 与 candidate-base tag。

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

必须保持传入的代码 worktree 和冻结数据 worktree 都干净。restore plan、observations、prepared runs 和 summary 都放在仓库外的 RunRoot 中。`Restore` 拒绝已有 RunRoot，`Inspect` 只接受该 Restore 阶段创建的 RunRoot；两个阶段都拒绝覆盖 JSON。

## 3. 服务启动前必须由用户确定的参数

脚本不猜测部署值。启动三个服务前必须明确并记录：

1. `RepositoryRoot`：尚未打 candidate tag 的最终 Measurement-v2 integration provisional common-base 干净 worktree；`CodeRef` 必须解析为该 worktree 的 HEAD。
2. `Config`：MemoryProxy 实际启动时读取的 YAML 绝对路径；脚本会用 SHA-256 与 `/health` 回报值比对。
3. `RunRoot`：仓库外的证据目录。`Restore` 阶段要求它尚不存在；`Inspect` 阶段必须复用同一个已恢复目录。
4. `FrozenDataRoot`：干净、HEAD 精确等于 `task1-data-formal-v1.1^{commit}` 的独立 checkout。
5. MemoryCore、MemoryKnowledge、MemoryProxy 三个无凭据 base URL；R05 的 blank stack 只接受 `localhost`、`127.0.0.1`、`::1` 等本机 loopback，拒绝远端 host。
6. 本轮专用 `RuntimeServiceId`（数据集 Space 到真实实例的唯一映射）。
7. `RuntimeAuthUserId`（本轮 user key 经 MemoryCore `/v3/meta/auth/verify` 解析出的真实 user id）。
8. 仅存在于当前终端环境的 `TDAI_EVAL_USER_KEY`；脚本不把它写入命令、JSON 或日志。
9. 本轮专用的 `TDAI_FORMAL_MEMORY_CORE_API_KEY`。它是隔离 blank stack 的 disposable gateway 凭据，与用户 key、Codex provider token 都是不同的值。adapter/inspector 只从当前终端环境读取它；MemoryProxy 当前还需在仓库外的实际 YAML 中用同一值配置 `tdai.apiKey`、`skill.serviceToken` 和 `knowledge.serviceToken`。该 YAML 的 hash 会进入证据，但 key 本身不会进入 R05 JSON 或 Git。
10. 唯一 `CampaignId`。restore 或身份锁失败后，新的正式尝试必须换 Campaign、RunRoot 和空白数据栈。等待异步 code-graph 变为 `ready` 不算失败，不换栈，也不换 RunRoot。

## 4. 源码能够证明的 blank-stack 启动合同

仓库没有一份能安全覆盖所有本地 `server_team` 存储后端的统一三服务启动命令，因此本手册不虚构 Docker Compose 或数据目录参数。可以从源码可靠确定的合同只有：

- Node.js 必须是 22；脚本在任何写操作或服务数据调用前校验。
- `TDAI_INSTANCE_ID` 必须与 actual MemoryProxy config 中的 `tdai.serviceId`、`skill.serviceId`、`knowledge.serviceId` 完全相同。standalone SkillCore 的资产联动钩子使用该默认实例解析 Metadata；若省略为 `default`，Skill 本体虽可创建，随后绑定到正式 Team/Agent 时会因跨实例查找而失败。
- `TDAI_FORMAL_ASSET_IMPORT_ENABLED=1` 必须在 MemoryCore 进程启动前设置；源码在构造 gateway dependencies 时读取它。冻结 L0/L1/L2 都通过这个默认关闭的 seam 直接 seed，L0 不走公开 `/conversation/add`，因此不会触发 embedding、quota、`notifyPipeline` 或后台 L1/L2/L3 派生。
- `TDAI_SKILL_ENABLED=true` 必须在 MemoryCore 进程启动前设置。standalone 配置默认关闭可选 Skill 模块；未显式开启时 `/v3/skill/create` 虽已注册，但会按生产合同返回 `404 Skill module not enabled`。本开关只启用正式数据所需的本地 Skill 存储与查询，不启用 Skill 抽取，也不调用模型。
- Skill package 先按冻结 manifest 严格校验 `SKILL.md` 与全部 resources。若数据集为构造近邻干扰而给 Skill 指定的可见名称与上游 frontmatter `name` 不同，adapter 只把运行时 frontmatter 的该字段确定性改成 restore plan 已冻结的名称。若已验证的上游 `description` 超过生产 API 的 1024 字符上限，则改用 plan 中已冻结的简短 description；当前全量审计只命中 `T12-SKILL-PG-MIGRATION`。正文和 resources 不变，receipt 记录 source/runtime entry hash、名称、description 长度/hash 和规范化标记。这样生产 API 与冻结 Gold 使用同一资产语义，且所有 Prompt Variant 共享相同资产状态。
- MemoryKnowledge 必须以 `KNOWLEDGE_AUTO_SYNC_ENABLED=false` 和 `TDAI_FORMAL_PREFLIGHT_ENABLED=1` 启动。R05 通过默认关闭的 formal-ready shell 模式只恢复任务一需要的 Code Graph 元数据与可见性，不 clone/index 仓库正文；同 Team、同仓库的不同冻结 Knowledge 资产仍使用 formal asset id 保持为不同 runtime shell。`Restore` 成功后会停在 `wait-for-knowledge-ready`；用户确认全部可见 code-graph 已为 `ready` 后，在同一服务实例、同一数据栈和同一 RunRoot 上执行 `Inspect`。
- `TDAI_FORMAL_PREFLIGHT_ENABLED=1` 必须在 MemoryProxy 进程启动前设置；preflight route 的默认依赖在模块加载时读取它。
- MemoryProxy 必须以实际 config、`--tool-prompt-profile legacy --experiment-read-only` 启动。
- MemoryCore `/health` 必须为 `status=ok`，并报告 vector store 可用；MemoryKnowledge `/health` 必须为 `status=ok`。R05 不要求 embedding service：正式资产由默认关闭的导入 seam 精确恢复，任务一也不评价向量召回质量。本地推荐配置可保持 `embedding.provider=none`，避免引入无关模型调用或外部服务差异。
- MemoryProxy `/health` 必须报告 V0 `legacy`、官方 ChatGPT Codex upstream、`client-passthrough`、实际 config hash，以及全部 read-only 开关为真。
- 三个服务必须指向本轮专用且最初为空的数据库/目录/namespace。具体 SQLite、Redis、COS 或其他后端参数由本地部署决定，不能由评测脚本猜测。

MemoryProxy 的源码可验证启动形态为：

```powershell
$env:TDAI_FORMAL_PREFLIGHT_ENABLED = "1"
Set-Location (Join-Path $ExecutionRoot "MemoryProxy")
npm start -- --config $Config --tool-prompt-profile legacy --experiment-read-only
```

### 4.1 本任务可直接使用的最小本地配置

仓库内提供 [`r05-v0-read-only.config.example.yaml`](./r05-v0-read-only.config.example.yaml)。它只启用任务一所需的三类注入和 Session Init，使用进程内 ProxyStorage，并关闭 Langfuse、ClickHouse、Redis、rate limit、cost guard、资产反思、抽取和写路径。官方 Codex upstream 固定为 `https://chatgpt.com/backend-api/codex`，`apiKey` 为空，因此仍由客户端透传现有 provider 凭据，不读写 Codex 的 `auth.json`。

实际运行前把模板复制到仓库外，例如 `D:\task1-formal-config\v0-read-only.yaml`，只替换：

- `__TASK1_R05_RUNTIME_SERVICE_ID__`：本轮唯一 Space/Memory instance id；
- `__TASK1_R05_LOCAL_CORE_KEY__`：本轮 disposable loopback gateway key。它不是 Codex/ChatGPT token，也不是 Memory user key。

这两个值确定后，actual YAML 从 MemoryProxy 启动到 `Inspect` 完成都不得再修改。当前 Proxy loader 不对 `tdai.apiKey`、`skill.serviceToken`、`knowledge.serviceToken` 做环境变量插值，因此不要把未展开的 `${...}` 写入模板，也不要为了隐藏一个本机一次性 key 新增配置框架。

推荐三个独立 PowerShell 终端都只做进程级 PATH 覆盖，不改系统 Node，也不改 Codex 配置：

```powershell
$Node22Home = "D:\task1-runtimes\node-v22-npm\node_modules\node\bin"
$Npm22Bin = "D:\task1-runtimes\node-v22-npm\node_modules\.bin"
$env:Path = "$Node22Home;$Npm22Bin;$env:Path"
node --version   # 必须为 v22.x
```

MemoryCore 终端使用独立 StackRoot；注意它不能放在尚未创建的 `$RunRoot` 下面：

```powershell
$ExecutionRoot = "D:\projects\TencentDB-Agent-Memory-task1-measurement-v2"
$CampaignId = "task1-r05-candidate-base-r1"
$StackRoot = "D:\task1-formal-stacks\$CampaignId"
$RuntimeServiceId = "task1-r05-space-candidate-base-r1"
$LocalCoreKey = "<本轮 disposable local key>"

$env:TDAI_GATEWAY_CONFIG = Join-Path $ExecutionRoot "MemoryCore\tdai-gateway.standalone.yaml"
$env:TDAI_DATA_DIR = Join-Path $StackRoot "core"
$env:TDAI_METADATA_SQLITE_BASE_DIR = Join-Path $StackRoot "core-metadata"
$env:TDAI_GATEWAY_API_KEY = $LocalCoreKey
$env:TDAI_INSTANCE_ID = $RuntimeServiceId
$env:TDAI_FORMAL_ASSET_IMPORT_ENABLED = "1"
$env:TDAI_SKILL_ENABLED = "true"
Set-Location (Join-Path $ExecutionRoot "MemoryCore")
node --import tsx src/gateway/server.ts
```

MemoryKnowledge 终端：

```powershell
$ExecutionRoot = "D:\projects\TencentDB-Agent-Memory-task1-measurement-v2"
$CampaignId = "task1-r05-candidate-base-r1"
$StackRoot = "D:\task1-formal-stacks\$CampaignId"
$env:PORT = "8421"
$env:KNOWLEDGE_DATA_DIR = Join-Path $StackRoot "knowledge"
$env:KNOWLEDGE_DB_PATH = Join-Path $StackRoot "knowledge\knowledge.db"
$env:KNOWLEDGE_PUBLIC_BASE_URL = "http://127.0.0.1:8421/v3"
$env:KNOWLEDGE_AUTO_SYNC_ENABLED = "false"
$env:KNOWLEDGE_CLICKHOUSE_ENABLED = "false"
$env:TDAI_FORMAL_PREFLIGHT_ENABLED = "1"
Set-Location (Join-Path $ExecutionRoot "MemoryKnowledge")
npm run dev
```

MemoryProxy 终端（`$Config` 已从模板生成并冻结）：

```powershell
$ExecutionRoot = "D:\projects\TencentDB-Agent-Memory-task1-measurement-v2"
$Config = "D:\task1-formal-config\v0-read-only.yaml"
$env:TDAI_FORMAL_PREFLIGHT_ENABLED = "1"
Remove-Item Env:TDAI_TOOL_PROMPT_DIAGNOSTIC -ErrorAction SilentlyContinue
Set-Location (Join-Path $ExecutionRoot "MemoryProxy")
npm start -- --config $Config --tool-prompt-profile legacy --experiment-read-only
```

MemoryCore 启动后，在第四个终端为本轮 Space 建立 admin，再用 admin 建普通评测用户。正式 R05 和后续模型实验使用普通用户，不使用 system admin；admin 自动生成的默认 Team/Agent 对普通用户不可见，不进入正式可见资产集合：

```powershell
$CoreBase = "http://127.0.0.1:8420"
$Headers = @{
  Authorization = "Bearer $LocalCoreKey"
  "x-tdai-service-id" = $RuntimeServiceId
}
$Admin = Invoke-RestMethod -Method Post `
  -Uri "$CoreBase/v3/internal/meta/user/init-admin" `
  -Headers $Headers -ContentType "application/json" `
  -Body (@{ username = "task1-r05-admin" } | ConvertTo-Json)
$AdminKey = $Admin.data.user_key

$UserHeaders = $Headers.Clone()
$UserHeaders["x-tdai-user-key"] = $AdminKey
$User = Invoke-RestMethod -Method Post `
  -Uri "$CoreBase/v3/meta/user/create" `
  -Headers $UserHeaders -ContentType "application/json" `
  -Body (@{ username = "task1-r05-eval" } | ConvertTo-Json)
$env:TDAI_EVAL_USER_KEY = $User.data.default_user_key

$Auth = Invoke-RestMethod -Method Post `
  -Uri "$CoreBase/v3/meta/auth/verify" `
  -Headers $Headers -ContentType "application/json" `
  -Body (@{ user_key = $env:TDAI_EVAL_USER_KEY } | ConvertTo-Json)
$env:TDAI_FORMAL_RUNTIME_AUTH_USER_ID = $Auth.data.user.user_id
$env:TDAI_FORMAL_MEMORY_CORE_API_KEY = $LocalCoreKey
```

不要打印或另存 `$AdminKey`、`TDAI_EVAL_USER_KEY`；关闭这个终端即可清除普通用户 key 的进程环境。R05 完成后停止三服务并保留证据目录；StackRoot 是否保留只影响复查，不得在同一 Campaign 中重建或追加正式资产。

MemoryCore 和 MemoryKnowledge 仍按现有本地 `server_team` 方式人工启动。脚本不会运行 Docker、启动/停止服务、安装依赖或修改 config。

## 5. 一次性运行环境

以下值只在本次服务/命令进程环境中设置。`TDAI_EVAL_USER_KEY` 不写入 YAML、JSON、日志或 Git。`TDAI_FORMAL_MEMORY_CORE_API_KEY` 对 adapter/inspector 仍只走环境变量；同值作为 MemoryProxy 调用 Core 的服务 token 存在仓库外 actual YAML 中，且只能是本轮 disposable loopback key，不能复用 Codex provider token 或用户 key。

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
$env:TDAI_FORMAL_MEMORY_CORE_API_KEY = "<仅在当前终端输入的MemoryCore gateway key>"
$env:TDAI_EVAL_USER_KEY = "<仅在当前终端输入>"
```

`$FrozenDataRoot` 必须是 `task1-data-formal-v1.1` 的独立只读 checkout，供 Skill manifest hash 匹配真实 `SKILL.md` 和资源文件；不能指向 raw source copy，也不能指向正在开发的数据分支。

服务启动时必须额外满足：

- MemoryCore：`TDAI_FORMAL_ASSET_IMPORT_ENABLED=1`，仅开放 R05 的 L0/L1/L2 seed seam。
- MemoryKnowledge：`KNOWLEDGE_AUTO_SYNC_ENABLED=false`、`TDAI_FORMAL_PREFLIGHT_ENABLED=1`；preflight 要求 scheduler disabled/idle，并逐个确认 formal-ready shell 为 `ready`。该模式不恢复或评价 Knowledge 正文。
- MemoryProxy：`TDAI_FORMAL_PREFLIGHT_ENABLED=1`，并用 `--experiment-read-only` 启动。
- MemoryProxy health：`extractionDisabled=true`、`tdaiL0WriteDisabled=true`、`skillLlmWriteDisabled=true`、`analyseMarkerDisabled=true`、`ready=true`。
- MemoryProxy 仍使用现有官方 ChatGPT Codex endpoint 和 client-passthrough 登录；不改 `auth.json`，不 login/logout。
- 三个服务均使用本次专用、最初为空的数据目录/数据库。不要指向日常开发 SQLite、旧 SessionStore、旧 Redis/COS namespace。

R05 不自动启动 Docker 或服务，避免影响当前 Codex 登录态；按现有 `server_team` 本地启动方式人工启动后再执行下述命令。
R05 完成后停止这套专用 blank stack；再次启动 MemoryCore 时不要保留 `TDAI_FORMAL_ASSET_IMPORT_ENABLED=1`。这是默认关闭 seam 的操作边界，不引入额外认证或服务框架。
运行 R05 的 Node 22 终端在 `Inspect` 成功后直接关闭，或执行 `Remove-Item Env:TDAI_FORMAL_MEMORY_CORE_API_KEY`；后续模型实验不要从仍持有该 key 的终端启动。

## 6. 推荐入口：同一脚本分两阶段运行（0 模型）

三个服务已经由用户启动并确认使用专用空白数据栈后，在另一个 Node 22 终端设置 user key 与独立的 MemoryCore API key。先对 `Restore` 做本地 dry-run；它只校验 Node、Git、tag、config、依赖路径与新 RunRoot，不联系服务、不建目录：

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

& $GateScript @GateArgs -Stage Restore -DryRun
```

确认输出中的 commit、tag、config hash、冻结 selection 和新 `RunRoot` 后，执行一次 `Restore`：

```powershell
$env:TDAI_FORMAL_MEMORY_CORE_API_KEY = "<只在当前终端输入>"
$env:TDAI_EVAL_USER_KEY = "<只在当前终端输入>"
& $GateScript @GateArgs -Stage Restore
```

`Restore` 会恢复一次 Dev 资产、生成 12 条 PrepareOnly manifest，写入 create-new 的 `r05-restore-stage.json`，然后以 `stage=wait-for-knowledge-ready` 正常退出。此时不能再次执行 `Restore`。等待 MemoryKnowledge 完成异步建图，由用户确认全部可见 code-graph 已为 `ready`，再复用原参数运行 `Inspect`：

```powershell
& $GateScript @GateArgs -Stage Inspect -DryRun
& $GateScript @GateArgs -Stage Inspect -KnowledgeReadyConfirmed
```

`Inspect` 要求原 RunRoot 与 restore-stage handoff 已存在，并核对代码、数据、config、服务 URL、Runtime ID、MemoryProxy 实例、MemoryKnowledge 实例和全部既有文件 hash。它不会再次构造 restore plan、恢复资产或覆盖证据。

两阶段依次完成并核验：

1. Node 22、代码/数据 worktree clean、annotated data tag、冻结 checkout、config/本地依赖。
2. 三服务 health 与 MemoryCore auth 映射；这些检查在创建输出目录、恢复资产之前完成。
3. create-new restore plan；在 restore 前独立断言 canonical `planSha256=6a15b1981ecf506c9650e2dd9d918bc63cf18b39c79f3da0849d279d61c24b0d`、318 actions、209 requirements、284 assets，然后只恢复一次 Dev 资产。
4. restore 后独立断言外层 `operation=restore`、`verification=unverified`、`formalMetricEligible=false`、`readyForFormalMeasurement=false`，以及内层 receipt `complete=true`、318 actions、209 requirements；adapter 不能自我授信。
5. `Restore` 只生成冻结登记表中的 12 条 V0 Smoke PrepareOnly；在退出前断言精确 case 集合、`repeat=1`、非空且唯一的 `run_id`/`session_id`，不执行任何模型命令。
6. `Restore` 写 create-new handoff 并停在 `wait-for-knowledge-ready`。等待期间不运行脚本，不重复 restore。
7. `Inspect` 先验证 handoff、服务实例和全部既有文件 hash，再在每个 prepared run 的 read-back 前确认 MemoryKnowledge auto-sync disabled/idle，且该 run 可见 code-graph 均为 `ready`；随后执行真实 inspect 和无模型 Session Init。
8. 独立 evaluator 生成六项全 pass 的 create-new receipt。
9. 再次校验 config hash、三服务 health、auth mapping，以及 MemoryProxy/MemoryKnowledge 实例没有漂移。
10. 写 summary 前再次断言 `RepositoryRoot`/`FrozenDataRoot` clean、代码 HEAD、数据 HEAD、annotated tag object 和 peeled commit 均与 Restore 阶段一致。
11. 只有 12/12 receipt 为 `ready=true` 才以 `FileMode.CreateNew` 写 `r05-runtime-preflight-summary.json`；summary 保存 handoff、plan/restore 合同、plan/restore/manifest/inspect/receipt 文件 hash、冻结 Dev Smoke selection hash、12 个 case ID 和 final Git locks。

输出结构固定为：

```text
<RunRoot>/
├── r05-restore-stage.json             # Restore 完成后写入，状态为 wait-for-knowledge-ready
├── evidence/
│   ├── dev-restore-plan.json
│   ├── dev-restore-observations.json
│   ├── inspect/<run-id>.json          # 12
│   └── preflight/<run-id>.json        # 12
├── prepared/<dataset>/<campaign>/.../run-manifest.json  # 12
└── r05-runtime-preflight-summary.json
```

`Restore` 成功后的 ready 等待是正常暂停点，继续使用同一 blank stack、CampaignId 与 RunRoot。restore 失败、身份锁不一致或已有 Inspect 证据时，脚本立即停止且不覆盖文件；这类失败保留原目录，再换新的 blank stack、CampaignId 与 RunRoot。

以下第 7～11 节保留为逐步审计说明和人工定位故障的等价命令；正常执行只使用上面的同一脚本，按 `Restore`、人工确认 ready、`Inspect` 的顺序运行。

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
planSha256    6a15b1981ecf506c9650e2dd9d918bc63cf18b39c79f3da0849d279d61c24b0d
actions       318
requirements  209
assets         284
```

`Restore` 阶段会在恢复资产前解析该 JSON 并 fail closed；不能只相信构造命令的退出码。命令使用 `flag=wx`；目标已存在会失败，不能覆盖。

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
planSha256 = 6a15b1981ecf506c9650e2dd9d918bc63cf18b39c79f3da0849d279d61c24b0d
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

PrepareOnly 为每条 case 生成独立 opaque session id 和公开 expected binding；`Restore` 阶段会在写 handoff 前核验 case 集合、`repeat=1`、12 个非空唯一 `run_id` 和 12 个非空唯一 `session_id`。它不打开 private Gold，不执行 Codex。

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

检查器执行顺序固定为：auth → runtime ID 映射 → Knowledge 稳定性检查 → Metadata/全部资产只读回读 → 无模型 Session Init。只有前面的检查全部成功才注册 opaque Session，避免某个坏资产先消耗 fresh namespace。

真实回读路径为：

- L0：`/v3/conversation/query`
- L1：`/v3/atomic/query`
- L2：`/v3/scenario/read`
- L3：`/v3/core/read`
- Skill：逐冻结 Skill 名称调用 `/v3/skill/search`，`scope=team`
- Knowledge：先读 `/v3/auto-sync/status`，再对可见 code-graph 调 `/v3/code-graph/get` 要求 `ready`，最后用 `/v3/meta/agent-fixed-asset/list-with-detail` 验证当前 Agent 可见性

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

12 条 preflight selection 全部得到 create-new `ready=true` receipt、final Git locks 通过且 summary 已生成后，R05 blank-stack preflight 才通过。此时 Selection Contract 与 freeze manifest 已经存在于受测提交；不得再修改 HEAD，只给该精确提交打 Measurement-v2/candidate-base tag。之后才执行 **E01/R04 V0 runtime smoke**（12 次 Luna）和完整 Dev。

普通 Prompt 设计或措辞变化不重跑公共 Gate：它们从 tagged candidate-base 建立各自的后代 branch/worktree，为自己的 commit/config/profile 创建全新的 prepared run、Session、run-specific receipt 和结果证据。只有修改 adapter、runner、scorer、restore 或 preflight 基础设施时，公共 Gate 才必须在新的 provisional common-base 上重跑。不得复用其他方法已消费的 Session/result。

历史 R02 acceptance 审计的最终输入是 `codex/task1-r02-acceptance-v1` @ `bf19d1e6a8eaf69785ee015b047d1413de0a6f95`；其 ancestry 包含首次清单提交 `6b459b5`。本 Runtime Gate 分支只引用最终 tip，不 cherry-pick、squash 或直接合入：该审计基于历史 R02，清单也明确标记 `HISTORICAL_R02_ATTESTED_DOWNSTREAM_GATE_REQUIRED`，最新提交再补了 fail-closed provenance 修正。最终 common-base 必须以 non-squash 合并保留其 ancestry，在解决到 R05-compatible scorer 后重新捕获 freeze，并实际通过当前 TypeScript D0 Gate；历史 41/42 不能改写成 PASS，历史 R05 support 测试数也不能代替当前 D0 Gate。

最终结果包必须保存并比较：

- 最短充分工具决策链完成率、有效调用率/漏调用率、误调用率。
- 工具 family/terminal 选择正确率、ToolSPL、overcall、malformed/retry 等诊断指标。
- Static injected tool tokens、Provider input/output/cached tokens、cache write/read 证据。
- 每个 Variant、case、repeat、模型、reasoning effort、代码/data/config fingerprint 和全部 raw receipt/hash。

R05 通过不代表任务一实验或任何创新已经成功，只代表可被所有创新复用的真实资产适配、预检编排与公平性前置能力已经具备。
