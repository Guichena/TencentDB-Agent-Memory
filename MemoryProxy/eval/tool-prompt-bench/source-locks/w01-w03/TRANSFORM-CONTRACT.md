# W01–W03 数据转换合同

## 1. 目的

本合同规定如何把冻结的真实软件工程任务与成功 Agent 轨迹，转换为符合 MemoryProxy 生产身份、资产可见性和工具触发语义的正式评测数据。

公开数据只提供事实证据，不提供现成的 Space、Team、BusinessAgent、Memory、Skill、Knowledge、Query 或 Gold。禁止把 benchmark 字段改名后直接写入正式 World。

## 2. 五层数据边界

| 层 | 输入 | 允许产物 | 明确禁止 |
|---|---|---|---|
| Source task | SWE-Gym `instance_id`、repo、base commit、problem、patch/test locator | 真实任务锚点、代码与测试证据 | 直接把 problem 当正式 Query；把 reference patch 当历史事实 |
| Historical session | history source task 的成功 OpenHands replay | 清洗后的 L0 操作与结果顺序 | 冒充真人聊天；保留 system prompt、凭证、绝对路径、显式推理 |
| Historical asset | L0 + 同 commit 代码/测试/文档 | L1、跨至少两 Session 的 L2、可复验 Skill、冻结 Knowledge | 把工具调用名当 TDAI Gold；无证据补写团队故事 |
| Current case | 互斥 current-anchor task + 当前 workspace/context | 面向当前 Team 工作的自然 Query、paired negative、natural negative | 复制原 problem statement；把 scorer/来源/private 字段放入请求 |
| Gold | 可见资产、当前输入和 workspace 的人工证据审查 | 首个 TDAI 动作及允许入口集合 | 从公开数据标签自动继承；仅凭关键词或上游工具调用决定 |

## 3. MemoryProxy 运行时映射

每个 World 是一个 Space；每个 Space 有两个相互隔离的 Team。repo 是 Team 的长期工作对象，通过 Task、workspace、历史 Session 和 Knowledge 表达，不伪造成源码不存在的请求参数。

每个正式 Case 必须选择：

- 一个 `spaceId`；
- 一个 `teamId`；
- 一个 `userId`；
- 一个当前 `BusinessAgent`；
- 一个真实工作类型的 `Task`；
- 一个 fresh `Session`。

BusinessAgent 是 MemoryProxy 的资产身份，不是 OpenHands/Codex/Claude 等终端客户端。`agentSource=codex` 只描述发起请求的客户端。若某个 Case 不需要借入记忆，仍保留当前 BusinessAgent，但 imported Memory agents 可以为 0。

正式可见集合只由源码规则解析：

- Memory：当前 Agent self，加同 Team 显式导入的最多 2 个 Agent；
- Skill listing：当前 Agent 绑定的 Skill；Skill search：按生产 Team/owner/visibility 规则过滤；
- Knowledge：当前 Agent 的 fixed asset binding；
- Team B：对 Team A Session 完全不可见，不计入可见干扰难度。

## 4. Source-pack 分工

每个 Team 至少 12 个官方 `instance_id`：

- `history >= 6`：只用于历史 Session 和历史资产；
- `current_anchor >= 6`：只用于当前 workspace、Case 候选和验证；
- 两组的 instance、problem hash、patch/test evidence 不得重叠；
- current-anchor reference patch/test answer 不得进入 L0/L1/L2/L3/Skill/Knowledge；
- 选择必须覆盖该 repo 的真实子系统和任务类型，不能只按消息长度排序。

同一 repo 不代表同一个事实域。只有确实重复出现、可由至少两个独立历史任务支持的操作模式，才能提升为 L2 或 Skill。

## 5. 允许的转换

Formal V2 只接受以下 transform：

- `redacted_replay`：对成功轨迹做可追溯清洗，保持消息与操作顺序；
- `atomic_fact_extraction`：从单条 L0 和代码/测试证据提取一条 L1；
- `multi_session_scene_synthesis`：由至少两个独立 Session 建立 L2 场景；
- `stable_profile_derivation`：只提炼跨任务稳定、不泄漏当前答案的 L3；
- `skill_procedure_derivation`：由重复、可复验的历史操作提炼带适用边界的 Skill；
- `repo_document_snapshot`：固定 commit 的 Wiki/文档资产；
- `code_graph_build`：固定 commit 的 CodeGraph 资产；
- `paired_counterfactual`：只改变一个信息条件的正负对；
- `natural_negative_selection`：从真实 coding 工作中选择无需云端资产的题。

每次转换必须保存 source ids、输入 hash、输出 hash、transform version、generator 配置和 `reviewedBy`。未经人工复核只能标记为 draft，不能进入正式 registry。

## 6. Query 与 Gold 规则

正式 Query 是当前 Team 在冻结 workspace 上可能真实提出的下一步任务。可以依据 current anchor 的技术现象重新构造，但必须满足：

1. 不逐句复制原 problem statement；
2. 不暴露 benchmark 名称、instance id、reference patch 或 Gold；
3. Positive 的关键缺口确实存在于唯一目标资产或允许的同 Family 入口中；
4. Paired Negative 保持 Team、Task、workspace、资产快照和表达难度不变，只把该缺口补进当前上下文或 workspace；
5. Natural Negative 仍加载完整资产，但本地信息已充分；
6. 先做资产移除消融和当前上下文/workspace 泄漏检查，再冻结 Gold。

上游轨迹调用了什么工具、是否 resolved、reference patch 修改了什么文件，都不能单独决定 Memory/Skill/Knowledge Gold。

## 7. 干扰项规则

干扰必须在生产链路中真实可见，并且与目标在语义上竞争：

- Memory 干扰：同一可检索范围内的旧版本、相似事件、错误时间段；
- Skill 干扰：Listing/Search 能返回的近义流程、旧版流程或边界不适用流程；
- Knowledge 干扰：当前 Agent 已绑定但 repo、模块或 commit 不匹配的 Wiki/CodeGraph；
- 不可见的另一个 Team 只用于隔离测试，不能充当“看起来很多”的假干扰。

## 8. 准入检查

一批数据只有同时满足以下条件才能从 draft 升级为 formal：

- source revision、文件 SHA-256、official instance、base commit、license/notice 均可机器复核；
- history/current-anchor 分离，且全局 provenance graph 不跨 Dev/Hidden 连通；
- 实体、绑定和 visible-set 能由 Formal compiler 按源码规则重建；
- Provider 输入不含 Gold、pair、family、source locator 等私有字段；
- 相同 snapshot 可重建相同 visible/workspace/injection hash；
- Positive 通过唯一首动作与资产移除消融；Negative 通过当前信息充分性审查；
- 没有凭证、PII、绝对路径、未来答案、模板式改名或逐句 benchmark 复制。

不满足时应替换 source task、重做转换或放弃 Case，不得通过降低 Gate、添加不存在的运行参数或编造资产补齐数量。
