# D3：W04 多语言 Dev

## 目标

从固定的 Open-SWE-Traces 子集选择两个不同语言、不同 repo family 的 Team，验证同一 TDAI 数据合同能覆盖非 Python 软件工程场景，并将 Dev 扩为 160 条。

## 前置

D2 Gate 全通过；Open-SWE-Traces revision、config/split 和许可合同已由 D0 锁定。

## 执行

1. 只读取 revision `6c426da40f5478986398531f065ac5b523fa3ec6` 的 `config=v1.0`、`openhands+sweagent`；校验 parquet hash 与 84,066/67,153 split 数，适配字段 `trajectory`。
2. 只在 `resolved=1`、许可为 MIT/Apache-2.0/BSD-2/BSD-3，且可按 `instance_id` m:1 join 冻结 SWE-rebench-V2 base commit 的记录中统计 repo 密度；同时要求独立 task 与独立 trajectory 均不少于 6。
3. 优先核查 Go 候选 `open-telemetry/opentelemetry-go-contrib`，以及 Node/TS 候选 `elastic/synthetics`、`webpack-contrib/copy-webpack-plugin`；只在全量密度通过后冻结，不按名称直接准入。
4. 复核行级 SPDX 与每个 pinned repo commit 的 LICENSE/NOTICE；记录 CC BY attribution。
5. L0 只转换 role/content/tool_calls 与必要 observation；不导入 `reasoning_content`、`think`、reference patch 或 model patch。
6. 按 D1 流程生成 W04 两 Team、40 Case 和 snapshot。
7. 对比 Python 与非 Python World 的资产长度、工具 Family、首动作和语言风格，排查数据源/语言捷径。
8. 从 W01～W04 各选 5 条形成 20 条正式 Smoke 清单，覆盖三 Family、paired negative 和 natural negative。

## 产物

- Open-SWE-Traces 选择报告和 attribution manifest
- `formal-worlds/W04/`
- 160 Case Dev manifest
- 20 Case Smoke manifest
- D3 Gate 报告

## Gate

- [ ] 两个 Team 的语言与 repo family 不同，且均通过 D1 Gate。
- [ ] v1.0/config/split/trajectory ids、dataset SHA 和 repo commit 可复现。
- [ ] Dev 的 Family 与语言/来源不存在完全相关的捷径。
- [ ] W01～W04 的全局 provenance graph 无冲突。
- [ ] 160 条 Dev 和 20 条 Smoke 已冻结。
