# Task 1 研究汇总、设计候选与分阶段试验总案

> 状态：三轮只读审核后的研究与规划稿，2026-08-30。
>
> 本文汇总当前源码审计、上一轮外部证据研究、本轮新颖设计检索和评测方法复核，作为后续研究候选、指标和分流决策的统一总目录。正式数据冻结、真实链路接入和运行交接仍须满足 [`TASK1-POST-DATA-EXECUTION-PLAN.md`](../TASK1-POST-DATA-EXECUTION-PLAN.md)；本文在 Stage -1 中只重申其阻断 Gate，不重复全部命令。它不授权立即运行模型，也不改变已经冻结的 V0–V3。
>
> 两份保留的证据详稿：[`TASK1-EXTERNAL-EVIDENCE.md`](./TASK1-EXTERNAL-EVIDENCE.md) 与 [`TASK1-NOVEL-DESIGN-RADAR.md`](./TASK1-NOVEL-DESIGN-RADAR.md)。本文给出项目决策、优先级和执行 Gate；详稿保留来源推导与反证细节。

## 0. 最终判断

现有 `V0 → V0-C → V1a → V1 → V2 → V3` 方向正确，不应推倒重来：它已经依次完成合同纠错、共享协议压缩、语义去重、选择校准和能力裁剪。在 code-freeze manifest 的 C00 canonical fixture 上，**完整注入总量**从 V0 的 4,863 token 降到 V3 的 2,224 token，减少 54.3%；其中 `staticToolTokens` 组件诊断值从 4,579 降到 2,027，减少 55.7%。前一组总量还包含动态资产与 runtime binding，不能称为纯静态工具描述。两组数字都只是冻结 render 的 token 证据，**尚不能证明 V3 的模型行为优于 V0**，因为正式 Luna 行为评测还没有完成。

接下来也不应一次实现所有新方法。正确顺序是：

1. 先修正评分、成对反事实、缓存保真和完整 token 账本，确保测量对象就是 Task 1。
2. 在冻结数据上跑 V0–V3，保留所有中间版本；最终版本不必是编号最大的版本。
3. 根据真实错误分层，优先尝试成功概率较高的静态设计：关系图、三平面编译、可归因 cue 剪枝和缓存布局。
4. 只有静态 Prompt 已出现明确瓶颈时，才尝试四态 gate、自动搜索或动态 schema/frontier。
5. 任何动态架构必须累计到正确 terminal 调用，不能只报首轮 Prompt 变短。

对 Task 1 而言，最有希望的新组合不是一个庞大的“V4”，而是：

```text
独立真实 Gold / Runtime Contract
              ↓
Decision Plane：Tool/No-Tool + family + typed relations + discriminative cues
Execution Plane：不可自由改写的 exact method/path/header/body/schema
Runtime Binding Plane：session/space/resource/skill 等动态值，确定性后置
              ↓
最小反事实 PairExact + 最短充分链 + 完整 token/cache ledger
              ↓
按错误簇做 cue LOO / 局部改写，保留所有更优中间候选
```

## 1. 本文的任务边界

### 1.1 要优化的内容

- 应调用时，模型能进入正确的 Memory、Skill 或 Knowledge 决策链。
- 不应调用时，尤其是纯 coding、当前上下文已足够、资产不匹配时，不误调 TDAI 工具。
- 调用后选择正确的 family、terminal 工具和必要的前置链。
- 用尽可能少的静态及累计 token 达成上述行为。
- 保持 Prompt 前缀稳定，真实缓存数据可观测。

### 1.2 明确不评价的内容

- Memory、Skill、Knowledge 返回正文是否优质。
- 工具返回后最终自然语言回答是否优美。
- 最终代码是否通过完整项目测试。
- 资产抽取、Wiki、CodeGraph 等与当前 case 不可见或不相关的产品能力。
- 与工具决策无关的安全框架、复杂恢复和生产级容灾。

正确的停止点是：模型到达 Gold 允许的正确 terminal 工具，参数和跨步绑定满足合同，真实系统链路已经接受该调用。随后停止，不继续消费资产内容完成任务。

## 2. 当前冻结基线

三份原始研究稿来自 `D:\projects\TencentDB-Agent-Memory-task1-code` 的未跟踪文件；它们已经原样复制到独立审核 worktree `D:\projects\TencentDB-Agent-Memory-task1-research-audit-v1`，分支为 `codex/task1-research-audit-v1`，父提交为 `8117c9597c3f25786e17b3f8541fd13cbf6b3ebb`。原 worktree 的文件未移动、未删除、未提交。本轮没有修改注入源码、没有运行模型，也没有改变 code-freeze manifest。

| Variant | Profile | 唯一主要改动 | C00 完整注入总量 | `staticToolTokens` 组件 | dynamic / binding 组件 | 总量相对 V0 |
|---|---|---|---:|---:|---:|---:|
| V0 | `legacy` | 原始生产注入 | 4,863 | 4,579 | 201 / 65 | 0% |
| V0-C | `contract-corrected` | 只修有源码/探针证据的合同错误 | 5,126 | 4,824 | 201 / 65 | +5.4% |
| V1a | `protocol-compact` | 共享 curl、Header、错误和响应协议 | 4,413 | 4,216 | 201 / 65 | -9.3% |
| V1 | `compact` | 在 V1a 上合并重复行为规则 | 4,027 | 3,830 | 201 / 65 | -17.2% |
| V2 | `selection-calibrated` | Tool/No-Tool、family、`when/avoid/contrast`、中性措辞 | 2,308 | 2,111 | 201 / 65 | -52.5% |
| V3 | `capability-pruned` | 按真实 capability/lifecycle 裁剪不可执行工具 | 2,224 | 2,027 | 201 / 65 | -54.3% |

这些是单个冻结参考 render，不是正式数据分布。正式数据中的 Skill/Knowledge 列表、L2/L3、session/space binding 会按 case 变化，因此正式报告必须逐 case 对完整注入字符串整体编码，并给出 mean、p50、p95、总和及同 case paired delta。组件 token 只做归因；由于 tokenizer 边界效应，组件数字不能简单相加替代完整总量。

源码已经具备的良好基础：

- `RuntimeToolContract` 保存运行事实。
- `ToolPromptSpec` 保存 `when/avoid/contrast` 等决策语义。
- `PromptUnit` 支持稳定单元和来源映射。
- Compiler 是确定性纯函数，所有历史 profile 可在同一构建中运行。
- `selection-calibrated.ts` 已有全局 gate、工具卡和一部分措辞偏差 lint。
- `capability-pruned.ts` 已能按 capability signature 隐藏不可用能力。

源码仍缺少的关键表达：

- typed `requires / produces / effects / handoff / terminal` 关系；
- dependency edge 与 confusion edge 的区分；
- Decision、Execution、Runtime Binding 三个平面；
- 每条决策 cue 的稳定 `cueId`、token 成本和负责的错误边；
- capability 裁剪后的 terminal reachability lint；
- 真实 provider `cache_control`/breakpoint 的端到端保真保证；
- 与 Task 1 一致的最短充分链和严格成对评分。

数据状态也要分清：仓库当前 pilot fixture 合计 100 条，其中 pilot Dev 60、旧 Test 40；它们只适合 plumbing 和回归，旧 Test 也不是 sealed formal Hidden。最新正式计划目标是 Dev 160、Hidden 240、合计 400。当前少量 pilot pair 不能给 V0–V3 排名，也不能支持 conformal 或大规模自动 Prompt 搜索声明。

## 3. 研究证据如何使用

本文把证据分为四级：

| 等级 | 含义 | 项目用法 |
|---|---|---|
| A | 官方 API 文档或正式系统合同 | 可直接约束缓存、工具 schema 和使用账本，但仍需验证本地链路是否透传 |
| B | 正式会议/期刊论文，任务与工具调用直接相关 | 支持设计方向和评测方法，不把论文效果量当 Luna 预期值 |
| C | 新预印本、规模/模型/架构差异较大 | 只作为候选灵感，必须低成本消融并保留反证条件 |
| D | 基于源码与多来源作出的项目推断 | 只能由本项目实验决定是否成立 |

重要来源与对应结论：

- [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)、[Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching) 与 [Tool Search](https://developers.openai.com/api/docs/guides/tools-tool-search)：工具描述要准确，稳定内容前置，缓存和 deferred schema 必须按真实 usage 观测。
- [EASYTOOL](https://aclanthology.org/2025.naacl-long.44/) 与 [ProCut](https://aclanthology.org/2025.emnlp-industry.20/)：标准化、语义单元化和 attribution-based pruning 可以减少 Prompt 冗余；不能把其压缩比例直接套到已压缩的 V3。
- [MetaTool](https://arxiv.org/abs/2310.03128)、[WTU-Eval](https://arxiv.org/abs/2407.12823)、[BFCL](https://proceedings.mlr.press/v267/patil25a.html) 与 [When2Call](https://aclanthology.org/2025.naacl-long.174/)：是否调用、调用哪个工具、参数/执行是不同能力，no-tool 必须单列。
- [AgentAbstain](https://arxiv.org/abs/2607.10059) 与 [Contrast Sets](https://aclanthology.org/2020.findings-emnlp.117/)：只差一个因果条件的 act/abstain 对比普通负例更能测出边界。
- [Tool Preferences in Agentic LLMs Are Unreliable](https://aclanthology.org/2025.emnlp-main.1060/) 与 [BiasBusters](https://proceedings.iclr.cc/paper_files/paper/2026/hash/a79875cc0d046ce7ce65f03f3affaa9e-Abstract-Conference.html)：顺序和修辞会显著影响工具选择，所以 production 顺序固定，但候选必须离线做顺序/等义压力测试。
- [ToolExpNet](https://aclanthology.org/2025.findings-acl.811/)、[HyperAgent](https://arxiv.org/html/2608.02650) 与 [RestGPT](https://arxiv.org/abs/2306.06624)：工具之间的前置和数据流关系值得显式化；其完整规划器并不直接适用于当前约十几个工具的静态注入。
- [TSCG](https://arxiv.org/html/2605.04107)：确定性 schema 编译和算子消融值得借鉴，但它是新预印本、模型差异大，且校正后显著结果有限；只能做 `TSCG-lite`。
- [MCP Tool Descriptions Are Smelly](https://arxiv.org/html/2602.14878) 与 Atlassian 的 [`mcp-compressor`](https://github.com/atlassian-labs/mcp-compressor)：前者支持把 Purpose/Guidelines/Limitations/Parameters/Examples 拆成组件，后者展示了 schema-on-demand 的可运行开源形态；两者都不能证明当前小工具面值得增加 discovery 层。
- [TRAS](https://proceedings.mlr.press/v318/davari26a.html) 与 [Constraint-Aware Capo](https://arxiv.org/html/2608.16068)：Prompt 改写应同时利用失败和成功轨迹、维护候选池并用逐项约束判断可行性；当前数据不足以直接启动自动搜索。
- [Improving Function Calling via Guided-Structured Templates](https://aclanthology.org/2025.emnlp-main.1242/) 与 [The Reasoning Trap](https://aclanthology.org/2026.acl-long.376/)：结构化的决策步骤可能有帮助，但自由 CoT 或更高 reasoning 不会自动减少工具幻觉。
- [ReCache](https://arxiv.org/abs/2608.19662) 和 [Tool-Call Dependency Structure](https://arxiv.org/abs/2605.25310) 是有价值的新证据，但前者需要模型推理栈/KV 控制，后者只证明内部表征可解码而非行为可控，均不进入当前实现主线。

## 4. 候选总目录：按成功可能性与必要性排序

“成功可能性”是结合当前源码、任务规模和外部证据的项目先验，不是统计保证。

| 序 | ID | 候选 | 类型 | 行为成功可能性 | 工程成本 | 依赖 / 分支组 | 何时尝试 | 何时停止 |
|---:|---|---|---|---|---|---|---|---|
| 0 | M0 | 最短充分链 scorer + 独立 Gold | P0 测量合同 | 极高必要性 | 中 | Shared Observation/Gold v2；measurement | 任何正式模型运行前 | terminal/合法路径仍无法明确表达 |
| 1 | M1 | 最小反事实 `PairExact` | P0 测量合同 | 高 | 中 | Shared Observation v2；最终 PairExact 依赖 M0；measurement | 正负 pair 已冻结 | pair 不是单因果差异或跨 split 泄漏 |
| 2 | M2 | 完整 token/cache ledger + fresh-session isolation | P0 测量合同 | 极高必要性 | 中 | Shared run observation；horizon 依赖 M0；measurement | 任何多轮或 cache 比较前 | 任一必需 usage 缺失或无法归属 |
| 3 | C-3P-EQ | Decision / Execution / Binding 三平面等价 IR | 编译前置件 | 行为未知；工程价值高 | 中 | Measurement-v2 + 冻结 `static_parent`；compiler-parity | 共同父候选可 byte-identical 重渲染 | exact contract、hash 或 byte parity 丢失 |
| 4 | V4-G | 静态 Tool Decision Graph | 静态 Prompt | 中高，多步错误时高 | 中 | C-3P-EQ + 审校 relation catalog；decision sibling | trace 有 prerequisite/terminal/handoff 错误 | 单步退化，或多步无增益只增 token |
| 5 | V4-CP | Causal Cue Pruning / budgeted cue compiler | 静态 Prompt | 中高 | 中高 | Measurement-v2 + 共同 `static_parent` + cue trace；decision sibling | trace 有稳定 confusion edge | held-out utility 翻转或任一硬阈值失败 |
| 6 | V4-RN | 中性措辞与组件 mask 的独立消融 | 静态 Prompt/编译 lint | 中高，低风险 | 低中 | Measurement-v2 + 共同 `static_parent` + Stage 1.5；decision sibling | order/paraphrase 或近邻偏差明显 | canonical 与 worst-case 均无改善 |
| 7 | V4-L | S0/S1/S2/S3 cache layout | 静态 layout probe | 条件性高 | 中 | M2 + C-3P-EQ renderer seam；layout sibling | metadata 保真且有复用流量 | cache write 抵消收益或行为退化 |
| 8 | TSCG-lite | signature/SDM/DRO/CFO 单算子阶梯 | 静态 Prompt | 中 | 中 | C-3P Execution IR；CFO 另依赖 V4-G catalog；execution sibling | Execution 仍有结构冗余 | 任一算子伤 terminal/contract |
| 9 | V4-A | DIRECT/CALL/CLARIFY/UNSUPPORTED 四态 gate | 静态 Prompt + 版本化 Gold overlay | 中 | 中 | 预冻结四态 overlay，或 formal-v2；decision sibling | 缺参/能力不足误调形成稳定簇 | 正确 CALL 大量转为过度澄清 |
| 10 | O-P | blame-localized CAPO/GEPA-lite 候选池 | 离线优化器 | 数据足够后中 | 高 | 已证明静态父候选 + 独立 folds；optimizer | 有真实 trace、fold、预算和机器 lint | 只在开发 fold 获益或预算耗尽 |
| 11 | A-F | Causal frontier | 独立动态架构 | 当前中低；规模增长后中 | 高 | 审校 V4-G catalog + 新 sealed revision；architecture | 过早 terminal/冗余探索持续存在 | frontier 漏 gold 或累计成本不优 |
| 12 | A-D | schema-on-demand / native tool search | 独立动态架构 | 当前低 | 高 | 规模/错误触发 + 新 sealed revision；architecture | 官方信号为 ≥10 tools、>10k definition tokens 或选择下降；本项目采用更保守的规模/错误触发 | 检索 recall 不足或 token displacement |
| 13 | A-IR | Intent IR + typed dispatcher | 独立架构 | 当前低 | 很高 | transport 错误簇 + 新 sealed revision；architecture | malformed/transport 成主要错误 | god-tool、ACL 弱化或选择无改善 |
| 14 | A-CF | conformalized consistency gate | 独立高成本策略 | 当前低 | 很高 | 独立 calibration + 新 sealed revision；architecture | 有独立 calibration 且允许 K 倍调用 | 风险保证不复现或 coverage 过低 |

当前明确不进入主线：LLMLingua/query-aware 动态裁剪、全文 embedding retriever、训练专用 router、完整 ToolGen/Toolken、按 query 查看 Gold 的 Prompt 选择、大量 few-shot、通用“请多思考/自检”、Provider 内部 KV 改造。它们要么改变任务，要么超出官方黑盒 API 权限，要么对当前 C00 V3 完整注入 2,224 token、静态工具组件 2,027 token 的小工具面没有足够收益依据。

为避免与上一轮研究稿的临时候选名冲突，本文统一命名：旧稿 `V4-C`（decision card normalization）并入 `V4-RN/V4-CP`；旧稿 `V4-H`（hard-negative）并入 P0 的 `PairExact` 数据与评测，不作为 Prompt Variant；旧稿 `V4-N`（namespace/deferred tool）改列独立架构 `A-D`。后续分支、报告和 manifest 以本文 ID 为准，但只有实际进入实验的候选才创建 Variant。

### 4.1 已研究但当前不单独立项的方法

| 方法/来源 | 可借部分 | 当前不单独试的原因 |
|---|---|---|
| ToolScope merge/retrieval | 审计重复工具说明、只保留相关候选 | V1a 已抽取共享协议；当前端点有不同合同，贸然 merge 会改变工具面；retrieval 归 A-D |
| PLAY2PROMPT/tool play | 从真实交互失败改进文档 | 它依赖探索资产输入输出；Task 1 不评价资产正文。若采用，只借 trace 驱动局部文案反思，归 O-P |
| ToolVerifier/self-verification | top-two contrast、调用前核对 | 会增加 Prompt/reasoning/轮次；只在具体近邻误选持续存在时，作为 V4-RN 的一条短 cue 消融 |
| Guided-Structured Templates | 结构化 function-call 决策步骤 | 已折入 V4-A/V4-G 的短 commit 规则；不增加自由 CoT，不把完整 curriculum 复制进 system prompt |
| ToolScopeRetriever/PORTS/SchemaRouter | field/tool aware retrieval | 当前小 catalog 无需训练/检索；若规模触发，归 A-D，并分开算 Recall@k 与 Selection@1 |
| ToolCPT/Hephaestus/Toolken | 训练模型内部工具知识 | 任务冻结官方 Luna，不能改模型权重，也不是 Prompt 注入优化 |
| ReCache/TVCACHE | schema 或 tool result 缓存 | 需要 provider 推理栈、KV 或训练环境控制；当前只能做 provider 支持的 prefix cache/V4-L |
| Full TSCG profile | deterministic schema transformation | 模型特异、当前 schema 较小；只留可逆、单算子、Luna 实测的 TSCG-lite |
| Full GEPA/MIPRO/CAPO/DCAPO | 自动 Prompt 搜索/训练 rewriter | 当前数据与独立 fold 不足；仅保留 O-P 的受约束小候选池入口 |
| Generic CoT/“think harder” | 可能增加显式检查 | Reasoning Trap 显示 reasoning 不自动抑制工具幻觉；Luna high 已冻结，额外 CoT 必须以单独 token/行为消融证明 |
| LLMLingua/query-aware pruning | 按 query 压缩上下文 | 会让每个 case 看到不同 Prompt，增加泄漏和公平性问题；静态 cue 剪枝优先 |

## 5. P0：正式试验前必须冻结的测量合同

### 5.1 把“调用了”与“正确完成工具决策链”分开

新评测口径使用 `evaluationSchemaVersion: 2`，不能悄悄复用当前源码中含义不同的 `effectiveCall`、`conditionalToolCorrect` 等旧字段后与历史结果拼接。旧 `effectiveCall` 当前混入 execution validity，旧 `conditionalToolCorrect` 更接近首动作；它们只能作为兼容字段或迁移后删除。

先定义 eligible 分母：

```text
N+ = Integration 最终判定 formalMetricEligible=true 的 tool-positive runs
N- = Integration 最终判定 formalMetricEligible=true 的 no-tool runs

Integration eligibility 同时要求 M0 trace completeness/可评分事实与 M2 的
required usage、session/snapshot/state isolation 和 infrastructure evidence。
无未解决 infrastructure error 只是必要条件之一，不足以由 M0 或 M2
单独把 run 放入分母。

Ai = 是否出现 trace-verifiable、executor-bound TDAI attempt。
     已进入模型 tool event、shell invocation、adapter 或 bridge 的 malformed
     dispatch attempt 也计 1；普通文本提到工具或展示示例 curl 不计。

Qi = 工具身份/endpoint/operation 序列在任何 forbidden wrong-family 或
     wrong-terminal 之前到达正确 terminal。

Si = Qi=1，且必需 prerequisite、handoff、gold-relevant args、binding
     provenance 正确，并被冻结 Runtime Contract/真实链路接受。
```

由此报告：

```text
TriggerRecall = sum_positive(Ai) / N+

FirstActionSelectionAccuracy
  正例全集中，第一个 executor-bound TDAI action 是否与 Gold 首动作兼容。

TerminalSelectionRate（TSR） = sum_positive(Qi) / N+
  固定正例分母，用于跨 Variant 比较工具/terminal 选择。

ConditionalTerminalAccuracy（CTA） = sum_positive(Qi) / sum_positive(Ai)
  只作条件诊断，必须同时报告分子/分母；分母为 0 时写 NA。

CompleteChainSuccessRate（ECR） = sum_positive(Si) / N+
  作为 Task 1 “有效调用率”的正式主口径。

StrictChainExact
  在 Si=1 基础上，evaluation prefix 内还没有 unexpected、duplicate
  或 over-budget attempt，且与一条 Gold sequence 精确匹配。

PositiveOvercallRate
  tool-positive runs 中，terminal 前出现 unexpected、duplicate 或
  over-budget attempt 的比例；与 no-tool 的 FCR_attempt 分开。
```

`TriggerRecall` 诊断“有没有想起工具”；`TSR` 用固定分母防止少调用简单 case 的候选获得虚高选择率；`CTA` 保留老师所说“调用后选对工具”的直观口径，但不作为跨 Variant 的单独硬 Gate。`ECR` 要求正确 terminal、链路 binding 与合同接受；`StrictChainExact` 再评价额外/重复调用效率，避免把外部基准没有统一规定的 over-call 惩罚静默塞入 ECR。

对 no-tool case 分开报告：

```text
FCR_attempt
  出现 executor-bound TDAI attempt 的负例比例；作为 Task 1 主误调用口径。

FCR_accepted
  负例中被 Runtime Contract/Bridge 接受的调用比例。

MalformedFalseIntentRate
  存在可识别 TDAI dispatch intent，但没有形成合法 dispatch 的负例比例。
```

这样 malformed attempt 不会逃过诊断，系统拒绝也不会把模型错误洗成正确；同时不会把“实际被接受的误调用”和“格式错误的调用意图”混成一个数。模型导致的 malformed、错误参数和合同 4xx 是模型失败；Provider/网络/Bridge 5xx、timeout、trace/required usage 丢失才是基础设施错误。

基础设施错误按 `SELECTION-CONTRACT.json` 的冻结重试规则重跑；仍未解决的 run 不进入模型行为分母，并使对应候选 campaign 标记为 incomplete。不能把它记成模型失败，也不能悄悄只删除某个 Variant 的困难 case 后继续比较。主表必须报告 eligible、infra、retry 和 unresolved 数。

最终正式 ECR/FCR_attempt/TSR/PairExact 只聚合经过真实 MemoryProxy 链路且 `formalMetricEligible=true` 的运行。`mock-contract` 和当前 mock runner 只用于 plumbing、协议和 scorer 回归，不进入正式主表。

### 5.2 最短充分工具决策链

每条 tool-positive case 的私有 Gold 保存一个或多个 `allowedSequences`。本文借用 embodied navigation 的 [Success weighted by Path Length](https://arxiv.org/abs/1807.06757) 形式定义 Task 1 专用 `ToolSPL`；这是跨领域迁移的项目诊断指标（D），不是已经由工具调用基准验证的标准指标。

先冻结评价截断：

```text
evaluationPrefix
  成功正例：截至第一个被 private Gold + Runtime Contract 接受的正确 terminal call；
  失败正例：截至冻结 run budget 或 turn completion；
  no-tool：截至 turn completion。
```

Runner 最好在正确 terminal 被接受后阻止下一轮模型推理；如果宿主无法立即停止，terminal 之后的资产内容、最终回答和额外行为不进入 Task 1 的 ECR/ToolSPL。

定义：

```text
L*i = min(|s|), s ∈ allowedSequences_i
Pi  = evaluationPrefix 内所有 executor-bound TDAI attempts 数
Si  = 第 5.1 节 CompleteChainSuccess/ECR 的正例成功指示量

ToolSPL = mean_i [ Si × L*i / max(L*i, Pi) ]
ShortestExact = mean_i 1[StrictChainExact_i = 1 and Pi = L*i]
```

`ECR/CompleteChainSuccess` 仍是主指标；失败时 ToolSPL 必为 0，成功但有 terminal 前额外调用时会按路径长度受罚。`ToolSPL` 和 `ShortestExact` 不能替代 ECR。No-tool 不进入 ToolSPL，由 FCR_attempt 和 PairExact 约束。

若未来同一 case 存在多条真正不同的合法分支，Gold 不能只用字符串数组和一个共享的 follow-up 条件；应升级为每条 sequence 自己的 typed action predicates。未升级前，不宣称 scorer 完整支持任意多分支。

### 5.3 严格最小反事实 PairExact

对每个反事实 pair `j`：

```text
Cj+ = 1，正例满足冻结的 CompleteChainSuccess/ECR；若实验卡预注册
      更严格目标，也可另报 StrictPairExact，但不能运行后切换。
Cj- = 1，完整模型响应/trace 已捕获，且负例既没有 executor-bound
      TDAI attempt，也没有可识别但尚未 bound 的 malformed TDAI dispatch intent。

J_eligible = 两侧都经过统一 Integration eligibility gate、trace 完整，
             且 repeat 已在 pair 内聚合的冻结 pair 数

PairExact = sum_j(Cj+ × Cj-) / J_eligible
BoundarySwitch = sum_j 1[positive triggered and negative did not trigger] / J_eligible
```

`BoundarySwitch` 使用同一个 `J_eligible`。主表同时保存 frozen pair、eligible pair、incomplete pair 和各失败原因的整数；所有 Variant 必须从同一冻结 pair 集出发，缺失 pair 按预注册重跑/不完整 campaign 规则处理，不能为某个 Variant 静默更换分母。

`PairExact` 的“两侧都通过才计 1”结构来自 AgentAbstain；`Cj+ / Cj-` 的 Task 1 pass 条件由本项目独立冻结，不沿用该论文对最终回复的 judge。默认 PairExact 的负侧把 executor-bound attempt 和可识别 unbound malformed intent 都判失败，防止候选靠格式错误逃避边界测试；但 FCR_attempt 仍只统计 executor-bound attempt，后者单列 MalformedFalseIntentRate。`StrictPairExact` 只把正侧从 ECR 提升为 StrictChainExact，负侧规则不变。负例不评价普通 coding 答案、最终自然语言内容或代码正确性。只有未来正式启用四态 Gold 时，才额外判断 DIRECT/CLARIFY/UNSUPPORTED 的最小决策类别。

`BoundarySwitch` 只是弱诊断；always-call 与 never-call 都不能在 `PairExact` 上得高分。Pair 是最小评分单元，但不一定是独立统计单元：同一 Team/World/source/template 下的多个 pair 可能共享资产与生成结构。重复运行先在 `caseId/pairId` 内聚合，不能把 repeat 当新独立样本；Variant 差异按预先冻结的最高独立块 `independenceKey` 做 matched paired cluster bootstrap，并完整保留块内所有 Variant、pair 与 repeats。只有 pair 可近似独立时，才补充 McNemar；独立块太少时，置信区间只作描述性结果。

每个 pair 还应记录：

- `allowedChangedPointers`：唯一允许变化的字段。
- `invariantFieldsSha256`：mask 允许差异后，两侧其余内容必须一致。
- `causalFactorId`：预登记的唯一目标因果因素。
- `changedPointerCount` 与 `invariantProjectionSchemaVersion`。
- `deltaTokens`。
- `minimalityReviewStatus`。

`controlledDeltaSha256` 只证明某个 delta 被哈希；一个字段变化也不自动等于只有一个语义后果。Validator 必须真正检查 invariant projection，并由 minimality review 确认目标边界。

`freshSessionIsolation` 属于 run manifest，而不是静态 pair。正负两侧使用独立 fresh session，并按 pair 对 Variant/正负顺序 counterbalance，避免正例的工具结果、会话记录或本地状态污染负例；fresh session 不代表 cache cold，缓存状态另行观测。

### 5.4 Gold 与候选 Compiler 必须独立

关系图可以成为 Prompt 编译、reachability lint 和 case 审校的 canonical relation catalog，但不能让 Evaluator 在运行时从正在被评测的候选 Prompt/Compiler 输出推导正确答案。正确边界是：

```text
Runtime source / 独立审校
        ├─ frozen RuntimeToolContract
        └─ frozen private Gold（allowedSequences、terminal、binding predicates）

Candidate compiler
        ├─ model-visible compact relation semantics（不暴露内部 ID）
        └─ compiler manifest / trace 中的 candidate relation IDs

Evaluator
        └─ 只消费 frozen RuntimeToolContract + private Gold + actual trace
```

Gold 可以引用稳定的 relation ID 以做离线一致性检查，但候选关系图错误时，必须由独立 Gold 把它判错，不能一起被候选重新生成。`relationId/cueId` 只用于 manifest、trace 和 evaluator 关联；模型只看到紧凑语义，避免浪费 token 或学习表面 ID。

### 5.5 完整 token 与 cache 账本

静态 Prompt Variant 至少记录：

- `totalInjectionTokens`：对每个 case 的最终完整注入字符串整体编码，作为权威完整注入量。
- `toolDescriptionStaticTokens/staticToolTokens`：用冻结分段器从各注入块中剥离动态资产和 runtime binding 后编码，直接回答“工具描述注入量”；它是核心组件指标，但不能替代完整总量。
- `staticTemplateTokens`、`executionContractTokens`、`runtimeBindingTokens`、`dynamicAssetTokens`：其余组件解释量；由于边界 tokenizer 效应，组件 token 不可简单相加替代总数。
- `usageProvider`、`usageSchemaVersion`、`usageRaw` 与冻结的 `requiredUsageFields`。
- `providerTotalInputTokens`、`ordinaryInputTokens`、`cacheReadInputTokens`、`cacheWriteInputTokens`。
- `outputTokens`、`reasoningOrThinkingTokens`。
- `modelRoundsToTerminal`、`tdaiCallCount`、`timeToTerminal`。

Provider adapter 必须按官方口径归一化并验证非负恒等式，不能跨厂商直接套同一减法：

```text
OpenAI
  total = usage.input_tokens
  read  = input_tokens_details.cached_tokens
  write = input_tokens_details.cache_write_tokens
  ordinary = total - read - write

Anthropic
  ordinary = usage.input_tokens
  read  = cache_read_input_tokens
  write = cache_creation_input_tokens
  total = ordinary + read + write
```

当前正式模型是 Luna/OpenAI 路径，但保存 provider/version 是为了防止后续换 adapter 时把口径混在同一列。

任何 two-stage、frontier、tool search、dispatcher 或 verifier 还必须逐阶段保存：

```text
phases[]:
  component                 task_model | router | verifier
  phaseType                 initial | discovery | executor | followup
  promptHash
  candidateActionCount
  injectionTokensO200k
  providerTotalInputTokens
  ordinaryInputTokens
  cacheReadInputTokens
  cacheWriteInputTokens
  outputTokens
  reasoningOrThinkingTokens
  discoveryResultTokens
  toolResultContextTokens
  latencyMs
  usageRaw
  usageCompleteForRequiredFields

aggregates:
  transmittedInjectionTokensAllPhases
  providerTotalInputTokensAllPhases
  ordinary/read/write/output/reasoning totals
  providerInputToEvaluationHorizon
  providerInputToTerminalGivenSuccess
  modelRoundsToTerminal
  discoveryCalls / executorCalls / duplicateCalls
  actualCost（只有冻结价表版本后才计算）
```

动态加载返回的 schema/tool reference 会成为下一轮 provider input，必须入账。`discoveryResultTokens/toolResultContextTokens` 若只能用本地 tokenizer 计算，标记为 `local_component_estimate`；它们已包含在后续 provider input 中，不能再次加进 billed total。LLM router 的 provider usage 单列并计入总成本；纯 CPU retriever 只记录延迟。

逐阶段账本必须来自 MemoryProxy/upstream 的 request-level usage。若当前 runner 只拿到最终 run-total，就先诚实保存 run-total，不能凭空拆 phase；动态架构进入前必须补足 request-level 观测。运行前按 `model + provider + adapter version` 冻结 `requiredUsageFields`：任一必需字段丢失，整条 run 记 `INFRASTRUCTURE_ERROR`；provider 明确不支持的可选细分字段写 `null/unsupported`，不能写 0，也不因该可选字段缺失自动判行为运行失败。

累计成本同时报告：

- `providerInputToEvaluationHorizon`：所有 eligible case；成功正例截到正确 terminal，失败正例跑到冻结 budget，no-tool 跑到 turn completion。它是跨 Variant/架构公平成本主口径。
- `providerInputToTerminal | success`：只在成功正例上的条件诊断，必须带成功分母，不能单独用于候选选择，否则有幸存者偏差。

行为公平 lane 使用 fresh session 来隔离会话、Memory 和本地状态；fresh session 不等于 cold cache，因为相同前缀仍可能命中 provider cache。Cold/warm 只能由实际 `cacheReadInputTokens/cacheWriteInputTokens` 标注，缓存经济性单列，不能混成一个平均数。若某候选首轮注入下降、但 evaluation horizon 的累计输入/轮数上升且行为无增益，这是 token displacement，不是优化。

### 5.6 Prompt cache 合同

正式运行前必须证明：

1. `pipeline.ts` 重建 system text block 时不会丢已有的 provider `cache_control`/breakpoint metadata。
2. 本地 Provider-visible capture 与真实发送序列一致。
3. 静态内容在前、动态 binding 在后，且顺序/hash 确定。
4. 相同 release/catalog、不同 session/space 的最长共同前缀被直接测量。
5. 报告真实 `cached_input_tokens`、`cache_write_input_tokens`、cold/warm 成本，而不是只报 `stablePrefixBytesFromParent`。

`stablePrefixBytesFromParent` 只比较相邻 Variant，不代表跨会话真实可复用前缀。V3 Prompt 中动态 session/space/resource 出现得早时，局部字节指标可能很好，真实 cache 命中仍很差。

### 5.7 多目标候选选择

外部证据支持把 Prompt 行为、长度和部署约束显式分开；以下“预注册非劣约束内选择最短 Prompt”是本项目部署政策（D），不是 CAPO 原算法或通用最优性结论。不使用 `ECR - λ·FCR - γ·tokens` 这类允许一个指标补偿另一个指标的固定加权总分。

Stage 0 必须生成并冻结 `SELECTION-CONTRACT.json`：

- 历史生产对比永远保留 V0。
- 主要行为非劣 reference 固定为合同修正后的 V0-C；不得逐代改成各自 parent，避免质量滚动下滑。
- 直接父 Variant 只用于单因子归因，不替代共同 reference。
- 冻结 `δECR / δFCR / δTSR / δPair / δOvercall`、family floors、`independenceKey`、paired bootstrap/区间方法、超时/缺失/重跑规则。
- 说明区间是 marginal 还是经过多重修正的 simultaneous bounds；没有修正时不能宣称“所有约束联合 95% 保证”。

静态 Prompt 候选定义为满足所有预注册硬约束后，在同一 case 集上工具描述静态组件最少、且完整注入总量也得到验证的候选：

```text
primary minimize   sum_i ToolDescriptionStaticTokens(p, case_i)
tie-break minimize sum_i TotalInjectionTokens(p, case_i)

subject to
  LCB(ECR_p - ECR_V0C)                 >= -δECR
  UCB(FCR_attempt_p - FCR_attempt_V0C) <=  δFCR
  LCB(TSR_p - TSR_V0C)                 >= -δTSR
  LCB(PairExact_p - PairExact_V0C)     >= -δPair
  UCB(PositiveOvercallRate_p - PositiveOvercallRate_V0C) <= δOvercall
  each-family floor                         = pass
  contract/capability/provenance lint       = pass
  requiredUsageComplete                     = 100%
  infrastructure gate                       = pass
```

若静态组件下降但完整注入不降，必须解释 tokenizer/binding/layout 原因，不能只报组件胜利。`CTA` 因分母由 Variant 自己的调用行为决定，只作带分母诊断，不进入硬非劣约束。另展示 Pareto 向量 `(ECR, 1-FCR_attempt, TSR, PairExact, -staticToolTokens, -totalInjectionTokens)`，用来理解取舍和保留中间产物；生产选择仍按“硬约束内最短”决定。

动态架构不能沿用首轮完整注入目标：它在相同行为 Gate 下最小化 `sum providerInputToEvaluationHorizon` 或冻结价表后的实际输入成本。Cache layout 在行为非劣后比较 warm lane 的真实加权成本。三类候选分栏选择，不能用同一个 token 数混排。

V0–V3 只有六个冻结候选，先穷举即可。不要为了搜索六个点引入复杂 optimizer。

## 6. 成功概率最高的静态设计

### 6.1 C-3P-EQ：三平面等价 IR

#### 设计

| 平面 | 内容 | 变化率 | 是否允许 Prompt 优化器改 |
|---|---|---|---|
| Decision | Tool/No-Tool、family、`when/avoid/contrast`、typed relations | release/catalog 稳定 | 仅允许改稳定 cue |
| Execution | exact name/method/path/header/body/schema/required/forbidden fields | release 稳定 | 不允许自由改写 |
| Runtime Binding | session/space/identity、resource/skill 列表、L2/L3 snapshot | request/session/asset 动态 | 只允许确定性序列化 |

#### 实施边界

Stage 1 先按 `SELECTION-CONTRACT.json` 冻结共同 `static_parent`，并保存 `STATIC-PARENT-MANIFEST.json`，其中包含 Variant ID、Prompt hash、artifact hash 和选择依据。它是行为父输入，不一定是独立 Git commit；候选 Git 分支统一从 `task1-candidate-base-v1^{commit}` 创建。V3 只是默认先验，不是硬编码父节点。C-3P-EQ 把该父候选解析为三平面，再渲染回 byte-identical 内容，证明所有 contract、cue、binding 有来源和 hash。它只建立内部 seam，不改变文本、空白、顺序、注入点或 cache marker；所有物理换位和缓存布局实验归 V4-L。

#### Gate

- `static_parent` 的全部 snapshot、token、hash 和 contract lint 全通过。
- exact tool name/path/body/header/capability 没有改变。
- 每个 PromptUnit 只能归属一个明确 plane。
- 任何动态值不得渗入稳定 plane。
- 所有冻结 capability fixture 的输出 bytes 必须完全一致。

若任一输出 byte 改变，C-3P-EQ 就是一个可见实验因素，不能成为其他候选的隐形公共父节点。此时 V4-G、V4-L 和 TSCG-lite 必须从冻结 `static_parent` 各自实现其最小 seam。三平面首先是工程/归因基础，不预先宣称会提高 ECR。

### 6.2 V4-G：静态 Tool Decision Graph

#### 两类边必须分开

```text
dependency edge
  producer.output → consumer.requiredInput
  用于 prerequisite、handoff、terminal reachability

confusion edge
  tool A 与 tool B 的决策边界
  用于 when/avoid/contrast cue 与 hard negative
```

当前需要由生产合同和独立 Gold 审校的关键链：

```text
skill_search → skill_view_by_id
knowledge_tools_list → knowledge_tools_call(search/read/impact/...)
knowledge_tools_call(op A) → knowledge_tools_call(op B)，若 B 的输入来自 A
tdai_scenario_ls → tdai_read_scene
```

这些边不是无条件 prerequisite：若 `skill_id/scene_path` 已由用户、注入索引或先前合法结果提供，可以直接进入下游。Knowledge 又可能多次调用同一个 `knowledge_tools_call` endpoint，但每次动态 operation/schema 不同。因此关系节点必须是“typed action step”，不能只用 tool ID。

正式实现前还有一个已知 Pilot 合同冲突需要先收口：V3 `specs/skill.ts` 表达 `skill_search → skill_view_by_id`，而当前 pilot case Gold 中仍有 `skill_search → skill_view`。Pilot 只能用于暴露这个问题，不能决定生产真值；必须以真实 Bridge/服务合同审校后修正正式 Gold，且不得由候选 Prompt 自证。

当前最重要的混淆边示例：

```text
tdai_memory_search ↔ tdai_conversation_search
skill_view ↔ skill_view_by_id
skill_files_read ↔ skill_files_download
DIRECT ↔ memory/skill/knowledge family
```

#### 最小类型扩展

```ts
type BindingSource = "user" | "injected_asset" | "prior_tool_output";

interface ToolActionStep {
  actionId: string;                  // internal only; model 不可见
  toolId: string;
  endpoint: string;
  operationPredicate?: Readonly<Record<string, string>>;
  requiredInputs: readonly {
    name: string;
    anyOfSources: readonly BindingSource[];
    producerActionIds?: readonly string[];
  }[];
  produces: readonly {
    name: string;
    provenance: "validated_tool_result" | "validated_effect";
  }[];
  effects?: readonly string[];
  terminalIntentClasses?: readonly string[];
}

interface ActionHandoff {
  fromActionId: string;
  output: string;
  toActionId: string;
  input: string;
  condition?: string;
}
```

静态 V4-G 仍暴露与冻结 `static_parent` 相同的授权工具集合，只用紧凑图/链摘要替换重复的手写 handoff prose。因此它仍可作为静态 Prompt Variant。它不按 query 动态裁剪，也不新增模型轮。

#### 静态 lint

- 所有可见 action 有 exact `RuntimeToolContract`，动态 operation 有 schema/来源 predicate。
- output/input 类型兼容。
- capability pruning 后没有 dangling edge。
- 每个已冻结正例 Gold 至少有一个 reachable terminal。
- Knowledge 的 tool/schema 与 `knowledge_id` 来自同一次合法 list handoff。
- Skill/Scene 的 id/path 来自用户输入或上游返回，不允许猜测。
- 允许同一 endpoint 以不同 action/operation 重复出现；禁止的是未声明的 state cycle，不是简单禁止 tool ID 重复。
- terminal 标注与独立 private Gold 一致；若存在多条合法路径，先完成 per-sequence typed predicates。

#### 对比

```text
static_parent
V4-G1 = graph-only（增加关系，不删除旧 handoff）
V4-G2 = graph + 删除等价重复 handoff prose
```

按单步/多步分层报告 ECR、TSR、带分母 CTA、premature terminal、handoff provenance、duplicate calls、ToolSPL 和 token。若只增加 token、单步退化或多步无改善，停止 V4-G。

### 6.3 V4-CP：可归因 cue 剪枝

#### Cue IR

```ts
interface SemanticCue {
  cueId: string;
  kind: "gate" | "when" | "avoid" | "contrast" | "handoff";
  family: "memory" | "skill" | "knowledge";
  covers: readonly string[];  // confusionEdgeId
  text: string;
  tokenCostEstimate: number;
  required: boolean;
}
```

不可删除的内容：exact name/method/path/header/body/schema/capability/provenance rule。可消融的内容仅是决策 cue。

#### 试验顺序

1. 给现有 gate/when/avoid/contrast 分配稳定 `cueId`；token 成本按完整渲染的边际差计算：`tokens(fullPromptWithCue) - tokens(fullPromptWithoutCue)`，不能只编码 cue 文本本身。
2. 从正式 Dev trace 建立 `confusionEdgeId → failures/successes`。
3. 先用静态规则锁定合同和成功轨迹依赖的 cue。
4. 对剩余 cue 做 leave-one-cue-out，不先跑 SHAP/组合搜索；每个 `minus-cue-X` 都从同一个 cue-complete 父候选生成，禁止按 `-A → -A-B → -A-B-C` 累计删除。
5. 在按 family/no-tool/pair 平衡的小批量上 racing。
6. 只有 LOO 在独立 Dev fold 上稳定后，才冻结保留/删除集合，并尝试 token budget 下的 set-cover/knapsack 组合。

示意效用：

```text
utility(c) = ΔPairExact + ΔECR + ΔTSR
             - penalties(FCR_attempt, malformed, family regression,
                         order/paraphrase sensitivity)
```

这只是诊断排序，最终候选仍按第 5.7 节硬约束选择。成功轨迹提供 TRAS 式“不能删什么”信号，失败轨迹提供“要修什么”信号，防止只修错误而破坏已正确 case。

单 cue LOO 使用 candidate manifest 生成即可，不需要为每条 cue 建 Git 分支；instrumentation、每个 LOO 产物、所选集合和 hash 都必须保存。若以后组合 `RN + CP`，需要重新测 cue 的边际效用，因为 RN 已改变 cue 周围的语境。

### 6.4 V4-RN：中性、对称、组件化 Tool Card

当前已有 `BIAS_MARKERS`，但它只是有限 blacklist。V4-RN 把中性化提升为机械合同：

V4-RN 拆成三个候选，避免把措辞和字段删减混成一个因素：

- `RN-R` 只改 sibling card 的修辞对称性和客观语气，字段集合、字段顺序、工具顺序和注入位置不变；禁止无合同依据的 `best/preferred/always/recommended/powerful/must use whenever`。
- `RN-M` 只切换 `Purpose / Guidelines / Limitations / Parameters / Examples` 组件 mask，沿用父候选原措辞、顺序和合同。
- `RN-RM` 只在 `RN-R` 与 `RN-M` 分别通过后建立，重新跑完整 Gate，不能把两个单项结果直接相加。

一条 symmetric contrast 的两侧在内部引用同一 `confusionEdgeId`，模型不看到 ID。Production 保持 canonical stable order，不把 Gold 工具放前面当优化。组件 mask 只针对特定 family/错误簇试验；各 mask 从同一个父候选平行生成，等义 paraphrase 必须人工/合同审校，且尽量 token matched。

### 6.5 TSCG-lite：确定性表示算子

只借用以下可独立消融的算子：

```text
 C-3P Execution IR
  → typed-signature only
      → + SDM（去 filler，保留决策边界）
          → + DRO（紧凑 delimiter/字段）

 V4-G 审校 relation catalog + 预注册的最佳已通过 Execution 节点
  → + CFO（仅按真实 dependency graph 排序）
```

不安装完整 TSCG 作为黑盒，不采用论文给其他模型推荐的 profile，不默认加入 CCP/SAD-F。每个算子一个开关、一个 snapshot、一个 token/行为对比。默认递进 ladder 只能解释“相对直接父节点的条件效应”，不能声称得到每个算子的独立主效应；若需要独立主效应，signature、SDM、DRO 必须从同一个 Execution 父节点平行分叉。CFO 不固定依赖 DRO：在运行前预注册为最佳已通过的 Execution 节点加审校 relation catalog；若没有已通过节点或 catalog，CFO 不启动。论文自身显示不同模型对算子反应相反，因此任何伤害 Luna terminal/contract 的算子立即删除，不能用组合总分掩盖。

### 6.6 V4-L：缓存分层布局

建议的变化率分层：

```text
S0 release-stable
  global decision policy + shared protocol

S1 catalog-stable
  exact tool cards/schema + stable catalog order/version

S2 tenant/capability-stable
  capability signature + tenant resource catalog（不含逐会话值）

S3 request/session/asset-dynamic
  session/space/identity values + skill/knowledge listing + L2/L3 snapshot
```

只有 provider marker 从 InjectionPipeline 到官方 endpoint 全链路保真时才试。最小隔离为 `L-order` 与 `L-cache` 两项：前者只换 S0–S3 物理顺序，后者在相同顺序和文本下只改 cache metadata/breakpoint。预算允许时使用 2×2：当前顺序/分层顺序 × 当前 marker/显式 marker。对同一语义候选做跨 session/space/catalog 矩阵，分别报告 cold、warm、catalog change。接受条件是行为非劣、真实 cache read 增加且写入/额外成本没有抵消；否则回退，不因理论上“动态后置”就宣称成功。早期 `V4-L-probe` 只验证 layout 因果，最终 `V4-L-final` 必须从最终语义赢家重新派生。

## 7. 指标体系：四项核心指标不是上限

老师给出的有效调用率、误调用率、工具选择正确率和注入 Token 是最终交付必须回答的四项核心指标，但不是指标上限。只要一个指标能直接解释 Task 1 的“何时调用、选什么、如何到达正确 terminal、付出多少 Prompt/调用成本、结果是否公平稳定”，就可以作为辅助指标或诊断指标。指标分三层：

| 层级 | 指标 | 作用 |
|---|---|---|
| 核心交付 | ECR、FCR_attempt、工具选择正确率（CTA + 固定分母 TSR）、静态工具描述/完整注入/累计 Token 节省 | 直接回答任务目标，必须进入主报告 |
| 链路诊断 | TriggerRecall、FirstActionSelection、FCR_accepted、MalformedFalseIntentRate、FamilyAccuracy、PairExact、StrictChainExact、PositiveOvercallRate、ShortestExact、ToolSPL、handoff/provenance、premature/duplicate | 解释核心指标为什么变化，定位该改 gate、tool card 还是多步关系 |
| 公平与成本约束 | worst-order/paraphrase、family floors、usage completeness、cached/uncached/write tokens、轮数、time-to-terminal | 防止候选靠位置、缺失 usage、把 token 搬到后续轮或牺牲某家族获胜 |

辅助指标不能替代核心指标，但可以成为候选准入、淘汰和归因依据。例如 ToolSPL 更高但 ECR 更低的候选不能晋级；ECR 更高但 PairExact/worst-order 暴露出 always-call 或位置投机，也不能视为可靠优化。

| 方法 | 有效调用率 ECR | 误调用率 FCR | 工具选择正确率 CTA/TSR | Token | Task 1 中的直接作用 |
|---|---|---|---|---|---|
| 最短链 scorer | 直接定义正确有效调用 | 防止 malformed 逃逸 | 改为 terminal 而非只看首动作 | 到 terminal 停止累计 | 保证指标没有测偏 |
| PairExact | 同一语义边界上验证应调用 | 同一对上验证不应调用 | 可定位 family/tool flip | 自身不省 token | 防 always-call/never-call 假高分 |
| C-3P | 间接；减少决策/执行混杂 | 间接；稳定 gate 位置 | 间接；便于局部归因 | 稳定内容可复用，动态内容后置 | 给后续优化一个不混合同的编译边界 |
| V4-G | 主要提高多步完整链 | 可能减少过早/额外调用 | 直接改善 prerequisite/terminal/handoff | 图会增 token，需删除等价 prose 抵消 | 面向 Skill/Knowledge/Scene 链路 |
| V4-CP | 保留高效 cue，避免漏调 | 删除诱导/低效 cue | 修具体 confusion edge | 直接按 utility/token 剪枝 | 最贴合“少 token 但不丢选择边界” |
| V4-RN | 保持客观触发条件 | 降低修辞/顺序诱发误调 | 提高近邻工具选择稳定性 | 组件 mask 可能省 token | 防工具卡靠显眼措辞获胜 |
| TSCG-lite | 仅在结构更易理解时可能改善 | 不应改变 gate 语义 | 可能减少 schema/格式误读 | 直接压缩结构 | 只试可逆、可消融表示算子 |
| V4-L | 行为必须非劣 | 行为必须非劣 | 行为必须非劣 | 直接改善 cached/uncached 净成本 | 解决前缀稳定，不把 cache 当额外主目标 |
| V4-A | 可能降低漏调或过度澄清 | 直接针对缺参/不支持误调 | 间接改善进入正确 family | 增量很小但可能加轮次 | 只有相应负例足够时才有意义 |
| CAPO/GEPA-lite | 从真实 ECR 错误提案 | FCR_attempt 是硬约束 | TSR/PairExact 是硬约束，CTA 带分母诊断 | token 是硬约束而非软惩罚 | 只离线生成静态候选 |
| A-F/A-D/A-IR | 端到端到 terminal 重新计分 | 动态暴露可能降误调 | 重新计 selection/terminal | 必须累计所有轮和发现结果 | 仅当静态 Prompt 确实达瓶颈 |

任何方法若只提升最终回答、资产内容质量、完整 coding 成功率或通用规划能力，而不能落到上述任一 Task 1 核心、链路诊断或公平成本指标，就不属于本轮实验。

## 8. 条件性静态候选

### 8.1 V4-A：四态 commit gate

只有数据中确实存在以下不同负例时，才把二元 Tool/No-Tool 扩展为：

```text
DIRECT       当前上下文已足够
CALL         持久资产缺口存在且工具可填补
CLARIFY      工具适用，但必需 binding 无法唯一确定
UNSUPPORTED  当前授权工具面不具备所需能力
```

这不是为了让 Agent 更通用，而是为了准确区分 Task 1 的误调用原因。所需新指标只有四态混淆矩阵、CALL recall、DIRECT/CLARIFY/UNSUPPORTED precision、PairExact 和额外轮数。若 CALL 正例被大量推向 CLARIFY，FCR_attempt 虽下降但 ECR 同时明显下降，候选失败。

四态标签不能在查看 formal-v1 Dev 结果后回写到已冻结 Gold。若数据冻结前已经把四态 overlay 作为不参与初始主指标的辅助 Gold 一并审校，V4-A 可以使用该 overlay；否则 V4-A 移到 formal-v2 独立轨，不进入 formal-v1 Hidden。formal-v2 必须在同一 case/order/model/reasoning 下同时重跑冻结的 control/static Final 与一个预注册 V4-A，不能把 formal-v1 数字当跨 revision 非劣对照。原二元 Gold 保留，四态指标单列。

不使用自由 CoT。最多试一个短的结构化 commit 规则：先判断缺口与 capability，再选 family，再确认 prerequisite，最后才发 terminal；不要求输出长 rationale，不把 reasoning token 增长当“免费”。

### 8.2 Order invariance：只做离线准入测试

Production 始终使用固定 canonical order，以保持缓存和复现。离线对候选生成有限 replicas：

- canonical；
- reverse；
- gold-first / gold-last；
- family 内近邻 swap；
- 固定 seed 的 Latin-square rotations。

决策签名标准化为 `NO_TOOL` 或完整 terminal decision chain（family/tool/endpoint + gold-relevant argument projection；动态 ID 映射回 fixture ref）。记录：

```text
GroupAllAgree
CorrectInvariantRate
FlipAny
WorstOrder ECR/FCR_attempt/TSR/CTA
PositionGap = gold-first - gold-last
```

先对 canonical 做相同次数的固定设置 repeat，估计 Luna 自身输出波动；order/paraphrase 的 flip 必须与这条噪声基线比较，不能把随机波动全部归因于排列。主结果仍是 canonical；鲁棒性单列。不能把多排列平均后掩盖 worst case，也不在生产随机顺序。

### 8.3 Description invariance：只针对改过的卡和错误簇

每张目标卡只生成 1–2 个独立人工审校、尽量 token-matched 的等义版本；exact name/path/schema/when/avoid/contrast 真值和候选集合不变。记录 `WorstParaphrase`、`FlipAny`、`replicaTokenDelta`。

Order × paraphrase 不做全笛卡尔积，只对已发现敏感的近邻簇交叉。语义审查或 contract lint 不通过，replica 直接无效，不当作模型错误。

### 8.4 候选工具数 K：只有暴露面变化时才测

当前静态 V0–V3 候选集合基本冻结，不需要为了形式单独烧 K-gradient 预算。只有 capability pruning、deferred schema 或 frontier 让每步候选数变化时才做：

- `candidateActionId = family/tool/endpoint`，不只数模糊“工具名”。
- Gold 始终可见，distractor sets 嵌套，hard-distractor mix 相同。
- 每个 K 分开报告 ECR、FCR_attempt、TSR 和带分母 CTA；不把它们加权成用于 Gate 的单一 `ChainBalanced` 分数。
- 用预注册共同权重汇总，不能让 Variant 自己的 K 分布改变权重。

BoR 只在未来真实 retrieval shortlist 中评价“Gold 是否进入候选”，不能替代当前 top-1/terminal 选择和端到端 ECR。

## 9. 自动优化：保留思想，当前不启动

### 9.1 为什么现在不启动

- 当前 V0–V3 只有六个冻结候选，直接枚举更透明。
- 正式数据仍在建设/冻结，checked-in pilot 太小。
- Dev 160 还要按 family、no-tool、pair、来源簇和 fold 分层，独立样本远少于 160。
- 自动优化会做大量自适应比较，最容易记住 Dev query 或错误地把 Gold 词写入 Prompt。
- Task 1 不需要大量 few-shot，也不应拿 Hidden/Test 反复调 Prompt。

### 9.2 数据足够后的 CAPO/GEPA-lite

允许编辑：

```text
global gate
family boundary
when / avoid / contrast / handoff cue
客观措辞与稳定字段顺序
```

锁定只读：

```text
tool name / method / path / header
required/optional/forbidden args
body skeleton / enum / capability
private Gold / caseId / query 原句
```

每次 rewrite 先做 blame localization：

```text
call/no-call gate
    → family
        → tool/prerequisite/terminal
            → args/transport
```

只改负责的层。Prompt pool 保留强父候选和所有 Pareto 中间产物，避免后一次编辑覆盖更好的 V1/V2/V3 派生候选。失败 trace 提供 correction，成功 trace 提供不允许破坏的 textual regularizer。

Racing 顺序：machine lint → 小型平衡 smoke → unseen semantic fold → 完整 Dev。任何合同错误立即淘汰，不花 Luna 预算。搜索预算、候选数、最大 metric calls 和停止条件预注册；Hidden/Test 只在最终冻结后一次打开。

### 9.3 进入和停止条件

进入：

- 已有真实 V0–V3 trace，错误能稳定归因到某个 Prompt 层。
- Optimizer fold 与 validation fold 按 source/pair/模板隔离。
- exact contract 和 case-specific leakage 有机器 lint。
- 人工/规则候选与等预算 random search 已建立。

停止：

- metric-call budget 用尽。
- Prompt pool 的可行 frontier 连续预注册轮数不再改善。
- unseen fold 不复现。
- 任一 FCR_attempt/ECR/TSR/PairExact/family/contract 硬约束失败；CTA 仍须报告分母并检查是否出现异常退化。
- 候选只靠增长 Prompt、复制 query 词或位置偏差获胜。

## 10. 独立架构轨：不与静态 V0–V4 混报

### 10.1 A-F：Causal frontier

从 V4-G 的 typed relation catalog 计算当前公开 query、capability 和已观察 state 下的最小可执行前沿。运行时不得读取 private Gold；若需要先推断 terminal intent class，必须由冻结规则或单列的 router 完成，并把 router 的错误、token 和轮次计入端到端账本。Private Gold 只在 Evaluator 中判断 frontier recall 和 terminal 是否正确。Knowledge 可先做最小 prototype：未拿到 schema 时只开放 list；list 返回并验证 tool/schema 后才开放 call。Skill 和 Scene 次之。

它只在正式 trace 出现 premature terminal、duplicate exploration 或工具面扩张时进入。必须报告 frontier recall、完整链、terminal、FCR_attempt、累计 token/缓存/轮数。任何 Gold prerequisite 被隐藏即架构失败，不是基础设施错误。

### 10.2 A-D：Schema-on-demand / native tool search

优先级：Provider 原生 namespace/deferred search → client-executed search → 自建 discovery endpoint。当前 system text + curl 协议不等于原生 tool search，在 Prompt 中写 `defer_loading` 没有作用。

Anthropic 官方给出的考虑信号是约 10 个以上工具、超过 10k definition tokens 或选择准确率已经下降；这不是跨模型定律。当前 V3 C00 完整注入为 2,224 token、静态工具组件为 2,027 token，约十几个工具，尚无正式行为瓶颈。因此默认不做；本项目可把约 30–50 工具作为无错误数据时的保守规模触发，或者在更小规模下由持续的正式选择错误直接触发。所有发现返回的 schema/token 和额外模型轮必须累计到 evaluation horizon。

### 10.3 A-IR：Intent IR / typed dispatcher

只有 malformed curl、path/header/body 运输错误成为主要失败时，才考虑让模型输出受限 `action/family/op/args`，由确定性 dispatcher lowering 到 RuntimeToolContract。Dispatcher 必须拒绝任意 URL/method/path，按 operation 执行 capability/ACL 和 provenance 检查，不能形成接受任意 curl 的 god-tool。

优先先把 Intent IR 仅用于内部 compiler，不改模型输出面。若内部 IR 已解决可维护性，且行为错误仍是选择而非 transport，就不升级为模型可见协议。

### 10.4 A-CF：Conformal consistency gate

当前不做。它需要独立 calibration、固定模型/Prompt/采样协议、每 case K 次推理和明确的 low-confidence 动作。即使未来实现，也只能对首决策离散标签建立有限 risk–coverage 声明，不能宣称保证参数、terminal chain 或资产结果。

## 11. 分阶段试验顺序

### Stage -1：正式数据与真实链路交接 Gate

在任何正式 Luna 指标前，必须先完成原执行计划的阻断项：

- formal-v1 数据集冻结为 Dev 160 / Hidden 240，记录 annotated Tag、provider dataset SHA、private Gold SHA、snapshot SHA 和 compiler/validator revision。
- Hidden Query/Gold 与 Prompt 开发会话隔离；Dev/Hidden 只通过冻结 manifest 与 hash 交接。
- R01–R04 的真实 Adapter、资产恢复、Session Init、生产 InjectionPipeline 和真实 MemoryProxy 链路 no-model Gate 通过。
- 每个 case/Variant 使用唯一 run/session namespace；资产 snapshot 在运行前恢复，运行后不把模型调用写回下一个 case 可见的 Memory/Skill/Knowledge、本地历史或会话状态。
- Mock Bridge 只验证协议，不进入正式指标；正式 run 必须标记 `formalMetricEligible=true`。
- `freshSession`、资产隔离和 cache lane 分开验证；fresh session 不能替代 snapshot/hash/真实 cache usage 证据。

未完成 Stage -1 时，可以继续写 scorer、validator 和候选 Prompt 的 no-model 测试，但不能采集或解释正式 ECR/FCR_attempt/TSR/PairExact。

### Stage 0：测量正确性与冻结

任务：

- 统一 ECR、FCR_attempt/FCR_accepted、TSR、带分母 CTA、PairExact、StrictChainExact、ToolSPL、ShortestExact 定义。
- 建立 `evaluationSchemaVersion: 2`，保留/迁移旧字段而不静默改义。
- 补 `triggeredAttempt`、`terminalSelectionCorrect`、`completeChainSuccess`、`strictChainExact`、matched/minimum sequence length、evaluationPrefix 与 observed attempt count 等逐 case 字段。
- 强化 pair invariant validator 和 fresh-session isolation。
- 修/验证 `cache_control` metadata 保真。
- 完成逐阶段 token/cache ledger。
- 冻结 `SELECTION-CONTRACT.json`：V0/V0-C reference、margins、family floors、independenceKey、区间、缺失/重跑规则。

M0/M1/M2 的局部模块可以在三个独立分支并行实现，但不能作为三个独立实验基线：

- M0 提供 terminal、allowed sequence、evaluation prefix 和正例成功的唯一判定。
- M1 的 schema/validator 可独立开发，最终 `PairExact` 必须调用 M0 的正例判定，不能复制另一套 ECR。
- M2 的 usage/state adapter 可独立开发，evaluation-horizon 累计依赖 M0 的截断；M0 的 eligible 分母又依赖 M2 对 infra、usage 缺失和状态污染的标记。

三者必须在统一 Shared Observation/Gold v2 上汇合，集成测试通过后冻结 `task1-measurement-v2`。正式 Variant 实验只能使用这个共同测量基线；三个实现分支和 Gate 仍单独保留，以便审计各自改动。

退出 Gate：

- Pilot plumbing 全通过，但明确不据此排序。
- 所有 scorer 单元测试覆盖 success、wrong family、premature terminal、duplicate、malformed intent、no-tool。
- 同一 trace 的评分不依赖候选 Prompt 文本。
- 冻结为 required 的 usage/trace 字段缺失能稳定变成 INFRASTRUCTURE_ERROR；provider 明确不支持的可选字段保持 `null/unsupported`。

### Stage 1：冻结 V0–V3 正式 Dev

任务：

- 先做真实系统链路 smoke。
- 使用 `gpt-5.6-luna`、reasoning high、同一正式数据快照。
- 按 case 交错 V0–V3，fresh session，counterbalance 运行顺序。
- 逐 case 保存 Prompt/hash/trace/usage/指标。
- Dev 只用于候选选择，Hidden 不打开。
- 运行前冻结六个 Variant 的 exact order matrix、seed、case order、repeat 规则和 campaign manifest hash；不能只写“counterbalance”。

输出不是简单排名，而是错误矩阵：

```text
gate error
family error
single-tool confusion
prerequisite/terminal/handoff error
args/transport error
order/paraphrase sensitivity
cache/prefix loss
```

退出 Gate 是“campaign 完整、统计有效，并能稳定判断下一分支”，而不是强制已有候选获胜：

- 按同一个 `SELECTION-CONTRACT.json` 冻结 `STATIC-PARENT-MANIFEST.json`，后续所有可见静态候选均与其中的共同 `static_parent` 做 paired attribution。V3 只是先验默认，不因编号最大自动成为父版本。
- 若 V0–V3 已有候选满足预注册目标，直接冻结一个 Dev Final 进入 Hidden；不强制继续造 V4 或完成 C-3P-EQ。
- 若没有候选满足目标，但错误层清楚，只进入一个 Stage 2 静态方向。
- 若区间仍跨 margin 或错误不稳定，先增加/完成数据或修基础设施，不继续猜文案。

### Stage 1.5：只对共同父候选做有限压力探针

先用相同设置的 canonical repeats 建 Luna 自身波动基线，再对 `static_parent` 做有限 order/paraphrase probe。该阶段只决定是否进入 V4-RN，不把 replica 平均值写进 canonical 主表，也不创建生产 Variant。若 flip 没有超过噪声基线，V4-RN 不进入 Stage 2。

### Stage 2：只开启一个高概率静态方向

按 Stage 1 的主要错误选择：

| 主要错误 | 只开启的方向 |
|---|---|
| 多步 prerequisite/terminal/handoff | C-3P-EQ → V4-G |
| 修辞导致的近邻偏差 | V4-RN/RN-R |
| 卡片组件集合导致的偏差或冗余 | V4-RN/RN-M |
| 稳定 confusion edge 且 cue/token 冗余明显 | V4-CP |
| schema/结构冗余或 malformed | TSCG-lite 单算子 |
| 跨 session cache 损失 | C-3P-EQ renderer seam → V4-L 的 order/marker 隔离 |
| 缺参/能力不足误调 | V4-A |

代码可以在不同 worktree 中平行准备，但每个正式候选只能激活一个可见实验因素，并统一与同一个 `static_parent + task1-measurement-v2` 做 paired comparison。先在冻结 smoke/racing 子集上排除明显失败，再在未见 Dev fold 上完整比较。不要在同一首次候选中同时做 graph、cue pruning、layout、措辞、mask 或四态 gate，否则无法知道是哪项起效。研究候选通过 candidate manifest/transform 组合表达，不直接挂进现有 V0→V3 的线性 `profiles.ts` parent 链；永久 profile 只在最终方案冻结后增加。

### Stage 3：组合已独立证明有效的静态设计

只有两个单项都通过各自 Gate 时才组合，例如：

```text
V4-G + V4-RN
V4-RN + V4-CP
已冻结语义赢家 + V4-L-final
```

组合仍需重新跑 contract、PairExact、worst-order、family floors 和 token ledger。单项有效不保证组合无交互。

### Stage 4：候选池/自动提案

只有 Stage 2/3 留下稳定错误、且数据/fold 足够时才启动 CAPO/GEPA-lite。它不替代人工静态候选，而是围绕已经定位的 cue/层做小范围提案。

### Stage 5：一次性 Hidden

Hidden 只运行 V0、V0-C，以及 Dev 按预登记规则选出的一个冻结 Final。Runner sanity 必须在 Smoke/Dev 完成，不额外占用 Hidden。Hidden 开始后不再修改 Prompt、Gold、scorer、资产、阈值或候选；若 Final 失败，报告失败，不回头在 Hidden 上继续搜索。

若业务上必须保留两个候选，它们必须在打开 Hidden 前注册为 co-primary，使用 simultaneous bounds 或明确 multiplicity 处理，并完整报告两者；不能在 Hidden 后只挑胜者并把单独区间写成未经选择偏差的最终估计。本文默认采用单 Final，减少这项复杂度。

### Stage 6：架构轨（可选）

只有静态 Final 仍有可复现规模/多步瓶颈时，单独启动 A-F/A-D/A-IR。报告中与静态 Prompt 主表分栏，使用累计 token/成本和 terminal 行为，不宣称它们是 V3 的普通文字压缩。formal-v1 Hidden 一旦打开，Stage 6 不得复用；架构轨必须使用新的 formal-v2，或事先保留且从未打开的 architecture Hidden slice。每个新 sealed revision 都要冻结 Dev/Hidden，并在同一 case/order/model/reasoning 上同时运行冻结 control/static Final 与一个预注册架构候选；不能拿 formal-v1 数字作为跨 revision 因果对照。没有新 sealed 数据时只能做 Dev 探索，不能给正式最终指标。

## 12. 每个候选必须填写的实验卡

所有已登记方法已经拆成独立执行卡，见 [`candidates/README.md`](candidates/README.md)。该目录中的卡片负责分支、改动面、Gate 和保存规则；本节保留共同最小字段，二者冲突时必须先修正文档，不能由实现者临场选择。

```yaml
candidate_id:
parent_variant:
behavior_reference: V0-C
historical_reference: V0
evaluation_schema_version: 2
task1_metric_hypothesis:
  ecr:
  fcr_attempt:
  terminal_selection_rate:
  conditional_terminal_accuracy_diagnostic:
  positive_overcall_rate:
  injection_and_cumulative_tokens:
single_factor_change:
editable_units:
locked_contract_fields:
expected_error_cluster:
entry_condition:
datasets_and_folds:
model: gpt-5.6-luna
reasoning_effort: high
fresh_session: true
formal_metric_eligible: true
independence_key:
tokenizer_and_version:
prompt_hashes:
pair_and_order_controls:
pre_registered_margins:
required_usage_fields:
token_objective: full_injection_sum | provider_input_to_evaluation_horizon | warm_cache_cost
smoke_budget:
full_dev_budget:
accept_condition:
stop_condition:
artifacts:
```

没有 `task1_metric_hypothesis`、single-factor change、接受和停止条件的候选，不进入实现。

## 13. 最终报告主表

每个比例必须保存整数分子/分母和区间；不能只留四舍五入百分比。

| Variant | ECR n/N (CI) | FCR_attempt n/N (CI) | TSR n/N (CI) | CTA n/attempt | PairExact n/J | Strict / overcall / ToolSPL | C00 total/static 参考 | 正式 full injection mean/p50/p95 + Σ | Provider input to horizon | Cache read/write | Eligible / infra |
|---|---|---|---|---|---|---|---|---|---|---|---|
| V0 |  |  |  |  |  |  | 4,863 / 4,579 |  |  |  |  |
| V0-C |  |  |  |  |  |  | 5,126 / 4,824 |  |  |  |  |
| V1a |  |  |  |  |  |  | 4,413 / 4,216 |  |  |  |  |
| V1 |  |  |  |  |  |  | 4,027 / 3,830 |  |  |  |  |
| V2 |  |  |  |  |  |  | 2,308 / 2,111 |  |  |  |  |
| V3 |  |  |  |  |  |  | 2,224 / 2,027 |  |  |  |  |
| Candidate |  |  |  |  |  |  |  |  |  |  |  |

每张主表同时固定 `evaluationSchemaVersion`、model snapshot、reasoning、dataset/tag/hash、private Gold SHA、snapshot SHA、scorer commit、有效 run 数、infra/error 数和 `SELECTION-CONTRACT.json` SHA。正式 token 节省用相同 case 集的总和计算：

```text
StaticToolSavings = 1 - sum_i staticTool_candidate,i / sum_i staticTool_V0,i
FullInjectionSavings = 1 - sum_i totalInjection_candidate,i / sum_i totalInjection_V0,i
```

附表按 Memory、Skill、Knowledge、No-tool subtype、单步、多步、反事实 pair、Team/World/source cluster 和错误层分层。Order/paraphrase robustness、实际 cold/warm cache 和动态架构 evaluation-horizon 账本分别单列，不能用总体平均掩盖某个 family 退化。

## 14. 当前推荐的实际顺序

如果只考虑 Task 1 成功概率、成本和可解释性，推荐：

1. 数据线和真实链路线继续完成 Stage -1；代码线现在即可从 `task1-c07-pass` 分别实现 M0/M1/M2 的 no-model 模块和 synthetic tests，三者都不得启动正式模型。
2. Stage -1、M0/M1/M2 本地 Gate 都完成后，在专用 Integration 分支汇合，冻结唯一 `task1-measurement-v2` 和 `task1-candidate-base-v1`。
3. 从 candidate base 跑完冻结 V0 至 V3 正式 Dev，保留所有中间版本，并冻结 `STATIC-PARENT-MANIFEST.json`。
4. 若 V0–V3 已满足目标，直接选一个 Final 进入 Hidden；`C-3P-EQ` 可以作为有时间时的完整 Compiler 工程改进，但不阻塞 Task 1 交付。
5. 多步错误明显时先试 `V4-G`；修辞或组件偏差分别试 `RN-R`、`RN-M`；稳定 cue 冗余/混淆边再独立试 `V4-CP`。Stage 2 每个候选只开一个可见因素，只有分别通过后才在 Stage 3 建新组合分支。
6. cache 数据明显差时单独试 `V4-L` 的 order/marker 隔离。
7. 只有预冻结四态 Gold，或 formal-v2 已建立且数据证明缺参/不支持误调时，才试 `V4-A`。
8. 只有确定性候选仍留有稳定错误、数据和 fold 足够时才试 CAPO/GEPA-lite。
9. A-F/A-D/A-IR/A-CF 继续搁置，直到规模或 trace 满足进入条件，并使用新的 sealed 数据 revision。

这条顺序既保留了“有时间可以做完整 Compiler”的空间，也没有让 Compiler、动态检索或自动搜索抢在任务一正式指标之前。最终目标始终是：**在 ECR、FCR_attempt、TSR、PairExact、PositiveOvercallRate、family floors 和合同正确性满足预注册约束的候选中，选择同类方案内完整注入或 evaluation-horizon 累计 token 最少、缓存净成本更低的版本；CTA 及其他链路指标用于解释和准入，不靠单一总分掩盖退化。**
