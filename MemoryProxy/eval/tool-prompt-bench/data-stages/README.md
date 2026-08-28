# 正式数据阶段索引

这些文件把 `DATASET-BASE-AND-WORLD-REBUILD.md` 的 D0～D5 拆成可独立验收的执行阶段。必须按顺序通过 Gate；失败时停留在当前阶段，不用手写数据绕过来源、许可、唯一性或真实链路问题。

| 阶段 | 文件 | 建议分支 | 完成条件 |
|---|---|---|---|
| D0 | [来源合同](./D0-SOURCE-CONTRACT.md) · [只读复核报告](./D0-READONLY-AUDIT.md) | `codex/task1-data-d0-source-contract` | 来源、许可、schema、转换合同冻结 |
| D1 | [W01 重建](./D1-W01-REBUILD.md) | `codex/task1-data-d1-w01` | W01 两 Team/40 Case 全 Gate 通过 |
| D2 | [W02～W03 重建](./D2-W02-W03-REBUILD.md) | `codex/task1-data-d2-w02-w03` | W01～W03 120 Case 无泄漏、可恢复 |
| D3 | [W04 多语言 Dev](./D3-W04-MULTILINGUAL.md) | `codex/task1-data-d3-w04` | Dev 160 Case 冻结 |
| D4 | [W05～W10 Hidden](./D4-W05-W10-HIDDEN.md) | `codex/task1-data-d4-hidden` | Hidden 240 Case 密封 |
| D5 | [真实链路交接](./D5-REAL-CHAIN-HANDOFF.md) | `codex/task1-data-d5-handoff` | 20 条 Smoke 和评测交接 Gate 通过 |

每个阶段只在前一阶段合入数据集成主线后创建分支。生成批次可以委派给 Luna/Terra，但来源选择、Gold 冻结和 Gate 结论由主会话负责。
