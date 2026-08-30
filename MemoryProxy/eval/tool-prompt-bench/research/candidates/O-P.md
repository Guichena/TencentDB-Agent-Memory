# O-P：Blame-localized 离线候选池

## 身份

```yaml
candidate_id: O-P
kind: offline-optimizer
infrastructure_ancestor: R05@c86b154f9f597da0788592c66b93d574fd3f10f9
parent: <independently-proven-static-winner>
behavior_parent: <independently-proven-static-winner.variantId/promptSha256>
depends_on: [real-traces, independent-folds, machine-lint, fixed-search-budget]
branch: codex/task1-method-op-candidate-pool
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-op
branch_group: optimizer
```

O-P 不是当前必做项。V0 至 V3 只有少量冻结候选时直接穷举更透明。

## 进入条件

- 已有真实 trace，错误能归因到 gate、family、tool/handoff 或 execution 层。
- optimizer fold、validation fold 按 source/pair/template 隔离。
- exact contract 和 case leakage 有机器 lint。
- 已有人工/规则候选与等预算随机搜索基线。
- metric-call、候选数和停止预算预注册。

## 单因子与编辑边界

每次提案先定位 blame layer，只允许编辑对应的 global gate、family boundary、when/avoid/contrast/handoff cue 或客观措辞/稳定字段顺序。

tool name/method/path/header/body/schema/args/capability、private Gold、case ID 和 query 原句锁定只读。候选不能复制 case 词、读取 Hidden 或动态按 Gold 选择 Prompt。

## 运行流程

1. 从通过的静态父候选和成功/失败 trace 建候选池。
2. 机器 lint 拒绝合同、capability、leakage 和 token budget 违规。
3. 平衡 smoke racing。
4. unseen semantic fold。
5. 完整 Dev。
6. 保留强父候选及 Pareto 中间产物，不覆盖较早更优版本。

本方法只离线提出静态 Prompt，生产运行不增加 optimizer、router 或模型轮。

## 指标与接受

使用共同 ECR、FCR_attempt、TSR、PairExact、overcall、family floors、static/full token、provider input to horizon、worst-order/paraphrase。辅助记录 proposal count、lint reject reason、metric-call budget 和 frontier history。

接受条件仍是全部硬约束内选择最短 Prompt。不能用固定加权总分让行为退化被 token 节省抵消。

## 停止与保存

预算耗尽、frontier 连续预注册轮数不改善、unseen fold 不复现、任一硬约束失败、Prompt 只靠变长/query copy/位置偏差获胜时停止。保存所有 proposal parent/hash、diff、lint、fold assignment、指标和 rejection reason，Hidden 只运行冻结 Final。
