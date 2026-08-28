# D0：来源合同与 Schema 冻结

## 目标

在生成任何正式资产前，锁定数据来源、MemoryProxy 实体映射、许可、时间和 provenance 合同，证明 W01～W03 六个候选 Team 有足够轨迹。

## 输入

- `DATASET-BASE-AND-WORLD-REBUILD.md`
- `CONTEXT.md`
- `DATASET-SOURCE-LEDGER.md`
- 当前 MemoryProxy 的 Session、Memory、Skill、Knowledge 源码合同

## 执行

1. 固定 SWE-Gym、OpenHands-SFT、Open-SWE-Traces v1.0、SWE-rebench-V2、ContextBench 的不可变 revision 和文件 hash；Open-SWE 不得使用仍在变化的 main。
2. 对 `moto`、`mypy`、`pandas`、`dask`、`dvc` 和 reserve `pydantic` 统计成功且 source task 不重叠的轨迹数、可保留消息数和时间范围。
   - OpenHands `<pr_description>` hash 只作候选去重；必须确定性 join SWE-Gym 的 `instance_id/base_commit` 后才算正式 source task。
   - Open-SWE 适配读取冻结 v1.0 的 `trajectory` 字段，不假设 main 的 `messages`。
   - Open-SWE 候选按 `instance_id` m:1 join SWE-rebench-V2；每个 repo 同时满足 `unique_tasks>=6` 和 `unique_trajectories>=6`，并排除 `resolved=-1`。
3. 读取每个 source task base commit 的 LICENSE/NOTICE，不只信数据卡标签。
4. 新建 Formal V2 schema，而不是给旧扁平 `World` 补字段：定义 World/Space、Team、BusinessAgent、Task、SourceEvidence、L0/L1/L2/L3、Skill、Knowledge、PublicCaseInput、PrivateCaseAnnotation、Pair、Gold、WorldSnapshot 和 RunRecord。
5. 定义 `synthetic_agent_replay` 清洗规则、PII/credential scan、未来信息检查和 hash 计算。
6. 定义全局 provenance graph 和 Split 冲突键。
7. 实现 identity-aware visible-set resolver；Team B 始终不可见，同 Team imported Memory Agent 为 0～2 个，Knowledge 只从当前 Agent fixed assets 解析。
8. 冻结正式运行策略：关闭 LLM write、extract、reflection、archive/write-back；每个 Case 使用 fresh session 并执行 snapshot reset。
9. 只生成 source inventory/dry-run，不生成正式对话或 Gold。

## 最小实现顺序

1. `world-schema.ts`：保留/重命名旧 Pilot 类型，并新增不可混用的 Formal V2 public/private 类型。
2. `source-registry.ts`、`snapshot-schema.ts`、`provenance-graph.ts`：集中管理不可变来源、许可、hash、snapshot 和 split 冲突。
3. `compile.ts`：正式编译输入改为 `PublicCaseInput + ResolvedVisibleSnapshot`；删除正式路径中的全局 `WORLD_SOURCE` 和全 World 资产复制。
4. `validate-worlds.ts`：增加来源、许可、时间、可见性、public/private leak、pair delta、snapshot 和 provenance graph 校验。
5. `worlds-bridge.ts`：只保留 contract fixture replay，并补 identity allowlist；生产证据必须来自 real-chain smoke。
6. `smoke-worlds.ts`：拆分 fixture replay 与 real-chain smoke。
7. `audit-worlds.ts` / `audit-completeness.ts`：补 asset ablation、context/workspace leak、snapshot determinism、token/injection hash 审计。
8. `index.ts`：正式指标只导出 Formal registry；旧 W01～W03 迁入 Pilot。
9. 上述合同全部通过后，才开始 D1 正式 W01 数据转换。

## 产物

- `source-lock.yaml`
- `license-manifest.jsonl`
- `trajectory-density.json`
- schemas 与 schema tests
- `transform-contract.md`
- `provenance-graph.schema.json`
- D0 Gate 报告

## Gate

- [ ] 六个候选 Team 各有至少 6 条成功、不重叠轨迹和至少 20 条可保留消息。
- [ ] OpenHands 轨迹能确定性 join SWE-Gym `instance_id/base_commit`；无法 join 的轨迹不进入正式 source pack。
- [ ] dataset revision、repo commit、license、trajectory id 和原始 hash 均可机器复核。
- [ ] Open-SWE v1.0 两 split 的本地统计与 84,066/67,153 一致，且 parquet SHA、SWE-rebench join hash、字段 schema snapshot 已冻结。
- [ ] Space/Team/Agent/Task 与资产可见性和源码一致。
- [ ] Team A Session 无法读取或调用 Team B 的 Memory/Skill/Knowledge；同 Team imported Memory Agent 不超过两个。
- [ ] schema 禁止把 `projectRef`、family、pair role 或 Gold 注入真实请求。
- [ ] `PublicCaseInput` 与 `PrivateCaseAnnotation` 使用独立类型和序列化路径；编译后的 Provider 输入扫描不到 Gold、pair、source private 字段。
- [ ] 相同 Case/snapshot 重建两次得到相同 visible-asset hash、workspace hash 和 injection hash。
- [ ] 正式运行 `allowLlmWrite=false`、`allowLlmExtract=false`，且反射、归档写回和跨 Case 残留均关闭。
- [ ] 每个 Positive 有资产移除消融证据；每个 paired Negative 只有一个声明的 counterfactual 差异且无需云端资产。
- [ ] 所有 transform 都记录 origin、locator、hash、时间和 review 状态。
- [ ] 未确认许可的 OpenHands-Sampled 及 GitHub 评论正文被排除。

任何候选不通过时只允许替换 repo 或补充合规来源，不允许降低门槛或凭空补会话。
