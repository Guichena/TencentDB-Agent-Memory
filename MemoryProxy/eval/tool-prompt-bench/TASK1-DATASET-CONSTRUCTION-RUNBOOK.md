# Task 1 正式数据集构造与验收手册

状态：执行版 1.3

修订说明：本手册主体记录 `formal-v1` 的 16-Team 构造合同，已经冻结的 `formal-v1.1` 不回写。T17 至 T20 以 `task1-data-parallel-launch-20team-v1` 为启动点追加为 `formal-v2`：Dev 增加 T17、T18，Hidden 增加 T19、T20，全集为 20 Team、800 case、300 pair。增量集成命令、产物路径和 Gate 见 `parallel-prompts/FORMAL-V2-INTEGRATION.md`；后续运行必须显式携带 dataset revision，不能把 formal-v1 与 formal-v2 分数直接混合。

适用启动基线：阶段 A 已完成。schema 基线 Tag `task1-data-parallel-baseline-v2` 解引用到 `1048681880b51e7a52a6b8b0b731eadeec44e118`，数据内容祖先为 `960021e472456515a89d3c2c4f2962fbf6cc51a1`。build-01 至 build-05 已从 `task1-data-parallel-launch-v2` 启动；build-06 至 build-08 从包含 T11 至 T16 注册信息和三份新提示词的 `task1-data-parallel-launch-16team-v1` 启动。两个启动点共享相同 schema 和内容祖先，八个任务完成后一次性集成。

适用任务：Proxy 系统提示词注入优化

本文件规定正式数据集如何从来源材料、真实 TDAI 资产和会话上下文构造出来，也规定每个阶段的输入、输出、命令、验收条件和停止条件。后续执行 Agent 应按阶段推进，当前阶段未通过 Gate 时不得开始下一阶段。

## 最终要交付什么

数据工作完成时，仓库中应有一套可恢复、可审计、可供真实 MemoryProxy 链路重复运行的数据。它应支持回答以下问题：

- 需要 Memory、Skill 或 Knowledge 时，模型是否主动发起了 TDAI 调用。
- 模型决定调用后，是否选对工具家族、具体入口和目标资产。
- 入口需要连续调用时，模型是否完成了获取目标资产所需的最短合法链路。
- 当前上下文或 L3 已经足够时，模型是否保持不调用。
- 纯 coding 任务中，Memory、Skill 和 Knowledge 的注入是否造成误调用。
- 每个 Prompt Variant 注入了多少静态工具说明 token、动态资产 token 和总 token。
- 相同 case 在不同 Variant 下是否使用了完全相同的模型输入、资产快照和运行配置。

正式交付物包括：

1. 一个 Space、十六个 Team 和六百四十个 case 的冻结定义。
2. Dev 240 case 与 Hidden 400 case 两份互斥快照。
3. Memory、Skill 和最小 Knowledge 路由资产的定义、导入记录与恢复脚本。只有实际导入的外部 Skill 或原文片段需要来源和许可证记录。
4. 每个 case 的公开输入、私有 Gold、允许序列和配对关系。
5. 数据验证报告、真实链路无模型 Gate 报告和最终冻结 manifest。
6. 后续实验所需的 token、Prompt hash、快照 hash 和 Provider usage 字段合同。
7. 搜索压力清单，证明目标资产没有全部出现在第一层注入中，并记录每个搜索入口的目标与干扰结果。

## 任务边界

这套数据只评价注入内容能否让模型在合适时机识别并调用正确的工具。它不评价：

- Memory 自动抽取质量。
- Skill 内容能否指导模型完成整个工程任务。
- Knowledge 返回内容是否足够回答问题。
- 最终代码、测试、浏览器操作或数据库操作是否成功。
- Agent 的最终自然语言答案质量。
- Team ACL 和跨 Team 隔离能力。
- Wiki 页面质量、CodeGraph 完整度或索引召回率。

workspace 和开源任务可以用来提供自然的工程题材，但不是正式数据的必要来源。Gold 是否唯一只根据当前上下文、冻结资产池、生产可见性和工具协议判断。不要提取或应用开源任务的官方 patch，不安装其依赖，不运行其测试或 verifier。正式运行也不继续执行 coding。

模型一旦完成目标资产所需的最短合法 TDAI 链路，runner 就结束本 case。No-tool case 在模型给出第一个非 TDAI 实质响应，或出现任意 TDAI Attempt 后结束。

## 现状与本文件的优先级

当前仓库已经有 Pilot 数据、正式 World V2 合同、来源锁、W01 历史材料、开源 Skill 候选和第一批上下文正负对。它们不是从零开始的理由，也不能原样当作正式数据。

当前可复用材料：

- `source-locks/w01-w03/source-lock.yaml` 已冻结 SWE-Gym 和 OpenHands-SFT 来源。
- `source-locks/open-skills/target-candidates.json` 已记录开源 Skill 候选。
- `formal-worlds/W01/drafts/l0-sessions.json` 已有清洗后的 Mypy 历史会话。
- `formal-worlds/W01/drafts/w01-b-fuzzing-context-pairs.json` 已有四组正负对、八个 case 的草稿。
- `worlds/formal-schema.ts`、`formal-visibility.ts`、`formal-snapshot.ts`、`formal-provenance.ts` 已有正式数据的类型、可见性、快照和来源基础设施。
- `evaluator.ts` 已能分别检查首动作、后续动作、完整序列、请求参数、真实执行和过度调用。

以下旧假设从本文件生效后停止扩展：

- 不再建设十个 Space、每个 Space 两个 Team。
- 不再为了凑资产密度建设大量 L1、L2、Wiki 或 CodeGraph。
- 不再把全部多步 case 简化成第一次调用后停止。
- 不再要求一个 Team 的所有 Skill 都从历史会话中提炼。
- 不再执行完整工程任务来证明一个 case 有资格进入 Task 1。

发生冲突时，数据执行顺序如下：

1. Task 1 原始目标和交付指标。
2. 当前生产源码中的工具协议和注入行为。
3. 本文件。
4. `EXPERIMENT-DESIGN.md` 中不与本文件冲突的公平性、token 和运行协议。
5. 旧的十 Space World 文档和 D0 至 D5 文件。

旧文件暂时保留作来源与设计记录。它们的数量、Space 和第一调用停止假设不能继续作为正式施工依据。

## 源码规定了哪些资产必须存在

### Memory 分层

生产源码把 Memory 分为四层，各层对 Task 1 的作用不同。

| 层级 | 是否直接注入 | 相关入口 | 数据集用途 |
|---|---|---|---|
| L0 原始对话 | 否 | `tdai_conversation_search`、`tdai_conversation_query` | 精确原话、具体时间线、已知 session 的顺序读取 |
| L1 原子记忆 | 否 | `tdai_memory_search`、`tdai_atomic_query` | 偏好、约定、历史结论、按类型或时间筛选 |
| L2 场景 | 只注入 path 与 summary | `tdai_read_scene`、`tdai_scenario_ls` | 已知 path 直接读，或先列索引再读正文 |
| L3 长期画像 | 全文注入 `<l3_core_memory>` | 无 | 检查答案已在 system 中时是否保持 No Tool，也参与动态 token 测量 |

L0 和 L1 必须真实存在，否则无法测试六个 Memory 入口中的前四个。L2 只在确实需要覆盖 scene 路由时构造。L3 保持短小，但不能省略，因为它会直接改变 system prompt，也会形成重要的 No-tool 边界。

### Skill 可见性与协议

每个 Team 使用一个通用业务 Agent。当前 Agent 的已绑定 Skill 会出现在 `<available_skills>`。同 Team、team-visible 但未绑定的 Skill 可通过 `skill_search` 找到。

正式数据应覆盖三类最短链路：

| 场景 | 最短合法链路 | 停止点 |
|---|---|---|
| 目标 Skill 已列出 | `skill_view` | 成功返回 SKILL.md 与 manifest |
| 目标 Skill 未列出但可在 Team 搜到 | `skill_search -> skill_view_by_id` | 成功返回目标 Skill |
| 任务明确需要 Skill 资源文件 | `skill_view -> skill_files_read` | 成功返回指定资源文件 |

第三类只占少量压力样本。Task 1 不继续执行资源文件中的脚本，也不检查脚本能否完成工程任务。

### Knowledge 是两步自发现协议

`knowledge-tools-injector.ts` 注入的是已绑定 Knowledge 资源元数据，以及 `tools/list -> tools/call` 的自发现协议。首次使用某个资源时，模型必须先拿工具清单，再按返回的 `tool_name` 和参数调用。

正式 Knowledge Positive 至少执行：

```text
tools/list(knowledge_id)
  -> tools/call(knowledge_id, discovered_tool_name, params)
```

到第一个成功的查询或探索调用后停止。不继续读取完整页面，不评价查询结果是否足以完成用户任务。

Task 1 仍然要求覆盖 Knowledge，所以不能只放空的 `<knowledge_tools>`。同时没有必要建设完整 Wiki 或 CodeGraph。每个当前 Agent 固定绑定三个稳定、ready、工具列表可重复的最小 Knowledge 资源，形成一个目标资源和两个同域或错仓库干扰资源。优先复用当前系统已有的 ready 资源；只有没有可复用资源时，才导入轻量的 benchmark-owned 资源。正式评分只检查资源选择、`tools/list`、`tools/call` 和参数，不检查知识资产质量。

若真实环境最终无法提供任何稳定 Knowledge 资源，必须删除 Knowledge Positive，并在报告中明确说明只测到了 Knowledge 的误调用面。此时不能声称完成了原任务中的 Knowledge 有效调用率。

## 有效调用按最小链路成功计算

连环调用不能忽略，也不能继续执行到最终 coding。正式主指标走到第一个承载目标资产的成功响应为止。这个边界把 Skill 搜索后未打开、Knowledge 只列工具但没有查询、scene 只列路径但没有读取都判为未完成，同时不评价资产正文和最终答案。

`EffectiveCallRate` 统计全部正样本中，模型是否按顺序完成了冻结的最短合法链路。每一步都必须满足：

- 工具、endpoint 和 HTTP method 正确。
- `knowledge_id`、Skill id、scene path、session id 等资源参数来自冻结输入或上一步响应。
- 必需请求头存在。
- 服务返回 2xx，且不是基础设施错误。
- 调用次数不超过 `maxTdaiCalls`。

单步 case 的最小链路只有一个动作，所以一次正确、成功的调用就算有效。多步 case 必须完成全部登记动作。首路由正确但后续未完成时，`FirstRouteAt1=1`、`EffectiveCallRate=0`。

### 主指标

- `EffectiveCallRate`：正样本中完整最小链路执行成功的比例。
- `FalseCallRate`：No-tool 样本中出现任意 TDAI Attempt 的比例。
- `ConditionalSequenceAccuracy`：已经发生 Attempt 的正样本中，完整工具序列、目标资源和参数均正确的比例。服务 5xx 等基础设施错误不改变选型判断。
- `StaticToolTokens`：静态注入的工具描述 token。

### 诊断指标

- `TriggerRecall`：正样本中出现任意 TDAI Attempt 的比例。
- `FirstRouteAt1`：正样本的首个家族、入口和目标资源是否正确。
- `ConditionalToolAt1`：已经发生 Attempt 的正样本中，首动作选对的比例。
- `ChainDropoffByStep`：多步链路在哪一步中断或选错。
- `MalformedAttemptRate`、`OvercallRate` 和基础设施错误数。

首动作指标用于解释主指标，不参与“有效调用成功”的判定。这样可以分清没有触发、第一步选错、链路中断和执行失败。

当前 `score.ts` 已直接聚合 `effectiveCallRate`、`falseCallRate` 和 `conditionalToolAt1`，但尚未直接输出完整链路口径的 `conditionalSequenceAccuracy`。数据构造必须保存完整 Attempt、序列、目标资源和参数，正式实验前由 scorer 按上述固定公式补齐派生指标。不得用只检查首动作的 `conditionalToolAt1` 代替“工具选择正确率”。

### 各类 Memory 链路

| 信息缺口 | 允许链路 | 说明 |
|---|---|---|
| L1 语义结论 | `tdai_memory_search` | 第一个响应已承载 L1 候选，直接停止 |
| L1 结构化过滤 | `tdai_atomic_query` | query 中必须有明确类型、时间或分页条件 |
| L0 精确原话 | `tdai_conversation_search` | 返回目标消息后停止 |
| L0 完整 session | `tdai_conversation_search -> tdai_conversation_query` | 只有确实要完整上下文时才需要第二步 |
| 已知 session id | `tdai_conversation_query` | session id 必须来自当前可见上下文 |
| 已注入 L2 path | `tdai_read_scene` | path 从 `<l2_scene_index>` 取得 |
| L2 path 未注入 | `tdai_scenario_ls -> tdai_read_scene` | 只在索引刷新或前缀过滤确有必要时使用 |
| 答案在 L3 | 无 TDAI Attempt | 作为 No-tool Positive Boundary |

允许多个合理首动作的 case 很难解释，也容易在看到模型输出后修改 Gold。正式主集只保留首动作唯一的 case。确实有两个等价入口时，必须在冻结前写入 `allowedFirstActions`，并在 `decision-review.json` 说明等价原因。

## 一个 Space、十六个 Team

正式数据使用一个逻辑 Space：

```text
space-task1-engineering
```

这个 Space 下有十六个 Team。Team 用来组织同域项目、可见 Skill 池、Memory 资产和 Knowledge 绑定，不承担 Task 1 的隔离指标。正式运行仍要校验 Session Init 解析到了预期 Team，避免加载错资产，但不写跨 Team 攻击题，也不报告 ACL 指标。

| Team | 工程主题 | 主要真实任务 | 主要近义 Skill 干扰 |
|---|---|---|---|
| T01 | Python 可靠性 | Mypy、Python fuzzing、pytest、CI | 目标选择、fuzzing、普通测试、覆盖率、环境搭建 |
| T02 | 数据计算 | Pandas、时间序列、Dask 并行 | 去趋势、并行、内存、负载均衡、Notebook |
| T03 | ML 工程 | DVC、论文复现、GRPO、MONAI | 环境复现、Notebook、RL 诊断、CLI、测试 |
| T04 | Java 后端 | Jakarta、RestClient、Maven 构建 | namespace、HTTP client、安全、Maven 三类根因 |
| T05 | Web 产品 | D3、React 性能、CLS | 可视化、浏览器测量、React 优化、Playwright |
| T06 | 客户端与 CLI | System.CommandLine、VS Code、DVC CLI | CLI 创建、CLI 参数、扩展命令、普通文档 |
| T07 | SDK 与集成 | Microsoft Graph、Qdrant、API client | SDK、认证、Jest、普通 REST、向量处理 |
| T08 | 测试质量 | pytest coverage、Jest、Playwright | 单测、覆盖率、E2E、构建失败、浏览器探索 |
| T09 | 安全与依赖 | Trivy 离线审计、依赖报告 | 扫描、CVSS 提取、CSV 报告、普通升级 |
| T10 | 构建与发布 | Maven、Python build、release workflow | 生命周期、依赖、插件、CI 分析、环境搭建 |
| T11 | 移动端工程 | Android/iOS 构建、生命周期、离线同步、性能与 UI 测试 | 平台、构建、状态同步、性能和测试工具的近义干扰 |
| T12 | 数据库演进 | schema migration、在线变更、索引、查询计划、数据回填 | 迁移、备份、ORM、性能分析和兼容性工具 |
| T13 | 可观测性与故障定位 | metrics、logs、traces、告警关联、性能剖析 | 采集、查询、仪表盘、告警和事故响应工具 |
| T14 | 云原生交付 | Kubernetes、Helm、GitOps、容器构建、发布策略 | 编排、模板、镜像、CI/CD 和配置管理工具 |
| T15 | API 契约与兼容性 | OpenAPI、SDK 生成、版本策略、契约测试 | 文档、schema、代码生成、测试和网关工具 |
| T16 | 事件驱动系统 | 消息队列、事件 schema、幂等、顺序、重试、死信 | broker、stream、序列化、可靠性和消费者诊断工具 |

T01 继承当前 W01-B 的 Mypy 与 fuzzing 材料。其他 Team 从 `OPEN-SKILL-TARGET-MATRIX.md` 和 `ENGINEERING-SKILL-CANDIDATE-RESEARCH.md` 中选择已核验靶子。任何 Team 都可以同时维护多个项目，因为这更接近一个工程部门的实际状态。

每个 Team 只有一个 Agent 会被正式 case 选为当前 Agent。另设最多两个资产来源 Agent，专门持有 team-visible Skill 和可导入 Memory，不作为 Codex、Claude Code 或其他终端，也不作为 case 的运行主体。这个结构对应 `formal-visibility.ts` 的真实边界：当前 Agent 最多导入两个同 Team Agent 的 Memory，`skill_search` 可以查到同 Team 的 team-visible Skill。

正式 schema 已把旧的 `FormalWorld.teamIds: readonly [string, string]` 改为一个 Space 下的 Team 列表，并把 `split` 从 World 级下沉到 Team 或 case。Team id 是通用字符串，不需要为 T11 至 T16 再次修改 schema，也不得伪造多个 `space_id` 绕开合同。

## 规模与分布

正式主集合固定为六百四十个 case，每个 Team 四十个。质量 Gate 优先于机械凑数，但质量不合格的 case 必须替换，不能通过减少某个 Team、再从其他 Team 补量来改变冻结分布：

| 类型 | 每 Team | 全集 | 作用 |
|---|---:|---:|---|
| Memory Positive | 6 | 96 | 覆盖 L0、L1、L2 的真实触发与选型 |
| Skill Positive | 6 | 96 | 覆盖 listed、team search 和少量 resource read |
| Knowledge Positive | 3 | 48 | 覆盖资源选择与最小两步协议 |
| 配对 No-tool Negative | 15 | 240 | 每个 Positive 对应一个只改变信息充分性的负例 |
| 自然 coding Negative | 10 | 160 | 测试注入是否干扰普通工程任务 |
| 合计 | 40 | 640 | 正样本 240，负样本 400 |

Knowledge 数量低于 Memory 和 Skill，因为 Task 1 不评价知识资产质量，也不建设大规模知识库。四十八个样本用于检查触发、资源选择和两步协议，同时把更多预算留给误调用率。

六百四十条不能通过同一句话替换名词得到。某个 Team 暂时无法写出六个独立、首动作唯一的 Skill Positive 时，应替换薄弱靶子或重写具体 case；该 Team 未达到四十条合同前，不能通过本地 Gate。若确有理由改变数量合同，必须在任何 Prompt 调优或正式运行前发布新的 dataset revision，重新冻结每个 Team 的数量、分母和 manifest。额外生成的合格 case 可进入 exploratory 集合，不进入主指标分母。

### 三分之二正样本从搜索或发现入口开始

每个 Team 的十五条 Positive 固定以下首动作分布：

| 家族 | 搜索或发现首动作 | 直接首动作 | 合计 |
|---|---:|---:|---:|
| Memory | 4 | 2 | 6 |
| Skill | 3 | 3 | 6 |
| Knowledge | 3 | 0 | 3 |
| 合计 | 10 | 5 | 15 |

全集至少一百六十条 Positive 从 `tdai_memory_search`、`tdai_conversation_search`、`skill_search` 或 Knowledge `tools/list` 开始，另外八十条保留已知 Skill、已知 scene、结构化 Memory 条件等直接入口。搜索样本占多数，直接样本仍然存在，用来检查模型会不会形成“看到工具就先搜一遍”的新误调用习惯。

搜索配额不能靠评测器临时隐藏资产实现。每条 case 的当前 Agent、Task、Skill ownership、binding 和 visibility 在快照中固定，prewarm 使用真实 Agent 与 Task 描述生成 listing。目标 Skill 只有在真实 prewarm 后仍未进入 `<available_skills>`，同时能被 `skill_search` 找到，才有资格标为搜索 Positive。

### Dev 与 Hidden

| Split | Team | case 数 |
|---|---|---:|
| Dev | T01 至 T04、T11、T12 | 240 |
| Hidden | T05 至 T10、T13 至 T16 | 400 |

一个 Space 不代表两个 split 同时加载。生成两个互斥、不可变快照：

```text
snapshot-task1-dev-v1
snapshot-task1-hidden-v1
```

Dev 运行时只恢复 T01 至 T04、T11、T12 的资产，Hidden 运行时只恢复 T05 至 T10、T13 至 T16 的资产。Prompt 调整只看 Dev。Hidden Gold、上下文和资产摘要在 Prompt 冻结前不得提供给改造 Prompt 的会话。

## 每个 Team 最少构造哪些东西

### 通用身份与项目

每个 Team 设一个通用业务 Agent，名称采用 `agent-task1-tXX-general`。不为 Codex、Claude Code 或不同模型分别建 Agent。模型只是评测执行端，TDAI Agent 是 Session Init、资产绑定和可见性所需的业务实体。

为了形成真实的团队检索池，可以增加 `agent-task1-tXX-assets-a` 和 `agent-task1-tXX-assets-b`。这两个身份只持有 team-visible Skill 或 Memory 来源，不进入 case 的 `activeAgentRef`。如果一个 Team 用当前 Agent 自有资产已经能满足搜索合同，就不必创建第二个来源 Agent。

每个 Team 维护三至六个活跃项目流。项目不需要新增 `projectId` 数据库实体，可以通过 Task、workspace、repo/commit、Memory 内容和上下文中的项目名表达。每个 case 只指向其中一个当前任务，其他项目提供真实干扰。

### Memory 资产密度

每个 Team 的推荐最小资产：

| 资产 | 数量 | 要求 |
|---|---:|---|
| L0 session | 8 至 12 | 每条包含 12 至 40 条自然、内部一致的工程对话消息，至少分布在三个并行项目流 |
| L1 atomic memory | 12 至 20 | 偏好、约定、结论、旧版本和近义干扰，与同 Team 的合成世界保持一致 |
| L2 scene | 4 至 6 | path 与 summary 会注入，summary 不得直接泄露正文答案 |
| L3 | 1 | 80 至 220 中文字，放稳定偏好和长期原则，不放 case 答案 |

同一份资产池可以服务同 Team 的多条 case。无需为每个 case 新建一套 Memory。干扰资产必须真的会被生产注入或检索到，私有字段中写了但运行时不可见的资产不算干扰。

L1 不是从 L0 自动抽取出来的评测对象。Luna 可以根据 Team 项目流直接生成 L0 和 L1，只要同一世界内的项目、时间线、结论和旧版本互相一致。若 L1 明确改写自某条 L0，可以保存 `source_session_ids` 方便内部检查；纯合成 L1 只需标记生成批次，不要求证据片段 hash。

### Skill 资产密度

每个 Team 保持十四至二十个可搜索 Skill，其中五至七个绑定到当前 Agent，进入 `<available_skills>`；另外九至十三个由资产来源 Agent 持有并设为 team-visible，只能通过 `skill_search` 发现。Team 池中应包含正式目标、同域近义干扰、旧流程、其他并行项目流程和少量通用 Skill。

六条 Skill Positive 固定为：两条 listed `skill_view`、三条 `skill_search -> skill_view_by_id`、一条 `skill_view -> skill_files_read`。同一 case 的目标和干扰 description 长度应接近，不能让目标 Skill 因名称更具体或描述更长而被轻易识别。

生产 listing 不是一份手写静态列表。`skill-injector.ts` 会用 Agent 与 Task 描述构造查询，MemoryCore 再按 `searchTopK` 和字符预算渲染 `<available_skills>`。因此每条 Skill 搜索 Positive 都必须保存实际 listing、listing mode、命中 Skill ids 和 listing SHA-256。目标意外进入 listing 时，这条 case 应改为 direct view，或调整真实 ownership 与 binding，不能仍把 `skill_search` 写进 Gold。

正式 Skill 池中的目标 Skill 和干扰 Skill 都必须来自真实的公开 GitHub 仓库文件，不能由 Luna 凭空编写。Sol 用普通 GitHub 关键词搜索即可，不设置 Star 数、热门度或来源数量门槛，也不建设自动爬虫和排名系统。同一个真实包可以按领域适配给多个 Team 使用，但不能靠复制改名制造不同 Skill。

候选进入 input pack 前，Sol 冻结 repository URL、commit SHA、仓库内 path、license 和 raw file SHA-256。没有明确许可证的内容不进入正式 Skill 池。无需安装仓库依赖、运行上游测试或证明 Skill 能完成最终工程任务。

真实 Skill 可以直接导入，也可以做有记录的宿主适配。允许修改：

- listing description。
- 当前 MemoryProxy 不支持的宿主工具名。
- 明确的 `use_when` 和 `do_not_use_when` 边界。

不允许静默修改技术步骤。raw package、adapted package、逐行 diff、repo、revision、path、license 和 SHA-256 都要保存。

### 最小 Knowledge 资产

每个当前 Agent 固定绑定三个最小 Knowledge 资源，形成一个目标资源和两个同域或错仓库干扰资源。资源可以复用同一套轻量服务与构造流程，不建设大型 Wiki 或完整 CodeGraph。每个资源只需满足：

- 状态为 ready，能被当前 Agent 绑定并注入。
- `knowledge_id`、type、name、service URL、repo match 或 wiki summary 稳定。
- `tools/list` 返回固定工具清单。
- 至少一个只读查询工具能用固定参数返回 2xx。
- 资源内容不会直接出现在当前上下文、L3 或 workspace 中。
- 三个资源的 name、summary 和 match 信息足以选择，但不能直接给出题目答案。

三条 Knowledge Positive 分别围绕一个明确匹配的资源构造，或在资源确实支持多个不同查询意图时复用目标资源。每条都必须从 `tools/list` 开始，再执行正确资源的 `tools/call`。三个资源都需要 ready 和可调用，但正文只准备最小固定内容。

### 当前会话上下文

case 的 `contextMessages` 负责表达当前任务阶段，Memory 负责表达过去信息。两者不能混写。

上下文长度分三档：

| 档位 | 消息数 | 全集占比 | 用途 |
|---|---:|---:|---|
| 短 | 4 至 6 | 20% | 边界清晰的基础样本 |
| 中 | 8 至 12 | 60% | 主体样本，包含需求演化、日志片段和已排除方案 |
| 长 | 14 至 20 | 20% | 多项目词汇、错误尝试和局部结论形成的压力样本 |

一段合格的工程会话通常包含：任务背景、当前仓库或组件、已知证据、一次方向调整、已完成工作、仍缺的信息和最后一条自然请求。不能直接写工具名、Skill 名、Memory 层级、`knowledge_id` 或 Gold。

## case 如何构造

### 先写信息缺口

每个 Positive 先写私有 `informationGap`，再写上下文和 Query。信息缺口必须说明：

1. 当前输入缺什么。
2. 目标资产在哪里。
3. 为什么本地代码和当前上下文不足。
4. 为什么相邻工具不适合。
5. 哪个响应出现后就可以停止。

示例：

```json
{
  "needTdaiTool": true,
  "family": "memory",
  "targetAssetIds": ["T01-L0-11"],
  "allowedSequences": [["tdai_conversation_search"]],
  "informationGap": "需要找出上次 Mypy stubgen 修复中 AliasPrinter 对 StarExpr 的精确处理方式，当前上下文只有问题现象，没有历史结论。",
  "stopAfter": "tdai_conversation_search 返回 T01-L0-11 中的目标消息"
}
```

示例只展示关键字段。正式对象必须以 `worlds/formal-schema.ts` 中的 `FormalGold` 为准，并由正式 validator 校验。

### Positive 与配对 Negative

每个 Positive 都生成一个配对 No-tool Negative。两条 case 共用：

- Space、Team、Agent、Task 和 workspace。
- 完整资产快照。
- shared messages。
- 最终 query 的语气、长度和目标任务。
- 模型、推理强度和运行配置。

只允许 `delta_message` 改变信息是否已经充分。Negative 中把原本缺失的必要信息自然地补进当前会话，使任务可以继续执行且无需 TDAI。不能删除资产、关闭能力或把 Query 改成无关任务。

每个 pair 保存：

```json
{
  "pairId": "T01-MEM-001",
  "positiveCaseId": "T01-MEM-001-P",
  "negativeCaseId": "T01-MEM-001-N",
  "counterfactualKind": "answer_in_current_context",
  "controlledDeltaSha256": "...",
  "currentEvidenceRefs": ["..."],
  "contentHash": "..."
}
```

共享消息、Positive delta、Negative delta、Query 和 snapshot 的细分 hash 可写入 Team review 或编译报告，但不能伪装成 `FormalPair` 字段。`FormalPair` 的正式形状以 `worlds/formal-schema.ts` 为准。

### 自然 coding Negative

自然负例不是 Positive 的简化版。它来自真实、自包含的工程请求，例如：

- 修改当前给出的函数并补一个局部测试。
- 根据完整错误堆栈修正已定位配置。
- 把已给算法按现有函数签名接入。
- 改文案、类型、CSS 或小型纯函数。
- 解释当前可见代码，不需要历史、流程包或知识索引。

每条自然负例仍加载 Team 的完整 Memory、Skill 和 Knowledge 干扰池。否则无法测量注入造成的误调用。

### Provider 可见字段

模型只看到：

```json
{
  "caseId": "T01-MEM-001-P",
  "language": "zh",
  "contextMessages": [],
  "query": "..."
}
```

以下字段只存在于私有 registry：

- `needTdaiTool`
- `family`
- `allowedFirstActions`
- `expectedFollowupActions`
- `expectedKnowledgeCalls`
- `allowedSequences`
- `targetAssetIds`
- `forbiddenTools`
- `maxTdaiCalls`
- `informationGap`
- `annotationReason`
- `pairId`
- 全部来源和审查记录

编译脚本必须从两个不同对象生成 provider input 和 scorer Gold。不得先生成一个大对象，再靠运行时删除若干字段，因为一次遗漏就会泄露答案。

## Gold 与最短序列

每个正样本的 Gold 至少包括：

```json
{
  "needTdaiTool": true,
  "family": "skill",
  "allowedFirstActions": [
    {
      "tool": "skill_search",
      "endpoint": "/skill-bridge/v3/skill/search",
      "argumentRules": {
        "requiredFields": ["query"],
        "stringContainsAny": {
          "query": ["fuzz", "python", "harness"]
        }
      }
    }
  ],
  "expectedFollowupActions": [
    {
      "tool": "skill_view_by_id",
      "endpoint": "/skill-bridge/v3/skill/get",
      "argumentRules": {
        "requiredFields": ["skill_id"],
        "valueFromPreviousStep": true
      }
    }
  ],
  "allowedSequences": [
    ["skill_search", "skill_view_by_id"]
  ],
  "forbiddenTools": [],
  "maxTdaiCalls": 2
}
```

No-tool Gold 固定为 `needTdaiTool=false`、`family=null`、空序列和 `maxTdaiCalls=0`。出现任何明确指向 Memory Bridge、Skill Bridge、`tools/list` 或 `tools/call` 的实际请求都算误调用。

Gold 审查只回答工具决策，不回答工程任务。审查人需要检查：

- 信息缺口是否真实存在。
- 目标资产是否确实可见。
- 目标入口是否由生产注入文字提供。
- 第一动作是否唯一。
- 后续动作是否只能从上一步获得必要参数。
- Negative 是否真的不再需要 TDAI。
- Query 是否没有暗示工具名或来源。

## 来源与生成规则

### Skill 使用真实 GitHub 来源

正式 Skill 必须来自普通 GitHub 搜索找到的真实仓库文件，Star 数不影响是否可用。GitHub 来源只证明 Skill 内容真实，不承担 Gold 正确性的证明责任。Gold 仍由当前上下文、冻结资产池、生产可见性和工具协议决定。

Team 名、项目名、时间线、错误现象、历史结论、会话和各层 Memory 可以由 Luna 按冻结规则生成。Knowledge 可以是合成的内部项目文档，也可以直接使用外部资料。Luna 不得凭空生成正式 Skill 的名称、正文或技术步骤，只能基于 Sol 已冻结的真实 Skill 做宿主适配、描述压缩和 case 草稿。

只有两类外部内容需要来源记录：

- 实际导入的开源 Skill 包，记录 repository、revision、path、license 和包级 SHA-256。
- 直接保留的外部原文片段，记录 dataset、row 或 path、license 和片段 SHA-256。

由 Luna 新写的 Team 名、项目名、会话、错误现象、历史结论、L0、L1、L2、L3、内部 Knowledge 和自然负例不要求逐句 `source_id`、文件位置或 hash，只需记录生成批次和审查状态。不能把合成内容声称为真实仓库事实。

不要提取、应用或复现 benchmark 的 reference patch、test patch、最终答案和 verifier 结论，也不要为数据构造安装开源项目依赖或运行其测试。它们与 Task 1 的工具调用指标无关。

### Luna 生成协议

批量生成使用 `gpt-5.6-luna`、推理强度 `high`、verbosity `medium`。模型输出永远先进入 `draft`，不能直接进入正式 registry。

生成 Agent 可以完成：

- 根据 Team 规则生成自然的当前会话。
- 生成内部一致的 L0、L1、L2、L3 和内部 Knowledge 候选。
- 基于 Sol 冻结的真实 GitHub Skill 文件生成宿主适配和 case 草稿。
- 生成 Positive 与单变量 Negative 草稿。
- 生成同域干扰项候选。
- 记录生成批次；只有使用外部内容时才补来源引用。

生成 Agent 不能决定：

- 最终 Gold。
- 许可证是否合格。
- 目标资产在生产链路中是否可见。
- Hidden 是否解封。
- 某个失败运行是否应从指标分母删除。
- 凭空编写正式 Skill 的名称、正文、文件或技术步骤。

每批输出记录：

```json
{
  "generator_model": "gpt-5.6-luna",
  "reasoning_effort": "high",
  "verbosity": "medium",
  "prompt_version": "dataset-author-v1",
  "external_source_ids": [],
  "generated_at": "ISO-8601",
  "review_status": "draft"
}
```

`external_source_ids` 可以为空。生成记录按批次保存，不要求每条事实单独绑定来源，也不要求保存每次模型原始输出的 hash。

### 生成 Team 背景的模板

```text
你正在为 Task 1 构造一个真实工程 Team 的数据草稿。

输入是已冻结的工程主题、资产规模和路由边界。可以生成 Team 名、项目名、时间线、错误现象和历史结论，但它们必须在同一 Team 内保持一致。生产接口、工具参数、资产可见性和 Gold 由 Sol 提供，不能自行编造。

请输出：
1. Team 的职责和 3 至 6 个并行项目流。
2. 一个通用业务 Agent 的角色描述。
3. 各项目之间会自然重复出现的技术词汇。
4. 哪些项目容易形成近义 Skill 干扰。
5. 哪些事实适合进入 L0、L1、L2、L3，哪些不应进入任何 Memory。

不要在模型可见内容中写工具名、Gold、评测指标或答案。输出 JSON，并标明哪些字段是合成内容；只有直接使用外部材料时才带 `external_source_ids`。
```

### 生成上下文正负对的模板

```text
根据给定 Team、当前任务、可见资产池和私有 `informationGap`，生成一组中文工程会话。

要求：
- shared_messages 有 8 至 12 条，包含任务背景、已知证据、一次方向调整、已完成工作和仍缺的信息。
- final_query 自然描述下一步工作，不写任何 TDAI 工具、Memory 层级、Skill 名或 Knowledge id。
- positive_delta 保持信息缺口。
- negative_delta 只补充解决该信息缺口所需的事实，其他文本尽量相同。
- 两条 case 的 final_query 完全一致。
- 不要求模型完成整个工程任务。
- 不写最终补丁或最终 coding 答案。

输出 shared_messages、positive_delta、negative_delta、final_query、生成批次信息，以及可选的 `external_source_ids`。
```

### 生成自然 coding Negative 的模板

```text
根据给定 workspace 片段和当前 Team 的真实工程主题，生成一个自包含 coding 请求。

当前输入必须已经包含完成下一步所需的信息。请求可以要求局部编辑、解释、测试或配置修改，但不能依赖历史偏好、过去会话、团队流程包或知识索引。

会话中可以出现与可见 Memory、Skill、Knowledge 相似的技术词，但不能形成真实信息缺口。输出 4 至 12 条 contextMessages、final_query 和 no_tool_reason。
```

## 文件布局

正式施工采用以下目录，不继续把正式数据写进 Pilot 的 `cases/dev.jsonl` 和 `cases/test.jsonl`：

```text
eval/tool-prompt-bench/formal-dataset/
├── registry/
│   ├── space.json
│   ├── teams/
│   │   ├── T01.json
│   │   └── ...
│   ├── assets/
│   │   ├── memory/
│   │   ├── skills/
│   │   └── knowledge/
│   └── cases/
│       ├── dev.private.jsonl
│       └── hidden.private.jsonl
├── provider/
│   ├── dev.jsonl
│   └── hidden.sealed.jsonl
├── snapshots/
│   ├── dev/
│   └── hidden/
├── provenance/
├── reviews/
├── reports/
├── generators/
├── scripts/
└── DATASET-BUILD-STATUS.json
```

`hidden.private.jsonl` 和 `hidden.sealed.jsonl` 在 Prompt 冻结前只允许数据构造分支读取，不复制进 Prompt 开发分支。

## 只增加四个施工入口

不为六百四十条数据建设大型平台。复用现有 `formal-*` 模块，只增加四个薄脚本：

| 脚本 | 作用 | 必须复用 |
|---|---|---|
| `scripts/compile-formal-dataset.ts` | 从 registry 编译 provider、private Gold 和快照输入 | `formal-compile.ts`、`formal-provenance.ts` |
| `scripts/validate-formal-dataset.ts` | schema、数量、pair、泄漏、序列和外部导入项校验 | `formal-schema.ts`、`evaluator.ts` 的合同类型 |
| `scripts/restore-formal-snapshot.ts` | 通过现有接口恢复一个 split 的真实资产 | `formal-snapshot.ts`、生产 client |
| `scripts/inspect-formal-snapshot.ts` | 读取真实入口并核对资产 id、可见性、hash 和工具清单 | `formal-visibility.ts`、生产 read API |

现有 Python 来源工具只在复用外部数据或导入开源 Skill 时使用。纯合成数据不需要经过 source lock、source pack 或开源项目测试，不要复制一套来源管理代码。

## 分阶段执行

### 当前阶段状态

schema 基线 Tag `task1-data-parallel-baseline-v2` 已包含 DS00、DS01、DS02 的 T01 检索压力试点，以及 synthetic 与 external import provenance 分型。建设任务不得重复执行已完成阶段，也不得在各自分支修改全局合同。启动时先读取 `formal-dataset/DATASET-BUILD-STATUS.json`；其中的 `branch` 是最近一次集成元数据，不是当前建设任务应切换到的分支。

`worlds/formal-schema.ts`、compiler、validator 和直接相关测试已经同步支持两类 provenance。`synthetic` 只记录生成批次与审查信息，禁止填写伪造的外部来源字段；`external_import` 继续严格校验 repository、revision、license、path、locator 和 hash。L1 code/test locator 只对外部导入强制。八个建设任务可以直接完成 staging 和本地 Gate。

当前并行施工边界如下：

- build-01 继续完成 DS02 的 T01，并建设 T02。
- build-02 建设 DS03 的 T03、T04。
- build-03 至 build-05 建设 DS05 的 T05 至 T10 分片。
- build-06 建设 Dev 的 T11、T12 分片。
- build-07、build-08 建设 Hidden 的 T13 至 T16 分片。
- DS04、DS06 及后续全局冻结、快照和状态更新只由集成任务完成。

### DS00：冻结一 Space 设计和多步评分合同

状态：一 Space、多 Team、split、完整链路评分和 provenance 分型均已在 v2 schema 基线完成。v2 首先冻结 T01 至 T10 的身份；当前 16-Team 启动合同只增加 T11 至 T16 注册身份，不改变通用 schema。本节历史任务不应在建设分支重做。

前置条件：在专用合同分支执行，不生成模型数据，不导入资产。

执行任务：

1. 修改正式 schema，使一个 Space 可以包含可扩展的 Team 列表，并允许 Team 或 case 持有 split。
2. 给 `ToolPromptEvalCase` 保留 `allowedFirstActions`、`expectedFollowupActions`、`expectedKnowledgeCalls` 和 `allowedSequences`。
3. 明确 `EffectiveCallRate` 使用完整最小链路，`FirstRouteAt1` 只作诊断。
4. 正式 provenance 区分 `synthetic` 和 `external_import`。纯合成资产只关联生成批次，不能为了满足旧 schema 伪造 repository、revision、license 或文件 hash。
5. 修改旧文档索引，标记本文件替代十 Space、第一步即停和逐条外部来源闭环假设。
6. v2 为 T01 至 T10 写空 Team registry；16-Team 启动合同以相同格式增加 T11 至 T16。

需要运行：

```powershell
cd MemoryProxy
npm run eval:tool-prompt:d0:test
```

全量 `npm run typecheck` 只作历史基线对比，不是数据阶段 Gate。若运行后仍只有与 Task 1 无关的既有错误，记录即可；不得为了清零全仓历史错误扩大本任务范围。相关 schema、编译器、validator 和测试必须通过，且本任务不得引入新的错误。

Gate：

- schema 能表达一个 Space 和十六个 Team，并允许后续扩展 Team id。
- Dev 和 Hidden 可以在同一 Space 下分开编译。
- evaluator 的首路由和完整序列测试都通过。
- 没有正式 case 或资产被生成。

建议提交：

```text
feat(tool-prompt-bench): revise formal dataset to one-space multi-team contract

- move split ownership below the space level
- preserve first-route and minimal-chain scoring
- freeze initial T01-T10 registry identities
- supersede the legacy ten-space construction assumption
```

### DS01：迁移 T01 已有材料

状态：已在冻结基线完成。本节保留为历史验收合同，不应在建设分支重做。

前置条件：DS00 Gate 通过。

执行任务：

1. 把当前 W01-B Mypy 和 fuzzing 草稿迁到 T01，不改来源 hash。
2. 将 `space-w01` 改为正式 Space id，将 Team 和 Agent id 改为 T01 命名。
3. 保留六条现有 L0 候选，只让审核通过的四至六条进入正式资产。
4. 把四组正负对转为正式 pair schema。
5. 对 Skill Positive 补齐最短链路。listed Skill 用 `skill_view`；team library Skill 用 `skill_search -> skill_view_by_id`。
6. 删除草稿中的 `runtime_stop=stop_after_first_tdai_tool_decision`，改为每 case 的 `stop_after`。

需要运行：

```powershell
node MemoryProxy/eval/tool-prompt-bench/source-tools/validate_context_pair_draft.mjs `
  MemoryProxy/eval/tool-prompt-bench/formal-worlds/W01/drafts/w01-b-fuzzing-context-pairs.json
```

迁移后的正式 validator 还应输出：

```text
T01 pairs: 4
T01 cases: 8
provider leakage: 0
invalid sequences: 0
missing source refs: 0
```

Gate：八条 case 在新 schema 下通过，Positive 与 Negative 的共享字段 hash 相同，只有登记的 delta 不同。

### DS02：完成 T01 四十条

状态：T01 检索压力试点已完成；build-01 从试点结果继续补齐 T01 四十条。

前置条件：DS01 Gate 通过，T01 资产池已冻结。

执行顺序：

1. 完成六条 Memory Positive，覆盖 L0 search、L0 query、L1 search、L1 query 和 L2 read 等真实边界。
2. 六条 Memory 中四条以 `tdai_memory_search` 或 `tdai_conversation_search` 开始，两条使用结构化 query 或已知 path 的直接入口。L2 index 会完整注入，不能仅为了增加搜索次数把已知 path 标成 `scenario_ls`。
3. 完成六条 Skill Positive：两条 listed direct view、三条 team search/view、一条 resource read。
4. 基于三个 ready 的最小 Knowledge 资源完成三条 Knowledge Positive。
5. 为十五条 Positive 各写一条配对 Negative。
6. 增加十条自然 coding Negative。
7. 运行 Luna 生成可以分批，每批最多五组 pair，批后立即审查，不等四十条全部生成。

Gate：

- 40 条数量和类别正确。
- 15 组 pair 通过单变量审查。
- 所有正样本的首动作唯一。
- 所有最小链路可以由冻结 fixture 合成执行。
- 每个 Positive 至少有两个可见干扰资产。
- 四条 Memory、三条 Skill 和三条 Knowledge Positive 从真实搜索或发现入口开始。
- 三条 Skill 搜索 Positive 的目标都不在实际 `<available_skills>` 中，但能在 `skill_search` 的冻结结果中找到。
- Memory 标准检索 query 能在冻结资产池中返回目标和至少一个近义干扰；检索结果质量只作数据 Gate，不进入 Prompt 主指标。
- 十条自然负例没有隐藏的信息缺口。
- provider leakage 为 0。

### DS03：扩展 Dev 的 T02 至 T04、T11、T12

前置条件：DS00 合同和 T01 检索压力试点已通过，构造模板不再修改 schema。T02 至 T04、T11、T12 的分片施工不必等待 T01 扩充到 40 条；Dev 全局冻结仍必须等待 T01 至 T04、T11、T12 全部通过，而且不能在其余 Hidden 任务完成前形成正式 `formal-v1`。

T02 至 T04、T11、T12 各自按 DS02 的四十条结构建设。Team 之间可以由不同 Codex 任务并行施工；同一个 Codex 任务负责的两个 Team 仍按顺序完成，一个 Team 通过本地 Gate 后再开始该任务内的下一个 Team。施工任务只能写各自的 Team 分片，不能并发修改全局合同、总状态文件、编译产物或冻结快照。

每个 Team 的执行循环：

1. 冻结项目与 Skill 靶子。
2. 构造最小 Memory、Skill、Knowledge 资产池。
3. 先写三组试验 pair，分别覆盖 Memory、Skill、Knowledge。
4. 用 fixture 合成执行完整 Gold 序列。
5. 三组都通过后扩为十五组 pair。
6. 补十条自然负例。
7. 编译、验证并写 Team Gate 报告。

Dev Gate：

- T01 至 T04、T11、T12 共 240 条。
- 六个 Dev Team 的类别总数符合 manifest。
- 所有实际导入的外部 Skill 或原文片段有必要的来源、license 和 adapted Skill diff；纯合成内容不要求外部来源。
- Dev provider input、private Gold 和 snapshot hash 冻结。
- Dev 数据只有在八个建设任务全部通过并完成一次性 `formal-v1` 集成后，才交给 Prompt 代码分支开始 V0 至 V3 迭代。

### DS04：冻结 Dev，不再改题

Dev 冻结后只允许修复以下客观错误：

- 来源 id 或 hash 错误。
- 真实入口不可执行。
- provider 泄漏。
- Positive 的目标资产不可见。
- Positive 和 Negative 并非单变量。
- Gold 与生产协议冲突。

不能因为某个 Variant 得分低而改 Query、Gold、干扰池或调用次数。每次客观修复都递增 dataset revision，并重新运行所有 Variant 的受影响 case。

### DS05：建设 Hidden 的 T05 至 T10、T13 至 T16

前置条件：正式 schema、数量合同和 Hidden 写入边界已冻结。Hidden 分片施工可以与 Dev 分片施工并行，但 Hidden 的全局集成、sealed manifest 和交给实验运行必须等待 Dev 冻结；Prompt 代码开发会话不能读取 Hidden 内容。

Hidden 每个 Team 同样建设四十条。数据 Agent 可以复用 schema、validator 和生成 prompt，但不能复制 Dev 的具体句子。Hidden 中至少一半 Skill 靶子来自前端、客户端、SDK、测试、安全和构建轨道，避免 Hidden 只是 Python 词汇替换。

T05 至 T10、T13 至 T16 可以由五个独立 Codex 任务并行建设。每个任务只读取 Dev 的结构合同和公开计数，不读取或改写其他 Hidden 任务的 Query、上下文、Gold 和资产摘要。所有 Hidden 任务先输出 Team 分片，最后由单独的集成任务统一做去重、泄漏检查、编译和 sealed manifest。

每个 Team 完成后生成 sealed manifest，只公开：

- Team id。
- case 总数和类别计数。
- 来源类型计数。
- provider bytes 和 token 区间。
- snapshot hash。

不公开 Query、上下文、资产摘要和 Gold。

Hidden Gate：

- 400 条全部通过与 Dev 相同的 validator。
- 与 Dev 的 n-gram、完整句、query hash 和上下文 hash 无重复。
- Dev 与 Hidden 可以采用相同工程领域，但不能复制具体 query、上下文、信息缺口或 pair 模板。
- Hidden 快照能独立恢复，不依赖 Dev 资产。

### DS06：恢复真实资产并核对

前置条件：两个 split 的 registry 与快照输入都已冻结。

只通过现有生产数据面接口导入：

- L0 conversation。
- L1 atomic memory。
- L2 scene 和 L3 core memory。
- Skill package、visibility 和 Agent binding。
- 最小 Knowledge 资源 binding。

自动抽取、资产反思、archive write-back 和 LLM 写入全部关闭。导入后用只读接口核对每个 id、数量、内容 hash、Team、Agent、listing 和 tools list。

恢复完成后保存 receipt，不保存凭据：

```json
{
  "snapshot_id": "snapshot-task1-dev-v1",
  "space_id": "space-task1-engineering",
  "restored_at": "ISO-8601",
  "restore_script_sha256": "...",
  "asset_counts": {},
  "asset_content_sha256": "...",
  "knowledge_tool_list_sha256": "...",
  "verification_status": "passed"
}
```

Gate：连续恢复两次得到相同可见资产 hash。任何一次恢复残留上次运行新增的 Memory、Skill 或 session，Gate 失败。

### DS07：真实链路无模型 Gate

前置条件：DS06 通过，MemoryProxy、MemoryCore、Skill 和 Knowledge 服务可用。

无模型 Gate 通过生产路由执行：

```text
Auth
-> Session Init
-> prewarm
-> production InjectionPipeline
-> capture upstream
```

每个 Team 至少抽一条 case，检查：

- 只有 MemoryProxy 注入一次 `<tdai_injections>`。
- Space、Team、Agent 和 Task 解析正确。
- 注入的 L3、L2 index、available skills 和 Knowledge metadata 与快照一致。
- 静态工具描述来自当前 Variant 的 production renderer。
- 首个真实入口 observer 能关联 `runId`、`caseId` 和有序 attempts。
- 无任何写入、抽取或上一 case 的 session 状态。

运行现有 Gate：

```powershell
cd MemoryProxy
npm run eval:tool-prompt:real-chain:gate
npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
```

DS07 不调用 Luna，也不产生正式模型指标。

### DS08：交给实验运行

数据交接包必须包含：

- dataset revision 和 Git commit。
- Dev、Hidden snapshot id 与 SHA-256。
- 640 条分布表。
- provider input manifest。
- private Gold manifest。
- 外部导入项的 source 与 license manifest，若没有外部导入则明确记录为空。
- real-chain Gate 报告。
- token 记录 schema。
- 已知限制。

之后由实验运行脚本按 V0、V0-C、V1a、V1、V2、V3 的冻结提交逐一运行。数据分支不再修改 Prompt 实现。

## token 与 Prompt Cache 留痕

数据集虽然不运行正式模型，也必须提前定义每次运行要保存的 token 字段。不能只保存总输入 token。

### 静态注入

每个 Variant、Capability Signature 和模型 tokenizer 记录：

- `memory_tool_description_tokens`
- `memory_guide_tokens`
- `skill_tool_description_tokens`
- `available_skills_instruction_tokens`
- `knowledge_tool_description_tokens`
- `static_tool_description_tokens_total`

### 动态资产

每个 case 记录：

- `l3_tokens`
- `l2_index_tokens`
- `available_skill_listing_tokens`
- `knowledge_resource_listing_tokens`
- `dynamic_asset_tokens_total`
- `full_injected_tokens`
- `full_system_prompt_tokens`
- `context_tokens`
- `query_tokens`

### Provider usage

每次 attempt 保存原始字段：

- `input_tokens`
- `cached_input_tokens`
- `cache_write_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`

缺失字段不能填 0。Provider 不提供某字段时保存 `null` 和 `usage_schema_version`，并在报告中按支持情况分列。不得用字符串长度估算账单 token。

### hash 与编码器

每次运行保存：

- `model_id`
- `tokenizer_id`
- `tokenizer_version`
- `variant_id`
- `capability_signature`
- 每个注入块的 UTF-8 bytes、characters、tokens 和 SHA-256
- `static_prefix_sha256`
- `full_system_prompt_sha256`
- `provider_input_sha256`
- `fixture_snapshot_sha256`

跨 Variant 的比较编码可以继续用 `o200k_base`，但它只用于统一比较。Provider usage 才是实际模型计费和缓存口径。两类 token 分开报告。

Prompt cache 不要求每个 case 的完整 system prompt 相同，因为 L3、L2 index、Skill listing 和 Knowledge listing 会随 Team 变化。公平性要求同一个 `case x model` 的所有 Variant 使用同一份动态资产，Variant 只改变登记的静态 Prompt 部分。报告应分开分析静态前缀 hash 和动态后缀 hash。

## 数据正确性 Gate

正式 validator 至少检查以下内容。

### 结构

- case id、pair id、Team id 全局唯一。
- 一个 case 只属于一个 split。
- Positive 和 Negative 数量与 manifest 一致。
- 每个 Positive 恰好有一个配对 Negative。
- 自然 coding Negative 不伪装成 pair。

### 决策

- Positive 有非空 `allowedFirstActions` 和 `allowedSequences`。
- No-tool 的所有允许动作和序列为空。
- `maxTdaiCalls` 等于最短序列长度或有明确审查理由。
- follow-up 的 id、path 或 tool name 来自 fixture 或上一步响应。
- Knowledge first action 必须是正确资源的 `tools/list`。
- listed Skill 不允许先 `skill_search`，除非 case 明确表示 listing 不可用。
- L3 已包含答案时不能标 Memory Positive。

### 可见性

- 目标 Skill 确实 listed 或 same-Team searchable。
- 目标 Memory 属于当前 Agent 或生产可见的 imported memory。
- L2 path 与 index 注入状态符合 Gold。
- Knowledge 资源与当前 Agent 绑定，workspace match 符合 case。
- 每个 Positive 至少有两个同域干扰项。
- Skill 搜索目标未进入该 case 的实际 listing，且存在于 same-Team 搜索白名单。
- Memory 搜索目标不在当前上下文、L3 或 L2 summary 中，冻结 query 能从十二条以上候选记录中找到目标。
- Knowledge Positive 至少面对三个已注入资源元数据，Gold 资源由 workspace match 或 summary 唯一确定。

### 配对

- identity、snapshot、shared messages 和 query 的 hash 完全相同。
- 只允许 delta 字段不同。
- Negative delta 补足信息后，不需要读取目标资产。
- Positive 和 Negative 的文字长度差异记录在报告中，不能靠极端长度泄露标签。

### 泄漏

- provider input 不含 `gold`、`target`、`expected`、`pairId`、`informationGap`，也不含旧草稿字段 `pair_id`、`information_gap`。
- Query 和 context 不出现 bridge endpoint、`knowledge_id` 或私有资产 id。
- 开源 reference patch、verifier answer 和 Hidden 标签不进入 provider input。
- 目标 Skill 名只在真实业务必须明确点名时出现，这类 case 单独标记 direct-name。

### 来源

- 纯合成内容有批次级生成记录和审查状态，不要求逐条来源。
- 实际引用的外部文件存在，并匹配登记的包级或片段级 SHA-256。
- 实际导入的外部内容登记 license 与允许用途。
- adapted Skill 有 raw、adapted 和 diff。
- 不存在为了满足 schema 而虚构的 repository、revision、license、source id 或 hash。

### 快照

- 相同输入连续编译两次得到相同 snapshot SHA-256。
- runtime policy 固定关闭 LLM 写入、抽取、反思、L0 写入和 archive write-back。
- 每个 case 使用 fresh session，并在运行前恢复冻结快照。

## `DATASET-BUILD-STATUS.json`

`DATASET-BUILD-STATUS.json` 是全局集成状态，只能由集成任务更新。八个建设任务必须把进度、数量和 Gate 写入各自 Team 的 `gate.json`，不能并发修改总状态文件。状态文件中的 `branch` 记录最近一次全局状态写入来源，不代表其他任务应切换到该分支。

当前冻结基线中的状态结构示意如下。实际值必须直接读取文件，不能从本段复制：

```json
{
  "schema_version": "task1.dataset_build_status.v1",
  "dataset_revision": "formal-v1",
  "active_stage": "DS02_parallel_16team",
  "stage_status": "parallel_ready",
  "branch": "<last-integration-branch>",
  "parallel_baseline_ref": "task1-data-parallel-baseline-v2",
  "parallel_baseline_commit": "1048681880b51e7a52a6b8b0b731eadeec44e118",
  "content_baseline_commit": "960021e472456515a89d3c2c4f2962fbf6cc51a1",
  "completed_gates": ["DS00", "DS01", "DS02_PILOT", "SYNTHETIC_PROVENANCE_V2"],
  "team_progress": {
    "T01": {
      "assets": "ds02_pilot_frozen",
      "cases": 10,
      "pairs": 5,
      "gate": "ds02_pilot_passed"
    }
  },
  "blocking_issues": [],
  "last_command": "...",
  "last_verified_commit": "..."
}
```

Agent 开始工作时按以下顺序读取：

1. 本文件。
2. `DATASET-BUILD-STATUS.json`。
3. 当前阶段涉及的 Team registry、来源锁和上一次 Gate 报告。
4. `git status`，确认用户已有修改不会被覆盖。

集成 Agent 完成一个全局阶段时：

1. 运行该阶段全部命令。
2. 保存完整输出和 Gate 报告。
3. 更新状态文件。建设 Agent 改为更新自己 Team 的 `gate.json`。
4. 只提交当前阶段涉及的文件。
5. 在下一阶段开始前再次核对当前分支和基线提交。

## 外层并行施工合同

正式数据建设使用八个互相独立的 Codex 任务。这里的“任务”指用户在 Codex 中单独打开的任务，不是 Team 内部的 Luna 批次：

| 建设任务 | 负责 Team | Split | 建议分支 |
|---|---|---|---|
| build-01 | T01、T02 | Dev | `codex/task1-data-build-v2-t01-t02` |
| build-02 | T03、T04 | Dev | `codex/task1-data-build-v2-t03-t04` |
| build-03 | T05、T06 | Hidden | `codex/task1-data-build-v2-t05-t06` |
| build-04 | T07、T08 | Hidden | `codex/task1-data-build-v2-t07-t08` |
| build-05 | T09、T10 | Hidden | `codex/task1-data-build-v2-t09-t10` |
| build-06 | T11、T12 | Dev | `codex/task1-data-build-16team-t11-t12` |
| build-07 | T13、T14 | Hidden | `codex/task1-data-build-16team-t13-t14` |
| build-08 | T15、T16 | Hidden | `codex/task1-data-build-16team-t15-t16` |

前五个建设任务已从不可变 Tag `task1-data-parallel-launch-v2` 建立专用 worktree，继续在原分支完成，不重启、不变基。新增三个任务从 `task1-data-parallel-launch-16team-v1` 建立专用 worktree。后一个 Tag 包含 16-Team 手册、并行 README、T11 至 T16 注册信息和三份独立提示词。两个 Tag 都必须包含 schema 基线提交 `1048681880b51e7a52a6b8b0b731eadeec44e118` 和数据内容祖先 `960021e472456515a89d3c2c4f2962fbf6cc51a1`。任何阶段都不能让多个任务共享一个可写工作目录，也不能让建设任务直接修改以下全局文件：

```text
formal-dataset/registry/contracts/formal-v1.json
formal-dataset/DATASET-BUILD-STATUS.json
formal-dataset/provider/**
formal-dataset/snapshots/**
formal-dataset/reports/*GLOBAL*
```

每个建设任务只允许写自己负责的 Team 范围：

```text
formal-dataset/generators/parallel/<build-id>/<team-id>/**
formal-dataset/staging/teams/<team-id>/**
formal-dataset/source-material/<team-id>/**
```

每个 Team 的 staging 目录至少包含：

```text
team-fragment.json
assets/memory.json
assets/skills.json
assets/knowledge.json
review.md
gate.json
```

`team-fragment.json` 只保存该 Team 对应的 `sourceEvidence`、`teams`、`businessAgents`、`tasks`、`publicCases`、`privateAnnotations` 和 `pairs` 数组片段。`world`、`snapshots`、跨 Team hash 和最终状态由集成任务生成，建设任务不得手写。

每个建设任务内部由 Sol 负责源码核对、输入冻结、Gold 决策和验收，批量草稿必须委派给 `gpt-5.6-luna`、`reasoning_effort=high` 的子智能体。一个 Luna 子智能体只写一个唯一批次目录。任务内可以并发 Memory、Skill、Knowledge/自然负例批次，但合并前必须由该任务的 Sol 逐份复核。

外层并行结束后，只有八个任务全部通过只读验收，当前集成任务才按 T01 至 T16 的顺序一次性合并 Team 分片，统一执行 schema、数量、pair、泄漏、可见性、重复度、检索压力、快照和 hash Gate。不得先合并前五个任务形成 400 条中间版。任何建设任务都不能自行宣布 Dev 或 Hidden 已冻结。

每个独立任务使用一份专属提示词，文件位于：

```text
parallel-prompts/THREAD-01-T01-T02.md
parallel-prompts/THREAD-02-T03-T04.md
parallel-prompts/THREAD-03-T05-T06.md
parallel-prompts/THREAD-04-T07-T08.md
parallel-prompts/THREAD-05-T09-T10.md
parallel-prompts/THREAD-06-T11-T12.md
parallel-prompts/THREAD-07-T13-T14.md
parallel-prompts/THREAD-08-T15-T16.md
```

## 分支与提交

八个建设任务按各自提示词登记的冻结 Tag 建立独立 worktree 和分支，集成工作保留在单独分支：

```text
codex/task1-data-build-v2-t01-t02
codex/task1-data-build-v2-t03-t04
codex/task1-data-build-v2-t05-t06
codex/task1-data-build-v2-t07-t08
codex/task1-data-build-v2-t09-t10
codex/task1-data-build-16team-t11-t12
codex/task1-data-build-16team-t13-t14
codex/task1-data-build-16team-t15-t16
codex/task1-data-integration
codex/task1-data-real-snapshot
```

在仓库任一只读管理工作树中，用明确路径创建专用 worktree。不要在共享集成目录中执行 `git switch`：

```powershell
git worktree add -b codex/task1-data-build-v2-t03-t04 `
  D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04 `
  task1-data-parallel-launch-v2
```

每个任务开始时必须运行：

```powershell
git status --short --branch -uall
git branch --show-current
git worktree list --porcelain
$launchTag = "<使用当前 THREAD 文件登记的启动 Tag>"
$launchCommit = git rev-parse "$($launchTag)^{commit}"
$headCommit = git rev-parse HEAD
$schemaCommit = git rev-parse "task1-data-parallel-baseline-v2^{commit}"
if ($headCommit -ne $launchCommit) { throw "HEAD does not match launch tag" }
if ($schemaCommit -ne "1048681880b51e7a52a6b8b0b731eadeec44e118") { throw "unexpected schema baseline" }
git merge-base --is-ancestor $schemaCommit HEAD
git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD
```

第一条必须显示干净工作树，第二条必须等于该任务的预期分支，HEAD 必须等于 launch Tag 的解引用提交，schema Tag 必须解引用到固定提交，两个祖先检查必须以 0 退出。`git worktree list --porcelain` 必须证明当前路径与预期分支绑定。任一条件不满足时停止并报告，不切换共享工作树，不清理或覆盖其他任务的文件。

一个提交只做一种改造，提交正文写清：

- 生成批次，以及实际使用的外部来源。没有外部来源时明确写 `synthetic`。
- 新增或修改的资产与 case 数。
- 允许的调用链。
- 运行了哪些 Gate。
- 未完成项和已知限制。

文档格式调整不要与资产、schema 或 Gold 变更混在同一提交。

## 失败如何处理

以下情况直接停在当前阶段修正：

- 同一 case 有两个同样合理的首动作。
- Negative 仍然需要目标资产。
- 目标资产没有进入生产可见范围。
- 后续参数只能由模型猜测，不能从前一步响应取得。
- Knowledge 资源不 ready 或工具清单会漂移。
- 开源 Skill 触发描述带强制调用偏置，无法通过中性适配消除。
- 实际导入的外部内容缺少许可证、revision 或必要 hash。
- source-lock 指向的仓库内文件被忽略、缺失，或实际字节 SHA-256 与登记值不一致。
- Dev 和 Hidden 出现 query、上下文、信息缺口或 pair 模板重叠。
- 快照恢复后资产 hash 漂移。

优先修改 case 或替换靶子，不增加复杂兜底。一个 case 连续两轮审查仍无法获得唯一 Gold，就移出正式主集，放入 exploratory 集合，不参与指标。

基础设施失败与模型行为分开。真实服务 5xx、认证失败、Session Init 错误、usage 缺失或 observer 丢 trace 时，该次运行记为 `INFRASTRUCTURE_ERROR`，不修改数据 Gold，也不把它算成漏调。

## 最终完成条件

只有以下条件全部满足，数据集构造才算完成：

- 一个 Space、二十个 Team 的 schema 和 registry 已冻结。
- Dev 320 条、Hidden 480 条均通过 validator。
- 每个 Positive 的首路由和最小链路 Gold 均已冻结。
- 至少二百条 Positive 从真实搜索或发现入口开始，一百条保留直接入口。
- 所有 Skill 搜索 Positive 的目标都不在实际注入 listing 中，并能从 same-Team 池搜到。
- 300 组配对负例通过单变量审查。
- 200 条自然 coding Negative 在完整干扰资产池下可运行。
- Memory、Skill 和最小 Knowledge 资产都能通过真实接口恢复和读取。
- 连续两次恢复得到相同 snapshot hash。
- Provider input 与私有 Gold 完全分离，泄漏为 0。
- Luna 批次级生成记录完整；实际导入外部内容时，source、license 和 adapted diff 完整。
- Dev 与 Hidden 无重复，Hidden 在 Prompt 冻结前保持密封。
- token、usage、Prompt hash 和快照 hash 字段在 runner 产物中都有固定位置。
- 真实链路无模型 Gate 通过。
- 最终交接清单记录 dataset revision、Git commit 和所有已知限制。

达到这些条件后再开始正式 V0 至 V3 逐版本评测。数据构造阶段不提前运行模型分数，也不根据某个 Prompt Variant 的表现调整题目。
