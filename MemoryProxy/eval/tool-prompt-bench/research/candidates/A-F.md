# A-F：Causal Frontier 动态工具前沿

## 定位

```yaml
candidate_id: A-F
kind: dynamic-architecture
git_parent: <new-sealed-revision-candidate-base-commit>
behavior_control: <frozen-static-final-rerun-on-same-revision>
depends_on: [audited-V4-G-relation-catalog, reproducible-frontier-error-cluster, new-sealed-revision]
branch_group: architecture
branch: codex/task1-arch-causal-frontier
worktree: D:\projects\TencentDB-Agent-Memory-task1-arch-causal-frontier
data: new sealed formal-v2 or reserved unopened architecture slice
```

A-F 不是静态 V4 Prompt。它按当前公开 query、capability 和已观察 state 只暴露最小可执行 action frontier，必须与静态主表分栏。

## 进入条件

静态 Final 仍有稳定 premature terminal、duplicate exploration 或工具规模瓶颈；V4-G relation catalog 已由生产合同和独立 Gold 审校；有新的 sealed data revision。新 revision 必须在同一 case/order/model/reasoning 下重跑冻结 static Final control 和一个预注册 A-F。条件不满足则保持 deferred。

## 单因子与边界

只改变每一步可见 action frontier。RuntimeToolContract、资产、Gold 和 scorer 不变。运行时不得读取 private Gold。若需要 terminal intent router，必须另列 phase，并把错误、token、轮次和 latency 全部计入。

## 允许与禁止改动

允许新增 frontier state machine、relation-catalog adapter、phase capture、frontier reachability lint 和独立 architecture manifest。禁止修改 private Gold、RuntimeToolContract、资产内容、static Final 文本和 Measurement-v2；禁止同时加入 schema search、Intent IR 或 conformal gate。

## 无模型 Gate

- catalog 只来自生产合同和独立审校，不读取 case Gold。
- 每个冻结 control Gold sequence 的 prerequisite 在对应 state 可达。
- capability pruning 后无 dangling action，frontier 计算 deterministic。
- router 若存在，输入/输出和成本接口单独冻结。
- phase ledger 可完整累计 discovery/executor/follow-up。

## 正式模型 Gate

固定 Luna high、fresh session、真实 MemoryProxy 和 formal eligibility。在同一 formal-v2 revision 内交错运行 frozen static Final control 与一个 A-F，先 smoke、再 unseen Dev、最后预注册评测；Hidden 只按新 revision 的预注册规则打开一次。

## 指标

除 ECR/FCR_attempt/TSR/PairExact 外，报告 frontier recall、gold-prerequisite hidden rate、duplicate/exploration、累计 provider input、discovery result context、模型轮次和 time to terminal。资产内容和最终任务质量仍不评价。

## 接受与停止

完整链行为非劣且 evaluation horizon 累计成本改善才接受。任何 Gold prerequisite 被隐藏、frontier recall 不足、FCR/TSR/family 退化或累计成本不优即停止。所有 phase manifest/hash/usage 必须保存。

## 保存产物

保存 parent/control/data hashes、catalog、frontier snapshots、reachability、phase manifests、Prompt/candidate-set hashes、逐 case trace/usage、核心和辅助指标整数、Gate 与 decision。
