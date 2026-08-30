# V4-CP：可归因 Cue 剪枝

## 身份

```yaml
candidate_id: V4-CP
infrastructure_ancestor: R05@c86b154f9f597da0788592c66b93d574fd3f10f9
git_parent: task1-candidate-base-v1^{commit}
behavior_parent: <STATIC-PARENT-MANIFEST.variantId/promptSha256>
depends_on: [task1-measurement-v2, stable-confusion-edge, cue-trace]
branch: codex/task1-method-v4cp-instrument
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-v4cp
branch_group: decision-sibling
```

Git 分支保存 instrumentation 和候选生成器。每个 `minus-cue-X`、budget set 和 Prompt 结果使用不可变 candidate manifest，不为每个数据点建分支，也不覆盖先前产物。

## 进入条件

V0 至 V3 Dev 必须存在稳定的 confusion edge 或误调/漏调簇，并且候选 Prompt 中有可定位、可能冗余的 gate/when/avoid/contrast/handoff cue。没有真实 trace 或独立 fold 时不启动组合搜索。

## Cue IR 与不可删内容

每个 cue 有稳定 `cueId`、kind、family、覆盖的 `confusionEdgeId`、text、完整 Prompt 中的边际 token cost 和 required 标志。

exact name/method/path/header/body/schema/capability/provenance 不能作为 cue 删除。只有决策 cue 可以消融。

## 单因子试验

1. 冻结 cue-complete parent 和所有 cue IDs。
2. 从成功 trace 锁定不能删的 cue，从失败 trace定位应检查的 edge。
3. 对非 required cue 做 leave-one-cue-out。
4. 每个 LOO 都从同一个 cue-complete parent 生成，禁止 `-A -> -A-B -> -A-B-C`。
5. 先在 family/no-tool/pair 平衡 racing 子集淘汰明显失败。
6. 单 cue 效应在 unseen fold 复现后，才尝试 budgeted set-cover/knapsack 组合。

内部 utility 可以辅助排序，但生产选择仍使用共同硬约束内最短 Prompt，不能用加权总分让 FCR 退化被 token 节省抵消。

## 改动边界与 Gate

允许 cue instrumentation、manifest transform、marginal token calculator、confusion trace join、LOO runner 和 lint。

禁止改 Execution/Binding、Gold、scorer、数据、capability、工具集合、layout、RN、graph 或四态 gate。Prompt 不得读取 case-specific Gold。

无模型 Gate 必须证明：每个 cue source 可追踪；required/contract unit 不可删除；LOO diff 只包含一个 cue；同 manifest deterministic；token cost 按完整 Prompt 有/无 cue 差计算；所有候选通过 contract/capability/provenance lint。

## 正式指标与接受

每个 LOO 报告 ECR、FCR_attempt、TSR、CTA n/attempt、PairExact、family floors、confusion edge、overcall、worst-order/paraphrase、static/full token 和 provider input to horizon。

单 cue 只有在 unseen fold 上行为不劣且节省 token，或在 token 不增时显著修复目标 edge，才可进入组合。最终 budget set 重新跑全部 Gate，不把单 cue 效果相加。

## 停止与保存

held-out utility 翻转、任一硬约束/family/pair 失败、收益只在开发 fold、需要改合同、候选数超预注册预算时停止。若以后组合 RN+CP，必须重新估计 cue 边际效应。保存 cue catalog、complete parent、每个 manifest/hash、racing/full results、token ledger 和 selection decision。
