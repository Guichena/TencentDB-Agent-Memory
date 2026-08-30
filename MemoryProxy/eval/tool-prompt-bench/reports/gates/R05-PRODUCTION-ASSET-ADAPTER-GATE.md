# R05 Production Asset Adapter Gate

## 结论

**R05 代码 Gate：PASS。**

R05 已补齐正式实验前缺失的生产资产恢复、真实接口回读、prepared-run 身份绑定、fresh Session 注册和独立 preflight 评分边界。实现没有调用模型、启动服务、访问网络或生成正式实验结果。

**R05 blank-stack preflight：尚未执行。** 它固定为 0 模型的 restore、逐 run inspect 和 12 份六项 `ready=true` receipt；不能与随后 12 次 Luna 的 **E01/R04 V0 runtime smoke** 混称。

当前 support 分支从冻结 R05 `c86b154` 派生，只增加 `run-r05-runtime-preflight.ps1`、独立 TypeScript 合同 CLI、离线合同测试以及本 Gate/手册修正。它只跑离线 85/85、parser 和 fail-closed dry-run，不在自身 worktree 运行 live Gate。最终 Measurement-v2 integration provisional common-base non-squash 纳入 support+M0/M1/M2+R02、重跑 D0 42/42 后，才以其干净 worktree 执行一次 live R05 blank-stack preflight；通过后冻结 Measurement-v2/Selection Contract 并打 candidate-base tag。

## 冻结边界

| 项目 | 值 |
|---|---|
| Worktree | `D:\projects\TencentDB-Agent-Memory-task1-r05-production-assets-v1` |
| Branch | `codex/task1-experiment-r05-production-assets-v1` |
| 上游代码 | R04 `92da207` |
| 正式数据 | annotated tag `task1-data-formal-v1.1` |
| 模型合同 | `gpt-5.6-luna`, reasoning `high`；本 Gate 未调用 |
| 任务边界 | 只评价工具调用决策与 token/cache，不评价资产答案或最终代码质量 |

## 已完成能力

1. 冻结 restore plan 可编译为确定性、Gold-blind、不可由 adapter 自我授信的生产动作。
2. 真实 `server_team` transport 支持 Team/Agent/Task、Knowledge shell/binding、Skill package 与 Formal Memory 导入。
3. MemoryCore Formal L1/L2 import seam 默认关闭，仅在 `TDAI_FORMAL_ASSET_IMPORT_ENABLED=1` 时开放，并执行写后读校验。
4. Skill 从冻结 tag 的独立 checkout 发现并校验 manifest/hash；不从 raw copy 或开发分支取包。
5. inspector 必须绑定一个 prepared run，按真实 owner Agent 回读 Memory、按当前 Agent 的 Team 可见性搜索 Skill，并通过生产 metadata 回读 Knowledge。
6. 所有资产回读成功后，MemoryProxy 才通过默认关闭的 no-model Session Init 路由注册 opaque Session；已有 L1/L2 namespace 会拒绝，不清理、不覆盖。
7. 独立 evaluator 重算 auth、metadata、session、visible-assets、write-side-disabled、fresh-session-namespace 六项 Gate。
8. restore plan、restore observations、inspect observations 均要求显式 create-new 输出文件，禁止静默覆盖旧证据。

## 公平性与任务一对齐

- 每个 prepared run 使用独立 opaque Session，旧 L1/L2 命中会在模型运行前失败。
- 正式运行要求专用空白数据目录/数据库，不复用日常 SQLite、SessionStore、Redis/COS namespace。
- 资产只恢复一次；每个 run 只做生产回读与 Session 注册。模型运行时使用 `--experiment-read-only`，关闭 extraction、L0 写、Skill LLM 写和 analyse marker。
- 可见资产集合、runtime locator、response bytes hash、request body hash、代码/data/config fingerprint 均进入证据链；不保存正文、user key 或鉴权 header。
- 任务一主行为口径继续使用最短充分工具决策链，并保存有效调用、漏调用、误调用、family/terminal 选择、ToolSPL、overcall、malformed/retry。
- Token 口径继续保存 static injected tool tokens、Provider input/output/cached tokens 与 cache write/read 证据。

## 验证记录

### R05 组合 Gate

```text
npm test -- --run `
  src/__tests__/formal-production-restore-executor.test.ts `
  src/__tests__/formal-server-team-production-requirements.test.ts `
  src/__tests__/formal-server-team-production-transport.test.ts `
  src/__tests__/formal-server-team-memory-import-client.test.ts `
  src/__tests__/formal-server-team-production-adapter.test.ts `
  src/__tests__/formal-server-team-production-inspector.test.ts `
  src/__tests__/formal-benchmark-memory-import.test.ts `
  src/__tests__/formal-benchmark-preflight-session.test.ts `
  src/__tests__/formal-execution-preflight.test.ts `
  src/__tests__/formal-asset-restore-plan.test.ts `
  src/__tests__/formal-asset-restore-runtime.test.ts `
  src/__tests__/formal-dataset-registry.test.ts `
  src/__tests__/formal-build-frozen-restore-plan.test.ts `
  src/__tests__/formal-asset-restore-plan-contract.test.ts
Test Files  14 passed (14)
Tests       79 passed (79)
```

覆盖：restore executor、生产 transport/requirements/adapter、Memory import、Skill package、生产 inspector、Session preflight、独立 preflight evaluator、restore plan/runtime contract 和数据 registry。

### Runtime Gate 复现补丁合同

```text
npm test -- --run src/__tests__/formal-r05-runtime-preflight-script.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)
```

六项测试固定 plan hash/318/209/284、restore 未授信合同、精确 12-case preregistration/identity、完整 wrapper/final Git locks、两阶段公共手册，以及三个非 loopback URL 的实际 PowerShell 错误路径。冻结 R05 79 项与这 6 项已组合复跑：

```text
Test Files  15 passed (15)
Tests       85 passed (85)
```

Windows PowerShell 5.1 与 PowerShell 7 parser 均为 PASS。离线真实 Dev restore plan 重新构造并经合同 CLI 得到固定 hash、318/209/284。当前宿主只有 Node 24，`-DryRun` 在 Node 版本 Gate 按预期 fail closed，且未创建 RunRoot；成功 dry-run 必须留到最终 common-base 的 Node 22 终端执行。以上验证均未连接服务或运行模型。

### R03 真实链路回归

```text
npm run eval:tool-prompt:formal:r03:gate
Test Files  7 passed (7)
Tests       61 passed (61)
```

### 正式评测准备层回归

```text
npm run eval:tool-prompt:formal:gate
Test Files  10 passed (10)
Tests       33 passed (33)
```

### 类型与 Git 检查

- `npm run typecheck`：全量仍失败，但输出中没有 R05 新增/修改文件错误。
- 现存错误集中在 R05 上游已有的 MemoryCore Skill/embedding/conversation 类型、MemoryKnowledge 未安装依赖、handler/session `resetFlow`、config profile、storage optional package 等区域。
- `formal-prepare-runner.test.ts` 仍有一项上游既存 mock 类型错误；其运行测试 7/7 通过。
- `git diff --check 92da207..c86b154`：冻结 R05 实现 PASS。
- `git diff --check c86b154..HEAD`：Runtime Gate 复现补丁必须在提交前单独 PASS。

这些既存类型错误不阻断本 Gate，因为 R05 相关测试与运行边界均通过，且本阶段不修复任务一范围外的源码基线。

## 提交序列

冻结 R05 从 R04 `92da207` 到 `c86b154` 保持一项能力一个提交：restore executor、任务一资产收敛、生产 transport、runtime requirement、Memory import seam/client、Skill discovery、组合 adapter、prepared-run binding、Session preflight、production inspector、测试类型修正、证据 CLI 和运行手册。完整提交列表以：

```powershell
git log --oneline --reverse 92da207..c86b154
```

为准。Runtime Gate 复现补丁单独查看 `git log --oneline --reverse c86b154..HEAD`，不得把两段历史压平后冒充冻结 R05。

## 下一步

1. 保持冻结 R05 与 support 分支独立；support worktree 只完成离线 85/85，不运行 live Gate。
2. 构建最终 Measurement-v2 integration provisional common-base，纳入 support+M0/M1/M2+R02 最终 tip并重跑 D0 42/42。
3. 以该干净 integration worktree 启动专用空白 `server_team` 栈；先运行 `run-r05-runtime-preflight.ps1 -DryRun`，再去掉 `-DryRun` 完成一次 live R05 blank-stack preflight。summary 前必须复核代码/数据 worktree clean、两个 HEAD 和 annotated tag object/peeled commit 未漂移。
4. 12/12 `ready=true` 后冻结 Measurement-v2/Selection Contract 并打 candidate-base tag，再执行 E01/R04 V0 runtime smoke（12 次 Luna）和完整 Dev。
5. 普通 Prompt 方法从该 tag 建独立后代，只创建新 run/Session/result，不重跑公共 Gate；只有 adapter/runner/scorer/restore/preflight 基础设施变化才重跑。

## R02 审计交接边界

`codex/task1-r02-acceptance-v1` 的最终 common-base 输入是 `bf19d1e6a8eaf69785ee015b047d1413de0a6f95`（ancestry 含首次清单提交 `6b459b5`）。它只证明历史 R02 freeze 边界、fail-closed provenance，并诚实记录 TypeScript D0 41/42；不在本 Runtime Gate support 分支合入。最终 common-base 必须 non-squash 保留该 tip 的 ancestry，在 R05-compatible scorer 上重捕 freeze 并得到真实 D0 42/42 后才能转为下游 PASS。R05 的 79/79 或本复现补丁的 6/6 都不能替代这项 Gate。

