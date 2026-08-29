# 建设任务 03：T05 与 T06

你是 Task 1 Hidden 数据的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T05 Web 产品 Team 分片；完成 T06 客户端与 CLI Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

启动前置：阶段 A 已完成。建设任务只能从不可变启动 Tag `task1-data-parallel-launch-v2` 创建 worktree；schema 基线 Tag `task1-data-parallel-baseline-v2` 必须解引用到 `1048681880b51e7a52a6b8b0b731eadeec44e118`，且该提交必须是启动 HEAD 的祖先。启动 Gate 通过后必须立即开始工作。

固定基线：数据内容祖先为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，schema 基线提交为 `1048681880b51e7a52a6b8b0b731eadeec44e118`，唯一启动引用为 `task1-data-parallel-launch-v2`。launch Tag 的提交值不硬编码在同一提交内；创建 worktree 后动态比较当前 HEAD 与 `task1-data-parallel-launch-v2^{commit}`。工作树必须干净，当前路径必须绑定预期分支，两个祖先检查必须以 0 退出；任一检查失败都停止并报告。

开始任何写操作前，必须创建或进入本任务专用 worktree。若当前目录不是目标目录，先在当前仓库执行：

```powershell
$taskBranch = "codex/task1-data-build-v2-t05-t06"
$taskWorktree = "D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t05-t06"
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

开始前完整阅读 `MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`、`MemoryProxy/eval/tool-prompt-bench/parallel-prompts/README.md`、`MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/DRAFT-SCHEMA.md` 和 `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json`。只允许读取 Dev 的 schema、数量合同和通用验证规则，不复制 Dev 的 Query、上下文、信息缺口、资产摘要或 pair 句式，也不读取其他 Hidden 建设任务的正文。期望分支为 `codex/task1-data-build-v2-t05-t06`。

上述启动 Gate 全部通过后，立即开始 T05 主任务一并持续做到 T05 Gate 和独立提交；不要只汇报计划后停止。只有遇到无法从源码、冻结输入或本任务材料解决的真实阻塞时，才向用户请求处理。

你只能写 `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-03/T05/**`、`MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-03/T06/**`、`MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T05/**`、`MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T06/**` 和对应 `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T05/**`、`T06/**`。禁止修改全局合同、总状态、provider、snapshot、sealed manifest、Prompt 代码、运行配置和其他 Team。

主任务一完成 T05：主题为 D3、React 性能和 CLS，干扰覆盖可视化、浏览器测量、React 优化和 Playwright。主任务二完成 T06：主题为 System.CommandLine、VS Code 扩展和 DVC CLI，干扰覆盖 CLI 创建、参数解析、扩展命令与普通文档。每个 Team 维护 3 至 6 个并行项目流，形成真实会话与同域干扰。

两个 Team 的目标 Skill 和干扰 Skill 都必须来自普通 GitHub 搜索找到的真实仓库文件。Star 数不设门槛。Sol 在调用 Luna 前冻结 repository URL、commit SHA、path、license 和 raw file SHA-256；没有明确许可证的候选不进入正式池。Luna 不得凭空编写 Skill，只能基于冻结文件适配宿主工具名、listing description、`use_when` 和 `do_not_use_when`，核心技术步骤保持不变。Memory、会话、项目历史和内部 Knowledge 可以按 Team 规则合成。不要安装来源仓库依赖或运行其测试。

每个 Team 依次完成 input pack、三类试验 pair、Luna 扩批、Sol 复核、Team staging 和本地 Gate。每批先用 `node MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/validate-luna-batch.mjs <batch-dir> <family-or-natural-negative> <expected-count> <team-id> <stage>` 做格式检查；该结果不能替代 Sol 的 Gold、可见性和完整链路复核。一个 Team 固定为 15 组 pair 加 10 条自然负例；T05 Gate 通过并单独提交后，重新检查路径范围和基线，才开始 T06。Luna 只写唯一 generator 批次目录，不能看到或写最终 Gold 文件；Sol 负责把通过项写入 staging。

禁止 official patch、上游依赖安装、上游测试、逐句来源闭环和正式模型评测。所有正式 Skill 都记录 GitHub 来源和许可证；只有直接使用其他外部原文片段时，才为该片段增加来源记录。完成后分别提交两个 Team 分片，并仅报告数量、批次、Gate、输出路径、外部导入和待集成问题；不要在普通报告中展开 Hidden Query 或 Gold，不修改全局状态。
