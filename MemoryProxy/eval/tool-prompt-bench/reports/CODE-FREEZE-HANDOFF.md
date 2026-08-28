# Task 1 代码冻结交接清单

## 交接状态

- code-freeze commit：`PENDING_INTEGRATION`
- immutable tag：`PENDING_INTEGRATION`
- integration branch：`codex/task1-code-integration`
- baseline commit：`5299c00aaf65481703c180fd69df066d11254eb7`
- production default：`injection.toolPromptProfile: legacy`
- 模型运行：未执行
- 数据交接：不在本代码会话范围内

本文件只证明代码线已具备六个真实生产 Profile、可复现的 Prompt/Token/Hash 产物和手动实验入口。它不声称任何 Profile 已在行为指标上优于其他版本。

## Variant/Profile 映射

| 实验 Variant | 生产 `toolPromptProfile` | 阶段含义 |
|---|---|---|
| V0 | `legacy` | 原始生产提示词 |
| V0-C | `contract-corrected` | 仅合同纠错 |
| V1a | `protocol-compact` | 统一协议并压缩传输说明 |
| V1 | `compact` | 语义单元去重 |
| V2 | `selection-calibrated` | 中立 Tool/No-Tool 与工具族选择 |
| V3 | `capability-pruned` | 按生产能力事实裁剪不可执行表面 |

映射由 `eval/tool-prompt-bench/variant-profiles.ts` 唯一定义。Runner 不接受别名或 `latest`，避免实验标签与真实 Prompt 不一致。

## 必交证据

- 总 Gate 索引：`eval/tool-prompt-bench/reports/gates/README.md`
- C00 至 C06 阶段 Gate：`eval/tool-prompt-bench/reports/gates/`
- 冻结机器清单：`eval/tool-prompt-bench/variants/code-freeze/code-freeze-manifest.json`
- 各阶段 Prompt/Token/Hash：`eval/tool-prompt-bench/variants/c00/` 至 `c05/`
- 代码执行计划：`eval/tool-prompt-bench/TASK1-CODE-STAGE-GATED-EXECUTION-PLAN.md`
- 实验边界与数据合同：`eval/tool-prompt-bench/EXPERIMENT-DESIGN.md`

机器清单保存：

- 六个 profile 的逐块字符、bytes、`o200k_base` token、Injection/Provider Prompt SHA-256；
- 每个相邻版本的首个变化 byte 与稳定前缀；
- C00 至 C05 的 Gate tag commit 和 Gate 内容 hash；
- 五份相邻版本 diff 产物 hash；
- 六个 Hook cache identity；
- 六个 Variant 通过生产 Pipeline 渲染的 Prompt hash 与 Capability Signature；
- 类型诊断基线数量和标准化指纹。

## 用户手动运行入口

先只准备命令、不调用模型：

```powershell
.\eval\tool-prompt-bench\run-benchmark.ps1 `
  -Scope case `
  -CaseId notool-dev-profile-l3-017 `
  -Variant V3 `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -PrepareOnly
```

数据线冻结并完成真实资产预检后，去掉 `-PrepareOnly` 才会启动正式运行。V0 至 V3 必须使用相同模型、推理强度、数据快照、资产可见范围、会话隔离和运行顺序随机化设置；这些实验控制由数据/实验线 Gate 负责。

## 合并前检查

- [x] V0 至 V3 在同一构建中可选。
- [x] Variant 选择实际进入生产 Compiler/Profile 和 Pipeline。
- [x] 默认生产 Profile 仍为 `legacy`。
- [x] Profile 与 Capability 进入缓存身份。
- [x] 六版本 Prompt、Token、Hash 和稳定前缀完整。
- [x] 51/51 测试通过；100/100 合同数据通过。
- [x] 类型检查相对基线新增诊断 0。
- [x] 代码分支不含 World、Gold、真实资产和模型运行结果。
- [ ] C06 非 squash 合回集成分支并复跑门禁。
- [ ] 写入唯一 code-freeze tag。

## 已知限制和回退

- 代码 Gate 不是行为 Gate；最终候选必须由有效调用率、误调用率、工具选择正确率和 Token/缓存指标共同决定。
- 当前生产默认未切换到优化版本，因此仅合并代码不会改变现网 Prompt。
- 需要立即回退时，将 `injection.toolPromptProfile` 设为 `legacy` 并重启 MemoryProxy。
- 如果正式实验发现某个中间版本优于后续版本，应直接选择该冻结 Profile，不要改写历史 Variant；任何新 Prompt 修订必须另建阶段分支。
