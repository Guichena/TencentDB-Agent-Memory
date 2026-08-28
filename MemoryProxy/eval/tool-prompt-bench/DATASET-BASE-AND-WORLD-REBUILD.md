# Task 1 数据基座选择与正式 World 重建方案

> 状态：已完成源码对齐和来源初筛；W01～W03 可以按本方案进入来源锁定与数据构造，但在各自 Gate 通过前不得计入正式指标。
>
> 适用范围：Proxy 系统提示词工具触发评测。本文只设计用于判断 Memory、Skill、Knowledge 是否应调用以及首个工具是否正确的数据，不评价工具返回资产的最终质量。

## 1. 结论

正式数据不直接照抄任何公开 benchmark，也不继续扩写现有三个手写 Pilot World。采用“真实软件工程任务与 Agent 轨迹作事实基座，转换为 TDAI 运行时实体”的方式。外部数据只回答“真实任务里发生过什么”，MemoryProxy 源码回答“这些事实由谁拥有、在什么 Session 中可见、何时应该触发哪个工具”；两者不能互相替代：

1. **W01～W03 首批基座：SWE-Gym + OpenHands-SFT-Trajectories。**
   - SWE-Gym 提供真实 GitHub 软件工程任务、仓库和可执行任务锚点。
   - OpenHands-SFT-Trajectories 提供 MIT 标注的成功多轮 Agent 轨迹，可直接转换为历史 Session，并从中派生 L1、L2 和 Skill。
2. **W04～W10 扩展基座：NVIDIA Open-SWE-Traces 的冻结子集。**
   - 数据卡为 CC BY 4.0，记录逐行 repo、repo license、language、完整 messages、resolved 和 reference patch。
   - 用它补齐 Go、TypeScript、JavaScript、Rust、Java、PHP、C/C++ 等语言，避免正式结论只建立在 Python 上。
3. **ContextBench 只作 Knowledge Gold overlay。**
   - 仅当 repo、commit family 和许可证都匹配时，用其人工 Gold Context 验证 CodeGraph/Wiki query 的证据位置。
   - 它没有可直接复用的历史轨迹，不作为 L0 主来源。
4. **When2Call、LongMemEval-V2、LoCoBench-Agent 只借鉴构造方法和覆盖分类。**
   - 不直接复制其通用工具调用、Web Agent 或外置场景内容。
   - Skill-Use-Bench、SWE-Skills-Bench 只作 Skill schema/rubric 参考；正式 Skill 必须从当前 Team 的历史轨迹提炼。
5. **SWE-ContextBench 不使用。** 锁定版本没有 LICENSE，也没有规范假设的 Agent 轨迹。

这不是多数据集内容拼接。一个 Team 的历史、Skill、任务、代码和文档必须来自同一 repo family 与明确时间边界；其他数据集只能作校验或方法参考。

### 1.1 “真实”不等于“原样复制”

正式 World 必须同时满足三层真实性：

1. **事实真实**：任务、代码、提交、测试结果和历史操作均能回到冻结来源，不能为了凑工具题凭空补事实。
2. **系统真实**：Space、Team、业务 Agent、Task、Session、fixed asset 和 imported Memory 的关系必须由 MemoryProxy 实际身份与可见性规则解析，不能把外部 dataset 的 `repo`、`project`、`agent` 字段机械改名。
3. **决策真实**：Query 应像当前 Team 在真实代码工作中会遇到的下一步任务；Positive 的缺失信息确实只能由目标资产补足，Negative 则确实能从当前上下文或 workspace 完成。

以下做法直接拒绝进入正式集：跨 repo 拼接出一个虚构 Team、把另一个 Team 的不可见资产算作干扰、把 trajectory 中的工具名当成 TDAI Gold、把参考 patch 写入历史资产、只替换实体名的模板扩写、以及为了让答案唯一而制造现实中不会出现的问题。

## 2. 为什么不能继续扩写现有 W01～W03

现有 `worlds/` 中的 48 条数据适合作为 Parser、Scorer、Mock Bridge 和 Fixture replay 的 Pilot，但不能转成正式数据：

- 项目、历史会话、Memory、Skill、Knowledge 和 Gold 主要是手写内容，没有逐资产 source ref。
- `acme/*`、`helio/*` 等是占位仓库；W01 虽使用了本项目名称，但任务规范要求 TencentDB 源码只定义工具与运行时语义，不能同时充当正式 World 内容源。
- 没有 repo commit、`world_as_of`、逐证据范围、来源许可证和未来信息检查。
- Workspace 只有少量内联文件，不足以代表真实仓库上下文。
- 现有 No-tool 是独立题，不是与每条 Positive 单变量配对的反事实负例。

处理方式：保留旧三 World 为 `synthetic contract smoke`，后续迁到 Pilot 命名空间；正式 W01～W03 使用新内容和新 provenance schema，不在旧文件上“补数量”。

## 3. 与 MemoryProxy 源码一致的实体模型

### 3.1 真实运行边界

```text
World = Space（租户/内核实例）
├─ Team A
│  ├─ 当前业务 Agent
│  ├─ 0～2 个可借入 Memory 的同 Team Agent
│  ├─ 6～10 个业务 Task
│  └─ 当前 Team/Agent 可见的 Memory、Skill、Knowledge
└─ Team B
   └─ 同上

Case = 一次真实 Session
  → URL 选择 Space
  → Session Init 选择一个 Team、一个 Agent、一个可选 Task
  → 加载当前上下文和工作区
  → 经过生产 InjectionPipeline
  → 观察首个 TDAI Attempt
```

源码约束及对数据的影响：

| 源码事实 | 数据约束 |
|---|---|
| Session 绑定 `spaceId + teamId + agentId + taskId?` | 每条 Case 必须走真实 Session Init；Gold 字段不能伪装成运行参数 |
| Skill listing 按 `(team_id, agent_id)` | 注入 Skill 必须归当前 Agent；团队搜索干扰可以来自同 Team 其他 Agent |
| Knowledge 优先按当前 Agent 的 fixed asset 绑定 | 目标和干扰 Knowledge 都必须绑定当前 Agent；另一个 Team 的资源不能充当可见干扰 |
| Memory 是 self + 最多 2 个显式 imported Agent | 借入记忆只能来自同 Team，且最多两个来源 Agent |
| L3 和 L2 索引直接注入，L0/L1 按需检索 | 需要搜索的答案不得泄漏到 L3、当前上下文或 L2 summary；已知 L2 path 才允许直接 `read_scene` |
| 源码没有通用 `projectId` 请求参数 | `projectRef` 仅是数据组织字段；项目语义通过 Task、workspace、repo slug、历史和 Knowledge 表达 |
| `agentSource=codex` 与业务 Agent 是不同概念 | AgentSource 固定为 Codex 客户端；业务 Agent 只作为资产身份，不写工具倾向 |

### 3.2 什么才算有效干扰

有效干扰必须同时满足“模型可见”和“语义竞争”：

- Memory：同一 self/imported 检索范围内的近义事实、旧版本结论、相似事件、错误时间段。
- Skill：当前 Listing 中的近义 Skill，或 `skill_search` 可检索到的同 Team Skill；包含旧版本/不适用边界。
- Knowledge：当前 Agent 已绑定的相似 Wiki/CodeGraph、错误 repo 或错误 commit 资源。
- No Tool：仍加载完整资产；答案只存在于当前消息、当前上下文或本地 workspace，从而证明模型没有被资产词面诱导。

另一个 Team 的资产在 Session 绑定后不可见，只用于验证隔离，不能计入干扰资产数量或误调用难度。

## 4. 数据来源选择

| 来源 | 正式角色 | 不承担的角色 | 使用条件 |
|---|---|---|---|
| SWE-Gym/SWE-Gym | W01～W03 的真实任务、repo、base commit、测试和 patch 锚点 | 不直接提供 TDAI 资产 | 锁 revision `bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb`，并复核每个 repo 在对应 commit 的 LICENSE |
| SWE-Gym/OpenHands-SFT-Trajectories | W01～W03 的 L0 原始 Agent replay与 L1/L2/Skill 的候选证据 | 不冒充真人团队会话，也不直接提供成品 Memory/Skill/No-tool | 锁 revision `4aaa5a4a4b5861f4799d2336908760c190ac3b17`；只选成功轨迹；先确定性 join SWE-Gym，再保留消息顺序和 `origin=synthetic_agent_replay` |
| nvidia/Open-SWE-Traces | W04～W10 的多语言任务与轨迹 | 不直接把全量数据纳入仓库，也不使用显式 reasoning/think | 固定 v1.0 revision `6c426da40f5478986398531f065ac5b523fa3ec6`、config/split/parquet hash/trajectory id；只纳入 resolved=1 且逐行许可证为 MIT/Apache-2.0/BSD-2/BSD-3 的 repo |
| nebius/SWE-rebench-V2 | 为 Open-SWE `instance_id` 补 source task、base commit、created_at、patch/test 锚点 | 不单独充当历史轨迹 | 固定不可变 revision；m:1 join 并保存 join 输出 hash；同 repo 同时满足独立 task 与独立 trajectory 密度 |
| EuniAI/ContextBench | 同 repo/commit family 的 Knowledge Gold overlay | 不作 L0 | 只保存 Gold span locator/hash，不把 scorer 信息注入模型 |
| repo docs/code at pinned commit | Wiki、CodeGraph、Workspace | 不从当前 case 的未来 patch 生成历史资产 | repo commit 必须早于或等于 `world_as_of`，逐文件保留许可证与 hash |
| When2Call | Positive/paired-negative 的单变量反事实方法 | 不导入通用问答内容 | 方法参考 |
| LongMemEval-V2 | 时间、冲突、更新、干扰记忆的覆盖分类 | 不导入 Web/enterprise 内容 | 方法参考 |
| LoCoBench-Agent | 自然 coding negative 的类别清单 | 数据包未锁定前不复制其场景 | 方法参考；若以后导入，先锁 data.zip hash 和数据许可 |

### 4.1 许可与来源 Gate

每条正式来源必须同时通过：

```text
dataset revision 的许可
AND source repo 在 pinned commit 的许可
AND 数据卡声明的模型/生成附加条款
AND PII/credential scan
AND 当前分发方式允许（内部 fixture / 可公开 package）
```

GitHub issue/PR 评论正文不作为正式 L0 默认来源。公开仓库 LICENSE 不自动等于所有评论作者同意把评论原文重新打包；默认只保存 URL、时间、hash 和必要摘要，除非另有明确许可。

## 5. 正式规模与 Case 结构

### 5.1 10 Space、20 Team、400 Case

一个 World 对应一个 Space；每个 Space 两个 Team；每个 Team 20 条 Case：

| 每 Team | 数量 |
|---|---:|
| Memory Positive | 3 |
| Skill Positive | 3 |
| Knowledge Positive | 3 |
| 与 9 条 Positive 一一配对的 No-tool Negative | 9 |
| 自然 Coding Negative | 2 |
| 合计 | 20 |

因此每个 World 为 40 条：Memory/Skill/Knowledge 各 6 条 Positive，18 条 paired negative，4 条 natural coding negative。全量 10 World 为 400 条。

这里的 400 是正式数据目标，不是一次必须全部跑完的固定成本。Prompt 开发先跑分层子集，正式 Final 才覆盖冻结集；新增高质量 Case 可以继续扩展，但不能牺牲配对关系、来源和 Gold 唯一性。

### 5.2 Split

| Split | World | Team | Case | 用途 |
|---|---:|---:|---:|---|
| Dev | W01～W04 | 8 | 160 | Prompt 迭代、失败分析、消融 |
| Hidden Test | W05～W10 | 12 | 240 | Final 冻结后评测，不用于改 Prompt |
| 合计 | 10 | 20 | 400 |  |

Split 以完整 Space 为单位。repo/fork family、source task、trajectory、patch hash、Skill body family、Wiki source、CodeGraph commit 和近重复 Query 都不得跨 Split。

## 6. 从公开轨迹到 TDAI 专属资产的转换

### 6.1 L0 Conversation

保留真实 Agent replay 的 user/assistant/tool 顺序，但只把适合 TDAI 历史检索的内容转成 L0：

- 删除原 system prompt、工具定义、凭证、容器绝对路径和与事实无关的长日志。
- tool call/result 转为历史中可读、可检索的操作与结果消息；不得更改技术结论。
- 一条上游 trajectory 对应一个历史 Session；不把多个任务揉成一段假会话。
- 明确记录 `origin=synthetic_agent_replay`，不能称作真人团队对话。
- ContextBench-only Team 若无合规轨迹，只能使用 `origin=evidence_grounded_synthesis`；每句话必须指向同 repo task、patch、test 或 code span，并显式标记为合成。

### 6.2 L1 Atomic Memory

- 每条只表达一个可验证事实。
- 必须指向一段 L0 message；涉及实现结果时同时指向 patch hunk/test result。
- 支持 `active / superseded / invalid` 状态；旧结论可以成为干扰，但不能与最新事实同权。
- 不复制当前 Case 的答案到当前上下文、L3 或 Wiki。

### 6.3 L2 Scene 与 L3

- L2 至少聚合两个独立历史 Session 的同模块/同类问题；不足两个就保留为 L1，不硬凑 Scene。
- L2 summary 只描述主题和时间，不泄漏正文中的目标答案。
- L3 只保存长期、跨任务稳定的 Team/Agent 工作偏好，例如测试习惯；不保存某次任务的具体结论。

### 6.4 Skill

- 只从成功轨迹中重复出现且可复验的操作序列提炼。
- 命令、路径、验证顺序和失败边界必须有 trajectory evidence；不能凭常识补步骤。
- 当前 Agent 绑定 4～6 个直接相关 Skill；同 Team 额外放 6～10 个可搜索 Skill 和近义/旧版干扰。
- 每个 Skill 同时写 `use_when`、`do_not_use_when`、source trajectories、repo/commit 范围和版本。

### 6.5 Knowledge

- CodeGraph 从 Case 的 pinned base commit 静态构建，记录 repo slug、commit 和构图版本。
- Wiki 优先使用同 commit 的 README、docs、ADR、release notes 和贡献指南。
- ContextBench Gold Context 只用于验证问题确实需要哪些 file/symbol/span，不进入模型输入。
- 当前 Case 的 reference patch/test answer 不得提前进入 Knowledge。

### 6.6 Task、Workspace 与 Query

- 每 Team 维护 6～10 个真实 Task；多条 Case 可以围绕同一 Task 形成正负对。
- Workspace 使用真实 repo 的最小可运行切片或冻结 checkout，不把几行手写文件称为真实项目。
- Paired Negative 与 Positive 保持同 Team、repo、语言、Task 和资产快照，只改变一个信息条件：例如答案已出现在当前消息、本地文件已有精确实现、目标 Skill 版本不适用、Knowledge repo/commit 不匹配。
- Gold、family、allowed actions、pair role、source refs 都只供 loader/scorer 使用，绝不进入 Provider-visible prompt。

## 7. W01～W03 重建候选

W01～W03 先全部使用 SWE-Gym + MIT 标注的成功轨迹，验证最严格、最少来源模式的流水线。每个 Space 两个 Team：

| World | Team | Repo | 栈/场景 | 选择理由 |
|---|---|---|---|---|
| W01 | A | `getmoto/moto` | Python、pytest、AWS mock | 成功轨迹密度高，服务模块、测试和文档边界清楚 |
| W01 | B | `python/mypy` | Python、typing、stubs、回归测试 | 适合类型诊断、测试 fixture 和近义 Skill 干扰 |
| W02 | A | `pandas-dev/pandas` | DataFrame、索引、IO、pytest | 任务密度和跨文件上下文丰富，Knowledge/CodeGraph 题充足 |
| W02 | B | `dask/dask` | 分布式计算、collections、scheduler | 同属数据工程但规则不同，适合构造真实语义竞争 |
| W03 | A | `iterative/dvc` | CLI、pipeline、cache、remote | 工作流型 Skill、历史决策和本地优先题都容易落到真实证据 |
| W03 | B | `Project-MONAI/MONAI` | 医疗影像、PyTorch、transforms、测试 | 确定性 join 后有 53 个唯一 task（50 条轨迹 messages≥20），足以把历史资产来源和当前问题锚点分开 |

最终准入不以名称或总任务数决定。每个 Team 必须先证明：

- 至少 12 个官方 source task：history 至少 6 个、current anchor 至少 6 个，二者不重叠；
- history 至少 6 条成功且 source task 不重叠的轨迹，当前 anchor 的 reference patch 不得进入历史资产；
- 至少 20 条可保留的历史消息；
- 至少 10 条可证据化 L1；
- 至少 4 个由两个以上 Session 支撑的 L2；
- 至少 4 个可复验 Skill；
- 至少 1 个 Wiki 和 1 个 CodeGraph Knowledge；
- 至少 9 个可形成唯一首动作的 Positive，以及各自的单变量 Negative；
- repo commit、dataset revision、许可证、时间边界和 hash 完整。

某个候选未通过时，从同一 SWE-Gym 来源池替换 Team，不降低 Gate，也不手写补足缺失轨迹。

确定性 join 已得到 487 条全局唯一匹配、4 条歧义排除、0 条未匹配。按官方 `instance_id` 去重后的候选容量为：moto 69、mypy 27、pandas 61、dask 29、dvc 23、MONAI 53、Conan 12、Pydantic 7；正式六 Team 选择前六者，后两者只作 reserve。该统计只证明来源容量，不能替代业务场景、许可、Gold 唯一性和人工证据复核。

## 8. 时间边界与防泄漏

每个来源分开保存三个时间：

```text
source_task_time         原 issue/PR/commit 所属时间
trajectory_generated_at Agent replay 生成或 dataset revision 时间
world_as_of              World 的当前任务/工作区快照时间
```

约束：

- historical `source_task_time < world_as_of`。
- 当前 Case 的问题、patch、测试答案不得出现在历史 L0/L1/L2/Skill/Wiki 中。
- replay 生成时间晚于历史任务本身不算事实泄漏，但必须显式标注 replay，不能伪称它在当时真实发生。
- 每个 Case 运行前恢复相同快照；关闭自动抽取、归档写回和 LLM 写资产。
- 不使用上一个 Case 的 Session、SQLite/KV、Redis hook cache、Skill conversation buffer 或工作区修改。

## 9. Provenance 最小字段

```ts
interface SourceEvidence {
  sourceId: string;
  dataset: string;
  datasetRevision: string;
  sourceRepo: string;
  sourceRepoCommit: string;
  sourceRepoLicense: string;
  sourceTaskId?: string;
  trajectoryId?: string;
  origin: "synthetic_agent_replay" | "evidence_grounded_synthesis" | "repo_document" | "repo_code";
  sourceTaskTime?: string;
  trajectoryGeneratedAt?: string;
  worldAsOf: string;
  evidenceLocator: string;
  evidenceSha256: string;
  transform: string;
  reviewedBy: string;
}
```

World、Team、Task、Session、L1、L2、Skill、Knowledge、Case 和 Gold 均保存自己的内容 hash，并能回指 `SourceEvidence`。

### 9.1 正式 V2 合同与旧 Pilot 的边界

现有 `world-schema.ts`/`compile.ts` 是 Pilot 合同：资产按 World 扁平存储，`compileWorldFixture()` 会把全 World 的 Memory、Skill、Knowledge 交给 Case，且 `WORLD_SOURCE` 被硬编码为 `project-authored/MIT`。正式数据不得在该结构上直接加记录。

D0 必须建立独立的 Formal V2 合同：

- `PublicCaseInput` 只包含生产请求实际需要的 identity、query、当前上下文和 workspace 引用。
- `PrivateCaseAnnotation` 独立保存 Gold、pair role、source locator、ablation 证据和 scorer 字段，类型和序列化路径均不得进入 Provider 输入。
- `ResolvedVisibleSnapshot` 按 `spaceId + teamId + agentId + taskId?` 解析当次可见资产；Team B 资产必须保持不可见，同 Team imported Memory Agent 不超过两个。
- `WorldSnapshot` 冻结 source pack、身份绑定图、资产 hash、workspace/overlay、运行配置和 reset recipe；同一 Case 比较 V0/V1 时必须复用同一 snapshot。
- `RunRecord` 保存实际可见资产 hash、注入 hash/token 分类、fresh session、缓存/reset 状态和首个 TDAI attempt，使公平性可复核。

旧类型应显式改名为 `PilotWorld` 或迁入 Pilot namespace；只有 Formal registry 能进入正式指标。

## 10. 分阶段执行与 Gate

逐阶段的命令前置、产物和勾选式验收清单见 [`data-stages/README.md`](./data-stages/README.md)。每一阶段使用独立分支，通过 Gate 并合入数据集成主线后才创建下一阶段分支。

### D0：冻结 W01～W03 来源合同

- 锁 W01～W03 实际使用的 SWE-Gym、OpenHands-SFT revision、文件 hash 和确定性 join。
- Open-SWE、SWE-rebench-V2 与 ContextBench 只保留候选台账，在 D3 或首次实际使用阶段冻结，不提前阻塞 W01。
- 定义 source registry、license manifest、时间字段和 transform 类型。
- 建立 Formal V2 public/private schema、身份可见性解析、snapshot 与 run-record 合同。
- 冻结评测策略：`allowLlmWrite=false`、`allowLlmExtract=false`、反射/归档写回关闭；当前 Pilot 的 `allowLlmExtract: true` 只能服务旧 smoke，不得沿用到正式运行。
- 输出 repo/trajectory 密度报告。

Gate：W01～W03 六个 Team 的 dataset + repo license、commit、trajectory id 和消息数可机器复核；公开输入不含任何私有标注；相同 snapshot 的可见资产与 workspace hash 可重复。真实 Session、存储、缓存和 workspace 残留在 D5、正式评测前验证。

### D1：重建 W01

- 先完成两个 Team 的 source pack、资产和 40 条 Case。
- 运行 schema、source、time、pair、Gold 唯一性、asset ablation 和真实 fixture replay。

Gate：40 条分布正确；18 对反事实只差一个条件；所有 Positive 首动作唯一；所有来源可追溯。

### D2：重建 W02～W03

- 复用通过 D1 的 schema/生成器，不复制 W01 的具体内容。
- 完成 80 条新增 Case，并做跨 World 近重复与 provenance graph 检查。

Gate：W01～W03 共 120 条通过，repo/trajectory/patch/query/Skill family 无交叉泄漏。

### D3：构建 W04 Dev 与多语言选择器

- 在本阶段锁 Open-SWE/SWE-rebench-V2 的 revision、文件 hash、join 与许可证。
- 从冻结的 Open-SWE-Traces 子集选择两个高密度、许可清楚、语言不同的 Team。
- 完成 W04 后，Dev 形成 160 条。

Gate：多语言 Team 与 SWE-Gym Team 使用同一 TDAI schema 和评分合同，不能为新来源放宽规则。

### D4：密封 W05～W10

- 选择 12 个未进入 Dev 的 repo family。
- 生成后只运行结构、来源、合同和 hash 验证；不根据模型表现改 Gold 或 Prompt。

Gate：240 条 Hidden Test 冻结，provenance graph 与 Dev 零交叉。

### D5：真实链路 Smoke 与评测交接

- 每个 Dev World 抽 Memory、Skill、Knowledge、paired negative、natural negative 各一条走真实链路。
- 确认 Session Init、注入、首个入口观测、Token/usage 和快照恢复均正确。

Gate：数据 Gate 和代码 Variant Gate 都通过后，才能采集正式 V0/V0-C/候选指标。

## 11. 可以委派给 Luna/Terra 的任务

子智能体只做有确定输入/输出的批处理，不能自行降低 Gate：

- Luna：按冻结 source pack 转换 L0、提取候选 L1、生成 paired-negative 草稿。
- Terra：按两条以上成功轨迹提炼 Skill/L2、审查事实证据和版本边界。
- Luna/Terra：从 repo docs/code 生成 Knowledge query 草稿和 natural coding negative 草稿。
- 主会话：决定 World/Team/repo、批准来源、处理冲突、冻结 Gold 和验收每阶段 Gate。

每批生成后必须保存 generator prompt/version、输入 source ids、输出 hash 和人工 review 状态。未经 review 的内容只能是 draft。

## 12. 本方案解决的原计划冲突

| 冲突 | 处理 |
|---|---|
| 200 vs 400 Case | 采用两 Team × 每 Team 20 = 每 World 40；正式 400，运行时可用分层子集控制成本 |
| World 是项目还是 Space | World 固定为 Space；项目是 Team 内 repo/Task/workspace 语义，不是虚构运行参数 |
| 另一个 Team 能否当干扰 | 不能；只有当前 Session 可见集合算干扰 |
| GitHub discussion 能否直接作 L0 | 默认不能打包评论原文；首选明确许可的 Agent trajectory |
| 真实轨迹是否等于真人历史 | 不等于；明确标记 `synthetic_agent_replay`，只保留真实任务事实和真实操作序列 |
| 外部 Skill 数据能否照抄 | 不能；正式 Skill 必须由同 Team 轨迹提炼，外部 benchmark 只提供 rubric |
| W01～W03 能否原地补齐 | 不能；保留旧数据为 contract smoke，正式内容整体重建 |
