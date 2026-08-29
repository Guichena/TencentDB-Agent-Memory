# 建设任务 06：T11 与 T12

你是 Task 1 正式数据集的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T11 移动端工程 Team 分片；完成 T12 数据库演进 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成；你作为 Sol 负责人，亲自完成源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

本任务与 build-01 至 build-05、build-07、build-08 并行建设。不得等待前五个任务先合并，也不得创建 400 条中间数据集。八个建设任务全部完成后，集成任务才一次性生成 16 个 Team、640 条 case 的 `formal-v1`。

## 启动方式：先绑定 worktree，再粘贴提示词

Codex 任务的可写工作区在任务创建时固定。`Set-Location`、`cd` 和 `git -C` 只能改变命令执行目录，不能让当前任务获得另一个 worktree 的写权限。因此，本提示词不创建 worktree，也不尝试从其他工作区切换过来。

必须新建一个 Codex 任务，并在创建任务时把工作区绑定到：

```text
D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t11-t12
```

再把本提示词完整粘贴到该新任务。不要把本提示词发给绑定原仓库、集成 worktree 或其他 Team worktree 的任务。如果任务启动时的工作区不是上述路径，立即返回 `WORKSPACE_NOT_BOUND`，要求用户新建一个绑定正确文件夹的任务。不要创建 worktree，不要执行 `Set-Location`，也不要让用户在同一个任务里发送“继续”，因为后续消息不能改变任务的可写根目录。

目标 worktree 和分支由准备任务提前创建。本任务只运行以下只读启动 Gate：

```powershell
$expectedBranch = "codex/task1-data-build-16team-t11-t12"
$expectedRoot = "D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t11-t12"
$launchTag = "task1-data-parallel-launch-16team-v1"
$currentRoot = (Resolve-Path -LiteralPath (git rev-parse --show-toplevel)).Path
$resolvedExpectedRoot = (Resolve-Path -LiteralPath $expectedRoot).Path
if ($currentRoot -ne $resolvedExpectedRoot) { throw "WORKSPACE_NOT_BOUND: create a new Codex task rooted at $expectedRoot" }
if ((git branch --show-current) -ne $expectedBranch) { throw "unexpected builder branch" }
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

任一检查失败都停止并报告，不得删除、移动、接管或切换任何 worktree。启动 Gate 全部通过后必须立即开始 T11，不要只汇报环境正常后停止。

开始前完整阅读以下文件，并亲自核对生产 Memory、Skill、Knowledge 路由源码：

- `MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`
- `MemoryProxy/eval/tool-prompt-bench/parallel-prompts/README.md`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/DRAFT-SCHEMA.md`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/teams/T11.json`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/teams/T12.json`

当前 `formal-v1.json` 只是 pilot 的对象形状和编译输入示例，其中 T01 至 T10 的全局数组不是最终 Team 数量合同。不要修改该文件，也不要据此删掉 T11 或 T12。最终合同由集成任务在八个分片全部通过后重建。

启动 Gate 全部通过后，立即开始 T11，并持续做到 T11 Gate 通过和独立提交。不要只汇报计划后停止。只有遇到无法从源码、冻结输入或本任务材料解决的真实阻塞时，才向用户请求处理。

## 写入边界

只允许写入：

- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-06/T11/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-06/T12/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T11/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T12/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T11/**`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T12/**`

禁止修改全局合同、总状态、provider、snapshot、sealed manifest、Prompt 代码、运行配置和其他 Team。

## Team 内容

T11 的主题是移动端工程，覆盖 Android/iOS 构建、生命周期、离线同步、性能与 UI 测试。T12 的主题是数据库演进，覆盖 schema migration、在线变更、索引与查询计划、数据回填和兼容性。每个 Team 维护 3 至 6 个并行项目流，构造丰富的历史会话、项目 Memory、内部 Knowledge、目标资产和同域干扰；不能用同一故障模板替换术语批量复制。

目标 Skill 和干扰 Skill 都必须来自普通 GitHub 搜索找到的真实仓库文件，Star 数不设门槛。Sol 在调用 Luna 前冻结 repository URL、commit SHA、path、license 和 raw file SHA-256；没有明确许可证的候选不进入正式池。Luna 不得凭空编写 Skill，只能基于冻结文件适配宿主工具名、listing description、`use_when` 和 `do_not_use_when`，核心技术步骤保持不变。Memory、会话、项目历史和内部 Knowledge 可以按 Team 规则合成。不要安装来源仓库依赖，也不要运行来源仓库测试。

## 数量与流程

每个 Team 固定 40 条：6 条 Memory Positive、6 条 Skill Positive、3 条 Knowledge Positive、与 15 条 Positive 一一配对的 No-tool Negative，以及 10 条自然 Coding Negative。也就是每个 Team 15 个 pair 加 10 条自然负例。至少 10 个 Positive 必须需要 search 或 discovery，另外 5 个可为直接调用；不能让完整答案在首屏注入中直接可见。

每个 Team 依次完成 input pack、Memory/Skill/Knowledge 三类试验 pair、Luna 扩批、Sol 复核、Team staging 和本地 Gate。每批先运行：

```text
node MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/validate-luna-batch.mjs <batch-dir> <family-or-natural-negative> <expected-count> <team-id> <stage>
```

格式校验不能替代 Sol 对 Gold、资产可见性、唯一信息缺口和完整最小调用链的复核。Luna 只能写唯一 generator 批次目录，不能决定或写最终 Gold；Sol 才能把通过项写入 staging。T11 Gate 通过并单独提交后，重新检查写入范围、分支和基线，再开始 T12；T12 也必须独立提交。

只验证 Task 1 所需的结构、完整最小调用链、pair 单变量、资产可见性、真实干扰、检索压力和 provider 泄漏。禁止提取 official patch、安装或测试上游项目、建立合成历史的逐句来源链，以及运行正式模型评测。

完成后报告 T11、T12 各自的最终提交、分类数量、pair 数、Luna 批次、Skill 外部来源、Gold 链路分布、Gate 结果、输出路径和待集成问题。不得修改全局状态，也不得自行合并到集成分支。
