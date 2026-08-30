# R05 Production Asset Adapter Gate

## 结论

**R05 代码 Gate：PASS。**

R05 已补齐正式实验前缺失的生产资产恢复、真实接口回读、prepared-run 身份绑定、fresh Session 注册和独立 preflight 评分边界。实现没有调用模型、启动服务、访问网络或生成正式实验结果。

**R05 运行 Gate：尚未执行。** 只有人工启动专用空白 `server_team` 数据栈，并按 `R05-PRODUCTION-ASSET-ADAPTER-RUNBOOK.md` 完成 V0 Dev Smoke 的 restore、逐 run inspect 和六项 `ready=true` receipt 后，才可进入 R04 的 Luna 正式运行。

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
npm test -- --run <14 个 R05 restore/import/inspect/preflight/registry 测试文件>
Test Files  14 passed (14)
Tests       79 passed (79)
```

覆盖：restore executor、生产 transport/requirements/adapter、Memory import、Skill package、生产 inspector、Session preflight、独立 preflight evaluator、restore plan/runtime contract 和数据 registry。

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
- `git diff --check 92da207..HEAD`：PASS。

这些既存类型错误不阻断本 Gate，因为 R05 相关测试与运行边界均通过，且本阶段不修复任务一范围外的源码基线。

## 提交序列

R05 从 R04 `92da207` 之后保持一项能力一个提交：restore executor、任务一资产收敛、生产 transport、runtime requirement、Memory import seam/client、Skill discovery、组合 adapter、prepared-run binding、Session preflight、production inspector、测试类型修正、证据 CLI 和运行手册。完整提交列表以：

```powershell
git log --oneline --reverse 92da207..HEAD
```

为准。

## 下一步

1. 推送并冻结本分支，不把 R05 合回当前主开发分支。
2. 人工按 R05 手册启动专用空白 `server_team` 栈。
3. 只运行 V0 的 12 条 Dev Smoke：restore 一次、逐 run inspect、独立生成六项 receipt。
4. 12/12 `ready=true` 后，按 R04 手册由用户手工启动 Luna high；否则停止并修 R05，不进入 V1/V2/V3。

