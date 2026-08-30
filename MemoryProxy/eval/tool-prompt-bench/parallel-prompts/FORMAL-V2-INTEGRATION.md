# formal-v2 增量集成

`formal-v2` 以不可变的 `task1-data-formal-v1.1` 为基线，只追加 T17 至 T20，不修改 formal-v1 合同、provider、private Gold、snapshot 或 hash。

## 审计输入

| Build | Team | Split | 分支 | 审计 HEAD |
|---|---|---|---|---|
| build-09 | T17、T18 | Dev | `codex/task1-data-build-20team-t17-t18` | `9422208d8297f4df43109e9d94e7482659bf54ca` |
| build-10 | T19、T20 | Hidden | `codex/task1-data-build-20team-t19-t20` | `ae9b84e6bfb987b72a37b45e3b0e7aa19fff0836` |

两条分支都以 `task1-data-parallel-launch-20team-v1`（`ffa1fe18085d47ed4da6b2306240152cc8590a86`）为祖先。完整允许路径、实际提交和 Team Gate 结果冻结在 `formal-dataset/reports/DS07-FORMAL-V2-BUILD-AUDIT.json`。

## 合并顺序

按审计报告中的固定 SHA 顺序导入：

1. T17：`b880314f1d719da1b0b02ac4fbf8d3ca8749960d`
2. T18：`9422208d8297f4df43109e9d94e7482659bf54ca`
3. T19：`07d171ccdf5897a455ea4b6e1efd14d1d8607d77`
4. T20：`ae9b84e6bfb987b72a37b45e3b0e7aa19fff0836`

不要从可移动的分支名重新计算范围，也不要 squash 建设提交。发生业务数据冲突时停止，不自行选择一侧。

## 生成和验证

在 `MemoryProxy` 目录运行：

```powershell
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/integrate-formal-v2.ts `
  --base-contract registry/contracts/formal-v1.json `
  --teams T17,T18,T19,T20 `
  --contract registry/contracts/formal-v2.json `
  --status frozen

npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v2.json `
  --freeze-contract formal-v2 `
  --report eval/tool-prompt-bench/formal-dataset/reports/DS08-FORMAL-V2-FULL-VALIDATION.json
```

Dev 与 Hidden 还必须分别带 `--split dev`、`--split hidden_test` 运行严格 validator，并分别编译到两个独立临时目录比较逐文件 SHA-256。正式产物写入 `formal-dataset/revisions/formal-v2/`，不能覆盖 formal-v1 的共享路径。

## 冻结数量

| 集合 | Team | Case | Pair |
|---|---:|---:|---:|
| Dev | 8 | 320 | 120 |
| Hidden | 12 | 480 | 180 |
| Full | 20 | 800 | 300 |

全集类别为 Memory Positive 120、Skill Positive 120、Knowledge Positive 60、配对 No-tool Negative 300、自然 Coding Negative 200；discovery Positive 200、direct Positive 100。

## 版本边界

formal-v2 的 provider、private Gold 与 snapshot 只服务 formal-v2 运行。现有 Measurement-v2 overlay 仍绑定 formal-v1.1 的 640 条数据；在生成 800 条对应 overlay 并重新通过 M0/M1/M2 之前，`formal-v2` 不是正式指标可比输入，也不能沿用 formal-v1.1 的测量 hash。
