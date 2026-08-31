# Task 1 阶段 A / B / C 对齐审计

> 原始审计日期：2026-08-31
>
> 当前复核日期：2026-09-01
>
> 当前分支：`codex/task1-common-base-formal-v2.1`
>
> 被审计功能提交：`2c323b55a087af83388cac9f5d775b63095e1dbb`

## 1. 结论

2026-08-31 的审计属于阶段 B 修复前的中间快照，其“阶段 B 新增失败、不能进入下一步”的结论对当前代码已经失效。当前状态应统一为：

| 阶段 | 当前结论 | 说明 |
|---|---|---|
| A：800 例数据接入 | `PASS_AS_DATA_FREEZE` | 阶段 A 只冻结公开数据身份与确定性构建，不承诺 Measurement-v2、runtime、restore 或 Smoke 已接通。 |
| B：800 例公共测量基座 | `OFFLINE_GATE_PASS` | 私有 Gold/Pair overlay、800 bindings、40-case Smoke、runtime freeze、restore plan 与 Measurement-v2 已对齐；完整零模型 Gate 通过。 |
| B-live：真实空白栈预检 | `PENDING_USER_LIVE_PREFLIGHT` | 尚未启动 Docker/真实服务、未恢复真实资产、未运行模型；因此还不能创建 candidate-base tag。 |
| C：Prompt 方法实验 | `NOT_STARTED_ON_FORMAL_V2_1` | 方法分支存在，但都不是当前 800 例 common-base 的后代，不能直接作为正式模型候选运行或合并。 |

当前没有证据表明 800 例正式数据、Gold/Pair 隔离、runtime binding 或正式评分链存在阻塞性错误。下一步不是继续改基座，而是由用户在当前精确提交上执行一次 R05 blank-stack preflight。

## 2. 审计边界与身份

本次对齐只审查任务一正式实验相关路径，不把全仓库的既存依赖和类型问题扩展为任务一整改：

- Stage A worktree：`D:\projects\TencentDB-Agent-Memory-task1-common-base-formal-v2.1-stage-a`
- Stage A commit：`a22cebd5cf58c1502bb47687a5955dae9f80f7b4`
- 当前 common-base worktree：`D:\projects\TencentDB-Agent-Memory-task1-common-base-formal-v2.1`
- 当前 common-base commit：`2c323b55a087af83388cac9f5d775b63095e1dbb`
- 数据 annotated tag：`task1-data-formal-v2.1`
- 数据 tag object：`6dcb766b0d9d831fe06cd45176da4d8d59cd0a78`
- 数据 peeled commit：`a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6`
- Provider/Gold：800（Dev 320，Hidden 480）
- Pair：300（Dev 120，Hidden 180）
- runtime contracts：22
- runtime bindings：800
- formal Smoke：40

正式的 40-case Smoke 与 README 开头的 12-case Mock-contract/Pilot Smoke 是两个不同执行层，不能互相替换：前者走生产 Session Init 与 `InjectionPipeline`，后者只保留为回归。

## 3. 对旧审计结论的逐项复核

### 3.1 “阶段 A 的回归并未全部通过”

结论需要改写，而不是简单判为真或假。

阶段 A Gate 的声明边界本来就是 `PASS for Stage A freeze`，并明确列出 overlay、runtime、restore、Smoke 和 live preflight 留给阶段 B。2026-09-01 在冻结的 Stage A commit 上重新运行当前完整 integration Gate：

- D0 TypeScript：46/46 通过；
- D0 Python：通过；
- Tool Prompt：31/31 通过；
- integration core：192/192 通过；
- Measurement-v2：106/116 通过，10 个测试在同一入口失败；
- 统一失败原因：`worktree dataset status does not match the frozen Tag blob`。

这 10 个失败说明 Stage A 中的旧 Measurement-v2 manifest 尚未迁移到 formal-v2.1，而不是 Stage A 的 800 例公开数据错误。把“最终全链 Gate 失败”写成“阶段 A 数据 Gate 失败”会混淆阶段边界。

处理：保留 Stage A commit/tag 作为不可变数据接入 checkpoint，不回写它；修复发生在阶段 B common-base，并由当前完整 Gate 验证。

### 3.2 “阶段 B restore、overlay、Smoke 未迁移，并产生新增失败”

该问题曾经成立，当前已解决。

从 Stage A 到当前 common-base 的 60 个变更文件只位于任务一 eval、formal runtime、Measurement-v2、R05 contract/test 与相关文档路径。当前完整 integration Gate 结果：

| Gate | 结果 |
|---|---:|
| D0 TypeScript | 46/46 |
| D0 Python | 19/19 |
| Tool Prompt | 31/31 |
| Integration | 192/192 |
| Measurement-v2 | 116/116，focused `tsc` 通过 |
| R05 production asset adapter | 96/96 |
| R03 real-chain/restore | 63/63 |
| Formal runtime | 34/34 |

关键冻结关系已经闭合：

- private loader 同时校验 Dev/Hidden Gold、Pair、22 个 runtime contracts 和 private manifest hash；
- runtime freeze 同时绑定公开数据身份、private overlay hash、800 bindings、40-case Smoke 与 Selection Contract；
- restore plan 固定为 432 actions、285 requirements、386 assets；
- 40-case Smoke 固定覆盖 8 个 Dev Team，每个 Team 各含 Memory/Skill/Knowledge 正例、一个冻结 Pair 负例和一个自然 coding 负例；
- Provider 输入不包含私有 Gold/Pair；provider leakage 为 0。

### 3.3 “Smoke 必须轮换多种反事实类型”

旧要求不符合任务一主目标，已经移除为硬 Gate。

当前 300 个 Pair 全部使用已冻结、可证明的 `answer_in_current_context`，这直接检验“上下文已足够时不要误调用”。任务一要求的是正确的 Tool/No-tool、family 和最短充分决策链，不要求诊断标签必须均匀分布。因此没有为了凑类型而修改 Gold 或事后编造标签。

`repository/version mismatch` 保留为未来辅助诊断：

- mismatch 已在 query/context 中明确可见时，期望 no-tool；
- 只有通过 Knowledge list/search 才能发现 mismatch 时，允许执行最短发现链，并在确认不匹配后停止；
- 当前 800 例不回填此标签，也不因此阻塞正式基座。

### 3.4 “全量 TypeScript 检查失败”

现象成立，但不是阶段 B 新回归，也不阻塞任务一评测。

`npm run typecheck` 仍因仓库既存问题退出 1，主要包括：

- MemoryCore 的 SQL 类型漂移与缺少 `node-llama-cpp`；
- MemoryKnowledge 缺少 sqlite/drizzle/graphology/telemetry 等依赖类型；
- 主处理器与 Session Init 的 `resetFlow`、`SessionInfo` 等既存接口漂移；
- `src/config.ts` 的既存 profile type export 漂移。

阶段 B 的 60 个变更文件没有出现在本次全量 TypeScript 诊断中；任务一 focused TypeScript、运行时合同和完整 benchmark Gate 均通过。按照当前项目决策，这些全仓库基线错误记录为 non-blocking，不在任务一分支做无关修复。

### 3.5 “阶段 C 尚未开始”

对正式 formal-v2.1 Campaign 而言仍然正确，但需要补充已有方法分支的定位：

| 分支 | 与当前 common-base 的关系 | 当前用途 |
|---|---|---|
| `codex/task1-method-c3p-eq` | merge-base `c86b154f`；当前基座独有 41 commits，方法分支独有 3 commits | 只完成结构 inventory/source map；`prompt_variants_changed=0`，不能作为独立模型候选。 |
| `codex/task1-method-tscg-lite` | merge-base `0373227c`；当前基座独有 13 commits，方法分支独有 1 commit | 方法原型，待 candidate-base 后迁移并重跑 Gate。 |
| `codex/task1-method-v4-g` | merge-base `0373227c`；当前基座独有 13 commits，方法分支独有 1 commit | 方法原型，待 candidate-base 后迁移并重跑 Gate。 |
| `codex/task1-method-v4-rn` | merge-base `0373227c`；当前基座独有 13 commits，方法分支独有 1 commit | 方法原型，待 candidate-base 后迁移并重跑 Gate。 |

处理：现在不合并这些分支。先完成 common-base 的 live R05 并给同一 commit 打 candidate-base tag；之后每个模型可见方法从该 tag 建独立后代，只迁移该方法自己的最小 diff，使用相同 800 例、资产、上下文、模型和运行协议比较。

## 4. 本次发现并修正的当前问题

本次没有修改数据、Gold、Pair、runtime freeze、评分器或生产 Prompt，只修正文档与真实合同的漂移：

1. `README.md` 把正式层的 `Formal v1.1` 改为 `Formal v2.1 800-case`，并明确正式 Smoke 是 40 例；开头的 Pilot 12-case Smoke 保留不变。
2. `EXPERIMENT-DESIGN.md` 的状态从“正在完成零模型 Gate”更新为“零模型 Gate 已通过，等待用户 live R05”。
3. `R05-PRODUCTION-ASSET-ADAPTER-RUNBOOK.md` 中残留的 12/12 receipt、12 个 case ID 和三个 `# 12` 输出数量改为 40；脚本和合同本身原本已经按冻结 40-case selection 工作。

历史冻结文件中的 `formal-v1.1`、`640/240/400` 或 `task1-candidate-base-v1` 引用不得机械替换。它们是 R02/旧 Measurement-v2 的不可变来源与 provenance，而不是当前 runner 配置。当前 active loader、Selection Contract、runtime freeze 和 runbook 均以 formal-v2.1 的 800/320/480 为准。

## 5. 公平性、隔离和对抗复核

本次按任务一需要检查了以下影响指标正确性的边界：

- 同一冻结 Provider case、private Gold/Pair、runtime contract、binding 与 Smoke hash 被所有 Variant 共用；
- 每个 run 使用独立 run/session identity，正式 Provider 路径不接触 private Gold；
- swapped private overlay、篡改 binding/Smoke、错误 tag/status、未授权 Hidden split 都会在 loader/freeze Gate 关闭；
- live R05 的 Restore 与 Inspect 分阶段，Inspect 复用同一 RunRoot，不重复恢复资产；
- preflight 检查 L1/L2a/L2b、visible assets、write-side disabled 和 fresh namespace；
- R05 仍要求 Node 22、loopback service URLs、clean worktree 和精确 Git locks；本次离线运行不能替代这些 live 条件。

没有为了“更安全”增加与任务一无关的容灾层；保留的检查只服务于数据一致、资产可见、状态隔离、Prompt 唯一注入和指标可归因。

## 6. 当前唯一正确的下一步

1. 在当前 common-base 的文档修正提交上复跑同一完整离线 Gate，保持 worktree clean。
2. 用户按 `R05-PRODUCTION-ASSET-ADAPTER-RUNBOOK.md` 在本机空白栈执行 `Restore`，等待 Knowledge ready 后在同一 RunRoot 执行 `Inspect`。
3. 只有 40/40 receipt ready、summary 生成、Git/config/service identity 未漂移时，才在同一 commit 上创建 candidate-base tag。
4. 先运行 V0 的 40-case formal Smoke；它通过后再开始 Dev V0→V3 和各创新方法的配对实验。

在完成第 2～3 步前，不应声称阶段 C 已开始，不应运行方法分支的正式模型 Campaign，也不应创建最终优化 PR。
