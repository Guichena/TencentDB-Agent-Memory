# M2：Token、Cache 与 Fresh-session 账本

## 身份与隔离

```yaml
candidate_id: M2
kind: measurement
parent: task1-c07-pass^{commit}
depends_on: [shared-observation-gold-v2-interface]
branch_group: measurement
branch: codex/task1-measure-m2-usage-isolation-v2
worktree: D:\projects\TencentDB-Agent-Memory-task1-measure-m2
model_runs: 0
depends_on_at_integration: M0 evaluationPrefix
```

M2 可以独立实现 usage normalizer、token ledger、isolation evidence 和 metadata parity。正式累计到 terminal 的 horizon 要在集成时接 M0。最终 `formalMetricEligible` 由 Integration 将 M2 evidence gate 与 M0 trace facts 合并后唯一生成，M0 或 M2 都不能单独产生最终资格。

## 进入条件

研究计划已冻结，`task1-c07-pass^{commit}` 可解引用，目标 branch/worktree 空闲，provider usage fixture 和 shared horizon 接口可用。真实 adapter 未完成不阻塞 local normalizer/parity tests，但阻塞 formal-ready Gate。

## 单一职责

- 最终完整注入与静态工具描述 token。
- static template、execution contract、runtime binding、dynamic asset 等解释组件。
- Provider raw usage、adapter/schema 版本和标准化 input/read/write/output/reasoning。
- `providerInputToEvaluationHorizon` 和成功条件下的 terminal 成本。
- fresh session、资产 snapshot、local state、run namespace 的隔离证据。
- provider `cache_control`/breakpoint metadata 从 pipeline 到请求的保真。

M2 不改 Prompt 文本、顺序、工具合同或模型配置。

## 关键输出

```text
totalInjectionTokens / toolDescriptionStaticTokens
staticTemplateTokens / executionContractTokens
runtimeBindingTokens / dynamicAssetTokens
injection UTF-8 bytes and hashes
providerTotalInputTokens
ordinaryInputTokens / cacheReadInputTokens / cacheWriteInputTokens
outputTokens / reasoningOrThinkingTokens
providerInputToEvaluationHorizon
providerInputToTerminalGivenSuccess
modelRoundsToTerminal / tdaiCallCount / timeToTerminal
usageCompleteForRequiredFields / unsupportedOptionalFields
run/session/snapshot/visibleAsset/localState evidence
```

组件 token 不能简单相加替代完整注入编码。本地组件估计不能再次加入 provider billed total。

## Task 1 指标

核心记录是静态工具描述 token 和完整注入 token。辅助记录 provider input to horizon、cache read/write/ordinary、rounds、TDAI call count、time to terminal 与 usage/isolation completeness。这些只解释 Task 1 成本和公平性，不评价 terminal 后的回答或完整任务成本。

## Provider 规则

Provider、API version、adapter version、usage schema 和 required fields 必须冻结。缺少 required 字段、出现负数或恒等式不成立时标为 infrastructure error。明确 unsupported 的可选字段写 `null/unsupported`，不能写 0。

fresh session 只说明会话和本地状态隔离，不代表 cache cold。cold/warm 只能由真实 read/write telemetry 判断。

## 允许与禁止改动

允许新增 measurement-v2 usage/token/cache/isolation 模块和 focused tests；允许对 `codex-runner.ts`、`run-benchmark.ps1`、real-chain adapter 增加 prepare-only、run namespace 和只读观测；`pipeline.ts` 只允许修复非文本 metadata 保真。

禁止修改 injectors/specs/compiler/profile、formal data、M0/M1 语义、官方上游和认证、YAML、用户 `CODEX_HOME`/`auth.json`。若要改 Prompt 文本或顺序，应停止并转 V4-L。

## 无模型测试矩阵

覆盖 OpenAI/Anthropic usage 正常化、required missing、optional unsupported、负数/NaN、恒等式、双计数、完整注入独立编码、动态内容剥离、ledger determinism、不同 session/local path、pair snapshot 一致但状态独立、prepare-only 不启动模型、认证文件不读取不复制、metadata 保真、mock 永不 eligible、formal eligibility fail closed、M0 horizon 接口 fixture。

## Gate

1. usage、token、isolation focused tests 全通过。
2. pipeline metadata 修复不改变 text、role、block 顺序和 Prompt hash。
3. V0 至 V3 freeze 不变。
4. required usage 缺失 fail closed。
5. fresh session、asset isolation、cache lane 三者独立表达。
6. 两次 ledger 输出 canonical SHA 一致。
7. prepare-only 不启动服务、Codex 或 provider。
8. 模型调用数为 0。

## 正式链路硬停止

若 usage 无法归属 request/run、adapter 口径不明确、snapshot 无法恢复、pair 两侧无法隔离，或只取得 terminal 后的混合总量而正式选择需要 evaluation horizon，则正式 Gate 停止。缺失值不能伪造为 0。

## 接受、停止与产物

接受条件是 no-model ledger/isolation/metadata Gate 通过，并生成清晰的正式链路缺口清单。任何需要持久修改用户 Codex 配置、改上游认证或改变 Prompt 内容的方案立即停止。

保存实现提交、测试提交、provider fixtures、metadata parity、ledger SHA、Gate 报告和 annotated pass Tag。
