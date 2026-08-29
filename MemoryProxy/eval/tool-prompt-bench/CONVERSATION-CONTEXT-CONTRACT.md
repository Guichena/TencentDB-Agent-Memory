# Task 1 会话上下文构造合同

> 目标：让评测发生在复杂、真实的工程协作上下文中，同时仍能唯一判断模型是否应调用 Memory、Skill、Knowledge 或不调用。正式实验在目标资产所需的完整最小合法 TDAI 链路完成后停止，不执行后续 coding 任务。

## 1. 三层上下文必须分开

| 层 | 模型如何获得 | 内容 | 评测作用 |
|---|---|---|---|
| 当前可见会话 | 作为 `contextMessages` 随 Responses 请求发送 | 当前任务讨论、已有尝试、代码/日志片段、限制条件、临时结论 | 判断当前信息是否已经充分；构造 paired Positive/Negative |
| 同 Team 历史 | 作为历史 Session、L1、L2 存在 MemoryProxy | 过去任务、决策、踩坑、版本变更、已废弃结论 | Memory Positive 的目标与同域干扰 |
| 当前 Team 资产 | 通过真实 Skill listing/search 和 Knowledge binding 可见 | 目标 Skill、近义/旧版 Skill、Wiki、CodeGraph | Skill/Knowledge Positive 与错误家族选择 |

另一个 Team 的资产用于 ACL 隔离检查，不属于当前模型可见干扰，不能拿它增加题目难度。

## 2. 当前会话的推荐复杂度

不是每条 Case 都做成同样长度，避免模型从长度猜 Gold：

| 档位 | `contextMessages` | Case 占比 | 典型形态 |
|---|---:|---:|---|
| 短 | 4 至 6 条 | 20% | 新任务、一次澄清、一个小日志片段 |
| 中 | 8 至 12 条 | 60% | 需求、初步排查、失败尝试、版本或测试约束、当前结论 |
| 长 | 14 至 20 条 | 20% | 多人交接式讨论、两个并行问题、旧方案被否定、局部代码与日志、最终收口请求 |

每个 Team 作为背景维护：

- 3 至 6 个同时推进的项目主题；
- 8 至 12 个历史 Session，每个 Session 含 12 至 40 条自然、内部一致的消息；
- 12 至 20 条 Atomic Memory，含 active、superseded、invalid 和近义事实；
- 4 至 6 个 L2 Scene；
- 14 至 20 个同 Team Skill，其中 5 至 7 个进入当前 listing，另外 9 至 13 个通过 search 可发现；
- 当前 Agent 固定绑定 3 个最小 Knowledge 资源，形成一个目标资源和两个同域或错仓库干扰资源。

这些是 World 级共享背景，不为每条 Case 复制一套。Case 只选择与当前 Task 有关的一段可见会话，并使用同一冻结资产快照。

## 3. 一段真实工程会话应包含什么

中长会话从下面六类内容中选择 4～6 类，不机械全部塞入：

1. **任务来源**：用户反馈、issue、review comment、CI 报警或版本迁移要求。
2. **已有排查**：读过哪些文件、跑过什么命令、看到什么症状；不能提前写出目标答案。
3. **失败尝试**：一个合理但无效的修改、错误假设或过期流程。
4. **约束条件**：语言/框架版本、兼容性、不能修改的接口、测试范围、上线时间。
5. **并行干扰**：同一 Team 的另一个项目或近义问题，最多占当前会话三分之一，且不能无意义灌水。
6. **状态收口**：明确“现在已经知道什么、还缺什么”，最后 Query 像真实下一步请求。

允许在 user/assistant 消息中包含短代码、栈信息、命令输出、配置片段和 review 摘要；不复制 benchmark 原题、Skill 名称、工具名称、Gold、reference patch 或完整解决步骤。

## 4. 不同家族的上下文写法

### 4.1 Skill Positive

当前会话应交代项目、任务阶段、症状和约束，但缺少一套团队流程或专门方法。例如已经确认是 Spring namespace 迁移，却没有列出哪些 `javax` 属于 Jakarta、哪些仍属于 JDK。目标 Skill 的 `use_when` 必须覆盖这一缺口，同池近义 Skill 只能部分相关。

不要在 Query 中说“请加载某某 Skill”，也不要把 Skill 正文换一种说法全部放进历史消息。

### 4.2 Memory Positive

当前会话应清楚指向一个过去决策、历史版本、先前排查结论或某次会话，但不包含答案。例如：

- “上个月我们为这个 remote status 行为定过兼容策略，现在这次改动应该沿用哪一个？”
- “之前那个同类 CLS 问题最终证明是字体还是图片造成的？”

答案只存在于可检索历史 Session/L1/L2，不得同时出现在 L3、Skill、Knowledge 或当前对话。

### 4.3 Knowledge Positive

当前会话包含具体 repo、commit 或模块，问题需要当前绑定 Wiki/CodeGraph 才能定位关系；历史记忆和 Skill 只提供一般经验，不能直接给出目标符号或文档结论。

### 4.4 No-tool Negative

仍然加载完整 Memory、Skill、Knowledge 池。当前会话必须已经给出完成首次判断所需的信息，例如明确文件、接口、版本和局部修改要求。它可以很长、含大量资产词面，但不能留下实际信息缺口。

## 5. Positive 与 paired Negative

一对 Case 共享：

- Space、Team、Agent、Task、repo/commit；
- 历史 Session、Memory、Skill、Knowledge 和 listing 顺序；
- 当前会话的大部分消息、语言风格和长度档位；
- 最终 Query 的工作目标。

只改变一个登记过的条件。推荐做法是在 Negative 的倒数第二条消息中补入缺失信息，例如贴出已经确认的迁移清单、过去决策摘要或正确符号位置；Positive 的同一位置放入长度相近但不解决缺口的排查结果。这样正负例不会因为长度、格式或语气形成捷径。

每对保存：

```json
{
  "pairId": "T01-SKILL-001",
  "positiveCaseId": "T01-SKILL-001-P",
  "negativeCaseId": "T01-SKILL-001-N",
  "counterfactualKind": "answer_in_current_context",
  "controlledDeltaSha256": "...",
  "currentEvidenceRefs": ["..."],
  "contentHash": "..."
}
```

这是 `FormalPair` 的正式形状。`changed_message_index`、共享上下文 hash、两侧 delta hash 和单变量审查结论保存在 Luna draft、Team review 或编译报告中，不得作为不存在的正式字段写进 registry。

### 配对示意：同一段复杂会话只改一条信息

共享的前六条消息可以是：

1. user：说明用户服务要从 Spring Boot 2.7 升到 3.2，但本轮只处理 namespace。
2. assistant：汇总已看到的 `javax.persistence`、`javax.validation` 与 `javax.sql`，暂不下结论。
3. user：补充 Java 21、不能改 public DTO、另一个支付项目的 Security 迁移暂时不要混进来。
4. assistant：说明编译失败集中在 model 和 request validation，RestClient 另开任务。
5. user：贴出两段短 import 和一条编译错误，说明批量替换曾把 `javax.sql` 也改坏。
6. assistant：确认当前缺口是“哪些 namespace 属于 Jakarta、哪些仍属于 JDK”的迁移边界。

Positive 的第七条只补一个不相关排查结果，例如“测试数据库已经能启动”；最终 Query 要求继续完成 namespace 迁移。此时专门的 Jakarta Skill 合理。

Paired Negative 的第七条改为长度相近的已确认清单，例如“`persistence`/`validation` 换成 `jakarta`，`sql`/`crypto` 保持 `javax`，涉及文件也已列出”；最终 Query 完全相同。此时当前信息已充分，不应因为会话中多次出现 Spring/Jakarta 词面而调用 Skill。

这类复杂度同时测试了版本、并行项目、失败尝试和强词面干扰，但 Gold 的差异仍只有“迁移边界是否已经在当前上下文中给出”。

## 6. Luna 生成规则

Luna 每次按一个 Team/项目批量生成，不按孤立 Case 逐条编故事：

1. 先生成 Team 背景、项目列表、人物职责和时间线。
2. 再生成共享历史 Session 与 active/superseded 决策。
3. 选定目标 Skill/Memory/Knowledge 后，生成一段 6～10 条的主会话。
4. 从主会话派生 Positive 与单变量 Negative。
5. 输出 `context_messages`、`query`、`missing_information`、`visible_distractors`、`pair_delta` 和 `draft_gold_reason`。

Luna 不能决定最终 Gold，也不能在消息中写工具名或 Skill 名；人工只检查自然度、唯一首动作、信息泄漏和 paired delta。正式实验不让 Luna 或被测模型完成后续代码任务。

## 7. 最小审核清单

- [ ] 当前会话像连续讨论，不是几条互不相关的噪声拼接。
- [ ] 中长 Case 至少包含任务来源、已有排查、一个约束和状态收口。
- [ ] 同 Team 并行项目只提供真实近义干扰，不超过可见会话三分之一。
- [ ] Positive 的唯一缺口没有泄漏到当前上下文或其他家族资产。
- [ ] Negative 已在当前上下文补齐该缺口，仍加载相同资产池。
- [ ] 配对只改变一条消息中的一个语义条件，长度和风格大致匹配。
- [ ] 目标 Skill/Memory/Knowledge 名称、工具名和 Gold 未出现在 Provider-visible 输入。
- [ ] 各 Variant 使用完全相同的会话、Query、资产 snapshot 和消息顺序。
