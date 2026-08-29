# V4-L：缓存分层布局

## 身份与因素拆分

```yaml
candidate_id: V4-L
git_parent: C-3P-EQ pass, or task1-candidate-base-v1^{commit} when parity fails
behavior_parent: <STATIC-PARENT-MANIFEST.variantId/promptSha256>
depends_on: [M2, real-provider-cache-telemetry]
branch: codex/task1-method-v4l-probe
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-v4l-probe
branch_group: layout
```

本卡不把 order 与 cache marker 混成一次变化。C-3P-EQ 只是 Git 工程 seam，行为父输入仍是同一个 `static_parent` artifact。最小矩阵是：

- L-order：只换 S0/S1/S2/S3 完整 unit 的顺序。
- L-cache：在相同文本和相同顺序下，只换 provider metadata marker。

预算允许时使用 2x2。最终 `codex/task1-method-v4l-final` 必须从最终语义赢家重新派生，不能直接把早期 probe 当成生产 Final。

## 进入条件

- `cache_control`/metadata 从 InjectionPipeline 到官方 endpoint 全链路保真。
- Provider usage 能取得预注册 required fields。
- 跨 session/space/catalog 的真实 cache 损失可观测。
- 真实流量存在相同 release/catalog 的复用机会。

只有本地最长共同前缀而没有真实 usage 时，可以做诊断，不能进入正式排名。

## 分层与单因子

```text
S0 release-stable: global decision policy/shared protocol
S1 catalog-stable: exact tool cards/schema/catalog order
S2 tenant-stable: capability signature/tenant catalog
S3 request-dynamic: session/space/identity/assets/L2/L3
```

L-order 只改变 unit 物理顺序，内部 bytes、unit multiset、tool schema 和 dynamic values 不变。L-cache 只改变非模型可见 metadata；若 marker 是可见文本，本因素不成立，需重新立项。

## 改动边界

允许 plane-aware layout、最小 pipeline 排序/metadata wiring、provider capture、prefix analyzer、manifest 和 tests。

禁止改 ToolPromptSpec、RuntimeToolContract、unit 内文、capability、资产、Gold/scorer、SQLite/HookCacheRepo、本地 Memory 状态；禁止同时加入 graph、TSCG、cue pruning 或 RN。

## 无模型 Gate

- metadata parse/rebuild/serialize 保真，capture 等于实际发送序列。
- S0 至 S3 ownership 唯一，实例值不进 S0/S1。
- catalog/capability/listing 排序 deterministic。
- L-order per-unit byte/multiset parity。
- L-cache 完整文本 parity，metadata diff 只落在 allowlist。
- 多 session/space 的 prefix matrix 可复现。
- required usage fields 按 provider/adapter version 冻结。

## 正式矩阵与指标

区分 observed-cold、warm reuse、catalog change 和 repeated control。lane 名不能替代 read/write telemetry。

报告 ECR、FCR_attempt、TSR、CTA n/attempt、PairExact、overcall、family floors、total/read/write/ordinary input、provider input to horizon、轮数、warm cost、共同前缀和 infra/unsupported 数。

接受条件是行为非劣、真实 warm read 增加，且 write/ordinary/额外轮次没有抵消收益。2x2 中，order 主效应只能在同一 marker 条件下比较当前顺序与分层顺序；marker 主效应只能在同一 order 条件下比较 marker off/on。每一对 marker cell 的文本必须完全一致，不能跨两个主效应把 L-cache cell 直接与另一顺序的 L-order cell 比较。

## 停止与保存

metadata 丢失、usage 不足、warm read 不增、成本抵消、行为退化、收益仅来自同 session 重放、catalog change 更差或需要改文本时停止。每个 cell 保存 immutable manifest、layout/marker allowlist、capture、usage ledger、Prompt/hash、指标和 decision。
