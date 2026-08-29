# Task 1 数据冻结后的执行计划

状态日期：2026-08-30

适用任务：Proxy 系统提示词注入优化

本计划从正式数据建设完成后开始执行。执行前必须以当前仓库和 Tag 重新证明以下条件，不得只引用本文的状态描述：

- 全部并行数据建设任务已经完成 T01 至 T16。
- `THREAD-00-INTEGRATION.md` 已完成分支验收和数据集成。
- Dev 240 条、Hidden 400 条、全集 640 条均通过正式 validator；Pair 共 240 对，其中 Dev 90 对、Hidden 150 对。
- `formal-v1` contract、provider input、Measurement-v2 private Gold/Pair overlay、snapshot 和全部 canonical hash 已冻结。
- 纠正后的 annotated Tag `task1-data-formal-v1.1` 已创建，且它解引的提交包含完整 DS06 overlay，数据集成 worktree 干净。
- 数据构造阶段没有运行 V0 至 V3，也没有根据模型得分修改 Query、上下文或 Gold。

若任一条件不成立，停止本计划，回到数据验收任务。不要用 Pilot 数据、未冻结 staging、`task1-data-core-formal-v1` 或旧 `task1-data-formal-v1` 代替 `task1-data-formal-v1.1`。后两个 Tag 即使存在，也必须被 R02 拒绝。

数据线 DS06 的四个 overlay 检查统一称为 `DS06-G1` 至 `DS06-G4`（private Gold v2、Pair v2、overlay validator、provider exclusion/compatibility）。它们不是本文的真实链路 R01、R02、R03 或 R04-FINAL，不得用数据报告中旧的 `R01_*`…`R04_*` 字段声称 real-chain Gate 已通过。

## 交付目标

后续工作需要完成四件事：

1. 把冻结的 Prompt 代码、正式数据和真实链路 Adapter 合到同一实验构建。
2. 通过真实 MemoryProxy 链路恢复资产并完成无模型 Gate。
3. 由用户手动运行 Luna High 的 V0 至 V3 实验，完整保存行为指标、Token、hash 和 trace。
4. 根据 Dev 和 Hidden 结果选择 Final，完成实验报告、优化说明和代码 PR。

数据可以在后续 revision 中增加。`formal-v1` 一旦用于评测就不能回写；新增 case 使用 `formal-v2` 或独立增量切片，每份实验结果都要绑定 dataset revision 和数据 hash。

## 当前代码冻结点

| 项目 | 固定值 |
|---|---|
| 代码 worktree | `D:\projects\TencentDB-Agent-Memory-task1-code` |
| 当前代码分支 | `codex/task1-c07-eval-correctness` |
| C07 提交 | `2dc7bc8b57442d2beae62efd5d570a83955b374d` |
| C07 Tag | `task1-c07-pass` |
| Prompt 冻结 Tag | `task1-code-freeze` |
| 模型 | `gpt-5.6-luna` |
| 推理强度 | `high` |
| 正式启动方式 | 用户手动启动 Codex campaign |

C00 至 C07 已经完成。V0、V0-C、V1a、V1、V2、V3 的 Prompt、Token、bytes、hash、稳定前缀和 profile 映射均已冻结。后续阶段不得继续润色或压缩这些 Prompt。

| Variant | Profile | 改造内容 |
|---|---|---|
| V0 | `legacy` | 原始生产注入 |
| V0-C | `contract-corrected` | 只修合同错误 |
| V1a | `protocol-compact` | 共享协议压缩 |
| V1 | `compact` | 语义去重后的正式 V1 |
| V2 | `selection-calibrated` | Tool/No-Tool 与工具家族选择校准 |
| V3 | `capability-pruned` | 按生产能力和生命周期裁剪不可执行暴露面 |

Final 不要求是 V3。Dev 或 Hidden 结果表明 V1、V2 更好时，可以选择它们，但 Final 必须直接引用冻结 profile，不能在实验后修改文案再沿用旧结果。

## 后续分支关系

```text
task1-c07-pass
  └─ codex/task1-real-chain-adapter-v1
       └─ Gate R01
            └─ codex/task1-experiment-integration-v1
                 ├─ 导入 task1-data-formal-v1.1
                 ├─ Gate R02：正式合同与 Runner
                 ├─ Gate R03：资产恢复
                 └─ codex/task1-measurement-v2-integration
                      ├─ non-squash 汇合 M0 / M1 / M2
                      ├─ Gate R04-FINAL：最终生产链路无模型验证
                      ├─ 冻结 task1-measurement-v2 / task1-candidate-base-v1
                      ├─ E01：12 条 Smoke
                      ├─ E02：Dev 240 条
                      └─ E03：Hidden 400 条
                           └─ codex/task1-final-profile
                                └─ 报告与 PR
```

每个阶段通过 Gate 后再进入下一阶段。已经用于实验的 commit、Tag、数据 revision 和结果目录不得改写。如果在 M2 合入前为调试跑过类似的真实链路检查，只能标记为 `R04a-debug`；它不能代替 M2 生产代码合入后的 `R04-FINAL`。

## R01：移植真实链路 Adapter 基础设施

### 目标

从旧实验分支移植仍然有效的生产请求边界、入口 observer 和停止控制，形成与数据加载解耦的 Adapter。本阶段只使用手工合同 fixture 做无模型验证，不导入正式 case，不生成正式指标。R02 只接入 `formal-v1` provider/private loader；private Gold 的正式评分只在后续 Measurement Integration 中由 M0/M1 执行。

### 分支与 worktree

从 `task1-c07-pass` 创建：

```powershell
git worktree add -b codex/task1-real-chain-adapter-v1 `
  D:\projects\TencentDB-Agent-Memory-task1-real-chain-adapter-v1 `
  task1-c07-pass
```

开始前确认：

```powershell
git status --short --branch -uall
git branch --show-current
git rev-parse 'task1-c07-pass^{commit}'
git rev-parse 'task1-code-freeze^{commit}'
git merge-base --is-ancestor task1-c07-pass HEAD
git merge-base --is-ancestor task1-code-freeze HEAD
```

工作树必须干净，当前分支必须为 `codex/task1-real-chain-adapter-v1`，两个祖先检查必须以退出码 0 结束。

### 旧 Adapter 的处理方式

现有分支 `codex/task1-real-chain-adapter` 不能整体合并。它包含以下提交：

```text
fc9e207 旧 W01 至 W03 World 集成
938b2de 旧 Pilot Gate
a133eb7 生产 real-chain adapter
```

只把 `a133eb773650` 当作实现参考。逐文件读取它的 diff，把仍然适用的逻辑通过 `apply_patch` 移植到新分支。不要 cherry-pick 整个分支，也不要导入这些旧内容：

```text
worlds/w01-*
worlds/w02-*
worlds/w03-*
worlds/world-schema.ts
worlds/worlds-bridge.ts
旧 100 条 dataset manifest
旧 dev/test Gold
```

可参考的旧文件范围：

```text
MemoryProxy/eval/tool-prompt-bench/real-chain-adapter.ts
MemoryProxy/eval/tool-prompt-bench/codex-runner.ts
MemoryProxy/src/__tests__/real-chain-adapter.test.ts
MemoryProxy/eval/tool-prompt-bench/reports/gates/P01-task2-real-chain-adapter-gate.md
MemoryProxy/package.json
```

移植时必须形成以下边界：

- Adapter 接受标准化的 Query、历史上下文、Space、Team、Agent、Task 和 session identity，不直接依赖旧 World 类型。
- Adapter 不读取 split、Gold 或 snapshot，不承担数据加载和评分。
- R02 的正式 loader 负责把 `formal-v1` provider case 映射到这个标准化输入。
- private Gold 只能由 Measurement Integration 的 scorer 读取，Adapter 的类型和产物中不得出现 Gold 字段。
- Adapter 经过真实 Session Init、生产 InjectionPipeline 和真实入口 observer。
- Mock Bridge 只保留合同测试用途，不产生正式指标。

### 停止边界

本阶段只冻结停止控制器的事件与状态转移合同。Positive case 在后续正式运行到达目标资产所需的最短合法 TDAI 链路后停止，不继续执行 Coding；多步 case 允许发现、读取或查询等完整链路。R01 的固定事件重放只能证明控制器按合同工作，绝不证明模型会触发正确工具或因 Prompt 而产生了正确因果链。

No-tool case 在以下任一事件发生后停止：

- 模型产生第一个非 TDAI 的实质响应。
- 模型发起第一个 TDAI Attempt。

runner 必须区分：

```text
TDAI_ATTEMPT
MALFORMED_TDAI_ATTEMPT
ENTRY_CALL
NON_TDAI_RESPONSE
INFRASTRUCTURE_ERROR
TIMEOUT
```

Attempt 表示模型有调用意图，Entry Call 表示请求真实到达工具入口。基础设施错误不能算作漏调或误调。

### 允许修改

```text
MemoryProxy/eval/tool-prompt-bench/real-chain-adapter.ts
MemoryProxy/eval/tool-prompt-bench/codex-runner.ts
MemoryProxy/eval/tool-prompt-bench/schema.ts
MemoryProxy/eval/tool-prompt-bench/README.md
MemoryProxy/src/__tests__/real-chain-adapter.test.ts
MemoryProxy/src/__tests__/tool-prompt-bench.test.ts
MemoryProxy/package.json
R01 Gate 报告
```

禁止修改：

```text
src/injection/injectors/** 的 Prompt 文案
Variant/Profile 映射
variants/code-freeze/** 中的 Prompt、Token、bytes 和 hash
formal-v1 Query、上下文、Gold 或资产内容
MemoryProxy 持久配置
用户 CODEX_HOME 和认证文件
```

### Gate R01（两段式 no-model）

**R01-A：纯合同与停止状态机**

- 不启动 MemoryProxy 外部服务，使用手工 fixture 覆盖 Memory、Skill、Knowledge、No-tool、多步、Malformed、Infrastructure Error 和 Timeout。
- 验证 `TDAI_ATTEMPT` 与 `ENTRY_CALL` 分层、最短 terminal 停止、No-tool 首次误尝试停止和基础设施错误不进行为分母。
- 这一段只验证软件合同，不发出 Provider 请求，不得使用“有效调用率已通过”等模型行为表述。

**R01-B：生产请求边界的 in-process capture**

- 请求经过真实 Session Init、prewarm 和生产 InjectionPipeline，在 capture upstream 前停止，不启动模型。
- 使用同一标准身份和手工合同请求，分别回放到真实的 Memory/Skill bridge 与 Knowledge tools 入口；observer 记录 accepted/rejected、HTTP/基础设施结果和有序 entry，但不得把这段回放伪装成模型产生的 Attempt。
- 验证只有一个 `<tdai_injections>`、身份头正确、runner 未预注入 TDAI 内容、未激活 Mock bypass，且本地 observer 能关联 run/case/session 和有序事件。
- Adapter、fixture 和 Gate 产物必须不含 `formalMetricEligible=true`；它们仍然不是正式模型结果。

在 `MemoryProxy` 目录运行：

```powershell
npm run eval:tool-prompt:real-chain:gate
npm run eval:tool-prompt:test
npm run eval:tool-prompt:capture-freeze
git diff --check
```

R01 总 Gate 要求：

- Adapter 测试覆盖 Memory、Skill、Knowledge、No-tool、多步链路和 Infrastructure Error。
- private Gold 不进入 Provider 输入。
- 本阶段不导入 `formal-v1` 数据，不运行只在数据分支存在的 D0 测试。
- C07 的 usage、身份、上游和正式指标保护仍生效。
- 六个 Variant 的 Prompt、Token、bytes、hash 和稳定前缀与 `task1-code-freeze` 一致。
- 相关新增 TypeScript 文件没有新增诊断。
- 全量 typecheck 的既有基线诊断单独记录，不要求在本阶段修复。
- 没有启动容器，没有调用 Luna，没有修改本机配置。

通过后提交实现、测试和 `R01-REAL-CHAIN-FORMAL-V1-GATE.md`。提交正文记录参考提交、没有导入的旧 World 内容、测试命令和 Prompt freeze 对比结果。

## R02：建立正式实验集成分支

### 目标

把通过 R01 的代码与纠正后的 `task1-data-formal-v1.1` 接入一个可运行构建，统一正式数据的 split、provider/private loader、runner 输入、raw evidence 产物、结果目录和冻结清单。R02 不实现或修改 M0/M1 scorer，不拥有 `formalMetricEligible`。

### 分支

从 R01 通过提交创建：

```text
codex/task1-experiment-integration-v1
```

专用 worktree：

```text
D:\projects\TencentDB-Agent-Memory-task1-experiment-v1
```

### 导入数据冻结产物

先读取并验证：

```powershell
git rev-parse 'task1-data-formal-v1.1^{commit}'
git show --stat --oneline 'task1-data-formal-v1.1^{commit}'
git status --short --branch -uall
```

如果 `task1-data-formal-v1.1` 不存在、不是 annotated Tag、解引提交未包含完整 DS06 overlay，或数据 worktree 不干净，R02 立即停止。`task1-data-core-formal-v1` 和旧 `task1-data-formal-v1` 在 R02 中都是 rejected input，不得因为其名称接近而 fallback。

记录数据 commit、Tag object、contract SHA、Dev/Hidden provider SHA、private Gold v2 SHA、Pair v2 SHA、21 个 Runtime contracts SHA 和 Dev/Hidden snapshot SHA。不要从可变分支名读取正式数据。本文不预写未冻结的 commit 或 hash，以 Tag 实际解引和 manifest 校验结果为准。

数据分支与代码分支来自不同工作线，不能未经审计直接合并整个历史。导入前列出 `task1-data-formal-v1.1` 相对共同祖先的文件，按以下范围接入：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/**
MemoryProxy/eval/tool-prompt-bench/worlds/formal-schema.ts
MemoryProxy/eval/tool-prompt-bench/worlds/formal-compile.ts
MemoryProxy/eval/tool-prompt-bench/worlds/formal-snapshot.ts
MemoryProxy/eval/tool-prompt-bench/worlds/formal-provenance.ts
对应正式 schema、compiler、validator 测试
数据冻结报告和 manifest
```

同时只把数据冻结分支中的 `eval:tool-prompt:d0:test` 脚本入口合入 `MemoryProxy/package.json`。不要用数据分支的整个 `package.json` 覆盖代码分支。

发生冲突时，只允许解决模块引用、类型适配、稳定排序和重复测试入口。Query、上下文、Gold、资产、来源和 snapshot 冲突时停止，回到数据冻结分支修复并创建新 revision。

### Runner 正式化

当前 `run-benchmark.ps1` 和 `codex-runner.ts` 仍包含旧 Pilot 的 `dev/test`、100 条清单和旧 case loader。改为：

- `dev` 对应正式 240 条和 90 个 Pair。
- `hidden_test` 对应正式 400 条和 150 个 Pair。
- `case` 允许按正式 case id 单条运行。
- `smoke` 使用预登记的 12 条 Dev case。
- `hidden_test` 必须显式传入 held-out 授权参数。
- 增加 `dataset_revision` 和 dataset commit。
- 从正式 provider JSONL 读取模型输入。
- private loader 只把 Gold v2、Pair v2 和 Runtime contracts 交给后续 Measurement Integration，绝不序列化到 Provider 请求。
- runner 只保存 R03 snapshot receipt 和预运行绑定；R02 的 `-PrepareOnly` 不执行资产恢复。
- 每个 case 使用 fresh session。
- 相同 case 的所有 Variant 使用同一动态资产和同一 provider 输入。
- R02 的 manifest、loader 和 PrepareOnly 产物必须不包含 `formalMetricEligible=true`；最终资格由 Measurement Integration 基于真实 run evidence 判定。

现有 Variant 映射保持：

```text
V0 -> legacy
V0-C -> contract-corrected
V1a -> protocol-compact
V1 -> compact
V2 -> selection-calibrated
V3 -> capability-pruned
```

### 结果目录

```text
MemoryProxy/eval/tool-prompt-bench/runs/
  <dataset-revision>/
    <campaign-id>/
      <case-id>/
        <variant-id>/
          <repeat>/
```

每个 run 至少保存：

```text
run-manifest.json
provider-prompt.json
injection-blocks.json
codex-events.jsonl
codex-stderr.log
entry-trace.jsonl
usage.json
evaluation.json
asset-check.json
```

`evaluation.json` 和正式 `asset-check.json` 只在 Measurement Integration 与 R04-FINAL 通过后的真实运行中产生。R02 `-PrepareOnly` 只生成命令、路径和不含 Gold 的 manifest。

`run-manifest.json` 必须记录：

```text
dataset_revision
dataset_commit
contract_sha256
provider_input_sha256
private_gold_sha256
snapshot_sha256
pair_contract_sha256
code_commit
prompt_freeze_commit
variant_id
profile_id
model_id
reasoning_effort
case_id
pair_id
split
run_id
session_id
started_at
finished_at
```

R02 不能预填尚不存在的 Measurement 或 R04-FINAL hash。真实 campaign 的最终 manifest 在 R04-FINAL 通过后再追加 `measurement_v2_commit`、`real_chain_gate_sha256` 和 `candidate_base_commit`，且必须取自实际 Tag/文件解引结果。

### Token 和 cache 字段

每次运行分别保存：

- Memory tool description token。
- Memory guide token。
- Skill tool description token。
- Available Skills instruction token。
- Knowledge tool description token。
- 静态工具描述总 token。
- L3、L2 index、Skill listing 和 Knowledge listing token。
- 完整注入 token、system prompt token、上下文 token 和 Query token。
- Provider 的 input、cached input、cache write、output 和 reasoning token。
- 每个注入块的 UTF-8 bytes、characters、tokens 和 SHA-256。
- `static_prefix_sha256`、`full_system_prompt_sha256` 和 `provider_input_sha256`。

Provider 不返回的 usage 字段保存 `null` 和 schema version，不能填 0。统一 tokenizer 的比较 token 与 Provider 实际 usage 分开报告。

### Gate R02

```powershell
npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
npm run eval:tool-prompt:real-chain:gate
npm run eval:tool-prompt:capture-freeze
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json
git diff --check
```

另外对 V0 和 V3 各运行一次 `-PrepareOnly`。它只能生成命令、运行目录和 manifest，不能调用模型。

Gate 要求：

- 代码 freeze 和数据 freeze 都能由 Tag 解析到固定提交。
- R02 的数据 Tag 精确为 `task1-data-formal-v1.1`，且旧 `task1-data-formal-v1` 和 `task1-data-core-formal-v1` 都会被负向测试拒绝。
- 正式 640 条都能被 runner 枚举，Dev 240、Hidden 400；Pair 固定为 Dev 90、Hidden 150。
- provider input 与 private Gold 完全分离。
- private Gold v2、Pair v2、21 个 Runtime contracts 与 snapshot 都与同一 corrected Tag/manifest 绑定。
- 六个 Variant 的静态 Prompt 仍与冻结清单一致。
- `-PrepareOnly` 不读取、复制或改写 `auth.json`。
- 默认模型为 Luna，推理强度为 High。
- 没有模型调用，没有容器副作用，没有正式结果文件。
- R02 不计算 ECR/TSR/PairExact，不决定 terminal，不产生 `formalMetricEligible=true`。

通过后创建 `EXPERIMENT-FREEZE-MANIFEST.json`，记录所有代码、数据、Prompt、runner、loader/evidence interface 和命令 hash。

## R03：恢复真实资产

### 目标

通过项目现有数据面接口把 `task1-data-formal-v1.1` 绑定的 `formal-v1` snapshot 恢复到本地 Memory、Skill 和 Knowledge 服务。恢复脚本只操作 Task 1 使用的冻结 Space 和数据 revision。R03 只验证恢复、可见性、绑定和哈希恒等性，不评价资产正文是否“好”、是否能帮助完成最终 Coding 任务。

恢复内容：

- L0 历史会话。
- L1 atomic memory。
- L2 scene 与索引。
- L3 core memory。
- Skill package、可见性与 Agent binding。
- 最小 Knowledge resource 与 Agent binding。

恢复期间关闭：

```text
LLM write
Memory extraction
Skill extraction
asset reflection
L0 write
archive write-back
```

不要修改用户常用 Space、Team、Agent 或已有资产。测试资产必须有明确 revision namespace，清理范围只能是该 revision。

### 恢复步骤

1. 校验 snapshot、provider 和 contract hash。
2. 清理同一 Task 1 revision 的旧测试资产。
3. 导入 Dev snapshot。
4. 用只读接口核对所有 id、数量、canonical snapshot hash、listing、visible-assets hash 和 binding；hash 只用于证明输入一致，不作资产质量分数。
5. 保存 receipt。
6. 重复清理与恢复。
7. 比较两次资产集合和 canonical hash。
8. Hidden snapshot 仅在 Dev Final 和 Hidden campaign 命令已冻结后，由单独 sealed lane 重复相同步骤；Prompt 开发会话不得打开 Hidden Query 或 Gold。R03 的 Dev Gate 不以提前恢复 Hidden 为通过条件。

receipt 至少包含：

```text
dataset_revision
split
snapshot_id
restored_at
restore_script_sha256
asset_counts
asset_content_sha256
skill_listing_sha256
knowledge_tool_list_sha256
verification_status
```

### Gate R03

- 两次恢复得到相同资产数量和 hash。
- 所有目标资产能通过生产只读接口访问。
- 搜索型目标没有进入第一层 listing。
- 每个搜索池达到正式数据合同规定的干扰数量。
- 没有残留上次运行新增的 Memory、Skill、session 或 Knowledge 状态。
- 没有写入非 Task 1 revision 的数据。
- 没有资产语义质量、最终回答或 Coding 成功率检查。

失败时归类为资产恢复问题，不修改 Prompt 或 Gold。

## M-INT：Measurement-v2 Integration

### 目标与顺序

R03 通过后，从实验集成提交创建 `codex/task1-measurement-v2-integration`。按 `M0 -> M1 -> M2` 的依赖顺序做 non-squash 汇合，保留每个来源提交、merge commit 和验证结果；不得把三项压成一个无法追溯的提交，也不得在汇合时改 Prompt、Query、Gold、Pair 或 snapshot。

- M0：实现最短充分工具决策链的 terminal/entry scorer，并把首动作与完整链路拆开。
- M1：实现 Pair v2 的配对统计、工具/不工具决策与工具家族选择统计。
- M2：接入 usage、隔离和 cache telemetry，并包含 Measurement-v2 所需的生产 `InjectionPipeline`、adapter/handler metadata 修正。

Measurement Integration 是 `formalMetricEligible` 的唯一 owner：只有它能在汇总真实模型 run evidence 时组装最终资格；R01 fixture、R02 loader/manifest、R03 restore receipt、M0/M1/M2 的单项 Gate 和 R04-FINAL 都必须保持 `false` 或不提供该字段。M0/M1 只定义和验证评分合同，不能把 synthetic replay 或无模型结果标成正式指标。

### Gate M-INT

- M0、M1、M2 均从已审计来源提交按固定顺序 non-squash 汇合，来源 SHA 与 merge SHA 写入清单。
- M0 的 terminal 判定只评价是否到达正确工具决策链，不评价工具返回的资产正文、最终答案或 Coding 是否完成。
- M1 使用 `task1-data-formal-v1.1` 的 private Gold v2、Pair v2 和 21 个 Runtime contracts；这些 private 字段不进入 Provider 输入、Prompt 或 Langfuse Prompt。
- M2 的 usage 字段保持 Provider 原始语义，cache telemetry 与工具行为指标分栏保存。
- 汇合后复跑代码、合同、provider-exclusion 和 private-loader 测试；任何 Prompt hash、数据 hash 或 snapshot hash 变化都停止。
- 此时仍未运行模型，不产生正式分数，也不创建 `task1-measurement-v2` 或 `task1-candidate-base-v1` Tag。

## 三条正式隔离 lane

三条 lane 分开建清单和收据，不得把“fresh session”写成 snapshot 已恢复或 cache 已冷启动的替代证明：

1. **Session/local-state lane**：每个 case 使用新的 session、context、run namespace 和本地 trace 目录；不得继承上一 case 的消息、工具 attempts、本地会话文件或写回状态。
2. **Snapshot/asset lane**：同一配对 case 的所有 Variant 绑定同一冻结 snapshot、visible-assets hash 和 restore receipt；运行前后核对 Memory、Skill、Knowledge 只读状态，且不把资产内容质量作为 Task 1 指标。
3. **Provider-cache lane**：只记录 Provider 实际返回的 input、cached-input/cache-write 等 usage 和稳定前缀；fresh session 不等于 cold cache。行为主实验保持既定交错顺序，cache 诊断若需要 warm/cold 对照则单列 campaign，不与工具调用分数混算。

## R04-FINAL：M2 后真实 MemoryProxy 无模型 Gate

### 目标

只在包含 M0、M1、M2，特别是 M2 生产代码修改的最终集成提交上，证明正式输入能经过生产链路，且 loader、runner、身份、注入、observer 和停止边界的连接没有污染指标。M2 前的同类检查统一记为 `R04a-debug`，不得冒充或替代 R04-FINAL。

链路：

```text
Auth
-> Session Init
-> prewarm
-> production InjectionPipeline
-> capture upstream request
-> read-only Memory/Skill/Knowledge entry
-> observer trace
```

这一阶段不让模型作决策。使用 loader 枚举、身份/可见性探针、合同重放和固定工具调用完成三层覆盖：

- loader 必须枚举正式 640 条：Dev 240、Hidden 400；Pair 240 对：Dev 90、Hidden 150，不得漏项、重号或跨 split。
- T01 至 T16 每个 Team 至少运行一个生产身份与可见性探针；总体覆盖 Memory、Skill、Knowledge 和 No-tool，但不读取 Hidden Query/Gold 来调 Prompt。
- 21 个 Runtime contracts 全部通过生产只读入口重放，覆盖单步、多步、停止边界和 malformed/over-call 记录形状。
- Space、Team、Agent、Task 解析正确，每个请求只注入一次 `<tdai_injections>`。
- L3、L2 index、Skill listing 和 Knowledge metadata 的 canonical/visible hash 与冻结 snapshot 一致；这只证明输入身份与可见性，不评价资产内容质量。
- 静态工具描述来自指定 Variant 的 production renderer。
- observer 能关联 run id、case id、session id 和有序 attempts，入口参数符合生产协议。
- 运行前后资产 hash 不变，No-tool replay 的 runner 不会自行制造 TDAI Attempt。
- Langfuse 不可用时，本地 trace 仍完整，模型输入不发生变化。

运行：

```powershell
npm run eval:tool-prompt:real-chain:gate
npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
```

R04-FINAL 的固定 replay 只能证明链路与观测合同，不证明模型会主动调用、选对工具或完成工具决策链；其产物必须保持 `formalMetricEligible=false`。通过后冻结 `REAL-CHAIN-NO-MODEL-GATE.json`，绑定精确的代码、数据、Measurement Integration、Prompt、snapshot 和 640-case loader hash，然后才在同一通过提交上创建 annotated `task1-measurement-v2` 与 `task1-candidate-base-v1`。此后修改 Adapter、loader、runner、scorer、snapshot restore、M2 生产代码或生产注入代码，都必须重新运行 R04-FINAL 并创建新候选 revision。

## E01：用户手动运行 12 条 Smoke

只有 R01、R02、R03、Measurement Integration 和 R04-FINAL 全部通过，才允许调用模型。

### 固定设置

```text
model = gpt-5.6-luna
reasoning_effort = high
dataset_revision = formal-v1
variant = V0
repeats = 1
```

使用当前官方 Codex 登录和现有 `CODEX_HOME`。脚本不能复制认证文件、改写持久配置或让用户重新登录。MemoryProxy 配置以只读方式挂载；临时实验参数只存在于当前进程和 run manifest。

12 条 Smoke 从 Dev 预登记，覆盖：

- Memory、Skill、Knowledge。
- Positive、配对 Negative、自然 Coding Negative。
- 单步和多步链路。
- listed、searchable 和 Knowledge discovery。
- 不同 Team 和上下文长度。

用户先运行 `-PrepareOnly` 检查命令、模型、上游、路径和数据 hash，再手动启动正式命令。

Smoke 只判断链路和产物是否完整，不据此选择 Final。失败时按以下顺序处理：

1. 身份、认证、服务、超时或 trace 丢失，记为 Infrastructure Error，修环境或 runner。
2. Prompt、数据或 Gold hash 不一致，停止整个 campaign。
3. 模型正常产生行为但调用错误，保留为行为结果，不改 Prompt 或 case。

Gate：12 条均产生完整 manifest、Prompt、events、entry trace、usage、evaluation 和 asset check，且运行前后 snapshot hash 不变。

## E02：Dev 240 条逐版本评测

### 运行顺序

```text
V0 vs V0-C
V0-C vs V1a
V1a vs V1
V1 vs V2
V2 vs V3
```

每一组完成并形成阶段报告后再开始下一组。同组两个 Variant 按 case 交错，起始顺序轮换：

```text
case 1: A, B
case 2: B, A
case 3: A, B
case 4: B, A
```

公平性要求：

- 同一个 case 使用同一 provider input 和 snapshot。
- 每次使用 fresh session。
- 模型、推理强度、verbosity 和超时一致。
- 除 Variant profile 外，不改变 system、developer、messages 或工具可见性。
- 不携带上一 case 的消息、session、本地 trace 或资产写回状态；冻结 snapshot 保持只读。
- Provider cache 不承诺逐 case 清空，只按实际 usage 记录，并由交错顺序平衡；需要 cold/warm 对照时进入单独 cache 诊断 campaign，不混入行为主指标。
- 基础设施错误重跑时使用同一 Variant 和输入，原失败记录保留。
- 不根据阶段分数修改数据、Gold、scorer 或已冻结 Prompt。

每个相邻版本报告保存整数分子和分母、逐 case 配对差异、Token 差异、失败分类和代表性 trace。

### 主指标

以完整合法链路成功为主指标：

```text
Complete Chain Success Rate
```

同时报告：

- Effective Call Rate。
- False Call Rate。
- Conditional Tool Family Accuracy。
- First Action Accuracy。
- Malformed Attempt Rate。
- Over-call Rate。
- 静态工具描述 Token。
- 动态资产 Token。
- 完整 system prompt Token。
- Provider input、cached input、output 和 reasoning usage。
- 稳定前缀长度与 cache usage。

静态 Token 更少不能补偿明显的行为退化。先应用行为 Gate，再看 Token 和改动范围。

### Dev 候选选择

保留 V0 和 V0-C 作为固定对照，从 V1a、V1、V2、V3 中选最多两个候选进入 Hidden。选择记录必须说明：

- 相对 V0-C 的完整链路成功数差异。
- Positive 和 Negative 分项结果。
- Memory、Skill、Knowledge 分项结果。
- 配对 case 的净改善与净退化。
- 静态和动态 Token。
- 失败是否集中在特定入口或措辞。

编号更高不构成入选理由。

## E03：Hidden 400 条冻结评测

Hidden 只运行：

```text
V0
V0-C
Final 候选 1
Final 候选 2，可选
```

Hidden 开始前冻结：

- 候选 profile。
- scorer commit。
- dataset revision 和全部 hash。
- snapshot restore 脚本。
- campaign 命令。
- case 顺序和 Variant 交错规则。

Hidden 运行期间不能修改 Prompt、Gold、case、资产、scorer 或 Gate。基础设施问题保留原始记录并按预登记规则重跑。

Hidden 报告需要给出：

- 四项任务原始指标。
- 完整链路成功率。
- Memory、Skill、Knowledge、Pair Negative、Natural Negative 分项。
- 整数分子、分母和配对差异。
- 静态、动态和 Provider Token。
- cache usage 和稳定前缀。
- Infrastructure Error、Malformed Attempt 和超时。
- 每个候选的失败 trace 索引。

如果以后增加 `formal-v2`，保留 `formal-v1` 全部结果。新 revision 可以只报告新增切片，也可以重跑主要候选；两种结果不能覆盖或混算旧分母。

## E04：冻结 Final profile

建立分支：

```text
codex/task1-final-profile
```

起点为完成 Hidden 报告的实验集成提交。只允许：

- 选择一个已经冻结并实际评测过的 profile。
- 更新默认或推荐配置。
- 更新回退到 `legacy` 的说明。
- 保存 Final manifest 和实验结果引用。
- 复跑代码、Prompt freeze 和合同 Gate。

禁止修改选中 profile 的 Prompt 文案、工具卡、选择规则、Capability 投影或注入位置。任何 Prompt 内容变化都产生新的 Variant 和新的实验，不得沿用本轮结果。

Final manifest 至少记录：

```text
final_variant
final_profile
code_commit
prompt_sha256
dataset_revision
dataset_commit
dev_report_sha256
hidden_report_sha256
selection_reason
rollback_profile
```

## D01：实验报告、优化说明和代码 PR

### 实验报告

主表至少包含：

| Variant | Complete Chain | Effective Call | False Call | Tool Family | Static Tokens | Full Injected Tokens | Provider Input |
|---|---:|---:|---:|---:|---:|---:|---:|

报告分开呈现：

- Dev 与 Hidden。
- Memory、Skill、Knowledge。
- Pair Negative 与 Natural Negative。
- Attempt 指标与 Entry 指标。
- 静态比较 token 与 Provider usage。
- 行为失败与基础设施失败。

每个汇总数字都能追到单 case 的 run manifest、Prompt、events、entry trace、usage 和 evaluation。

### 优化方案说明

说明：

- V0-C 修了哪些合同错误。
- V1a 删除了哪些重复协议。
- V1 合并了哪些重复语义。
- V2 如何校准 Tool/No-Tool 和工具家族选择。
- V3 如何按现有能力裁剪不可执行工具。
- 每阶段保持不变的运行时合同。
- 每阶段的静态 Token 和稳定前缀变化。
- Final 的选择依据和未选择其他版本的原因。

不要把 Compiler、Harness 或真实链路基础设施的贡献写成模型能力提升。

### 代码 PR

PR 包含：

- RuntimeToolContract、ToolPromptSpec、PromptUnit 和 Compiler。
- V0 至 V3 profile。
- Final profile 选择与回退配置。
- formal-v1 Adapter、runner 和 observer，以及 Measurement-v2 的 M0/M1 scorer 与 M2 telemetry/isolation 集成。
- Token、usage、hash 和 cache 记录。
- 相关测试、Gate、复现命令和已知限制。

大型原始运行产物不提交仓库，只提交 manifest、汇总报告和可追溯索引。PR 不带本机认证、私有配置、Langfuse 密钥或用户数据。

## 每阶段提交规则

一个提交只完成一种工作：

```text
feat(tool-prompt-bench): adapt real chain to formal-v1
test(tool-prompt-bench): gate formal-v1 real-chain behavior
feat(tool-prompt-bench): bind runner to frozen formal dataset
test(tool-prompt-bench): freeze experiment integration inputs
docs(tool-prompt-bench): record no-model real-chain gate
docs(tool-prompt-bench): report formal-v1 dev results
docs(tool-prompt-bench): report formal-v1 hidden results
feat(proxy-prompt): select final evaluated profile
```

提交正文写清：输入 Tag、数据 revision、改动范围、运行命令、Prompt hash 是否变化、结果 hash 和已知限制。不要使用 `git add .`，显式暂存当前阶段文件。

阶段分支和 Tag 至少保留到实验报告与 PR 完成。已经用于实验的提交不做 rebase 或 force push。

## 全局停止条件

出现以下情况时停止当前阶段：

- `task1-code-freeze` 或纠正后的 `task1-data-formal-v1.1` 解引用发生变化。
- Prompt、provider、private Gold 或 snapshot hash 与冻结清单不一致。
- 同一个 case 的不同 Variant 使用了不同动态资产或上下文。
- runner 把 Infrastructure Error 计为漏调或误调。
- private Gold 进入 Provider 输入或 Langfuse Prompt。
- case 之间残留 session、Memory、Skill、Knowledge 或写回状态。
- 用户 Codex 配置、认证文件或登录状态被修改。
- Hidden 开始后发生 Prompt、Gold、资产或 scorer 修改。
- Final profile 与实际评测 profile 的 Prompt hash 不一致。

停止后保留所有原始产物，记录最后一个成功阶段和失败原因。修复基础设施时不改 Prompt 或数据；修复客观数据错误时创建新的 dataset revision，并重新运行所有受影响 Variant。

## 完成定义

满足以下条件后，Task 1 才算完成：

- `task1-data-formal-v1.1`、代码 freeze、`task1-measurement-v2`、`task1-candidate-base-v1`、Final profile 和实验结果都有不可变 commit 或 annotated Tag。
- 正式实验经过真实 MemoryProxy 链路。
- Dev 与 Hidden 的主指标、Token 和 cache 数据完整。
- 有效调用率、误调用率、工具选择正确率和注入 Token 均有优化前后对比。
- 完整链路成功率、首动作、Malformed Attempt 和 Infrastructure Error 单独报告。
- 每个结果能追溯到单 case 的 Prompt、事件、入口请求、usage 和资产 hash。
- 实验报告、优化方案说明和代码 PR 使用相同的 Final commit 与数据 revision。
- 回退到 `legacy` 的方法经过验证。
