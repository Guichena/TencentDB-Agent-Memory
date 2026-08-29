# Task 1 数据集并行建设说明

本目录用于把 T01 至 T10 的正式数据建设拆成五个相互独立的 Codex 任务。每个任务负责两个 Team，并在任务内部调用 `gpt-5.6-luna` 子智能体生成批量草稿。当前任务只负责冻结公共输入、准备提示词和最终集成，不替五个建设任务生成数据。

## 为什么这样拆

并行单位是完整 Team 分片，不是全局合同中的任意数组。五个建设任务可以同时工作，因为它们拥有不同的 Team 和输出目录。共享的 `formal-v1.json`、状态文件、provider 输出和快照只能由集成任务修改，否则多个任务会产生难以审查的合并冲突，也可能让某个 Team 的可见资产误进入另一个 Team。

每个建设任务只包含两个主任务：完成第一个 Team，完成第二个 Team。一个 Team 内仍可把 Memory、Skill、Knowledge/自然负例草稿委派给不同 Luna 子智能体，但同一文件只能有一个写入者。

## 固定任务划分

| 提示词 | 主任务 | Split | 固定分支 | 固定 worktree |
|---|---|---|---|---|
| `THREAD-01-T01-T02.md` | 完成 T01；完成 T02 | Dev | `codex/task1-data-build-v2-t01-t02` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t01-t02` |
| `THREAD-02-T03-T04.md` | 完成 T03；完成 T04 | Dev | `codex/task1-data-build-v2-t03-t04` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04` |
| `THREAD-03-T05-T06.md` | 完成 T05；完成 T06 | Hidden | `codex/task1-data-build-v2-t05-t06` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t05-t06` |
| `THREAD-04-T07-T08.md` | 完成 T07；完成 T08 | Hidden | `codex/task1-data-build-v2-t07-t08` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t07-t08` |
| `THREAD-05-T09-T10.md` | 完成 T09；完成 T10 | Hidden | `codex/task1-data-build-v2-t09-t10` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t09-t10` |

五个任务必须从同一个冻结 Tag 建立独立 worktree：

- 数据内容基线提交：`960021e472456515a89d3c2c4f2962fbf6cc51a1`
- 唯一启动引用：`task1-data-parallel-baseline-v2`
- Tag 解引用提交：`1048681880b51e7a52a6b8b0b731eadeec44e118`

启动后必须运行 `git rev-parse "task1-data-parallel-baseline-v2^{commit}"`，结果必须严格等于 `1048681880b51e7a52a6b8b0b731eadeec44e118`；再用 `git merge-base --is-ancestor 960021e472456515a89d3c2c4f2962fbf6cc51a1 HEAD` 确认数据内容基线是当前分支祖先。Tag 冻结正式 schema、compiler、validator、T01 当前试点和已确认保留的原始草稿；本提示词包在 Tag 建立后的调度提交中记录精确 Tag commit。任何检查失败都应停止，不得从 v1、旧建设分支或浮动 HEAD 继续施工。

迁移说明：旧分支 `codex/task1-data-build-t09-t10` 已绑定其他 worktree，因此本轮五个建设任务统一改用带 `v2` 的全新分支和路径。不得删除、移动、接管旧分支或旧 worktree。

## 每个建设任务的写入范围

允许写入：

```text
formal-dataset/generators/parallel/<build-id>/<team-id>/**
formal-dataset/staging/teams/<team-id>/**
formal-dataset/source-material/<team-id>/**
```

共享候选库 `formal-dataset/source-material/shared/skills/**` 对五个建设任务只读。候选文件出现在仓库中不代表已绑定到任何 Team；实际采用时才把确认过来源和适配边界的包写入该 Team 的 source-material 目录。

禁止写入：

```text
formal-dataset/registry/contracts/formal-v1.json
formal-dataset/DATASET-BUILD-STATUS.json
formal-dataset/provider/**
formal-dataset/snapshots/**
其他建设任务负责的 Team 目录
生产代码、Prompt Variant、MemoryProxy 配置和真实运行配置
```

如果现有脚本只能直接修改全局合同，建设任务不得运行该写入步骤。它应把同样的数据写成 Team 分片，交给集成任务合并。

## Team 分片结构

每个 Team 的最终 staging 目录至少包含：

```text
formal-dataset/staging/teams/Txx/
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
2. Sol 写唯一的 Team input pack，冻结项目流、身份、资产命名空间、目标数量、可见性和禁止泄漏字段。
3. Sol 调用 Luna 子智能体生成草稿。每个 Luna 使用 `gpt-5.6-luna`、`reasoning_effort=high`、`fork_turns=none`，只写唯一批次目录。
4. Luna 批次按 Memory/上下文、Skill、Knowledge/自然负例拆分。可并发数量服从当前任务的可用槽位，必须给 Sol 留出检查能力；无槽位时排队，不扩大文件范围。
5. Sol 逐份读取原始输出，检查唯一信息缺口、首动作、完整最小链路、pair 单变量、资产可见性、干扰真实性和 provider 泄漏。
6. Sol 只把通过审核的内容写入 Team staging。Luna 不得写正式 staging、决定最终 Gold 或修改 schema。
7. 先通过一组 Memory、一组 Skill、一组 Knowledge 试验 pair，再扩到每 Team 40 条。一个 Team 的 `gate.json` 通过后，才开始同一建设任务的第二个 Team。

## 每个 Team 的目标容量

| 类型 | 数量 |
|---|---:|
| Memory Positive | 6 |
| Skill Positive | 6 |
| Knowledge Positive | 3 |
| 配对 No-tool Negative | 15 |
| 自然 coding Negative | 10 |
| 合计 | 40 |

数量是目标，不得用改名复制造成伪多样性。质量 Gate 优先；无法获得唯一 Gold 的 case 移出正式集合，并在 `gate.json` 记录缺口。

## 明确禁止的过度验证

数据建设只判断模型在当前输入和资产池下是否应调用、调用哪个工具、完整最小链路是否正确。禁止为了证明工程题本身的最终答案而：

- 提取或应用 benchmark 的 official patch、test patch 或 verifier 结论。
- 检出上游工程仓库并安装依赖、运行其测试或复现最终修复。
- 为合成 L0/L1/L2/L3 逐句建立外部来源闭环。
- 因来源数量不足而继续下载无关数据集。
- 运行 V0 至 V3 的正式模型评测，或根据某个 Prompt 的得分改题。

可以运行本仓库已有的 JSON/schema、pair、泄漏、可见性和检索 fixture 校验；这些校验直接服务 Task 1 指标。

## 集成顺序

五个建设任务各自提交 Team staging 后，集成任务按 T01 至 T10 顺序合并。集成任务统一更新全局合同和 `DATASET-BUILD-STATUS.json`，生成 Dev/Hidden provider 输入、private Gold、快照和 hash，并运行跨 Team 重复度与泄漏检查。建设任务的本地 `gate=passed` 只表示分片可供集成，不表示 Dev 或 Hidden 已正式冻结。
