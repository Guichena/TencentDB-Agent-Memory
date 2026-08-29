# Measurement v2 集成与冻结

## 身份

```yaml
kind: integration
parent: <formal-data-and-R04-integration-commit>
depends_on: [task1-research-plan-v1, task1-data-formal-v1, R01-R04, M0, M1, M2]
branch_group: measurement-integration
branch: codex/task1-measurement-v2-integration
worktree: D:\projects\TencentDB-Agent-Memory-task1-measurement-v2
required_sources: [M0, M1, M2]
required_external_gates: [task1-data-formal-v1, R01, R02, R03, R04]
model_runs: 0
```

本分支只汇合 M0、M1、M2，冻结正式测量合同和 candidate base。它不顺手改 Prompt、数据或三模块算法。

## 创建时机与父提交

M0/M1/M2 的本地 no-model 实现可以提前并行完成。Integration 只有在以下对象都存在后创建：研究计划 Tag、formal data Tag/hash、真实链路 R01 至 R04 pass commit、三个测量源分支 pass commit。

父提交必须是包含正式数据接口与 R01 至 R04 的不可变集成点，且以 `task1-c07-pass` 和 `task1-code-freeze` 为祖先。不能使用脏 worktree 或旧 pilot/real-chain 分支的浮动 tip。

## 集成顺序

1. 记录 integration parent、正式数据和 RuntimeToolContract hashes。
2. 非 squash 合入 M0，接入 case scorer。
3. 非 squash 合入 M1，让 PairExact 调用 M0 outcome。
4. 非 squash 合入 M2，让 M0 eligible/horizon 与 M2 evidence双向接线。
5. 冲突只允许处理 export、CLI、script key、README 和 manifest 列表。
6. 语义冲突必须回对应源分支修复并重新 Gate。
7. 冻结 `SELECTION-CONTRACT.json` 和 Measurement-v2 manifest。

M0、M1、M2 可以在本地并行开发，并不代表它们是三个实验基线。正式 Variant 只能使用最终统一的 Measurement-v2。

## Selection Contract

运行模型前冻结：V0/V0-C reference、ECR/FCR_attempt/TSR/PairExact/overcall margins、family floors、independence key、repeat 聚合、paired cluster interval、multiple-comparison policy、infra retry、timeout/unresolved policy、required usage、formal eligibility、Hidden authorization。

满足行为硬约束后，静态候选优先最小化同一 case 集上的 static tool-description tokens，tie-break 为完整注入 tokens。CTA 保留分子/分母诊断，不进入硬约束。辅助指标可增加，但只能解释 Task 1 的调用、链路、误调、token/cache 和公平稳定性。

## Formal-ready Gate

- 三个源提交和 merge commit 均可追溯，没有 squash。
- Gold 支持 per-sequence typed predicates。
- Pair contract 具备 invariant/minimality/independence 字段。
- M0/M1/M2 focused tests 和 R01 至 R04 全通过。
- V0 至 V3 Prompt freeze 完全一致。
- mock-contract 永不正式 eligible。
- scorer 不从候选 Prompt/Compiler 推导 Gold。
- usage/isolation required evidence 完整。
- Selection Contract 无 TBD。
- 两次 freeze manifest canonical SHA 相同。
- Luna/其他模型调用数为 0。

## 接受条件

Formal-ready Gate 全部通过、三源语义无 merge-time 重写、Selection Contract 无 TBD、freeze manifest 两次一致时接受并创建两个 annotated Tag。任一条件失败都不得创建 candidate base。

## 停止条件

formal data、R01 至 R04、typed Gold、pair contract、usage/isolation 或 Selection Contract 任一未闭合时，不创建 candidate-base Tag。合并需要改变 Prompt、数据、Gold 或测量语义时，返回责任分支，不在 Integration 修补。

## 产物

保存三个源 SHA、三个 merge SHA、数据/Gold/snapshot/contract/hash、Selection Contract、完整 Gate 和 freeze manifest。在同一个通过 Gate 的 integration commit 上创建 annotated `task1-measurement-v2` 与 `task1-candidate-base-v1`，供 Stage 1 运行 V0 至 V3。Stage 1 结束后另冻结 `STATIC-PARENT-MANIFEST.json`，记录选中的 Variant、Prompt hash、选择合同和结果 manifest；不要把 Variant 名误当成 Git commit。
