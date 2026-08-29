# 集成任务：合并五个建设任务

你是 Task 1 正式数据集的唯一集成负责人。你不批量生成新数据，也不调用 Luna 补数量。synthetic/external provenance 前置合同已经在 v2 schema 基线冻结；只有五个建设任务都从 `task1-data-parallel-launch-v2` 建立、提交 Team staging 并通过本地 Gate 后，才开始阶段 B 合并。

固定基线：数据内容祖先为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，唯一启动 Tag 为 `task1-data-parallel-baseline-v2`，Tag 解引用提交为 `1048681880b51e7a52a6b8b0b731eadeec44e118`。集成分支为 `codex/task1-data-integration`，专用 worktree 为 `D:\projects\TencentDB-Agent-Memory-task1-data-integration`。开始前运行 `git status --short --branch -uall`、`git branch --show-current`、`git worktree list --porcelain`、`git rev-parse "task1-data-parallel-baseline-v2^{commit}"` 和 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD`；任一检查失败都停止并报告，不切换或接管共享工作树。

从同一个冻结基线建立 `codex/task1-data-integration`。先核对五个建设分支的基线、提交、Team 所有权和变更路径。任何分支修改了全局合同、状态、provider、snapshot 或其他 Team 时，先退回该建设任务整理，不直接把冲突混入集成分支。

按 T01 至 T10 顺序导入 `formal-dataset/staging/teams/Txx/`。每次只合并一个 Team，核对 `team-fragment.json`、三类资产、review 和 gate；然后由集成代码更新全局 `formal-v1.json`、snapshot asset set 和状态文件。不要手工复制 hash，所有 content hash、provider hash、Gold hash 和 snapshot hash 都由确定性代码重新计算。

集成分三步：

1. Dev：合并 T01 至 T04，运行 schema、数量、pair、可见性、完整链路、检索压力、泄漏、重复度和两次编译一致性 Gate，得到 160 条后冻结 Dev。
2. Hidden：合并 T05 至 T10，运行同样 Gate，再运行 Dev/Hidden 跨集合 n-gram、完整句、query hash 和上下文 hash 去重，得到 240 条后生成 sealed manifest。
3. 全集：确认主集合严格为 400 条且每个 Team 严格为 40 条；额外合格 case 只进入 exploratory 集合，不进入当前 revision 主指标分母。连续恢复两次验证 snapshot，可交给真实链路无模型 Gate。正式 V0 至 V3 评测仍由实验阶段执行。

集成任务可以修复 schema 适配、引用、确定性排序、hash 和客观泄漏错误，不能自行重写建设任务的 Query、上下文、Gold 或干扰池。某个 case 不合格时，退回原建设分支定点修改，再重新集成。禁止为了工程答案提取 official patch、安装上游依赖或运行上游测试。

最终提交应分为 Dev 集成、Hidden 集成和全集冻结，不把所有变化压成一个提交。报告必须保存每个 Team 的来源类型、Luna 批次、case 分布、token 字段准备情况、provider/private Gold/snapshot hash、全部 Gate、客观修复和已知限制。
