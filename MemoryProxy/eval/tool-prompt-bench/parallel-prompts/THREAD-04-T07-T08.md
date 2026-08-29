# 建设任务 04：T07 与 T08

你是 Task 1 Hidden 数据的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T07 SDK 与集成 Team 分片；完成 T08 测试质量 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

固定基线与唯一映射：数据内容祖先为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`；唯一启动 Tag 为 `task1-data-parallel-baseline-v2`；Tag 解引用提交必须为 `1048681880b51e7a52a6b8b0b731eadeec44e118`；分支为 `codex/task1-data-build-v2-t07-t08`；专用 worktree 为 `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t07-t08`。从该 Tag 创建 worktree 后，运行 `git status --short --branch -uall`、`git branch --show-current`、`git worktree list --porcelain`、`git rev-parse "task1-data-parallel-baseline-v2^{commit}"` 和 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD`。工作树必须干净，路径必须绑定上述分支，Tag 结果必须严格等于上述提交，祖先检查必须以 0 退出；任一失败都停止，不得从 v1 或旧分支施工，也不得删除、移动或接管已有 worktree。

开始前完整阅读 `TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`、`parallel-prompts/README.md`、draft schema 和当前正式合同。只读取 Dev 的通用结构和验证规则，不复制其具体内容，也不读取其他 Hidden 建设任务正文。先只读检查 Git；期望分支为 `codex/task1-data-build-v2-t07-t08`，期望路径为 `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t07-t08`。

你只能写 `generators/parallel/build-04/T07/**`、`generators/parallel/build-04/T08/**`、`staging/teams/T07/**`、`staging/teams/T08/**` 和对应 source-material 目录。全局合同、总状态、provider、snapshot、sealed manifest、Prompt 代码、运行配置和其他 Team 均为只读。

主任务一完成 T07：主题为 Microsoft Graph、Qdrant 和 API client，干扰覆盖 SDK、认证、Jest、普通 REST 与向量处理。主任务二完成 T08：主题为 pytest coverage、Jest 和 Playwright，干扰覆盖单测、覆盖率、E2E、构建失败与浏览器探索。两者必须有不同的项目结构、语言分布和信息缺口，不能共享同一 pair 模板。

每个 Team 按 input pack、三类试验 pair、Luna 扩批、Sol 复核、Team staging、本地 Gate 的顺序施工。一个 Team 目标 15 组 pair 加 10 条自然负例；T07 Gate 通过后才开始 T08。Luna 只写唯一 generator 批次目录，Sol 才能写 staging、决定完整最小链路和最终 Gold。

禁止 official patch、上游依赖安装、上游测试、合成历史逐句来源链和正式模型评测。实际导入外部 Skill 才记录来源、许可证、路径和 hash。完成后分别提交两个 Team 分片，只报告数量、Luna 批次、Gate、外部导入、输出路径和待集成问题，不修改全局状态，也不在普通报告中泄露 Hidden Query 或 Gold。
