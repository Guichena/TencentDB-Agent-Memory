# Task 1 分支、标签与代码资产台账

更新时间：2026-08-31

用途：在正式模型实验前，统一说明哪些分支继续开发、哪些分支用于实验、哪些分支只保留审计历史。

结论边界：本台账只依据 Git 祖先关系、源码差异、冻结 Gate 和无模型测试分类，不宣称任何 Prompt 候选已经优于基线。

## 1. 当前必须记住的五个事实

1. 后续正式实验唯一数据合同是 annotated tag `task1-data-formal-v2.1`，即 1 个 Space、20 个 Team、800 个 Case、300 个 Pair；Dev 为 320，Hidden 为 480。
2. `codex/task1-measurement-v2-integration` 已具备真实链路、评分、Token、隔离和资产恢复能力，但仍绑定 `formal-v1.1` 的 640/240/400；它只是新 800 例公共基座的代码祖先，不再是正式数据输入。
3. V0、V0-C、V1a、V1、V2、V3 已经是同一套生产 Compiler 中的可选 profile。正式比较必须在一个共同代码基座上切 profile，不能通过 checkout 六个旧分支运行，否则会引入数据、runner 和修复差异。
4. C-3P、TSCG-lite、V4-G、V4-RN 是四个互相隔离的创新候选。当前只证明代码和静态产物可运行；在迁移到同一 800 例公共基座并跑行为数据前，不能判断有效、无效或谁更优。
5. 当前存在多个脏 worktree。它们都包含用户已有工作，本次整理没有删除、清理、stash、移动或覆盖其中任何文件。

## 2. 唯一推荐的后续分支拓扑

```text
task1-candidate-base-v1 (fa79ab9，历史 640 测量能力)
  + task1-data-formal-v2.1 (a8ae02e，800 例冻结数据)
  + 重新生成 800 例 overlay / bindings / runtime freeze / restore plan
  + M0/M1/M2 与真实资产 preflight
  = codex/task1-common-base-formal-v2.1       ← 唯一实验公共基座
      ├─ profile: V0 / V0-C / V1a / V1 / V2 / V3
      ├─ codex/task1-exp-c3p-eq-formal-v2.1
      ├─ codex/task1-exp-tscg-lite-formal-v2.1
      ├─ codex/task1-exp-v4-g-formal-v2.1
      └─ codex/task1-exp-v4-rn-formal-v2.1
```

约束：四个 `exp-*` 分支只允许包含“公共基座 → 该方法”的最小方法 diff；不得互相合并，也不得单独修改数据、模型配置、runner、评分器、资产或运行顺序。

## 3. A 类：当前有效且继续承接工作的基线资产

| 资产 | 精确点 | 当前作用 | 后续动作 | 远端状态 |
|---|---|---|---|---|
| 生产 V0 源码基线 | `codex/task1-v0-baseline` / `5299c00` / `task1-v0-baseline-20260828` | 解释原始生产注入行为 | 只读对照 | 已在 `mine` |
| V0–V3 代码冻结 | `codex/task1-code-integration` / `d0996809` / `task1-code-freeze` | Compiler、RuntimeToolContract、全部核心 profile | 保留为 Prompt 代码祖先 | 已在 `mine` |
| C07 评分正确性冻结 | `task1-c07-pass` → `2dc7bc8b` | 修正最短充分链、工具选择与 evaluator 口径 | 作为测量能力共同祖先 | 已推送 `mine` |
| 历史测量公共基座 | `codex/task1-measurement-v2-integration` / `fa79ab94` / `task1-candidate-base-v1` | 真实链路、M0–M2、R01–R05、Token、cache、隔离 | 迁移为 800 例新公共基座；不直接开跑 | 已在 `mine` |
| 最新正式数据 | `codex/task1-data-formal-v2-integration` / `a8ae02e` / `task1-data-formal-v2.1` | 20 Team、800 Case、300 Pair、来源字节冻结 | 后续唯一数据输入 | 已推送 `mine` |
| 本计划分支 | `codex/task1-one-week-execution-plan` | 分支台账和一周总方案 | 文档审阅后作为执行入口说明 | 本轮创建 |

## 4. B 类：核心 Prompt profile 历史检查点

这些分支都有独立审计价值，但正式 Campaign 不从这些分支逐个启动。正式运行从新的 800 例公共基座通过 profile ID 切换。

| 分支 | 主题 | 关系 | 远端状态 |
|---|---|---|---|
| `codex/task1-code-c00-compiler` | Compiler 与 typed prompt seam | 后续所有 profile 的结构基础 | 已在 `mine` |
| `codex/task1-code-c01-v0c` | V0-C 契约标准化 | 递进检查点 | 已在 `mine` |
| `codex/task1-code-c02-v1a` | V1a 协议去重 | 递进检查点 | 已在 `mine` |
| `codex/task1-code-c03-v1b` | V1 语义去重 | 递进检查点 | 已在 `mine` |
| `codex/task1-code-c04-v2` | V2 选择规则校准 | 递进检查点 | 已在 `mine` |
| `codex/task1-code-c05-v3` | V3 capability pruning | 递进检查点 | 已在 `mine` |
| `codex/task1-code-c06-freeze` | 全 profile 回归与冻结 | 已汇入 code integration | 已在 `mine` |

配套 `task1-c00-pass` 至 `task1-c06-pass` 和 `task1-code-freeze` 已在远端。它们用于回答“某项改造在哪一阶段进入代码”，不用于制造六套不同实验环境。

## 5. C 类：待实验的创新候选

| 分支 | 方法意图 | 当前已证明 | 当前未证明 | 后续处理 | 远端状态 |
|---|---|---|---|---|---|
| `codex/task1-method-c3p-eq` | 三平面结构准备与 equalized structural view | 专用及回归测试 65/65 通过 | 未证明行为指标提升；分支祖先早于 800 公共基座 | 只移植方法 diff，建立 `exp-c3p-eq-formal-v2.1` | 已在 `mine` |
| `codex/task1-method-tscg-lite` | typed signature 与可逆 operator ladder | Compiler/bench 56/56 通过 | 未跑正式模型；建立在较早祖先 | 建立 `exp-tscg-lite-formal-v2.1` | 已推送 `mine` |
| `codex/task1-method-v4-g` | typed action graph 与去重候选 | Compiler/bench 54/54 通过 | 未跑正式模型；建立在较早祖先 | 建立 `exp-v4-g-formal-v2.1` | 已推送 `mine` |
| `codex/task1-method-v4-rn` | neutral symmetric cards | Compiler/bench 54/54 通过 | 未跑正式模型；建立在较早祖先 | 建立 `exp-v4-rn-formal-v2.1` | 已推送 `mine` |

本轮测试使用当前本机默认 Node 24.16.0，只能作为推送前静态预检。四个候选移植后仍必须在项目要求的 Node 22.x 上重新通过同一公共 Gate，才可进入正式 Campaign。

## 6. D 类：测量与真实链路阶段资产

以下能力已进入 `fa79ab94`，后续不在原阶段分支继续开发。原分支保留是为了审计接口来源和 Gate 证据。

| 分支或组 | 能力 | 当前定位 |
|---|---|---|
| `codex/task1-r02-acceptance-v1` | Formal PrepareOnly、冻结输入接受 | 历史阶段，已集成 |
| `codex/task1-experiment-r03-assets-v1` | 资产恢复计划、真实链路合同 | 历史阶段，已集成 |
| `codex/task1-experiment-r04-runner-v1` | runner、trace、provider evidence | 历史阶段，已集成 |
| `codex/task1-experiment-r05-production-assets-v1` | 生产资产 adapter 与两阶段 preflight | 历史阶段，已集成 |
| `codex/task1-real-chain-adapter-v1` | 真实入口 adapter 后续修订 | 已是公共基座祖先；不单独继续 |
| `codex/task1-measure-m0-chain-scorer-v2` | 最短充分链 scorer | 已推送，800 overlay 后重新验证 |
| `codex/task1-measure-m1-pair-schema-v2` | Pair、私有合同与 canonical schema | 已推送，800 overlay 后重新生成 |
| `codex/task1-measure-m2-usage-isolation-v2` | usage、cache、隔离与 eligibility | 已推送，800 overlay 后重新验证 |
| `codex/task1-measure-m0/1/2-r05-compat-v1` | M0–M2 与 R05 兼容收口 | 历史兼容分支，已集成 |

重要：`M0/M1/M2` 的代码能力可复用，但任何绑定 formal-v1.1 的 Gold、Pair、hash、case count、restore receipt 或 runtime freeze 都不能复用为 800 例正式证据。

## 7. E 类：数据建设 provenance 分支

正式数据已经冻结到 `task1-data-formal-v2.1`，下面十个分支不再承接内容修改。由于 formal-v2.1 的 Team Gate 与集成文档直接引用这些分支和提交，它们已作为 provenance 上传，不应删除或 force-push。

| Team | 分支 | 定位 |
|---|---|---|
| T01–T02 | `codex/task1-data-build-v2-t01-t02` | 只读来源归档 |
| T03–T04 | `codex/task1-data-build-v2-t03-t04` | 只读来源归档 |
| T05–T06 | `codex/task1-data-build-v2-t05-t06` | 只读来源归档 |
| T07–T08 | `codex/task1-data-build-v2-t07-t08` | 只读来源归档 |
| T09–T10 | `codex/task1-data-build-v2-t09-t10` | 只读来源归档 |
| T11–T12 | `codex/task1-data-build-16team-t11-t12` | 只读来源归档 |
| T13–T14 | `codex/task1-data-build-16team-t13-t14` | 只读来源归档 |
| T15–T16 | `codex/task1-data-build-16team-t15-t16` | 只读来源归档 |
| T17–T18 | `codex/task1-data-build-20team-t17-t18` | 只读来源归档 |
| T19–T20 | `codex/task1-data-build-20team-t19-t20` | 只读来源归档 |

配套标签 `task1-data-parallel-baseline-v2`、`task1-data-parallel-launch-v2`、`task1-data-parallel-launch-16team-v1`、`task1-data-parallel-launch-20team-v1` 已推送。它们只证明建设输入和分工，不是正式实验数据入口。

## 8. F 类：被后续版本覆盖、只保留本地或历史参考的资产

| 资产 | 判断 | 处理 |
|---|---|---|
| `codex/task1-proxy-prompt-optimization` / `959381a` | 旧 Topic 2 研究祖先，worktree 有大量未提交内容 | 不再承接 Task 1 开发；不清理、不覆盖 |
| `codex/task1-proxy-prompt-optimization-v6.1` | V6.1 计划与阶段设计参考 | 保留历史；执行口径由本计划和 formal-v2.1 更新 |
| `codex/task1-p01-benchmark-harness` | 早期 P01 Harness，worktree 有未提交内容 | 不作为正式 runner；不清理 |
| `codex/task1-data-build-t09-t10` | v1 时代并行基线与早期 T09–T10 建设 | 已被 v2 建设分支和 formal-v2.1 覆盖 |
| `codex/task1-data-integration` | 早期数据集成，worktree 有未跟踪汇报文档 | 正式数据由 formal-v2.1 取代；不动未跟踪文档 |
| `codex/task1-data-docs-audit` | 建设期文档审计 | 历史参考，不作为运行输入 |
| `task1-data-formal-v1` | 已知合同缺陷的审计点 | 禁止作为集成输入 |
| `task1-data-formal-v1.1` | 640 例历史测量合同 | 仅用于解释旧基座，不再正式运行 |
| `task1-data-formal-v2` | 800 例首个冻结点 | 被 v2.1 的来源字节修正取代 |
| 三个 `verify-157-*` detached worktree | 旧验证环境 | 与本轮 Task 1 主线无关，不处理 |

“被覆盖”不等于现在删除。删除本地 worktree/branch 属于独立清理任务，必须在新公共基座和远端备份都确认后另行执行。

### 8.1 其余本地 Task 1 分支逐项归档结论

下面这些分支没有被前表单独列出，但也已纳入审计：

| 分支 | 内容与关系 | 结论 |
|---|---|---|
| `codex/task1-data-contract-one-space` | 将数据模型收敛为一个真实工程 Space | 已是 formal-v2.1 祖先；不再继续开发 |
| `codex/task1-data-d0-source-contract` | D0 来源/Schema 合同 | 已是 formal-v2.1 祖先，且已在 `mine` |
| `codex/task1-data-d1-w01` | 早期 D1/W01 入口，与 D0 当前同一 tip | 已被后续数据建设覆盖 |
| `codex/task1-data-t01-python` | T01 早期 Python 数据构造 | 已是 formal-v2.1 祖先 |
| `codex/task1-data-t01-complete` | T01 与早期并行基线收口 | 已是 formal-v2.1 祖先 |
| `codex/task1-p01-world-integration` | 早期 World/P01 集成 | 只作历史回归，已在 `mine` |
| `codex/task1-experiment-integration-v1` | R03/R04 早期实验能力集成 | 已是 measurement-v2 公共基座祖先，已在 `mine` |
| `codex/task1-r05-runtime-gate-repro-v1` | R05 Gate 可复现性收口 | 已是公共基座祖先，已在 `mine` |
| `codex/task1-measure-m0-r05-compat-v1` | M0 与 R05 兼容层 | 已集成，已在 `mine` |
| `codex/task1-measure-m1-r05-compat-v1` | M1 与 R05 兼容层 | 已集成，已在 `mine` |
| `codex/task1-measure-m2-r05-compat-v1` | M2 与 R05 兼容层 | 已集成，已在 `mine` |
| `codex/task1-research-audit-v1` | 外部证据、创新路线与祖先审计 | branch 已在 `mine`；worktree 的未提交研究稿不在本轮处理 |

## 9. 当前脏 worktree 风险清单

本轮只读审计时至少发现以下非干净位置：

- 主工作树 `D:/projects/TencentDB-Agent-Memory`：2 个未跟踪区域；当前还落后 `origin/feat/server_team` 9 个提交。
- `D:/projects/TencentDB-Agent-Memory-server-team`：detached，9 项改动。
- `D:/projects/TencentDB-Agent-Memory-task1-code`：存在未跟踪研究文档。
- `D:/projects/TencentDB-Agent-Memory-task1-data-integration`：存在 2 份未跟踪汇报文档。
- `D:/projects/TencentDB-Agent-Memory-task1-p01` 与 `task1-p01-integration`：存在未提交内容。
- `D:/projects/TencentDB-Agent-Memory-task1-research-audit-v1`：存在多项未提交内容。
- `D:/projects/TencentDB-Agent-Memory-topic2-research`：存在大量未提交内容。
- 两个旧 detached verify worktree：存在未提交内容。

因此后续所有新开发必须用新的专用 worktree，禁止复用上述脏目录。

## 10. 本轮 GitHub 归档动作

本轮只向个人 fork `mine = https://github.com/Guichena/TencentDB-Agent-Memory.git` 推送；未向 TencentCloud `origin` 推送，未 force-push，未删除远端引用。

新增推送的核心分支：

- `codex/task1-c07-eval-correctness`
- `codex/task1-data-formal-v2-integration`
- `codex/task1-measure-m0-chain-scorer-v2`
- `codex/task1-measure-m1-pair-schema-v2`
- `codex/task1-measure-m2-usage-isolation-v2`
- `codex/task1-method-tscg-lite`
- `codex/task1-method-v4-g`
- `codex/task1-method-v4-rn`
- formal-v2.1 明确引用的十个数据建设分支

新增推送的关键标签：

- `task1-c07-pass`
- `task1-data-formal-v1.1`
- `task1-data-formal-v2`
- `task1-data-formal-v2.1`
- `task1-measure-m0-v2-pass`
- `task1-measure-m1-v2.1-pass`
- `task1-measure-m2-v2.1-pass`
- 四个并行数据 baseline/launch 标签

`codex/task1-method-c3p-eq`、V0–V3 代码阶段、R02–R05 和 `task1-measurement-v2-integration` 在本轮开始前已存在于 `mine`。

### 10.1 其余本地标签的生命周期

| 标签 | 生命周期结论 |
|---|---|
| `task1-c01-pass`、`task1-c02-pass`、`task1-c03-pass`、`task1-c04-pass`、`task1-c05-pass` | V0-C 至 V3 的递进 Gate；继续作为审计检查点 |
| `task1-data-core-formal-v1` | 640 例 data-core 历史点；不得作为当前实验输入 |
| `task1-data-parallel-baseline-v1` | 第一版并行建设基线；已被 baseline-v2 覆盖 |
| `task1-measure-m1-v2-pass`、`task1-measure-m2-v2-pass` | M1/M2 早期 Gate；分别被 v2.1 pass 标签覆盖 |
| `task1-research-plan-v1` | 研究路线审计点；只作候选方法来源说明 |

## 11. 分支使用决策表

| 要做的事 | 应使用的引用 | 禁止使用 |
|---|---|---|
| 构建 800 例公共基座 | 新分支，从 `task1-candidate-base-v1` 集成 `task1-data-formal-v2.1` | 直接在旧 640 基座或数据冻结分支修改 |
| 跑 V0–V3 | 同一 800 公共基座，通过 profile 选择 | checkout C01–C05 分支分别运行 |
| 开发创新候选 | 从 800 公共基座新建四个独立 `exp-*` 分支 | 在原 method 分支继续堆叠公共基座修改 |
| 正式数据 | `task1-data-formal-v2.1` | formal-v1、formal-v1.1、formal-v2 |
| 评分与 Pair | 重新生成的 800 Gold / 300 Pair overlay | 复用 640 Gold / 240 Pair hash |
| 汇报实验结果 | 同模型、同资产、同 runner、同 profile seam 的 paired runs | 用静态 token 或单测结果代替模型行为结果 |
