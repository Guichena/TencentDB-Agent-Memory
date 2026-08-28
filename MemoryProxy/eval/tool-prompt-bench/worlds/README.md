# 评测世界（Evaluation Worlds）

这个目录是 World 数据组织方式的 Pilot 实现，与现有 100 条 case 的冻结合同数据集并存。`codex-runner.ts` 能选择这些 World case、落盘活动项目并使用 world-aware Mock Bridge；这些能力用于无模型准备与合同回归，不属于正式主指标链路。

一个 World 是一整套固定的团队资产和历史快照，内部包含多个编程子场景。每条 case 指定一个当前活动子场景，其余子场景的资产自然成为干扰项。

```text
World（一个 EvalFixture，被该 World 的所有 case 共享）
├─ 活动子场景：只有它的文件被写入运行 workspace
└─ 3 个非活动子场景：资产仍然注入，但没有本地代码
```

## 当前状态

3 个 World，48 条 case，五道验证全部通过。当前 `test` 只是 Pilot 层回归标签；W01～W03 均已被开发过程查看，不能作为正式 Sealed Test。

| World | Split | 语言 | 子场景 | Case |
|---|---|---|---|---:|
| W01 MemoryProxy 与 Prompt 优化 | dev | zh | proxy-prompt · GRPO 训练 · RN 移动端 · Spark ETL | 16 |
| W02 Spring Boot / Jakarta 迁移 | dev | en | order-service · 冻结批处理 · payments · infra CLI | 16 |
| W03 React/Three.js 前端性能 | test | zh | web-console · Three.js 视图 · RN 壳 · 边缘网关 | 16 |

每个 World 的 16 条覆盖同一张题型表：记忆语义搜索、新旧版本取舍、原始会话检索、已知 session 回放、已注入场景直读、未注入场景先发现再读、结构化 atomic query、已列出 Skill 直看、团队库搜索后查看、manifest 资源读取、Code Graph 关系查询、Wiki 搜索后读页，以及 4 条 No Tool（自包含 coding、答案已在上下文、词面重叠、错误资产硬负例）。

### 资产密度

| World | 记忆 | 会话 | 会话消息 | 最长会话 | 场景 | 绑定 Skill | 团队 Skill | Knowledge |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| W01 | 20 | 30 | 229 | 30 轮 | 8 | 9 | 16 | 5 |
| W02 | 20 | 31 | 212 | 26 轮 | 7 | 8 | 14 | 5 |
| W03 | 20 | 30 | 200 | 24 轮 | 7 | 8 | 13 | 5 |

会话长度按真实分布：评测题需要"从长会话里捞原话"的那几条写成 18～30 轮，带命令输出、profiler 数据、堆栈和中途反悔；一般讨论 8～16 轮；确认类 2～4 轮。中位数 6 轮。

如果整段只有四句，`tdai_conversation_search` 这类题就是白送的，测不出检索。

### 四道验证

```powershell
npx tsx eval/tool-prompt-bench/worlds/validate-worlds.ts     # 结构、前提一致性、split 不泄漏
npx tsx eval/tool-prompt-bench/worlds/smoke-worlds.ts        # Gold 序列真实可执行并可评分
npx tsx eval/tool-prompt-bench/worlds/audit-worlds.ts        # 答案唯一性与 Token 拆分
npx tsx eval/tool-prompt-bench/worlds/audit-completeness.ts  # 语言一致性与资产齐全度
python  eval/tool-prompt-bench/worlds/check-quotes.py
```

也可以在 `MemoryProxy` 目录一次执行：`npm run eval:tool-prompt:worlds:gate`。

当前结果：

- `validate-worlds`：结构合法，无密度警告。
- `smoke-worlds`：36 条 Gold 序列被**冻结评分器**判为 `CORRECT_CALL`，12 条 No Tool 判为 `NO_TDAI_INTENT`，54 次 Bridge 请求全部 200。
- `audit-worlds`：12 个可排序探针全部让 Gold 排第一且差值为正。
- `audit-completeness`：三个 World 各自单语言，资产密度全部达标，0 gap。

辅助脚本：`probe-discriminate.ts` 用来在内容变动后重新挑选有区分度的检索词；`check-quotes.py` 检测字符串字面量里的嵌套引号（esbuild 会在远处报 `Expected "]"`，很难定位）。

### 注入 Token 拆分

`audit-worlds.ts` 把注入成本分成两部分，因为只有静态部分是任务一的优化对象：

| World | 总注入 | 静态工具说明 | 动态世界资产 | 资产占比 |
|---|---:|---:|---:|---:|
| W01 | 5584 | 3103 | 2481 | 44.4% |
| W02 | 5444 | 3100 | 2344 | 43.1% |
| W03 | 5483 | 3097 | 2386 | 43.5% |

World 资产占注入的四成多。只报告总注入 Token 会让 World 变大稀释静态说明的节省比例，两者必须分开记录。

## Knowledge 是真数据

`worlds-bridge.ts` 包了一层 world-aware Bridge：

- `callers` / `callees` 走真实调用边，返回文件与行号。
- `impact` 做传递闭包遍历，这才是"影响范围"真正问的东西。
- `search` 匹配真实符号；wiki 的 `search` 与 `read_page` 返回真实页面正文。
- 资源没有内容时直接返回 400，而不是合成一个看起来合理的答案。

Memory 与 Skill 全部端点仍然走冻结的 `mock-bridge.ts`，不做任何改动。

最后一条很重要：冻结 Bridge 的 Knowledge 分支是从 summary 合成响应的（`mock-bridge.ts:222-228`），`callers` 返回 repo slug，`read_page` 回显 summary。那足够给工具选择打分，但 Knowledge 题背后没有任何真实内容。严格化之后，W02 和 W03 立刻报出"只声明没内容"，而不是继续给出假答案。

## 构建过程暴露的五个真实问题

前三个是共享世界特有的，后两个是把对话写成真实长度之后才出现的：

1. **中文 query 配英文资产，检索探针命中 0 分。** Mock Bridge 按词面命中打分，`压缩`、`表格` 在英文资产上得 0，排序退化成任意顺序——中文题实际上没有测到检索。现在每个 World 内部统一单语言（W01、W03 中文，W02 英文），标识符、路径、repo slug 仍保持英文。`audit-completeness.ts` 会报出任何混语言的资产类别，`audit-worlds.ts` 把 0 分探针直接判为错误。
2. **15 个 Knowledge 资源只声明了工具、没有任何内容。** 已补齐真实符号、带文件行号的调用边和 wiki 页面正文。
3. **相似 Skill 的 Gold 不唯一。** W02 的 `persistence-descriptor-rewrite` 原本用 `descriptor` 搜索，但 `jakarta-namespace-migration` 的 manifest 里也有 `descriptor-map.md`，两者同分。改用只有前者才有的 `version attribute` 后差值转正。
4. **对话变长之后，原本唯一的探针开始同分。** 会话密度上来以后，多条会话真的都在谈同一主题：W01 的 `prompt cache` 同时命中 cache-safety 和 v0-baseline。这不是内容缺陷，是真实密度的后果。解决办法是改用只有目标会话才有的措辞（`越过前缀`、`version attribute`），并用 `probe-discriminate.ts` 验证差值。
5. **"新旧方案取舍"题的同分是设计意图。** 这类题本来就要求两条记录都被检索出来，再由模型按 `final` 标记和时间戳选择。`WorldCase` 因此有 `disambiguateBy` 字段：声明后审计改为检查"确实存在竞争记录且带判别元数据"，而不是要求排序差值。

## Dev/Test 按 World 切分

`validate-worlds.ts` 的 `checkSplitLeakage` 拒绝任何在 dev World 和 test World 同时出现的 Skill 名、记忆 id、session id、场景路径、Knowledge id 和仓库 slug。

这是这种设计最容易出错的地方：如果同一个 World 的一部分 case 在 Dev、一部分在 Test，Prompt 可能已经针对该 World 的资产名称调过，Test 就不再是未见数据。所以 World 是切分的最小单位，`groupId` 直接等于 `worldId`。

## Pilot runner 接入状态

World Pilot 已接入 `codex-runner.ts` 的 Mock 合同模式：

1. runner 同时解析旧 `CASES/FIXTURES` 和 `WORLD_CASES/WORLD_FIXTURES`，重复 case id 会被拒绝。
2. World case 只把活动项目文件写入独立 workspace，畸形绝对路径和 `..` 逃逸路径会在写入前被拒绝。
3. World case 使用 `startWorldMockServer()`；旧 100 条 case 仍使用冻结的 `startToolPromptMockServer()`。

这不等于正式 P01 真实链路已经完成。正式评测仍需真实 World Loader、正常 Session Init、生产 MemoryProxy 注入、真实数据栈以及首个真实工具入口观测；Mock runner 的 manifest 继续明确标记 `formalMetricEligible: false`。

另外 `validate.ts` 的两个前提不适用于 World：`validate.ts:416` 要求每个 fixture 恰好被一条 case 引用（World 是一对多），`validate.ts:345` 把 code-graph 的 `repo_slug` 硬编码成 Proxy 仓库（World 的活动仓库随子场景变化）。因此 World 走 `validate-worlds.ts` 单独验证，其中 `checkKnowledgeCase` 用"Gold code-graph 必须索引活动子场景的仓库"替换了那条硬编码检查。

`session_init` 的 AgentDetail/TaskDetail 由 `sessionInitDetail(world, project)` 生成，已经就绪。

## 文件

| 文件 | 内容 |
|---|---|
| `world-schema.ts` | World / WorldCase 类型、Gold 简写构造器、`transcript()` 对话解析 |
| `compile.ts` | World → 一个共享 EvalFixture + N 条 ToolPromptEvalCase；workspace 落盘、session_init |
| `worlds-bridge.ts` | world-aware Mock Bridge：Knowledge 走真实图与页面，其余委托冻结 Bridge |
| `w0N-*.assets.ts` | 子场景、L3 画像、记忆、场景、Skill |
| `w0N-*.conversations.ts` | 对话历史 |
| `w0N-*.knowledge.ts` | Code Graph 符号与调用边、Wiki 页面（W01 仍内联在 assets 里） |
| `w0N-*.cases.ts` | 题目与 Gold |
| `w0N-*.ts` | World 装配 |
| `index.ts` | `WORLDS`、`WORLD_FIXTURES`、`WORLD_CASES` |
| `validate-worlds.ts` | 结构、前提一致性、split 泄漏、密度 |
| `smoke-worlds.ts` | 用真实 Bridge 重放每条 Gold 序列，并交冻结评分器打分 |
| `audit-worlds.ts` | 答案唯一性排序审计 + 静态/动态 Token 拆分 |
| `audit-completeness.ts` | 语言一致性与资产齐全度 |
| `probe-discriminate.ts` | 内容变动后重新挑选有区分度的检索词 |
| `check-quotes.py` | 字符串字面量嵌套引号检查 |

资产、对话、Knowledge、题目分成四个文件，是因为一个 World 的资产会被十几条 case 复用，四者的修改频率不同。W01 的 Knowledge 目前仍在 assets 里，下次改动时一并拆出。

## 下一步

- 扩到 6～8 个 World：Python/Scala 数据处理、模型训练与 GRPO、数据库迁移与线上事故、CLI/运维、通用纯 coding。形状不需要再改。
- 语言分布目前是 zh 32 / en 16。补 World 时优先补英文，向 60/40 靠。
- 按 `EXPERIMENT-DESIGN.md` 补齐 W04～W10、真实 World Loader 与生产入口观测，达到 P01 正式 Gate。

## 类似的公开数据集

调研结论：没有现成数据集可以直接用，最接近的几类各缺一块。

**共享世界 + 多任务已有先例。** [τ-bench](https://arxiv.org/abs/2406.12045) 用零售和航空两个域数据库承载全部任务，[τ²-bench](https://artificialanalysis.ai/evaluations/tau2-bench) 进一步让 agent 和用户共同修改同一份世界状态；[WorkBench](https://arxiv.org/html/2405.00823v1) 用 5 个数据库、26 个工具承载 690 条任务；[TheAgentCompany](https://arxiv.org/html/2412.14161v1) 自建 GitLab、ownCloud、RocketChat、Plane 模拟一整间软件公司，还有模拟同事。这些都印证"一个世界对应多条 case"比"每题一个 fixture"更接近真实使用，但它们评的是任务完成度，不评"该不该调用某个家族的工具"，也没有 Memory/Skill/Knowledge 三分的资产结构。

**记忆维度**：[LongMemEval](https://arxiv.org/abs/2507.05257)、[Mem2ActBench](https://arxiv.org/abs/2601.19935)、[AMA-Bench](https://arxiv.org/html/2602.22769) 覆盖偏好、更新、时序和多会话结构，Mem2ActBench 还专门评"能否主动利用长期记忆去选工具并填参数"，与本任务的 Trigger Recall 最接近。但它们不含团队 Skill 库和仓库 Knowledge 这两类资产。

**Skill 维度**：[SRA-Bench](https://arxiv.org/abs/2604.24594) 用 636 条人工 gold skill 混入 26262 条网络采集干扰项，[SkillRet](https://arxiv.org/abs/2605.05726) 有 17810 条公开 skill 和两级分类，[AgentSkillOS](https://arxiv.org/html/2603.02176v1) 做到 200K 规模。[Demystifying Agent Skills](https://arxiv.org/abs/2608.14036) 的结论对本任务直接相关：skill 池从 5 涨到 100 时实际使用精确率从 29.6% 掉到 3.3%，而且"易混淆干扰项会损害离线识别，但下游成功率保持稳定"——这说明干扰项密度必须显式控制，也说明只看最终任务成败会掩盖选择错误，正是任务一要单独测 Conditional Tool@1 的理由。这些数据集的干扰项是大规模采集来的，不是同一个团队里语义相邻的其他项目。

**该不该调用**：ACEBench、NoisyToolBench 一类含"不应调用"的负样本，但负样本通常是缺参数或无匹配工具，不是"资产存在且词面重叠但仓库、项目边界不匹配"这种硬负例。

所以 World 这套组织方式是把上面几条线合起来：τ-bench 式的共享世界状态 + Mem2ActBench 式的记忆触发评测 + SRA-Bench 式的语义相邻干扰项 + 明确的 No Tool 边界，四者在现有工作里没有同时出现过。公开数据集仍可继续作为题型来源（当前冻结数据集已经这样用），但资产世界需要自己构造。
