# D0：来源合同与 Schema 冻结

## 目标

在生成任何正式资产前，锁定 W01～W03 数据来源、MemoryProxy 实体映射、许可、时间和 provenance 合同，证明六个正式 Team 有足够且能分离 history/current-anchor 的真实任务。W04 以后使用的新数据源在对应阶段单独锁定，不提前阻塞 W01。

## 输入

- `DATASET-BASE-AND-WORLD-REBUILD.md`
- `CONTEXT.md`
- `DATASET-SOURCE-LEDGER.md`
- `source-locks/w01-w03/TRANSFORM-CONTRACT.md`
- 当前 MemoryProxy 的 Session、Memory、Skill、Knowledge 源码合同

## 执行

1. 固定 W01～W03 实际使用的 SWE-Gym 与 OpenHands-SFT 不可变 revision、文件 hash 和 join 输出；Open-SWE、SWE-rebench-V2、ContextBench 只保留候选台账，在 D3 或首次实际使用时锁定。
2. 对正式候选 `moto`、`mypy`、`pandas`、`dask`、`dvc`、`MONAI` 以及 reserve `conan`、`pydantic` 统计成功且 source task 不重叠的轨迹数、可保留消息数和时间范围。
   - OpenHands `<pr_description>` hash 只作候选去重；必须确定性 join SWE-Gym 的 `instance_id/base_commit` 后才算正式 source task。
3. 读取每个 source task base commit 的 LICENSE/NOTICE，不只信数据卡标签。
4. 新建 Formal V2 schema，而不是给旧扁平 `World` 补字段：定义 World/Space、Team、BusinessAgent、Task、SourceEvidence、L0/L1/L2/L3、Skill、Knowledge、PublicCaseInput、PrivateCaseAnnotation、Pair、Gold、WorldSnapshot 和 RunRecord。
5. 定义 `synthetic_agent_replay` 清洗规则、PII/credential scan、未来信息检查和 hash 计算。
6. 定义全局 provenance graph 和 Split 冲突键。
7. 实现 identity-aware visible-set resolver；Team B 始终不可见，同 Team imported Memory Agent 为 0～2 个，Knowledge 只从当前 Agent fixed assets 解析。
8. 冻结正式运行策略合同：关闭 LLM write、extract、reflection、archive/write-back；每个 Case 使用 fresh session。真实 SQLite/cache/workspace reset 的链路证据在 D5、正式评测前完成。
9. 每个正式 Team 锁定至少 12 个官方 source task，分成互斥的 `history>=6` 与 `current_anchor>=6`；禁止把 current anchor 的 reference patch 或测试答案写入历史资产。
10. 只生成 source inventory/dry-run，不生成正式对话或 Gold；来源选择不能自动决定 Memory/Skill/Knowledge Gold。

## 最小实现顺序

1. `formal-schema.ts`：定义不可与旧 Pilot 混用的 Formal V2、public/private 类型和转换 allowlist。
2. `formal-visibility.ts`：按生产 ownership/binding 解析 Memory、Skill、Knowledge 可见集合。
3. `formal-snapshot.ts`：冻结 canonical World snapshot、visible/workspace hash 和 RunRecord 合同。
4. `formal-provenance.ts`：建立 repo/source task/trajectory/patch/Skill/Wiki/CodeGraph/query group 冲突图。
5. `formal-compile.ts`：只从 `PublicCaseInput + ResolvedVisibleSnapshot` 编译 Session Init 与 Provider-safe 输入。
6. `source-tools/*`：冻结 source files、确定性 join、候选库存、72-task source pack 与逐 commit license manifest。
7. D1/D2 在实际资产和 Case 出现后，再接入 Formal registry、pair/Gold/ablation 审计；D5 执行 real-chain smoke 与残留检查。

## 产物

- `source-lock.yaml`
- `license-manifest.jsonl`
- `trajectory-density.json`
- schemas 与 schema tests
- `source-locks/w01-w03/TRANSFORM-CONTRACT.md`
- provenance graph validator/tests
- D0 Gate 报告

## Gate

- [x] 六个正式 Team 各有至少 12 个官方 source task；history/current anchor 各 6 个且无重叠，history 每条 messages≥20。
- [x] OpenHands 轨迹能确定性 join SWE-Gym `instance_id/base_commit`；4 条歧义记录已显式排除。
- [x] dataset revision、repo commit、license、trajectory row locator 和原始 hash 均可机器复核。
- [x] Space/Team/User/BusinessAgent/Task 与资产可见性合同和源码一致。
- [x] Team A Session 无法读取或调用 Team B 的 Memory/Skill/Knowledge；同 Team imported Memory Agent 不超过两个。
- [x] schema 禁止把 `projectRef`、family、pair role或 Gold 注入真实请求。
- [x] `PublicCaseInput` 与 `PrivateCaseAnnotation` 使用独立类型和序列化路径；编译后的 Provider 输入扫描不到 Gold、pair、source private 字段。
- [x] D0 snapshot 单测证明相同输入重建得到相同 visible-asset/workspace hash；实际 injection hash 在 D5 真实注入时验证。
- [x] 正式运行合同固定 `allowLlmWrite=false`、`allowLlmExtract=false`，且反射、归档写回关闭；真实链路残留检查已归入 D5 Gate。
- [x] Formal schema 强制 transform 记录 origin、locator、hash、时间、版本和 review；D1 实际资产必须逐条满足。
- [x] 未确认许可的 OpenHands-Sampled 及 GitHub 评论正文被排除。

任何候选不通过时只允许替换 repo 或补充合规来源，不允许降低门槛或凭空补会话。

Positive 的资产移除消融、paired Negative 的单变量差异和 Gold 唯一性必须在 D1/D2 有实际 Case 后验收，不属于不生成 Case 的 D0 Gate。
