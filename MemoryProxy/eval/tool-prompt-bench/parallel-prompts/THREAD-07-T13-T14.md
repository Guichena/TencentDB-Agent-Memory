# 建设任务 07：T13 与 T14

你是 Task 1 Hidden 数据的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T13 可观测性与故障定位 Team 分片；完成 T14 云原生交付 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成；你作为 Sol 负责人，亲自完成源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

本任务与另外七个建设任务并行。不得等待前五个任务先合并，也不得创建 400 条中间数据集。八个建设任务全部完成后，集成任务才一次性生成 16 个 Team、640 条 case 的 `formal-v1`。

启动前置：只能从不可变 Tag `task1-data-parallel-launch-16team-v1` 创建 worktree。schema 基线 Tag `task1-data-parallel-baseline-v2` 必须解引用到 `1048681880b51e7a52a6b8b0b731eadeec44e118`，数据内容祖先固定为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，两者都必须是启动 HEAD 的祖先。launch Tag 的提交值动态解析。任一启动检查失败都停止并报告，不得绕过。

开始任何写操作前，必须创建或进入本任务专用 worktree：

```powershell
$taskBranch = "codex/task1-data-build-16team-t13-t14"
$taskWorktree = "D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t13-t14"
$launchTag = "task1-data-parallel-launch-16team-v1"
if (Test-Path -LiteralPath $taskWorktree) { throw "target worktree path already exists; verify ownership instead of overwriting it" }
if (git branch --list $taskBranch) { throw "target branch already exists; inspect git worktree list --porcelain before continuing" }
git worktree add -b $taskBranch $taskWorktree $launchTag
Set-Location -LiteralPath $taskWorktree
$launchCommit = git rev-parse "$($launchTag)^{commit}"
if ($LASTEXITCODE -ne 0) { throw "launch tag cannot be resolved" }
$headCommit = git rev-parse HEAD
if ($headCommit -ne $launchCommit) { throw "worktree HEAD does not match launch tag" }
$schemaCommit = git rev-parse "task1-data-parallel-baseline-v2^{commit}"
if ($schemaCommit -ne "1048681880b51e7a52a6b8b0b731eadeec44e118") { throw "unexpected schema baseline commit" }
git merge-base --is-ancestor $schemaCommit HEAD
if ($LASTEXITCODE -ne 0) { throw "schema baseline is not an ancestor of launch HEAD" }
git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD
if ($LASTEXITCODE -ne 0) { throw "data content baseline is not an ancestor of launch HEAD" }
if (git status --short) { throw "worktree is not clean at startup" }
```

如果已经位于目标目录，不重复创建，只运行 Tag、HEAD、祖先、分支和干净状态校验。创建后所有文件和命令都必须以 `$taskWorktree` 为工作目录；无法转到该路径时，停止并让用户从该 worktree 重新打开任务。目标路径或分支已存在但不属于本任务时，禁止删除、移动、接管或切换它。

开始前完整阅读运行手册、并行 README、`DRAFT-SCHEMA.md`、`worlds/formal-schema.ts`、`registry/teams/T13.json` 和 `registry/teams/T14.json`，并亲自核对生产 Memory、Skill、Knowledge 路由源码。不要完整读取当前 `formal-v1.json`，因为其中包含 Dev pilot 正文；如需确认对象形状，只能使用 schema 类型和不输出 Query、上下文、资产内容、Gold 的结构提取。当前全局合同仍是 pilot，不代表最终数量合同，也不能修改；最终 16-Team 合同由集成任务重建。

只允许读取 Dev 的 schema、分类数量合同和通用验证规则。禁止复制或改写 Dev 的 Query、上下文、信息缺口、资产摘要、Gold 或 pair 句式，也禁止读取其他 Hidden 建设任务生成的 case 正文。启动 Gate 通过后立即开始 T13，并持续做到 T13 Gate 和独立提交；不要只汇报计划后停止。

## 写入边界

只允许写入：

- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-07/T13/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-07/T14/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T13/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T14/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T13/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T14/**`

禁止修改全局合同、总状态、provider、snapshot、sealed manifest、Prompt 代码、运行配置和其他 Team。

## Team 内容

T13 主题为可观测性与故障定位，覆盖 metrics、logs、traces、告警关联、性能剖析和事故诊断。T14 主题为云原生交付，覆盖 Kubernetes、Helm、GitOps、容器构建、发布策略和配置漂移。每个 Team 维护 3 至 6 个并行项目流，构造丰富历史会话、项目 Memory、内部 Knowledge、目标资产和同域干扰；不能批量套用同一故障模板。

目标 Skill 和干扰 Skill 必须来自普通 GitHub 搜索找到的真实仓库文件，Star 数不设门槛。Sol 在调用 Luna 前冻结 repository URL、commit SHA、path、license 和 raw file SHA-256；无明确许可证的候选不得进入正式池。Luna 不得凭空编写 Skill，只能基于冻结文件适配宿主工具名、listing description、`use_when` 和 `do_not_use_when`，核心技术步骤保持不变。Memory、会话、项目历史和内部 Knowledge 可以合成。不要安装依赖或运行来源仓库测试。

## 数量与流程

每个 Team 固定 40 条：6 条 Memory Positive、6 条 Skill Positive、3 条 Knowledge Positive、15 条一一配对的 No-tool Negative 和 10 条自然 Coding Negative。至少 10 个 Positive 需要 search 或 discovery，另外 5 个可为直接调用；不能让答案在首屏注入中直接可见。

每个 Team 依次完成 input pack、三类试验 pair、Luna 扩批、Sol 复核、Team staging 和本地 Gate。每批使用 `validate-luna-batch.mjs <batch-dir> <family-or-natural-negative> <expected-count> <team-id> <stage>` 做格式检查，但 Sol 必须另外复核 Gold、资产可见性、唯一信息缺口和完整最小调用链。Luna 只能写唯一 generator 批次目录，不能看到或写最终 Gold；Sol 才能写 staging。T13 Gate 通过并独立提交后，重新检查写入范围、分支和基线，再开始 T14；T14 也独立提交。

只验证 Task 1 所需的结构、完整最小调用链、pair 单变量、资产可见性、真实干扰、检索压力和 provider 泄漏。禁止 official patch、上游依赖安装、上游测试、合成历史逐句来源闭环和正式模型评测。

最终报告只列 T13、T14 各自的提交、分类数量、pair 数、Luna 批次、Skill 外部来源、Gold 链路分布、Gate、输出路径和待集成问题。不得在普通报告中展开 Hidden Query、上下文或 Gold，不得修改全局状态，也不得自行合并。
