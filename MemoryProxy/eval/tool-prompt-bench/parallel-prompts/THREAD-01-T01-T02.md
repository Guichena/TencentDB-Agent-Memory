# 建设任务 01：T01 与 T02

你是 Task 1 正式数据集的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T01 Python 可靠性 Team 分片；完成 T02 数据计算 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

启动前置：阶段 A 已完成。建设任务只能从不可变启动 Tag `task1-data-parallel-launch-v2` 创建 worktree；schema 基线 Tag `task1-data-parallel-baseline-v2` 必须解引用到 `1048681880b51e7a52a6b8b0b731eadeec44e118`，且该提交必须是启动 HEAD 的祖先。启动 Gate 通过后必须立即开始工作。

固定基线：数据内容祖先为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，schema 基线提交为 `1048681880b51e7a52a6b8b0b731eadeec44e118`，唯一启动引用为 `task1-data-parallel-launch-v2`。launch Tag 的提交值不硬编码在同一提交内；创建 worktree 后动态比较当前 HEAD 与 `task1-data-parallel-launch-v2^{commit}`。工作树必须干净，当前路径必须绑定预期分支，两个祖先检查必须以 0 退出；任一检查失败都停止并报告。

开始任何写操作前，必须创建或进入本任务专用 worktree。若当前目录不是目标目录，先在当前仓库执行：

```powershell
$taskBranch = "codex/task1-data-build-v2-t01-t02"
$taskWorktree = "D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t01-t02"
$launchTag = "task1-data-parallel-launch-v2"
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
```

如果任务启动时已经位于该目标目录，不重复创建，只运行下述校验。创建后所有文件和命令都必须以 `$taskWorktree` 为工作目录；若当前任务运行环境不能转到新路径，停止并让用户从该 worktree 重新打开任务。目标路径或分支已经存在但不属于本任务时，禁止删除、移动、接管或切换它。

开始前完整阅读：

- `MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`
- `MemoryProxy/eval/tool-prompt-bench/parallel-prompts/README.md`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/DRAFT-SCHEMA.md`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json`、T01 registry、Team registry、生产 Memory/Skill/Knowledge 路由源码。

先只读运行 `git status --short --branch -uall`、`git log -5 --oneline` 和相关校验。期望分支为 `codex/task1-data-build-v2-t01-t02`；若分支、基线或 worktree 不对，停止并报告，不要切换共享工作树，不要清理别人的文件。

上述启动 Gate 全部通过后，立即开始 T01 主任务一并持续做到 T01 Gate 和独立提交；不要只汇报计划后停止。只有遇到无法从源码、冻结输入或本任务材料解决的真实阻塞时，才向用户请求处理。

允许写入：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-01/T01/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-01/T02/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T01/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T02/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T01/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T02/**
```

禁止修改全局合同、总状态、provider、snapshot、Prompt 代码、运行配置和其他 Team。

主任务一是完成 T01。当前正式合同已有 5 组 pair、10 条 case；已有尚未接纳的 Luna 原始批次为 Memory 4 组、Skill 4 组、Knowledge 2 组、自然负例 10 条。先复核并迁移这些草稿，不要默认重生成；只有明确不合格的单项才交给 Luna 定点重写。现有 Skill 草稿还必须逐项映射到冻结的真实 GitHub Skill 文件，无法映射的草稿不能接纳，只能围绕真实 Skill 定点重写 case。清理掉的旧 Sol review 不代表草稿无效。冻结基线中这四个批次的数量和结构可读，但 manifest 里可选的 `raw_output_sha256` 与当前 `draft.json` 不一致。先核对当前 draft 是否就是要审核的冻结内容，再选择删除这两个可选 raw-output 字段，或按当前 draft 刷新二者；字段一旦保留，validator 必须严格校验。不得为了通过而跳过 hash 检查，也不得因可选元数据陈旧就重生成整批。T01 最终目标是 15 组 pair 加 10 条自然负例，并保留现有检索压力试点。

主任务二是从零完成 T02。主题是 Pandas、时间序列和 Dask 并行；项目流与干扰覆盖去趋势、并行、内存、负载均衡和 Notebook。先冻结 T02 input pack 和真实 GitHub Skill 来源，再调用 Luna 分批生成 Memory/上下文、Skill case 草稿、Knowledge/自然负例。不得把 T01 的句子换名词后复制到 T02。

两个 Team 的目标 Skill 和干扰 Skill 都必须来自普通 GitHub 搜索找到的真实仓库文件。Star 数不设门槛。Sol 在调用 Luna 前冻结 repository URL、commit SHA、path、license 和 raw file SHA-256；没有明确许可证的候选不进入正式池。Luna 不得凭空编写 Skill，只能基于冻结文件适配宿主工具名、listing description、`use_when` 和 `do_not_use_when`，核心技术步骤保持不变。Memory、会话、项目历史和内部 Knowledge 可以按 Team 规则合成。不要安装来源仓库依赖或运行其测试。

每个 Team 的顺序固定：input pack；三类试验 pair；Luna 扩批；Sol 复核；写 Team staging；运行本地 Gate。每批先用 `node MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/validate-luna-batch.mjs <batch-dir> <family-or-natural-negative> <expected-count> <team-id> <stage>` 做格式检查，再由 Sol 判断信息缺口、Gold、可见性和完整链路。T01 的 `gate.json` 通过并单独提交后，重新运行路径范围与基线检查，确认工作树只剩允许的 T02 变化，再开始 T02。每个 Luna 只写自己的唯一 generator 目录，不写 staging。所有正式 Skill 都记录 revision、license、仓库内路径和包级 hash；合成内容只记录生成批次。

不要提取 official patch、运行上游测试、安装上游依赖、构造逐句来源闭环，也不要运行正式模型评测。完成后分别提交 T01、T02 分片；提交正文写清数量、批次、外部导入、Gold 链路、Gate 和未完成项。最终只报告提交、输出路径、数量、Gate、Luna 批次和待集成问题，不修改全局状态。
