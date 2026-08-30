# 建设任务 09：T17 与 T18

把本文件完整复制到一个新的 Codex 任务。主任务使用 `gpt-5.6-sol`，推理强度设为 `high`。主任务负责源码核对、输入冻结、来源审查、最终 Gold、Team Gate 和提交；批量草稿必须交给 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none` 的子智能体生成。

本任务只建设两个 Dev Team：T17 前端架构与性能、T18 系统性能工程。每个 Team 40 条，共 80 条和 30 个 pair。T17、T18 与 T19、T20 属于同一轮 `formal-v2` 增量建设，四个 Team 全部完成后再统一集成。已经冻结的 `formal-v1.1` 不得修改、重写或重新打 Tag。

## 必须绑定专用 worktree

新任务创建时把工作区绑定到：

```text
D:\projects\TencentDB-Agent-Memory-task1-data-build-20team-t17-t18
```

任务启动后的可写根目录不能靠 `Set-Location`、`cd` 或 `git -C` 改变。如果任务没有绑定这个目录，立即返回 `WORKSPACE_NOT_BOUND`，不要创建目录、切换分支或在其他 worktree 写文件。

目标分支、worktree 和启动 Tag 已由准备任务创建。只运行下面的只读启动 Gate：

```powershell
$expectedBranch = 'codex/task1-data-build-20team-t17-t18'
$expectedRoot = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-20team-t17-t18'
$gitTrust = 'safe.directory=D:/projects/TencentDB-Agent-Memory-task1-data-build-20team-t17-t18'
$launchTag = 'task1-data-parallel-launch-20team-v1'
$expectedLaunchCommit = 'ffa1fe18085d47ed4da6b2306240152cc8590a86'
$expectedFormalV11Commit = '02620d8313dcb883b7a57c4c2edc8f4286eb4bc9'
$expectedSchemaCommit = '1048681880b51e7a52a6b8b0b731eadeec44e118'

$currentTop = git -c $gitTrust rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { throw 'cannot resolve current worktree' }
$currentRoot = (Resolve-Path -LiteralPath $currentTop).Path
$resolvedExpectedRoot = (Resolve-Path -LiteralPath $expectedRoot).Path
if ($currentRoot -ne $resolvedExpectedRoot) { throw "WORKSPACE_NOT_BOUND: create a new Codex task rooted at $expectedRoot" }

$currentBranch = git -c $gitTrust branch --show-current
if ($LASTEXITCODE -ne 0) { throw 'cannot read builder branch' }
if ($currentBranch -ne $expectedBranch) { throw 'unexpected builder branch' }

$launchCommit = git -c $gitTrust rev-parse "$($launchTag)^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'launch tag cannot be resolved' }
if ($launchCommit -ne $expectedLaunchCommit) { throw 'launch tag moved or resolved incorrectly' }

$headCommit = git -c $gitTrust rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'builder HEAD cannot be resolved' }
if ($headCommit -ne $launchCommit) { throw 'builder HEAD does not match launch tag' }

$formalV11Commit = git -c $gitTrust rev-parse 'task1-data-formal-v1.1^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'formal-v1.1 tag cannot be resolved' }
if ($formalV11Commit -ne $expectedFormalV11Commit) { throw 'formal-v1.1 tag moved or resolved incorrectly' }

$schemaCommit = git -c $gitTrust rev-parse 'task1-data-parallel-baseline-v2^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'schema tag cannot be resolved' }
if ($schemaCommit -ne $expectedSchemaCommit) { throw 'unexpected schema baseline commit' }

git -c $gitTrust merge-base --is-ancestor $formalV11Commit HEAD
if ($LASTEXITCODE -ne 0) { throw 'formal-v1.1 is not an ancestor of builder HEAD' }
git -c $gitTrust merge-base --is-ancestor $schemaCommit HEAD
if ($LASTEXITCODE -ne 0) { throw 'schema baseline is not an ancestor of builder HEAD' }

$worktreeStatus = @(git -c $gitTrust status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'cannot inspect builder worktree' }
if ($worktreeStatus.Count -gt 0) { throw 'builder worktree is not clean at startup' }
```

任一检查失败都停止。启动 Gate 通过后立即开始 T17，持续做到 T17 Gate 通过并提交，再开始 T18。不要只汇报环境或计划后停止。

## 开始前读取和禁止读取

完整读取：

- `MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/DRAFT-SCHEMA.md`
- `MemoryProxy/eval/tool-prompt-bench/worlds/formal-schema.ts`
- `MemoryProxy/eval/tool-prompt-bench/worlds/formal-compile.ts`
- `MemoryProxy/eval/tool-prompt-bench/worlds/formal-snapshot.ts`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/teams/T17.json`
- `MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/teams/T18.json`

启动提交中的并行 README 和运行手册可能保留 T01 至 T16、640 条 `formal-v1` 的上一轮描述。只复用其中稳定的 schema、来源、Luna 分工、pair 和泄漏规则。本轮 Team、Split、数量、分支、Tag、路径和 revision 以本提示词为准。

亲自核对生产 Memory、Skill、Knowledge 的注入、可见性、搜索、读取和参数源码。Gold 只能由这些源码和本任务冻结的资产推导。

不要读取现有 `formal-v1.json`、provider、private Gold、其他 Team 的 staging 正文或 generator 草稿来模仿 case。已有 640 条只作为不可变祖先和后续去重集合，不是新 case 模板。需要对象形状时只看 schema、类型和空字段结构。允许后续用 hash 或重复度脚本和旧集合比较，但不要输出或改写旧 Query、上下文和 Gold。

## 写入边界

只允许写入：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T17/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T18/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T17/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T18/**
```

禁止修改 registry、全局合同、总状态、provider、private Gold、snapshot、sealed manifest、Prompt 代码、生产代码、运行配置和其他 Team。需要辅助脚本时，只能放进对应 `build-09/T17` 或 `build-09/T18` 目录。

## Team 主题

T17 是前端架构与性能 Team，项目流覆盖组件与设计系统、状态和数据缓存、SSR 与 hydration、前端构建和模块边界、Web 性能、可访问性与浏览器兼容。重点是前端工程机制，不能把 T05 的 Web 产品需求、页面文案或产品流程换名重做。

T18 是系统性能工程 Team，项目流覆盖 CPU 与内存分析、并发与锁、I/O 和连接池、负载测试、容量规划、性能回归与基准设计。重点是定位性能约束和执行团队既有优化规则，不能把 T13 的告警排障或 T10 的构建发布换名重做。

每个 Team 维护 3 至 6 条同时推进的真实项目流。历史会话、Memory、Skill、Knowledge 和当前上下文要围绕这些项目交叉出现，让目标资产和干扰资产处在同一工程语境中，不能靠明显无关的名称排除干扰。

## 资产池

每个 Team 固定准备：

- 10 个 L0 历史会话，每个会话 12 至 20 条消息，包含决策演化、失败尝试、改口、跨会话引用和并行项目干扰。
- 16 条 L1 原子 Memory，覆盖约束、决策、失败原因、兼容性事实和待办边界。
- 5 个 L2 场景索引，只注入 path 和 summary；summary 不得提前泄漏目标答案。
- 1 个 L3 稳定画像，只放长期偏好和通用约束，不放具体 case 的答案。
- 不少于 16 个同域 Skill 资产，目标和干扰都进入当前 Agent 的真实可见范围。
- 3 个内部 Knowledge 资源，只建设 Knowledge Positive 和同域干扰所需内容，不扩建无关 Wiki 或 CodeGraph。

Memory、会话、项目历史和内部 Knowledge 可以按 Team 设定合成。不得给合成内容伪造 repository、revision、license、path 或外部 hash。

目标 Skill 和干扰 Skill 必须来自普通 GitHub 搜索找到的真实 Skill 文件。Star 数不设门槛，但仓库必须有明确许可证。Sol 在调用 Luna 前固定 repository URL、完整 commit SHA、license、文件 path 和 raw SHA-256，并把采用文件复制到当前 Team 的 source-material。Luna 只能根据这些冻结文件适配宿主工具名、listing description、`use_when` 和 `do_not_use_when`，核心技术步骤保持不变，不能凭空编写 Skill。不要安装来源仓库依赖，也不要运行来源仓库测试。

## Case 和 Gold 合同

每个 Team 恰好 40 条：

| 类型 | 数量 |
|---|---:|
| Memory Positive | 6 |
| Skill Positive | 6 |
| Knowledge Positive | 3 |
| 配对 No-tool Negative | 15 |
| 自然 Coding Negative | 10 |
| 合计 | 40 |

15 个 Positive 每个恰好对应一个 No-tool Negative，共 15 个 pair。每个 Team 的 Positive 中，搜索或 discovery 链路恰好 10 条，直接调用恰好 5 条。首屏注入只能提供工具入口、L2 path/summary、L3 和允许的 listing 信息，不能直接出现搜索型目标答案。

主指标看完整最小合法调用链是否成功，不只看第一次动作。`allowedFirstActions`、`allowedSequences`、目标资产和 `maxTdaiCalls` 必须由 Sol 按生产源码填写。后续调用所需的 id、path 或 tool name 必须能从 fixture 或前一步响应获得。允许多步调用，但 Gold 不得加入拿到目标资产后仍继续执行的无关步骤。

Positive 的当前 Query 和上下文必须缺少一个完成请求所需的唯一信息，该信息只由目标资产提供。配对 Negative 保持 identity、snapshot、workspace、query 和共享上下文相同，只通过一个登记的 context delta 补足这条信息，使模型可以直接回答或继续 coding。自然 Coding Negative 在完整干扰池下也不需要任何 TDAI 调用，不能只是删除 Positive 里的工具词。

Task 1 只判断是否调用、工具选择和完整最小链路。不要验证最终补丁、程序输出或工程任务是否真的完成。

## Sol 和 Luna 的执行顺序

每个 Team 按下面顺序独立完成：

1. Sol 核对生产源码和 Team registry，冻结项目流、身份、命名空间、资产可见性和禁止泄漏字段。
2. Sol 搜索并固定 Skill 来源，写唯一 input pack 和 source lock。
3. Sol 先让 Luna 分别生成 1 组 Memory、Skill、Knowledge 试验 pair。试验未通过时先修输入合同，不扩批。
4. 试验通过后，把 Memory、Skill、Knowledge 和自然 Coding Negative 分成互不写同一文件的 Luna 批次。可以按可用槽位并行，没有槽位就排队。
5. 每个 Luna 只写自己的 `generators/parallel/build-09/<team-id>/<batch-id>/`，不得读取其他 Luna 私有草稿，不得写 staging、最终 Gold 或全局文件。
6. Sol 逐批复核唯一信息缺口、资产可见性、完整最小链路、pair 单变量、真实干扰和 provider 泄漏，只把通过项写入 Team staging。
7. Team 数量不足时生成新的独立 case 补齐，不能复制旧 case 后替换术语。
8. T17 Gate 通过并单独提交后，再按相同流程建设 T18；T18 也单独提交。

每个 Luna 批次先运行：

```text
node MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/validate-luna-batch.mjs <batch-dir> <family-or-natural-negative> <expected-count> <team-id> <stage>
```

这个脚本只检查批次格式，不能替代 Sol 的语义复核。

## Team Gate 和提交

每个 Team 提交前必须确认：

- `team-fragment.json`、三类资产文件、`review.md` 和 `gate.json` 完整且能解析。
- case、pair、asset、source 和 batch ID 在当前 Team 内唯一，并带 T17 或 T18 命名空间。
- 分类严格为 6、6、3、15、10，合计 40；pair 严格为 15；搜索或 discovery 为 10，直接调用为 5。
- 10 个 L0、16 个 L1、5 个 L2、1 个 L3、不少于 16 个真实 Skill 和 3 个 Knowledge 满足可见性合同。
- 15 个 pair 只改变登记的 context delta，Positive 和 Negative 的 Query 不变。
- Gold 的每一步参数可获得，链路在正确资产处停止，provider 泄漏为 0。
- 所有采用 Skill 的 repository、commit、license、path、raw SHA-256 和 adapted SHA-256 可复算。
- 和冻结的 640 条旧集合不存在 Query、上下文、pair 模板或高阶 n-gram 复制。
- `git diff --check` 通过，相对 launch Tag 的全部改动都位于本任务允许目录。

禁止提取或应用 benchmark official patch，禁止安装上游依赖、运行上游测试、给合成历史做逐句外部来源闭环，也禁止运行 V0 至 V3 正式模型评测。

T17 和 T18 各自一个提交。提交正文写明 Team、40 条分类、15 个 pair、10/5 路由分布、Luna 批次、Skill 来源、运行过的 Gate 和已知限制。不要合并到集成分支，不要创建或移动任何 Tag，不要 push。

最终回复列出两个 Team 的提交 SHA、分类数量、资产数量、Luna 批次、Skill 仓库和固定 revision、Gold 链路分布、Gate 结果、输出路径和待集成问题。
