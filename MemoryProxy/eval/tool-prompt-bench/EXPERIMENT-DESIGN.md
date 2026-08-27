# 任务一实验设置与数据集说明

状态：V6.1 执行方案下的实验准备稿  
适用分支：`codex/task1-p01-benchmark-harness`  
基线来源：`origin/feat/server_team` 的 `c0cf94f`  
主模型：`gpt-5.6-luna`，推理强度 `high`，输出详细度 `medium`

## 1. 实验要回答什么

任务一只回答一个问题：注入 Memory、Skill、Knowledge 的工具说明后，模型能否在应该调用时主动调用正确工具，并在普通 coding 任务中保持克制。

正式比较的四项核心指标是：

1. 有效调用率提高。
2. 误调用率降低。
3. 工具选择正确率提高。
4. 注入 Token 量降低。

Prompt cache 不作为第五个效果指标，但它是方案约束。优化不能因为移动动态内容或改变注入位置，额外破坏原本可复用的稳定前缀。

本实验不评价工具返回资产的内容质量，也不评价模型最后写出的代码好不好。只要工具选择、参数和调用序列可执行，就完成了任务一所需的观测。

## 2. 当前可以开始到什么程度

数据集、Mock Bridge、生产注入渲染链路、Gold 评分器和单 case Codex runner 已经具备。现在可以做 V0 的基础设施 smoke 和基线采集准备，但还不能把任意 `--variant V1` 标签当成真实 V1。当前渲染链路仍是生产现状 V0，候选 Prompt 接入后，才会开放对应 Variant。

曾经做过一次真实模型探测。模型尝试调用 `skill_view` 和 `tdai_memory_search`，但调用进程被当前 Codex 桌面任务的执行策略拦截，Mock Bridge 没有收到请求。该次运行属于基础设施错误，不是 V0 模型结果，不能进入任何指标。

这次探测暴露了两个 runner 问题，目前已经在代码层收口：

- 不再复制 `auth.json`。runner 使用用户已经登录的唯一 `CODEX_HOME`，避免临时副本刷新或轮换 token 后让桌面端登录态失效。
- stderr 或事件中出现 `blocked by policy` 时，运行标记为 `INFRASTRUCTURE_ERROR`。评分器单独计数并排除，不再把它误算成模型没有调用工具。

正式模型运行由用户在普通 PowerShell 中手动启动。本轮准备工作不会启动 Codex。

## 3. 数据集总览

数据集共有 100 条唯一 case，其中 Dev 60 条，Test 40 条。Smoke 是 Dev 中固定选出的 12 条，不是额外数据。

| Split | Memory | Skill | Knowledge | No Tool | 合计 |
|---|---:|---:|---:|---:|---:|
| Dev | 15 | 15 | 10 | 20 | 60 |
| Test | 10 | 10 | 6 | 14 | 40 |
| 合计 | 25 | 25 | 16 | 34 | 100 |

语言分布为中文 60 条、英文 40 条。

No Tool 的 34 条不是简单随机负样本，而是分为四类：

| 类型 | 数量 | 主要边界 |
|---|---:|---|
| `self_contained_coding` | 15 | 当前题目已经完整，不需要历史、团队流程或仓库知识 |
| `answer_already_available` | 7 | 答案已在当前上下文、L3 画像或已注入索引中 |
| `superficial_overlap` | 8 | 出现 memory、skill 等词，但语义上与 TDAI 工具无关 |
| `wrong_tool_hard_negative` | 4 | 存在看似相关资产，但仓库、资源或任务边界不匹配 |

每条 No Tool case 仍然暴露至少一个无关资产。这样才能真实观察误调用，而不是通过隐藏工具让模型无法误调用。

## 4. 三类正样本覆盖

Memory 25 条覆盖：

- 8 条语义记忆搜索。
- 6 条原始会话精确搜索。
- 3 条结构化 atomic query。
- 3 条已知 session 的 conversation query。
- 3 条已知路径的 scene read。
- 2 条 scene discovery 后继续读取。

Skill 25 条覆盖：

- 10 条已在列表中的 Skill 直接查看。
- 8 条团队 Skill 搜索后查看。
- 7 条查看 manifest 后读取具体资源文件。

Knowledge 16 条覆盖两类资产：

- 与当前仓库匹配的 Code Graph 探索、调用方、被调用方和影响分析。
- Wiki 搜索后读取页面，用于团队术语、设计理由和事故复盘。

多步 case 的 Gold 不只检查第一个 endpoint。评分器还检查后续 Skill 名称、manifest 路径、Knowledge `tool_name`、嵌套 `params`，以及参数是否来自前一步返回值。

## 5. 数据来源和改写方式

| 来源 | 数量 | 用途 |
|---|---:|---|
| SkillsBench | 25 | 需要团队流程、参考文件或 Skill 资产的 coding 结构 |
| Project-authored | 22 | 直接覆盖当前 TDAI 协议和工具边界 |
| HumanEval | 15 | 完整自包含、应当 No Tool 的 coding 题 |
| LongMemEval | 11 | 偏好、更新、时序和多会话记忆结构 |
| BFCL | 10 | 无关工具、参数和 first-action 边界 |
| CrossCodeEval | 9 | 仓库匹配的跨文件关系结构 |
| MetaTool | 8 | 相似工具与关键词重叠的 hard negative |

其中 51 条是经过任务语境改写的 case，27 条只采用公开数据的评测结构，22 条由项目直接编写。公开数据提供题型和决策边界，最终 query、fixture 和 Gold 都按当前 TencentDB-Agent-Memory 工具契约重写。具体 revision 和许可证保存在 `sources/manifest.json`。

## 6. 资产已经准备到什么程度

主实验所需的 Memory、Skill、Knowledge 资产已经作为确定性 fixture 准备好，保存在 `fixtures/fixtures.jsonl`，并由每次新启动的 Mock Bridge 提供。

因此，任务一主实验不需要先运行资产抽取，也不需要依赖 MemoryCore 的 L1 自动生成质量。模型需要的资产在对应 fixture 中已经存在：

- Memory 包含 atomic 记录、conversation、scene index、scene 内容和 L3 画像。
- Skill 包含当前 agent 可见列表、团队搜索结果、Skill 正文、manifest 和资源文件。
- Knowledge 包含 Code Graph 或 Wiki 绑定，以及可被 Gold 序列调用的工具响应。

如果后面需要向老师展示真实服务链路，可以另做一个小规模 contract smoke。可通过现有数据面接口直接上传或注册 L0、L2、L3 和 Skill，再从面板或读取接口确认。这个 smoke 只证明真实接口可用，不进入任务一的主指标，也不阻塞 V0。

## 7. 为什么误调用可以被公平测到

100 条 case 的 capability 配置完全相同：

- `chatMemory = true`
- `skill = true`
- `llmWiki = true`
- `codeGraph = true`

也就是说，正样本和负样本都会看到 Memory、Skill、Knowledge 三个家族的工具说明。V0 使用当前生产渲染函数注入以下五类内容：

1. `<skill_tools>`
2. `<available_skills>`
3. `<knowledge_tools>`
4. `<tdai_memory_tools>`
5. `<tdai_profile_memory>` 与其中的 memory guide

实验不会根据 Gold family 只注入某一类工具。Gold 只用于运行结束后的评分，不参与 Prompt 构造。

每条 case 只加载自己的 fixture。这不是隐藏其他工具，而是防止别的题目的答案和资产串入当前题目。当前 fixture 内仍然保留其他家族的干扰资产，所以错误家族选择和 No Tool 误触发都可观察。

## 8. 每次运行如何隔离

正式请求路径固定为：

`benchmark runner → MemoryProxy:8096 → 官方 ChatGPT Codex 上游`

模型生成的工具命令再访问本 case 独占的 Mock Bridge。正式 campaign 不允许绕过 MemoryProxy，运行脚本会先检查 `http://127.0.0.1:8096/health`，Proxy 未启动就停止。

case Prompt 由 MemoryProxy 仓库中的生产 `InjectionPipeline` 和 `render*Block()` 函数渲染。运行中的 Proxy 对 benchmark route 不再做第二次注入，只负责实际 Responses 转发和 Langfuse 上报。这样既执行了本任务真正修改的生产渲染代码，也避免真实服务资产和 fixture 同时注入造成重复 Prompt。

每个 `case × variant × repeat` 都创建：

- 新 Codex 进程。
- 新工作目录。
- 新 Mock Bridge 和随机本地端口。
- 新 `runId`、`sessionId`。
- 新 `CODEX_SQLITE_HOME`。
- 新临时 `HOME` 和 `USERPROFILE`。

runner 同时使用：

- `codex exec --ephemeral`，不保留会话 rollout。
- `--ignore-rules`，不读取本地执行规则文件。
- `--ignore-user-config`，不读取个人 `config.toml`。
- 关闭 Codex plugins、apps、multi-agent、skill search 和用户 Skill instructions。

只有登录凭据目录例外。runner 让所有运行引用同一个已经登录的 `CODEX_HOME`，但不读取、复制、修改或保存 `auth.json` 内容。Codex 桌面端和 CLI 本来就会共享缓存登录，token 也会自动刷新，因此复制一个可独立刷新的认证缓存反而更危险。参考 [Codex authentication](https://learn.chatgpt.com/docs/auth) 和 [Codex CLI command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)。

为避免认证刷新竞争，同一时间只启动一个 benchmark 脚本，不要并行启动多个 campaign，也不要在实验过程中执行 `codex login` 或 `codex logout`。

## 9. 固定实验变量

V0 与候选 Variant 必须保持以下变量完全一致：

- 模型：`gpt-5.6-luna`
- reasoning effort：`high`
- verbosity：`medium`
- Codex CLI 版本
- provider 和 route
- case、fixture、Gold 和 split
- 重复次数
- runner 版本
- 超时时间

每个 run 的这些值都会写入 `run-manifest.json`。Codex CLI 版本或模型设置不同的运行不得合并比较。

当前建议的重复策略不做过度工程化：

- 基础设施 Smoke：每条 1 次。
- Dev 迭代：每条每个 Variant 1 次。
- 入围候选与 V0 的复核：每条 3 次。
- 最终 Test：冻结方案后每条 3 次。

如果预算有限，先完成单次 Dev 配对比较，再只对 V0 和最佳候选做 3 次复核。不要通过减少负样本来省预算。

## 10. 指标和分母

所有 `INFRASTRUCTURE_ERROR` 单独计数，不进入下面的准确率分母。

| 指标 | 计算方式 | 对应任务目标 |
|---|---|---|
| Trigger Recall | 正样本中产生任意 TDAI 调用意图的比例 | 是否知道应该调用 |
| Effective Call Rate | 正样本中完成全部 Gold 序列且可执行的比例 | 有效调用率 |
| False Call Rate | 负样本中产生任意 TDAI 调用的比例 | 误调用率 |
| FirstAction@1 | 全部正样本中首个工具、endpoint 和参数正确的比例 | 整体首选正确性 |
| Conditional Tool@1 | 已经触发调用的正样本中，首选正确的比例 | 工具选择正确率 |
| Argument Accuracy | 正样本中 Gold 参数正确的比例 | 调用是否可用 |
| Execution Validity | 正样本中完整序列、header 和 HTTP 响应有效的比例 | 端到端可执行性 |
| Overcall Rate | 有效运行中超过允许调用次数的比例 | 是否过度调用 |

报告的主表至少包含 Effective Call Rate、False Call Rate、Conditional Tool@1 和注入 Token。其他指标用于解释失败发生在触发、选择、参数还是执行阶段。

## 11. Token 和 cache 数据如何保存

Token 不能只看 Codex 返回的总 `input_tokens`。总输入还包含 Codex 自带的系统与开发者提示，不能代表任务一的注入成本。

runner 分开保存两组数据：

1. 注入成本：对生产注入流水线渲染出的 system Prompt 使用固定 `o200k_base` 编码，记录 token、字符数、UTF-8 bytes 和 SHA-256。
2. 模型用量：从 Codex `turn.completed.usage` 保存 `inputTokens`、`cachedInputTokens`、`cacheWriteInputTokens`、`outputTokens` 和 `reasoningOutputTokens`。

每个 run 写入 `usage.json`，整个 campaign 写入 `campaign-usage.json`。Variant 的注入 Token 必须按同一 case 做配对比较，再报告均值、总量、绝对节省量和节省比例：

`Token 节省率 = (V0 注入 Token - Candidate 注入 Token) / V0 注入 Token`

原始 Prompt 的 hash 会因为随机 bridge 地址和 session id 变化。runner 另保存把这两个运行时值标准化后的 `promptCacheTemplateSha256`，用于确认同一 `case × variant` 的模板在不同 repeat 中稳定。

Prompt cache 的最终验收还要检查生产请求中首次变化的位置：候选只能改变计划内的注入区域，不能让原本位于注入块之前的稳定 system 前缀变成动态内容。`cachedInputTokens` 作为运行事实保存，但不代替上述结构检查，因为 cache 是否命中还会受服务端状态影响。

## 12. 运行产物

每个 run 目录至少包含：

| 文件 | 内容 |
|---|---|
| `prompt.txt` | 实际注入给 Codex 的 benchmark developer instructions |
| `codex-prompt-input.json` | Codex 最终组装的完整 Prompt 审计结果 |
| `run-manifest.json` | case、模型、CLI 版本、hash、Token 和隔离设置 |
| `codex-events.jsonl` | Codex 原始 JSONL 事件 |
| `codex-stderr.log` | runner stderr，用于识别策略拦截等基础设施错误 |
| `trace.jsonl` | Mock Bridge 收到的有序调用 |
| `evaluation.json` | 单 case 评分或基础设施错误 |
| `usage.json` | 注入 Token 和模型 usage |
| `run-result.json` | 退出状态、usage 和评分的汇总 |

一个 campaign 还会生成：

- `campaign-manifest.json`
- `traces.jsonl`
- `scores.jsonl`
- `scores.jsonl.summary.json`
- `campaign-usage.json`

这些运行产物位于 `eval/tool-prompt-bench/runs/`，默认不进入 Git。

## 13. 无效运行判定

下列情况一律标记为基础设施错误，不得当作模型失败：

- Codex 超时。
- Codex 非零退出。
- 命令执行出现 `blocked by policy`。
- 完整 Prompt 审计失败。
- Mock Bridge 未能启动或协议层异常。
- 固定模型设置、CLI 版本或 fixture 与对照组不一致。

如果模型在自然语言中声称要调用工具，但命令被本地策略拦截，也仍是基础设施错误。不能按 `NO_TDAI_INTENT` 计分。

## 14. 用户手动执行顺序

所有命令从 `MemoryProxy` 目录执行。

先查看 MemoryProxy 的 Docker 启动命令。此命令不构建镜像，也不启动容器：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\start-benchmark-proxy.ps1 `
  -PrepareOnly
```

确认后启动 MemoryProxy：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\start-benchmark-proxy.ps1
```

脚本把继承的 `config.yaml` 只读挂载进容器。YAML 保持不变，启动参数临时完成两项覆盖：

- 上游使用当前官方 ChatGPT Codex endpoint，不使用旧的 `muyuan.do`。
- 容器内的 Langfuse 地址使用 `http://host.docker.internal:13000`。

Langfuse 服务未启动时，MemoryProxy 仍可用于模型实验，但不会产生可查看的 Langfuse 页面。正式报告所需的本地 trace、usage 和评分仍由 benchmark runner 保存。

MemoryProxy 健康后，只打印将要运行的 benchmark 命令，不启动 Codex：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\run-benchmark.ps1 `
  -Scope smoke `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -Verbosity medium `
  -PrepareOnly
```

确认命令和 `CODEX_HOME` 路径无误后，由用户手动启动 12 条 Smoke：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\run-benchmark.ps1 `
  -Scope smoke `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -Verbosity medium
```

单条诊断：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\run-benchmark.ps1 `
  -Scope case `
  -CaseId memory-dev-preference-001
```

Smoke 的 12 条全部没有基础设施错误后，再运行 Dev：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\run-benchmark.ps1 `
  -Scope dev `
  -Repeats 1
```

Test 只在 Prompt 冻结后执行，脚本需要显式确认：

```powershell
powershell -ExecutionPolicy Bypass -File .\eval\tool-prompt-bench\run-benchmark.ps1 `
  -Scope test `
  -Repeats 3 `
  -AllowHeldOutTest
```

## 15. 正式开始前的 Gate

满足以下条件后，才进入 V0 正式采集：

- 数据生成物 hash 与 `dataset-manifest.json` 一致。
- 100 条 Gold 序列全部能通过 Mock Bridge 单元测试。
- MemoryProxy `8096/health` 正常，正式请求的 `providerBaseUrl` 指向本机 Proxy。
- 手动 PowerShell Smoke 不再出现策略拦截。
- 当前 Codex 登录态在运行前后保持正常，runner 产物中不存在认证文件副本。
- Smoke 的 12 个 run 都产生 `trace.jsonl`、`evaluation.json` 和 `usage.json`。
- 模型、推理强度、CLI 版本和 Variant 标签记录完整。
- Test 尚未用于 Prompt 调优。

Gate 通过后的顺序是：V0 Dev 基线、V1 子改造迭代、入围版本三次复核、冻结候选、最终 Test、实验报告。V1 内的 A、B、C 是同一层级的改造类型，可以分别形成中间候选；V2 是在 V1 结果上继续深入，不应与 V1 当作完全并列方案。每次都保留中间产物，因为 V1 的某个中间版本可能优于最后一次迭代。
