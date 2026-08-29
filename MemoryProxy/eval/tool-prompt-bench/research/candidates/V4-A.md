# V4-A：DIRECT/CALL/CLARIFY/UNSUPPORTED 四态 Gate

## 身份与数据版本

```yaml
candidate_id: V4-A
git_parent: task1-candidate-base-v1^{commit}
behavior_parent: <STATIC-PARENT-MANIFEST.variantId/promptSha256>
depends_on: [task1-measurement-v2, pre-frozen-four-state-overlay-or-formal-v2]
branch: codex/task1-method-v4a-four-state
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-v4a
branch_group: decision-sibling
```

V4-A 只有两种合法数据来源：formal-v1 冻结前已经审校并一同 hash 的辅助四态 Gold overlay，或独立 formal-v2。不能在查看 formal-v1 Dev 后回写四态标签。

## 进入条件

正式错误矩阵必须证明 DIRECT、缺必要 binding 的 CLARIFY、授权工具面不支持的 UNSUPPORTED 与真正 CALL 之间存在稳定误调簇。普通 no-tool 与 coding negative 不足以自动触发本方法。

若使用 formal-v2，必须在同一 revision、case order、模型和 reasoning 下同时运行冻结 control/static Final 与一个预注册 V4-A。不能拿 formal-v1 数字作为跨 revision 非劣对照。

## 单因子

只加入一个短 commit gate：判断持久资产缺口和 capability，再选择 DIRECT/CALL/CLARIFY/UNSUPPORTED。CALL 时沿用父候选的 family/tool/contract；不增加自由 CoT、few-shot、router 或动态工具面。

原二元 Task 1 Gold 和核心 ECR/FCR/TSR 保留。四态混淆矩阵单列，不能替代核心指标。

## 改动边界

允许 Decision plane 的四态 gate、overlay adapter、confusion report 和 Variant manifest。

禁止改 Execution、Binding、RuntimeToolContract、资产、二元 Gold、scorer 核心语义、layout、graph、RN/CP/TSCG。禁止让模型输出长 rationale。

## Gate 与指标

- overlay/revision 在运行前冻结并有独立审校、hash 和 split 隔离。
- CALL case 仍由 M0 的完整链判定；DIRECT/CLARIFY/UNSUPPORTED 只判 TDAI intent 类别，不评价最终答案。
- no-tool 中已经 executor-bound 的 malformed/accepted attempt 计入 FCR_attempt；尚未 bound、但可识别的 TDAI dispatch intent 只进入 MalformedFalseIntentRate。默认 PairExact 负侧把两类都判失败，StrictPairExact 也沿用相同负侧；仍须分别保存两种整数，不能借此改写 FCR_attempt。
- smoke、unseen fold、full Dev 顺序固定。

报告核心 ECR/FCR_attempt/TSR/PairExact/Token，以及四态 confusion、CALL recall、DIRECT/CLARIFY/UNSUPPORTED precision、额外轮数、over-clarification 和 provider input to horizon。

接受条件是核心硬约束通过，并降低目标缺参/不支持误调，且 CALL recall 未越界。FCR 下降但大量正确 CALL 转为 CLARIFY 视为失败。

## 停止与保存

没有合法四态 Gold、标签依赖查看 Dev 结果、CALL 漏调上升、额外轮次/token 抵消收益或需要改变工具合同时停止。保存数据 revision/overlay hash、gate text/hash、confusion integers、core metrics、round/token ledger 和 decision。
