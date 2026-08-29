# DS00 Gate — One-Space Contract and Minimal-Chain Scoring

状态：`passed`

日期：2026-08-29（Asia/Shanghai）

分支：`codex/task1-data-contract-one-space`

基线：`5b7f2734cff5b93840b5622c2b344058882ddf9c`

## 范围

- 将 split 从 World 下沉到 Team。
- 允许同一 Space 登记任意数量 Team，并为 Dev、Hidden 建立互斥快照。
- 将正式私有 Gold 对齐到 `allowedFirstActions`、`expectedFollowupActions`、`expectedKnowledgeCalls`、`allowedSequences` 和 `maxTdaiCalls`。
- 明确完整最短合法链路才产生 `effectiveCall=true`；首动作正确但链路未完成只保留首路由诊断；超过 `maxTdaiCalls` 不计有效调用。
- 冻结 `space-task1-engineering`、T01 至 T10 的身份和 split；未生成 case 或资产。
- 增加四个薄施工入口；恢复和检查入口要求 DS06 提供生产 adapter，不在 DS00 连接或修改真实服务。

## Gate 结果

| Gate | 结果 | 证据 |
|---|---|---|
| 一个 Space 可表达十个 Team | passed | `formal-world-schema.test.ts` 构造十 Team 合同并通过正式 validator |
| Dev/Hidden 在同一 Space 独立编译 | passed | `compileFormalSplitInputs` 分别只输出各自 Team 的 case |
| 首路由与完整链路分离 | passed | Skill search/view 与 Knowledge list/call 的 partial/complete 测试 |
| 超调不计有效调用 | passed | 三次 attempt 对两步 Gold 得到 `overcall=true`、`effectiveCall=false` |
| registry 身份冻结 | passed | T01–T04=`dev`，T05–T10=`hidden_test`，Agent id 符合冻结命名 |
| 未生成正式数据 | passed | Team registry=10；formal case file=0；formal asset file=0 |
| Provider/私有字段分离 | passed | 正式 compiler 仅输出 provider allowlist，私有 Gold 独立编译 |
| 四个施工入口 | passed | compile、validate、restore、inspect 均通过模块加载/参数烟测 |
| `git diff --check` | passed | 无内容错误；仅已有 LF/CRLF 转换警告 |

## 命令

1. `npm run eval:tool-prompt:d0:test`
   - TypeScript：6 个 test files，28 tests passed。
   - Python：28 tests passed。
   - Python 输出中的 `pass=false` 来自故意构造的 fail-closed 小 fixture，只证明失败路径被拒绝，不代表正式来源数量已达标。
2. `npm run eval:tool-prompt:test`
   - 30 tests passed。
3. 四个 `tsx formal-dataset/scripts/*.ts` 参数烟测
   - 四个入口均成功加载，并在缺少必需参数时以 usage/exit 2 终止；未产生数据或外部写入。
4. `npm run typecheck`
   - exit 2；共 54 个既存基线错误。
   - Task 1 / formal / tool-prompt 相关新增错误：0。
   - 基线分布：`anthropicHandler.ts` 9、`codexHandler.ts` 8、`handler.ts` 7、`memory-bridge.ts` 2、`session/codebuddy/init.ts` 20、`storage/factory.ts` 1、`workbuddyHandler.ts` 7。

## Hash 留痕

| 对象 | SHA-256 |
|---|---|
| `worlds/formal-schema.ts` | `9705be742ed3fb240027556a8f80ab9bedd4df1d95757fcd80fad5ef9641b884` |
| `worlds/formal-compile.ts` | `53108da239c959cea77bc388e72d3a9a85e1eb5047fc082ea501faa43e4033f1` |
| `evaluator.ts` | `eba67be0a186ae72d813d1b65cca1f54d8e7ef73784bb40fd09ee3e3a347a837` |
| `registry/space.json` | `ade752b1f22149cb30093663f666118daf3b4155b277269726d6f815ea0c5e64` |
| T01–T10 Team hash manifest | `4ae3c3e904afa69d6eac9e211c34c7c8f601f2469cc96ccf87fb0a7290410291` |

## 数据与生成记录

- 正式 case：0。
- 正式 pair：0。
- 正式资产：0。
- Luna 批次：0；DS00 禁止调用生成模型。
- 正式模型实验：未运行。

## 已知限制与下一步

- 全量 typecheck 的 54 个非 Task 1 基线错误继续单独记录，不在数据合同阶段修复。
- 来源数量、真实 listing/search、Knowledge ready 状态不是 DS00 Gate，不能由单元测试推断为已通过。
- 下一阶段唯一任务：DS01，将 W01 的 4 组 pair/8 条草稿迁入 T01 正式 registry，去除第一次决策即停合同，并通过新 schema、pair、来源、泄漏和序列校验。
