# Task 1 Measurement-v2 集成 Gate

日期：2026-08-30

状态：`PROVISIONAL / AWAITING_R05`

本文件记录 Task 1 公共基座在模型运行前的最终零模型检查。它不代表任何 Prompt 方案已经优于基线，也不包含 Luna 行为结果。

## 范围

公共基座只保证会直接影响任务一指标、公平性和可复现性的能力：

- 真实 MemoryProxy 注入链路与 Provider-visible Prompt 证据；
- Memory / Skill / Knowledge 的最短充分工具决策链评分；
- 有效调用、误调用、terminal 选择、PairExact、overcall 与运行时 HTTP 诊断分离；
- 静态工具说明、动态资产、总注入与 Provider usage/cache Token；
- 同 Variant 跨 run 的稳定前缀和相对冻结 V0-C block 顺序；
- 一次性恢复正式资产，使用独立 Session/local-state 运行每个 Case；
- R05 的 `Restore -> wait-for-knowledge-ready -> Inspect` 两阶段零模型预检。

不在本基座范围内：生产级重试、自愈、回滚、队列、自动清理、答案质量、最终 coding 正确性或资产正文效果。

## 冻结身份

- 分支：`codex/task1-measurement-v2-integration`
- 本次 R05 运行准备收口前已推送 HEAD：`68f896465eaca45437776e247cdc414fe64ce857`
- 正式数据 tag：`task1-data-formal-v1.1`
  - tag object：`6ba3a0e4098786882dd500f884823f2f8dfbb9d3`
  - peeled commit：`02620d8313dcb883b7a57c4c2edc8f4286eb4bc9`
- Prompt baseline tag：`task1-code-freeze`
  - tag object：`edbf18309fbf100cdf5b26d64c0fbb6f12c8f3a5`
  - peeled commit：`d0996809ed63f6cfc67504ad180db0d48ac70475`
- Selection Contract canonical SHA-256：`4c4cad017f8326ed3f57b7bf571a8df97b973a3bf8e94f242779fc0fc6cc763c`
- Provisional manifest canonical SHA-256：`348c14b20082b56566ac9829a8b56b49771954fd4c3c6d278e2159826a3f293c`
- Provisional manifest file SHA-256：`dd771bffe67c500d05bc7ec596a9a17e65790b9c603eb50574ebbfa4278cba79`
- Dev restore plan canonical SHA-256：`6a15b1981ecf506c9650e2dd9d918bc63cf18b39c79f3da0849d279d61c24b0d`
  - actions：318
  - requirements：209
  - visible assets：284
- 正式 cohort：`gpt-5.6-luna` / `high` / `medium`
- tokenizer：`o200k_base` / `tiktoken-1.0.22`
- freeze 时模型运行数：0

## 最终零模型 Gate

命令：

```powershell
npm run eval:tool-prompt:integration:gate
```

结果：各组成 Gate 最终均以退出码 0 通过。第一次合并调用中，Measurement-v2 的 116 项断言全部通过后发生一次 Vitest worker 汇报超时；空闲复跑原命令通过，未修改测试、超时阈值或业务代码。R03 也有一个已在 R05 通过的测试因同类机器负载超过默认 5 秒，空闲复跑通过。两次均归类为本机测试进程波动，不是任务一断言失败。

| Gate | 结果 |
|---|---:|
| D0 TypeScript 数据/合同 | 44/44 |
| D0 Python 来源工具 | 19/19 |
| V0-V3 生产 Prompt 基准 | 31/31 |
| Selection / CLI / Pair / Cache / Provider 集成合同 | 192/192 |
| Measurement-v2 | 116/116，且专用 TypeScript 编译通过 |
| R05 真实资产适配与两阶段脚本 | 90/90 |
| R03 真实链路与 restore 合同 | 63/63 |
| 正式运行时与 PrepareOnly | 34/34 |
| TypeScript 测试合计 | 570/570 |

冻结清单连续生成两次的文件 SHA-256 均为 `dd771bffe67c500d05bc7ec596a9a17e65790b9c603eb50574ebbfa4278cba79`，字节确定性成立。

本次 R05 运行准备收口再次用 Node.js 22 分三批执行完整 R05 Gate，结果为 `23 + 58 + 9 = 90/90`。同时删除了与任务一无关且和本地推荐配置矛盾的 `embeddingService=true` 条件：`embedding.provider=none` 时 VectorStore/BM25 仍可用，正式资产又由精确 import seam 恢复，因此强制外部 embedding 服务只会增加无关变量。真实 VectorStore、三服务 health、身份映射、资产回读、配置 hash、12 份 receipt 与最终 Git 锁均未放宽。

仓库新增 `r05-v0-read-only.config.example.yaml`，固定官方 Codex upstream/client passthrough、V0 legacy、三类注入、进程内 ProxyStorage 和全部 read-only 开关。实际 YAML 必须复制到仓库外，只填本轮 Runtime Service ID 与 disposable loopback Core key；它不读取、覆盖或改写 Codex 登录配置。

## 全仓类型检查归因

`npm run typecheck` 在当前仓库结构下仍不是绿色 Gate：HEAD 基线有 111 条错误，当前工作树有 110 条。用同一 tsconfig 和依赖在内存中恢复所有 tracked dirty 文件到 HEAD、排除 untracked 文件后做 multiset 对比：

- 本轮新增错误：0
- 本轮消除的基线错误：1
- `src/codexHandler.ts` 当前显示的既有错误仅因新增行产生行号偏移，错误语义均存在于 HEAD。

因此全仓 typecheck 失败记录为仓库基线诊断，不替代上面的 Task 1 专用 Gate，也不阻止 R05 零模型预检。

## 尚未完成

- 尚未启动 MemoryCore、MemoryKnowledge 或 MemoryProxy。
- 尚未执行 live R05 blank-stack preflight。
- 尚未调用 Luna 或运行任何正式 Case。
- 尚未创建 `task1-measurement-v2` 与 `task1-candidate-base-v1` tag。
- 尚未修改 Codex 登录、认证文件或官方 ChatGPT Codex upstream。

本次收口提交推送后，下一步是在 Node.js 22 和三个专用本地空白服务上执行 R05 `Restore` 阶段，等待 Knowledge code-graph ready，再对同一 RunRoot 执行 `Inspect -KnowledgeReadyConfirmed`。只有 12/12 receipt 通过且代码 HEAD/工作树未变化，才能给同一提交创建两个 annotated tag。
