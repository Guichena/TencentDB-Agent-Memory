# Task 1 当前状态与方法启动复核

> 状态：四轮复核后的当前执行依据，2026-08-30。本文只更新研究计划冻结后的事实，不替换总案中的任务边界、指标和候选设计。

## 1. 权威状态重建

| 对象 | 当前证据 | 结论 |
|---|---|---|
| Prompt 基线 | `task1-code-freeze` / `d099680` | V0–V3 继续保持冻结，不改历史分支 |
| 正式数据 | `task1-data-formal-v1.1` | 已存在；不在方法分支改数据或 Gold |
| M0 | `task1-measure-m0-v2-pass` / `a5f7e1a` | 独立保留 |
| M1 | `task1-measure-m1-v2.1-pass` / `6bb5797` | 独立保留 |
| M2 | `task1-measure-m2-v2.1-pass` / `6dfb075` | 独立保留 |
| R04 runner | `codex/task1-experiment-r04-runner-v1` / `92da207` | Measurement-v2 scorer、real trace、usage 与 Gold-blind runner 已接线 |
| R05 production assets | `codex/task1-experiment-r05-production-assets-v1` / `c86b154` | 代码 Gate 通过并推送；真实空白栈 Smoke 尚未运行 |
| Measurement freeze | 未发现 `task1-measurement-v2` Tag | 代码存在不等于正式冻结完成 |
| Selection/static parent | 未发现 `SELECTION-CONTRACT.json`、`STATIC-PARENT-MANIFEST.json` | 尚不能选择或声称某个 V4 行为父版本 |
| 模型行为结果 | `model_runs=0` | 目前不能用行为数据给 V4 排名或组合 |

## 2. 审核一：是否仍聚焦 Task 1

PASS，但需要区分两类工作：

- R05 与 Measurement-v2 是为了让 ECR、FCR、TSR、PairExact、完整 token/cache 账本可信。
- C-3P-EQ 只是 Compiler 可归因 seam，不直接改善行为指标，也不得宣称 token 节省。
- V4-G/RN/CP/L/A 等会改变模型可见输入，必须由正式 Dev 错误簇触发。

因此立即把多个 V4 一起实现并不符合任务一：它既缺真实触发证据，也破坏单因素归因。

## 3. 审核二：实验因果与公平性

PASS，前提是 C-3P-EQ 采用全 profile byte parity：

1. V0、V0-C、V1a、V1、V2、V3 均以冻结 fixture 做逐字节比较。
2. system block、tool schema、顺序、slot、`cache_control` 和其他 metadata 都不能进入 ignore list。
3. 不增加 profile、不生成新 Prompt Variant、不运行 Luna。
4. `static_parent` 选出后必须针对该精确 artifact 再复核，工程预备态不能替代正式候选 Gate。

这使 Compiler seam 本身不是实验自变量，也不会抢先污染 V0–V3 的选择。

## 4. 审核三：源码可行性与过度设计

PASS，且改动可以保持很小：

- 现有 `PromptUnit` 已保存 `family/kind/content/sourceSpecIds`。
- `RuntimeToolContract` 与 `ToolPromptSpec` 已把执行事实和决策语义分开。
- `compileToolPrompt()` 已是确定性入口，并已经输出 unit、contract/spec IDs 和 content hash。
- 缺口主要是每个 unit 的唯一 plane ownership、ownership provenance、plane source map 和机械 parity harness。

第一阶段不解析或重新拼写 Prompt 文本，不创建关系图、不改 renderer、不移动注入块。只给现有有序 unit 增加非模型可见 ownership，并验证按原序连接仍完全相同。若需要重写 renderer 才能通过，则本方法停止。

## 5. 审核四：排序与分支隔离

当前是部分序，而不是把所有研究想法强行排成一条实现流水线：

| 当前顺序 | 工作 | 状态/理由 |
|---:|---|---|
| 1 | R05 V0 Dev Smoke | 运行入口；由用户人工执行，决定真实链路是否可测 |
| 2 | C-3P-EQ 工程预备态 | 现在可独立实现；全 profile byte parity，零模型调用、零行为变化 |
| 3 | V0–V3 正式 Dev | Smoke 通过后执行；产生 `static_parent` 和错误矩阵 |
| 4 | 单个 V4 静态方向 | 只开启与主要错误簇匹配的一项 |
| 5 | 组合候选 | 只有两个单项各自通过后新建组合分支 |
| 6 | 自动优化/动态架构 | 继续延后，需数据规模和独立 sealed revision |

C-3P-EQ 使用：

```text
branch:   codex/task1-method-c3p-eq
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-c3p-eq
parent:   c86b154f9f597da0788592c66b93d574fd3f10f9
mode:     engineering-only-pre-static-parent
```

该父提交只是当前完整代码与运行基础，不被命名为 `task1-candidate-base-v1`。C-3P-EQ 不合并 RN、Graph、Cue pruning、TSCG、layout 或四态 gate；每个后续方法继续使用总案登记的独立分支/worktree。

## 6. C-3P-EQ 首阶段执行卡

允许修改：

- `MemoryProxy/src/injection/tool-prompt/types.ts`
- 新增一个内部 plane ownership/source-map 纯函数模块
- `MemoryProxy/src/injection/tool-prompt/compiler.ts` 仅做非模型可见结果接线
- 对应 focused tests、snapshot/parity manifest 和 Gate 报告

禁止修改：

- 所有 injector 的 provider-visible输出
- V0–V3 profile 和 renderer 文本
- RuntimeToolContract、ToolPromptSpec 语义
- pipeline slot/layout/cache marker
- evaluator、Gold、formal data、运行配置

首阶段退出条件：

- 每个 PromptUnit 恰好属于 Decision、Execution、Runtime Binding 之一。
- ownership 有机械来源，未知/冲突 ownership fail closed。
- 全冻结 profile/surface/capability fixture 的 content bytes、hash、unit order、tool schema 和 metadata parity 全部通过。
- 同一输入两次 source map/hash 完全一致。
- `model_runs=0`，且 Git diff 只包含 C-3P-EQ 允许文件。

如果这些条件都通过，再提交、记录 Gate 并推送此独立分支；否则保留失败证据，不让它成为任何 V4 的父节点。
