# Task 1 新颖设计雷达：关系图、三平面编译、因果前沿、选择性门控与受约束搜索

> 本文保留为新颖设计与来源证据深潜。正式候选 ID、指标公式、统计/Token 口径、阶段顺序和旧编号迁移以 [`TASK1-RESEARCH-SYNTHESIS-AND-TRIAL-BACKLOG.md`](./TASK1-RESEARCH-SYNTHESIS-AND-TRIAL-BACKLOG.md) 为准；后者已吸收交叉审核修正。

> 研究范围：把既有 V0–V3 与 2024–2026 新证据汇成可执行候选雷达，覆盖：关系图/最短决策链、Decision/Execution/Runtime Binding 三平面编译、budgeted discriminative cue compiler、最小反事实与顺序/等义鲁棒性、cache-aware segmentation、causal frontier/schema-on-demand、abstention gate、Intent IR/DSL，以及 GEPA/MIPROv2/CAPO/JTPRO/VGCO 式自动搜索。
>
> 来源口径：论文原文、会议正式页面、作者开源源码与厂商官方文档；不把博客解读或排行榜二手结论当证据。检索日期：2026-08-29。
>
> 证据标签：**来源事实**是来源直接报告的结论；**项目推断**是把来源映射到当前 Task 1；**适用门槛**说明何时值得实施；**复杂度**是工程/评测成本；**可证伪实验**给出能否定该设计的项目内测试。任何论文数字都不能替代本项目 `gpt-5.6-luna`、真实 Prompt 与真实 Bridge 上的结果。文中“成功可能性”只是结合源码与证据作出的项目先验，不是论文效果量或统计保证。

## 结论先行

先不要把所有想法都叫作“V4”。这里分三类：**评测/编译前置件**不改变模型可见语义；**静态 Prompt Variant**仍在每个 case 暴露相同冻结 Prompt，可与 V0–V3 做较公平配对；**动态架构轨**会按 state/query 改变暴露面或增加 discovery/dispatcher，必须单列，不能把 token 从首轮搬到后续轮后宣称胜过 V3。

| 推荐序 | 候选 | 与 V0–V3 的关系 | 成功可能性（项目先验） | 证据强度 | 工程/模型成本 | 公平性影响 | 必增指标 | 进入条件 | 停止/否决条件 |
|---:|---|---|---|---|---|---|---|---|---|
| P0 | **E-CF：AgentAbstain 式最小反事实 + order/paraphrase invariance** | 评测层；不改 V0–V3 Prompt | 高：很可能暴露真实脆弱性 | 高：AgentAbstain、Tool Preferences、BiasBusters；但效应量需本项目复现 | 中；replica 增加模型调用 | 对所有 Variant 对称；生产仍固定顺序 | Pair Accuracy、Worst-order、Flip Rate、Description Agreement | 在任何新 Prompt 候选前冻结生成规则 | pair 不是单变量差异，或 replica 改了合同/能力 |
| P0 | **C-3P：Decision / Execution / Runtime Binding 三平面编译** | 编译前置件；可先保证 V3 字节/语义等价，再形成独立 layout probe | 高：可维护性/cache 可诊断性；行为收益未知 | 源码证据强；三平面本身是项目设计 | 中；主要是 typed IR、renderer、snapshot/lint | 等价重构可公平；换物理位置必须单列 | plane tokens、cross-reference lint、provider-visible prefix | 先证明 exact contract 与 PromptUnits 全保真 | 任一 name/path/body/header/capability 改变或 V3 snapshot 无法解释 |
| P1 | **V4-G：静态 Tool Decision Graph / 最短决策链** | 在 V3 可见工具集合上只增加/重排决策关系，不动态裁剪 | 中高，尤其是 Skill/Knowledge 多步题 | 中：ToolChoiceConfusion、Graph RAG-Tool Fusion 为大规模/合成证据；当前映射属项目推断 | 中；无新增推理轮 | 仍可与 V3 静态配对；需 token-matched 消融 | terminal tool、path complete、handoff provenance、premature/duplicate | V0–V3 trace 出现前置/terminal/handoff 错误，或 graph 可在小 token 预算内表达 | 单步题退化；多步 terminal/path 无增益；图 token 只增加不改善 |
| P1 | **V4-CP：Causal Cue Pruning / budgeted discriminative cue compiler** | 以 V2/V3 `gate/when/avoid/contrast` 为原子，Prompt 对所有 case 静态冻结 | 中高；现有 PromptUnit 天然适配 | 高：ProCut 正式论文；JTPRO/VGCO/TRAS 提供局部化与防漂移证据；具体 set-cover 是项目推断 | 中到高；LOO 调用可控，无线上多轮 | 公平性高；必须锁 exact contract，按 family 分层 | cue LOO utility、utility/token、family floors、paired/worst-case 指标 | 有正式 Dev confusion edge 与成功轨迹；每 cue 有稳定 `cueId/tokenCost` | 任何硬阈值失败；只在看过的 fold 受益；删 cue 后反事实/顺序更脆弱 |
| P1 | **V4-L：cache-aware S0/S1/S2/S3 segmentation** | 文案/工具集合不变的 layout probe | 条件性高：前提是 metadata 真能透传且有复用流量 | 高：OpenAI/Anthropic 官方文档；当前 pipeline 的 block 重建是直接源码风险 | 中；真实 cache probe 有调用成本 | 只换布局可配对，但需行为非劣；provider 能力要分开报告 | cached/uncached/write tokens、TTL、TTFT、最长公共前缀 | provider-visible marker 保真且同 catalog 重复请求足够 | marker 丢失；写缓存成本抵消收益；任一家族行为退化 |
| P2 | **V4-A：`DIRECT/CALL/CLARIFY/UNSUPPORTED` commit gate** | 静态决策壳；先扩标签再改 Prompt | 中；可能降 FCR，也可能造成过度澄清 | 中高：When2Call、Structured Uncertainty、AgentAbstain、Reasoning Trap | 中；数据重标与多轮澄清 scorer | 标签/样本对称才公平 | 四态混淆矩阵、Pair Accuracy、coverage/risk、额外轮数 | 缺参/能力不足 hard negative 足够且产品允许澄清 | CALL recall/terminal 明显下降或只是把错误调用变成无效澄清 |
| P2/P3 | **A-F：Causal frontier/state-stage exposure** | **独立动态架构轨**；不是静态 V4 | 条件性中：多步/大工具面更可能受益 | 中低：ToolChoiceConfusion 是 2026 v1、100 个合成工具/模拟执行 | 高；状态机、逐步暴露、runner/scorer 均改变 | 不能与 V0–V3 只按首轮 token 公平比较 | cumulative token/cost/rounds、frontier recall、premature action、terminal path | 观察到相关但过早工具调用，或工具面扩大；contracts 完整 | frontier 漏 gold、额外轮次抵消收益、累计成本/terminal 不优 |
| P3 | **A-D：native schema-on-demand/tool search** | **独立动态架构轨**；Knowledge 已有最接近原型 | 当前规模低到中；规模增长后上升 | 官方能力证据高，当前项目收益证据低 | 高；原生 metadata 或自建 discovery/state | 必须与静态轨分开；检索漏召回单独归因 | Family/Tool Recall@k、discovery-result tokens、累计轮数/成本 | 工具 >30–50、definition >10k tokens，或静态选择持续混淆（项目门槛） | 当前约 2,224 token 下净成本/terminal 不优，或检索 recall 不足 |
| P3 | **O-P：GEPA/JTPRO/CAPO-lite 受约束 prompt pool** | 离线提案器；最终产物仍是冻结静态 Variant | 中；数据足够时才值得 | 中高：MIPRO/GEPA/JTPRO 为正式/广泛来源；Constraint-Aware Capo 是 2026-08 最新 v1 | 高模型预算；racing 可削减 | 自适应选择偏差高，必须 semantic folds + sealed Hidden | threshold feasibility、pool frontier、迁移/鲁棒性、搜索调用预算 | 先有真实 trace、机器 lint、足够训练/验证数据；Hidden 不参与搜索 | 只在开发 fold 获益、违反任一硬约束、随机搜索等预算不差 |
| Stretch | **A-IR：Intent IR/typed dispatcher/grammar envelope** | 架构改写；模型从 curl 降为受限 `op+args` | 对可维护性高，对 Task 1 行为净收益未知 | 间接：PDL/APPL/RestGPT/structured outputs；非当前桥接形态直接证据 | 很高；dispatcher、ACL、schema、审计、迁移 | 与 V0–V3 不可视为同一自变量 | syntax validity、semantic routing、ACL reject、累计成本/terminal | malformed/transport 占主要错误，或产品本就计划原生 tool API | 形成 god-tool、ACL 变弱、语义选择无增益或迁移成本过高 |

当前项目事实来自 [`EXPERIMENT-DESIGN.md`](../EXPERIMENT-DESIGN.md)、[`TASK1-POST-DATA-EXECUTION-PLAN.md`](../TASK1-POST-DATA-EXECUTION-PLAN.md)、[`cases/dev.jsonl`](../cases/dev.jsonl) 与 [`code-freeze-manifest.json`](../variants/code-freeze/code-freeze-manifest.json)：主模型冻结为 `gpt-5.6-luna` / high reasoning；仓库当前 pilot 为 Dev 60 + 旧 Test 40，而后数据计划要求正式 Dev 160、Hidden 240；两者不能混称。C00 canonical fixture 上，V3 完整注入总量为 2,224 token、静态工具组件为 2,027，V0 对应为 4,863 / 4,579；完整总量下降 54.3%，但尚无正式行为数据。现有 runner 没有 hidden state 或 tool-action logprob。**因此顺序是先冻结 P0 测量，跑完 V0–V3 正式 Dev，再由真实错误边触发 P1/P2；三平面 IR 有工程价值，但若现有候选已满足目标，不阻塞 Task 1 交付。**

---

## 源码适配基线：V0–V3 缺的是关系与分层，而不是另一段 prose

### 当前类型能表达什么、不能表达什么

`src/injection/tool-prompt/types.ts` 的 `ToolPromptSpec` 当前只有 `id / contractId / when / avoid / contrasts / responseHints`。它已经能表达局部的“何时用、何时别用、与一个 sibling 的差别”，但不能机器表达：

- 一个工具要求哪些已知量或运行状态（`requires/preconditions`）；
- 它会产生哪些可供下游消费的字段或状态（`produces/effects`）；
- 哪个上游 output 必须绑定到哪个下游 input（port-level handoff）；
- 哪些边是 prerequisite、alternative、recommended-next 或 terminal；
- 何时应 `DIRECT / CLARIFY / UNSUPPORTED`，而不是进入某个工具卡；
- 某个单元属于稳定决策、稳定执行合同还是动态运行时绑定；
- 某条 cue 的稳定 ID、token 成本与它负责区分的 confusion edge。

`selection-calibrated.ts` 会把 `when / avoid / contrast` 渲染进每张卡，并有 `BIAS_MARKERS` 一类静态检查；这是好的起点，但 path、body skeleton、参数、用途与边界仍在卡片内交错。全局 Tool/No-Tool 与 family gate 通过 `policyHost` 挂到某个 surface，而实际 V3 捕获中 Skill/Knowledge 卡及动态资源/技能信息可能出现在承载全局 gate 的 Memory surface 之前。于是“决策规则的位置”“执行合同的位置”“session/space/resource 的变化”彼此耦合，既难归因，也会截断共享缓存前缀。

`capability-pruned.ts` 能按 capability signature 删除不可用工具，但没有图级 lint 来证明删除后仍存在到 terminal 的可达路径；`pipeline.ts` 约第 369 行又把重建后的系统内容收敛成单个新 text block，这会丢失旧 block 上可能存在的 provider cache metadata。后者在修复/验证前，任何“缓存分段已经生效”的主张都不成立。

以上都是**源码事实**。下面的三平面、关系图与 cue compiler 是**项目设计**，不是源码已经实现或论文直接验证的功能。

### C-3P：Decision Plane / Execution Plane / Runtime Binding Plane

建议先把同一份 typed catalog 编译成三个物理/逻辑平面：

| 平面 | 内容 | 变化率/缓存 | 允许优化器修改 | 关键 lint |
|---|---|---|---|---|
| **Decision Plane** | Tool/No-Tool gate、family boundary、最短链/依赖关系、`when/avoid/contrast` cue | release/catalog 稳定；应优先 | 只允许改语义 cue 与顺序；合同原子只读 | cueId 唯一、关系可达、rhetorical-neutrality、对称字段 |
| **Execution Plane** | exact tool name、method/path、headers、typed signature、required/forbidden fields、body skeleton、transport/result linkage | release 稳定；应与 Decision 一起形成可缓存前缀 | **禁止自由改写** | 与 `RuntimeToolContract` 字节/结构一致；schema 完整；无未知 op |
| **Runtime Binding Plane** | base URL、service/conversation headers 的值、session/space/identity、resource/skill listing、L2/L3 snapshot | request/session/asset 级易变；必须后置 | 不允许 Prompt optimizer 改；只允许确定性序列化 | provenance、capability、排序、binding 不猜测、敏感值边界 |

最小 IR 可以在现有 `PromptUnit` 上增加，而不是另造一套不受 lint 的文本：

```ts
type Plane = "decision" | "execution" | "binding";

interface SemanticCue {
  cueId: string;
  plane: "decision";
  kind: "gate" | "when" | "avoid" | "contrast" | "handoff";
  covers: readonly string[];       // stable confusionEdge ids
  text: string;
  tokenCost: number;               // frozen tokenizer/version
  required: boolean;
}

interface ToolRelationSpec {
  toolId: string;
  requires: readonly string[];
  produces: readonly string[];
  effects?: readonly string[];
  handoffs?: readonly { output: string; toTool: string; input: string }[];
  terminalFor?: readonly string[];
  abstainIf?: readonly string[];
}
```

第一阶段只做 **semantics-preserving compiler**：把 V3 解析成三平面再渲染回同一内容，证明每个 contract/cue/binding 都有来源和稳定 hash。第二阶段才把稳定平面前置、binding 后置，形成独立 layout probe；不能把重构、重排、删 token 同时塞进一次对比。

### TSCG-lite：只借确定性算子，不照抄模型 profile

**来源事实。** [TSCG](https://arxiv.org/html/2605.04107) 是 2026-05-04 的单作者 v1 预印本及[开源 TypeScript 实现](https://github.com/SKZL-AI/tscg)，把 tool schema 编译成 typed signature 与紧凑结构文本。它的 SDM 去 filler、DRO 压缩 delimiter，CFO 按依赖拓扑重排；实现强调 pure-function deterministic operators。证据需谨慎解读：约 19k 次调用中，Holm–Bonferroni 后仅 9/107 个 pairwise test 显著；多项小模型大增益来自弱 JSON baseline，对 text baseline 可能反而下降。其 11-model 消融还显示 CCP 没有平均准确率收益却增加约 85–306 token，CFO/CFL 在较大 catalog 可能有害，算子效果强烈依模型而变。

**项目推断。** 当前 `selection-calibrated.ts` 的纯函数卡片、`when/avoid/contrast` 与 bias lint 已经部分手工实现 SDM/DRO/neutrality。最小候选不是安装 npm 包，也不是把 curl 合同转换成论文的完整 TSCG profile，而是：

1. Execution Plane 生成短 typed signature，但与原 path/body/header contract 双向可验证；
2. 对 Decision Plane 做机械 filler/rhetoric lint 与紧凑 delimiter；
3. 每个 deterministic operator 单独开关、单独 token/行为消融；
4. 暂禁 CCP/SAD-F；CFO 只由下面真实 `requires→produces` 图驱动并作为单独 order probe；
5. 不使用论文给其他模型的推荐 profile 来替代 Luna Dev 数据。

**适用门槛。** Execution Plane 中仍有显著 JSON/curl 结构冗余，且 exact-contract validator 能证明变换可逆/等价。当前 V3 C00 完整注入已压到 2,224 token、静态工具组件为 2,027，收益预期必须比论文的大 catalog 结果保守。

**复杂度。** 中等，主要是 parser/emitter、typed signature、operator registry 与 per-operator snapshot；线上没有额外模型轮。

**可证伪实验。** `signature-only → +SDM → +DRO` 先做阶梯消融；`+CFO` 从运行前预注册的最佳已通过 Execution 节点分叉，并额外依赖审校 relation catalog。逐层报告最短决策链、malformed、各家族非劣性、Pair Accuracy、Worst-order、静态/累计 token。任一算子若只省 token 却伤 terminal/contract，立即从组合中删除；不得用组合总分掩盖有害算子。

---

## V4-G：Tool Decision Graph 与最短充分决策链

### 外部证据只支持“关系值得显式化”，不证明当前 13 个左右工具必然增益

**来源事实。** [ToolChoiceConfusion / Causal Minimal Tool Filtering](https://arxiv.org/abs/2606.06284)（2026-06-04 v1）为工具添加 required state、produced state、cost/risk，并只暴露当前最小因果前沿；在 102 个任务、100 个合成工具、4 个模型的模拟环境中，把可见工具从 100 降为每步 1 个，论文报告相对 all-tools 约 90% token 降低。它的输出是 deterministic mock，作者明确不覆盖真实 API、权限、开放式发现，且方法假设 precondition/effect contract 正确。

[HyperAgent](https://arxiv.org/html/2608.02650)（2026-07-31 v1）更细地把工具建模为“required input-schema 集合 → output/effect 集合”的超边，并以 port-level output→input link 表达某个上游字段如何满足下游字段；其 deficit-oriented expansion 按当前 state 补 producer。它在 AppWorld 上研究完整 planner/executor，但仍是非常新的预印本，不能把其 task-completion 结果外推到静态 Prompt。

[Graph RAG–Tool Fusion](https://arxiv.org/abs/2502.07223) 在 573 个虚构工具、平均 6.3 个依赖的 ToolLinkOS 上说明纯语义检索可能漏掉先决工具；[Tool Graph Retriever](https://arxiv.org/abs/2508.05152) 也学习依赖关系做检索。它们支持大规模依赖检索，不证明在当前小工具面中“加一段图文本”必然更好。

### 项目关系图：dependency edge 与 confusion edge 必须分开

- **Dependency edge** 表示执行正确性的前置/数据流：`A produces x → B requires x`。它决定允许的链、前沿和 handoff provenance。
- **Confusion edge** 表示两个工具语义接近但选择边界不同。它决定需要哪些 `contrast/avoid` cue。

把两者混成一个 `contrasts` 会产生错误优化：例如 `skill_search` 与 `skill_view_by_id` 既不是互斥同义词，也不是只需一句负例；前者产生的 `skill_id` 正是后者的输入。

建议的项目关系图（`*` 表示 task-specific terminal，实际 Gold 可有多个允许的最短序列）：

```text
START
├─ DIRECT / CLARIFY / UNSUPPORTED
├─ MEMORY
│  ├─ semantic preference/conclusion → tdai_memory_search*
│  ├─ exact wording/timeline       → tdai_conversation_search*
│  ├─ known session chronology     → tdai_conversation_query*
│  ├─ filtered atomic enumeration  → tdai_atomic_query*
│  └─ scene body
│     ├─ known scene_path          → tdai_read_scene*
│     └─ missing/stale path        → tdai_scenario_ls produces scene_path
│                                   → tdai_read_scene* consumes scene_path
├─ SKILL
│  ├─ known owned name             → skill_view*
│  ├─ exact skill_id               → skill_view_by_id*
│  ├─ unknown team workflow        → skill_search produces skill_id
│  │                                → skill_view_by_id* consumes skill_id
│  └─ manifest file path known     → skill_files_read* | skill_files_download*
└─ KNOWLEDGE
   └─ resource schema unknown      → knowledge_tools_list produces tool_name+schema
                                    → knowledge_tools_call* consumes same knowledge_id,
                                      returned tool_name and schema-valid args
```

这张图的价值不在于让模型先输出完整 plan，而在于从一个 canonical relation catalog 编译模型可见关系与静态检查，并让正式 Gold 通过稳定 ID 对它做独立审校：

1. Decision Plane 的最短链摘要；
2. `allowedSequences` 与 terminal tool Gold 的候选关系 ID、离线一致性检查；正式 Gold 必须独立冻结/审校，Evaluator 不得从正在被评测的候选 Compiler 输出反推真值；
3. 每步 provenance validator；
4. V3 capability pruning 后的 reachability lint；
5. 若未来进入动态架构轨，再编译 state frontier。

机器 lint 至少包括：所有可见节点有 exact contract；每个 edge 的 output/input 类型兼容；被裁剪节点不会留下 dangling edge；每个正例 goal 至少有一个 reachable terminal；无未声明循环；Knowledge 必须保持同一 `knowledge_id`，Skill/Scene 的 id/path 必须来自用户输入或上游返回；不得凭自然语言猜 binding。

### 静态 V4-G 与动态 A-F 必须拆开

**静态 V4-G** 保留 V3 的全部可见工具，只把关系图作为紧凑 Decision Plane，必要时以等 token 去掉重复的卡内 handoff 文案。它仍是 Prompt Variant，可与 V3 配对。

**动态 A-F** 根据当前 state 只暴露可执行的最小 producer/terminal frontier。它改变每轮工具集合和轮数，是独立 architecture track，详见后文。不能先用 A-F 的首轮一个工具与 V3 的全量工具比较 injected token，再忽略后续展开。

### 适用门槛、复杂度与可证伪实验

**适用门槛。** 正式 V0–V3 Dev trace 中出现至少一个稳定的多步错误簇：过早调用 terminal、漏 prerequisite、错误 terminal、跨步 ID/path/tool-name 传递错误，或者 repeated/duplicate call。若几乎所有错误都发生在 Tool/No-Tool 或单工具语义边界，优先做 cue/gate 而不是图。

**复杂度。** 静态图为中等：typed action/operation、renderer、lint，以及与候选 Compiler 独立的 Gold 审校。动态前沿为高：还需 state tracker、逐轮 exposure 与恢复策略。

**可证伪实验。** 在同一 capability/tool set 上做 `V3 vs graph-only vs graph+去重 handoff`；按单步/多步分层，报告 Complete Chain、Conditional Terminal Tool、premature action、handoff provenance、duplicate/over-call、raw/cumulative token。若图只在 token 更长时维持原分数，或单步退化抵消多步收益，否定静态 V4-G。

---

## V4-CP：Causal Cue Pruning 与 budgeted discriminative cue compiler

### 一手来源与项目可借部分

- [ProCut](https://aclanthology.org/2025.emnlp-industry.20/)（EMNLP Industry 2025）把 Prompt 切为语义单元，用 attribution 估计贡献并删除低效单元；论文研究 LOO、SHAP、LASSO 与 LLM attribution，并在多项任务/工业 Prompt 上报告压缩收益。它直接支持复用现有 `PromptUnit` 做**单元级**消融，不支持把其 78% production token 数字套到已经压缩的 V3。
- [JTPRO](https://aclanthology.org/2026.findings-acl.2017/)（Findings ACL 2026）用 rollout reflection 联合优化 global instructions 与 per-tool schema/argument descriptions，在 124–1,138 工具的基准中相对强基线/GEPA 报告 OSR 增益；ToolACE-500 只修改约 11% 描述，强调保留 tool-local disambiguation cue。它支持“只改责任 cue”，但规模远大于当前项目。
- [VGCO](https://arxiv.org/html/2512.13860)（2025 v1）把错误归因到 retrieval、tool selection、parameter 三层，再让对应 editor 修改对应层。它支持 blame-localized editing；当前项目无需照搬训练/editor，可映射成 `no-tool gate → family → tool → args/transport` 四层。
- [MCP Tool Descriptions Are Smelly](https://arxiv.org/html/2602.14878)（2026 v1）把工具描述拆成 Purpose、Guidelines、Limitations、Parameter Explanation、Examples；不同组件子集在不同域可等价或更好，论文所评 agent 删除 Examples 未显著退化。它支持 typed component/mask，不证明某个固定组合对 Luna 最优。
- [TRAS](https://proceedings.mlr.press/v318/davari26a.html)（Canadian AI/PMLR 2026）指出只从失败生成 textual gradient 容易 semantic drift；它同时从成功样本提取 textual regularizer，并聚合噪声信号。对本项目的直接启示是：cue 删除/改写既要看错误被修复，也要保护当前正确的决策链。

### 项目设计：稳定 cueId、混淆边覆盖与静态冻结

把所有可改决策原子做成稳定 cue，而不是任意自然语言片段：

```text
gate.need_persistent_asset       13 tok  covers: no-tool↔memory/skill/knowledge
mem.semantic_vs_exact           18 tok  covers: memory_search↔conversation_search
skill.name_vs_id                15 tok  covers: skill_view↔skill_view_by_id
skill.manifest_path_provenance  12 tok  covers: view_by_id→files_read/download
knowledge.same_resource_handoff 16 tok  covers: list→call provenance
```

每个 Dev error 归入一个或多个稳定 `confusionEdgeId`；每个 cue 声明覆盖哪些 edge、token 成本、family、是否硬必需。最小实现先做 leave-one-cue-out：

```text
utility(c) = Δpaired-correct + Δterminal/path - penalties(FCR, malformed,
             family regression, order/paraphrase sensitivity)
```

随后才可把选择写成最小覆盖/背包：在 token budget 下最大化高权重错误边覆盖，并设置每 family 的非劣下限。这里的 set-cover/utility-per-token 是**项目推断**，不是 ProCut/JTPRO 的原算法。

有三个硬限制：

1. exact name/method/path/header/body/schema、capability 与 provenance rule 永远是 `required=true`，不参与删除；
2. cue 选择只基于聚合 Dev/fold confusion，不按当前 query 动态选择；最终 Prompt 对所有 case 静态冻结；
3. 既收集失败轨迹的“需要加什么”，也收集成功轨迹的“不能删什么”，防止只修 error cluster 而破坏已有能力。

### rhetoric-neutrality 与机械对称约束

[Tool Preferences in Agentic LLMs are Unreliable](https://aclanthology.org/2025.emnlp-main.1060/) 报告：只改 description 会让部分模型工具使用率相差超过 10 倍；assertive cues 在其实验中可带来超过 7 倍偏移；两个功能相同工具的顺序实验里，GPT-4.1 对首位/次位使用率为 80.2%/13.6%，Qwen2.5-7B 为 76.7%/0%。这些是论文场景的效应，不是 Luna 的预测，但足以把以下 lint 设为编译约束：

- 禁止无合同依据的 `best / preferred / always / must use whenever / powerful / recommended`；
- sibling cards 使用相同字段数、句法骨架、语气与近似长度；
- 如果一条 contrast 是对称关系，两侧都引用同一 `confusionEdgeId`，避免单向宣传；
- production 用稳定 canonical order；不把“把想提升的工具放第一”当优化手段；
- 按 family/tool 报 selection shift，不能让总体平均掩盖某工具被系统性挤压。

### 适用门槛、复杂度与可证伪实验

**适用门槛。** 先跑完正式 V0–V3 Dev，至少有可重复 confusion edge；case 必须按语义 source/pair 分 fold。没有行为错误时，LOO 只能证明 token 可删，不能证明选择更好。

**复杂度。** 设 `C` 个可删 cue，朴素 LOO 为 `C×Dev`；先用静态必需规则、component mask 和小批量 racing 缩小范围。SHAP/组合搜索会迅速膨胀，不是第一步。

**可证伪实验。** 比较 V3、机械 `signature+SDM+DRO`、LOO-pruned、budgeted coverage；所有候选须满足预注册的 ECR/FCR/terminal、family floor、Pair Accuracy、Worst-order、malformed 与 contract 阈值。若 utility 在 held-out semantic fold 改符号、成功轨迹大幅回归、或删 cue 后只靠位置偏差获胜，则淘汰。

---

## 1. Abstention / confidence / conformal gate：能借用什么，不能外推什么

### 1.1 一手来源与边界

| 来源 | 来源事实 | 不能直接外推之处 |
|---|---|---|
| [Mitigating LLM Hallucinations via Conformal Abstention](https://arxiv.org/abs/2405.01563)（2024） | 用多次生成的自一致性、LLM 判定回答相似度和 conformal calibration 构造回答/弃答策略；论文在开放域生成式 QA 上报告 hallucination/error rate 控制。 | 研究对象是“生成答案是否等价/正确”，不是 `No Tool → family → endpoint → arguments` 的结构化动作。它没有证明同一阈值能控制误调用率、错误 endpoint 或多步链路错误。其多样本与相似度判定还会引入额外调用和 judge 误差。 |
| [Prune ’n Predict: Optimizing LLM Decision-making with Conformal Prediction](https://proceedings.mlr.press/v267/vishwakarma25b.html)（ICML 2025） | CP-OPT 学习较小 prediction set；CROQ 把题目缩到 prediction set 后再次提问。在 MMLU、TruthfulQA、ToolAlpaca 上实验。 | 作者把 ToolAlpaca **改造成 MCQ**。这证明的是有限候选分类/重提问，不是原生 JSON/function call，也不覆盖 “不调用”、缺参澄清、参数合法性或真实 Bridge 执行。可借用“候选集合 + 覆盖率”思想，不能声称已验证工具调用 gate。 |
| [When2Call: When (not) to Call Tools](https://aclanthology.org/2025.naacl-long.174/)（NAACL 2025；[作者代码](https://github.com/NVIDIA/When2Call)） | 直接评估何时调用、何时追问、何时承认现有工具无法回答；同时发布训练/评测数据。论文明确指出传统 tool benchmark 过度关注正确工具/参数，而忽略何时不调用。 | 其 MCQ/生成式评测格式、工具集和训练方法不等同于当前 Codex harness；它支持动作分类设计，不提供 calibrated confidence 保证。 |
| [AgentAbstain: Do LLM Agents Know When Not to Act?](https://arxiv.org/abs/2607.10059)（2026-07 v1；[项目页](https://agentabstain.github.io/)） | 263 个 paired tasks、42 个可执行环境、541 个工具；每一对只改变一个 controlled perturbation，在 should-act 与 should-abstain 间翻转。论文把缺参、歧义、高风险、能力不足、工具失败等分开，并把“先行动后拒绝”计为失败；其摘要报告 17 个模型中最佳 paired accuracy 仅 59.5%。 | 很新的预印本，环境/高风险写操作与本项目只读工具不同。它直接支持**最小对与 pair accuracy 评法**，不证明某个 Prompt gate 能解决本项目 FCR。 |
| [The Reasoning Trap](https://aclanthology.org/2026.acl-long.376/)（ACL 2026；[作者代码](https://github.com/albert-y1n/Reasoning_Trap)） | SimpleToolHalluBench 分 No-Tool-Available 和 Distractor-Tool；论文的控制实验中 reasoning-enhanced/toggle-on 配置更易幻觉不存在或不相关工具，prompt mitigation 只有有限改善。 | 主要在 Qwen/Llama 系模型与其训练/推理设置上；不能推断 `gpt-5.6-luna/high` 一定同幅度退化。它说明“reasoning 更高不会自动带来克制”，因此 no-tool/distractor 必须独立测。 |
| [Structured Uncertainty guided Clarification for LLM Agents](https://aclanthology.org/2026.findings-acl.2028/)（Findings of ACL 2026） | 在工具参数及其 domain 上表达结构化不确定性，区分 specification uncertainty 与 model uncertainty；用 EVPI 与问题成本决定问什么、何时停止。论文还报告了 ClarifyBench 和 When2Call 训练结果。 | 需要参数 domain、可交互用户/模拟器与多轮 stopping rule。当前 Task 1 主指标主要看首入口，若 scorer 把澄清视为漏调，直接加入会被错误惩罚。它不是 conformal 方法。 |
| [To Call or Not to Call: A Framework to Assess and Optimize LLM Tool Calling](https://arxiv.org/abs/2605.00737)（2026-08 修订版） | 把工具决策拆成 necessity、utility、affordability，并从模型 hidden states 训练轻量 need estimator；论文报告模型自述需要与真实需要存在错位。 | hidden-state estimator 适用于可访问内部表示的模型。当前 `gpt-5.6-luna` runner 没有 hidden state 合同，所以不能把该方法当成黑盒 API 可用方案；“让模型口头报 confidence”也不是论文中的 latent estimator。 |
| [Tools in the Loop](https://arxiv.org/abs/2505.16113)（2025） | 联合建模 LLM 生成与外部工具输出的不确定性，说明工具增强系统的最终不确定性不只来自 LLM。 | Task 1 明确不评价资产正文与最终回答质量；把 tool-output uncertainty 混进当前主指标会改变任务定义。此来源只提醒未来端到端系统不能把首调用 confidence 当最终可靠性。 |

### 1.2 候选设计 A：四态决策壳（比二元 Tool/No-Tool 更可诊断）

**来源事实**

When2Call 和 Structured Uncertainty 都把“没有工具需求”“工具不支持”“信息不足需要澄清”视为不同状态；后两者若混入一个 `No Tool` 标签，模型的正确克制、能力不足和缺参行为无法区分。

**项目推断**

在不改真实工具合同的前提下，把 V2 的二元 gate 在评测层扩成四个语义动作：

```text
DIRECT              当前上下文已足够，直接回答
CALL(family/tool)   存在持久资产缺口且工具可填补
CLARIFY             工具适用，但必需信息/参数无法从上下文唯一确定
UNSUPPORTED         用户需要的能力不在当前工具面内
```

Prompt 是否真的显示四态应作为独立候选；第一步先给 Dev/Hidden case 增加 decision subtype 与 scorer，不应把 `CLARIFY` 和 `UNSUPPORTED` 都继续记成普通 no-tool。当前 `gold.needTdaiTool` 只能支持 `CALL` vs 非 `CALL`，不足以验证四态收益。

**适用门槛**

- fixture 中有足够的缺参、工具能力不匹配与“上下文已足够”样本；
- scorer 允许澄清/unsupported 成为正确动作，而不是统一算漏调；
- 产品接受一次用户交互，而不是强制首轮完成调用。

**复杂度**

Prompt 增量很小；主要成本在数据重新标注、澄清的多轮 harness、gold stopping rule 和新指标。若不改 scorer，仅改 Prompt 没有可解释性。

**可证伪实验**

冻结相同工具卡，只比较二态 V2 gate 与四态 gate。分层报告 `CALL recall`、`DIRECT FCR`、`CLARIFY accuracy`、`UNSUPPORTED accuracy` 和平均额外轮数。若四态只把正确调用变成过度澄清，或不能显著减少缺参/能力不匹配误调用，则否定该候选。

### 1.3 E-CF：最小反事实对与 Pair Accuracy

**来源事实**

AgentAbstain 的关键不是再造一批一般 hard negative，而是让每个 should-act 与 should-abstain 样本只差一个受控变量；只有一对两边都答对才算 paired success。Reasoning Trap 的 NTA/DT 又说明“没有可用工具”与“只有关键词相关干扰工具”都应单独压力测试。

**项目推断**

对当前三家族建立最小 flip pairs，Gold 仍只到正确 terminal 调用为止：

| Pair | should act | should abstain/direct/clarify | 唯一变化 |
|---|---|---|---|
| Context sufficiency | 关键历史事实未在上下文，需 memory | 同一事实已完整给出 | 缺口是否存在 |
| Exact vs semantic | 要原话/时间线，conversation search | 只要已给出的摘要，不需工具 | evidence granularity/availability |
| Skill ownership | exact owned/listed skill 可 view | 只是普通 coding 关键词重合 | 真实可复用资产信号 |
| Team discovery | 明确要找未知团队 workflow | 用户只问如何写一次性脚本 | reusable-team intent |
| Knowledge capability | matching resource 存在 | resource 被 capability fixture 移除 | capability availability |
| Knowledge handoff | list 已返回合法 tool/schema | tool/schema 未发现却要求 call | prerequisite state |
| Scene provenance | `scene_path` 来自 index/list | path 是同形但臆造值 | binding provenance |
| Required binding | 必需 ID 可由输入/上游唯一得到 | 必需 ID 缺失且不可恢复 | act vs clarify |

定义：

```text
PairAccuracy = mean_pair 1(correct(act-side) AND correct(abstain-side))
PairFlipAccuracy = mean_pair 1(predicted action changed in the gold direction)
```

单边准确率必须同时报告，防止“永远不调用”靠一半 pair 得分。任何 executor-bound attempt 之后才说 unsupported/clarify 都算 abstain-side 失败。对多步 act-side，必须到正确 terminal tool 且 prerequisite/provenance 正确；不评分 asset 内容或最终回答。

在最小 pair 之外再做两个**非语义干预轴**：固定 query/contract 只换 tool order；固定语义只换经审计的等义卡片。它们分别测 position sensitivity 与 metadata salience，不能与 act/abstain 的语义 flip 混成同一 pair。

**适用门槛**

pair 生成器能证明除一个字段外 world/query/capability 相同；同源 pair 永远在同一 train/validation/hidden split，防止泄漏。

**复杂度**

数据/validator 中等，模型成本随 order/paraphrase replica 增加。先对高混淆边做 4–8 个固定设计，不做全排列或完整笛卡尔积。

**可证伪实验**

若新 Variant 提高普通 ECR 却降低 Pair Accuracy、在不相关 assertive distractor 下误调、或只能在 canonical order 正确，就视为利用表面 cue，不能晋级 Hidden。

### 1.4 候选设计 B：只校准“首决策”的 conformalized consistency gate

**来源事实**

2024 conformal abstention 说明“多样本一致性 → 非一致性分数 → 在独立校准集上选阈值 → 高风险时弃答”是一条可行路线；Prune ’n Predict 说明 CP 可用于有限选择集合，但其 ToolAlpaca 实验仍是 MCQ。

**项目推断**

若未来要做黑盒 `gpt-5.6-luna` confidence gate，最小诚实版本应只校准离散的首决策，不宣称覆盖整个调用链：

1. 对同一 case 产生 `K` 个语义等价 replica（随机种子/低幅采样，或第 4 节的工具排列与等义描述）；
2. 把输出映射到有限标签 `DIRECT / CALL-memory / CALL-skill / CALL-knowledge / CLARIFY / UNSUPPORTED`；
3. 用最高标签的投票占比构造非一致性分数，例如 `s(x)=1-max_a votes(a)/K`；
4. 在与 Prompt 优化集严格分离的 calibration split 上冻结阈值；超过阈值就澄清/unsupported，而不是发真实请求；
5. Sealed Test 只评冻结后的 risk–coverage，不再调阈值。

这至多对“首决策标签”建立校准主张。它不自动约束参数、HTTP 合同、后续 terminal tool、资产内容或多步累积错误。若 replica 由工具排列产生，保证还依赖部署分布与校准分布的可交换性；模型版本、Prompt、候选工具面或 sampling protocol 变化后必须重校准。

**适用门槛**

- 至少有一个不参与 Prompt 搜索的校准集，且与部署流量分布可比；
- 产品允许低 confidence 时不调用/追问；
- 可承受 `K` 倍模型推理；
- 决策标签与 error event 在冻结前写清楚。

当前 checked-in pilot 只有 60 条；后数据计划虽目标 Dev 160、Hidden 240，但 160 还要供 Variant 开发、fold 验证使用，不能再把 Hidden 拿来反复校准。因此当前不具备强 conformal 声明的独立 calibration 设计；应另外预留/扩充 calibration cases。

**复杂度**

离散投票为约 `K` 次 task-model 调用；若照 2024 论文对自由文本做两两相似度判断，还可能达到 `O(K²)` 比较并引入 judge 调用。只校准离散 action 可避免相似度 judge，但仍有 `K` 倍成本。

**可证伪实验**

- 绘制 risk–coverage curve：coverage 下降时错误首调用率是否真的下降；
- 分别看 tool-positive 与 no-tool，避免总体风险被 20 个 no-tool 或某一 family 掩盖；
- 与等成本 baseline 比较：单次高 reasoning、`K` 次投票、一次额外 verifier；
- 若在冻结 Test 上违反预注册风险上限、过度 abstain，或 `K` 倍成本换不到显著 risk 降低，则否定该 gate。

### 1.5 不应采用的捷径

- 不把模型口头输出 “90% confidence” 当校准概率；`To Call or Not to Call` 的有效 signal 来自 hidden state estimator，不是自述数字。
- 不把通用 QA conformal 的 hallucination bound 政名为 “工具误调用率保证”。
- 不把 ToolAlpaca-MCQ 的选项 coverage 当作原生 endpoint/arguments coverage。
- 不在同一 pilot/Dev 上同时搜索 Prompt、选择不确定性分数和校准阈值后，再报告“有保证”的同集结果。
- 不把“弃答”统一实现为直接回答；对工具任务，安全动作可能是澄清或明确 unsupported。

---

## 2. Cache-aware segmentation / on-demand / deferred schema

### 2.1 一手来源与可迁移事实

| 来源 | 来源事实 | 项目边界 |
|---|---|---|
| [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching)（当前官方文档） | GPT-5.6+ 支持显式 breakpoint；一次请求最多可创建四次 cache write。官方要求稳定 developer/reference 内容前置、动态内容后置；保持工具定义、顺序和 schema 一致；可用 `allowed_tools` 改变可调用子集而保持 `tools` 稳定；deferred tools 被追加到上下文末尾以保存前缀。 | Codex/Proxy 必须能把 breakpoint 和 tool metadata 原样传到 provider。仅在注入文本中写“这里是缓存边界”没有任何缓存语义。缓存命中仍要看模型、TTL、最小长度和真实 usage。 |
| [OpenAI Tool Search](https://developers.openai.com/api/docs/guides/tools-tool-search)（当前官方文档） | namespace/MCP server 初始只暴露高层名称与描述，内部函数按需加载；单个 deferred function 仍暴露函数名/描述，实践中主要延后参数 schema。官方建议 namespace 少于 10 个函数；支持 hosted 或 client-executed search；加载的工具位于上下文末尾以保留 cache。 | 这是 Responses/API 原生能力。当前 TDAI 若只是 system text + curl 约定，不能假装已经拥有 `tool_search`/`additional_tools` 语义。client search 还需要可信 schema 校验与新的状态保存。 |
| [Anthropic Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) 与 [Tool Reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference)（当前官方文档） | `defer_loading: true` 的工具从初始 system prefix 中移除，搜索命中后以 `tool_reference` 在对话体内展开，前缀不变；建议保留 3–5 个高频工具非延迟。官方把 ≥10 工具、>10k tool-definition tokens 或选择准确率下降列为使用信号。 | 厂商阈值不是跨模型定律；Anthropic 的 `defer_loading`、strict grammar 与 cache 组合不能直接映射到 Luna。V3 C00 完整注入 2,224 token、静态工具组件 2,027，尚未显示出 >10k token 场景的规模收益。 |

### 2.2 候选设计 C：多变化速率的显式缓存分段

**来源事实**

OpenAI 官方文档明确支持多个显式断点，并提醒“共享前缀”不等于“已写入可复用缓存”：若只在动态内容末尾隐式写入，下一请求的动态后缀变化可能无法命中较短静态前缀。

**项目推断**

不要只做“稳定前、动态后”二分，可按变化速率定义四层，并与上文三平面交叉而不是混为一个概念：

```text
S0 release-stable
  Tool/No-Tool policy + family boundaries + shared protocol
  [breakpoint A]

S1 catalog-stable
  exact tool cards/schema + catalog/version + deterministic order
  [breakpoint B]

S2 capability/tenant-stable
  capability signature + tenant/resource catalog binding（不含逐会话值）
  [可选 breakpoint C；仅在复用量足够时]

S3 request/session/asset-dynamic
  session/space/identity value + skill/knowledge listing + L2/L3 snapshots
  [不写或使用更短 TTL]
```

若 provider 把原生 tool definitions 放在 developer content 之前，则 S0/S1 的物理边界要按实际 provider-visible 序列重算，不能只按本地 block 顺序想象。V3 的 capability pruning 会改变 S1 工具集合；另一个可测方案是保持完整 `tools` universe 稳定、用原生 `allowed_tools` 限制可调用子集。后者只有在宿主真正支持 server-side enforcement 时才成立，文本里列“allowed”不能替代能力裁剪。

**适用门槛**

- marker/block metadata 在 InjectionPipeline、adapter、Codex CLI 到 provider 全链路保真；
- S0/S1 达到目标模型的最小可缓存长度；
- 同一 release/catalog 下有足够重复请求；
- `cached_tokens`、`cache_write_tokens` 与 TTL 可观测。

**复杂度**

实现本身较小，难点是 provider-visible capture、breakpoint 保真回归、跨 session/space 的字节级 fixture 和真实 usage 归因。多 breakpoint 还会增加 cache write；必须算净成本，而不是只看 hit rate。

**可证伪实验**

建立同一 Variant 的跨 session/space/catalog 矩阵：

- byte/token 最长共同前缀与各 breakpoint hash；
- `cached_input_tokens`、`cache_write_input_tokens`、首 token 延迟、实际输入成本；
- ECR、FCR、Conditional Tool@1 非劣性；
- 冷请求、重复请求、catalog 变化后三种情形分开。

若 marker 丢失、S0/S1 低于模型阈值、cache write 成本抵消读取收益，或单纯换位伤害行为指标，则否定该布局。

### 2.3 候选设计 D：Family index → on-demand exact schema

**来源事实**

OpenAI 明确说明：单个 deferred function 仍会暴露名称和描述，主要节省参数 schema；用 namespace/MCP server 才能只让模型先看到高层摘要。Anthropic 则把 deferred definition 完全移出初始 system prefix，命中后内联完整定义。

**项目推断**

如果未来工具面继续增长，可以把现有 V2 Family Gate 实体化为两阶段协议：

```text
初始稳定层：Memory / Skill / Knowledge 三个 namespace 摘要
        ↓ family selection / tool search
动态层：只加载命中 family 的 exact names + paths + required schema
        ↓ native function/tool call
```

优先使用 provider 原生 namespace/tool search；否则需要新 `discover_tools(family, query)`/manifest endpoint、可信 schema validator、对话状态与重放规则。这已经超出 renderer-only Prompt 变体，不能作为“再删一点文字”的 V4。

**适用门槛**

- 工具数/定义 token 达到明显规模，或现有 trace 显示列表长度导致选择混淆；
- 检索器能在 tool-positive 上达到近乎完整 gold recall；
- 宿主支持动态加载后仍保持 exact contract、cache 与 tool-result linkage；
- 额外 search round 的延迟/成本可接受。

当前 V3 C00 完整注入约 2,224 token、静态工具组件约 2,027。虽然工具数可能超过 10，但 token 规模仍远小于 Anthropic 的大型示例；因此应先做工具数梯度/回放，不应直接实现。

**复杂度**

原生 tool search：至少新增一次 search decision，但 provider 可在同一响应内完成 search + call；自建 discover：多一个 endpoint、检索/排序器、schema trust 边界、状态持久化和新 scorer。还要分别计算 candidate recall 与模型 selection，避免把检索漏召回归罪给 Prompt。

**可证伪实验**

在相同任务上构造当前、2×、5× 工具面（额外工具必须是真实或经审计的近邻干扰项），比较：

- `FamilyRecall@k`、`ToolRecall@k`、No-tool retrieval FPR；
- `Selection@1 | gold retrieved`；
- 端到端 ECR/FCR、总输入 token、cached/write token、轮数和延迟；
- catalog 更新后 prefix/cache 行为。

若当前规模下端到端准确率无增益、检索漏召回显著或多轮成本大于 schema 节省，则延后到工具面扩张时再启用。

### 2.4 Token/cache ledger：动态方案必须累计到正确 terminal

**硬规则：任何 schema-on-demand、tool search、frontier 或 dispatcher 候选都不能只报首轮 `injected tokens`。** 否则最容易得到的“优化”只是把 system token 搬进 discovery result、下一轮 tool reference 或额外 reasoning。

每个 case 从首请求开始，在正确 terminal tool 的请求被合同接受时停止累计；no-tool/clarify case 在正确非执行动作时停止。主任务不继续评分 asset 内容、tool 返回质量或最终自然语言答案。至少记录：

```text
initial_static_tool_tokens
full_injected_tokens_each_round[]
cumulative_input_tokens          = Σ provider input
cumulative_cached_input_tokens   = Σ provider cached read
cumulative_uncached_input_tokens = Σ (input - cached read)  // 以 provider 字段为准
cumulative_cache_write_tokens    = Σ provider cache write
cumulative_output_tokens         = Σ visible model output
cumulative_reasoning_tokens      = Σ provider reasoning usage
discovery_query_tokens
discovery_result_tokens          // tool_reference/schema/manifest payload
tool_result_context_tokens
model_rounds
discovery_calls / executor_calls / duplicate_calls
time_to_first_action / time_to_terminal / actual billed cost
```

若 provider 不暴露某字段，标为 `unavailable`，不能用本地 tokenizer 猜值冒充真实 usage。静态 V0–V4 主表仍可报初始注入以解释结构，但架构轨的晋级判定必须用 cumulative ledger、Complete Chain、Conditional Terminal Tool、FCR 与 Pair Accuracy。任何候选若“初始注入下降、累计成本或 terminal 轮次上升且没有行为收益”，即判定为 token displacement，不是优化。

---

## 3. Prompt auto-optimization：从“找最高分文案”改成“找可行 Pareto 点”

### 3.1 一手来源与算法差异

| 方法 | 来源事实 | 与 Task 1 的关系 |
|---|---|---|
| [MIPRO / MIPROv2 paper](https://arxiv.org/abs/2406.11695)（EMNLP 2024）与 [DSPy 官方文档/源码](https://github.com/stanfordnlp/dspy/blob/main/docs/docs/api/optimizers/MIPROv2.md) | 同时生成/搜索 instructions 与 few-shot demonstrations；用 program/data-aware proposal、stochastic minibatch 与 Bayesian optimization/代理模型搜索组合。DSPy 文档把 40+ trials、约 200+ examples 作为长优化的经验建议。 | checked-in pilot 60 与正式计划 Dev 160 都低于该长跑经验数，且分到 leaf/fold 后更稀疏；Task 1 又不希望用大量 few-shot 换 token。MIPROv2 可作 instruction-only baseline，但不是当前首选。 |
| [GEPA paper](https://arxiv.org/abs/2507.19457)（2025；ICLR 2026）与 [作者开源实现](https://github.com/gepa-ai/gepa) | 读取完整 execution traces 与 textual feedback，反思失败、定向改写；从按实例/目标维护的 Pareto frontier 选择父候选，并支持 merge。论文报告在六项任务上相对 GRPO 的 rollout 效率与相对 MIPROv2 的结果；源码暴露 `max_metric_calls`、`max_reflection_cost`、instance/objective/hybrid frontier。 | Task 1 scorer 能提供非常具体的 ASI：漏调、错 family、错 endpoint、forbidden call、token/prefix delta。GEPA 很适合“根据失败簇修改 `when/avoid/contrast`”，但也最容易读到 Dev 标签后记忆 case 文案，必须锁定可编辑面与跨组验证。 |
| [JTPRO](https://aclanthology.org/2026.findings-acl.2017/)（Findings ACL 2026） | rollout-driven reflection 联合优化 global instruction 与 per-tool schema/argument descriptions；在 124–1,138 工具的多基准上，论文报告相对 GEPA 等强基线 5%–20% **相对** OSR 增益，并显示 joint 优于只改一层。 | 支持 Decision/Execution 组件分层与 tool-local cue；不支持把其大 inventory 效果量外推到当前约十几个工具，也不能把 exact runtime contract 交给 editor。 |
| [VGCO](https://arxiv.org/html/2512.13860)（2025 v1）与 [TRAS](https://proceedings.mlr.press/v318/davari26a.html)（PMLR 2026） | VGCO 用 retrieval/tool/parameter 三层 verification signal 只编辑责任层；TRAS 从失败生成 correction，也从成功生成 textual regularizer 以减轻 drift。 | 可映射为 `no-tool gate / family / tool / args+transport` blame tree，并把成功路径作为不可删 cue 证据；VGCO 是 v1 且主要面向 30–100 工具，TRAS 不是工具专属。 |
| [CAPO: Cost-Aware Prompt Optimization](https://arxiv.org/abs/2504.16005)（2025 preprint；[作者代码](https://github.com/finitearth/capo)） | 用 LLM mutation/crossover 的 evolutionary search；racing 提前淘汰差候选；多目标平衡性能与 prompt length，并共同优化 instructions/examples。论文消融报告 racing 平均节省 44% evaluations。 | racing 与长度目标非常适合昂贵 Luna eval；但论文任务并非工具调用，长度 penalty 也不能保护 exact contracts。应借用预算分配与 Pareto 思想，而不是直接套默认目标。 |
| [Capo: Constraint-Aware Prompt Optimization for LLM Agents](https://arxiv.org/html/2608.16068)（2026-08-17 v1） | 同名但不同方法：把要求建模为各自的 threshold constraint；prompt pool 保留强中间候选，primal-dual residual update 会提高违反约束的权重。论文强调 Pareto-optimal prompt 仍可能违反所有部署阈值。 | 与本项目“最大化效用，同时分别限制 FCR、token、过调、合同/格式”高度同构。但这是刚发布的 v1 preprint，不能按成熟依赖采用；只借 pool/threshold/residual 协议，先做 CAPO-lite，不训练 DCAPO。 |

### 3.2 候选设计 E：受约束的 GEPA + CAPO-racing 离线搜索

**来源事实**

GEPA 的优势是把 trace 与文本反馈变成定向改写；Cost-Aware CAPO 的优势是按预算 racing 并显式考虑长度；Constraint-Aware CAPO 的优势是把安全/成本要求写成约束，而非与准确率糊成一个加权分数。

**项目推断**

自动优化器只能编辑 `ToolPromptSpec` 的决策语义，不得编辑运行合同：

```text
可编辑：global gate、family boundary、when / avoid / contrast、字段顺序、客观措辞
只读锁定：tool name、method、path、required/forbidden fields、enum、body skeleton、headers、capability facts
禁止生成：caseId、fixtureId、gold tool 列表、Dev 查询原句、按 case 分支的特例
```

优化目标不使用单一 `score = ECR - λ·FCR - γ·tokens`。GEPA 的 Pareto/frontier 用来保留多样候选；最终部署可行性用 **CAPO-lite 的逐项阈值**判定，因为 Pareto-optimal 仍可能违反每一个业务阈值：

```text
目标（在可行区内 maximize）
  CompleteChainSuccess / ConditionalTerminalTool

分别预注册的阈值（示意；数值须在看候选结果前冻结）
  EffectiveCallRate              >= baseline - δ_ecr
  FalseCallRate                  <= baseline + δ_fcr
  every-family terminal accuracy >= family floor
  PairAccuracy / Worst-order     >= robustness floor
  staticToolTokens               <= token cap
  cumulative provider cost       <= cost cap
  order/paraphrase flip rate     <= flip cap
  cache-stable prefix/read ratio >= cache floor（仅 cache 候选）

零容忍合同
  RuntimeToolContract validator = pass
  capability/lifecycle honesty = pass
  forbidden schema/path/header mutation = 0
  sealed-test information leakage = 0
```

可行搜索协议：

1. **Seed**：只从 V2/V3 与少量人工消融开始，不让 optimizer 重新发明调用协议。
2. **Reflect**：evaluator 返回失败类型、期望 family/tool、实际首动作、forbidden/unexpected call、相关 PromptUnit 与 token delta；不返回 Hidden Test。
3. **Blame-localized mutate**：先按 `gate → family → tool → args/transport` 找责任层；GEPA/JTPRO 风格 editor 只改该层的一个或少数 PromptUnit。每次保存 diff、理由、父候选、cueId 与 hash；同时带入 TRAS 风格的成功轨迹 regularizer，明确哪些 cue 不可破坏。
4. **Race**：先在按 family/no-tool/pair 平衡的小批量上筛除明显失败候选；随后在未见 fold 上全量评估。任何 contract lint 失败立即淘汰，不花模型预算。
5. **Pool + residual**：保留不同 ECR/FCR/token/robustness 取舍；每轮按各阈值的 signed residual 调整 rewrite 关注点，但不把多个阈值永久折成一个固定分数。prompt pool 保留强父候选，失败 edit 不覆盖历史最佳。
6. **Freeze**：人工审查候选是否加入 case-specific 触发词；冻结后仅一次进入 Sealed Test。

**适用门槛**

- 先有真实 V0–V3 behavior trace，确认错误确实来自 Prompt 决策而非 scorer/Bridge；
- Dev 数量足以支撑优化集、验证 fold 与独立 calibration；formal Dev 160 也不等于 160 个相互独立的 leaf/error cluster，不能自动视为足够；
- 所有合同字段有机器 lint/byte diff；
- 搜索预算、候选数与停止条件预注册。

建议先按语义簇隔离 formal Dev：同一原始 source、同一改写模板、同一正负对照不得跨训练/验证 fold，避免 optimizer 记住表面词。MIPROv2 的约 200+ 长跑经验数只能作为谨慎门槛，不能替代项目学习曲线。

**复杂度**

- GEPA：约 `proposal rounds × reflection minibatch` 次 task eval，加每轮 reflection LM 调用、候选验证和可选 merge；可用 `max_metric_calls`/`max_reflection_cost` 硬限预算。
- MIPROv2：候选 instructions/demos 的生成成本，加 `trials × minibatch` 评估与周期性 full evaluation；搜索空间随模块/候选组合快速增长。
- Cost-Aware CAPO：population mutation/crossover 与 racing；早停省预算，但要重复评估噪声候选。
- Constraint-Aware CAPO 风格：每个候选同时计算每条 constraint residual，再做 dual update；metric 工程更重，但约束语义最清楚。

**可证伪实验**

用相同 Luna 调用预算比较：人工 V3、随机/规则改写、MIPROv2 instruction-only、受约束 GEPA/CAPO-racing。优化器胜出必须同时满足：

- 在未参与 proposal 的 held-out semantic folds 上优于或不劣于 V3；
- contract lint 全通过；
- permutation/counterfactual worst-case 不恶化；
- token/cache 净成本满足约束；
- 最终 Sealed Test 一次评估保持收益。

若收益只在 optimizer 看过的 fold 上出现、等预算随机搜索同样好、或候选靠复制 query 词/增长 Prompt 获胜，则否定自动优化方案。

### 3.3 为什么不能让优化器直接改完整 Prompt

- GEPA 的强项正是读取细粒度 trace；没有字段锁定时，它也可能把 evaluator 的 Gold 词写回 Prompt，形成可读但过拟合的“答案表”。
- CAPO 的长度 penalty 只惩罚长，不保证 name/path/schema 正确；短而错误的合同仍可能在弱 scorer 上拿高分。
- MIPROv2 的 demos 会显著改变 token 和位置分布；若与 instruction 改写同时进行，就无法归因 V2/V3 的增益来源。
- 自动搜索产生大量自适应比较；只汇报最佳 Dev 候选会严重选择偏差。必须使用未见 fold 和一次性 Sealed Test。

---

## 4. Tool description/order bias：把排列鲁棒性变成候选准入门槛

### 4.1 一手来源与直接性

| 来源 | 来源事实 | 项目边界 |
|---|---|---|
| [BiasBusters](https://proceedings.iclr.cc/paper_files/paper/2026/hash/a79875cc0d046ce7ce65f03f3affaa9e-Abstract-Conference.html)（ICLR 2026；[作者代码](https://github.com/thierry123454/tool-selection-bias)） | 在功能等价工具簇和七个模型上发现 provider/tool 偏好及较早位置偏好；语义对齐是最强选择驱动之一，小幅描述扰动可改变选择；论文用“先过滤相关子集，再在等价工具间均匀采样”缓解公平性偏差。 | 当前 Memory/Skill/Knowledge 工具大多**不等价**，不能在它们之间均匀随机。来源直接支持 order/metadata 压力测试与候选过滤，不支持随机调用不同 endpoint。 |
| [ToolTweak](https://arxiv.org/abs/2510.02554)（2025） | 迭代修改工具名/描述可把目标工具选择率从约 20% 提高到最高约 81%；论文观察到顺序、参数 schema 和名称均会影响选择，并在实验中随机打乱顺序作控制；数字后缀不同的等价工具也出现大幅选择差异。 | 攻击场景是工具市场/等价候选，不同于内部可信 Prompt；但它直接证明“客观语义未变时，选择可被 metadata salience 推动”。运行时随机打乱会破坏稳定前缀，不能照搬为生产防御。 |
| [Select Me! When You Need a Tool](https://arxiv.org/abs/2504.04809)（2025） | 黑盒粗到细的词级/字符级工具文本扰动能提高目标工具的被选与排序概率，覆盖 retriever 和 LLM selector。 | 主要是攻击证据；不能说明普通等义改写一定有同样幅度，但足以要求描述净化与反事实测试。 |
| [Unveiling Selection Biases](https://aclanthology.org/2024.findings-acl.333/)（Findings of ACL 2024） | 在一般“从有序选项中选择”任务上量化 order/token sensitivity，并研究缓解。 | 不是工具调用论文；只能支持排列诊断方法，不能作为工具偏差效应量证据。工具专属结论应以 BiasBusters/ToolTweak 为准。 |
| [ToolCert: Quantifying Distributional Robustness of Agentic Tool-Selection](https://arxiv.org/abs/2510.03992)（2025） | 用自适应 misleading-metadata attacker 采样，并给 tool-selection accuracy 的高置信下界；论文报告 adversarial 条件下 certified bound 可急剧下降。 | 面向恶意/动态工具库，强于当前内部威胁模型。可借用“报告 worst-case lower bound，而非只报 benign mean”的评测思想，不必立即实现完整攻击器。 |

### 4.2 候选设计 F：排列鲁棒性电池（评测改造，非生产随机化）

**来源事实**

BiasBusters 直接报告 earlier-listed preference；ToolTweak 为控制顺序偏差随机打乱工具列表。OpenAI 缓存官方文档又要求工具定义、顺序、schema 稳定。因此最合理的组合不是“生产每次随机顺序”，而是“生产固定 canonical order，候选在离线多排列上合格”。

**项目推断**

对每个 case 生成不改变能力/合同的 order replicas：

1. canonical；
2. reverse；
3. family block 的 cyclic rotations；
4. family 内近邻工具的 pairwise swaps；
5. 固定种子的 Latin-square/随机排列（避免全排列阶乘爆炸）。

所有 replica 使用相同 query、fixture、capability、model settings 与精确工具文案，只改序列。新增指标：

```text
Permutation Agreement
  同一 case 在所有排列中首决策一致的比例

Worst-Order ECR / FCR / ConditionalTool@1
  对每个 case 先取最差排列，再跨 case 汇总

Position Gap
  gold tool 位于最前 vs 最后时的正确率差

Flip Rate
  canonical 正确但任一等价排列变错的 case 比例
```

主表仍用 canonical production order；上述指标是候选准入/诊断，不能与主表混成一个平均值。若需要统计下界，可对 case-level worst-order success 做 bootstrap/置信区间；不声称等同于 ToolCert 的自适应攻击认证。

**适用门槛**

任何涉及工具卡压缩、字段重排、family layout 或 auto-optimization 的新候选都应跑。V0–V3 若尚无模型数据，可先把 replica 生成和 scorer 冻结，不必马上扩大 campaign。

**复杂度**

若每 case 跑 `P` 个排列，模型成本约乘 `P`；全排列是阶乘，不可用。优先覆盖 gold tool 的首/中/末位置及近邻交换，用 4–8 个固定排列即可获得高信息量。静态生成、hash 与 scorer 可先离线实现，不运行模型。

**可证伪实验**

预注册可接受的 non-inferiority margin 与最大 flip rate。若候选只在 canonical order 提升、但 Worst-Order/Flip 明显恶化，判定它利用了布局偏差而不是学会语义边界；否定候选，即使 canonical mean 更高。

### 4.3 候选设计 G：描述反事实与 metadata lint

**来源事实**

BiasBusters 发现小幅描述扰动会改变选择；ToolTweak/Select Me 表明名称、描述甚至字符级 metadata 都能成为选择攻击面；ToolTweak 还观察到带顺序暗示的数字后缀可能造成偏差。

**项目推断**

为每个稳定工具卡生成经人工/合同 lint 的等义反事实，不改变 `when/avoid/contrast` 的事实真值：

- **客观等义改写**：主动/被动、短句/同长句、字段次序变化；
- **非语义词去除**：删除 “best / recommended / always / preferred / powerful” 等促销或权威措辞；
- **近邻模板互换**：两个 sibling tool 使用相同句法模板，避免某一卡片因更流畅/更长而突出；
- **ordinal lint**：选择面对的 display label 不加入 `1/2/new/latest/default` 等无合同意义的排序暗示；真实 endpoint/version 必须保留，不能为去偏伪造合同；
- **lexical decoy**：加入关键词高度重合但 `avoid` 明确冲突的可信干扰卡，验证模型是否读决策边界而不是词重合。

推荐记录 `Description Counterfactual Agreement`、`Worst-Paraphrase ECR/FCR` 与每个 tool 的 selection share shift。对于语义不等价的近邻工具，目标不是 uniform share，而是 gold 稳定；只有真正功能等价的 mock twins 才可检查均匀性。

**适用门槛**

反事实文案必须通过人工与 RuntimeToolContract lint；任何改变使用条件、参数含义或 capability 的“改写”都不是反事实，不能进入同一对。

**复杂度**

每工具 2–3 个经审计改写；与排列做全笛卡尔积会爆炸，应使用分数因子设计：单独测 order、单独测 paraphrase，再只对最敏感近邻组合交叉。

**可证伪实验**

若等义改写导致大量 canonical-correct case 翻转、某个无关促销词显著提高工具 share，或 lexical decoy 吸走调用，则当前 Prompt 的选择依赖 metadata salience。若统一客观模板/更明确 `avoid/contrast` 不能降低 flip，又损害 canonical ECR，则否定该文案干预。

### 4.4 运行时不应做的“缓解”

- 不在每请求随机工具顺序；它会破坏 prompt cache 的稳定工具前缀，并让线上行为难以复现。
- 不对非等价工具均匀采样；BiasBusters 的 uniform step只针对功能等价 provider 工具。
- 不用 perplexity/长度单阈值自动判定“操纵性描述”；ToolTweak 的防御实验显示正常与攻击描述的 perplexity 分布可高度重叠。
- 不把随机顺序下的平均准确率当鲁棒性；应同时报告 worst-order 与 flip rate。

---

## 5. 独立动态架构轨：causal frontier、schema hydration 与 Intent IR

### 5.1 A-F：Causal frontier / state-stage exposure

**来源事实**

ToolChoiceConfusion 的 CMTF 只把最小可执行前沿暴露给模型；HyperAgent 从 terminal 的 unresolved input deficit 反向补 producer。二者都说明“语义相关”不等于“当前应该出现”：一个工具可能与任务高度相关，却因 prerequisite 未满足而过早。

**项目推断**

从 V4-G 同一关系源编译逐阶段可见集合：

```text
state S0: known(user/session/capability bindings)
goal G:  task-specific terminal effect

frontier(S, G) = executable tools that lie on at least one shortest allowed
                 requires→produces path from S to G

after tool result:
  validate produced bindings/effects
  S := S ∪ validated outputs
  expose next frontier; if no path → CLARIFY/UNSUPPORTED, never invent binding
```

Knowledge 可作为最小 prototype：初始只允许 `tools/list`，它返回同一 resource 的 tool/schema 后才允许 `tools/call`。Skill 次之：unknown team workflow 先 `skill_search`，得到 `skill_id` 后才开放 `view_by_id`；Scene 同理。不要一上来为 Memory 的所有单步 search 加额外发现轮。

**适用门槛**

- 正式 trace 存在 premature terminal、相关但不必要工具调用或 duplicate exploration；
- `requires/produces/handoff` 已经机器验证，且每个 Gold terminal 至少有一条 frontier path；
- 产品/runner 能在每步更新 provider-visible tools，而不把 capability enforcement 降为文本提示。

**复杂度**

高。除图外还需 state/binding store、动态 tool list、错误恢复、每步 trace/scorer 与 cache 策略。错误 contract 会 over-filter，必须有 conservative fallback：缺 path 时澄清或回到完整**已授权** family，而不是静默暴露全部工具。

**可证伪实验**

把它作为 `Architecture-AF` 与静态 V3/V4-G 分栏：同一 Gold/scorer，但报告 frontier recall、premature/duplicate、Complete Chain、terminal、累计 token/cache/cost/轮数。若初始工具大减但 discovery/result/reasoning 累计后无净收益，或任何 gold prerequisite 被隐藏，停止该轨。

### 5.2 A-D：Schema-on-demand / provider-native tool search

第 2.3 节已给来源与门槛。实现选择按风险排序：

1. Provider 原生 namespace/deferred tool search：命中定义追加到对话末尾，通常更有利于 prefix cache；
2. client-executed search：需要可信 registry、schema signature、conversation state 与 tool-result linkage；
3. 自建 `discover_tools` endpoint：最后选项，会新增可误选的 meta-tool 与一轮协议。

当前工具通过 system text/curl 暴露，并非原生 function schema；因此第 1 项也可能要求宿主/Bridge 改造，不能把文档里的 `defer_loading` 字样写进 Prompt 就算完成。规模门槛应由真实工具/definition token 与 selection error 触发；Knowledge 的 list→call 已经是渐进 schema，优先测其累计账本，而不是新造全局 retriever。

### 5.3 Stretch A-IR：Intent IR / typed dispatcher / structured grammar

**来源事实**

- [IBM Prompt Declaration Language](https://github.com/IBM/prompt-declaration-language) 与 [APPL](https://aclanthology.org/2025.acl-long.63/) 把 Prompt program 做成可组合、可追踪/回放的声明式结构；它们支持“Prompt 是可编译程序”的工程观，不证明一个 Intent IR 会提高工具选择。
- [OpenAI Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/) 的 `strict` schema 与 [XGrammar](https://github.com/mlc-ai/xgrammar) 一类 constrained decoding 能保证支持子集内的结构/grammar；它们不保证意图、工具或参数语义正确。
- RestGPT 等 planner/selector/executor 架构支持“先表达操作意图，再由执行器构造 API”，但不是当前 `MemoryProxy` 的直接接口证据。

**项目推断**

若未来决定停止让模型生成完整 curl，可把 Decision Plane 输出限制为一个 decision packet：

```json
{
  "action": "direct|clarify|discover|call",
  "family": "memory|skill|knowledge|null",
  "intent": "semantic_memory|exact_history|team_skill|knowledge_op|...",
  "knownBindings": {"skill_id":"..."},
  "missingBindings": [],
  "terminalGoal": "read_skill_manifest",
  "maxCalls": 2
}
```

确定性 dispatcher 再把白名单 `intent/op + args` lowering 成现有 exact method/path/header/body。它必须：拒绝任意 URL/method/path；按 operation 做 ACL/capability；校验 provenance；记录 trace；把每个 op 映射回现有 RuntimeToolContract。不能用一个接受任意 curl 的 `execute` 形成 god-tool。

Intent IR 也可以先只作为**内部 compiler IR**，不要求模型显式输出；这是风险最低的落地。只有 formal trace 显示 malformed/transport 是主要失败，而不是 tool selection，才值得让模型输出 packet 并启用 strict grammar。

**适用门槛**

- 宿主能原生约束/解析结构化输出，或 Bridge 有可靠 parser；
- 参数/transport 错误占主要失败；
- 产品愿意维护 dispatcher ACL、版本、审计与迁移；
- 可以与 curl baseline 分轨累计成本，而不是称为单纯 Prompt Variant。

**复杂度**

很高。Compiler-only IR 中等；模型可见 packet + dispatcher 为高/很高，涉及安全边界和全链路协议。

**可证伪实验**

分别测 `internal IR only`、`model packet without constrained decoding`、`strict packet + dispatcher`。语法合法率与 semantic routing/terminal 必须分开；若 malformed 降低但 family/tool 错误不变、ACL reject 增加或累计 token/轮次更差，则不推进 model-visible IR。

---

## 6. 建议的最小研究/实现顺序

1. **P0-A，冻结最短链与 token ledger。** Gold 允许一个或多个最短充分序列；正确 terminal + prerequisite/handoff + 无 forbidden/unexpected/duplicate 即成功。累计成本到 terminal 即止，不评分 asset 内容或最终答案。
2. **P0-B，冻结 E-CF 鲁棒性评测。** 最小 act/abstain 对、Pair Accuracy、固定 order/paraphrase replicas、rhetorical-neutrality lint；同源 pair 同 split。
3. **P0-C，做三平面等价 IR 与 cache metadata 保真。** 先不改变 V3 可见文本；验证 `pipeline.ts` 重建不会吞 marker。完成后才做 S0/S1/S2/S3 layout probe。
4. **跑冻结 V0–V3 formal Dev 160。** 先获得真实 gate/family/tool/args/terminal/cache 错误分层；不得用 Hidden 240 做候选搜索。
5. **按错误类型只开一条 P1。** 多步/terminal/handoff 错 → V4-G；稳定 confusion edge/token 压力 → V4-CP；跨 session cache 损失 → V4-L。每次只改一个因子，先 Smoke/racing，再完整 Dev fold。
6. **P2 commit gate。** 只有 FCR、缺参/能力不足对明显失败时，才引入四态；先做 prompt-only gate，再讨论高成本 consistency/conformal。
7. **P3 自动搜索。** 先跑 deterministic LOO/budgeted cue compiler；数据和机器约束足够后，才做 GEPA/JTPRO editor + CAPO-lite pool/threshold。MIPROv2 instruction-only 与等预算 random/rule search 作 baseline。
8. **动态架构由规模/错误触发。** Causal frontier、schema-on-demand、Intent IR 分别作为 Architecture-AF/A-D/A-IR；它们不进入“静态 V0–V3 token 公平比较”，只按 cumulative ledger 与 terminal 行为晋级。

## 7. 一句话判断标准

- **Conformal gate**：只对已校准的离散首决策作有限声明；没有独立 calibration 与 frozen protocol，就没有项目内保证。
- **Cache segmentation**：以真实 `cached/write tokens + net cost + behavior non-inferiority` 判定，不以本地块顺序或 raw token 判定。
- **Auto-optimization**：Pareto pool 用来保留候选，部署要求用逐项 threshold 判断可行性；不是 Dev 最高分长文案，也不是固定加权分数。
- **Order/description robustness**：生产顺序固定以利缓存，离线排列与反事实必须稳定；canonical 提升但 worst-case 退化的候选不合格。
- **Dynamic exposure**：初始 prompt 变小不算胜利；到正确 terminal 为止的累计 input/output/reasoning、cached/uncached/write、discovery result、轮数与成本都必须更优或满足预注册取舍。
- **Intent IR/grammar**：格式正确不等于工具语义正确；只有 malformed/transport 是主故障时才从 compiler IR 升级为模型可见 dispatcher。
