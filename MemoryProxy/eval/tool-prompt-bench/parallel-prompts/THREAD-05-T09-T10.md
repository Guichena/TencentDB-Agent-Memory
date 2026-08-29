# 建设任务 05：T09 与 T10

你是 Task 1 Hidden 数据的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T09 安全与依赖 Team 分片；完成 T10 构建与发布 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

固定基线：数据内容提交为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，唯一启动引用为 `task1-data-parallel-baseline-v1`。本任务 worktree 必须从该 Tag 建立。开始前运行 `git rev-parse task1-data-parallel-baseline-v1` 和 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD`；任一检查失败都停止并报告。

开始前完整阅读 `TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`、`parallel-prompts/README.md`、draft schema 和当前正式合同。只读取 Dev 的结构合同和通用 Gate，不复制具体 Query、上下文、Gold 或资产摘要，不读取其他 Hidden 建设任务正文。先只读检查 Git；期望分支为 `codex/task1-data-build-t09-t10`。

你只能写 `generators/parallel/build-05/T09/**`、`generators/parallel/build-05/T10/**`、`staging/teams/T09/**`、`staging/teams/T10/**` 和对应 source-material 目录。禁止修改全局合同、总状态、provider、snapshot、sealed manifest、Prompt 代码、运行配置和其他 Team。

主任务一完成 T09：主题为 Trivy 离线审计和依赖报告，干扰覆盖扫描、CVSS 提取、CSV 报告和普通升级。主任务二完成 T10：主题为 Maven、Python build 与 release workflow，干扰覆盖生命周期、依赖、插件、CI 分析和环境搭建。安全题只评价工具路由，不要求验证真实漏洞结论；发布题也不运行真实发布。

每个 Team 依次完成 input pack、三类试验 pair、Luna 扩批、Sol 复核、Team staging 和本地 Gate。一个 Team 目标 15 组 pair 加 10 条自然负例；T09 Gate 通过后才开始 T10。Luna 只写唯一 generator 批次目录，Sol 负责 staging、完整最小链路和最终 Gold。

禁止 official patch、上游依赖安装、上游测试、真实安全扫描或发布、合成历史逐句来源链和正式模型评测。实际导入外部 Skill 才记录来源与许可证。完成后分别提交两个 Team 分片，只报告数量、批次、Gate、输出路径、外部导入和待集成问题，不修改全局状态，也不在普通报告中泄露 Hidden Query 或 Gold。
