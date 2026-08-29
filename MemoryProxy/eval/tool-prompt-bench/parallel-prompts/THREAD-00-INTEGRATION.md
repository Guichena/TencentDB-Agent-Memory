# 验收并集成八个数据建设任务

把本文件完整交给一个新的 Codex 任务。使用 `gpt-5.6-sol`，推理强度设为 `high`。这个任务使用现有集成 worktree，不创建新的 worktree，不调用 Luna，不生成新 case，也不运行正式模型评测。

你是 Task 1 正式数据集的验收和集成负责人。八个建设任务完成后，先只读验收它们的分支、Team 分片、资产、case、Gold、来源和本地 Gate。八个分支全部通过后，继续在同一个任务里按 Dev、Hidden 的顺序完成一次集成，生成正式 provider input、private Gold、snapshot、验证报告和 hash，并把 16 个 Team、640 条数据冻结为 `formal-v1`。

前五个任务和新增三个任务是同一轮正式数据建设。禁止先把 T01 至 T10 合并成 400 条中间版，禁止在八个任务全部通过前冻结、评测或发布 `formal-v1`。`formal-v1` 冻结后，如需继续增加数据，才创建新的 dataset revision，例如 `formal-v2`，不得回写已冻结内容和 hash。

## 完成条件

任务只有两种合法结束状态。

`BLOCKED`：任一建设分支缺失、工作树不干净、越界修改、Team Gate 不可信、数量不符、来源不完整、Gold 不唯一、pair 不是单变量、目标资产不可见、完整最小链路错误、provider 泄漏或跨集合重复。此时不要合并任何建设分支，不要修改集成工作树，只报告具体分支、Team、case、文件和修复要求。

`COMPLETE`：八个建设分支全部通过只读验收，T01 至 T16 已按顺序集成，Dev 240 条、Hidden 400 条、全集 640 条全部通过 Gate，确定性编译两次得到相同 hash，`formal-v1` 已冻结并创建不可变 Tag。

建设任务自己写出的 `gate.json` 只是待验收材料，不能直接当作通过证明。你必须亲自运行仓库中的 validator，并复核每个 Team 的关键语义。

## 固定仓库状态

集成 worktree：

```text
D:\projects\TencentDB-Agent-Memory-task1-data-integration
```

集成分支：

```text
codex/task1-data-integration
```

不可变引用：

| 用途 | 引用 | 解引用提交 |
|---|---|---|
| 数据内容祖先 | commit | `960021e472456515a89d3c2c4f2962fbf6cc51a1` |
| schema、compiler、validator 基线 | `task1-data-parallel-baseline-v2` | `1048681880b51e7a52a6b8b0b731eadeec44e118` |
| build-01 至 build-05 启动 Tag | `task1-data-parallel-launch-v2` | `ef2ca4bd84e529c6c7d8a8df661520cbc3bf4bb0` |
| build-06 至 build-08 启动 Tag | `task1-data-parallel-launch-16team-v1` | `8257782c23eaa5e31f05b0ea33aa2ac7f2b6bb84` |

`task1-data-parallel-baseline-v2` 不是建设任务的启动 Tag，只冻结经过测试的 schema、compiler 和 validator。前五个建设分支必须包含 `task1-data-parallel-launch-v2`，新增三个建设分支必须包含 `task1-data-parallel-launch-16team-v1`。两个启动 Tag 共享同一 schema 和数据内容祖先，不代表两套数据集。

集成分支允许比 launch Tag 更新，因为本提示词会在 launch Tag 之后继续完善。开始时只要求 launch Tag、schema 基线和数据内容基线都是当前集成 HEAD 的祖先。

## 八个待验收分支

| Build | Team | Split | 分支 | worktree |
|---|---|---|---|---|
| build-01 | T01、T02 | Dev | `codex/task1-data-build-v2-t01-t02` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t01-t02` |
| build-02 | T03、T04 | Dev | `codex/task1-data-build-v2-t03-t04` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04` |
| build-03 | T05、T06 | Hidden | `codex/task1-data-build-v2-t05-t06` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t05-t06` |
| build-04 | T07、T08 | Hidden | `codex/task1-data-build-v2-t07-t08` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t07-t08` |
| build-05 | T09、T10 | Hidden | `codex/task1-data-build-v2-t09-t10` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t09-t10` |
| build-06 | T11、T12 | Dev | `codex/task1-data-build-16team-t11-t12` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t11-t12` |
| build-07 | T13、T14 | Hidden | `codex/task1-data-build-16team-t13-t14` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t13-t14` |
| build-08 | T15、T16 | Hidden | `codex/task1-data-build-16team-t15-t16` | `D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t15-t16` |

每个分支只能修改自己的三个目录族：

```text
MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/<build-id>/<team-id>/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/<team-id>/**
MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/<team-id>/**
```

建设分支不得修改全局合同、总状态、provider、snapshot、生产代码、Prompt Variant、MemoryProxy 配置、真实运行配置或其他 Team。

## 开始前读取

完整读取这些文件，再检查建设分支：

```text
MemoryProxy/eval/tool-prompt-bench/TASK1-DATASET-CONSTRUCTION-RUNBOOK.md
MemoryProxy/eval/tool-prompt-bench/EXPERIMENT-DESIGN.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/README.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-01-T01-T02.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-02-T03-T04.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-03-T05-T06.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-04-T07-T08.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-05-T09-T10.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-06-T11-T12.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-07-T13-T14.md
MemoryProxy/eval/tool-prompt-bench/parallel-prompts/THREAD-08-T15-T16.md
MemoryProxy/eval/tool-prompt-bench/formal-dataset/DATASET-BUILD-STATUS.json
MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json
MemoryProxy/eval/tool-prompt-bench/formal-dataset/scripts/compile-formal-dataset.ts
MemoryProxy/eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts
MemoryProxy/eval/tool-prompt-bench/worlds/formal-schema.ts
MemoryProxy/eval/tool-prompt-bench/worlds/formal-compile.ts
MemoryProxy/eval/tool-prompt-bench/worlds/formal-snapshot.ts
MemoryProxy/eval/tool-prompt-bench/evaluator.ts
```

生产 Memory、Skill、Knowledge 的入口、可见性和参数合同以当前源码为准。文档和建设任务的判断与源码冲突时，以 Task 1 原始目标和生产源码为准，并在报告中记录冲突。

## 阶段 0：核对集成 worktree

在现有集成 worktree 中运行：

```powershell
Set-Location 'D:\projects\TencentDB-Agent-Memory-task1-data-integration'

$integrationGitTrust = 'safe.directory=D:/projects/TencentDB-Agent-Memory-task1-data-integration'
$expectedLaunchV2 = 'ef2ca4bd84e529c6c7d8a8df661520cbc3bf4bb0'
$expectedLaunch16Team = '8257782c23eaa5e31f05b0ea33aa2ac7f2b6bb84'
$expectedSchema = '1048681880b51e7a52a6b8b0b731eadeec44e118'
$expectedContent = '960021e472456515a89d3c2c4f2962fbf6cc51a1'

$integrationStatus = @(git -c $integrationGitTrust status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'cannot inspect integration worktree' }
if ($integrationStatus.Count -gt 0) { throw 'integration worktree is not clean' }

$integrationBranch = git -c $integrationGitTrust branch --show-current
if ($LASTEXITCODE -ne 0) { throw 'cannot read integration branch' }
if ($integrationBranch -ne 'codex/task1-data-integration') { throw 'unexpected integration branch' }

$launchCommitV2 = git -c $integrationGitTrust rev-parse 'task1-data-parallel-launch-v2^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'v2 launch tag cannot be resolved' }
$launchCommit16Team = git -c $integrationGitTrust rev-parse 'task1-data-parallel-launch-16team-v1^{commit}'
if ($LASTEXITCODE -ne 0) { throw '16-Team launch tag cannot be resolved' }
$schemaCommit = git -c $integrationGitTrust rev-parse 'task1-data-parallel-baseline-v2^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'schema tag cannot be resolved' }
$headCommit = git -c $integrationGitTrust rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'integration HEAD cannot be resolved' }
if ($launchCommitV2 -ne $expectedLaunchV2) { throw 'v2 launch tag moved or resolved incorrectly' }
if ($launchCommit16Team -ne $expectedLaunch16Team) { throw '16-Team launch tag moved or resolved incorrectly' }
if ($schemaCommit -ne $expectedSchema) { throw 'schema tag moved or resolved incorrectly' }

git -c $integrationGitTrust merge-base --is-ancestor $expectedContent $headCommit
if ($LASTEXITCODE -ne 0) { throw 'content baseline is not an ancestor of integration HEAD' }
git -c $integrationGitTrust merge-base --is-ancestor $schemaCommit $headCommit
if ($LASTEXITCODE -ne 0) { throw 'schema baseline is not an ancestor of integration HEAD' }
git -c $integrationGitTrust merge-base --is-ancestor $launchCommitV2 $headCommit
if ($LASTEXITCODE -ne 0) { throw 'v2 launch commit is not an ancestor of integration HEAD' }
git -c $integrationGitTrust merge-base --is-ancestor $launchCommit16Team $headCommit
if ($LASTEXITCODE -ne 0) { throw '16-Team launch commit is not an ancestor of integration HEAD' }
```

不要运行 `git pull`、`git push`、`git switch`、`git reset` 或清理命令。不要接管、移动或删除现有 worktree。

## 阶段 1：一次性只读验收八个建设分支

这一阶段不能修改集成 worktree。先把八个分支全部验收完，再决定是否开始集成。即使七个分支通过，只要一个分支失败，也不能先合并通过的分支。

### Git 和所有权

对每个建设分支检查：

1. 本地分支存在，且对应 worktree 存在。
2. 建设 worktree 当前绑定预期分支。
3. 建设 worktree 没有未提交或未跟踪文件。
4. 该任务登记的启动 Tag 是建设分支的祖先。
5. 分支相对 launch Tag 的全部改动都在该任务的允许目录内。
6. 分支没有修改其他 Team、全局合同、状态、provider、snapshot、生产代码或 Prompt 文档。
7. 最终提交信息写明 Team、数量、来源、Gate 和已知限制。

可以使用下面的只读骨架。不要把检查结果写回建设分支：

```powershell
$integrationGitTrust = 'safe.directory=D:/projects/TencentDB-Agent-Memory-task1-data-integration'
$launchCommitV2 = git -c $integrationGitTrust rev-parse 'task1-data-parallel-launch-v2^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'v2 launch tag cannot be resolved' }
$launchCommit16Team = git -c $integrationGitTrust rev-parse 'task1-data-parallel-launch-16team-v1^{commit}'
if ($LASTEXITCODE -ne 0) { throw '16-Team launch tag cannot be resolved' }
$builds = @(
  [pscustomobject]@{ Id = 'build-01'; Branch = 'codex/task1-data-build-v2-t01-t02'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t01-t02'; Teams = @('T01', 'T02'); LaunchCommit = $launchCommitV2 },
  [pscustomobject]@{ Id = 'build-02'; Branch = 'codex/task1-data-build-v2-t03-t04'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t03-t04'; Teams = @('T03', 'T04'); LaunchCommit = $launchCommitV2 },
  [pscustomobject]@{ Id = 'build-03'; Branch = 'codex/task1-data-build-v2-t05-t06'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t05-t06'; Teams = @('T05', 'T06'); LaunchCommit = $launchCommitV2 },
  [pscustomobject]@{ Id = 'build-04'; Branch = 'codex/task1-data-build-v2-t07-t08'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t07-t08'; Teams = @('T07', 'T08'); LaunchCommit = $launchCommitV2 },
  [pscustomobject]@{ Id = 'build-05'; Branch = 'codex/task1-data-build-v2-t09-t10'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-v2-t09-t10'; Teams = @('T09', 'T10'); LaunchCommit = $launchCommitV2 },
  [pscustomobject]@{ Id = 'build-06'; Branch = 'codex/task1-data-build-16team-t11-t12'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t11-t12'; Teams = @('T11', 'T12'); LaunchCommit = $launchCommit16Team },
  [pscustomobject]@{ Id = 'build-07'; Branch = 'codex/task1-data-build-16team-t13-t14'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t13-t14'; Teams = @('T13', 'T14'); LaunchCommit = $launchCommit16Team },
  [pscustomobject]@{ Id = 'build-08'; Branch = 'codex/task1-data-build-16team-t15-t16'; Worktree = 'D:\projects\TencentDB-Agent-Memory-task1-data-build-16team-t15-t16'; Teams = @('T15', 'T16'); LaunchCommit = $launchCommit16Team }
)

foreach ($build in $builds) {
  git -c $integrationGitTrust show-ref --verify --quiet "refs/heads/$($build.Branch)"
  if ($LASTEXITCODE -ne 0) { throw "missing branch: $($build.Branch)" }
  if (-not (Test-Path -LiteralPath $build.Worktree)) { throw "missing worktree: $($build.Worktree)" }

  $worktreeStatus = @(git -c "safe.directory=$($build.Worktree)" -C $build.Worktree status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect build worktree: $($build.Worktree)" }
  if ($worktreeStatus.Count -gt 0) { throw "dirty build worktree: $($build.Worktree)" }

  $actualBranch = git -c "safe.directory=$($build.Worktree)" -C $build.Worktree branch --show-current
  if ($LASTEXITCODE -ne 0) { throw "cannot read worktree branch: $($build.Worktree)" }
  if ($actualBranch -ne $build.Branch) { throw "worktree branch mismatch: $($build.Worktree)" }

  $auditedHead = git -c $integrationGitTrust rev-parse $build.Branch
  if ($LASTEXITCODE -ne 0) { throw "cannot resolve branch HEAD: $($build.Branch)" }

  git -c $integrationGitTrust merge-base --is-ancestor $build.LaunchCommit $auditedHead
  if ($LASTEXITCODE -ne 0) { throw "launch tag is not an ancestor: $($build.Branch)" }

  [string[]]$auditedCommits = @(git -c $integrationGitTrust rev-list --reverse "$($build.LaunchCommit)..$auditedHead")
  if ($LASTEXITCODE -ne 0) { throw "cannot list commits: $($build.Branch)" }
  if ($auditedCommits.Count -eq 0) { throw "no builder commit after launch tag: $($build.Branch)" }

  $allowedPrefixes = @()
  foreach ($team in $build.Teams) {
    $allowedPrefixes += "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/$($build.Id)/$team/"
    $allowedPrefixes += "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/$team/"
    $allowedPrefixes += "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/$team/"
  }

  [string[]]$changedPaths = @(git -c $integrationGitTrust diff --name-only "$($build.LaunchCommit)..$auditedHead")
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect changed paths: $($build.Branch)" }

  $unexpected = @()
  foreach ($path in $changedPaths) {
    $allowed = $false
    foreach ($prefix in $allowedPrefixes) {
      if ($path.StartsWith($prefix)) { $allowed = $true; break }
    }
    if (-not $allowed) { $unexpected += $path }
  }
  if ($unexpected.Count -gt 0) { throw "out-of-scope changes in $($build.Branch): $($unexpected -join ', ')" }

  $build | Add-Member -NotePropertyName AuditedHead -NotePropertyValue $auditedHead -Force
  $build | Add-Member -NotePropertyName AuditedCommits -NotePropertyValue $auditedCommits -Force
}

$builds | Select-Object Id, Branch, LaunchCommit, AuditedHead, AuditedCommits | ConvertTo-Json -Depth 5
```

这里的 `safe.directory` 只对单次只读 Git 命令生效，不得修改全局 Git 配置。阶段 1 必须保存八个 `AuditedHead` 和有序 `AuditedCommits` 作为本轮审计结果。若命令状态不为 0，即使输出为空，也必须按失败处理，不能把 Git 错误当作“工作树干净”。

### Team 文件合同

每个 Team 必须包含：

```text
formal-dataset/staging/teams/Txx/team-fragment.json
formal-dataset/staging/teams/Txx/assets/memory.json
formal-dataset/staging/teams/Txx/assets/skills.json
formal-dataset/staging/teams/Txx/assets/knowledge.json
formal-dataset/staging/teams/Txx/review.md
formal-dataset/staging/teams/Txx/gate.json
```

逐个解析 JSON，确认没有重复键、截断内容、占位符、未替换的模板变量或错误的 Team/Split。`team-fragment.json` 顶层结构必须符合 `task1.team_fragment.v1`，其中各数组项必须能映射到当前 `formal-v1.json` 和 `formal-schema.ts`。

T01 的正式 40 条分片替换基线里的 10 条 pilot。集成时不能把 pilot 10 条和正式 40 条相加，也不能保留两套同 ID 资产。

### 数量合同

每个 Team 严格为：

| 类型 | 数量 |
|---|---:|
| Memory Positive | 6 |
| Skill Positive | 6 |
| Knowledge Positive | 3 |
| 配对 No-tool Negative | 15 |
| 自然 Coding Negative | 10 |
| 合计 | 40 |

每个 Positive 恰好有一个配对 Negative。每个 Team 应有 15 个 pair，其中搜索或 discovery Positive 恰好 10 条，直接调用 Positive 恰好 5 条。T01 至 T16 合计应为 640 个 case 和 240 个 pair。

### 决策和完整链路

逐 Team 复核 `publicCases`、`privateAnnotations` 和 `pairs`。使用脚本提取紧凑审查表，不要只看建设任务的文字总结。

所有 Positive 必须满足：

- 当前 Query 和上下文确实缺少完成请求所需的信息。
- 缺少的信息只由目标 Memory、Skill 或 Knowledge 资产提供。
- `allowedFirstActions` 允许生产系统中真实存在的正确入口。
- 多步 case 的 `allowedSequences` 覆盖拿到目标资产所需的完整最小链路。
- 后续调用的 id、path、tool name 或其他参数能从 fixture 或前一步响应中获得。
- `maxTdaiCalls` 等于最短合法序列长度，或有明确且可审查的理由。
- 目标资产属于当前 Team 和 Agent 的真实可见范围。
- 搜索型目标没有提前出现在 L3、L2 summary、当前上下文、Skill listing 或 Knowledge listing 的答案位置。
- 干扰资产与目标处于同一工程语境，不能靠明显无关名称排除。

所有配对 Negative 必须满足：

- 与 Positive 的 identity、snapshot、workspace、query 和共享上下文完全一致。
- 只有登记的 context delta 不同。
- delta 已补足 Positive 缺失的信息。
- 模型可以直接继续 coding 或回答，不需要任何 TDAI 调用。
- 文字长度、专有名词和语气不能直接泄漏标签。

自然 Coding Negative 必须在完整 Memory、Skill、Knowledge 干扰池下仍然不需要 TDAI。它们不能只是把 Positive 中的工具词删掉，也不能要求验证最终代码能否运行。

Task 1 只判断是否调用、选哪个工具、是否完成目标资产所需的最短合法链路。不要运行上游工程测试，不要应用 official patch，不要验证最终修复效果。

### Memory、Skill 和 Knowledge

Memory 检查目标信息是否真的不在当前上下文、L3 或 L2 summary 中。搜索型 Memory 的冻结候选池必须达到当前合同要求，并包含同域干扰记录。

Skill 检查目标和干扰 Skill 都来自真实 GitHub 文件。实际导入项必须保存 repository、revision、license、path、locator 和 hash。重新计算仓库内 raw/adapted 文件 hash，和登记值比较。纯合成 Memory、会话、项目历史和内部 Knowledge 不需要伪造外部仓库来源。

Knowledge 检查目标资源已绑定当前 Agent，`tools/list` 的资源选择能由 workspace match 或 summary 唯一确定。不要建设与任务无关的 Wiki 或 CodeGraph 内容。

### 验收结论

为每个 Team 形成一条结论：

```text
team_id
branch
final_commit
split
case_count
pair_count
memory_positive_count
skill_positive_count
knowledge_positive_count
paired_negative_count
natural_negative_count
external_import_count
synthetic_batch_count
provider_leakage_count
pair_error_count
visibility_error_count
sequence_error_count
source_error_count
review_status
blocking_items
```

任何 Team 失败时，保持集成工作树不变，输出 `BLOCKED`。报告必须指出原建设分支需要修改的文件和 case，不要在集成分支修正业务语义。

## 阶段 2：导入 Dev 建设分支

只有阶段 1 的十六个 Team 全部通过，才开始写入。阶段 2 和阶段 3 是同一次集成流程的两个步骤，不得在 Dev 完成后冻结、打 Tag 或启动正式评测。

按下面顺序导入 Dev 分支：

```text
codex/task1-data-build-v2-t01-t02
codex/task1-data-build-v2-t03-t04
codex/task1-data-build-16team-t11-t12
```

开始任何写操作前，重新解析八个建设分支的 HEAD，并逐一要求它等于阶段 1 保存的 `AuditedHead`。只要一个分支移动，就停止集成，重新对八个分支执行完整阶段 1，不能只补审新增提交。

全部 HEAD 未移动后，把阶段 1 的分支、launch commit、`AuditedHead`、有序 `AuditedCommits`、允许路径和验收结论写入 `formal-dataset/reports/DS02-BUILD-AUDIT.json`。随后只按该报告中冻结的 commit SHA 和原顺序 cherry-pick，不能重新从可移动的分支名计算范围。不要直接 merge 整个分支，不要 squash 掉建设任务的来源和 Gate 记录。发生冲突时，只能解决确定性路径或完全相同的来源文件冲突。Query、上下文、Gold、资产内容或来源记录冲突时，执行 `git cherry-pick --abort` 并报告，不能自行选择一侧。

导入后实现或补齐最小的确定性 Team fragment 集成入口。优先复用：

```text
formal-dataset/scripts/compile-formal-dataset.ts
formal-dataset/scripts/validate-formal-dataset.ts
worlds/formal-schema.ts
worlds/formal-compile.ts
worlds/formal-snapshot.ts
```

如果仓库还没有 Team fragment 集成脚本，可以在 `formal-dataset/scripts/` 新增一个小型、确定性的脚本。它只负责：

1. 读取指定 Team 的 staging 分片。
2. 校验 Team、Split、ID、引用和数量。
3. 按稳定 ID 排序后写入全局 registry 和 contract。
4. 重建 snapshot asset set。
5. 使用仓库现有 canonical hash 函数计算 hash。

不要为此建立新的通用框架、任务队列、数据库或恢复系统。不要手工复制数组和 hash。相同输入连续运行两次必须得到相同文件内容。

当前 `validate-formal-dataset.ts` 的默认模式只报告数量，不会因冻结数量偏差而失败。集成代码必须给这个现有脚本增加可选的 `--freeze-contract formal-v1` 严格模式，并为成功和数量偏差失败补直接测试；不传该参数时保持原行为。严格模式必须根据 `--split` 校验对应冻结合同，并在任一数量不符时输出非零状态。不要另建验证框架。

T01 至 T04、T11、T12 集成后，应得到 Dev 240 条、90 个 pair。只运行 Dev validator 和编译，不要求此时 Hidden 已有 400 条，但 Dev 结果仍不是可发布的中间数据集。

在 `MemoryProxy` 目录运行仓库现有命令：

```powershell
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split dev `
  --freeze-contract formal-v1 `
  --report eval/tool-prompt-bench/formal-dataset/reports/DS03-DEV-VALIDATION.json

npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/compile-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split dev `
  --out eval/tool-prompt-bench/formal-dataset

npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
```

另外把同一 Dev contract 编译到两个独立临时目录，逐文件比较文件 SHA-256。正式目录中的 provider、private Gold 和 snapshot 文件 hash 必须与临时编译一致。编译器返回的 canonical SHA-256 与 `Get-FileHash -Algorithm SHA256` 得到的文件 SHA-256 是两类指标，必须分别保存为 `*_canonical_sha256` 和 `*_file_sha256`，不能混用。

Dev Gate 必须确认：

- T01 至 T04、T11、T12 每个 Team 40 条。
- Dev 合计 240 条和 90 个 pair。
- schema、pair、可见性、完整链路、来源、检索压力和泄漏检查通过。
- provider input 不含 Gold、target、pairId、informationGap 或私有资产 id。
- 两次独立编译的文件列表和 SHA-256 完全一致。
- T01 pilot 已被正式 T01 分片替换。

Dev 通过后可以提交一次过程提交。提交只包含 Dev 集成、确定性集成代码、Dev provider/private Gold/snapshot、验证报告和必要的状态更新。提交正文记录六个 Team 的建设提交、数量、命令、hash 和已知限制。此时不得创建 `task1-data-formal-v1` Tag，也不得运行正式 Prompt 评测。

## 阶段 3：导入 Hidden 建设分支

按下面顺序导入：

```text
codex/task1-data-build-v2-t05-t06
codex/task1-data-build-v2-t07-t08
codex/task1-data-build-v2-t09-t10
codex/task1-data-build-16team-t13-t14
codex/task1-data-build-16team-t15-t16
```

沿用阶段 1 已冻结在 `DS02-BUILD-AUDIT.json` 的 `AuditedCommits` 和同样的 cherry-pick 规则。导入 Hidden 前再次要求八个分支 HEAD 都等于各自 `AuditedHead`。不要在 Hidden 集成阶段查看 Prompt Variant 的评测结果，也不要根据 Dev 或任何模型得分改写 Hidden。

T05 至 T10、T13 至 T16 集成后，应得到 Hidden 400 条、150 个 pair。运行 Hidden validator 和编译：

```powershell
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split hidden_test `
  --freeze-contract formal-v1 `
  --report eval/tool-prompt-bench/formal-dataset/reports/DS05-HIDDEN-VALIDATION.json

npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/compile-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split hidden_test `
  --out eval/tool-prompt-bench/formal-dataset
```

把同一 Hidden contract 编译到两个独立临时目录并比较全部文件 SHA-256，同时分别记录 compiler canonical SHA-256。Hidden provider 文件只能公开运行输入，private Gold 必须保存在 scorer private 路径，sealed manifest 只公开 Team、数量、来源类型计数、provider bytes/token 准备字段和 snapshot hash。

## 阶段 4：运行 640 条全局 Gate

Hidden 编译通过后，对完整 `formal-v1` 运行无 split validator，并重新运行测试：

```powershell
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --freeze-contract formal-v1 `
  --report eval/tool-prompt-bench/formal-dataset/reports/DS05-FULL-VALIDATION.json

npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
git -c safe.directory=D:/projects/TencentDB-Agent-Memory-task1-data-integration diff --check
```

`--freeze-contract formal-v1` 必须让下面所有数量成为失败即退出的断言，而不是报告字段：

- case id、pair id、asset id、source id 和 batch id 全局唯一。
- 只有一个 Space；Team ID 恰好为 T01 至 T16。
- Dev Team 恰好为 T01 至 T04、T11、T12；Hidden Team 恰好为 T05 至 T10、T13 至 T16。
- 每个 Team 严格为 6 条 Memory Positive、6 条 Skill Positive、3 条 Knowledge Positive、15 条配对 Negative、10 条自然 Coding Negative、15 个 pair、40 条 case。
- 每个 Team 恰好有 10 条搜索或 discovery Positive 和 5 条直接调用 Positive。
- Dev 为 240 条和 90 个 pair；Hidden 为 400 条和 150 个 pair；全集为 640 条和 240 个 pair。
- 240 个 Positive 都有唯一配对 Negative，且 240 个配对 Negative 都恰好覆盖一个 Positive。
- Memory Positive 为 96 条，Skill Positive 为 96 条，Knowledge Positive 为 48 条。
- 配对 Negative 为 240 条，自然 Coding Negative 为 160 条。
- 搜索或 discovery Positive 恰好 160 条，直接调用 Positive 恰好 80 条。
- Dev 和 Hidden 的 query hash、完整句、上下文 hash、pair 模板和高阶 n-gram 没有重复。
- Team 之间没有改名复制 case。
- 所有外部导入文件的 hash、revision、path 和 license 完整。
- synthetic provenance 不包含伪造的 repository、revision、license、path 或外部 hash。
- provider 泄漏为 0。
- pair 完整性错误为 0。
- 无效序列为 0。
- 缺失来源引用为 0。
- Dev 和 Hidden 两次独立编译分别完全一致。

仓库全量 typecheck 已知存在与 Task 1 无关的基线错误。不要修复这些错误，也不要把全量 typecheck 当作本阶段阻塞 Gate。修改过的集成脚本必须能被 `tsx` 实际执行，相关 Vitest 和正式 validator 必须通过。

## 阶段 5：冻结 `formal-v1`

全部 Gate 通过后，更新：

```text
formal-dataset/registry/contracts/formal-v1.json
formal-dataset/DATASET-BUILD-STATUS.json
formal-dataset/provider/**
formal-dataset/snapshots/**
formal-dataset/reports/**
```

状态文件至少记录：

- `dataset_revision = formal-v1`
- 当前集成分支、`dataset_content_commit` 和 revision Tag 名称
- T01 至 T16 的建设分支、各自启动 Tag、`AuditedHead` 和实际导入的 commit 列表
- 每个 Team 的类别数量和 Gate
- Dev、Hidden、全集数量
- contract canonical SHA-256 和文件 SHA-256
- Dev provider canonical SHA-256 和文件 SHA-256
- Hidden provider canonical SHA-256 和文件 SHA-256
- Dev private Gold canonical SHA-256 和文件 SHA-256
- Hidden private Gold canonical SHA-256 和文件 SHA-256
- Dev snapshot canonical SHA-256 和文件 SHA-256
- Hidden snapshot canonical SHA-256 和文件 SHA-256
- validator 和测试结果
- token 字段准备情况
- 已知限制
- 下一阶段为真实资产恢复和真实链路无模型 Gate

数据构造阶段没有实际模型 token，不得伪造 token 值。这里只确认后续 runner 能记录静态注入 token、动态资产 token、完整 system prompt token、Provider usage、Prompt hash 和 snapshot hash。Provider 不提供的 usage 字段以后保存 `null`，不能填 0。

写一份冻结报告，至少包含：

```text
dataset_revision
dataset_content_commit
dataset_revision_tag
source_launch_tag
schema_baseline_tag
team_branch_commits
case_distribution
source_distribution
model_runs = 0
provider_input_canonical_sha256
provider_input_file_sha256
private_gold_canonical_sha256
private_gold_file_sha256
snapshot_canonical_sha256
snapshot_file_sha256
contract_canonical_sha256
contract_file_sha256
deterministic_compile_result
all_gate_results
known_limitations
append_policy
```

`append_policy` 必须说明：`formal-v1` 冻结后不可改写；以后新增数据创建 `formal-v2` 或独立增量切片。评测结果必须带 `dataset_revision`、由 Tag 解引用得到的 `dataset_revision_commit`、provider/private Gold/snapshot 的 canonical 和 file SHA-256、`variant_id`、`model_id` 和 `run_id`。不同 revision 的总分不能在不标注数据差异的情况下直接混为一组。

最终至少标出四个清楚的集成里程碑提交；建设分支原有提交按审计顺序保留，不计入这四个里程碑：

1. Dev 集成和 Dev Gate。
2. Hidden 集成和 Hidden Gate。
3. 全集数据、严格数量 Gate、确定性编译结果和冻结前报告。
4. 冻结元数据，记录第 3 个里程碑的 `dataset_content_commit`，然后创建 `formal-v1` Tag。

不要把文档整理、建设分支原始数据、集成代码和最终冻结压成一个无法审查的提交。提交正文写清输入分支、Team、数量、运行命令、hash 和限制。

Git commit 不能在自身跟踪文件中记录自己的 SHA。第 3 个里程碑提交完成后，先解析它的 SHA，再在状态和冻结报告中保存为 `dataset_content_commit`；第 4 个里程碑只更新冻结元数据。跟踪文件不得伪造或占位填写第 4 个提交自身的 SHA。正式 revision commit 由 `task1-data-formal-v1^{commit}` 动态解析，保存在后续评测运行结果和最终汇报中。

最后创建 annotated Tag：

```text
task1-data-formal-v1
```

如果 Tag 已存在，不得移动或覆盖。先验证它是否指向相同提交；不一致时停止并报告。不要推送分支或 Tag，除非用户另行要求。

## 阶段 6：最终复核和汇报

提交和打 Tag 后重新检查：

- 集成 worktree 干净。
- 当前分支仍为 `codex/task1-data-integration`。
- `task1-data-formal-v1^{commit}` 等于最终 HEAD。
- 状态和冻结报告中的 `dataset_content_commit` 等于第 3 个里程碑提交，且是最终 HEAD 的祖先。
- launch Tag、schema Tag 和数据内容基线仍是最终 HEAD 的祖先。
- 八个建设分支未被修改、删除、变基或接管。
- provider、private Gold、snapshot 和 contract 的实际 canonical SHA-256 与文件 SHA-256 分别等于冻结报告。
- 再运行一次带 `--freeze-contract formal-v1` 的正式 validator，结果不依赖未提交文件。

最终回复必须列出：

- 状态是 `COMPLETE` 还是 `BLOCKED`。
- 八个建设分支各自的启动 Tag、最终提交和验收结论。
- 全部实际导入提交和至少四个集成里程碑提交。
- 最终 dataset revision、commit 和 Tag。
- Dev、Hidden 和全集数量。
- 各类型 case 数量。
- provider、private Gold、snapshot 和 contract hash。
- 运行过的 Gate 及结果。
- 客观修复和退回建设分支的内容。
- 已知限制。
- 下一步只到真实资产恢复和真实链路无模型 Gate，不启动 V0 至 V3，不调用正式模型。
