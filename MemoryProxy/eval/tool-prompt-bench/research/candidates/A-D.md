# A-D：Schema-on-demand / Native Tool Search

## 定位

```yaml
candidate_id: A-D
kind: dynamic-architecture
git_parent: <new-sealed-revision-candidate-base-commit>
behavior_control: <frozen-static-final-rerun-on-same-revision>
depends_on: [pre-registered-scale-or-selection-trigger, new-sealed-revision]
branch_group: architecture
branch: codex/task1-arch-schema-on-demand
worktree: D:\projects\TencentDB-Agent-Memory-task1-arch-schema-on-demand
data: new sealed formal-v2 or reserved unopened architecture slice
```

优先顺序是 provider 原生 deferred/tool search、client-executed search、自建 discovery endpoint。单纯在 system text 写 `defer_loading` 不会产生原生能力。

## 进入条件

只有工具规模、definition token 或正式选择错误达到预注册触发值时启动。官方约 10 tools/10k tokens 只是参考，不是跨模型定律。当前 V3 约 2,224 完整注入 token 时，若无正式瓶颈，保持 deferred。新 revision 上必须以相同 case/order/model/reasoning 重跑 frozen static Final control 与一个预注册 A-D。

## 单因子与公平性

只改变 schema 的发现/暴露方式，RuntimeToolContract 与 Gold 不变。必须冻结 discovery corpus、retrieval config、candidate K 和 fallback。不得按 Gold 或 query label 直接暴露正确工具。

## 允许与禁止改动

允许 provider 原生 deferred 配置、client discovery adapter、只读 schema index、K/fallback manifest 和 phase capture。禁止修改 Gold、RuntimeToolContract、资产、static Final decision semantics 和 Measurement-v2；禁止同时加入 frontier、Intent IR 或 conformal gate。

## 无模型 Gate

- discovery corpus 与 production-visible tool catalog 一致且 hash 冻结。
- 查询构造不读取 Gold、case label 或 expected tool。
- Recall@K 可在独立 Gold evaluator 中复算，运行时模块看不到答案。
- fallback、timeout、empty result 和 unsupported provider 行为 deterministic。
- discovery result token 在下一轮 provider input 中不双计数。

## 正式模型 Gate

固定 Luna high、fresh session、真实 MemoryProxy。在同一新 revision 中交错 frozen static Final control 与一个预注册 K/config 的 A-D；先 smoke、再 unseen Dev、最后完整评测。任何运行后调 K 必须新建候选并重新预注册。

## 指标

报告 discovery Recall@K、Selection@1、ECR/FCR_attempt/TSR/PairExact、累计 provider input to horizon、discovery result tokens、额外轮次、latency、cache read/write 和 token displacement。retriever 找到正确候选不能替代模型有效调用。

## 接受与停止

frontier/retrieval recall 达预注册 floor、行为非劣且累计成本改善才接受。漏 Gold、K 扩大后仍选择退化、额外轮次抵消 token 或 provider 能力不可复现时停止。使用新的 sealed data，不复用已打开 Hidden。

## 保存产物

保存 parent/control/data hashes、corpus/index/config/K/fallback、retrieval outputs、phase Prompt/hash、逐 case trace/usage、Recall@K/Selection@1 与核心指标整数、Gate 和 decision。
