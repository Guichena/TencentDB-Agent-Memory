# Task 1 数据集并行建设说明

本目录用于把 T01 至 T16 的正式数据建设拆成八个相互独立的 Codex 任务。每个任务负责两个 Team，并在任务内部调用 `gpt-5.6-luna` 子智能体生成批量草稿。当前集成任务只负责冻结公共输入、准备提示词和最终集成，不替八个建设任务生成数据。

## 为什么这样拆

并行单位是完整 Team 分片，不是全局合同中的任意数组。八个建设任务可以同时工作，因为它们拥有不同的 Team 和输出目录。共享的 `formal-v1.json`、状态文件、provider 输出和快照只能由集成任务修改，否则多个任务会产生难以审查的合并冲突，也可能让某个 Team 的可见资产误进入另一个 Team。

每个建设任务只包含两个主任务：完成第一个 Team，完成第二个 Team。一个 Team 内仍可把 Memory、Skill、Knowledge/自然负例草稿委派给不同 Luna 子智能体，但同一文件只能有一个写入者。

## 固定任务划分

| 提示词 | 主任务 | Split | 分支 | 专用 worktree |
|---|---|---|---|---|
| `THREAD-01-T01-T02.md` | 完成 T01；完成 T02 | Dev | `codex/task1-data-build-v2-t01-t02` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t01-t02` |
| `THREAD-02-T03-T04.md` | 完成 T03；完成 T04 | Dev | `codex/task1-data-build-v2-t03-t04` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04` |
| `THREAD-03-T05-T06.md` | 完成 T05；完成 T06 | Hidden | `codex/task1-data-build-v2-t05-t06` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t05-t06` |
| `THREAD-04-T07-T08.md` | 完成 T07；完成 T08 | Hidden | `codex/task1-data-build-v2-t07-t08` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t07-t08` |
| `THREAD-05-T09-T10.md` | 完成 T09；完成 T10 | Hidden | `codex/task1-data-build-v2-t09-t10` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t09-t10` |
| `THREAD-06-T11-T12.md` | 完成 T11；完成 T12 | Dev | `codex/task1-data-build-16team-t11-t12` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t11-t12` |
| `THREAD-07-T13-T14.md` | 完成 T13；完成 T14 | Hidden | `codex/task1-data-build-16team-t13-t14` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t13-t14` |
| `THREAD-08-T15-T16.md` | 完成 T15；完成 T16 | Hidden | `codex/task1-data-build-16team-t15-t16` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t15-t16` |

每份 `THREAD-xx` 提示词都包含自己的 `git worktree add` 命令。推荐先把提示词交给新任务，让该任务创建并转入专用 worktree，再开始数据写入。若目标分支或目录已经存在，任务必须先用 `git worktree list --porcelain` 查明归属，不能在共享目录执行 `git switch`，也不能删除或接管已有 worktree。

阶段 A 已完成。八个任务共享数据内容和 schema 基线，但使用两个不可变启动点：

- 数据内容基线提交：`960021e472456515a89d3c2c4f2962fbf6cc51a1`
- schema 基线 Tag：`task1-data-parallel-baseline-v2`
- schema 基线提交：`1048681880b51e7a52a6b8b0b731eadeec44e118`
- build-01 至 build-05 启动引用：`task1-data-parallel-launch-v2`
- build-06 至 build-08 启动引用：`task1-data-parallel-launch-16team-v1`

`task1-data-parallel-baseline-v2` 冻结经过测试的 schema、compiler 和 validator。前五个任务已经从 `task1-data-parallel-launch-v2` 启动，因此不得重启、变基或移动该 Tag。新增三份提示词、T11 至 T16 注册信息和 16-Team 集成合同由 `task1-data-parallel-launch-16team-v1` 冻结。两个启动点不代表两套数据集或两种 schema；八个任务完成后只合并一次，并只生成一个 `formal-v1`。

旧建设分支或目录已经被其他任务占用时，不得删除、移动或接管。本轮只使用上表登记的八个分支和专用目录。

全局合同任务启动后必须先运行：

```powershell
git status --short --branch -uall
git branch --show-current
git worktree list --porcelain
$launchTag = "<使用当前 THREAD 文件登记的启动 Tag>"
$launchCommit = git rev-parse "$($launchTag)^{commit}"
$headCommit = git rev-parse HEAD
$schemaCommit = git rev-parse "task1-data-parallel-baseline-v2^{commit}"
if ($headCommit -ne $launchCommit) { throw "HEAD does not match launch tag" }
if ($schemaCommit -ne "1048681880b51e7a52a6b8b0b731eadeec44e118") { throw "unexpected schema baseline" }
git merge-base --is-ancestor $schemaCommit HEAD
git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD
```

工作树必须干净，当前分支必须等于该提示词登记的分支，当前路径必须在 worktree 列表中与该分支绑定，HEAD 必须等于 launch Tag 的解引用提交，schema Tag 必须解引用到固定提交，两个祖先检查必须以 0 退出。任何检查失败都应停止，不得执行 `git switch` 操作共享工作树，也不得从旧分支或浮动 HEAD 继续施工。

## 每个建设任务的写入范围

允许写入：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/<build-id>/<team-id>/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/<team-id>/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/<team-id>/**
```

共享候选库 `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/shared/skills/**` 对八个建设任务只读。候选文件出现在仓库中不代表已绑定到任何 Team；实际采用时才把确认过来源和适配边界的包写入该 Team 的 source-material 目录。

禁止写入：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json
MemoryProxy/eval/tool-prompt-bench/formal-dataset/DATASET-BUILD-STATUS.json
MemoryProxy/eval/tool-prompt-bench/formal-dataset/provider/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/snapshots/**
其他建设任务负责的 Team 目录
生产代码、Prompt Variant、MemoryProxy 配置和真实运行配置
```

如果现有脚本只能直接修改全局合同，建设任务不得运行该写入步骤。它应把同样的数据写成 Team 分片，交给集成任务合并。

## 已闭合的共享合同

阶段 A 已在 `1048681880b51e7a52a6b8b0b731eadeec44e118` 完成 provenance 分型：

- `synthetic` 只记录生成模型、推理强度、prompt version、批次、时间、审查状态和内容引用。
- `external_import` 严格记录 repository、revision、license、path、locator 和 hash。
- L1 code/test locator 只对外部导入强制。
- 建设任务不得修改 schema，也不得为合成内容填写占位仓库、假 commit、假 license 或假 locator。

这不授权提取 official patch、安装上游依赖或运行上游测试。八个建设任务可以直接完成正式 staging 和 Team Gate。

## Team 分片结构

每个 Team 的最终 staging 目录至少包含：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/Txx/
├── team-fragment.json
├── assets/
│   ├── memory.json
│   ├── skills.json
│   └── knowledge.json
├── review.md
└── gate.json
```

`team-fragment.json` 使用以下顶层结构：

```json
{
  "schema_version": "task1.team_fragment.v1",
  "build_id": "build-xx",
  "team_id": "Txx",
  "split": "dev | hidden_test",
  "sourceEvidence": [],
  "teams": [],
  "businessAgents": [],
  "tasks": [],
  "publicCases": [],
  "privateAnnotations": [],
  "pairs": [],
  "snapshotAssetIds": [],
  "generatorBatchRefs": [],
  "externalImports": []
}
```

数组中的单项结构必须与当前 `formal-v1.json` 对应数组完全相同。建设任务不生成 `world`、全局 `snapshots`、跨 Team hash 或最终状态。`externalImports` 只列实际复制进仓库的外部 Skill 或原文片段；纯合成内容只记录 Luna 批次，不伪造来源。

## 单个 Team 的固定工作流

1. Sol 只读核对 Team 主题、现有材料、生产工具入口和当前 schema。
2. Sol 用普通 GitHub 关键词搜索选择真实 Skill 文件，冻结 repository URL、commit SHA、path、license 和 raw file SHA-256。目标 Skill 和干扰 Skill 都不能由 Luna 凭空编写，不设置 Star 数或热门度门槛，也不运行上游项目。
3. Sol 写唯一的 Team input pack，冻结项目流、身份、资产命名空间、Skill 来源、目标数量、可见性和禁止泄漏字段。
4. Sol 调用 Luna 子智能体生成草稿。每个 Luna 使用 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none`，只写唯一批次目录。Memory、会话、项目历史和内部 Knowledge 可以合成；Skill 只能基于 input pack 中的真实 GitHub 文件做宿主适配和 case 构造。
5. Luna 批次按 Memory/上下文、Skill、Knowledge/自然负例拆分。可并发数量服从当前任务的可用槽位，必须给 Sol 留出检查能力；无槽位时排队，不扩大文件范围。
6. Sol 逐份读取原始输出，检查唯一信息缺口、首动作、完整最小链路、pair 单变量、资产可见性、干扰真实性和 provider 泄漏。
7. Sol 只把通过审核的内容写入 Team staging。Luna 不得写正式 staging、决定最终 Gold、修改 schema 或凭空生成 Skill。
8. 先通过一组 Memory、一组 Skill、一组 Knowledge 试验 pair，再扩到每 Team 40 条。一个 Team 的 `gate.json` 通过后，才开始同一建设任务的第二个 Team。

Luna 原始批次只通过格式 validator：

```powershell
node MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/validate-luna-batch.mjs `
  <batch-dir> <family-or-natural-negative> <expected-count> <team-id> <stage>
```

该 validator 检查批次格式、Team、Stage、数量、明显泄漏和可选 hash，不证明信息缺口唯一、正式 Gold 正确、资产运行时可见或完整最小链路成立。这些结论必须由 Sol 复核，并由 Team Gate 与正式 validator 验证。

## 每个 Team 的目标容量

| 类型 | 数量 |
|---|---:|
| Memory Positive | 6 |
| Skill Positive | 6 |
| Knowledge Positive | 3 |
| 配对 No-tool Negative | 15 |
| 自然 coding Negative | 10 |
| 合计 | 40 |

主集合数量是固定合同，不得用改名复制造成伪多样性。质量 Gate 优先；无法获得唯一 Gold 的 case 移出正式集合，并在 `gate.json` 记录缺口，同时必须用新的合格 case 补齐该 Team 的 40 条后才能通过。额外的合格 case 可以进入 exploratory 集合，但除非在 Prompt 调优前发布并冻结新的 dataset revision，否则不能改变主指标分母。

## 明确禁止的过度验证

数据建设只判断模型在当前输入和资产池下是否应调用、调用哪个工具、完整最小链路是否正确。禁止为了证明工程题本身的最终答案而：

- 提取或应用 benchmark 的 official patch、test patch 或 verifier 结论。
- 检出上游工程仓库并安装依赖、运行其测试或复现最终修复。
- 为合成 L0/L1/L2/L3 逐句建立外部来源闭环。
- 因来源数量不足而继续下载无关数据集。
- 运行 V0 至 V3 的正式模型评测，或根据某个 Prompt 的得分改题。

可以运行本仓库已有的 JSON/schema、pair、泄漏、可见性和检索 fixture 校验；这些校验直接服务 Task 1 指标。

## 集成顺序

八个建设任务全部提交 Team staging 后，集成任务才按 T01 至 T16 顺序一次性合并。即使七个任务通过而一个任务失败，也不得先合并通过的分片或冻结 400 条中间版本。集成任务统一重建全局合同和 `DATASET-BUILD-STATUS.json`，生成 Dev/Hidden provider 输入、private Gold、快照和 hash，并运行跨 Team 重复度与泄漏检查。

最终 `formal-v1` 固定为 640 条：Dev 包含 T01 至 T04、T11、T12，共 240 条和 90 个 pair；Hidden 包含 T05 至 T10、T13 至 T16，共 400 条和 150 个 pair。全集包含 96 条 Memory Positive、96 条 Skill Positive、48 条 Knowledge Positive、240 条配对 No-tool Negative 和 160 条自然 Coding Negative，共 240 个 pair。建设任务的本地 `gate=passed` 只表示分片可供集成，不表示 Dev、Hidden 或全集已经冻结。

## T17 至 T20 的 formal-v2 增量轮

`formal-v1.1` 已冻结。新增两个建设任务只生成 T17 至 T20 分片，不能回写原 revision：

| 提示词 | 主任务 | Split | 分支 | 专用 worktree |
|---|---|---|---|---|
| `THREAD-09-T17-T18.md` | 完成 T17；完成 T18 | Dev | `codex/task1-data-build-20team-t17-t18` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-20team-t17-t18` |
| `THREAD-10-T19-T20.md` | 完成 T19；完成 T20 | Hidden | `codex/task1-data-build-20team-t19-t20` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-20team-t19-t20` |

两个任务使用同一个不可变启动点：

- 启动 Tag：`task1-data-parallel-launch-20team-v1`
- Tag object：`02391aef5fd8564be0ead99025cd6921accd3ee4`
- Tag 解引用提交：`ffa1fe18085d47ed4da6b2306240152cc8590a86`
- `formal-v1.1` 祖先：`02620d8313dcb883b7a57c4c2edc8f4286eb4bc9`
- schema 基线：`1048681880b51e7a52a6b8b0b731eadeec44e118`

两份提示词假定准备任务已经建立分支和 worktree。新 Codex 任务必须在创建时绑定表中的专用 worktree，不能在绑定错误的任务里用 `cd` 继续。

T17 和 T18 各 40 条 Dev，T19 和 T20 各 40 条 Hidden。本轮增量为 160 条和 60 个 pair。四个 Team 全部通过后，单独创建 `formal-v2` 集成任务，把增量追加到 `formal-v1.1`，得到 Dev 320 条、Hidden 480 条、全集 800 条和 300 个 pair。最终类别数量应为 Memory Positive 120、Skill Positive 120、Knowledge Positive 60、配对 No-tool Negative 300、自然 Coding Negative 200；搜索或 discovery Positive 200、直接调用 Positive 100。

原 `THREAD-00-INTEGRATION.md` 只适用于已经完成的 T01 至 T16 集成，不能拿来合并 T17 至 T20，也不能移动 `task1-data-formal-v1.1`。等两个新增建设任务都完成后，再根据它们的实际提交生成 formal-v2 集成提示词。
