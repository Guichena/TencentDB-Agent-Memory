# Task 1 候选执行卡索引

> 状态：研究计划附件。执行卡可以先冻结，代码分支只有在本卡和总案规定的进入条件满足后才创建。

本目录把每一个测量改造、Prompt 方法和动态架构分别保存。它们不是必须全部实施的流水线，也不是一个可以任意合并的大改造包。正式决策以 `TASK1-RESEARCH-SYNTHESIS-AND-TRIAL-BACKLOG.md` 和 `TASK1-AUDIT-DECISIONS-AND-BRANCH-DAG.md` 为准。

## 共同任务边界

Task 1 只评价注入内容是否帮助模型：

1. 在需要时发起 TDAI 工具调用。
2. 选择正确 family、tool、endpoint 或 operation。
3. 在多步 case 中到达正确 terminal，并传递必要 binding。
4. 在不需要时不尝试 TDAI 工具。
5. 以更少且可追踪的注入 token、累计 provider input 和缓存成本完成上述决策。

四项交付指标是 ECR、FCR_attempt、工具选择正确率和注入 Token。它们不是指标上限。TriggerRecall、TSR、CTA、PairExact、StrictChainExact、PositiveOvercallRate、ToolSPL、顺序/等义稳定性、family floor、usage 完整性和 cache read/write 等可以作为 Task 1 辅助指标。

任何资产正文质量、最终自然语言回答质量、代码补丁正确率、完整 coding 成功率或通用 Agent 能力都不进入本目录候选的接受条件。

## 共同实验不变量

- 正式模型固定为 `gpt-5.6-luna`，reasoning effort 为 `high`。
- 正式运行必须经过真实 MemoryProxy 链路，并标记 `formalMetricEligible=true`。
- 每个 case 和 Variant 使用 fresh session、独立 run namespace 和冻结资产 snapshot。
- fresh session、资产隔离和 provider cache lane 分开记录。
- private Gold 不得由正在被评测的 Prompt 或 Compiler 生成。
- 正式候选共享冻结的 `static_parent` 和 `task1-measurement-v2`。
- 首次比较只能有一个模型可见因素。组合必须在单项分别通过后另建分支。
- Hidden 默认只运行 V0、V0-C 和一个预注册 Final。
- 每个运行保存代码 SHA、数据 Tag/hash、Gold hash、Prompt hash、模型、reasoning、trace、usage、整数分子/分母和区间输入。

## 测量模块的共同接口

M0、M1、M2 可以从 `task1-c07-pass^{commit}` 并行实现，但必须面向同一个逻辑合同：

```text
Raw real-chain trace + frozen RuntimeToolContract
                         │
                         ├─ M2: eligibility evidence, usage, isolation, cache ledger
Private Gold v2 ─────────┼─ M0: case-level chain decision score
Pair Contract v2 ────────└─ M1: pair-level counterfactual score
                                      │
                                      ▼
                         Measurement-v2 integration
```

M0 是正例成功、terminal 和 evaluationPrefix 的唯一判定者，并只输出 trace-level facts。M1 调用 M0 的结果，不复制 ECR。M2 产生 infra/isolation/usage evidence 和累计成本，不能自行定义 terminal。最终 `formalMetricEligible` 只能由集成层把 M0 trace facts 与 M2 evidence gate 合并后生成。集成分支只做这类接口接线、跨模块测试和冻结，不在 merge 时重写三者语义。

如果 formal data 尚不能表达 per-sequence typed predicates，或 pair 缺 invariant contract，M0/M1 只能通过 synthetic/local Gate，正式数据 Gate 必须停止并要求数据线建立新 revision。

## 文件与状态

| 类别 | 执行卡 | 当前状态 |
|---|---|---|
| 测量 | [M0](M0-MINIMAL-SUFFICIENT-CHAIN-SCORER.md) | 可做 no-model 实现 |
| 测量 | [M1](M1-PAIR-EXACT.md) | 可做 no-model 实现 |
| 测量 | [M2](M2-TOKEN-CACHE-ISOLATION-LEDGER.md) | 可做 no-model 实现 |
| 集成 | [Measurement-v2](MEASUREMENT-V2-INTEGRATION.md) | 等 M0/M1/M2 与正式数据/R01 至 R04 |
| 编译 seam | [C-3P-EQ](C3P-EQ.md) | 等 `static_parent` |
| 静态 Prompt | [V4-G](V4-G.md) | 等多步错误簇与生产合同审校 |
| 静态 Prompt | [V4-RN](V4-RN.md) | 等 Stage 1.5 偏差证据 |
| 静态 Prompt | [V4-CP](V4-CP.md) | 等稳定 confusion edge 和 cue trace |
| 静态 Prompt | [TSCG-lite](TSCG-LITE.md) | 等 execution 错误簇 |
| 缓存布局 | [V4-L](V4-L.md) | 等真实 cache telemetry |
| 四态 gate | [V4-A](V4-A.md) | 等预冻结 overlay 或 formal-v2 |
| 离线优化 | [O-P](O-P.md) | 等真实 trace 和独立 folds |
| 动态架构 | [A-F](A-F.md) | 延后 |
| 动态架构 | [A-D](A-D.md) | 延后 |
| 动态架构 | [A-IR](A-IR.md) | 延后 |
| 动态架构 | [A-CF](A-CF.md) | 延后 |

## 每张卡的执行纪律

每张卡都必须在 YAML 身份块或节点表中明确 `parent/git_parent`、`behavior_parent`、`depends_on`、`branch_group`、每个节点的 branch/worktree、single factor、允许文件、禁止文件、进入条件、无模型 Gate、正式模型 Gate、接受条件、停止条件和保存产物。占位符未替换、父提交未冻结或入口证据不存在时，不得启动正式实现。
