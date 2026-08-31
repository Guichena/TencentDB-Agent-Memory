# formal-v2.1 覆盖矩阵与风险定向复核输入

- 数据：800 Gold / 300 Pair / 800 binding / 22 runtime contracts / 40 Smoke v2。
- JSON canonical SHA-256：`54507c9d709e81db8f6b4faed18e2af70cdf965080547648b43ccd598094cae3`。
- 生成结论：PASS。

## Case 类型

| 类型 | 数量 |
| --- | ---: |
| natural_coding_negative | 200 |
| paired_negative | 300 |
| positive | 300 |

## 工具家族

| 家族 | 数量 |
| --- | ---: |
| knowledge | 60 |
| memory | 120 |
| no-tool | 500 |
| skill | 120 |

## 最短充分链

| 长度 | 数量 |
| --- | ---: |
| 0 | 500 |
| 1 | 156 |
| 2 | 143 |
| 3 | 1 |

## Pair 反事实合同

| 类型 | 数量 |
| --- | ---: |
| answer_in_current_context | 300 |

冻结的 300 个 Pair 仅承诺 `answer_in_current_context`。这不是覆盖失败；本轮不事后补写仓库或版本不匹配标签。未来若新增诊断集，应区分“输入已明确不匹配，因此不调用”和“必须先 list/search 才能发现不匹配，因此发现后停止”。

## 风险定向复核队列

- multi-step：144 条。
- typed binding：86 条。
- difficulty 未标注：2 条（只记录，不参与 Task 1 评分）。
- T17-T20：160 条，分别保持 40 Case / 15 Pair，并绑定独立仓库。
- 完整 Case ID 与按 operation/Team 的计数保存在同名 JSON；不重复人工检查已通过的机械 schema 规则。

## Gate

- PASS：无零覆盖运行合同，Dev/Holdout 均含三类工具、No-tool、Pair negative 与自然 coding negative。
