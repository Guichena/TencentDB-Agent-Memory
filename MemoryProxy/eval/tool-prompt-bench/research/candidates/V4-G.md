# V4-G：静态 Tool Decision Graph

```yaml
candidate_id: V4-G
git_parent: C-3P-EQ pass, or task1-candidate-base-v1^{commit} when parity fails
behavior_parent: <STATIC-PARENT-MANIFEST.variantId/promptSha256>
depends_on: [task1-measurement-v2, stable-multistep-error-cluster, audited-production-relation-contract]
branch_group: decision-sibling
```

## 身份与递进关系

```text
C-3P-EQ pass
└─ V4-G1 graph-only
   └─ V4-G2 graph + 删除被图等价覆盖的 handoff prose
```

| 节点 | 分支 | worktree |
|---|---|---|
| G1 | `codex/task1-method-v4g-g1` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4g-g1` |
| G2 | `codex/task1-method-v4g-g2` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4g-g2` |

若 C-3P-EQ parity 失败，G1 的 Git 分支从 candidate-base commit 创建，并按 frozen `static_parent` manifest 建自己的最小 relation seam。G2 只能从通过的 G1 创建。

## 进入条件

正式 V0 至 V3 trace 必须出现稳定的 prerequisite、premature terminal、handoff provenance、重复探索或未经合法上游结果提供 ID/schema 的错误簇。若多步错误不稳定，或基线已经满足目标，不创建 V4-G。

启动前必须由生产 Bridge/RuntimeToolContract 和独立 Gold 收口 `skill_search -> skill_view` 与 `skill_view_by_id` 的冲突。候选 Prompt 和 Pilot Gold都不能自证。

## 单因子

- G1 只在 Decision plane 加紧凑 typed dependency graph，不删旧 prose，不改其他 unit。
- G2 保持 G1 graph 不变，只删除提前注册且能机械映射到 graph edge 的重复 handoff prose。

dependency edge 与 confusion edge 分开。节点按 typed action 表达 endpoint、operation、required input、允许来源、producer output、provenance 和 terminal intent。同一 endpoint 的不同 operation 可以是不同 action。

## 改动边界

允许 relation types、审校 catalog、renderer、reachability/cycle lint、Variant manifest 和 tests。

禁止改 RuntimeToolContract、Execution/Binding、Gold、scorer、capability、工具可见集合、模型轮次；禁止同时引入 TSCG、layout、cue pruning、RN 或四态 gate。

## 无模型 Gate

- 每个 action 对应 exact RuntimeToolContract。
- input/output 类型兼容，capability pruning 后无 dangling edge。
- 每个冻结正例至少有一条 reachable terminal。
- 多条合法路径有各自 typed predicates。
- Knowledge schema/ID 来自同一次合法 list handoff。
- Skill/Scene ID/path 只能来自 user、injected asset 或 validated prior result。
- renderer deterministic，不泄露 private Gold/case ID。
- G1 非 graph unit parity；G2 只删除 allowlist unit。
- 每个删除 unit 有 `removedUnitId -> graphEdgeId` 映射。

## 正式指标与 Gate

固定 Luna high、fresh session、真实 MemoryProxy、formal eligible。先平衡 smoke，再未见 Dev fold，最后完整 Dev。Hidden 只接收最终一个预注册 Final。

必须报告 ECR、FCR_attempt、TSR、CTA n/attempt、PairExact、StrictChainExact、PositiveOvercallRate、premature terminal、handoff provenance、duplicate、ToolSPL、ShortestExact、单步/多步分层、family floors、static/full injection token 和 provider input to horizon。

G1 只有在目标多步错误簇改善且单步/no-tool/family 不越界时才进入 G2。G2 还必须相对 G1 减少 token，且不破坏多步改善。

## 接受条件

G1 接受需满足共同硬约束、目标多步簇改善且 unseen fold 复现；它通过后才允许创建 G2。G2 接受还要求相对 G1 减少 static/full token，不增加 malformed、premature、duplicate 或 overcall，并通过硬约束内最短规则。G1 即使不是最终部署版本也作为归因产物保留。

## 停止与保存

G1 只增 token 而目标错误无改善、任一硬约束失败、unseen fold 不复现或需要改 Execution/Gold 时停止，且不创建 G2。G2 失败时保留 G1 和 G2，两者不得覆盖。每个节点保存 parent、catalog、edges、reachability、parity、Prompt/hash、run manifest、指标整数、token ledger 和 decision。
