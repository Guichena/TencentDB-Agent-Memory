# Task 1 一周执行总方案：从 800 例公共基座到实验报告与 PR

版本：2026-08-31

计划窗口：7 天

正式数据：`task1-data-formal-v2.1`，800 Case（Dev 320 / Hidden 480），300 Pair

正式模型：`gpt-5.6-luna`，reasoning `high`，verbosity `medium`

任务边界：只评价系统提示词能否让模型正确决定是否调用、调用哪一族工具以及完成必要的最短充分工具决策链；不评价资产正文质量和最终 coding 结果。

## 1. 一周后的目标状态

第 7 天结束时，至少应具备以下可审计结果：

1. 一个冻结、可运行的 800 例公共实验基座，真实走 MemoryProxy、MemoryCore、Skill Bridge 和 MemoryKnowledge 链路。
2. V0、V0-C、V1a、V1、V2、V3 在同一基座上的 Dev 指标与完整 Token 台账。
3. C-3P、TSCG-lite、V4-G、V4-RN 四个独立候选已被移植到同一基座；通过 smoke 的候选拥有 Dev 对比数据。
4. 一个根据预注册规则选出的最终候选；V0 与最终候选完成 Hidden 对比。
5. 实验报告同时给出有效调用、误调用、工具选择、完整链、Pair、overcall、静态注入 Token、总输入/输出/缓存 Token、延迟与排除原因。
6. 优化方案说明、复现实验命令、原始 trace 索引、冻结 manifest 和可提交 PR 分支。

如果运行预算不足，最低可交付边界是：800 例公共基座 + 全核心 Variant 的 320 Dev + 创新候选 smoke/Dev + V0/最终候选各一次 480 Hidden。不得为了赶时间回退到 640 例，也不得用单元测试结果冒充模型行为实验。

## 2. 设计原则

### 2.1 唯一自变量是 Prompt Variant

对同一 Case，以下内容全部固定：

- 模型、reasoning、verbosity、官方上游和账户身份；
- provider 可见 query、历史消息和工作区；
- Space、Team、Agent、Task、Memory、Skill、Knowledge 快照；
- MemoryProxy 版本、runner、scorer、超时、轮次上限和并发；
- session 初始化流程、TDAI header、真实 endpoint 和读取权限；
- 运行顺序生成规则、排除规则和 Token 计数器版本。

只允许变化：生产 `InjectionPipeline` 选择的 Prompt profile 或该候选方法的最小 Prompt/Compiler diff。

### 2.2 800 例是唯一正式数据入口

后续代码不得接受“默认 640、可选 800”这种双主线。开发完成后，正式运行路径的冻结常量应唯一指向：

| 项目 | 正式值 |
|---|---:|
| Space | 1 |
| Team | 20 |
| Case | 800 |
| Dev | 320 |
| Hidden | 480 |
| Pair | 300 |
| Dev Team | 8 |
| Hidden Team | 12 |

旧 formal-v1.1 文件和报告可以留在 Git 历史中，但不得被 loader、selection contract、runtime freeze、restore plan 或 run manifest 解析为当前输入。

### 2.3 一个公共基座，多 profile 与独立创新分支

V0–V3 已由同一 Compiler/profile seam 实现，正式实验在同一 commit 上切 profile。创新方法尚不在新公共基座上，因此需要四个独立移植分支；移植分支不得互相继承，以免无法归因。

### 2.4 只保留影响公平和正确性的 Gate

必须保留：数据数量/hash、provider/private 隔离、真实入口观测、唯一 session/local-state、只读资产、Token/usage 完整性、同 Case 同快照、模型配置一致性、运行失败排除原因。

不扩展：生产级重试队列、自动回滚、自愈、灾备、复杂权限矩阵、答案质量 LLM Judge、最终补丁正确性、长期服务运维。

### 2.5 Langfuse 只做观察镜像

如果本地 Docker 中的 Langfuse 已可用，可以镜像每次 run 的 trace、模型调用、工具调用、耗时和标签，方便人工查看 bad case。正式指标仍由仓库内冻结 Gold、真实入口事件和离线 scorer 计算；Langfuse 不保存 private Gold，不使用 AI Judge 决定主指标，也不能成为唯一原始证据。

## 3. 公共基座的组成

新的 `codex/task1-common-base-formal-v2.1` 应从 `task1-candidate-base-v1` 建立，集成 `task1-data-formal-v2.1` 的正式数据内容与校验能力，然后重新生成所有 800 例派生产物。

```text
Prompt code freeze (V0–V3)
  + C07 / M0 / M1 / M2 scoring capabilities
  + R01–R05 real-chain and restore capabilities
  + formal-v2.1 800-case data contract
  + formal-v2.1 Measurement overlay
  + 800-case bindings / runtime freeze / restore plan
  + live blank-stack preflight
  = task1-common-base-formal-v2.1
```

建议冻结标签：`task1-common-base-formal-v2.1-v1`。只有阶段 B3 的真实资产 preflight 通过后才能创建该标签。

## 4. 阶段 A：集成 800 例数据与公共代码能力

目标分支：`codex/task1-common-base-formal-v2.1`

预计时间：Day 1

### A1. 建立干净 worktree

任务：

1. 从 `task1-candidate-base-v1` 创建新的 branch/worktree。
2. 记录起点 commit、`task1-data-formal-v2.1^{}`、Node/npm 版本和工作树状态。
3. 禁止在现有脏 worktree 上集成。
4. 只从个人 fork `mine` 拉取 Task 1 引用，不改 TencentCloud `origin`。

完成检查：

- 新 worktree 干净；
- 起点精确为 `fa79ab94720545e1b6034b83f9b08d83ff2d6f9c`；
- 数据 tag 精确解引用为 `a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6`。

### A2. 集成 formal-v2.1 数据拥有的路径

集成原则：

- 以 formal-v2.1 的 registry、revisions、Team staging、source material、validator 和 DS08/DS09 证据为准；
- 以 candidate base 的真实链路、runner、scorer、usage、cache、隔离和 R01–R05 代码为准；
- 对同时修改的 overlay/status/README 不做简单 ours/theirs 选择，而是在阶段 A3 重新生成；
- 保留两个祖先 SHA 和所选路径的文件 hash 清单。

完成检查：

- strict validator：800/800 Case、300/300 Pair；
- Dev 320、Hidden 480；
- provider leakage 0、missing source ref 0、invalid sequence 0；
- formal-v2.1 source bytes/hash 仍一致；
- 原 V0–V3 tool-prompt 回归不退化。

### A3. 删除运行路径中的 640 假设

需要逐项修改和重新生成的主要位置：

- `EXPERIMENT-FREEZE-MANIFEST.json`；
- `formal-runtime/freeze.ts`、`runtime-freeze.ts`、`build-runtime-freeze.ts`；
- `formal-runtime/case-bindings.ts`、`build-case-bindings.ts`；
- `formal-runtime/private-loader.ts`；
- `formal-prepare-runner.ts`；
- `formal-assets/build-frozen-restore-plan.ts`；
- `run-r05-runtime-preflight.ps1`；
- `measurement-v2/SELECTION-CONTRACT.json`；
- R04/R05 runbook、Gate 和冻结 manifest；
- 所有把 `task1-data-formal-v1.1` 当作当前输入的源码常量。

注意：业务示例或 HTTP status 中的数字 `400` 不能机械替换。只修改数据规模、split 和旧数据 tag 语义。

完成检查：

- 运行源码中不存在当前合同意义的 `640/240/400`；
- 所有类型层、断言和错误信息一致为 `800/320/480`；
- 当前 data tag 唯一为 `task1-data-formal-v2.1`；
- 历史报告中的旧数字可以保留，但必须标注 historical。

## 5. 阶段 B：生成 800 例派生合同并验证真实资产

预计时间：Day 1–2

### B1. 重建 private overlay 与 Pair

从 formal-v2.1 已冻结的 provider/private 数据重建 Measurement-v2 overlay，而不是手工复制旧 manifest。

必须产出：

- 800 条 Gold v2：Dev 320、Hidden 480；
- 300 条 Pair v2：Dev 120、Hidden 180；
- runtime tool contracts；
- pair approval ledger；
- canonical JSON 与逐文件 SHA-256；
- provider exclusion 报告；
- M0 Gold input validation 800/800。

完成检查：

- Case ID 一一覆盖且无重复；
- Pair 每 Team 15 条且单一因果差异成立；
- private Gold/Pair 不进入 provider 文件、runner 输入或模型工作区；
- 两次独立生成结果逐文件 hash 一致。

### B2. 重建 bindings、runtime freeze 和 restore plan

必须产出：

- 800 条 case binding；
- 20 Team / Agent / Task / workspace 映射；
- 800 例 runtime freeze；
- Dev/Hidden selection contract；
- Gold-blind 资产 restore plan；
- T17–T20 新增资产的 restore action、可见性要求和读取 receipt；
- 新 manifest 中的代码 commit、数据 tag、配置 hash、tokenizer 和模型配置。

完成检查：

- binding 800/800，Dev 320、Hidden 480；
- 每条 Case 只绑定一个 Space/Team/Agent/Task；
- restore plan 不读取 private Gold；
- T01–T20 均有预期的 Memory/Skill/Knowledge 可见性；
- 同一 Case 的所有 Variant 指向同一 snapshot hash。

### B3. 空白真实数据栈 preflight

使用本机 Docker 的 MemoryCore、MemoryKnowledge、MemoryProxy 与相关依赖，运行一次空白栈恢复。不要启动正式 Luna Case。

流程：

```text
启动专用空白栈
  → Restore 20 Team 资产一次
  → 等待 Knowledge ready
  → Inspect / read-back
  → 保存 receipt、health、配置 hash
  → 关闭写入与自动抽取
  → 冻结公共基座 tag
```

数据不是每个 Case 重复导入。一个 Campaign RunRoot 先把 20 Team 资产整体恢复到专用空白栈；Case 通过 Team/Task/session 绑定选择可见内容。运行期间关闭 LLM 写入、自动抽取和归档写回，每条 Case 使用全新的 session ID 与本地状态目录，所以前一条 Case 不会生成新记忆影响后一条。

完成检查：

- 三服务 health 正常且 MemoryProxy 上游仍是官方 ChatGPT Codex；
- restore/inspect receipt 全部通过；
- T17–T20 真实资产可恢复、可见、可读取；
- 资产计数与冻结 manifest 一致；
- worktree 和代码 HEAD 在 preflight 前后不变；
- 创建 `task1-common-base-formal-v2.1-v1` annotated tag 并推送。

## 6. 阶段 C：移植四个创新候选

预计时间：Day 2–3

前置 Gate：阶段 B 全部通过。

四个分支都从 `task1-common-base-formal-v2.1-v1` 新建：

| 新分支 | 只允许移植的来源 | 禁止带入 |
|---|---|---|
| `codex/task1-exp-c3p-eq-formal-v2.1` | `method-c3p-eq` 的三平面源码、测试和候选描述 | 旧数据、旧 runner、其他方法 |
| `codex/task1-exp-tscg-lite-formal-v2.1` | TSCG operator ladder、profile 和专用产物捕获 | V4-G、V4-RN、旧 freeze |
| `codex/task1-exp-v4-g-formal-v2.1` | typed action graph 和 G1/G2 profile | 其他创新方法 |
| `codex/task1-exp-v4-rn-formal-v2.1` | neutral symmetric cards 与 profile | 其他创新方法 |

每个分支的提交顺序：

1. `feat(tool-prompt): port <method> onto formal-v2.1 common base`；
2. `test(tool-prompt): verify <method> isolation and profile invariants`；
3. `docs(tool-prompt-bench): freeze <method> candidate manifest`。

每个候选完成检查：

- 相对公共基座只有方法相关文件；
- V0–V3 输出 hash 不变；
- 数据、Gold、Pair、bindings、runner 和模型配置 hash 不变；
- Node 22.x 下候选专用测试和公共 Gate 通过；
- 生成静态 Prompt artifact、block hash、字符/字节/o200k Token；
- 不创建“效果更好”结论，只标记 `READY_FOR_MODEL_SMOKE`。

## 7. 阶段 D：冻结正式实验配置

预计时间：Day 3

### D1. 固定模型与链路

| 配置 | 固定值 |
|---|---|
| Client | Codex，`agentSource=codex` |
| Model | `gpt-5.6-luna` |
| Reasoning | `high` |
| Verbosity | `medium` |
| Upstream | 官方 ChatGPT Codex endpoint |
| Request path | 必须经过当前 MemoryProxy |
| Data | `task1-data-formal-v2.1` |
| Writes/extraction | 全部关闭 |
| Tokenizer | `o200k_base`，版本固定 |
| Main concurrency | 先 2，确认无 rate/trace 混淆后最多 4 |

不得修改用户现有 Codex 登录配置。runner 通过显式启动参数选择项目配置，正式命令由用户自己执行；脚本不得启动新的 Codex 登录流程，也不得覆盖全局 `config.toml`、auth 文件或持久 YAML。

### D2. 固定顺序和隔离

使用公开 seed 生成运行顺序：

- Case 顺序按 Team 分层后打散；
- 同一 Case 的 Variant 顺序用轮转/反平衡，不让某个 Variant 总是第一个；
- 每条 `case × variant × repeat` 使用唯一 session ID、conversation ID 和 local-state directory；
- 资产快照共享但只读；
- provider cache 保持自然工作，只记录 `cached_tokens`，不把缓存命中当成行为成功；
- 失败重跑必须保留原 run，并用新 attempt ID；不能覆盖失败证据。

### D3. 固定主指标与选择规则

主指标：

1. `CompleteChainSuccessRate`：正例完成任一允许充分工具决策链；对应任务要求中的有效调用率。
2. `FalseCallAttemptRate`：No-tool 样本出现任意 executor-bound TDAI Attempt；对应误调用率。
3. `TerminalSelectionRate`：全部正样本中到达允许 terminal 工具选择的比例；比“已调用样本中的正确率”分母更公平。
4. `StaticToolTokens`：生产 InjectionPipeline 的静态工具说明 Token。

必报伴随指标：

- Trigger Recall；
- Conditional Terminal Accuracy（带分子、分母）；
- PairExact；
- Positive Overcall Rate；
- Shortest Sufficient Chain Rate；
- ToolSPL；
- malformed intent；
- infrastructure exclusion count；
- provider input/output/reasoning/cached Token；
- p50/p95 latency。

选择规则按顺序执行：

1. 先排除 trace、身份、快照、usage 或真实入口证据不完整的运行；
2. 候选的行为指标必须位于 V0 的非劣区域，不能用省 Token 掩盖明显行为退化；
3. 在 Complete Chain、FCR、Terminal 与 PairExact 合格的候选中，选择静态 Token 最小且 overcall 更低者；
4. 若指标互有胜负，保留 Pareto frontier，不用主观总分强行排序；
5. Dev 只负责选择，Hidden 不用于继续改 Prompt。

统计报告使用按 Team 聚类的 paired bootstrap 区间，并同时给出分子/分母/排除数；不把 800 条 Case 当作完全独立样本。

## 8. 阶段 E：模型 smoke 与核心 Variant Dev

预计时间：Day 3–4

### E1. 40 例行为 smoke

从 8 个 Dev Team 每 Team 选 5 条，覆盖 Memory、Skill、Knowledge、paired negative 和 natural coding negative。所有核心 profile 和创新候选先跑相同的 40 条。

Smoke 只检查：

- 请求确实经过 MemoryProxy；
- 注入 profile/候选 ID 与 artifact hash 正确；
- Memory/Skill/Knowledge 真实入口事件可归并到唯一 run；
- 多步链能继续到 terminal；
- Token usage 和 cache usage 可采集；
- No-tool case 不因 runner 本身调用 TDAI；
- 无身份泄漏、跨 session 污染或资产变化。

任何一个基础设施问题都先修公共基座，再重新冻结；禁止在单个 Variant 分支做特例修复。

### E2. 核心 profile 的 320 Dev

在同一公共基座依次收集：V0、V0-C、V1a、V1、V2、V3。它们用相同 run plan 交错执行，不按“先跑完整 V0，再跑完整 V3”的大块顺序。

完成检查：

- 每个 profile 都有 320 条 eligible 或明确排除记录；
- 原始 trace、provider request evidence、usage、注入 artifact 和 offline score 全部可 join；
- 输出核心 profile 对比表和按 Memory/Skill/Knowledge/No-tool 的错误分解；
- 不打开 Hidden 结果。

## 9. 阶段 F：创新候选 Dev 对比

预计时间：Day 4–5

执行策略：

1. 先用 40 例 smoke 淘汰明显断链、误调用激增或 Token 反而显著增加的候选；
2. smoke 合格候选全部跑 320 Dev，不根据前几十条临时改 Prompt；
3. 每个方法保持独立分支和独立 variant ID；
4. 若某方法需要修正，建立新提交和新候选 ID，旧结果保留，不覆盖原 run。

需要回答的问题：

- 该方法是否提升 Complete Chain，而不是只提升第一步触发？
- 是否降低某个 family 的误选，却导致 no-tool 误调用上升？
- Token 节省来自静态工具说明，还是仅把内容挪到动态区域？
- 是否损伤 prompt cache 的稳定前缀？
- 对 discovery 链和 direct 链的影响是否不同？
- 改善是否集中在少数 Team，还是跨 Team 稳定？

阶段输出：Dev Pareto 表、每个方法的错误簇、Token 台账、保留/淘汰理由和最终候选 commit。

## 10. 阶段 G：Hidden、稳定性复核与最终选择

预计时间：Day 5–6

### G1. 冻结候选

进入 Hidden 前必须冻结：

- V0 commit/profile hash；
- 最终候选 commit/profile hash；
- 数据、overlay、bindings、snapshot、restore receipt hash；
- 模型、运行顺序 seed、并发、超时和轮次上限；
- scorer 版本和统计脚本；
- Hidden 运行清单。

### G2. 480 Hidden 主比较

至少执行 V0 与最终候选各一次 480 Hidden，按 Case 配对并反平衡 Variant 顺序。运行结束后一次性离线 join private Gold。

若时间与账户预算允许，优先增加：

1. 对 V0 与最终候选各做完整第二、第三 repeat；
2. 若完整 repeat 来不及，对 80 条按 Team/Family 分层的稳定性子集补足三次重复；
3. 第二模型只作独立附录，不与 Luna 合并主比例。

正式结论必须明确写出实际 repeat 数，不能把“计划三次”写成“已完成三次”。

### G3. 最终选择

最终候选只有在 Hidden 上满足以下条件才可进入 PR：

- Complete Chain 与 Terminal Selection 没有实质退化；
- FCR 没有实质上升；
- PairExact 和 overcall 没有显示新的系统性错误；
- 静态工具 Token 明确减少，且不是靠删除必要触发信息换取；
- prompt cache 前缀稳定性未被破坏；
- 结果在 Memory、Skill、Knowledge 和 No-tool 分组中可解释。

如果所有创新候选都不如 V0–V3 中的某个核心 profile，最终方案可以选择核心 profile。研究方法不是交付物本身，任务一指标才是。

## 11. 阶段 H：报告、PR 与复现包

预计时间：Day 6–7

### H1. 实验报告

主表至少包含：

| Variant | Eligible Positive | Complete Chain | Terminal Selection | Eligible Negative | FCR | PairExact | Overcall | Static Tokens | Token 节省 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|

每项比例同时写整数分子/分母、按 Team 聚类区间和排除数。附表记录：

- Memory / Skill / Knowledge / No-tool 分组；
- direct / discovery / multi-step 分组；
- input/output/reasoning/cached Token；
- chars、UTF-8 bytes、o200k Token、block SHA-256；
- cache prefix、cache read/write 可见值；
- 延迟和基础设施错误；
- 代表性 bad case trace 索引。

### H2. 优化方案说明

说明最终候选改了什么、为什么、相对 V0–V3 和四个创新候选的证据、已知限制、跨模型可迁移性边界，以及为什么没有引入与任务一无关的复杂机制。

### H3. 代码 PR

PR 只包含：

- 最终 Prompt/Compiler 改动；
- 必要的 profile 与回归测试；
- 任务一需要的评测/复现脚本；
- 实验报告和冻结 manifest；
- prompt cache 保真修复（如果真实证据表明需要）。

PR 不包含：数据建设临时分支、个人认证配置、private Gold、运行账户信息、Langfuse 私密内容、无关基线 typecheck 修复或过度工程兜底。

## 12. 七天排期总表

| 天 | 主要任务 | 当日必须过的 Gate | 当日产物 |
|---|---|---|---|
| Day 1 | 建 800 公共基座；集成 formal-v2.1；重建 overlay/bindings/freeze | 800/320/480、300 Pair、hash/泄漏 Gate | 公共基座候选 commit |
| Day 2 | restore plan、T17–T20、真实空白栈 preflight；开始移植候选 | read-back、只读、identity、配置 hash | common-base tag；候选分支 |
| Day 3 | 候选静态 Gate；冻结运行配置；40 例 smoke | profile/hash/trace/usage/隔离 | smoke 报告；正式 run plan |
| Day 4 | V0–V3 六个核心 profile 的 320 Dev | 每 Variant 完整证据与离线 join | 核心 Dev 对比表 |
| Day 5 | 创新候选 320 Dev；冻结最终候选 | Pareto、错误分组、Token、cache | 最终候选 tag/manifest |
| Day 6 | V0 vs 最终候选 480 Hidden；稳定性复核 | Hidden 一次性 join、无调参 | Hidden 主结果 |
| Day 7 | 报告、方案说明、PR、复现说明 | diff、测试、结果引用与隐私检查 | 三项交付物 |

如果 Day 1–2 的公共基座 Gate 未过，不得提前跑模型。若 Day 6 运行仍在进行，优先保证 V0 与最终候选的成对 Hidden 完整性，减少附加 repeat 或第二模型，而不是缩减 Case 或改回 640。

## 13. 每阶段统一完成检查

进入下一阶段前必须回答“是”：

- 当前 worktree 是否干净，commit/tag 是否唯一？
- 是否仍只使用 formal-v2.1 的 800 例？
- 所有 Variant 是否读取同一 provider 输入、资产 snapshot 和上下文？
- private Gold/Pair 是否与模型完全隔离？
- 是否走真实 MemoryProxy 和真实工具入口？
- 模型、reasoning、verbosity、上游、并发和顺序是否固定？
- 每条 Case 是否有独立 session/local state，且写入/抽取关闭？
- 原始 trace、usage、Prompt artifact、score 是否都能按 run ID join？
- Token 是否保存了静态、动态、总注入和 Provider 四层？
- 失败是否保留原证据并写明排除原因？
- 是否没有用单测、静态 Token 或 Langfuse AI 评分替代正式行为指标？

任一项为“否”，当前阶段不能标记完成。

## 14. 当前尚未完成的全任务清单

截至本文冻结时，以下事项仍是未来工作，不应在汇报中写成已完成：

- 800 例 Measurement overlay、case bindings、runtime freeze 和 restore plan 尚未在公共基座重建；
- 800 例 M0/M1/M2 集成 Gate 尚未重新执行；
- formal-v2.1 的真实 blank-stack restore/inspect 尚未执行；
- 四个创新候选尚未移植到共同祖先；
- 尚未调用 Luna 跑正式 Case；
- V0–V3 和创新方法均没有正式行为对比结果；
- Langfuse 是否已经连接到本轮 MemoryProxy trace 尚需运行前确认；
- 最终候选、Hidden 结果、实验报告和代码 PR 均未完成。

当前完成的是：Prompt profile/Compiler 基础、C07/M0–M2/R01–R05 代码能力、formal-v2.1 800 例数据冻结、四个创新候选源码、分支远端备份，以及本执行方案。
