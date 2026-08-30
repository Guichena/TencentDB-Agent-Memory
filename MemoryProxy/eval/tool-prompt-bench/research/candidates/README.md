# Task 1 候选执行卡索引

> 状态：研究计划附件。执行卡可以先冻结，代码分支只有在本卡和总案规定的进入条件满足后才创建。

本目录把每一个测量改造、Prompt 方法和动态架构分别保存。它们不是必须全部实施的流水线，也不是一个可以任意合并的大改造包。正式决策以 `TASK1-RESEARCH-SYNTHESIS-AND-TRIAL-BACKLOG.md` 和 `TASK1-AUDIT-DECISIONS-AND-BRANCH-DAG.md` 为准。

## 编号命名空间

| 前缀 | 含义 | 是否创新候选 |
|---|---|---|
| R01–R05 | 递进建设一次的真实链路、数据装载、资产恢复、Runner 和生产资产公共底座 | 否 |
| C00–C07 | V0–V3 历史代码建设与 no-model Gate | 否 |
| M0–M2 | 评分、配对与 token/cache/isolation 测量模块 | 否；集成后共同服务全部 Variant |
| V0–V3 | 已冻结的递进 Prompt 基线 | 是，已有基线 Variant |
| C-3P | 行为中性的 Compiler seam；内部可分递进检查点 | 否；若任何 provider-visible byte/metadata 改变，则 C-3P-EQ 失败，该变化必须另立 V4/TSCG 候选 |
| V4-* / TSCG / O-P | 一次只启动一个、改变 Prompt 或候选生成方式的方法 | 是 |
| A-* | 需要新 sealed revision 的动态架构轨 | 是，且不进入静态 Prompt 主线 |

R 节点、C 节点和 M 节点不能被当作“每个方法都要重做一遍的创新”。它们是所有后续方法共享的评测与运行能力。

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
- R05 `c86b154` 是所有后续方法共同复用的只读实验基础设施祖先，不是创新候选。任何方法都在独立 branch/worktree 中实现，不回写 R05。工程预备方法可直接从 R05 分叉；正式行为方法从包含 R05 与 Measurement-v2 的 `task1-candidate-base-v1` 分叉。`STATIC-PARENT-MANIFEST` 指定共同的行为父 Prompt，它不等于 Git 父提交。
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
| 测量 | [M0](M0-MINIMAL-SUFFICIENT-CHAIN-SCORER.md) | `task1-measure-m0-v2-pass` / `a5f7e1a` 已独立通过 |
| 测量 | [M1](M1-PAIR-EXACT.md) | `task1-measure-m1-v2.1-pass` / `6bb5797` 已独立通过 |
| 测量 | [M2](M2-TOKEN-CACHE-ISOLATION-LEDGER.md) | `task1-measure-m2-v2.1-pass` / `6dfb075` 已独立通过 |
| 集成 | [Measurement-v2](MEASUREMENT-V2-INTEGRATION.md) | 等三源集成、`task1-data-formal-v1.1`、R01–R05 code chain 与 R05 runtime Smoke |
| 编译 seam | [C-3P-EQ](C3P-EQ.md) | 结构准备 Gate `d80ce4d` 通过；`semanticOwnershipAttested=false`，完整 Gate 等 `static_parent` |
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

每张卡都必须在 YAML 身份块或节点表中明确 `infrastructure_ancestor`、`parent/git_parent`（多阶段或双亲节点可用精确 stage-specific parent 字段）、`behavior_parent` 或架构轨的 `behavior_control`、`depends_on`、`branch_group`、每个节点的 branch/worktree、single factor、允许文件、禁止文件、进入条件、无模型 Gate、正式模型 Gate、接受条件、停止条件和保存产物。对所有后 R05 方法，`infrastructure_ancestor` 记录可复用的 R05 底座；历史 M0/M1/M2 则如实记录其 C07 祖先，并在 Measurement-v2 Integration 后进入 R05 的后代 candidate base。Git parent 字段记录该节点的即时工程父提交或显式双亲 merge；`behavior_parent` 记录模型可见对照，无行为候选的测量节点写 `not_applicable`，架构轨用同 revision `behavior_control`。三类身份不得混写。占位符未替换、父提交未冻结或入口证据不存在时，不得启动正式实现。
