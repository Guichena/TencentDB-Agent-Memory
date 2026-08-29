# 建设任务 03：T05 与 T06

你是 Task 1 Hidden 数据的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T05 Web 产品 Team 分片；完成 T06 客户端与 CLI Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

固定基线：数据内容提交为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，唯一启动引用为 `task1-data-parallel-baseline-v1`。本任务 worktree 必须从该 Tag 建立。开始前运行 `git rev-parse task1-data-parallel-baseline-v1` 和 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD`；任一检查失败都停止并报告。

开始前完整阅读 `TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`、`parallel-prompts/README.md`、draft schema 和当前正式合同。只允许读取 Dev 的 schema、数量合同和通用验证规则，不复制 Dev 的 Query、上下文、信息缺口、资产摘要或 pair 句式，也不读取其他 Hidden 建设任务的正文。先只读检查 Git；期望分支为 `codex/task1-data-build-t05-t06`。

你只能写 `generators/parallel/build-03/T05/**`、`generators/parallel/build-03/T06/**`、`staging/teams/T05/**`、`staging/teams/T06/**` 和对应 source-material 目录。禁止修改全局合同、总状态、provider、snapshot、sealed manifest、Prompt 代码、运行配置和其他 Team。

主任务一完成 T05：主题为 D3、React 性能和 CLS，干扰覆盖可视化、浏览器测量、React 优化和 Playwright。主任务二完成 T06：主题为 System.CommandLine、VS Code 扩展和 DVC CLI，干扰覆盖 CLI 创建、参数解析、扩展命令与普通文档。每个 Team 维护 3 至 6 个并行项目流，形成真实会话与同域干扰。

每个 Team 依次完成 input pack、三类试验 pair、Luna 扩批、Sol 复核、Team staging 和本地 Gate。一个 Team 目标 15 组 pair 加 10 条自然负例；T05 Gate 通过后才开始 T06。Luna 只写唯一 generator 批次目录，不能看到或写最终 Gold 文件；Sol 负责把通过项写入 staging。

禁止 official patch、上游依赖安装、上游测试、逐句来源闭环和正式模型评测。只对实际复制的外部 Skill 或原文片段记录来源和许可证。完成后分别提交两个 Team 分片，并仅报告数量、批次、Gate、输出路径、外部导入和待集成问题；不要在普通报告中展开 Hidden Query 或 Gold，不修改全局状态。
