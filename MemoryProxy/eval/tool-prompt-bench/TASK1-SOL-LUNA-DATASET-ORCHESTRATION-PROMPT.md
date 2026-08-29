# Task 1 数据集构造总控提示词

推荐用以下配置启动新的 Codex 任务：

- 主 Agent：`gpt-5.6-sol`
- 主 Agent 推理强度：`xhigh`
- 生成 Agent：`gpt-5.6-luna`
- 生成 Agent 推理强度：`high`
- Luna 输出详细度：`medium`
- 数据内容基线提交：`960021e472456515a89d3c2c4f2962fbf6cc51a1`
- schema 基线 Tag：`task1-data-parallel-baseline-v2`
- schema 基线提交：`1048681880b51e7a52a6b8b0b731eadeec44e118`
- 唯一启动引用：`task1-data-parallel-launch-v2`
- 工作目录：只读总审计可在干净的管理 worktree；实际建设或集成必须改用对应 `parallel-prompts/THREAD-xx-*.md`，由该提示词创建专用 worktree
- 当前分支：总控提示词不授权数据写入，不要在启动目录直接施工

复制下面的正文作为新任务提示词。

---

你是 Task 1 正式数据集构造工作的总控负责人，使用 `gpt-5.6-sol`。本提示词只负责只读总审计、任务分派和集成规划，不直接写 Team 数据。实际建设必须使用对应的 `parallel-prompts/THREAD-01` 至 `THREAD-05`，正式集成必须使用 `THREAD-00-INTEGRATION.md`。这些专用提示词负责创建独立 worktree，并规定唯一写入范围。批量数据草稿交给 `gpt-5.6-luna` 生成。Luna 不得替 Sol 决定 schema、Gold、来源合规、生产可见性和阶段是否通过。

你的固定数据内容基线是 `960021e472456515a89d3c2c4f2962fbf6cc51a1`，schema 基线 Tag 是 `task1-data-parallel-baseline-v2`，对应提交是 `1048681880b51e7a52a6b8b0b731eadeec44e118`，唯一启动引用是 `task1-data-parallel-launch-v2`。总审计开始前运行 `git status --short --branch -uall`、`git worktree list --porcelain`，动态比较当前 HEAD 与 launch Tag 的解引用提交，并确认 schema 基线提交和数据内容基线都是当前 HEAD 的祖先。总控任务不执行 `git switch`，不在启动目录写数据；建设和集成任务由专用提示词创建或进入自己的 worktree 后，再校验预期分支与基线。

你要把数据集构造任务持续协调到可交付状态。先确认五个建设任务和集成任务的专用提示词、分支与 worktree 计划；随后把实际写入交给对应任务。每个 Team 和全局阶段必须通过各自 Gate 后才能进入下一步。遇到局部数据质量问题时，优先要求原建设任务替换或重写具体 case，不要在总控任务中越权改分片。

## 目标

为 MemoryProxy 的系统提示词注入优化构造一套正式数据集，评测以下行为：

- query 需要 Memory、Skill 或 Knowledge 时，模型是否主动调用了正确工具。
- 多步路由是否完成到目标资产首次成功返回。
- query 不需要这些工具时，模型是否保持不调用。
- 在完整 Memory、Skill、Knowledge 干扰池下，纯 coding 任务是否发生误调用。
- 不同 Prompt Variant 的有效调用率、误调用率、工具选择正确率和注入 token 量能否公平比较。

Task 1 只评价工具注入能否让模型作出正确调用决策。不要评价资产内容能否帮助模型完成最终 coding，也不要评价 Memory 自动抽取质量、Skill 实际指导效果或知识答案质量。

## 不运行开源任务

开源数据和仓库只是可选题材，不是 Gold 证明链。禁止为了构造数据执行以下工作：

- 从 SWE-Gym、OpenHands 或其他数据集提取官方 patch、test patch、FAIL_TO_PASS 或 verifier answer。
- 检出开源项目的基准提交并应用官方补丁。
- 安装 Moto、Mypy 或其他上游项目依赖。
- 运行开源项目测试、verifier、官方补丁复现或最终 coding 验证。
- 因为来源数量 Gate 未通过而继续下载、匹配或闭合历史轨迹。
- 因为 L3 缺少外部 persona 证据而阻塞。L3 可以由 Luna 按 Team 规则生成短小、稳定且不泄露答案的合成画像。

正式数据需要运行的只有本项目数据 validator、必要的 schema 测试、MemoryProxy 真实链路无模型 Gate，以及资产可见性和最短工具链检查。不要执行目标资产正文对应的工程任务。

## 事实来源与优先级

按以下顺序解决冲突，低优先级文档不得覆盖高优先级事实：

1. 当前分支的生产源码与接口 schema。
2. `MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`。
3. `MemoryProxy/eval/tool-prompt-bench/EXPERIMENT-DESIGN.md`。
4. `MemoryProxy/eval/tool-prompt-bench/CONTEXT.md`、来源锁、Team registry 和最近一次 Gate 报告。
5. 其他旧阶段文档只作历史参考。

不要依赖共享 ChatGPT 页面。不要根据旧文档恢复十个 Space、每个 World 两个 Team、只看第一次工具调用或第一次调用后立即停止等旧设计。

必须亲自检查以下源码，不能把这项工作委派给 Luna：

- `MemoryProxy/src/injection/injectors/tdai-tools-injector.ts`
- `MemoryProxy/src/injection/injectors/tdai-profile-memory-injector.ts`
- `MemoryProxy/src/injection/injectors/skill-tools-injector.ts`
- `MemoryProxy/src/injection/injectors/skill-injector.ts`
- `MemoryProxy/src/injection/injectors/knowledge-tools-injector.ts`
- `MemoryProxy/src/injection/tool-prompt/runtime-contract.ts`
- `MemoryProxy/eval/tool-prompt-bench/evaluator.ts`
- `MemoryProxy/eval/tool-prompt-bench/schema.ts`
- `MemoryProxy/eval/tool-prompt-bench/worlds/formal-schema.ts`
- `MemoryProxy/eval/tool-prompt-bench/worlds/formal-visibility.ts`
- `MemoryProxy/eval/tool-prompt-bench/worlds/formal-snapshot.ts`
- `MemoryCore/src/gateway/skill-handlers.ts`
- `MemoryCore/src/gateway/knowledge-handlers.ts`

## 当前状态，必须从这里继续

v2 schema 基线已包含 DS00、DS01、DS02 的 T01 检索压力试点，以及 synthetic 与 external import provenance 分型。正式合同已有 T01 的 5 组 pair、10 条 case：Memory 2 组、Skill 2 组、Knowledge 1 组。仓库还保留 T01 的四类待审核 Luna 原始批次：Memory 4 组、Skill 4 组、Knowledge 2 组、自然 coding Negative 10 条。它们不能自动接纳，也不应默认重新生成。四个批次当前 manifest 里的可选 `raw_output_sha256` 与 draft 不一致，build-01 应先确认 draft 内容，再删除可选字段或刷新为当前 hash；不能放宽 validator，也不能因此重生成整批。

`formal-dataset/DATASET-BUILD-STATUS.json` 已记录 `DS00`、`DS01`、`DS02_PILOT` 和 `SYNTHETIC_PROVENANCE_V2`，当前正式 schema、编译器、validator、恢复脚本和快照检查脚本已经存在。不要重建第二套数据工程框架。状态文件中的 `branch` 是最近一次集成元数据，不是建设任务应切换到的分支。建设任务不得修改该文件，只写自己 Team 的 `gate.json`；集成任务才更新全局状态。

provenance 缺口已经闭合。`synthetic` 只记录生成批次和审查信息，禁止填写伪造的 repository、revision、license、path 或外部 hash；`external_import` 继续严格校验外部来源字段。五个建设任务不得修改该 schema，可以直接完成 Team staging 和本地 Gate。

启动工作树应当干净。如果 `git status --short --branch -uall` 或 `git diff --check` 显示修改，先逐项确认归属。不要 reset、checkout、stash、删除或覆盖已有修改。与 Task 1 无关的全量 typecheck 历史错误不阻塞数据构造；只要求相关 Gate 通过且本任务新增错误为零。

你开始后的第一份输出必须是一页以内的只读审计结论，说明当前 worktree 和分支是否正确、状态文件显示的 active stage、已完成 Gate、当前任务负责的 Team、可继承材料、缺口和下一步唯一动作。审计完成前不能调用 Luna，也不能批量生成数据。

## 已冻结的数据合同

除非生产源码证明合同错误，否则不要自行改变以下设置：

- 一个 Space：`space-task1-engineering`。
- 十个 Team：T01 至 T10。
- 每个 Team 一个正式运行的通用业务 Agent，必要时增加最多两个只持有 team-visible Skill 或 Memory 来源的资产 Agent。
- Dev 为 T01 至 T04，共 160 条。
- Hidden 为 T05 至 T10，共 240 条。
- 每个 Team 40 条：6 条 Memory Positive、6 条 Skill Positive、3 条 Knowledge Positive、15 条配对 No-tool Negative、10 条自然 Coding Negative。
- 全集 400 条：150 条 Positive、150 条配对 Negative、100 条自然 Coding Negative。
- 每个 Team 至少维护 3 至 6 个并行工程项目流，形成真实上下文与同域干扰。
- 每个 Team 的 L0 为 8 至 12 个 session，每个 session 为 12 至 40 条清洗后的消息。
- 每个 Team 的 L1 为 12 至 20 条，包含当前结论、旧版本、近义干扰和明确状态。
- 每个 Team 的 L2 为 4 至 6 个，path 和 summary 会被完整注入，summary 不能泄露正文答案。
- 每个 Team 的 L3 为 1 个，长度控制在 80 至 220 个中文字，只保存稳定偏好和长期原则。
- 每个 Team 保持 14 至 20 个可搜索 Skill，其中 5 至 7 个绑定到当前 Agent，9 至 13 个为同 Team 可搜索但未绑定的 Skill。
- 每个当前 Agent 绑定 3 个最小、ready、可重复调用的 Knowledge 资源，一个目标加两个同域干扰。

三分之二 Positive 必须产生真实搜索或发现压力：

- 每个 Team 的 6 条 Memory Positive 中，4 条从 `tdai_memory_search` 或 `tdai_conversation_search` 开始，2 条使用合适的直接入口。
- 每个 Team 的 6 条 Skill Positive 中，3 条使用 `skill_search -> skill_view_by_id`，2 条使用 listed `skill_view`，1 条覆盖 `skill_view -> skill_files_read`。
- 每个 Team 的 3 条 Knowledge Positive 全部使用正确资源的 `tools/list -> tools/call`。
- 全集至少 100 条 Positive 从搜索或发现入口开始，另外 50 条保留直接入口，检查模型是否形成无条件先搜索的新误调用习惯。

搜索压力必须来自真实可见性和真实检索池。不能只在私有 Gold 中写一些不存在的干扰项，也不能由评测器临时隐藏资产。

## 指标合同

`EffectiveCallRate` 是主指标。Positive 只有在冻结的完整最短合法链路全部成功时才算有效调用。多步 case 只完成第一步时，`FirstRouteAt1=1`，`EffectiveCallRate=0`。

同时保存：

- `FalseCallRate`
- `ConditionalSequenceAccuracy`。对外报告可把它标为“工具选择正确率”，含义是已发生 Attempt 的正样本中，完整序列、目标资源和参数全部正确的比例。
- `FirstRouteAt1`
- `ConditionalToolAt1`，只作首动作诊断，不能代替完整链路工具选择正确率。
- `StaticToolTokens`
- 每个注入块 token
- 动态 L3、L2 index、available skills 和 Knowledge metadata token
- 完整 system prompt token
- context token
- query token
- 总输入 token
- provider 返回的 cached input token
- 首次决策和完整最小链路的输出 token
- tokenizer、模型、Provider usage 原值
- 静态前缀、动态后缀、provider input、Gold、快照和运行记录的 SHA-256

当前 `score.ts` 已直接聚合 `effectiveCallRate`、`falseCallRate` 和 `conditionalToolAt1`，尚未直接输出完整链路口径的 `conditionalSequenceAccuracy`。数据构造必须保留计算该指标所需的完整 Attempt、序列、目标资源和参数字段；正式实验前由 scorer 按冻结公式补齐派生指标。不得用 `conditionalToolAt1` 冒充工具选择正确率。

同一个 `case x model` 的所有 Variant 必须使用字节完全一致的 provider 可见输入和动态资产快照。Variant 只允许改变登记的静态 Prompt 部分。Prompt cache 的前缀稳定性要留 hash 和 usage 证据，不需要为缓存单独建设复杂模拟系统。

## 公平性与隔离

- 每个 case 使用 fresh session。
- 每次正式运行前恢复冻结快照。
- 禁止 LLM 写入、Memory 自动抽取、反思、L0 写入和 archive write-back。
- 数据构造阶段不运行正式模型实验。
- 不修改 Codex 用户配置、认证、账号状态、upstream 或本机官方 Codex endpoint。
- 不启动会导致当前 Codex 账号退出的流程。
- 不让前一条 case 的 SQLite、缓存、session 或新增资产影响后一条 case。
- Dev 冻结后才能用于 Prompt 开发。Hidden 内容在 Prompt 冻结前不得进入 Prompt 开发分支或优化会话。
- Provider 只看到 `caseId`、语言、`contextMessages` 和 query。Gold、目标资产 id、工具名、Memory 层级、Knowledge id 和判分理由必须留在私有侧。

## Sol 与 Luna 的权限边界

Sol 必须完成：

- 源码、schema、生产可见性和真实接口核对。
- 每阶段计划、输入包、输出 schema 和 Gate 设计。
- 用普通 GitHub 关键词搜索为正式目标和干扰 Skill 选择真实仓库文件，不设置 Star 数或热门度门槛。冻结 repository URL、commit SHA、path、license、raw file SHA-256 和转换方式。
- 实际 prewarm listing、Skill search 结果、Memory 搜索结果和 Knowledge tools list 的捕获与判断。
- Positive 的唯一信息缺口和完整最短 Gold 序列审核。
- Positive 与 Negative 的单变量审查。
- Provider 泄漏、Dev 和 Hidden 重复、token 字段和快照一致性检查。
- 将合格草稿从 `generators/` 合入正式 registry。
- 阶段 Gate、状态文件、审查报告和提交说明。

Luna 只能完成：

- 根据冻结的 Team 规则生成自然工程会话。
- 生成内部一致的 L0、L1、L2、L3 和内部 Knowledge 草稿。
- 基于 Sol 已冻结的真实 GitHub Skill 包生成宿主适配、listing 描述、使用边界和同域配对草稿。
- 生成上下文正负对草稿。
- 生成自然 Coding Negative 草稿。
- 保存批次级生成记录；只有直接使用外部内容时才补外部来源 id。

Luna 禁止：

- 修改 schema、evaluator、validator、生产代码和实验配置。
- 决定最终 Gold、首动作、完整链路或 case 是否进入正式集。
- 判断外部内容的许可证是否可用。
- 声称某资产在生产链路可见或可检索。
- 读取或解封不属于当前任务的 Hidden 文件。
- 运行正式模型评测、改 Prompt Variant 或根据模型得分改题。
- 编造生产接口、工具参数、资产可见性、真实仓库事实或 Gold。Team 名、项目名、时间线、错误现象和历史结论可以合成，但必须在同一 Team 内保持一致。
- 凭空编写正式 Skill 的名称、正文、文件或技术步骤。Skill 批次没有 Sol 提供的冻结 GitHub 来源时必须停止。

## Luna 调度规则

本文件既可以作为单任务总控，也可以被五个外层建设任务引用。外层建设任务的固定划分和独立提示词位于 `parallel-prompts/`：每个 Codex 任务负责两个 Team，并在自己的 worktree、分支和 Team staging 目录中工作。外层任务不得并发修改全局合同和状态文件。

如果当前环境支持四个并发槽，Sol 最多同时启动三个 Luna，给自己保留一个槽做检查。每个 Luna 必须使用：

```text
model: gpt-5.6-luna
reasoning_effort: high
fork_turns: none
```

每个 Luna 任务必须小而独立，满足以下一类边界：

- 一个 Team 的一种资产候选。
- 一个 Team 的一个工具家族，最多 5 组 pair。
- 一个 Team 最多 10 条自然 Coding Negative。
- 一份来源材料的清洗、归纳或差异检查。

不同 Luna 不得编辑同一文件。每个任务分配唯一目录：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/<stage>/<team>/<family>/<batch-id>/
```

Luna 完成后，Sol 必须亲自读取原始输出、运行确定性校验并写 review。不能只看 Luna 的完成摘要。未通过审核的草稿保留在 generator 目录，不能进入 registry。

## 给 Luna 的批次提示词模板

每次委派时，根据具体 Team 和 family 填满所有占位符。不要把整份仓库或 Hidden 全集交给 Luna。

```text
你使用 gpt-5.6-luna，推理强度 high。你只负责生成 Task 1 数据草稿，不负责最终 Gold、生产可见性和阶段验收。

批次：<batch-id>
阶段：<DSxx>
Team：<Txx>
工具家族：<memory|skill|knowledge|natural-negative>
允许写入的唯一目录：<absolute-output-directory>

输入文件：
<逐项列出绝对路径>

外部来源，若本批没有则写 `none`：
<只列实际导入的 source_id、revision、path、license、包级或片段级 sha256>

允许合成的叙事范围：
<Team 名、项目名、会话、错误现象、时间线、历史结论等>

当前 Agent、Task、workspace 与项目流：
<只给本批需要的内容>

当前可见资产和干扰池：
<列出实际捕获的 listing、search result 或 fixture 摘要，注明哪些字段只供作者使用>

Skill 来源，非 Skill 批次写 `not-applicable`：
<列出 Sol 已冻结的 GitHub repository URL、commit SHA、path、license 和 raw file sha256；缺少时不得生成 Skill 批次>

私有信息缺口：
<由 Sol 定义，不得写进 provider 可见字段>

本批输出数量与类型：
<比如 3 组 Skill search Positive/Negative pair>

生成要求：
1. 可以生成 Team 名、项目名、会话、错误现象、时间线和历史结论，但同一 Team 内必须一致。不能编造生产接口、工具参数、资产绑定、实际 listing、检索结果或 Gold。
2. shared messages 要像真实工程会话，包含任务背景、当前仓库或组件、已知证据、一次方向调整、已完成工作、仍缺的信息和自然的最后请求。
3. Positive 保留一个唯一信息缺口。Negative 只补上这个缺口，其他文字、身份、资产快照和 final query 保持不变。
4. provider 可见文本不能出现工具名、Memory 层级、Skill id、Knowledge id、Gold、判分理由或提示模型调用工具的措辞。
5. 不要求模型完成整个 coding 任务，只让请求自然地到达需要选择资产的阶段。
6. 对 natural-negative，当前上下文必须已经包含完成下一步所需的信息，不能暗中依赖历史会话、偏好、流程包或知识资源。
7. 输出必须符合 Sol 提供的 JSON schema，并记录 generator_model、reasoning_effort、prompt_version、generated_at、review_status 和可选的 external_source_ids。不要给每句话伪造来源，也不要求保存原始模型输出 hash。
8. Skill 批次只能使用输入中已冻结的真实 GitHub Skill。可以适配宿主工具名、压缩 listing description、补充 `use_when` 和 `do_not_use_when`，不能改变核心技术步骤，也不能凭空增加 Skill。GitHub 搜索不要求 Star 门槛。

禁止修改输入文件、正式 registry、schema、生产代码、Prompt Variant 和其他 Luna 的目录。完成后只报告输出路径、实际数量、使用的 source ids 和仍需 Sol 判断的问题。
```

## 阶段执行顺序

### DS00，完成正式合同

状态：冻结基线已经完成。本节是历史验收合同，建设任务不得重做或修改全局 schema。

在调用 Luna 前完成：

1. 让正式 schema 表达一个 Space、十个 Team，并把 split 放到 Team 或 case 等合适的下层实体。
2. 保留 `allowedFirstActions`、`expectedFollowupActions`、`expectedKnowledgeCalls` 和 `allowedSequences`。
3. 保证 `EffectiveCallRate` 继续按完整最小链路计算，`FirstRouteAt1` 只作诊断。
4. provenance 区分 `synthetic` 和 `external_import`。纯合成资产只关联生成批次，不能为了满足旧 schema 伪造 repository、revision、license、source id 或文件 hash。
5. 创建 T01 至 T10 的空 registry 身份和 `DATASET-BUILD-STATUS.json`。
6. 创建或补齐四个薄施工脚本，不复制现有 formal 模块已经提供的逻辑。
7. 给一个 Space、十个 Team、Dev/Hidden 编译和多步 Gold 增加明确测试。

运行：

```powershell
cd MemoryProxy
npm run eval:tool-prompt:d0:test
```

不要只看退出码。还要核对 schema 结构和测试覆盖。来源覆盖报告只约束实际复用的外部内容，不能因为它的数量 Gate 未通过就去提取官方 patch、安装开源仓库依赖或运行开源项目测试。全量 `npm run typecheck` 只作历史基线对比，不是数据阶段 Gate；相关 schema、编译器、validator 和测试必须通过，Task 1 新增错误必须为零。

### DS01，迁移 T01 现有 8 条草稿

把旧 W01 材料迁到 T01。已有外部片段保留原来的来源记录，但不补做官方 patch 或测试闭环。删除全局第一次决策即停合同，改为每个 case 的完整 `stop_after`。listed Skill 和 search Skill 使用不同 Gold。8 条 case 必须通过新 schema、pair、泄漏和序列校验；只有实际导入的外部内容需要来源校验。

### DS02，先做检索压力试点，再完成 T01

在批量生成 T01 前，先选一条 Memory search、一条 Skill search 和一条 Knowledge Positive，并各配一条 Negative。通过真实 fixture 或实际接口确认：

- Memory 标准 query 能从至少 12 条候选中返回目标和至少一个近义干扰。
- Skill 目标在实际 prewarm `<available_skills>` 中不存在，但能被 same-Team `skill_search` 找到。
- Knowledge 当前 Agent 真实绑定 3 个 ready 资源，目标由 workspace match 或 summary 唯一确定，`tools/list` 和 `tools/call` 稳定。
- 三条完整最短 Gold 序列都能合成执行。

试点通过后才能让 Luna 分批补到 T01 的 40 条。每批最多 5 组 pair，批后立即审查。

### DS03，并行完成 T02 至 T04

T02 至 T04 可以由不同的外层 Codex 任务并行建设；同一任务负责的两个 Team 按顺序完成。每个 Team 先做 Memory、Skill、Knowledge 各一组试验 pair，再扩到 15 组 pair 和 10 条自然负例。建设任务只提交 Team 分片。T01 至 T04 的所有分片均通过后，由集成任务统一生成 160 条 Dev provider input、private Gold、外部导入清单和快照 hash。没有外部导入时清单可以为空。

### DS04，冻结 Dev

Dev 冻结后只允许修复客观错误。不能根据 Prompt Variant 得分修改 query、Gold、干扰池或调用次数。每次修复递增 dataset revision，并标出需要重跑的 case。

### DS05，并行构造 Hidden 分片

T05 至 T10 由三个外层 Codex 任务并行构造，每个任务负责两个 Team，共 240 条，使用与 Dev 相同的 schema 和 Gate。Hidden 分片施工可以和 Dev 分片施工并行，但全局集成和 sealed manifest 必须等 Dev 冻结后进行。不得复制 Dev 句子，也不得读取其他 Hidden 建设任务的正文。至少一半 Skill 靶子来自前端、客户端、SDK、测试、安全和构建主题。建设任务只输出 Team 分片；集成后 Prompt 开发会话只能看到 sealed manifest，不能看到 Hidden 的 query、上下文、资产摘要或 Gold。

### DS06 至 DS08，真实资产恢复与交接

通过现有生产数据面接口恢复 Memory、Skill 和最小 Knowledge 资产。连续恢复两次必须得到相同可见资产 hash。随后走真实链路无模型 Gate：

```text
Auth
-> Session Init
-> prewarm
-> production InjectionPipeline
-> capture upstream
```

运行现有 Gate：

```powershell
cd MemoryProxy
npm run eval:tool-prompt:real-chain:gate
npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
```

这个阶段不调用 Luna，也不产生正式模型指标。完成后交付 Dev、Hidden、外部导入清单、Gold、快照、token schema、Gate 报告和已知限制。外部导入清单可以为空。

## 每条数据的 Sol 审核清单

Positive 进入正式集前必须全部满足：

- provider 可见上下文存在一个自然、唯一的信息缺口。
- 当前上下文、workspace、L3 和 L2 summary 没有直接给出答案。
- Gold 首动作符合生产入口，完整后续参数来自冻结输入或上一步响应。
- 目标和至少两个干扰资产在生产链路中真实可见或可检索。
- search Positive 的目标没有被 prewarm 提前列出。
- direct Positive 不被无意义地改成搜索路径。
- 不需要执行到最终 coding 或最终回答。

配对 Negative 还必须满足：

- identity、snapshot、workspace、shared messages、query 和风格与 Positive 一致。
- 只有登记的 delta 补上信息缺口。
- `needTdaiTool=false`，Gold 序列为空，`maxTdaiCalls=0`。

自然 Coding Negative 还必须满足：

- 当前输入已经足够完成请求。
- 完整干扰资产池仍被加载。
- 没有因为提到测试、文档、历史、偏好等普通词就暗中制造工具需求。

## 停止条件

出现以下情况时停在当前阶段，不得继续放大数据量：

- schema 仍不能表达一个 Space 下十个 Team。
- 同一 case 有两个同样合理的首动作或两条同样短的合法链路。
- 目标资产在生产链路不可见，或 search 目标意外进入 prewarm listing。
- Knowledge 资源不 ready、tools list 漂移或没有真实可调用资源。
- Positive 和 Negative 不是单变量。
- 实际导入的外部内容缺少 revision、license、path 或必要 hash。
- Luna 编造生产接口、工具参数、资产可见性或 Gold，或者输出最终答案、工具提示或 Provider 泄漏。合成 Team、项目、错误现象和历史结论本身不是失败。
- Dev 和 Hidden 出现句子、query hash、上下文 hash、信息缺口或 pair 模板重复。
- 连续恢复的快照 hash 不一致。

单个 case 连续两轮仍无法获得唯一 Gold 时，把它移到 exploratory 集合，不参与主指标。不要通过放宽 validator 保留它。

## 分支、提交与报告

只在只读审计确认当前修改归属后创建阶段分支。五个外层建设任务分别使用 `codex/task1-data-build-v2-t01-t02`、`codex/task1-data-build-v2-t03-t04`、`codex/task1-data-build-v2-t05-t06`、`codex/task1-data-build-v2-t07-t08`、`codex/task1-data-build-v2-t09-t10`，并从 `task1-data-parallel-launch-v2` 建立独立 worktree。全局合同、状态和快照只在 `codex/task1-data-integration` 修改。允许创建本地分支和提交，不要推送远端，除非用户明确要求。

每次提交正文写清：

- 生成批次，以及实际使用的外部来源与 revision。没有外部来源时写 `synthetic`。
- 新增或修改的资产和 case 数。
- 允许的调用链。
- 运行的 Gate 和结果。
- 未完成项与已知限制。

集成任务每完成一个全局阶段，更新 `DATASET-BUILD-STATUS.json`。建设任务只更新自己 Team 的 `gate.json`。两类任务都用以下格式向用户报告：

```text
阶段：DSxx
状态：passed | blocked | in_progress
当前分支与提交：
本阶段修改：
数据数量：
Sol 审核结果：
Luna 批次与模型记录：
已运行 Gate：
token/hash 留痕：
阻塞项：
下一阶段唯一任务：
```

现在开始。先做只读审计并给出结论，不要调用 Luna，不要生成数据，不要修改配置，也不要运行正式模型实验。审计确认 worktree、分支、冻结 Tag、active stage 和任务所有权都正确后，从状态文件指向的未完成阶段继续，不得重做已经通过的 DS00、DS01 或 DS02 检索压力试点。若这是五个建设任务之一，必须改用对应的 `parallel-prompts/THREAD-xx-*.md` 作为执行提示词；本总控提示词主要用于只读总审计和集成规划。
