# A-IR：Intent IR 与 Typed Dispatcher

## 定位

```yaml
candidate_id: A-IR
kind: dynamic-architecture
infrastructure_ancestor: R05@c86b154f9f597da0788592c66b93d574fd3f10f9
git_parent: <new-sealed-revision-candidate-base-commit>
behavior_control: <frozen-static-final-rerun-on-same-revision>
depends_on: [stable-malformed-or-transport-error-cluster, new-sealed-revision]
branch_group: architecture
branch: codex/task1-arch-intent-ir
worktree: D:\projects\TencentDB-Agent-Memory-task1-arch-intent-ir
data: new sealed formal-v2 or reserved unopened architecture slice
```

优先把 Intent IR 用作内部 Compiler seam。只有模型选择基本正确、但 malformed curl、path/header/body 运输错误成为主要失败簇时，才考虑改变模型可见协议。正式比较必须在新 revision 的同一 case/order/model/reasoning 上重跑 frozen static Final control 与一个预注册 A-IR。

## 进入条件

正式 trace 中 transport/malformed 已成为预注册主要错误簇，内部 IR 尚不能解决，同时存在新 sealed revision 和同 revision static Final control。若选择错误仍是主因，模型可见 A-IR 不启动。

## 单因子与安全边界

模型只输出受限 `action/family/op/args`，dispatcher 确定性 lowering 到冻结 RuntimeToolContract。Dispatcher 必须拒绝任意 URL/method/path，执行 capability、ACL、argument 和 provenance 检查，不能成为 god-tool。

Gold、资产和授权工具集合不变。不得同时改变 Prompt decision cues、动态 discovery 或 cache layout。

## 允许与禁止改动

允许 typed Intent schema、严格 parser、deterministic dispatcher、RuntimeToolContract lowering adapter、reject taxonomy 和 phase capture。禁止任意 URL/method/path、绕过 capability/ACL/provenance、修改 Gold/资产/static Final decision cues，或同时加入 discovery/frontier/conformal gate。

## 无模型 Gate

- 每个合法 Intent 唯一 lowering 到现有 RuntimeToolContract。
- 未知 action/field、任意 endpoint、越权 capability 和来源不明 binding fail closed。
- round-trip fixtures 覆盖所有 family/operation，dispatcher deterministic。
- rejected intent 不伪装成 infrastructure error。
- 原 static Final 和 control contract/hash 保持冻结。

## 正式模型 Gate

固定 Luna high、fresh session、真实 MemoryProxy。在同一新 revision 内交错 frozen static Final control 与一个 A-IR；先针对 transport/malformed 的平衡 smoke，再 unseen Dev 和完整评测。terminal 后不评价最终代码或答案。

## 指标

报告 ECR/FCR_attempt/TSR/PairExact、MalformedFalseIntentRate、runtime rejection、argument/transport failure、累计 token、轮次、latency 和 family floors。完整 coding 结果不评价。

## 接受与停止

只有 transport/malformed 明显改善且 selection、terminal、ACL/capability、累计成本全部不退化才接受。如果主要错误仍是是否调用或选哪一工具，内部 IR 已足够，或 dispatcher 放宽权限才能工作，则停止模型可见协议改造。

## 保存产物

保存 parent/control/data hashes、Intent schema、lowering map、round-trip/reject fixtures、Prompt/schema hashes、逐 case intent/trace/usage、核心与 transport 指标整数、Gate 和 decision。
