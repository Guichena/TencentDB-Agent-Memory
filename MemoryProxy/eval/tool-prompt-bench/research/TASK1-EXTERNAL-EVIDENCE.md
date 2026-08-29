# Task 1 外部证据：低 token、低误调用的工具提示注入

> 本文保留为上一轮来源证据深潜。正式候选 ID、指标公式、统计/Token 口径与阶段顺序以 [`TASK1-RESEARCH-SYNTHESIS-AND-TRIAL-BACKLOG.md`](./TASK1-RESEARCH-SYNTHESIS-AND-TRIAL-BACKLOG.md) 为准；后者已合并本稿与后续研究并吸收交叉审核修正。

> 研究范围：只研究注入内容能否让模型在正确时机完成最短充分的工具决策链，不把工具返回资产质量、最终回答质量或编码任务完成率混入主指标。
>
> 资料口径：优先论文原文、作者项目、官方技术报告、官方产品文档和开源项目源码/设计文档。检索日期：2026-08-29。
>
> 项目基线：本文以现有 V0（冻结生产提示）、V0-C（契约纠错）、V1a（协议压缩）、V1（语义去重）、V2（Tool/No-Tool 与家族选择校准）、V3（确定性能力裁剪）为起点。

## 结论先行

现有 V0→V3 的方向基本符合外部证据：把“是否需要工具”“选哪个家族”“选哪个具体工具”拆开；去掉重复协议；用 `when / avoid / contrast` 提高工具间可辨识度；根据确定性能力裁剪不可用工具。源码冻结结果已经把完整注入从 V0 的 4,863 token 降到 V3 的 2,224 token，下降 54.3%；但目前没有任何正式模型行为数据。因此下一步不是继续凭直觉造更多 Prompt，而是先把测量口径和缓存保真修正确认，再让失败数据决定是否新增 Variant：

1. **先纠正评测合同。** `EXPERIMENT-DESIGN.md` 只评首入口，会漏掉 `skill_search → skill_view`、`knowledge list → call` 等后续工具选择；最新后数据计划的“完整链路”方向更接近目标，但 Pilot scorer 又把 HTTP 2xx、基础设施状态和完整序列混在 `effectiveCall` 中。正式主指标应是“最短充分工具决策链完成率”：到达正确 terminal 工具并完成必要的跨步 ID/path/tool-name 传递即停止，不评价资产内容和最终答案。
2. **先验证缓存保真，再决定是否改布局。** OpenAI、Anthropic、Google 的官方缓存文档都要求稳定内容构成共享前缀。当前捕获提示中，会话 ID、空间 ID、动态 skill/knowledge 清单位于部分稳定路由规则之前；同时 `pipeline.ts` 在 anchor 命中后把 system blocks 重建成一个 text block，可能丢失 Anthropic `cache_control` metadata。先补 marker 保真回归和真实跨 session/cache telemetry；只有测到明确损失，才新增“稳定前缀布局”候选。
3. **现有决策卡先跑，不重复发明。** V2/V3 已经采用 `when / avoid / contrast`，且名称、路径、参数结构等契约字段保真。论文和多家官方文档支持“清楚、具体、可区分”，并不支持“描述越短越好”。只有 Dev trace 出现稳定的近邻误选或漏调簇时，再做极小文案修订或归因消融。
4. **分层暴露只作远期条件方案。** Provider 原生 tool search、RAG-MCP 等支持大工具面下先看家族/namespace、再加载子工具；但本项目目前只有约十几个候选工具、V3 总注入仅 2,224 token。额外检索轮大概率得不偿失；只有工具面明显增长或真实 trace 显示持续选择混淆时才立项。
5. **负例应覆盖“看起来相关但不该调用”，不应堆很多 few-shot。** MetaTool、WTU-Eval、BFCL 都把“是否应调用”作为独立能力，并显式加入无需工具的样本。项目应优先增加纯 coding、现有上下文足够、画像已给出、资源/仓库不匹配、仅关键词碰撞等 hard negatives；提示中只实验极少的正反对照，避免用例子换来大量 token 与跨模型偏置。
6. **跨模型结果不能混算。** 主实验固定 `gpt-5.6-luna` 与 high reasoning；候选冻结后如预算允许，再用一个不同模型做平衡子集复核。两者逐模型单列，不用平均分选 Prompt，也不为第二模型重新调 Prompt。

## 0. 源码校准：当前已经完成什么、真正缺什么

### 0.1 冻结 Variant 与 token 事实

| Variant | 主要改造 | 完整注入 token（`o200k_base`） | 相对 V0 |
|---|---|---:|---:|
| V0 | 原生产 renderer | 4,863 | — |
| V0-C | 真实合同纠错 | 5,126 | +5.4% |
| V1a | 共享协议与 curl 语法 | 4,413 | -9.3% |
| V1 | 跨块语义去重 | 4,027 | -17.2% |
| V2 | Tool/No-Tool、Family gate 与 decision cards | 2,308 | -52.5% |
| V3 | 按真实 capability 确定性裁剪 | 2,224 | -54.3% |

这些数字来自 `variants/code-freeze/code-freeze-manifest.json`，是 C00 canonical fixture 的离线完整 render token 证据，不是纯静态组件，也不是行为效果。V3 中剩余最大的单块是 `tdai_memory_tools`（1,045 token），但不能仅凭它最大就继续删除：其中包含实际入口、body skeleton 和近邻工具边界，必须由 Dev 错误簇决定可删内容。

### 0.2 三个正式运行前缺口

1. **指标口径冲突。** `EXPERIMENT-DESIGN.md` 截止到首入口，无法评价 discover 后是否选到正确 terminal 工具；`TASK1-POST-DATA-EXECUTION-PLAN.md` 的 Complete Chain 又可能被理解成资产使用和最终任务完成。Pilot 的 `evaluator.ts` 令 `effectiveCall = executionValid`，同时混入完整序列、headers 与 HTTP status。正式评测应建立新 schema：ECR 要求 Gold 允许路径的必要 tool/endpoint/参数/跨步 handoff 正确并到达被合同接受的 terminal；额外/重复/超预算另由 StrictChainExact/ToolSPL 评价。Terminal asset 内容和最终回答不评分，5xx/timeout 等基础设施故障单独排除。
2. **缓存 marker 可能被重建丢失。** `adapters/anthropic.ts` 能解析和序列化 `cache_control`，但 `pipeline.ts:369` 在 anchor 命中时执行 `sysMsg.blocks = [{ type: "text", content: ... }]`。这会把原 blocks 合成一个新 text block，原 metadata 无处保留。应先补“marker 数量、位置、TTL 与 marker 前字节不变”的回归测试；这属于缓存合同正确性，不是过度防御。
3. **现有 prefix 指标测错对象。** `stablePrefixBytesFromParent` 测的是相邻 Variant 的共同前缀，不能说明同一 Variant 在不同 session/space/资产快照间能缓存多少。V3 快照在开头约百余字节就出现 `space-c00/session-c00`。正式 cache 报告要测跨 session/space 的 provider-visible 最长共同前缀，并记录真实 `cached_tokens` / cache write tokens。

正式 scorer 至少应把当前混合布尔值拆成：入口 family/tool/endpoint、terminal tool、decision path complete、各步参数、跨步 provenance、transport accepted、tool-result linked、infrastructure failure，以及 forbidden/unexpected/duplicate/budget exceeded。当前 `conditionalToolCorrect = firstSelectionCorrect` 会让 Knowledge 的通用 list/discover 掩盖后续选错；`argumentValid = fullSequenceCorrect` 混合了参数与路径；只用 `attempts.length > maxTdaiCalls` 也捕捉不到预算内的错误额外调用，而且 Gold 的 `forbiddenTools` 目前没有进入 evaluator 判定。

### 0.3 当前最小正确顺序

1. 把 scorer/计划统一为“最短充分工具决策链”，并补 cache marker 保真测试；不改冻结 V0–V3 Prompt。
2. 等正式数据冻结后，先跑 12-case 真实链路 smoke，再跑现有 V0→V3 的小型 Dev 配对。
3. 根据错误簇决定是否需要新候选：Skill search 漏调才做小型文案修订；实际 cache prefix 明显受动态绑定影响才做布局候选；V2 的行为变化无法归因时才做 `gate-only` / `debias-only` 分析消融。
4. 任何新候选使用新 profile、manifest 和 cache identity，绝不覆盖 V0–V3 冻结文件。

### 0.4 已从源码发现、但必须等 trace 验证的 Prompt 假设

- **Skill search 召回张力**：全局 Skill gate 倾向要求请求已被 listed/team skill 清楚匹配，但 `skill_search` 的用途正是“可能存在团队 workflow、名字未知”。若 Dev 的 team-library search 正例集中漏调，可把家族规则收敛为：“明确需要可复用团队 workflow；列表命中则打开，否则搜索团队库。”同时保留“关键词重叠或纯 coding 不调用”。
- **近邻端点判别**：只有 trace 显示错误集中在 `skill_view` / `skill_view_by_id`、`skill_files_read` / `skill_files_download`、Memory search / query / scenario read 等近邻时，才补一条互斥 `contrast`。不要给所有卡片统一加说明。
- **V2 归因问题**：V2 同时改变全局 gate、Skill/Knowledge 去推广措辞和各工具卡。若 V2 行为变化很大但来源不清，可在 Dev 做 `gate-only` 与 `debias-only` 两个 `formalMetricEligible=false` 消融；它们只用于解释，不进入 Hidden 或生产候选。

## 1. 外部一手证据总表

| 主题 | 一手来源与日期/版本 | 核心发现 | 适用边界 | 对 V0–V3 的可能增量 |
|---|---|---|---|---|
| 工具描述与选择 | [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)（当前官方文档，检索于 2026-08-29） | `description` 应说明何时、如何使用；函数初始集合宜小；官方给出“少于 20”软建议；工具定义计入输入 token，宜缩短描述。 | 软阈值，不是所有模型的硬上限；短描述不能牺牲歧义消除。 | 支持 V1/V2；V4 应聚焦“判别信息密度”，而非继续机械删字。 |
| 工具描述与选择 | [Anthropic Define Tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)（当前官方文档） | 工具描述是选择性能最重要因素之一；应覆盖做什么、何时用/不用、参数含义与限制；复杂工具建议充分描述。 | Claude 专属建议；“复杂工具 3–4 句”不应直接照搬到 Luna。 | 提醒 V1 压缩设下限：保留 `when/avoid/参数语义`，不要删到只剩标签。 |
| 工具描述与选择 | [Google Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)（页面更新 2026-08-26 UTC） | 使用清晰具体的函数/参数描述、描述性名称、强类型和枚举；活跃集合建议约 10–20；支持 `auto/any/none/validated`。 | Gemini API 的模式和 schema 能力不等于本代理宿主能力。 | 支持 V2 的全局 gate、V3 的活跃集裁剪；可实验强枚举替代长自然语言约束。 |
| 是否调用 | [Toolformer](https://arxiv.org/abs/2302.04761)（2023-02-09） | 工具使用包含分离决策：是否/何时调用、选择哪个 API、传什么参数。 | 训练方法论文，不直接证明仅改系统提示可获得同等提升。 | 理论上支持当前分层评分；应继续分开看 ECR/FCR、家族选择、参数格式。 |
| 是否调用 | [MetaTool / ICLR 2024](https://arxiv.org/abs/2310.03128)（2023-10-04；[ICLR 2024 会议版](https://proceedings.iclr.cc/paper_files/paper/2024/hash/bc12914d66b41b6bfc2d3a5decdb498b-Abstract-Conference.html)） | 明确区分 tool awareness（是否需工具）和 tool selection；awareness 数据同时含必须调用的正例与可直接作答的负例；工具列表变长时选择正确率下降；更详细的描述常有帮助；同一改写对不同模型效果不同。 | 任务、模型和提示格式不同；“更详细”与 token 最优之间仍需项目内消融。 | 强支持 V2；V4 增加 hard negatives、列表长度梯度和跨模型逐项报告。 |
| 不必要调用 | [WTU-Eval](https://arxiv.org/abs/2407.12823)（2024-07-18） | 只含“必须用工具”的基准不真实；不必要工具使用会损害一般能力；评估应同时包含工具任务和普通任务。 | 论文部分结论来自微调，不等价于提示词修改。 | 支持把纯 coding/no-tool 作为同等重要主集，以 FCR 而非主观观感量化干扰。 |
| no-tool 基准 | [Berkeley Function Calling Leaderboard](https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard)（持续更新的作者开源项目） | Function Relevance Detection 专门放入没有相关函数的查询，并期待模型不调用；另有多函数、多步与 AST/可执行评估。 | BFCL 是通用函数调用基准，函数形态与 TDAI curl 入口不同。 | 支持把 no-tool、入口路由、terminal 选择与执行合同分层，不评价资产内容。 |
| no-tool 技术报告 | [UC Berkeley BFCL 技术报告](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2025/31680.html)（2025） | 给出可扩展函数调用评估，并讨论 AST 评估与执行评估的对应关系。 | 报告关心广义函数调用能力；本项目只采用其“结构正确、相关性拒绝与多步轨迹分层”的思想。 | 支持最短工具决策链使用结构/轨迹 grader，并把基础设施结果另列。 |
| 文档 vs. 示例 | [Tool Documentation Enables Zero-Shot Tool Usage](https://research.google/pubs/tool-documentation-enables-zero-shot-tool-usage-with-large-language-models/)（Google Research，2023；arXiv 2308.00675） | 在研究任务中，工具文档能带来强 zero-shot 工具使用；有文档时可接近 few-shot，而无文档的 few-shot 明显更弱。 | 不证明任何短文档都足够，也不排除少量示例对本项目有效。 | 优先保留判别性文档；对照例只做最小消融，不把注入变成示例库。 |
| 文档净化 | [EASYTOOL](https://aclanthology.org/2025.naacl-long.44/)（NAACL 2025；[作者代码](https://github.com/microsoft/JARVIS/tree/main/easytool)） | 将冗长、不一致的工具文档净化成统一、简明、标准化指令，可改善工具利用。 | 论文包含额外预处理和下游任务成功率，不等同于本项目的最短决策链指标。 | 支持 V1 的统一卡片格式；新候选可比较同信息量下固定字段顺序是否更鲁棒。 |
| schema/上下文压缩 | [Concise and Precise Context Compression for Tool-Using LLMs](https://aclanthology.org/2024.findings-acl.974/)（Findings of ACL 2024） | 工具名、参数名和参数格式需原样保留；学习式选择性压缩可在 API-Bank/APIBench 上以较高压缩率保持性能。 | 其最高压缩率依赖训练过的压缩/解码模型，不能据此声称手工提示可安全压缩 16 倍。 | 给 V1 设置“不可压缩区”：精确名称、路径、body skeleton；优先压缩解释、重复协议和例子。 |
| 通用 Prompt 压缩 | [LLMLingua](https://arxiv.org/abs/2310.05736)（EMNLP 2023） | 用额外模型做 token 级压缩，在通用长上下文任务上报告高压缩率。 | 实验不是工具契约决策链；压缩结果依赖额外模型，可能改写精确 endpoint/schema，且会增加生成与版本变量。 | 不引入当前正式链路；确定性 compiler 已更可审计、可复现并适合 cache hash。 |
| 位置效应 | [Lost in the Middle](https://arxiv.org/abs/2307.03172)（TACL 2023） | 在多文档问答与 key-value retrieval 中，相关信息位置变化会显著影响表现，开头/结尾通常优于中部。 | 不是工具调用研究，不能据此断言某个注入 slot 必然最佳。 | 支持把位置改动视为独立行为变量；V4-L 必须只改布局并做非劣评测。 |
| 分层/延迟暴露 | [OpenAI Tool Search](https://developers.openai.com/api/docs/guides/tools-tool-search)（当前官方文档） | 可先暴露 namespace/MCP server 的高层描述，相关时再加载 deferred tools；被发现工具加到上下文末尾以保留缓存；namespace 内函数不宜过多。 | 当前仅 GPT-5.4+；本项目 Luna/Proxy 未必支持原生 tool search。 | 提供 V4-N 设计依据；若宿主不支持，需新建 discover/manifest 能力，超出仅改 renderer 的范围。 |
| 分层/延迟暴露 | [Anthropic Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)（工具版本 `tool_search_tool_regex_20251119` 等）与 [`defer_loading` reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference) | 大工具面可延迟加载，官方案例称通常减少大量初始工具 token；一次只加载少量相关工具；大于约 30–50 工具时选择会明显变难。 | 厂商案例而非跨模型定律；本项目工具数远小于其大规模场景。 | 仅当工具数/文档量继续增长时优先；当前规模先用列表长度梯度判断是否值得增加检索阶段。 |
| 检索式工具选择 | [RAG-MCP](https://arxiv.org/abs/2505.03275)（2025-05-06，预印本） | 先检索相关工具、只注入候选文档；在最高到 11,100 工具的压力测试中报告 token 和选择准确率改善。 | 预印本且主要是超大工具空间；检索漏召回会为小工具集引入新失败模式。 | 可作为未来 V4-R；必须新增候选召回指标，不能把检索失败错误归给模型。 |
| 层级检索 | [ToolRerank](https://arxiv.org/abs/2403.06551)（2024-03-11） | 单工具查询应聚集候选，多工具查询应保留多样性；固定候选数并非总是最优，seen/unseen 工具表现不同。 | 在 ToolBench 等环境评估，并非仅系统提示消融。 | 若做 V4-R，应分别测 single/multi-tool、seen/unseen，以及可变 `k`，不只测一个 Top-K。 |
| 动态工具清单 | [MCP Tools，稳定版 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | 工具由模型控制；`tools/list` 可分页；工具集变化可通过 `listChanged` 通知。 | 稳定版没有明确规定返回顺序必须确定。 | V3 能力裁剪应绑定 catalog/version，并让清单变化可观测。 |
| 确定性顺序 | [MCP Tools，Draft](https://modelcontextprotocol.io/specification/draft/server/tools)（检索于 2026-08-29，草案） | 草案明确建议工具顺序确定，并指出确定性顺序有利于 prompt cache hit。 | 这是 Draft，不应写成稳定规范要求。 | 直接启发 V4-L：所有动态列表稳定排序、稳定字段顺序、稳定空白，并做字节哈希测试。 |
| 工具与资源边界 | [MCP Resources，稳定版 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) | Resources 是 application-driven；客户端可搜索/过滤、用启发式或模型选择资源。 | MCP 的 resource/tool 控制面不一定与现有 KnowledgeProxy 完全一致。 | Knowledge 资源 ID/列表更适合动态发现层；稳定前缀只留“何时查知识库”的家族规则。 |
| 缓存前缀 | [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching)（当前官方文档） | 缓存依赖完整渲染前缀匹配；工具名、描述、schema、顺序变化都会影响前缀；稳定指令应在前、动态内容在后；应同时监控 cached/write tokens。 | 最小可缓存长度随模型而异；少 token 不一定等于低成本——缩到阈值下可能丢失缓存收益。 | V4-L 是优先级最高的非语义实验；token 指标需加缓存读写与命中，而非只看 raw tokens。 |
| 缓存前缀 | [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) 与 [Cache Diagnostics](https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics)（当前官方文档） | 缓存层级按 tools→system→messages；建议把静态工具、指令、上下文放前面；重排工具、时间戳或更早消息会使缓存失效。 | Anthropic 的 breakpoint API 不一定适用于当前宿主。 | 即使没有显式 breakpoint，也应保持稳定公共前缀，动态块统一后置。 |
| 缓存前缀 | [Google Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching)（页面更新 2026-08-13 UTC） | 大而公共的内容应放在输入开头，并让请求共享相似前缀；缓存最短长度随模型变化。 | Gemini 缓存实现与 OpenAI/Anthropic 不同。 | 跨厂商共同支持“稳定前、动态后”；需要按目标模型实测阈值。 |
| 模型漂移 | [OpenAI API Backward Compatibility](https://platform.openai.com/docs/api-reference/backward-compatibility)（当前官方文档） | 同一模型家族不同 snapshot 的 prompting behavior 可能变化；官方建议固定版本并用 eval 监控。 | 只直接约束 OpenAI API，但模型漂移是通用工程风险。 | 主实验固定版本；升级或换模型时重跑完整矩阵，不把版本变化误判成提示优化。 |
| 评测设计 | [OpenAI Evaluation Best Practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) 与 [Agent Evals](https://developers.openai.com/api/docs/guides/agent-evals)（当前官方文档） | 评测应任务专用、覆盖真实分布与边缘/对抗样本、记录全部过程、自动化、隔离工作流阶段；trace 可评“是否选对工具/路由”。 | 官方框架不是本项目必须使用的实现。 | 支持用 trace 评分最短决策路径，并把入口、terminal、参数和基础设施失败分层。 |

## 2. 从证据到本项目：哪些是明确支持，哪些是推断

### 2.1 工具描述：压缩“操作重复”，保护“决策差异”

**论文/框架明确支持**

- OpenAI、Anthropic、Google 都要求函数描述解释用途和使用时机；Google 进一步强调具体参数描述、强类型与枚举。
- MetaTool 观察到工具列表变长会降低选择正确率，描述质量对选择有影响。
- EASYTOOL 支持把冗长、不一致文档统一成标准化指令。
- 上下文压缩论文明确指出工具名、参数名和格式属于需要保真的关键内容。

**结合本项目推断**

每个工具采用统一决策卡即可，不再重复完整调用教程：

```text
<tool name="..." path="...">
  when: 该工具唯一或最主要的触发条件
  avoid: 最容易造成误调用的一种边界
  contrast: 仅在存在近邻工具时写“若 X 则改用 Y”
  body: 精确、最小、可执行的 JSON 结构
</tool>
```

共享 curl、认证 header、统一错误处理、禁止伪造结果等协议只放一次。工具名、endpoint、必需字段、枚举值和 JSON 结构不改写；可首先压缩的是重复解释、重复错误码、同义警告和多套等价示例。

V2 已经引入 `when/avoid/contrast`，所以新候选的预期增量应保守：主要验证字段顺序固定、每卡只保留一个最强负边界，以及移除残余协议重复是否能在不伤 ECR/terminal tool accuracy 的前提下降低 token。若压缩后某类近邻误选增加，应恢复该对比，而不是恢复整段长文。

### 2.2 Tool/No-Tool：负例是独立能力，不是选择题的附属项

**论文/框架明确支持**

- Toolformer 将“是否/何时调用”与“选哪个 API”分开。
- MetaTool 的 awareness 数据同时包含必须使用外部工具的正例和可以直接回答的负例，并以 accuracy/precision/recall/F1 衡量是否调用。
- WTU-Eval 指出仅评强制工具任务会系统性忽略不必要调用。
- BFCL 的 Function Relevance Detection 直接要求在无相关函数时拒绝调用。
- Google Research 的工具文档研究表明，清楚文档本身可以产生强 zero-shot 表现，因此无需默认堆叠大量示例。

**结合本项目推断**

V2 已经把全局 Tool/No-Tool gate 收敛为“是否存在只有持久资产才能补齐的信息缺口”，应先按原样评测。只有 hard-negative 或漏调 trace 暴露稳定边界错误时，才修改这一句；不能在尚无行为数据时继续凭感觉缩短。

fixture 的 no-tool 不能只有明显无关问题，应重点扩展 hard negatives：

- 纯 coding，所需信息已在本地源码、用户消息或当前对话中；
- 用户只是提到“记忆/技能/知识”这些词，但没有请求外部资产；
- L3/L2 已经提供足够画像，无需再次 search；
- 知识库存在但 repository、space、产品或版本不匹配；
- 用户要求解释、重构、写测试，工具无法减少信息缺口；
- 多轮对话中第一次已查过，后续问题可由当前上下文回答。

提示中最多增加一个短正例/负例对照作为 V4-H 消融；若改善很小或跨模型不稳，应删除示例并把 token 留给明确的 `avoid/contrast`。

### 2.3 分层暴露：先家族、后工具，但要给检索器单独记账

**论文/框架明确支持**

- OpenAI Tool Search 与 Anthropic Tool Search 都允许只初始暴露 namespace/server 的高层描述，再按需加载工具。
- RAG-MCP 在超大工具空间中通过检索减少注入工具文档；ToolRerank 说明 single-tool 与 multi-tool 查询需要不同的候选策略。
- MCP 允许动态列举工具、分页和 `listChanged`；Resources 适合由客户端搜索/过滤或用模型选择。

**结合本项目推断**

设计一个单独的 V4-N/V4-R，而不是修改 V3 的语义：

```text
稳定前缀：No-Tool gate
        → Memory / Skill / Knowledge 三个家族摘要
动态后缀：选中家族后加载该家族的具体工具卡/schema
```

若 provider 有原生 deferred tools/tool search，优先使用其原语；否则要增加一个稳定的 `discover_tools(family, query)` 或 manifest endpoint，这已超出“只改 renderBlock()”的范围，应作为后续架构方案，不应假装只是提示压缩。

当前工具规模不大，检索很可能不划算，本轮不建议实现。若未来工具面增长或现有 Variant 出现持续选择混淆，再先做 5/10/20/50（或真实可达范围）的离线工具数梯度，并把检索阶段与模型阶段拆开：

- `FamilyRecall@k`：应调用家族是否进入候选；
- `ToolRecall@k`：金标工具是否进入候选；
- `NoTool-Retrieval-FPR`：无需工具时是否仍检索出候选；
- `Selection@1 | gold in candidates`：候选正确时模型是否选对；
- 端到端 ECR/FCR：最终最短工具决策链是否完成、no-tool 是否误触发。

只有当静态 token/cache 成本下降且端到端 ECR、FCR、terminal tool accuracy 不退化，才接受分层方案。不能用检索器“返回了相关候选”代替有效调用率，也不能把资产返回内容质量混入主指标。

### 2.4 动态列表：可变化，但变化必须确定、可观测、可复现

**论文/框架明确支持**

- MCP 稳定规范支持 `tools/list`、分页和 `listChanged`。
- MCP Draft 明确建议确定性顺序，并把它与缓存命中联系起来。
- 多家缓存官方文档都说明工具/schema/顺序或前缀变化会影响缓存。

**结合本项目推断**

V3 的能力裁剪应满足四条可测契约：

1. 相同 capabilities、相同资产快照、相同版本时，输出逐字节相同；
2. 工具按稳定 key 排序，JSON/XML 字段、空白和换行固定；
3. 工具集变化时，catalog/version 明确变化并进入日志；
4. capability pruning 与 query-aware retrieval 分开：前者是确定性可用性过滤，后者是概率相关性过滤。

建议为每个注入块记录内容 hash、工具名序列、catalog/version 与 token 数。这样 prompt cache 波动才能归因到真实工具集变化、渲染非确定性还是会话动态值。

### 2.5 缓存前缀：raw token 更少不一定真实成本更低

**论文/框架明确支持**

- OpenAI 明确要求完整渲染前缀匹配，并指出工具名、描述、schema 和顺序都会影响缓存；稳定指令/参考内容放前，动态内容放后。
- Anthropic 说明 tools→system→messages 的缓存层次，重排工具、加入时间戳或改变较早消息会使后续缓存失效。
- Google 同样建议公共大内容在前、请求共享相似前缀。
- 缓存最小长度和计费方式随模型而异，因此 token 下降可能导致内容落到最低缓存阈值以下。

**结合本项目推断**

当前 V3 捕获提示中，session/space ID、available skills、knowledge resources/IDs 等动态内容位于部分稳定路由/执行规则之前。这意味着单个动态字节变化可能截断后面的可复用前缀。不过正式改布局前，应先确认 `cache_control` 在 pipeline 重建后仍被保留，并用真实 provider usage 测出跨 session/space 的损失。若两项证据确认问题，再新增 V4-L：

```text
system.before_tools / stable prefix
  1. 统一 Tool/No-Tool gate
  2. Memory / Skill / Knowledge 家族摘要与选择边界
  3. 稳定的协议、精确 tool cards/schema（固定顺序）
  4. 可选显式 cache breakpoint

system.suffix / variable suffix
  5. session_id / space_id / 用户或租户身份
  6. 当前 available skills、knowledge resources、resource IDs
  7. L3 长期画像与 L2 场景索引
```

这是**基于当前提示快照与官方缓存机制的项目推断**，并非已经证明换位一定提高调用质量。注入位置本身也可能改变模型注意力，因此 V4-L 应保持文字完全相同，只改块顺序，单独评估：

- prefix byte hash 与最长共同前缀 token；
- cache read/hit tokens、cache write tokens、首 token 延迟和实际输入成本；
- ECR、FCR、Conditional Terminal Tool Accuracy 的非劣性；
- 低于 provider 最小缓存长度时的阈值效应。

不要把会话动态值复制到稳定前缀；不要为追求“看起来短”而把稳定内容压到缓存阈值以下；不要在每次请求随机调整工具顺序。

### 2.6 跨模型鲁棒性：统一语义骨架，不统一最佳字数

**论文/框架明确支持**

- MetaTool 报告工具描述改写在不同模型组上的收益方向并不一致。
- OpenAI 官方说明模型 snapshot 间 prompting behavior 会变化，建议固定版本并持续 eval。
- 厂商建议本身存在差异：OpenAI 强调初始工具集和描述精简；Anthropic 对复杂工具建议更完整的 3–4 句描述；Google 强调类型、枚举与模式控制。

**结合本项目推断**

采用“语义槽位统一、候选 Prompt 冻结”的策略：所有模型都使用同一组 `gate / family / when / avoid / contrast / exact schema` 语义槽位。主报告固定 Luna 的精确版本，只在 Luna Dev 上选候选；候选冻结后如预算允许，再用一个不同模型家族做平衡子集复核，不为第二模型重新调字数或维护独立生产 Prompt。

结果必须逐模型报告，不能把模型汇总平均掩盖某一模型 FCR 激增。至少展示：

- 相对 V0、V2、V3 的每模型绝对差值；
- 最差模型的 ECR/FCR/terminal tool accuracy 退化；
- 不同模型的最佳长度/列表规模是否一致；
- 固定模型版本、温度、并发、工具清单与 fixture 版本。

## 3. 数据触发的新候选，而不是预先必做的 V4

V0–V3 应先完成真实 Dev 配对。以下候选只有满足各自前置证据时才创建，并且每次只改变一个因子，便于归因。

### V4-L：稳定前缀布局（cache 数据触发）

- **前置证据**：cache marker 保真测试通过，且同 Variant 跨 session/space 的真实 cached tokens 或最长共同前缀显示动态绑定造成主要损失。
- **相对 V3 的唯一变化**：文字和工具集合不变，只重排为稳定内容在前、动态内容在后；列表与序列化固定；宿主支持时在稳定区末尾设置 cache breakpoint。
- **直接证据**：OpenAI/Anthropic/Google 缓存官方文档；MCP Draft 的确定性顺序建议。
- **项目推断**：当前动态块较早出现，可能降低后续稳定规则的缓存复用。
- **预期增量**：raw token 近似不变；cache read 增加、write 减少；ECR/FCR/terminal tool accuracy 应非劣。
- **接受条件**：调用主指标无显著退化，并在重复会话/租户/资源清单场景获得可复现的缓存改善。

### V4-C：决策卡规范化与“不可压缩区”

- **前置证据**：V0–V3 Dev trace 出现重复、稳定的近邻工具误选、malformed 或某一工具漏调簇，并能指向具体卡片。
- **相对 V3 的变化**：统一工具卡字段顺序；每卡只留一条最强 `when`、`avoid`，必要时一条 `contrast`；精确名称、endpoint、字段和 body skeleton 锁定；继续删除共享协议的残余重复。
- **直接证据**：Function Calling 官方文档、MetaTool、EASYTOOL、上下文压缩论文。
- **项目推断**：V2 已获得主要语义收益，V4-C 的 token 节省和选择增量可能较小。
- **预期增量**：静态 token 继续下降；近邻工具误选不增加；malformed call 不增加。
- **回退规则**：哪一类误选增加，只恢复对应 `contrast`，不恢复整段长说明。

### V4-H：hard-negative 最小对照

- **前置证据**：V2/V3 在 hard-negative 子集上仍有明显误调用，且错误不能由更精确的一条 `avoid` 解决。
- **相对 V4-C 的变化**：增加一对极短的“应调用/不应调用”对照，或只增强一个全局 no-tool 句；fixture 增加 hard negatives，但这些 fixture 不计入注入 token。
- **直接证据**：MetaTool、WTU-Eval、BFCL relevance detection；Google Research 文档优先于无文档 few-shot。
- **项目推断**：极少的对照可能帮助边界，但多例子会增加 token 并产生模型偏置。
- **预期增量**：FCR 下降，ECR 不降；若只对单模型有效或 token 性价比差则不合并。

### V4-N：家族 namespace + 延迟子工具（条件性）

- **相对 V4-C 的变化**：初始只暴露 Memory/Skill/Knowledge 三个家族与必要入口，选中后再加载子工具卡。
- **直接证据**：OpenAI/Anthropic Tool Search；MCP 动态工具；RAG-MCP/ToolRerank。
- **项目推断**：在约十几个工具的当前规模，额外检索轮可能得不偿失。
- **预期增量**：大列表场景 token 明显下降，FamilyRecall@k/ToolRecall@k 足够高，端到端 ECR/FCR/terminal tool accuracy 非劣。
- **实现边界**：没有宿主原生延迟加载时，需要新增发现工具/API，不属于仅修改 renderer 的 PR。

### V4-X：跨模型转移矩阵

- **相对最佳单模型候选的变化**：提示不改，只更换固定版本模型。
- **直接证据**：MetaTool 的模型差异、OpenAI snapshot 漂移说明。
- **项目推断**：短、中、长描述的最优点可能因模型不同。
- **接受条件**：主目标 Luna 达标；第二模型结果单列并披露退化，不参与 Luna 候选选择。本任务默认不增加模型专属 renderer profile，除非后续产品要求明确扩大范围。

## 4. 评测方法与报告模板

### 4.1 主指标采用“最短充分工具决策链”

对每个正例，Gold 定义一个或多个允许的最短决策路径。模型必须按合法顺序完成必要 discover/select/read/call，到达正确的任务特异 terminal 工具；每步 route、method、最小参数和跨步 ID/path/tool-name 传递正确，tool result 闭环，且没有 forbidden、unexpected、duplicate 或超预算调用。到 terminal 调用被契约接受即停止，不评价 terminal 返回的内容质量，也不继续评价最终回答或 coding 结果。

正式四项主数：

- `Effective Call Rate (ECR)`：正例中完成 Gold 允许的最短工具决策链的比例；
- `False Call Rate (FCR)`：no-tool 负例中出现任何 executor-bound TDAI 意图的比例，malformed 意图也算误调用；
- `Conditional Terminal Tool Accuracy`：已触发正例中，到达正确 terminal tool/action 的比例；
- `Injected Tokens / Savings`：按目标模型记录完整注入、静态模板、runtime binding 与动态资产 token，并保留整数分子分母和相对 V0/V0-C 的节省量。

同时保留诊断项：`Trigger Recall`、`Entry Family/Route@1`、`Decision Path Accuracy`、参数合法率、handoff provenance、transport contract、unexpected/duplicate call rate。首入口只用于定位“没触发、家族错还是后续选择错”，不能替代正式工具选择正确率。

确定性 mock 的 2xx 只表示请求被契约接受；由错误参数导致的 4xx 是模型失败，5xx/timeout/fixture 缺失是 infrastructure error 并单独排除。即使 terminal 返回空内容，只要决策链合法也不能因资产质量扣分。

### 4.2 为分层暴露新增中间层指标

只要加入检索或动态加载，就应记录：`FamilyRecall@k`、`ToolRecall@k`、`NoTool-Retrieval-FPR`、候选集大小、检索 token/延迟，以及 `Selection@1 | gold retrieved`。端到端 ECR 仍然是最终门槛。

### 4.3 fixture 构成

每个家族至少覆盖：

- 明确单工具正例；
- 同家族近邻工具对比；
- 跨家族关键词碰撞；
- no-tool 普通请求与 hard negative；
- 当前上下文已足够的多轮样本；
- 工具不可用/被 capability pruning 的样本；
- single-tool 与 multi-tool 意图；
- 动态 skill/resource 清单变化；
- 纯 coding、debug、解释、重构、测试等真实分布。

禁止让工具名、endpoint 或模板中的独特措辞直接泄漏进 query。若用合成样本，需人工抽检边界与标签。

### 4.4 实验控制和统计

- 固定模型完整版本/snapshot、温度、采样参数、系统提示之外的消息、工具 contract、capability、资产快照和 fixture 顺序；
- 每个 case/variant 做配对运行；若存在采样随机性，做多次重复并报告均值与置信区间；
- 对 ECR/FCR 这类配对二元结果，可用 McNemar 检验或 paired bootstrap；同时给出绝对百分点差，而非只报相对提升；
- 报告整体结果，也按 Memory/Skill/Knowledge、正例/no-tool、single/multi、seen/unseen 分层；
- 记录原始 trace、第一 action、解析错误和 prompt hash，确保失败可复盘；
- 先在主模型筛选，再冻结候选做跨模型验证，避免对所有模型反复调参导致评测泄漏。

### 4.5 缓存指标单列

除 raw input tokens 外，至少记录：最长公共前缀 token、cache read/hit tokens、cache write tokens、缓存命中率、首 token 延迟、实际输入成本、稳定块/动态块 hash。用会话 ID、用户、space、技能列表、资源列表分别变化的矩阵测试谁破坏前缀。

## 5. 风险、反证与停止条件

1. **盲目压缩风险**：Anthropic 和 MetaTool 都提示描述细节可能帮助选择。若 token 下降伴随近邻误选或 malformed 上升，应恢复判别信息，而不是继续追求最低 token。
2. **检索漏召回风险**：RAG-MCP 的大规模收益不能外推到小列表。若 `ToolRecall@k` 不足，分层方案不能上线，即使注入 token 很低。
3. **缓存阈值风险**：内容缩短到 provider 最小缓存长度以下，实际成本可能反而上升。静态 token 和缓存账单必须一起看。
4. **位置效应风险**：稳定/动态块换位可能改变模型注意力。V4-L 必须只换位置、不改文字，并以调用指标非劣为门槛。
5. **模型过拟合风险**：同一描述改写在不同模型上可能方向相反。不要用跨模型平均值掩盖单一模型 FCR 激增。
6. **动态不确定性风险**：query-aware pruning 如果没有版本、候选日志和召回指标，会让失败不可归因。确定性 capability pruning 与概率检索必须分层实现。

建议停止继续压缩的条件：任一家族 ECR 或 terminal tool accuracy 出现实质退化；FCR 上升；malformed 上升；raw token 虽下降但实际缓存成本上升；跨模型最差退化超过预先设定门槛。门槛应在看结果前写入实验计划。

### 5.1 当前明确不做

- 不用 LLMLingua 一类模型生成式压缩替换确定性 compiler：它增加额外模型、版本和不可审计改写变量，且没有证据证明能保护本项目精确 curl/JSON 契约。
- 不按 query、Gold 或历史标签动态裁剪 V3：这会让 Prompt 不再是唯一固定自变量，并把检索召回错误混入模型选择错误。
- 不为了结构整齐直接合并五个顶层块或跨 anchor 移位：先验证 marker 与 slot 合同；任何布局变更都必须是独立 Variant。
- 不把完整任务完成、资产正文质量或最终代码质量设为任务一主指标。
- 不在当前十几个工具规模下新建检索器或 meta-tool；只有工具面增长或真实选择错误支持时才进入 V4-N/R。
- 不把大量 few-shot 塞进生产 Prompt；hard negatives 主要属于数据集，极短对照只作为 Dev 消融。

## 6. 推荐实施优先级

| 优先级 | 方案 | 原因 | 是否可仅改 renderer |
|---|---|---|---|
| P0 | 最短工具决策链 scorer/计划口径统一 | 覆盖 discover 后的 terminal 选择，同时排除资产内容和最终任务质量 | Eval/文档，不改 renderer |
| P0 | `cache_control` 保真回归与真实 cache telemetry | 先确认缓存合同正确，再讨论换位收益 | Pipeline/Eval，不改 Prompt 文案 |
| P0 | 现有 V0–V3 真实 Dev 配对与 hard-negative 分层 | 当前没有正式行为数据；失败簇才是新 Prompt 的依据 | Eval，不改 renderer |
| P1 | V4-L 稳定前缀布局 | 仅在真实 cache 数据确认动态前缀损失后创建 | 大部分可以；跨 anchor/breakpoint 需谨慎 |
| P1 | V4-C 或 Skill-search 小修 | 仅在 trace 指向具体卡片时创建 | 可以 |
| P1 | V2 `gate-only` / `debias-only` 分析消融 | 仅在需要解释 V2 大幅行为变化时做，不进 Hidden | 可以，标记非正式候选 |
| P2 | V4-H 一对最小正反对照 | 只有 hard-negative 误调持续存在时再试 | 可以 |
| P2 | V4-X 第二模型冻结复验 | 预算允许时验证转移性；结果单列 | 无需改 renderer |
| P2 | V4-N/V4-R 延迟工具发现 | 大工具面证据强，但当前规模收益不确定且有漏召回风险 | 通常不可以，需要宿主/API 能力 |

综合而言，当前最合理的下一步不是立即再造 V4，也不是把所有块强行合并成一个更短的大字符串，而是先让冻结 V0–V3 产生可信行为与 cache 数据。随后才沿两条正交优化轴做最小修订：**语义轴**由真实错误簇触发，**缓存轴**由跨 session/space 的真实前缀损失触发。只有工具面明显扩大时，才引入检索式分层暴露。
