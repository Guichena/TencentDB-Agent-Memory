# D5：真实链路 Smoke 与评测交接

## 目标

证明正式数据经过真实 MemoryProxy Session Init、生产 InjectionPipeline 和真实 Memory/Skill/Knowledge 入口时仍满足首调用评分与公平性合同，然后把冻结数据交给 V0/V0-C/候选评测。

## 前置

D4 Gate 与代码 Variant Gate 均通过；MemoryCore、Skill、MemoryKnowledge、MemoryProxy 和入口 observer 可启动。

## 执行

1. 从空本地数据栈恢复正式 Dev snapshot，关闭自动抽取、归档写回和 LLM 写资产。
2. 逐条运行 20 条 Smoke；每条使用新 Session、干净 Workspace 和同一模型设置。
3. 正样本执行到首个真实 TDAI 入口，记录 Attempt/入口/参数后停止；负样本在当前轮结束时确认无 Attempt。
4. 每条前后比较 asset snapshot hash、Session/SQLite/KV/Redis cache、Skill buffer 和 Workspace，确认无跨 Case 污染。
5. 保存 Provider-visible prompt、逐注入块静态 Token/bytes/hash、input/cached/cache-write/output/reasoning tokens、Codex events、entry trace 和 evaluation。
6. 核对 V0 与所有候选只改变 Prompt Variant；World、Query、上下文、Workspace、资产、能力、模型、推理强度和运行协议保持一致。
7. 生成评测命令、campaign manifest、随机/交错顺序和恢复说明。

## 产物

- 20 条真实链路 Smoke 的完整 run artifacts
- 资产不变性与跨 Case 隔离报告
- Token/usage 完整性报告
- 正式评测 campaign manifest 和复现命令
- D5 Gate 报告

## Gate

- [ ] 20 条全部经过正常 Session Init 和生产 InjectionPipeline。
- [ ] Provider-visible prompt 只由生产注入器生成，没有 runner 预渲染或双重注入。
- [ ] Memory、Skill、Knowledge 首入口 observer 均能区分正确、错误、malformed 和 infrastructure error。
- [ ] 每条运行前后资产 hash 不变，无上一个 Case 的 Session/cache/Workspace 污染。
- [ ] 静态注入 Token、动态资产 Token 和 Provider usage 分开且完整保存。
- [ ] 同一 Case 的所有 Variant 使用同一 snapshot 和相同非 Prompt 输入。
