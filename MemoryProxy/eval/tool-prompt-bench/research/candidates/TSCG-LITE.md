# TSCG-lite：确定性 Execution 表示算子

## 身份与阶梯

```text
full C-3P-EQ Execution IR after semantic ownership and full parity
└─ SIG typed signature
   └─ SDM semantic de-filler
      └─ DRO delimiter/field layout

pre-registered best passing Execution node + audited relation catalog
└─ CFO dependency-only ordering
```

```yaml
infrastructure_ancestor: R05@c86b154f9f597da0788592c66b93d574fd3f10f9
git_parent: <FULL-C3P-EQ-PASS-COMMIT after semantic ownership + full system/tool/cache metadata parity>, otherwise task1-candidate-base-v1^{commit}
structural_preparation_gate_is_not_valid_parent: d80ce4d
behavior_parent: <STATIC-PARENT-MANIFEST.variantId/promptSha256>
depends_on: [task1-measurement-v2, execution-error-cluster, C-3P-Execution-IR]
branch_group: execution-sibling
```

完整 C-3P-EQ 尚未完成、未冻结或 parity 未通过时使用 candidate-base fallback。`d80ce4d` 只是 structural preparation，禁止用它解析 `<FULL-C3P-EQ-PASS-COMMIT>` 占位符。

| 节点 | 分支 | worktree |
|---|---|---|
| SIG | `codex/task1-method-tscg-signature` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-signature` |
| SDM | `codex/task1-method-tscg-sdm` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-sdm` |
| DRO | `codex/task1-method-tscg-dro` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-dro` |
| CFO | `codex/task1-method-tscg-cfo` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-cfo` |

SIG、SDM、DRO 的默认阶梯只能解释相对直接父节点的条件效应。需要独立主效应时，必须从相同 Execution parent 平行分叉并预注册，不能运行后换口径。CFO 另依赖经过审校的 V4-G relation catalog，但不继承模型可见 graph 文案；它的行为父节点在运行前从已通过的 Execution 节点中预注册，可能是 SIG、SDM 或 DRO，不能因为下游算子失败而被错误阻断。

## 进入条件

正式 trace 显示 schema/signature 误读、malformed transport、execution grammar 重复或结构 token 冗余。若主要问题是 call/no-call、family、handoff 或 cache，本线不启动。

## 单因子

- SIG 只把 Execution contract 转成确定性 typed signature。
- SDM 只删 allowlist filler，保留所有边界、字段和 provenance。
- DRO 只换 delimiter/字段布局，语义字段集合和 unit 顺序不变。
- CFO 只按生产 dependency catalog 重排 Execution unit，内部 bytes 和内容 multiset 不变。

每个节点只有一个 operator、一个 diff allowlist、一个 snapshot 和一次独立比较。不安装完整 TSCG，不采用模型 profile、CCP、SAD-F、自由 CoT 或 query-aware 压缩。

## 不变量与 Gate

- exact name/method/path/header/body/schema/required/optional/forbidden/capability round-trip。
- Decision 和 Runtime Binding 按节点要求 byte parity。
- target diff 只落在 allowlist。
- deterministic hash，输出可解析，无 dangling delimiter。
- Prompt 不含 case/Gold/expected tool。
- CFO 的依据不读 Gold/query，operation 不被错误合并，cycle 被显式处理。

## 正式指标与接受

每个节点单独以 Luna high 跑 smoke、unseen Dev fold 和完整 Dev。报告 ECR、FCR_attempt、TSR、CTA n/attempt、PairExact、MalformedFalseIntentRate、StrictChainExact、PositiveOvercallRate、family floors、目标错误簇、static/full injection token、provider input to horizon、轮数和 token displacement。

接受需同时满足共同硬约束，并相对直接父节点减少 token或改善预注册 execution 错误簇，且 unseen fold 复现。中间节点优于最终节点时必须保留并进入排序。

## 停止与保存

contract 不能恢复、行为/family/pair 退化、malformed 增加、token 搬到后续轮、效果不复现或必须同时打开第二算子时，当前节点失败且阶梯停止。保存 operator config、diff allowlist、contract round-trip、parity、snapshot、Prompt/hash、指标和 token ledger，不 force-push 改成其他算子。
