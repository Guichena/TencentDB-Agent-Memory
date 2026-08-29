# M1：最小反事实 PairExact

## 身份与隔离

```yaml
candidate_id: M1
kind: measurement
parent: task1-c07-pass^{commit}
depends_on: [shared-observation-gold-v2-interface, M0-outcome-at-integration]
branch_group: measurement
branch: codex/task1-measure-m1-pair-schema-v2
worktree: D:\projects\TencentDB-Agent-Memory-task1-measure-m1
model_runs: 0
depends_on_at_integration: M0 case outcome
```

M1 可以与 M0 并行开发，但正式 `PairExact` 必须消费 M0 的 `completeChainSuccess`，不能实现第二套 ECR。

## 进入条件

研究计划已冻结，`task1-c07-pass^{commit}` 可解引用，目标 branch/worktree 空闲，共同 pair/outcome 接口已写明。正式 pair fields 未完成不阻塞 synthetic 实现，但阻塞 formal-ready Gate。

## 单一职责

M1 验证正负 case 是否构成严格最小反事实 pair，并根据两侧的 case outcome 计算 `PairExact`、`BoundarySwitch` 和预注册时才启用的 `StrictPairExact`。

负例只评价是否错误尝试 TDAI，不评价普通回答、代码或资产内容。

## Pair Contract v2

每个 pair 至少保存：

```text
pairId / positiveCaseId / negativeCaseId
causalFactorId
allowedChangedPointers
invariantProjectionSchemaVersion
invariantFieldsSha256
changedPointerCount
minimalityReviewStatus=approved
independenceKey
split
```

正负两侧必须使用相同 Variant、模型、reasoning、资产 snapshot 和非允许上下文，相互独立的 run/session/local state，并且不能跨 Dev/Hidden。

## 评分合同

```text
positivePass = M0.completeChainSuccess
negativePass = trace 完整，且没有 executor-bound attempt，
               也没有 malformed TDAI dispatch intent
pairExact = positivePass && negativePass
```

这里的 malformed 指可识别但尚未 executor-bound 的 TDAI dispatch intent。默认 PairExact 的负侧已经把 bound attempt 和 unbound malformed intent 都判失败；StrictPairExact 只把正侧提升为 M0 `strictChainExact`，不改变负侧规则。FCR_attempt 仍只统计 executor-bound attempt。

任一侧未通过统一 Integration eligibility gate 时 pair 为 incomplete，不记作行为 0。`J_eligible` 只包含两侧 integrated-eligible、trace 完整且 repeat 已在 pair 内聚合的 pair。主表保存 frozen/eligible/incomplete pair 整数，所有 Variant 从同一冻结 pair 集出发。独立单位按冻结的 `independenceKey` 形成 matched cluster。

## Task 1 指标

PairExact 是对有效调用和误调用边界的联合压力测试。辅助报告 BoundarySwitch、正例失败层、负例 false-intent 类型、family/Team/source cluster 分层和 paired cluster bootstrap 输入。禁止 LLM judge、资产 judge 和 coding success。

## 允许与禁止改动

允许新增 measurement-v2 下的 pair types、contract validator、pair scorer、cluster aggregate/bootstrap、fixtures 和 focused tests。

禁止修改 M0 语义、injection、Variants、formal data、Gold、旧 evaluator/score、runner/adapter 和配置。发现 M0 接口不足时回 M0 新提交，不在 M1 顺手改写。

## 无模型测试矩阵

覆盖 clean switch、always-call、never-call、malformed negative、positive 未到 terminal、普通 PairExact 与 StrictPairExact 区别、任一侧 infra、相同 session、不同 Variant/model/snapshot/reasoning、跨 split、invariant hash 篡改、allowlist 外变化、repeat 聚合、cluster 整块抽样和独立块不足。

## Gate

1. PairExact 对 always-call 和 never-call 都失败。
2. M0 contract fixtures 通过，M1 不重新计算 ECR。
3. pair infra 不进入行为分母。
4. identity/isolation/invariant 违规 fail closed。
5. Prompt freeze 不变，改动面符合 allowlist。
6. 模型调用数为 0。

## 正式数据硬停止

如果 formal pair 缺 `allowedChangedPointers`、`invariantFieldsSha256`、`causalFactorId`、`minimalityReviewStatus` 或 `independenceKey`，M1 可以完成 synthetic Gate，但不得通过 formal-ready Gate。`controlledDeltaSha256` 不能替代 invariant projection。

## 接受、停止与产物

接受条件是 pair schema/validator/scorer 的 synthetic Gate 全通过且正式数据缺口被显式记录。任何根据 query 文本猜 causal factor、把 malformed 当 no-call、或把 repeat 当独立样本的实现立即停止。

保存实现提交、测试提交、schema version、fixture SHA、Gate 报告和 annotated pass Tag。源分支保留供非 squash 集成。
