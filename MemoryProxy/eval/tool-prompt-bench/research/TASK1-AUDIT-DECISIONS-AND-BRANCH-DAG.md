# Task 1 多轮审核结论与隔离分支 DAG

> 状态：多轮只读审核与修订后 PASS，待本分支提交并创建 annotated Tag，2026-08-30。
>
> 本文记录三轮只读审核的共同结论、仍未满足的 Gate，以及后续分支和 worktree 的唯一命名。它只管理 Task 1 的测量基础和 Prompt 候选，不改变 V0 至 V3，不授权在正式数据冻结前运行模型。

## 1. 当前权威状态

| 层级 | 提交或 Tag | 用途 |
|---|---|---|
| 生产 V0 | `5299c00aaf65481703c180fd69df066d11254eb7` / `task1-v0-baseline-20260828` | 只读历史对照 |
| V0 至 V3 Prompt 冻结 | `d0996809ed63f6cfc67504ad180db0d48ac70475` / `task1-code-freeze` | Prompt 和 profile 冻结点 |
| C07 运行器基点 | `2dc7bc8b57442d2beae62efd5d570a83955b374d` / `task1-c07-pass` | 新测量代码的已审计源码祖先 |
| 后数据计划 | `8117c9597c3f25786e17b3f8541fd13cbf6b3ebb` | 比 C07 多一份执行计划，不含源码变化 |
| 研究审核线 | `codex/task1-research-audit-v1` | 本文与研究稿的独立冻结线 |

截至本文建立时，`task1-data-formal-v1`、`task1-measurement-v2`、`task1-candidate-base-v1` 都不存在。`SELECTION-CONTRACT.json` 和 `evaluationSchemaVersion: 2` 仍是设计合同，尚未成为运行代码。任何正式行为数据都要等这些对象和 R01 至 R04 Gate 完成。

现有工作树不能复用：根 checkout 和 `task1-code` 都有未提交内容，其他多个旧实验或数据 worktree 也有各自任务。研究稿已复制到新的审核 worktree，原文件不移动、不删除、不提交到原分支。

## 2. 三轮审核如何分工

### 审核 A：任务边界与过度设计

检查总案是否始终回答 Task 1：何时调用、调用哪一族、能否到达正确 terminal、误调用多少、用了多少 token，以及缓存前缀是否稳定。

已闭环：

- 不评价资产正文、最终回答和 coding 成功率。
- 4,863 和 2,224 已改为冻结 C00 fixture 的完整注入总量；工具描述静态组件另算。
- V0 至 V3 有满足目标的候选时可以停止，不强制实现 V4、Compiler 或动态检索。
- 新方法按真实错误簇触发，不按编号全部执行。

### 审核 B：指标、公平性与一手来源

检查 ECR、FCR、TSR、CTA、PairExact、token/cache 和统计分母是否会测偏。

已闭环：

- `evaluationSchemaVersion: 2` 与旧字段隔离。
- ECR、TSR 和 FCR_attempt 使用固定 eligible 分母；最终 eligibility 只由 Integration 合并 M0 trace facts 与 M2 evidence 后生成，M0/M2 不得各自决定；CTA 只作带分母诊断。
- PairExact 的负例只判断是否错误尝试 TDAI，不评价普通答案或代码。
- terminal 后行为不进入 Task 1；失败正例和 no-tool 仍计到冻结 evaluation horizon。
- fresh session 只证明会话和本地状态隔离，不等于 cache cold。
- OpenAI 和 Anthropic usage 分别归一化；本地组件 token 不重复计入 provider total。
- Hidden 默认只运行一个 Dev Final，避免在 Hidden 上二次选优。

### 审核 C：源码 seam 与 Git 隔离

检查每种方法的最小改动面、父提交和 worktree 冲突。

已闭环：

- M0、M1、M2 分开实现和保存，正式实验前汇合成唯一 Measurement-v2。
- Prompt 方法从同一 `static_parent` 平行分叉，不挂进 V0 至 V3 的线性 profile 继承链。
- C-3P-EQ 只有 byte-identical 时才能作为内部共同 seam。
- V4-RN 的措辞和组件 mask 分开；V4-CP 的 LOO 从同一完整父候选平行生成。
- V4-L 的顺序和 cache marker 分开；TSCG 的 CFO 另依赖审校 relation catalog。
- 架构轨使用新的 sealed revision，不能复用已经打开的 formal-v1 Hidden。

## 3. 排序是部分序，不是完整排行榜

数字越小只表示越早检查，不表示所有条目都要做，也不表示一个条目必须成为下一个条目的父节点。

| 层级 | 节点 | 当前结论 |
|---|---|---|
| P0 测量 | M0、M1、M2 | 现在可以做 no-model 实现；三支保留，集成后才能正式评测 |
| P1 基线实验 | V0、V0-C、V1a、V1、V2、V3 | 等 formal-v1 与真实链路 Gate 后运行，决定共同 `static_parent` |
| P2 静态兄弟候选 | V4-G、RN-R、RN-M、V4-CP、TSCG-lite、V4-L、V4-A | 只进入与对应错误簇一致的一条；可独立准备，不能混合首次评测 |
| P3 组合 | G+RN、RN+CP、semantic winner+L | 只有两个单项分别通过后才建新组合分支 |
| P4 自动搜索 | O-P | 真实 trace、独立 folds 和预算足够后再启动 |
| P5 动态架构 | A-F、A-D、A-IR、A-CF | 独立架构轨，使用新的 sealed 数据 revision |

## 4. 规范依赖 DAG

```text
task1-c07-pass
  ├─ M0 chain scorer ───────────────┐
  ├─ M1 pair schema/validator ──────┼─> Measurement-v2 integration
  └─ M2 usage/state isolation ──────┘          │
                                                ├─ no-model Gate
formal-v1 + R01-R04 ───────────────────────────┤
                                                ▼
                              task1-candidate-base-v1 commit
                                                │
                                      V0-V3 Formal Dev
                                                │
                        freeze STATIC-PARENT-MANIFEST P
                                                │
       ┌────────────────┬────────────────┬──────┴───────┬──────────────┐
       ▼                ▼                ▼              ▼              ▼
    RN-R/RN-M        V4-CP           C-3P-EQ         V4-A*       direct G/T/L**
                                         │
                              ┌──────────┼──────────┐
                              ▼          ▼          ▼
                            V4-G      TSCG-lite   V4-L probe
                              │          │
                              │          └─ CFO also needs V4-G catalog
                              │
                independently passed static candidates
                              │
                              ▼
                      explicit combo branches
                              │
                              ▼
                       freeze one Dev Final
                              │
                              ▼
                    formal-v1 Hidden, one time
                              │
                              ▼
                  architecture track on new sealed data
```

`V4-A*` 只有预冻结四态 Gold overlay 时可以使用 formal-v1，否则进入 formal-v2。

`direct G/T/L**` 只在 C-3P-EQ 无法 byte-identical 时使用。此时 V4-G、TSCG 和 V4-L 的 Git 分支都从 `task1-candidate-base-v1^{commit}` 创建，并通过 `STATIC-PARENT-MANIFEST.json` 读取同一个行为父 Variant，再各自建立最小 relation、Execution 或 renderer seam；不能继承有可见变化的 C-3P。

## 5. 测量分支与 worktree

三个实现分支都从精确的 `task1-c07-pass` 创建。它们可以并行写代码，但各自只处理一类事实，不能运行正式 Variant 对比。

| 节点 | 分支 | worktree | 只负责 |
|---|---|---|---|
| M0 | `codex/task1-measure-m0-chain-scorer-v2` | `D:\projects\TencentDB-Agent-Memory-task1-measure-m0` | Gold v2、allowed sequences、terminal、evaluation prefix、ECR/TSR/Strict/ToolSPL |
| M1 | `codex/task1-measure-m1-pair-schema-v2` | `D:\projects\TencentDB-Agent-Memory-task1-measure-m1` | pair schema、invariant projection、PairExact 聚合和统计块 |
| M2 | `codex/task1-measure-m2-usage-isolation-v2` | `D:\projects\TencentDB-Agent-Memory-task1-measure-m2` | usage 归一化、infra 分类、session/snapshot/cache lane 记录 |
| Integration | `codex/task1-measurement-v2-integration` | `D:\projects\TencentDB-Agent-Memory-task1-measurement-v2` | 非 squash 汇合 M0/M1/M2，补 M1b/M2b 对 M0 的接线，冻结共同 manifest |

M0 是成功判定的唯一实现。M1 不复制 ECR，M2 不自行猜 terminal horizon。Integration 只处理接口接线和跨模块测试，不顺手改 Prompt。

Integration Gate 通过后，`task1-measurement-v2` 与 `task1-candidate-base-v1` 指向同一个统一代码提交。前者标识测量合同，后者作为 Stage 1 和第一代静态候选的 Git 父节点。Stage 1 冻结的 `static_parent` 是 Variant ID、Prompt hash 和 artifact manifest，不等同于 Git commit。

## 6. 静态方法分支注册表

这些分支在 `static_parent` 冻结后创建。第一代静态方法的 Git 父节点统一为 `task1-candidate-base-v1^{commit}`，行为父输入统一由 `STATIC-PARENT-MANIFEST.json` 指定。C-3P-EQ 通过后，V4-G、TSCG 和 V4-L 可以把其 pass commit 作为工程父节点，但模型可见行为参考仍是相同 `static_parent`。若只是同一实现中的 manifest 组合，不为每个数据点新建 Git 分支，但每个产物仍保存 manifest、Prompt hash 和结果。

| 方法 | 规范分支 | worktree | 关系 |
|---|---|---|---|
| C-3P-EQ | `codex/task1-method-c3p-eq` | `D:\projects\TencentDB-Agent-Memory-task1-method-c3p-eq` | 从共同父候选平行分叉；byte-identical 后才能当内部父节点 |
| V4-G1 | `codex/task1-method-v4g-g1` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4g-g1` | 从通过的 C-3P-EQ 递进；只增加 dependency graph |
| V4-G2 | `codex/task1-method-v4g-g2` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4g-g2` | 从 G1 递进；只删除图已覆盖的重复 prose |
| RN-R | `codex/task1-method-v4rn-rhetoric` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4rn-r` | 从共同父候选平行分叉；只改客观对称措辞 |
| RN-M | `codex/task1-method-v4rn-mask` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4rn-m` | 从共同父候选平行分叉；只改组件 mask |
| RN-RM | `codex/task1-combo-v4rn-rm` | `D:\projects\TencentDB-Agent-Memory-task1-combo-v4rn-rm` | RN-R、RN-M 分别通过后新建组合 |
| V4-CP instrumentation | `codex/task1-method-v4cp-instrument` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4cp` | 从共同父候选分叉；所有 LOO manifest 共用这个完整父节点 |
| TSCG signature | `codex/task1-method-tscg-signature` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-signature` | 从 C-3P Execution IR 递进 |
| TSCG SDM | `codex/task1-method-tscg-sdm` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-sdm` | 从 signature 递进，解释条件效应 |
| TSCG DRO | `codex/task1-method-tscg-dro` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-dro` | 从 SDM 递进，解释条件效应 |
| TSCG CFO | `codex/task1-method-tscg-cfo` | `D:\projects\TencentDB-Agent-Memory-task1-method-tscg-cfo` | 从预注册最佳已通过 Execution 节点分叉，另要求 V4-G relation catalog 已通过 |
| V4-L probe | `codex/task1-method-v4l-probe` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4l-probe` | order 与 marker 做独立或 2×2 对照 |
| V4-L final | `codex/task1-method-v4l-final` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4l-final` | 从最终语义赢家重新派生 |
| V4-A | `codex/task1-method-v4a-four-state` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4a` | 绑定预冻结 overlay 或 formal-v2 |
| O-P | `codex/task1-method-op-candidate-pool` | `D:\projects\TencentDB-Agent-Memory-task1-method-op` | 从已经证明的静态赢家递进 |

V4-CP 的 `minus-cue-X` 和 budgeted set 使用 candidate manifest，不进行累计删除，也不覆盖先前结果。Stage 3 组合统一命名为 `codex/task1-combo-<a>-<b>`，从共同父基线应用已通过 Gate 的精确提交，不直接合并整个方法分支。

## 7. 动态架构分支注册表

| 方法 | 分支 | 进入条件 |
|---|---|---|
| A-F | `codex/task1-arch-causal-frontier` | 静态 Final 仍有 premature terminal 或冗余探索；relation catalog 已审校 |
| A-D | `codex/task1-arch-schema-on-demand` | 工具规模、definition token 或正式选择错误达到预注册触发值 |
| A-IR | `codex/task1-arch-intent-ir` | malformed/transport 已成为主要失败簇 |
| A-CF | `codex/task1-arch-conformal-gate` | 有独立 calibration、固定 K 和可接受成本 |

这些分支互相平行，不进入静态 Prompt 主 PR。formal-v1 Hidden 一旦打开，它们只能用 formal-v2 或预留的 sealed architecture slice 形成正式指标。每个新 sealed revision 都必须在同一 case/order/model/reasoning 下重跑冻结 static Final control 与一个预注册架构候选，不能跨 revision 直接比较 formal-v1 数字。

## 8. 每个分支的创建 Gate

创建前逐项检查：

1. 父提交或 annotated Tag 已明确，不从脏 worktree 的隐含 HEAD 创建。
2. 分支名不存在，目标路径不存在，也没有被其他 worktree 注册。
3. 父 worktree 干净；`.git` 没有 merge、rebase、cherry-pick 或 lock。
4. 候选执行卡已经写明单一因素、允许文件、禁止文件、指标假设、entry/accept/stop condition。
5. 新 worktree 创建后，HEAD 等于预期父提交、分支名正确、`git status --porcelain` 为空。
6. M0/M1/M2 可以在 formal-v1 前做 no-model 实现；正式模型运行仍受 Stage -1、R01 至 R04、Selection Contract 和 Measurement-v2 阻断。
7. 静态候选只有 `static_parent` 与错误簇冻结后才建立正式 Variant。提前写的通用 IR 必须 byte-identical，不能偷偷成为实验因素。

## 9. 每个分支的保存规则

- 一个可见实验因素对应一个分支或一个不可变 candidate manifest。
- 每个递进节点保留自己的提交、Prompt snapshot、token/hash、Gate 和结果，不覆盖父节点。
- 平行候选共享父提交，不互相 cherry-pick 未通过的行为改动。
- 组合使用新分支，并重新跑完整合同、PairExact、family floors、worst-case 和 token/cache 账本。
- 正式结果绑定代码提交、数据 Tag/hash、Gold hash、Measurement-v2 Tag、Selection Contract hash、模型和 reasoning。
- 未进入实验的研究候选保持 `DEFERRED`，不提前加入永久 production profile。

## 10. 当前执行状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 三份研究稿复制到独立 worktree | `DONE` | 原 `task1-code` 工作树未移动、未删除 |
| 多轮任务/指标/源码/Git 审核 | `DONE` | 本文吸收三轮共同结论 |
| 研究总案修订 | `DONE` | 指标、任务边界、依赖 DAG、执行卡、链接和格式一致性 Gate 已通过，待提交并打 Tag |
| 独立候选执行卡 | `DONE` | M0/M1/M2、静态方法、优化器和四条架构轨均已分别保存 |
| M0/M1/M2 worktree | `NOT_CREATED` | 研究计划冻结后从 `task1-c07-pass` 创建 |
| `task1-data-formal-v1` | `MISSING` | 数据线任务负责 |
| `task1-measurement-v2` | `MISSING` | M0/M1/M2 集成通过后创建 |
| 正式 V0 至 V3 Dev | `BLOCKED` | 等 formal-v1、R01 至 R04 和 Measurement-v2 |
| V4 及架构候选 | `DEFERRED` | 等 `static_parent`、错误矩阵和各自 entry condition |

研究计划冻结后，代码线先建立 M0、M1、M2 三个 worktree。它们只运行 no-model 单元测试和静态 Gate，不启动 Luna，不接触用户当前 Codex 配置。
