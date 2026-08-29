# A-CF：Conformal Consistency Gate

## 定位

```yaml
candidate_id: A-CF
kind: dynamic-high-cost-policy
git_parent: <new-sealed-revision-candidate-base-commit>
behavior_control: <frozen-static-final-rerun-on-same-revision>
depends_on: [independent-calibration, fixed-K, new-sealed-revision]
branch_group: architecture
branch: codex/task1-arch-conformal-gate
worktree: D:\projects\TencentDB-Agent-Memory-task1-arch-conformal-gate
data: independent calibration plus new sealed evaluation revision
status: deferred
```

本方法只在有独立 calibration、固定模型/Prompt/采样协议、每 case 固定 K 次推理和明确 low-confidence 动作时考虑。正式比较必须在新 revision 的同一 case/order/model/reasoning 上重跑 frozen static Final control 与一个预注册 A-CF。当前默认不做。

## 进入条件

独立 calibration、固定 K、冻结 low-confidence 动作、新 sealed revision 和同 revision static Final control 五项同时存在。任一项缺失时保持 deferred，不创建正式 Variant。

## 单因子与声明边界

只对首个离散工具决策标签应用一致性/风险覆盖 gate。不能宣称保证参数、完整 terminal chain、资产结果或最终任务成功。校准数据与 Dev/Hidden 严格隔离，运行时不读取 Gold。

## 允许与禁止改动

允许独立 calibration loader、固定 K sampler、consistency scorer、low-confidence action policy 和重复调用 ledger。禁止使用 Dev/Hidden 重新校准、按 case 改 K/阈值、读取运行时 Gold、改变 RuntimeToolContract，或把有限首决策保证扩写为完整链保证。

## 无模型 Gate

- calibration/evaluation IDs、source clusters 和 hashes 完全不重叠。
- K、采样协议、阈值、coverage 目标和 low-confidence 动作运行前冻结。
- 同一 synthetic vote multiset 的决策 deterministic。
- 所有 K 次 usage、cache 和 latency 可累计，不能只记获胜调用。
- 风险声明生成器只输出预注册范围内的有限声明。

## 正式模型 Gate

固定 Luna high、Prompt、sampling protocol 和 K。在同一新 revision 中交错 frozen static Final control 与一个 A-CF；calibration 只用于冻结阈值，Dev/Hidden 不回流。先 cost smoke，再独立 evaluation，Hidden 只打开一次。

## 指标

除 ECR/FCR_attempt/TSR/PairExact 外，报告 coverage、abstention/clarification rate、empirical error at coverage、K 倍 provider input、轮次、latency、cache 和 family floors。所有重复推理都计入 evaluation horizon 成本。

## 接受与停止

只有预注册风险覆盖在独立数据复现、核心行为非劣且 K 倍成本可接受时才接受。coverage 太低、保证不复现、正确 CALL 大量 abstain、或成本不可接受时停止。与静态 Prompt 主报告分栏，不能报成普通压缩 Variant。

## 保存产物

保存 parent/control/data/calibration hashes、K/threshold/policy、每次采样 trace/usage、coverage/error integers、核心指标、成本、风险声明、Gate 和 decision。
