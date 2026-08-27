# 任务一详细实验设置与阶段执行总方案

| 项目 | 当前设置 |
|---|---|
| 状态 | V6.1 合并执行版，已按当前源码结构和实验讨论修订 |
| 适用分支 | `codex/task1-p01-benchmark-harness` |
| 主模型 | `gpt-5.6-luna` |
| 推理强度 | `high` |
| 输出详细度 | `medium` |

本文件统一任务一的实验目标、真实运行链路、数据集、评分、Token 记录、公平性约束和阶段安排。与 `eval/tool-prompt-bench/README.md`、`worlds/README.md` 或旧方案冲突时，正式实验以本文件为准。当前代码中的 Mock Bridge、旧 100 条 case 和已有 3 个 World 仍可用于准备与回归，但不直接代表正式实验结果。

2026-08-28 刷新远端后，生产 V0 基线冻结为 `origin/feat/server_team` 的 `5299c00`。此前 P01 Harness 的历史基点 `c0cf94f` 仅用于解释已有提交，不能继续代表当前生产 Prompt。`5299c00` 新增 header identity 冷启动修复、无 Task 注册和 Pi AgentProfile，代码与正式评测都必须包含这些生产事实。

## 实验只比较系统提示词变体

任务一要验证的是，MemoryProxy 注入 Memory、Skill、Knowledge 工具说明后，模型能否在需要资产时主动调用正确工具，并在普通 coding 任务中不误调用。优化对象是静态工具说明与决策规则，主要包括：

- `<tdai_memory_tools>` 与 `<memory-tools-guide>` 中的触发规则、工具卡和执行协议。
- `<skill_tools>` 与 `<available_skills>` 外层的选择规则。
- `<knowledge_tools>` 中的固定入口、资源选择规则和调用协议。
- 后续可能增加的统一 Tool/No-Tool 策略与共享 HTTP 协议。

L3 画像、L2 场景索引、Skill 列表和 Knowledge 资源标签属于动态资产。它们决定某条题目是否应该调用工具，但不是任务一要优化的对象。同一 case 的动态资产在所有 Variant 之间保持一致，Token 单独记录。

一次运行可以表示为：

\[
Y = F(M, P, Q, C, A, K, H, R)
\]

| 符号 | 含义 | 正式比较要求 |
|---|---|---|
| `M` | 模型、Provider、推理和输出设置 | 固定 |
| `P` | MemoryProxy 注入的 Prompt Variant | 唯一独立变量 |
| `Q` | 当前用户 Query | 固定 |
| `C` | 当前真实会话上下文和工作区 | 固定 |
| `A` | Memory、Skill、Knowledge 资产快照 | 固定 |
| `K` | Capability 与写入开关 | 固定 |
| `H` | Codex 的 Bash 工具接口与运行协议 | 固定 |
| `R` | 真实 Bridge 和 Knowledge 入口合同 | 固定 |
| `Y` | 是否调用、首个工具、参数、Token 和缓存数据 | 测量结果 |

主指标仍是有效调用率、误调用率、工具选择正确率和静态工具说明 Token。Prompt cache 是约束和诊断项。任务一不评价资产抽取质量、资产正文质量、工具返回后的最终代码质量，也不要求把多步任务完整做完。

## 正式评测走到首个真实工具入口

正式运行必须走 MemoryProxy 的生产链路，并由生产 `InjectionPipeline` 在请求期间完成注入。评测 runner 不预先拼出最终系统提示词，也不为正式结果实现一套替代注入逻辑。

```text
World 资产写入真实本地数据栈
  → Codex 正常 Session Init
  → MemoryProxy /codex/{spaceId}/responses
  → 生产 InjectionPipeline 和各 render*Block()
  → 官方 ChatGPT Codex 上游，Luna，high
  → 模型生成 Bash curl
  → MemoryProxy Memory Bridge、Skill Bridge
     或 MemoryKnowledge /tools/list、/tools/call 接收请求
  → 记录首个 TDAI Attempt、入口请求、参数和 Token
  → 当前 case 截止评分
```

源码中的真实层级是 `Space -> Teams -> 选中的 Team -> Agent + 可选 Task -> 固定资产`。请求路径中的 `spaceId` 会成为 `x-tdai-service-id`，用于内核实例和租户路由。Session Init 在当前 Space 内列出 Team，再列出该 Team 中当前用户拥有的 Agent 和团队 Task，最后绑定 Team、Agent 和可选 Task。生产链路允许无 Task 注册，正式 benchmark 为了明确场景和可复现性仍为每条 case 绑定一个 Task。业务 Agent 是资产身份，不是 Codex、Claude Code 或 Pi 客户端。

正式评测使用以下生产 Module 和 Interface：

- 注入 Module：`MemoryProxy/src/injection/` 下的 `InjectionPipeline` 与生产 Injectors。
- Memory Interface：`MemoryProxy/src/memory/memory-bridge.ts` 暴露的 `/memory-bridge/*`。
- Skill Interface：`MemoryProxy/src/skill/skill-bridge.ts` 暴露的 `/skill-bridge/*`。
- Knowledge Interface：`MemoryKnowledge/src/routes/tools.ts` 暴露的 `/tools/list` 和 `/tools/call`。
- 观测 Seam：放在上述真实入口接收请求的位置，只记录并通知 runner，不替代生产实现。
- 评测 Adapter：负责选择 World、完成 Session Init、准备工作区、发起 Codex 请求和汇总观测结果，不负责手写 Prompt 或模拟资产答案。

模型生成工具命令的一轮已经结束后，才会执行 curl。因此 runner 可以完整保存该轮的输入、缓存输入、输出和推理 Token，再在首个 TDAI Attempt 完成分类后停止后续工具循环。普通的 `rg`、读取文件、构建和测试命令不是 TDAI Attempt，不能让 case 提前截止。

### 正式评测与合同测试分开

| 层次 | 链路 | 用途 | 是否进入主指标 |
|---|---|---|---|
| 纯函数测试 | `render*Block()`、Compiler、Token 统计 | 确认输出、确定性和预算 | 否 |
| 合同测试 | Safe Parser、Mock Bridge、冻结 Gold 序列 | 确认 endpoint、参数和多步绑定可执行 | 否 |
| 正式首调用评测 | 真实 MemoryProxy、真实数据栈、官方模型、真实入口 | 测模型是否在正确时机选择首个工具 | 是 |
| 小型完整链路 smoke | 真实入口继续执行少量代表性序列 | 证明下游合同没有断 | 只作附录 |

`mock-bridge.ts` 继续服务单元测试、评分器测试和协议 smoke。它不能作为 V0 与候选版本正式指标的调用终点。正式结果也不要求等待资产正文返回或让模型继续完成最终 coding 任务。

## 固定运行配置

正式 Campaign 固定以下设置，Variant 不得单独覆盖：

| 项目 | 固定值 |
|---|---|
| 客户端 | Codex CLI，`agentSource=codex` |
| 模型 | `gpt-5.6-luna` |
| reasoning effort | `high` |
| verbosity | `medium` |
| 上游 | 当前官方 ChatGPT Codex endpoint |
| 模型请求路径 | 必须经过当前构建的 MemoryProxy |
| Agent | 每个 Team 一个中性的 General Software Engineering Agent |
| Agent 描述与 prompt | 不写工具选择、调用倾向或 Gold 提示 |
| Memory | 开启读取能力 |
| Skill | 开启读取能力 |
| Wiki 与 Code Graph | 开启 |
| LLM 直接写入 | 关闭 |
| 自动资产抽取与归档写回 | 关闭 |
| 主实验重复 | Dev 单次，入围复核和 Test 三次 |

Primary Campaign 只用 Luna。若时间和预算允许，可在最终候选冻结后增加第二模型复核，结果单独成表，不能与 Luna 汇总成一个比例。

Capability Fixture 在 V0、V0-C、V1 和 V2 中保持不变。V3 只根据生产源码已经存在的 Injector、`AssetCapabilityFlags`、Memory、Knowledge、`allowLlmWrite` 和 `isExtractionAllowed()` 等能力事实，对不可执行工具做确定性裁剪。正式 Fixture 关闭自动 Skill 抽取后，V3 移除依赖 conversation buffer 的 `skill_extract`；V0 至 V2 仍保留原 Prompt 暴露面，保证前序版本只比较各自声明的改造。任务一不新增 `allowLlmExtract` 或其他产品能力开关，也不改变 Bridge 权限。此时改变的是 Prompt 暴露面，运行时配置保持原值。

## 正式数据集采用共享 World

### 当前数据只能作为准备材料

仓库中现有两组数据：

| 数据 | 当前规模 | 后续定位 |
|---|---:|---|
| `case-definitions.ts` 生成的冻结数据 | Dev 60，Test 40 | Schema、Parser、Scorer 和 Mock 合同回归 |
| `worlds/` 中的种子数据 | 3 个 World，48 条 case | 共享世界结构、资产密度和 loader 的 Pilot |

旧 100 条 case 大多是一题一个小 fixture，上下文、同类干扰资产和本地工作区不足，不能作为最终 V0 与 Final 的唯一证据。现有 3 个 World 已经被开发过程查看和修改，其中原标记为 test 的 World 也不能继续当 Sealed Test。正式切分时，W01 至 W03 全部归入 Pilot 或 Dev。

### World 与源码实体的映射

一个 World 对应一个 Space。每个 Space 包含两个 Team，每个 Team 放十个真实编程 Task，共二十条 case。每条 case 在 Session Init 中选择一个 Team、一个中性 Agent 和一个 Task。

```text
World = Space
├─ Team A
│  ├─ General Software Engineering Agent
│  ├─ 10 个 Task
│  └─ 多个项目主题的 Memory、Skill、Knowledge
└─ Team B
   ├─ General Software Engineering Agent
   ├─ 10 个 Task
   └─ 多个项目主题的 Memory、Skill、Knowledge
```

Session 绑定 Team 后，另一个 Team 的资产不会被该 Session 看到，不能拿它们充当干扰项。强干扰资产必须放在当前活动 Team 内，包括同领域但错误仓库、旧版本流程、相似 Skill 和相关但不足以回答问题的 Knowledge。

源码没有一项通用的 `projectId` 运行参数。项目语义通过 Task 的标题和描述、工作区文件、Git 仓库信息、Knowledge 的 `repo_url` 或 `repo_slug`、历史对话和 Memory 内容表达。数据集内部可以保留 `projectRef` 方便组织，但不能把它作为虚构参数注入真实请求。

### 规模与切分

正式目标是 10 个 Space，共 200 条 case。切分单位是完整 Space，不能把同一 Space 的 case 分到 Dev 和 Test。

| Split | Space | Memory | Skill | Knowledge | No Tool | 合计 |
|---|---:|---:|---:|---:|---:|---:|
| Dev | 6 | 30 | 30 | 18 | 42 | 120 |
| Test | 4 | 20 | 20 | 12 | 28 | 80 |
| 合计 | 10 | 50 | 50 | 30 | 70 | 200 |

每个 Space 固定 20 条，类别分布为 Memory 5、Skill 5、Knowledge 3、No Tool 7。Smoke 从 6 个 Dev Space 中各选 2 条，共 12 条，不增加重复 case。

建议的编号和使用顺序如下：

- W01 至 W03：现有 Pilot，修订后进入 Dev。
- W04 至 W06：新增 Dev World。
- W07 至 W10：新增 Sealed Test World，只做结构、资产和 Gold 合同验证，不用模型结果调 Prompt。

Dev 与 Test 之间不得复用可识别的 Skill 名、Memory id、session id、L2 路径、Knowledge id、仓库 slug 或原样 Query。题型模板可以一致，具体语义和资产必须独立。

### 每个 Team 的资产密度

| 资产 | 推荐密度 | 设计要求 |
|---|---:|---|
| 项目主题 | 3 至 4 个 | 同一技术域中既有目标项目，也有相似项目 |
| 活动 Agent | 1 个 | 中性描述，不携带工具提示 |
| Memory 来源 Agent | 0 至 2 个 | 仅用于同 Team 的导入记忆，不参与当前 Session 选择 |
| 历史 Session | 10 至 15 个 | 覆盖当前和其他项目主题，包含新旧状态 |
| 历史对话轮次 | 50 至 100 轮 | 目标事实不能只靠关键词命中 |
| Atomic Memory | 30 至 50 条 | 包含目标、近义干扰、旧版本和无关项 |
| L2 Scene | 6 至 10 个 | 路径稳定，直接读取和先发现两类 case 都可构造 |
| L3 Profile | 1 份 | 只放长期画像，不泄漏需要搜索的具体答案 |
| Team Skill Pool | 20 至 30 个 | 目标 Skill、近义 Skill、旧流程和其他项目流程并存 |
| 注入 Skill Listing | 8 至 12 个 | 不超过生产 TopK 和字符预算，顺序固定 |
| Knowledge | 4 至 6 个 | 目标仓库或 Wiki 与相似、过期、错仓库资源并存 |
| 当前上下文 | 0 至 6 条真实消息 | 作为 Responses 历史消息发送，不塞进 developer instructions |
| 工作区 | 活动项目的真实最小文件集 | No Tool 和本地源码优先题必须能从文件直接完成 |

资产密度是目标范围，不要求每个 Team 机械达到同一个数字。每个正式 case 必须通过唯一性审计和干扰项审计。只有数量、没有语义竞争的资产不能算有效干扰。

### 题型覆盖

Memory case 覆盖语义记忆搜索、原始会话搜索、已知 session 回放、atomic 条件查询、已知 L2 路径读取和场景发现。Skill case 覆盖已在 Listing 中直接查看、团队库搜索后查看、manifest 后读取资源。Knowledge case 覆盖仓库匹配的 Code Graph 与团队 Wiki。No Tool 覆盖自包含 coding、答案已在当前上下文、本地源码优先、词面重叠和错误资产硬负例。

每条正样本都要让正确首动作唯一，或在 Gold 中显式列出多个允许首动作：

- Memory 搜索题的答案不能同时出现在当前上下文或 L3。
- 原始会话题不能把相同答案复制进 Atomic Memory。
- `read_scene` 的路径必须来自已注入索引或允许的发现动作。
- `skill_view` 的目标必须在 Listing 中，`skill_search` 的目标不能已经出现在 Listing。
- `files_read` 的路径必须来自目标 Skill manifest。
- Code Graph 必须与当前工作区仓库匹配。
- Wiki 内容要与问题实质相关，词面相似不足以成为 Gold。
- No Tool case 仍加载 Memory、Skill 和 Knowledge 干扰资产，不能用空资产环境降低误调用。

### 数据集中只保存真实输入和隐藏 Gold

建议的 case 结构如下。`worldId`、引用和 Gold 由 loader 与 scorer 使用，不直接写入模型 Prompt。

```ts
interface WorldEvalCase {
  caseId: string;
  split: "dev" | "test";
  worldId: string;
  activeTeamRef: string;
  activeAgentRef: string;
  activeTaskRef: string;
  projectRef: string;
  contextMessages: Array<{ role: "user" | "assistant"; content: string }>;
  query: string;
  workspaceRef: string;
  gold: {
    needTdaiTool: boolean;
    family?: "memory" | "skill" | "knowledge";
    allowedFirstActions?: AllowedAction[];
    maxTdaiAttempts: number;
    negativeType?: string;
  };
}
```

运行时只通过真实入口传递 `spaceId`，通过 Session Init 选择 Team、Agent 和 Task，再发送历史消息、当前 Query 和工作区。`family`、`allowedFirstActions`、`negativeType` 等标签只在运行结束后评分。

### 资产构造和冻结流程

1. 先定义 World、Team、项目主题和二十个真实 Task，确定每条题目的信息缺口。
2. 构造历史对话、Memory、Skill 和 Knowledge，并加入同 Team 的强干扰项。
3. 通过现有数据面 Interface 上传或导入真实本地 MemoryCore、Skill 和 MemoryKnowledge。自动资产抽取不是前置条件。
4. 通过面板或读取 Interface 抽查资产，确认 id、归属、内容、Listing、仓库绑定和时间信息正确。
5. 保存可复现快照和清单，记录内容 hash、数量、导入脚本版本、Space、Team、Agent、Task 和 Knowledge 绑定。
6. 再编写 Query、当前上下文、工作区和 Gold，并运行唯一性、泄漏和合同验证。
7. 冻结 `fixture_snapshot_sha256`。同一 `case × model` 的所有 Variant 使用同一快照。

资产验证看的是能否支持唯一的工具决策，不评价自动抽取算法的质量。若直接上传已经构造好的资产，报告中应明确说明资产是 benchmark-owned snapshot。

## 首调用评分合同

### 哪些行为算 TDAI Attempt

只识别明确指向 TDAI 的请求：

- `/memory-bridge/*`
- `/skill-bridge/*`
- `/tools/list`
- `/tools/call`
- 后续经 Runtime Contract 登记的其他 TDAI 路径

普通 Bash、读取本地文件、运行测试、自然语言提到工具、代码块中未执行的 curl 都不算 TDAI Attempt。

每条运行按以下状态分类：

| 状态 | 含义 |
|---|---|
| `NO_TDAI_ATTEMPT` | 模型完成当前轮，没有尝试 TDAI |
| `MALFORMED_TDAI_ATTEMPT` | 有明确 TDAI 意图，但命令、路径、请求头或 JSON 无法形成合法请求 |
| `WRONG_TDAI_CALL` | 合法请求进入真实入口，但 Family、工具、资源或最小参数不符合 Gold |
| `CORRECT_TDAI_CALL` | 首个合法请求进入正确真实入口，工具和最小参数符合 Gold |
| `INFRASTRUCTURE_ERROR` | 上游、Proxy、数据栈、认证或 runner 异常，无法观察模型行为 |

正样本中，`CORRECT_TDAI_CALL` 表示任务一的首个有效调用成功。没有调用是漏调，错误 Family 或工具是选错，malformed 单独记录。No Tool 样本出现任何 TDAI Attempt 都算误调用，即使 Safe Parser 或真实入口随后拒绝。

### 多步 case 只评第一步

主实验保留多步任务语义，但只检查该任务的正确第一步：

| 完整语义 | 正式 Gold 首动作 |
|---|---|
| `skill_search -> skill_view -> files_read` | `skill_search`，搜索词需指向目标 Skill |
| `scenario_ls -> read_scene` | `scenario_ls`，过滤范围需正确 |
| `conversation_search -> conversation_query` | `conversation_search` |
| Knowledge `tools/list -> tools/call` | 正确 `knowledge_id` 的 `/tools/list` |
| 已知 Skill 名直接读取 | `skill_view` |
| 已知 scene 路径直接读取 | `read_scene` |

完整序列仍保存在合同数据中，由 Mock Bridge 和少量真实链路 smoke 验证。它不进入任务一主表的有效调用率，避免资产返回质量、第二步参数绑定和最终回答能力混入 Prompt 触发效果。

### 指标与公式

基础设施错误单独报告，不进入行为分母。主表同时给出百分比和整数分子、分母。

设 `P` 为有效正样本，`N` 为有效 No Tool 样本：

\[
TriggerRecall = \frac{P\ 中出现任意\ TDAI\ Attempt}{P}
\]

\[
EffectiveCallRate = \frac{P\ 中首个调用为\ CORRECT\_TDAI\_CALL}{P}
\]

\[
FalseCallRate = \frac{N\ 中出现任意\ TDAI\ Attempt}{N}
\]

\[
ConditionalToolAt1 = \frac{P\ 中首个\ Attempt\ 选择正确}{P\ 中有\ Attempt\ 的样本}
\]

| 指标 | 角色 | 说明 |
|---|---|---|
| Effective Call Rate | Primary | 应调用时，首个合法请求进入正确入口的比例 |
| False Call Rate | Primary | 不应调用时出现任意 TDAI Attempt 的比例 |
| Conditional Tool@1 | Primary | 已经决定调用后，首个 Family、工具和资源选对的比例 |
| Static Tool Tokens | Primary | 静态工具说明的固定编码 Token |
| Trigger Recall | Diagnostic | 区分没有触发与触发后选错 |
| FirstAction@1 | Diagnostic | 全部正样本中首动作语义正确的比例 |
| Malformed Attempt Rate | Diagnostic | TDAI 意图无法形成合法请求的比例 |
| Entry FCR | Diagnostic | No Tool 中真正到达 TDAI 入口的比例 |
| 总输入与输出 Token | Cost | 模型实际 usage，不代替静态注入 Token |
| 完整序列成功率 | Contract smoke | 不进入主实验结论 |

如果一个 case 合理允许多个第一步，`allowedFirstActions` 必须在数据冻结前登记。运行结束后不能因为模型选了另一个动作再修改 Gold。

## Token 与 Prompt Cache 全量保存

Token 统计分成静态工具说明、动态资产、运行时绑定和 Provider usage 四层。固定使用 `o200k_base` 作为跨 Variant 的比较编码，它是 benchmark 计数口径，不等同于 Provider 账单。

### 每个注入块都记录

```json
{
  "blockId": "skill_tools",
  "kind": "static_tool",
  "chars": 0,
  "utf8Bytes": 0,
  "tokensO200k": 0,
  "sha256": "",
  "injectionPoint": "system.before_tools"
}
```

`kind` 至少区分：

- `static_tool`：全局规则、工具卡、共享协议。
- `dynamic_profile`：L3 与 L2 索引。
- `dynamic_skill`：当前 Listing。
- `dynamic_knowledge`：绑定资源标签。
- `runtime_binding`：Space、Session、稳定 origin 等运行信息。

每个 run 保存以下数值：

| 类别 | 字段 |
|---|---|
| 注入块 | chars、UTF-8 bytes、`o200k_base` tokens、SHA-256 |
| 优化目标 | `staticToolTokens` |
| 动态成本 | `dynamicAssetTokens` |
| 总注入 | `totalTdaiInjectedTokens` |
| 模型输入 | `inputTokens`、`cachedInputTokens`、`cacheWriteInputTokens` |
| 模型输出 | `outputTokens`、`reasoningOutputTokens` |
| 节省量 | 相对 V0 的绝对 Token 和百分比 |

生产 InjectionPipeline 必须导出或观测最终 Provider-visible system/developer 内容。`prompt.txt` 保存实际注入结果，不能保存 runner 自己重建的近似版本。

### 缓存记录四层 Hash

| Hash | 内容 |
|---|---|
| `staticTemplateSha256` | 把 Session、Space、随机端口规范化后的静态 Prompt |
| `runtimeBindingSha256` | 本次 Session、Space 和 origin 绑定 |
| `dynamicAssetSha256` | Profile、Listing 和 Knowledge 资源 |
| `effectiveSystemSha256` | 实际发给 Provider 的完整字节 |

还要记录稳定前缀首次变化的字节位置、字符位置和估算 Token 位置。候选可以修改计划内的注入块，不能把动态内容提前到原本稳定的公共前缀。Provider 返回的 `cachedInputTokens` 是运行事实，但服务端命中会受时间影响，不能单独证明 Prompt cache 结构稳定。

Campaign 汇总至少给出：

- 每个 Variant 的静态、动态和总注入 Token 分布。
- 每个 block 相对 V0 的增减。
- 每个 case 的配对节省量。
- 总输入、缓存输入、输出和推理 Token。
- 静态模板 Hash 稳定率和前缀首次变化位置。

## 公平性与运行隔离

### 资产和服务状态

每个 World 有一份不可变的真实数据栈快照。正式 Campaign 开始前恢复该快照，关闭 L0 写回、自动 Skill 抽取、自动归档和其他会改变资产的路径。若某项写回无法关闭，则每个 Variant 运行前恢复同一快照副本。

不需要为每条 case 反复导入全部资产。只要所有正式路径只读，可以在一个 Campaign 内复用同一 World 实例，并在开始和结束时核对快照 hash、资产数量和最新更新时间。

### Codex 本地状态

每个 `case × variant × repeat` 使用新的：

- Codex 进程。
- Session 与 run id。
- 临时工作目录和活动项目文件。
- `CODEX_SQLITE_HOME`。
- 临时 `HOME` 与 `USERPROFILE`。
- 本地 trace 与产物目录。

runner 使用 `codex exec --ephemeral --ignore-rules --ignore-user-config --json`，并关闭用户 Plugins、Apps、多 Agent、Skill search 和个人 Skill instructions。认证继续引用当前官方 Codex 已登录的 `CODEX_HOME`，不得复制、编辑或替换 `auth.json`，也不改用户的全局 Codex 配置。

正式 Campaign 串行运行，避免认证刷新竞争。实验期间不执行 `codex login` 或 `codex logout`。所有实验差异通过本次命令参数和 benchmark 专用配置传入。

### 顺序和时间影响

同一轮不要先跑完全部 V0，再跑全部候选。runner 用固定随机种子按 case 交错 Variant，并在 repeat 间轮换顺序：

```text
case 1: V0, V1, V2
case 2: V1, V2, V0
case 3: V2, V0, V1
```

每次保存模型名、Codex CLI 版本、MemoryProxy commit、数据快照 hash、运行时间和 Variant 顺序。若模型 alias、CLI 或 Proxy build 改变，前后运行不能合并。

Langfuse 只承担请求观察和人工排查。正式真值来自本地的模型事件、真实入口观测、Prompt 快照、usage 和评分文件。Langfuse 未启动不会改变评分，但运行清单需要记录其状态。

### 基础设施错误

以下情况标记为 `INFRASTRUCTURE_ERROR`：

- Codex 或 MemoryProxy 异常退出、超时。
- Session Init 未绑定预期 Space、Team、Agent、Task。
- 数据栈或真实 Bridge 不可用。
- 当前快照、模型、CLI 或 Variant 与清单不一致。
- Prompt 观测缺失，无法确认生产注入结果。
- 执行策略拦截导致模型行为无法完成观测。

基础设施错误应重跑，不能算漏调或正确克制。模型生成了可识别的 malformed TDAI 命令属于行为结果，不是基础设施错误。

## Prompt Variant 是递进关系

| Variant | 唯一改造类型 | 与前一版本的关系 |
|---|---|---|
| V0 | `5299c00` 当前生产 Prompt 字节冻结 | 基线 |
| V0-C | 只修已由源码或 Contract Probe 证明的合同错误 | 在 V0 上纠错 |
| V1a | 共享 curl、Header、错误处理和响应说明，删每工具重复协议 | 在 V0-C 上继续改造 |
| V1b / V1 | 在 V1a 上合并跨块触发规则和重复约束 | V1 主线的正式结果 |
| Dedup-only | 只在 V0-C 上做语义去重 | 可选归因消融，不属于递进主线 |
| V2 | 全局 Tool/No-Tool Gate、Family Gate、when/avoid/contrast 和中性措辞 | 在选中的 V1 上深入 |
| V3 | Capability 与生命周期确定性裁剪 | 在 V2 上深入 |
| V3-A | PromptUnit 分组删除 | 可选深化 |

正式主线按 `V0 -> V0-C -> V1a -> V1b/V1 -> V2 -> V3` 递进。需要单独判断语义去重贡献时，可以增加 Dedup-only 消融，但不为它维护另一条生产演进路线。所有中间产物都要保存，Final 不必是编号最大的版本。如果 V1a 效果最好，它仍可进入最终 Test。

V0-C 不允许顺便删重复规则、调整触发条件或中立化措辞。V1a 不改变触发语义，V1b 不增加 `avoid/contrast`，V2 不移动注入位置，V3 不根据当前 Query 动态裁剪。跨 Anchor 或注入位置变化只能作为独立 Layout Probe。

## 完整 Compiler 进入工程主线

目标工程结构保留 V6.1 的完整 Compiler：

```text
Bridge Allowlist + Core Schema + Contract Probe
                    ↓
          RuntimeToolContract
             ↙             ↘
     ToolPromptSpec       Evaluator
             ↓
          PromptUnit
             ↓
        Prompt Compiler
             ↓
 legacy / contract-corrected / protocol-compact / compact
 selection-calibrated / capability-pruned
```

`RuntimeToolContract` 保存真实 method、path、Header、参数、响应类型和 Capability。`ToolPromptSpec` 只保存模型决策语义。`PromptUnit` 是由 Spec 编译出的稳定语义单元，不能成为第三份手写文案。Evaluator 直接消费 Runtime Contract，不能从 Compiler 输出反推真值，否则错误 Prompt 会和错误评分器互相证明。Legacy profile 继续调用冻结的旧 Renderer，非 Legacy profile 才进入 Compiler，避免用 Compiler 的输出反向证明 V0 等价。

Compiler 第一阶段保持现有 Hook id、注入 point、anchor、priority 和物理块顺序。内部 `V0-R` 需要与 V0 达到字节级 parity，且同一输入重复编译的 hash 一致。完整 Compiler 是代码主方案。若约定检查点前 parity 仍未通过，必须在 C00 Gate 中明确批准 Thin Renderer fallback，记录延期能力和补齐点。代码线没有通过该 Gate 以前，不得开始正式模型评测。

## 七阶段执行计划

数据准备与代码改造分别在独立分支和会话中并行进行。P01 负责数据与真实链路准备，P02 至 P03 负责代码实现。两边都冻结后才进入 P04，之前不调用 Luna 调整 Prompt。代码阶段的详细分支、检查和交接规则以 [TASK1-CODE-STAGE-GATED-EXECUTION-PLAN.md](./TASK1-CODE-STAGE-GATED-EXECUTION-PLAN.md) 为准。

### P00：冻结范围、合同和实验清单

时间：Day 1。

工作内容：

- 冻结当前 commit、dirty state 和 V0 Provider-visible Prompt。
- 冻结真实 Bridge Allowlist、Core Schema、Capability Signature 和 Host Bash Schema。
- 确认主指标采用首个真实入口截止，不采用完整序列 ECR。
- 冻结模型、Codex CLI、上游、Session Init 路径和 Token 编码。
- 给 case 增加 `worldId`、`activeTeamRef`、`activeAgentRef`、`activeTaskRef`、`groupId` 和 `allowedFirstActions`。
- 冻结 Dev/Test World 规划和运行预算。

Gate：任何人只看冻结清单和一条 case，都能判断哪些内容是独立变量、哪些内容进入 Prompt、何时截止评分。

阶段产物：`v0-prompt-snapshot`、`runtime-contract-inventory`、`experiment-freeze-manifest` 和本文件。

### P01：真实链路 Harness、World 数据和评分真值

时间：Day 2 至 Day 4。当前分支的工作属于这一阶段。

工作内容：

- 为正式模式增加真实 World Loader，通过现有数据面 Interface 准备 Space、Team、Agent、Task 和资产快照。
- 让 runner 走正常 Session Init 和生产 InjectionPipeline，不再预渲染正式 Prompt。
- 在 Memory Bridge、Skill Bridge 和 Knowledge 入口建立只读观测 Seam。
- 把 Attempt、Malformed Attempt、真实 Entry Call 和 Infrastructure Error 分开。
- 把历史上下文作为真实 Responses 消息发送，把活动项目文件写入临时工作区。
- 保留 Mock Bridge 的 100 case 回归和完整 Gold 序列 smoke。
- 完成 W01 至 W03 Pilot，随后补齐 W04 至 W06 Dev。
- 创建 W07 至 W10 Test，做结构与合同验证后封存。

Gate：十个 World 都能完成无模型 dry run、Session Init、生产 Prompt 捕获和合同重放。数据与真实资产快照冻结，运行前后资产 hash 不变。模型驱动的 12 条 Smoke 留到 P04，不在数据准备阶段执行。

阶段产物：World manifest、snapshot manifest、真实链路 runner、无模型 dry-run manifest 和合同 trace。

### P02：完成 Compiler 基础设施与 V0-C

时间：Day 5。

工作内容：

- 在独立 C00 分支完成 RuntimeToolContract、ToolPromptSpec、PromptUnit、Compiler 和 V0-R parity。
- C00 通过并合回代码集成主线后，从最新集成提交创建独立 C01 分支。
- 运行 Contract Probe，确认 endpoint、method、Header、参数、Capability 和返回类型。
- 只把证据充分的合同错误改成 V0-C，不混入压缩和选择语义。
- 保存 V0 与 V0-C 的 Prompt、逐块 Token、bytes、hash 和稳定前缀，不运行模型。

Gate：V0-R 达到字节级 parity，V0 与 V0-C 的差异清单中没有语义压缩改动，每项 V0-C 修改都能指向源码事实或 Contract Probe。C00 与 C01 各自通过 Gate 并分别合回代码集成主线。

阶段产物：Compiler、V0 与 V0-C Prompt 快照、Token 清单、合同修复清单和 C00/C01 Gate 报告。

### P03：按改造类型完成 Prompt Variant 与 Compiler

时间：Day 6 至 Day 9。

这一阶段每次完成一种改造，并保留一个可独立运行的中间版本：

1. 从 C01 合并提交创建独立 C02 分支，在 V0-C 上完成 V1a Protocol Compact。
2. C02 通过并合并后创建独立 C03 分支，在 V1a 上完成 V1b Semantic Dedup，形成正式 V1。
3. C03 通过并合并后创建独立 C04 分支，在正式 V1 上完成 V2 Selection Calibration。
4. C04 通过并合并后创建独立 C05 分支，在 V2 上只根据现有生产能力完成 V3 Capability/Lifecycle Pruning，不新增能力开关。
5. C05 通过并合并后创建独立 C06 分支，完成全 profile 回归、Token 清单和代码冻结。

若需要归因，可以额外渲染 V0-C 加 Semantic Dedup 的 Dedup-only 消融，但不为它建立生产演进分支。

每一种改造必须使用独立阶段分支。阶段 Gate 通过后先非 squash 合回代码集成主线，复跑关键检查，再从最新集成提交创建下一阶段分支。提交信息写清改造类型、保持不变的合同、Token 变化和验证结果。不要把协议压缩、语义去重、选择校准和 Layout 移动塞进同一个分支或提交。

Gate：每个 Variant 只有声明的改造类型发生变化，静态 Prompt diff 可审计，Compiler 输出确定，合同测试通过，Token 与 hash 产物完整，类型检查相对基线没有新增错误。本阶段不运行 Luna。

阶段产物：V1a、V1b、V1、V2、V3 Prompt 快照、Token diff、阶段分支、Gate 报告和唯一 code-freeze commit。

### P04：合并冻结产物并逐版本完成 Dev 评测

时间：Day 10。

工作内容：

- 只在 P01 数据 Gate 与 P03 代码 Gate 都通过后建立实验集成分支。
- 先用 V0 完成 12 条真实链路 Smoke，确认 Session Init、生产 InjectionPipeline、真实入口观测和本地产物完整。
- 依次完成 V0 对 V0-C、V0-C 对 V1a、V1a 对 V1、V1 对 V2、V2 对 V3 的 120 条 Dev 配对比较。
- 每一组完成并做出阶段决定后才运行下一组，同组两个 Variant 按 case 交错。
- 对 V0-C、V1 和 V2 交错运行固定的 Baseline Sentinel，观察时间漂移。
- 先应用行为 Gate，再比较 FCR、Static Tool Tokens 和改动范围。
- 对 V0、V0-C 和最多两个候选各做三次入围复核。
- 冻结 Final Prompt、Compiler profile、Scorer、数据、快照和运行命令。

硬 Gate：无合同漂移，无 Capability leak，不新增自包含 coding 的误调用；Final 的有效调用正确数和首动作正确数相对 V0-C 的下降，不得超过预登记的整数 case margin；静态工具 Token 低于 V0-C。

优秀目标：Pure Coding FCR 为 0，整体 FCR 下降，Conditional Tool@1 不下降，静态工具 Token 至少减少 25%。25% 是目标，不应为了达到数字删除必要触发信息。

阶段产物：12 条 Smoke 报告、各相邻版本配对结果、Pareto 表、候选选择记录和 Final freeze manifest。

### P05：Sealed Test、Cache 和真实链路复核

时间：Day 11 至 Day 12。

工作内容：

- 只运行 V0、V0-C 和 Final，不再修改 Prompt 或 Gold。
- 在 80 条 Test 上每个 Variant 运行三次，按 case 和 repeat 交错。
- 保存完整 Token、Hash、稳定前缀和 Provider usage。
- 在每个 Family 选少量 case 做完整真实链路 smoke，结果单独报告。
- 若预算允许，增加第二模型的平衡子集复核，不与 Luna 合并。

Gate：Test 运行期间没有 Prompt、Gold、资产或 scorer 修改。基础设施错误重跑后仍单独列出，所有主指标都有整数分子、分母和配对差异。

阶段产物：Sealed Luna 结果、Cache 检查、完整链路 smoke、可选第二模型附录。

### P06：统计、实验报告和代码 PR

时间：Day 13 至 Day 14。

工作内容：

- 汇总 V0、V0-C 和 Final 的四项主指标。
- 分开报告静态工具 Token、动态资产 Token 和实际模型 usage。
- 报告 Attempt FCR、Entry FCR、Malformed Rate 和失败分类。
- 给出每个 Prompt 改造与失败 Trace 的对应关系。
- 写明 Compiler、合同、Harness 和生产 Prompt 的工程贡献，避免把基础设施改造表述成模型能力提升。
- 整理复现命令、运行环境、快照、已知限制和回退方式。

Gate：实验报告、优化方案、代码 diff 和复现产物互相对得上，Reviewer 可以从主表追到单 case 的 Prompt、事件、入口请求和 Token。

阶段产物：实验报告、优化方案说明、代码 PR 和 Reviewer 索引。

### Day 15 至 Day 16 的可选深化

有余量时按失败 Trace 选择一项：

- PromptUnit grouped ablation，生成 Prompt Necessity Map。
- Skill Listing 仍是主要问题时做 Safe Listing Pack。
- 增加第二模型复核。

这些实验不能改变已冻结的 Luna 主结论。

## 实验运行产物必须完整保存

建议目录：

```text
eval/tool-prompt-bench/
├─ worlds/                         # World 源数据和生成器
├─ snapshots/                      # 不提交大文件，只提交 manifest 和恢复说明
├─ contracts/                      # RuntimeToolContract 与 Probe
├─ variants/                       # V0、V0-C、V1、V2 等快照和 hash
├─ runs/<campaign>/<case>/<run>/   # 本地原始运行产物，默认 gitignore
└─ reports/                        # 阶段汇总和最终报告
```

每个 run 至少保存：

| 文件 | 内容 |
|---|---|
| `run-manifest.json` | case、World、Space、Team、Agent、Task、模型、CLI、commit、快照和顺序 |
| `provider-prompt.json` | 生产 Proxy 实际发出的 system/developer/messages |
| `injection-blocks.json` | 每个注入块的类型、Token、bytes、hash 和注入点 |
| `codex-events.jsonl` | Codex 原始事件 |
| `codex-stderr.log` | stderr 和退出信息 |
| `entry-trace.jsonl` | 真实入口收到的首个 TDAI 请求 |
| `usage.json` | 输入、缓存、输出、推理和注入 Token |
| `evaluation.json` | 状态、Gold 对照、指标贡献和失败原因 |
| `asset-check.json` | 运行前后快照 hash 与资产计数 |

Campaign 至少保存 `campaign-manifest.json`、`scores.jsonl`、`summary.json`、`campaign-usage.json`、`variant-order.json` 和 `infrastructure-errors.jsonl`。任何主表数字都应能回溯到这些原始文件。

## 正式开跑前的总 Gate

满足以下条件后才采集 V0 正式基线：

- W01 至 W06 共 120 条 Dev case 完成结构、唯一性、干扰项和合同验证。
- W07 至 W10 共 80 条 Test case 已冻结，未参与 Prompt 调整。
- 真实本地 MemoryCore、Skill 和 MemoryKnowledge 可以从同一快照恢复。
- 自动写回和抽取已关闭，或每个 Variant 前能恢复同一快照。
- 12 条 Smoke 全部经过正常 Session Init 和生产 InjectionPipeline。
- runner 没有预渲染正式 Prompt，真实入口观测能区分 Attempt、Malformed 和 Entry Call。
- 工作区文件和历史消息通过真实 Codex 输入加载。
- Luna、`high`、`medium`、CLI 版本、官方上游和 MemoryProxy commit 被完整记录。
- 每个 run 能保存 Provider-visible Prompt、block Token、模型 usage、入口 trace 和评分。
- 当前官方 Codex 登录态不被复制或修改，运行前后桌面端保持登录。

若这组 Gate 尚未全部通过，可以继续做数据、Compiler、Mock 合同和单 case 诊断，但产生的数字只能叫 Pilot，不能写进任务一正式优化前后对比。
