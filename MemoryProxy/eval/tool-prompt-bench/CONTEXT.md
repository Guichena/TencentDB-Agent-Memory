# Tool Prompt Benchmark Context

本上下文定义 Task 1 正式评测中的业务实体和数据术语，避免把数据集组织字段误当成 MemoryProxy 运行参数。

## Language

**World**:
一个隔离的正式评测环境；Task 1 的正式 World 对应一个 MemoryProxy Space，包含 T01 至 T10，并按 Team split 使用互斥的 Dev/Hidden 可恢复快照。旧的“每个 World 固定两个 Team”只保留为历史设计。
_Avoid_: Project, Scenario, Dataset row

**Space**:
MemoryProxy URL 和 `x-tdai-service-id` 选择的租户/内核实例，是 Team、Session 和资产隔离的最外层边界。
_Avoid_: Workspace, Repository

**Team**:
Space 内的业务团队，是 Skill ownership、Memory 借入和 Knowledge 资源组织的重要可见性边界；一条 Session 只绑定一个 Team。
_Avoid_: Space, Repository group

**Business Agent**:
Session Init 选择的资产身份，拥有或绑定 Memory、Skill 和 Knowledge；它不是 Codex、Claude Code 等客户端。
_Avoid_: AgentSource, Model, Client

**AgentSource**:
发起 Proxy 请求的客户端类型；Task 1 主实验固定为 Codex。
_Avoid_: Business Agent

**Task**:
Team 下可由 Session 关联的业务任务，提供当前目标和验收语义；它不是单条评测 Case 的 Gold 标签。
_Avoid_: Case, Source task

**Case**:
一次可独立恢复和评分的评测运行输入，包含 Session 选择、当前上下文、Query、Workspace 引用及隐藏 Gold。
_Avoid_: Task, World

**ProjectRef**:
数据集内部用于关联 repo、Task、Workspace 和来源的组织字段，不会作为 MemoryProxy 请求参数发送。
_Avoid_: projectId, Runtime project

**Visible Asset Set**:
当前 Space、Team、Business Agent 和 fixed-asset 绑定实际允许注入或检索的资产集合，是构造有效干扰的边界。
_Avoid_: All assets in World

**Imported Memory Agent**:
与当前 Business Agent 同 Team、通过 chat_memory fixed asset 显式借入的记忆来源 Agent；正式数据最多两个。
_Avoid_: Other Team Agent, AgentSource

**Positive**:
当前信息缺口只能由某个 TDAI 资产工具弥补，且正确首动作可由隐藏 Gold 唯一判定的 Case。
_Avoid_: Tool mention, Asset-related query

**Paired Negative**:
与某条 Positive 保持 Team、repo、Task、资产和主要措辞一致，只改变一个使 TDAI 调用不再必要的信息条件的 Case。
_Avoid_: Unrelated no-tool task

**Natural Coding Negative**:
来自真实 Workspace 的普通编程任务，完整加载可见资产但不需要 TDAI 工具。
_Avoid_: Empty-asset negative

**Synthetic Agent Replay**:
公开数据集中由软件工程 Agent 与工具环境生成的完整多轮轨迹，经最小清洗后作为历史 Session；它不代表真人团队原始对话。
_Avoid_: Human conversation, Fabricated team history

**Evidence-grounded Synthesis**:
仅依据同 repo 的任务、patch、test 和代码证据生成的历史对话，所有事实都有 locator，并明确标记为合成。
_Avoid_: Original trajectory, Free-form synthetic conversation

**Source Pack**:
一个 Team 在构造前冻结的 dataset revision、repo commit、轨迹、代码、文档、许可、时间和 hash 清单。
_Avoid_: World snapshot

**World Snapshot**:
可将 Space、Team、Session、Memory、Skill、Knowledge、Task 和 Workspace 恢复到同一状态的冻结产物。
_Avoid_: Source Pack, Run artifact

**TDAI Attempt**:
模型实际尝试访问 Memory Bridge、Skill Bridge 或 Knowledge tools 入口的单次行为。正式评分按有序 Attempt 组成的最小合法链路判断有效调用，首个 Attempt 只用于诊断路由错误。
_Avoid_: Any Bash call, Tool name mention
