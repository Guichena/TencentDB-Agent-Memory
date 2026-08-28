# 任务一代码改造分阶段执行计划

| 项目 | 当前值 |
|---|---|
| 状态日期 | 2026-08-28 |
| 任务 | Proxy 系统提示词注入优化 |
| 本会话范围 | 只做代码改造，不构造数据，不运行模型评测 |
| 方法依据 | V6.1、当前源码和已冻结实验口径 |
| 当前 worktree | `D:\projects\TencentDB-Agent-Memory-task1-code` |
| 当前分支 | `codex/task1-c07-eval-correctness` |
| C07 审计起点 | `d0996809ed63f6cfc67504ad180db0d48ac70475`（`task1-code-freeze`） |
| 当前上游 | 尚未推送 |
| 生产源码基线 | `5299c00aaf65481703c180fd69df066d11254eb7` |
| 基线上游 | `origin/feat/server_team` |

本文件只管理代码线的分支、任务、检查和交付。数据结构、World、真实资产、模型参数、首调用评分、Token 指标和正式评测顺序仍以 [EXPERIMENT-DESIGN.md](./EXPERIMENT-DESIGN.md) 为准。数据准备由另一会话或另一工作线负责。本会话不会修改其文件，也不会等待数据完成才开始代码开发。

代码全部完成并冻结以后，才把代码冻结提交交给实验集成线。正式模型评测必须等待代码和数据两边各自通过交接 Gate，再按照 V0、V0-C、V1a、V1、V2、V3 的顺序开展。

本计划的依据按以下顺序解释：任务一原始要求决定范围和交付，用户确认的执行决策决定双线并行、逐阶段分支和完整 Compiler，V6.1 补充文档决定 Prompt Variant、合同、Token 与缓存口径，当前源码和远端状态决定文件、能力与基线事实。Topic 2 的旧文档以 `959381a` 为源码基线，不能覆盖当前证据。

### 任务要求与代码阶段的对应关系

| 任务要求 | 代码阶段 | 证明材料 |
|---|---|---|
| 应调用时实际调用 | C04 选择规则，后续模型评测验收 | V2 Prompt diff 与 Effective Call Rate |
| 不应调用时避免误触发 | C03 去重、C04 中性选择边界，C05 只消除不可执行能力的暴露 | False Call Rate 与 Pure Coding 结果 |
| 调用后选对 Memory、Skill 或 Knowledge 工具 | C04 Family Gate、when/avoid/contrast | Conditional Tool@1 与家族选择正确率 |
| 尽量减少注入 Token | C02 协议压缩、C03 语义去重，C05 在能力关闭时裁剪 | 逐块静态 Token 和相邻版本差值 |
| 不破坏 Prompt Cache | C00 确定性与缓存身份，C06 稳定前缀审计 | 四层 Hash、首个变化字节和 Provider usage |
| 正式指标不被运行器污染 | C07 身份分离、上游预检、Pilot 隔离与完整 usage | `/health` 预检、`formalMetricEligible`、五类 usage 字段 |
| 不评价资产内容质量 | 所有代码阶段保持动态资产加载语义不变 | Static 与 Dynamic 分层产物 |
| 优化说明、实验报告和代码 PR | C06 交接后由实验与交付阶段完成 | code-freeze commit、Gate 报告和最终结果 |

跨模型比较属于后续实验，不增加代码 Variant。调整物理注入位置只允许作为独立 Layout Probe，未单独立项时不进入 C00 至 C06。

## 当前情况

### 三个基点必须区分

| 类型 | 分支或提交 | 用途 |
|---|---|---|
| 生产 V0 基线 | `codex/task1-v0-baseline` 指向 `5299c00` | 保存开始代码改造前的最新生产源码，只读 |
| 评测基础设施基点 | `codex/task1-p01-benchmark-harness`，当前为 `0762564` | 保存已有 Harness、合同测试和执行脚本 |
| 代码集成主线 | `codex/task1-code-integration` | 依次合并每个通过 Gate 的代码阶段 |

`codex/task1-proxy-prompt-optimization` 指向旧的 `959381a`，其中 Topic 2 基于旧方案，不作为当前实现起点。`work/server-team` 也不是本任务的开发基点。

生产 V0 基线分支需要长期保留：

```text
codex/task1-v0-baseline -> 5299c00
```

建议同时保留 annotated tag：

```text
task1-v0-baseline-20260828 -> 5299c00
```

这条分支只用于源码追溯、差异审查和 Legacy Prompt parity，不接收 Harness、Prompt Variant、数据或报告提交。后续正式 V0 评测使用同一集成构建中的 `legacy` profile，不能通过切换到旧提交运行，否则 Harness 与运行环境也会随之变化，比较将不公平。

### 已完成但不能误认为已经实现 Variant 的内容

当前 P01 分支相对历史基点 `c0cf94f` 多六个已提交改动：

| Commit | 内容 |
|---|---|
| `2b45668` | 增加 Tool Prompt Benchmark Harness |
| `0df4d77` | 冻结模型执行设置 |
| `933feed` | 采用 Luna high，并增加资产预检要求 |
| `dc7195e` | 增加不复制认证文件的手动 Campaign |
| `b8a5d6c` | 正式运行要求经过可用的 MemoryProxy |
| `0762564` | 删除过时上游地址措辞 |

已有的 100 条 case、Schema、Mock Bridge、协议解析、评分器和 runner 可继续承担合同回归，但它们不代表 V0-C 至 V3 已完成。当前 `--variant` 主要还是标签，尚未稳定映射到生产 InjectionPipeline 中的真实 Prompt profile。

2026-08-28 刷新远端后，`origin/feat/server_team` 已从 `c0cf94f` 前进三个提交到 `5299c00`：

| Commit | 与任务一相关的影响 |
|---|---|
| `9cdfcf0` | Header identity 在 cache miss 时继续进入 Session Init，影响冷启动注入路径 |
| `0afa626` | Task 改为可选，Team 与 Agent 足以注册，影响 Session 和运行时绑定合同 |
| `5299c00` | 新增 Pi AgentProfile，影响 anchor、序列化和 Legacy parity 覆盖面 |

代码线必须以 `5299c00` 为生产 V0。P01 的六个任务内 Harness 提交和本轮计划文档提交需要移植到该基线，不能继续把 `c0cf94f` 当作当前生产状态，也不能把这三个上游提交当成任务一代码改造。

### 当前源码中的主要改造面

| 位置 | 当前职责 | 本任务中的改造方向 |
|---|---|---|
| `src/injection/index.ts` | 构造并缓存 Pipeline Bundle，注册 Injector | 接入 profile、Capability Signature 和缓存命名空间 |
| `src/injection/pipeline.ts` | 收集 ContextBlock 并应用 Adapter | 保持 Hook 顺序和注入位置，传递确定性编译上下文 |
| `src/injection/types.ts` | 注入类型和 Hook 合同 | 增加最小的 Prompt profile 与编译类型 |
| `src/injection/agents/pi/profile.ts` | Pi 的结构解析、anchor 和重建 | 作为 Legacy parity 与兼容性回归的一部分，不修改其协议 |
| `src/config.ts`、`src/types.ts` | 默认配置和 ProxyConfig | 增加默认值为 `legacy` 的配置入口 |
| `src/injection/injectors/tdai-tools-injector.ts` | Memory 工具说明 | 由 profile 编译 Memory 工具块 |
| `src/injection/injectors/tdai-profile-memory-injector.ts` | L2/L3 与 Memory Guide | 保留动态画像，按阶段处理重复 Guide |
| `src/injection/injectors/skill-tools-injector.ts` | Skill 工具说明 | 共享协议、选择语义和 Capability 裁剪 |
| `src/injection/injectors/skill-injector.ts` | Available Skills | 保持动态资产，不把它与静态工具说明混算 |
| `src/injection/injectors/knowledge-tools-injector.ts` | Knowledge 工具与资源 | 编译工具卡，保留真实仓库绑定 |
| `src/__tests__/tool-prompt-bench.test.ts` | 现有合同与 Harness 回归 | 扩展 profile、parity、Token 和 Capability 测试 |

完整 Compiler 是当前主方案，不再只做薄 Variant seam。Legacy 继续调用冻结的原 Renderer，非 Legacy profile 才从 RuntimeToolContract 和 ToolPromptSpec 编译，避免用 Compiler 重写历史文案后再由自身证明 parity。只有 C00 在约定时间内无法通过 Legacy byte parity 时，才允许记录 `THIN_SEAM_FALLBACK`，而且必须明确说明哪些 Compiler 能力延期。未经记录不能静默退回多个手写 Renderer。

### 当前工作区边界

当前工作区还有其他线的未提交文件。本会话遵守以下归属：

| 路径 | 归属 | 本会话处理方式 |
|---|---|---|
| `eval/tool-prompt-bench/EXPERIMENT-DESIGN.md` | 共用计划 | 只做与代码分支规划有关的必要修订 |
| `eval/tool-prompt-bench/TASK1-CODE-STAGE-GATED-EXECUTION-PLAN.md` | 代码线计划 | 本会话维护 |
| `eval/tool-prompt-bench/worlds/` | 数据线 | 不修改、不暂存、不提交 |
| `eval/tool-prompt-bench/TASK1-DETAILED-TECHNICAL-REPORT.md` | 待评审文档 | 不修改、不暂存、不提交 |
| `MemoryProxy/README.md` | 现有工作区状态 | 先解释状态，不顺手提交 |

任何时候都不能使用 `git add .`。提交时显式列出本阶段文件。

## 分支拓扑

### 总体关系

```text
5299c00
   └── codex/task1-v0-baseline                 只读长期保留

5299c00 + P01 六个 Harness 提交 + 本轮计划文档提交
   └── codex/task1-code-integration            代码集成主线
         ├── C00 branch -> Gate C00 -> merge
         ├── C01 branch -> Gate C01 -> merge
         ├── C02 branch -> Gate C02 -> merge
         ├── C03 branch -> Gate C03 -> merge
         ├── C04 branch -> Gate C04 -> merge
         ├── C05 branch -> Gate C05 -> merge
         └── C06 branch -> Gate C06 -> merge -> code freeze
                                                    │
                                                    └── 交给实验集成线
```

每个阶段必须建立不同分支。下一阶段不能直接从上一阶段的功能分支继续写，而要先把上一阶段通过 Gate 的提交合并回 `codex/task1-code-integration`，复跑关键检查，再从最新集成提交创建新分支。

### 阶段分支

| 顺序 | 分支 | 唯一职责 | 起点 |
|---:|---|---|---|
| 0 | `codex/task1-code-c00-compiler` | Variant seam、Runtime Contract、Prompt Spec、Compiler、Legacy parity | 代码集成初始提交 |
| 1 | `codex/task1-code-c01-v0c` | V0-C 合同纠错 | C00 合并提交 |
| 2 | `codex/task1-code-c02-v1a` | V1a 共享协议压缩 | C01 合并提交 |
| 3 | `codex/task1-code-c03-v1b` | V1b 语义去重，形成正式 V1 | C02 合并提交 |
| 4 | `codex/task1-code-c04-v2` | V2 工具选择校准 | C03 合并提交 |
| 5 | `codex/task1-code-c05-v3` | V3 Capability 与生命周期裁剪 | C04 合并提交 |
| 6 | `codex/task1-code-c06-freeze` | 全 profile 回归、Token 清单和代码冻结 | C05 合并提交 |

主线版本关系固定为：

```text
V0 -> V0-C -> V1a -> V1b/V1 -> V2 -> V3
```

这些版本是递进关系，代码分支也是递进关系。V1a 与 V1b 不是两个并列候选，V1b 必须包含 V1a。V1 是 V1b 通过 Gate 后的正式名称。可选的 `dedup-only` 只是从 V0-C 编译的诊断 profile，不建立生产分支，也不改变主线。

### 分支生命周期

- 阶段分支通过 Gate 后使用非 squash 方式合回代码集成主线。
- 每个阶段的关键提交保留，不把多个改造类型压成一个提交。
- 阶段分支和远端分支至少保留到最终 PR 与实验报告完成。
- Gate 通过的合并提交可以打 `task1-c00-pass` 至 `task1-c06-pass` 标签。
- Gate 未通过时继续在当前阶段分支修复，不提前创建下一阶段分支。
- 若需要推翻已合并阶段，创建明确的修订分支，不改写已经用于实验的提交历史。

计划中的建分支命令如下，本文件更新时不自动执行：

```powershell
# 生产 V0 基线，只创建一次
git branch codex/task1-v0-baseline 5299c00
git tag -a task1-v0-baseline-20260828 5299c00 -m "freeze Task 1 V0 production baseline"

# 从仓库根目录执行，在同级目录建立干净的代码集成 worktree
$task1CodeWorktree = Join-Path (Split-Path -Parent (Get-Location)) "TencentDB-Agent-Memory-task1-code"
git worktree add $task1CodeWorktree `
  -b codex/task1-code-integration 5299c00

# 在代码集成 worktree 中依次移植 P01 的六个任务内提交和计划文档提交
# 每次移植后核对提交范围，不带入 worlds、技术报告或 README 状态

# 每个阶段都从最新代码集成主线创建
git switch -c codex/task1-code-c00-compiler
# C00 Gate 通过并提交后，切回集成主线执行非 squash 合并
git switch codex/task1-code-integration
git merge --no-ff codex/task1-code-c00-compiler
# 复跑 C00 关键检查后才创建 C01
git switch -c codex/task1-code-c01-v0c
```

后续 C02 至 C06 重复相同流程。实际执行前先确认当前工作区中的数据文件不会被带入代码分支。独立 worktree 必须从 `5299c00` 创建，再只移植已提交的任务一 Harness 和计划提交，不能让未跟踪的 `worlds/` 随工作目录迁移。

## 阶段 Gate 通用规则

### 状态

| 状态 | 含义 | 是否允许创建下一阶段分支 |
|---|---|---|
| `NOT_STARTED` | 尚未开始 | 否 |
| `IN_PROGRESS` | 正在实现或检查 | 否 |
| `BLOCKED` | 缺输入或检查失败 | 否 |
| `PASSED` | 任务、测试、产物和记录全部完成 | 是，先合并再创建 |

代码阶段没有 `REJECTED_AS_CANDIDATE`。Prompt 效果是否入选只能由后续模型评测决定。本会话负责让每个 Variant 正确、可选择、可复现、可计量，不能因为猜测效果不好而跳过一个阶段。

### 每阶段必须保存的 Gate 记录

建议保存到：

```text
eval/tool-prompt-bench/reports/gates/C00-gate.md
...
eval/tool-prompt-bench/reports/gates/C06-gate.md
```

每份记录至少包含：

```markdown
# Gate C00

- status:
- branch:
- branch head:
- parent integration commit:
- merge commit:
- scope:
- files changed:
- commands and exit codes:
- tests passed:
- baseline diagnostics:
- prompt artifacts and hashes:
- token artifacts and deltas:
- unresolved findings:
- decision:
- checked at:
```

Gate 报告必须在阶段分支提交。合并后补充 merge commit 和复跑结果。只有报告状态为 `PASSED`，并且集成主线复跑成功，才能创建下一阶段分支。

### 每个阶段共同检查项

- [ ] 当前分支名与当前阶段一致。
- [ ] 分支父提交等于记录中的最新代码集成提交。
- [ ] `git status --short` 中没有数据线文件或无法解释的修改。
- [ ] 本阶段只完成表中规定的一类改造。
- [ ] 生产默认 profile 仍为 `legacy`。
- [ ] V0 Legacy Prompt parity 未被破坏。
- [ ] 当前阶段及所有前序 profile 都能从同一构建中选择。
- [ ] Prompt bytes、SHA-256、静态 Token、动态 Token 和总 Token 已保存。
- [ ] Prompt 稳定前缀 hash 与首个变化字节位置已保存。
- [ ] 相关单元测试、合同测试和快照测试有命令与退出码。
- [ ] 全量类型检查与冻结基线诊断比较，没有新增错误。
- [ ] 未启动 Codex、Luna、MemoryProxy Campaign、Docker 资产服务或 Langfuse 正式评测。
- [ ] 阶段提交信息说明目标、主要实现、验证和已知限制。

旧基点曾记录 8 个全量类型检查错误，但远端基线已经变化，不能继续引用这个数字。代码准备阶段必须在 `5299c00` 上重新采集诊断指纹。代码 Gate 不要求顺手修复任务一之外的基线错误，但必须证明当前阶段没有增加错误数量或改变原错误。相关模块出现新错误时不能用“基线已有错误”跳过。

### 每阶段 Token 产物

每个 profile 至少保存以下字段：

```text
profile
source_commit
compiler_version
capability_signature
block_id
injection_point
bytes
characters
static_tool_tokens
dynamic_asset_tokens
binding_tokens
total_injection_tokens
effective_system_tokens
prompt_sha256
stable_prefix_bytes
stable_prefix_sha256
first_changed_byte_from_parent
tokenizer
```

固定输入下重复渲染必须得到相同 bytes、Token 与 hash。Token 产物按 profile 和 Capability Signature 分目录保存，不能只在 Gate 报告中手填一个总数。

## C00：Compiler 与 Variant 基础设施

分支：`codex/task1-code-c00-compiler`。

目标：建立一条可测试、可复现的生产编译路径，但不优化任何工具措辞。

计划新增的代码限定在 `src/injection/tool-prompt/`：

```text
tool-prompt/
├── types.ts
├── profiles.ts
├── runtime-contract.ts
├── compiler.ts
├── policy.ts
├── execution-grammar.ts
├── surface-coordinator.ts
├── lint.ts
└── specs/
    ├── memory.ts
    ├── skill.ts
    └── knowledge.ts
```

只有确实承载独立职责的文件才创建。若实现后某个文件只剩转发或常量别名，应并回最近的深模块，不能为了贴合目录图保留空抽象。

任务：

- 在配置类型和默认配置中增加 `injection.toolPromptProfile`，默认值为 `legacy`。
- 冻结 profile 枚举和 Variant 映射，未知值启动失败，不能静默回退。
- 建立 RuntimeToolContract，记录 Memory、Skill、Knowledge 的 endpoint、method、Header、必填参数、返回形状和 Capability。
- 建立 ToolPromptSpec、PromptUnit 与 Compiler，只编译静态协议、工具卡和选择规则。L3/L2、Skill Listing 和 Knowledge Resource 等动态资产继续由现有 Injector 加载与渲染。
- 保留现有 `render*Block()` 纯函数作为稳定入口。`legacy` 分支调用冻结的旧 Renderer，其他 profile 调用 Compiler。
- 建立纯函数 Prompt Surface Coordinator，根据 active family mask 在现有家族块中选择全局 Policy 与共享协议的唯一宿主，不创建新的顶层标签。
- 将 profile 与 Capability Signature 纳入 Pipeline Bundle 缓存身份。
- 保持 Hook id、point、anchor、priority 和物理注入位置不变。
- 建立 `legacy` 的字节级 parity、确定性、快照和 Token 测试。
- 预注册 `legacy`、`contract-corrected`、`protocol-compact`、`compact`、`selection-calibrated` 和 `capability-pruned` profile，但本阶段除 `legacy` 外暂时继承父内容，不提前写 C01 至 C05 的优化。

重点检查：

- [ ] 冻结样本中的 `legacy` 与 `5299c00` Provider-visible Prompt 逐字节一致。
- [ ] 同一输入重复编译得到相同 bytes、hash 和 Token。
- [ ] Runtime Contract 每项都能指向 Bridge、Handler 或 Core 源码证据。
- [ ] Compiler 不读取评测 Gold，也不根据用户 Query 选择 profile。
- [ ] 默认配置、无配置 YAML 和旧配置仍选择 `legacy`。
- [ ] Pipeline cache 不会在不同 profile 或 Capability 间复用错误结果。
- [ ] 现有 Handler 均继续从生产 InjectionPipeline 获取 Prompt。
- [ ] Claude Code、CodeBuddy、WorkBuddy、Pi 和无 anchor fallback 路径均通过 Legacy parity 与结构保留测试。
- [ ] 有 Task 与无 Task 的 header identity Session 都不会改变静态模板或选错缓存身份。
- [ ] 现有 XML 标签、Hook id、point、anchor、priority 和 `session_init` cacheStrategy 全部保持不变。

退出条件：C00 Gate 为 `PASSED`，合回代码集成主线并复跑 parity。若必须使用 `THIN_SEAM_FALLBACK`，Gate 中要单列原因、延期模块和后续补齐点。

## C01：V0-C 合同纠错

分支：`codex/task1-code-c01-v0c`，从 C00 合并提交创建。

目标：只修正当前注入说明与真实运行合同不一致的地方。

任务：

- 逐项复核 RuntimeToolContract 与 Memory Bridge、Skill Bridge、Knowledge Handler 的实现。
- 只修改有源码或 Contract Probe 证据的 endpoint、method、Header、字段、返回类型和 Capability 描述。
- 保存 V0 到 V0-C 的机器可读差异和每项证据。
- 保持措辞密度、重复结构、选择规则和注入位置不变。

本阶段禁止语义去重、共享协议压缩、工具描述中立化、Tool/No-Tool Gate、布局调整和 Capability 裁剪。

重点检查：

- [ ] 每个修改都能指向证据位置。
- [ ] V0-C 没有混入无证据的文案优化。
- [ ] Bridge、Parser、Scorer 和 Prompt 使用一致的运行合同。
- [ ] `legacy` profile 仍保持 byte parity。
- [ ] 若没有合同错误，明确记录 `V0-C_EQUALS_V0`，仍保留该阶段和分支。

退出条件：C01 Gate 为 `PASSED`，V0-C 冻结并合回代码集成主线。

## C02：V1a 共享协议压缩

分支：`codex/task1-code-c02-v1a`，从 C01 合并提交创建。

目标：只压缩重复的调用协议，不改变模型何时调用、选择哪个 Family。

任务：

- 提取一次公共 POST、Content-Type、Session、Service Header 和 JSON 规则。
- 共享协议只由 Prompt Surface Coordinator 选中的第一个实际静态家族块承载，全文只出现一次。
- 删除每个工具重复的 curl 外壳、错误码和响应信封。
- 最多保留一个 canonical example。
- 由 RuntimeToolContract 编译工具特有 endpoint 和必填参数。
- 不修改 when、avoid、contrast、Family Gate 或动态资产。

重点检查：

- [ ] V1a 相对 V0-C 只有协议层 diff。
- [ ] 所有工具仍能编译出可执行的 endpoint、Header 和参数。
- [ ] Static Tool Tokens 低于 V0-C，且逐块保存差值。
- [ ] Safe Parser 能解析 canonical 形式。
- [ ] malformed、合同和快照样本全部通过。
- [ ] `legacy` 与 V0-C 输出没有变化。

退出条件：C02 Gate 为 `PASSED`，V1a 冻结并合回代码集成主线。

## C03：V1b 语义去重并形成 V1

分支：`codex/task1-code-c03-v1b`，从 C02 合并提交创建。

目标：在 V1a 上删除重复行为规则，形成正式 V1。

任务：

- 合并 `<tdai_memory_tools>` 与 `<memory-tools-guide>` 的重复规则。
- 删除跨 Family 重复的调用上限、失败处理和身份说明。
- 给每条行为规则保留唯一归属和稳定 id。
- 增加 Duplicate Semantic Unit 检查。
- 不新增 Tool/No-Tool Gate、when/avoid/contrast 或描述去偏。

重点检查：

- [ ] V1b 的父 profile 是 V1a，不是 V0-C。
- [ ] 删除的每个语义单元都能指向保留位置。
- [ ] Static Tool Tokens 继续低于 V1a。
- [ ] Runtime Contract 和 Capability Surface 不变。
- [ ] V1a 以及所有更早 profile 输出不变。
- [ ] 可选 `dedup-only` 只作为诊断 profile，不进入生产主线。

退出条件：C03 Gate 为 `PASSED`，V1b 以正式 V1 名称冻结并合回代码集成主线。

## C04：V2 工具选择校准

分支：`codex/task1-code-c04-v2`，从 C03 合并提交创建。

目标：用尽可能短的选择规则提高应调用识别和工具选择，同时减少纯 Coding 误调用。

任务：

- 增加最短 Tool/No-Tool Gate。
- 增加 Memory、Skill、Knowledge Family Gate。
- 中立化 `<available_skills>` 的固定选择说明，不改变 Skill 条目、顺序和可见范围。
- 工具卡只保留 when、avoid、必要 contrast 和执行字段。
- 删除 `mandatory`、`partially relevant MUST load` 等推广性措辞。
- 保留真实路径来源、身份字段和必填参数。
- 增加 Description Bias Lint 和选择规则矛盾检查。
- 不改变注入位置、动态资产内容和 Capability 配置。

重点检查：

- [ ] V2 diff 只涉及选择语义和中性措辞。
- [ ] 全局 Gate 与局部工具卡没有矛盾。
- [ ] 相似工具之间保留最短但充分的区分信息。
- [ ] Pure Coding、当前上下文充分和本地源码优先规则明确。
- [ ] Runtime Contract、共享协议和动态资产 Renderer 不变。
- [ ] V1 以及所有更早 profile 输出不变。

退出条件：C04 Gate 为 `PASSED`，V2 冻结并合回代码集成主线。行为收益留到后续 Dev 评测判断，C04 不运行模型。

## C05：V3 Capability 与生命周期裁剪

分支：`codex/task1-code-c05-v3`，从 C04 合并提交创建。

目标：只根据 Session Init 已知能力确定性裁剪不可执行工具，减少无效暴露和 Token。

任务：

- 只使用生产源码已经存在的能力事实：Injector 启用状态、`AssetCapabilityFlags`、Memory/Knowledge 配置、`allowLlmWrite` 与 `isExtractionAllowed()`。
- `allowLlmWrite=false` 时移除写工具。`isExtractionAllowed(config, "skill")` 为 false 时移除 `skill_extract`，因为主对话链路不会继续填充它依赖的 conversation buffer。
- 不新增 `allowLlmExtract`，也不改变 Skill Bridge 的 endpoint、allowlist 或身份注入合同。
- Memory、Skill、Knowledge、Wiki 或 Code Graph 已被现有配置关闭时，移除对应工具卡和动态资源外壳。
- 生成稳定 Capability Signature，并纳入 Prompt 与缓存身份。
- 不根据当前 Query、Gold 或模型历史动态选择 profile。

重点检查：

- [ ] Capability Matrix 只覆盖当前生产真实支持的组合。
- [ ] Prompt 暴露面与 Bridge 实际允许面一致。
- [ ] 关闭能力后没有残留 Header、Guide 或空 Listing 外壳。
- [ ] 全能力开启时 V3 与 V2 不发生无关变化。
- [ ] 同一 Session、Capability 和资产快照下 hash 稳定。
- [ ] V2 以及所有更早 profile 输出不变。

退出条件：C05 Gate 为 `PASSED`，V3 冻结并合回代码集成主线。

## C06：全 profile 回归与代码冻结

分支：`codex/task1-code-c06-freeze`，从 C05 合并提交创建。

目标：不增加新优化，只把代码线整理成可交给实验线的唯一冻结提交。

任务：

- 在同一构建中保留 V0、V0-C、V1a、V1、V2 和 V3。
- 复跑 Legacy Parity、Compiler Determinism、Runtime Contract、Capability、Token、cache key 和快照测试。
- 生成所有 profile 的逐块 Prompt、Token、bytes、hash 和稳定前缀清单。
- 验证 runner 参数能够选择真实生产 profile，而不只是写入 Variant 标签。
- 审计 `5299c00..C06` 的代码差异、配置兼容性和提交归属。
- 生成代码线总 Gate 索引和实验集成交接清单。

重点检查：

- [ ] 默认生产 profile 仍为 `legacy`。
- [ ] 所有 profile 在同一构建中可选择且互不污染。
- [ ] profile 切换进入 Pipeline Bundle 与缓存命名空间。
- [ ] 没有 World、Gold、资产快照或正式运行结果进入代码分支。
- [ ] `5299c00` 的类型检查诊断已经冻结，本分支没有新增诊断。
- [ ] 所有中间版本的 Prompt 和 Token 产物完整。
- [ ] 代码集成主线复跑所有关键检查仍通过。

退出条件：C06 Gate 为 `PASSED`，合回 `codex/task1-code-integration`，记录唯一 code-freeze commit，并打 `task1-code-freeze` tag。此后本会话停止修改 Prompt，除非后续评测明确创建新的修订阶段和分支。

## C07：评测正确性与身份链路收口

分支：`codex/task1-c07-eval-correctness`，从 `task1-code-freeze` 创建。

目标：不修改任何 V0 至 V3 Prompt，只修复会阻断链路或污染指标的运行器、身份、上游和产物问题。

任务：

- 把旧 100 case 明确降级为 `mock-contract` Pilot，所有 manifest、evaluation、score 和 usage 标记 `formalMetricEligible=false`。
- Pilot 的预渲染 Prompt 只注入一次；只有显式诊断环境、专用 Space 和专用 Header 同时满足时，MemoryProxy 才跳过第二次 Session Init/注入。
- 分离官方 Provider Bearer 与 TDAI user key；后者只使用环境映射 Header，禁止转发上游、进入模型 shell、日志或实验产物。
- 增加 Codex-only invocation override，并从 `/health` 校验实际 URL、client-auth passthrough、TDAI 鉴权和诊断模式，避免旧 YAML 或 per-agent key 偷换上游。
- 缺失或不完整的模型 usage 一律记为基础设施错误；逐运行和 Campaign 保存 input、cached input、cache-write input、output、reasoning output 与静态注入 Token。
- 补齐 V0-C 新增 Skill 读合同的 Mock Bridge 可执行覆盖。

重点检查：

- [x] 六个冻结 Prompt、Token、bytes、hash 和稳定前缀零变化。
- [x] 普通生产请求不能触发 Pilot bypass。
- [x] `x-tdai-user-key` 不进入上游、shell、Langfuse debug 或运行产物。
- [x] 实际 Codex 上游或鉴权模式不符合预注册值时，在模型运行前失败。
- [x] Pilot 结果无法被误标为正式任务一指标。
- [x] 全量类型诊断数量与标准化指纹不变。

退出条件：C07 Gate 为 `PASSED`，实现和 Gate 记录提交完成；`task1-code-freeze` 继续保持原 Prompt 冻结含义，实验集成线改用 C07 通过提交作为运行器基点。

## 代码线交接 Gate

代码冻结以后，只交付以下内容给实验集成线：

- 唯一的 `code_freeze_commit`。
- V0 至 V3 的 profile 映射。
- Legacy parity 证据。
- Runtime Contract 及其源码证据。
- 每个阶段的 Gate 报告和合并提交。
- Prompt、Token、bytes、hash、稳定前缀和 Capability 产物。
- 基线类型错误指纹与无新增错误证明。
- 选择真实 profile 的 dry-run 命令。
- Provider/TDAI 双身份接线、有效 Codex 上游预检和 Pilot/正式层次标记。
- 已知限制和回退到 `legacy` 的方法。

以下内容不在本会话处理：

- 10 个 World 和 200 条正式 case。
- 真实 Memory、Skill、Knowledge 资产导入。
- 数据快照、恢复和 Sealed Test 管理。
- Luna 调用、重复运行、随机顺序和正式指标计算。
- Langfuse 观测和最终实验报告数值。

实验集成线只有在代码交接 Gate 与数据交接 Gate 都通过后，才能合并两边，执行真实链路 Smoke，再逐版本评测。

## 当前执行状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 生产 V0 基线分支 | `FROZEN` | `codex/task1-v0-baseline` / `task1-v0-baseline-20260828` 均指向 `5299c00` |
| P01 计划文档收口 | `COMPLETED` | V6.1 已收敛为代码专用分阶段执行口径 |
| 代码集成分支 | `FROZEN` | C00 至 C06 已按非 squash 顺序合入，最终提交由 `task1-code-freeze` 标识 |
| C00 | `PASSED` | Compiler、Runtime Contract 与 Profile seam 已冻结 |
| C01 | `PASSED` | V0-C 合同纠错已冻结 |
| C02 | `PASSED` | V1a 协议压缩已冻结 |
| C03 | `PASSED` | V1 语义去重已冻结 |
| C04 | `PASSED` | V2 选择校准已冻结 |
| C05 | `PASSED` | V3 Capability/Lifecycle 裁剪已冻结 |
| C06 | `PASSED` | 全 profile、Runner 接线与集成主线复跑均已通过 |
| C07 | `PASSED` | Prompt 零变化；身份、上游、usage、Skill 合同和 Pilot 隔离均已通过门禁 |
| 模型评测 | 不属于本会话 | 等待代码与数据两边冻结 |

## 本会话代码线结果

1. 生产基线、C00 至 C06 阶段分支、集成分支和各阶段 Gate 均已建立并保留。
2. 每个阶段均先通过门禁，再以非 squash merge 合入集成分支；提交历史可逐阶段回溯。
3. 六个 Variant 在同一构建中选择真实生产 Profile，Token、bytes、Hash、稳定前缀、缓存身份与类型诊断基线均已冻结。
4. C06 集成主线复跑通过，原 Prompt 冻结记录仍由 `task1-c06-pass` 和 `task1-code-freeze` 标识。
5. C07 只处理运行器与指标正确性，不改变冻结 Prompt；通过后把其提交交给实验集成线。
6. 代码线停止修改 Prompt；等待独立数据线 Gate 完成后再进入模型实验。

这套分支和 Gate 记录保证每一类改造可单独回溯，后续实验能够准确归因到相邻版本差异。
