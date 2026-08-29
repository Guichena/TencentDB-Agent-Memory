# 建设任务 02：T03 与 T04

你是 Task 1 正式数据集的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T03 ML 工程 Team 分片；完成 T04 Java 后端 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

固定基线与唯一映射：数据内容祖先为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`；唯一启动 Tag 为 `task1-data-parallel-baseline-v2`；Tag 解引用提交必须为 `1048681880b51e7a52a6b8b0b731eadeec44e118`；分支为 `codex/task1-data-build-v2-t03-t04`；专用 worktree 为 `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04`。从该 Tag 创建 worktree 后，运行 `git status --short --branch -uall`、`git branch --show-current`、`git worktree list --porcelain`、`git rev-parse "task1-data-parallel-baseline-v2^{commit}"` 和 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD`。工作树必须干净，路径必须绑定上述分支，Tag 结果必须严格等于上述提交，祖先检查必须以 0 退出；任一失败都停止，不得从 v1 或旧分支施工，也不得删除、移动或接管已有 worktree。

开始前完整阅读 `TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`、`parallel-prompts/README.md`、T01 的 draft schema 和当前正式合同，并亲自核对生产 Memory/Skill/Knowledge 路由源码。先只读检查 Git；期望分支为 `codex/task1-data-build-v2-t03-t04`，期望路径为 `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04`。分支、基线或 worktree 不符时停止报告，不要操作共享工作树。

你只能写 `generators/parallel/build-02/T03/**`、`generators/parallel/build-02/T04/**`、`staging/teams/T03/**`、`staging/teams/T04/**` 和对应 `source-material/T03|T04/**`。禁止修改全局合同、总状态、provider、snapshot、Prompt 代码、运行配置和其他 Team。

主任务一完成 T03：主题为 DVC、论文复现、GRPO 和 MONAI，干扰覆盖环境复现、Notebook、RL 诊断、CLI 和测试。主任务二完成 T04：主题为 Jakarta、RestClient 和 Maven 构建，干扰覆盖 namespace、HTTP client、安全及不同 Maven 根因。两个 Team 都维护 3 至 6 个并行项目流，不能用同一故障模板做术语替换。

每个 Team 依次完成 input pack、Memory/Skill/Knowledge 三类试验 pair、Luna 扩批、Sol 复核、Team staging 和本地 Gate。一个 Team 目标 15 组 pair 加 10 条自然负例。T03 Gate 通过后再开始 T04。Luna 只能写唯一 generator 批次目录；Sol 才能写 staging 和决定 Gold。

只验证 Task 1 所需的结构、唯一信息缺口、完整最小调用链、pair 单变量、资产可见性、真实干扰和 provider 泄漏。禁止提取 official patch、运行上游测试、安装上游依赖、建立合成历史的逐句来源链或运行正式模型评测。实际导入外部 Skill 才记录来源和许可证。

完成后分别提交 T03、T04 分片；提交正文和最终报告必须列出数量、Luna 批次、外部导入、Gold 链路、Gate、输出路径与待集成问题，不修改全局状态。
