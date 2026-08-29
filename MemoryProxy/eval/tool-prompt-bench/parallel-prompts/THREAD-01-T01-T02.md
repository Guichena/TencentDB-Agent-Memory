# 建设任务 01：T01 与 T02

你是 Task 1 正式数据集的独立建设负责人。你在单独 worktree 中工作，只完成两个主任务：完成 T01 Python 可靠性 Team 分片；完成 T02 数据计算 Team 分片。批量内容必须由 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成，你负责源码核对、输入冻结、最终 Gold、逐批复核、Team Gate 和提交。

固定基线：数据内容提交为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，唯一启动引用为 `task1-data-parallel-baseline-v1`。本任务 worktree 必须从该 Tag 建立。开始前运行 `git rev-parse task1-data-parallel-baseline-v1` 和 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD`；任一检查失败都停止并报告。

开始前完整阅读：

- `MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`
- `MemoryProxy/eval/tool-prompt-bench/parallel-prompts/README.md`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/DRAFT-SCHEMA.md`
- 当前 `formal-v1.json`、T01 registry、Team registry、生产 Memory/Skill/Knowledge 路由源码。

先只读运行 `git status --short --branch -uall`、`git log -5 --oneline` 和相关校验。期望分支为 `codex/task1-data-build-t01-t02`；若分支、基线或 worktree 不对，停止并报告，不要切换共享工作树，不要清理别人的文件。

允许写入：

```text
formal-dataset/generators/parallel/build-01/T01/**
formal-dataset/generators/parallel/build-01/T02/**
formal-dataset/staging/teams/T01/**
formal-dataset/staging/teams/T02/**
formal-dataset/source-material/T01/**
formal-dataset/source-material/T02/**
```

禁止修改全局合同、总状态、provider、snapshot、Prompt 代码、运行配置和其他 Team。

主任务一是完成 T01。当前正式合同已有 5 组 pair、10 条 case；已有尚未接纳的 Luna 原始批次为 Memory 4 组、Skill 4 组、Knowledge 2 组、自然负例 10 条。先复核并迁移这些草稿，不要默认重生成；只有明确不合格的单项才交给 Luna 定点重写。清理掉的旧 Sol review 不代表草稿无效。T01 最终目标是 15 组 pair 加 10 条自然负例，并保留现有检索压力试点。

主任务二是从零完成 T02。主题是 Pandas、时间序列和 Dask 并行；项目流与干扰覆盖去趋势、并行、内存、负载均衡和 Notebook。先冻结 T02 input pack，再调用 Luna 分批生成 Memory/上下文、Skill、Knowledge/自然负例。不得把 T01 的句子换名词后复制到 T02。

每个 Team 的顺序固定：input pack；三类试验 pair；Luna 扩批；Sol 复核；写 Team staging；运行本地 Gate。T01 的 `gate.json` 通过后才开始 T02。每个 Luna 只写自己的唯一 generator 目录，不写 staging。实际导入外部 Skill 时记录 revision、license、仓库内路径和包级 hash；合成内容只记录生成批次。

不要提取 official patch、运行上游测试、安装上游依赖、构造逐句来源闭环，也不要运行正式模型评测。完成后分别提交 T01、T02 分片；提交正文写清数量、批次、外部导入、Gold 链路、Gate 和未完成项。最终只报告提交、输出路径、数量、Gate、Luna 批次和待集成问题，不修改全局状态。
