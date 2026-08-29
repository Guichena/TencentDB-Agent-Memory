# M0：最短充分工具决策链 Scorer

## 身份与隔离

```yaml
candidate_id: M0
kind: measurement
parent: task1-c07-pass^{commit}
depends_on: [shared-observation-gold-v2-interface]
branch_group: measurement
branch: codex/task1-measure-m0-chain-scorer-v2
worktree: D:\projects\TencentDB-Agent-Memory-task1-measure-m0
model_runs: 0
```

M0 是 Measurement v2 的 case-level 决策判定模块，不是 Prompt Variant。它可以在正式数据完成前用 synthetic fixtures 实现，但不得产生正式行为结论。

## 进入条件

研究计划已冻结，`task1-c07-pass^{commit}` 可解引用，目标 branch/worktree 空闲，共同 Observation/Gold v2 接口已写明。formal data 未完成不阻塞 synthetic 实现，但阻塞 formal-ready Gate。

## 要解决的问题

当前 `evaluator.ts` 把 `effectiveCall` 绑定到 execution validity，并把 `conditionalToolCorrect` 近似为首动作正确。多步 case 又容易只读取第一条 `allowedSequences`。这些含义不能满足 Task 1，也不能直接改名后与旧 Pilot 拼接。

M0 新增显式 `evaluationSchemaVersion: 2`，旧 evaluator/score 保持 v1 语义。

## 单一职责

M0 只根据真实入口 trace、冻结 RuntimeToolContract 和独立 private Gold 判断：

- 是否出现 executor-bound TDAI attempt。
- 首动作是否落在允许集合。
- 是否到达正确 terminal tool/endpoint/operation。
- 必需 prerequisite、跨步 binding、gold-relevant args 和 runtime acceptance 是否满足。
- terminal 前是否有 unexpected、duplicate 或 over-budget attempt。
- 哪一条合法 sequence 被匹配，以及 evaluationPrefix 的实际长度。

M0 不评价资产返回内容、最终回答、代码正确率和完整任务完成率。

## 输入与输出合同

Gold v2 必须支持每条合法 sequence 自己的 typed predicates：tool、endpoint、operation、arguments、prior-output binding、terminal step。Knowledge 同一 endpoint 的不同 operation 必须可区分。

输出至少包含：

```text
rawTraceStatus / traceCompleteness
rawInfrastructureFailure
triggeredAttempt
firstActionSelectionCorrect
terminalSelectionCorrect
completeChainSuccess
strictChainExact
falseCallAttempt / falseCallAccepted / malformedFalseIntent
positiveOvercall
matchedSequenceId
shortestAllowedLength / matchedSequenceLength
observedAttemptCount / evaluationPrefixAttemptCount
terminalAttemptIndex
toolSplContribution / shortestExact
failureLayer
```

成功正例的 evaluationPrefix 截止第一个由 private Gold 和 RuntimeToolContract 共同接受的 terminal。失败正例截止冻结 budget 或 turn completion。No-tool 截止 turn completion。terminal 之后的资产和回答不评分。M0 只输出 trace 层事实，不拥有最终 `formalMetricEligible`；Integration 必须把 M0 trace facts 与 M2 usage/isolation evidence 合并后生成唯一 eligibility。

## Task 1 指标

- 核心：ECR、FCR_attempt、TSR。
- 带分母诊断：CTA。
- 辅助：TriggerRecall、FirstActionSelectionAccuracy、StrictChainExact、PositiveOvercallRate、ToolSPL、ShortestExact、failure layer。
- Token 由 M2 记录，M0 只携带 run/Variant 关联键。

## 允许与禁止改动

允许新增 `eval/tool-prompt-bench/measurement-v2/` 下的 M0 类型、normalizer、scorer、aggregate、synthetic fixtures 和 focused tests。

禁止改 injection、Variant、Prompt、formal data、Gold、旧 evaluator/score、runner、adapter、YAML 和用户 Codex 配置。Scorer 不得导入候选 Prompt renderer、Compiler 或关系图。

## 无模型测试矩阵

至少覆盖：无调用、错 family、错 endpoint、错 operation、错 args、合同 4xx、provider 5xx/timeout、单步成功、Memory/Skill/Knowledge 多步、第二条合法 sequence 命中、terminal 前重复、terminal 后行为忽略、no-tool clean/accepted/malformed、infra 被标为 raw fact、CTA 零分母、ToolSPL 成功与失败。

## Gate

1. focused tests 全通过，旧 Pilot v1 tests 不变。
2. 相同 trace/Gold 重复评分逐字段一致。
3. `evaluationSchemaVersion` 必须显式为 2。
4. V0 至 V3 Prompt bytes/tokens/hash 不变。
5. 改动文件落在 allowlist，`git diff --check` 通过。
6. 模型调用数为 0，正式结果目录无新增。

## 正式数据硬停止

若 frozen data 仍使用无法表达分支差异的 `string[][] allowedSequences` 和共享 follow-up，或 `skill_view`/`skill_view_by_id` 合同未收口，M0 只能完成 synthetic Gate。不得猜测 terminal 或退回 `allowedSequences[0]`。数据线必须创建新 revision 和 Tag。

## 接受、停止与产物

接受条件是全部 no-model Gate 通过、旧语义未改、正式数据不足被明确标为 `FORMAL_DATA_BLOCKED`。任何需要改 Gold、Prompt、把 infra 当模型失败，或由 M0 单独决定 formal eligibility 的实现立即停止。

保存实现提交、测试提交、接口 manifest、synthetic canonical SHA、Gate 报告和 annotated pass Tag。正式集成前源分支不删除、不 squash。
