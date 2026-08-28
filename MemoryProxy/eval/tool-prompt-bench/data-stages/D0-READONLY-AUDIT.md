# D0 只读复核报告

> 日期：2026-08-29
> 状态：`PARTIAL_PASS`。来源容量和设计方向通过；source-task join、逐 commit 许可、文件 hash 与 Formal V2 schema 尚未完成，因此不得开始正式 W01 生成。

## 1. 结论

公开数据适合做真实事实基座，但不提供可直接照搬的 TencentDB Agent Memory World。正式数据必须经过三层转换与复核：

1. 以冻结的真实 repo task、base commit、成功轨迹和测试结果建立事实层。
2. 依据 MemoryProxy 源码建立 Space、Team、Business Agent、Task、Session 和资产 binding；外部 `repo/project/agent` 字段不直接成为运行参数。
3. 依据当前信息缺口构造 Positive/Negative 与 Gold；上游工具调用、reference patch 或数据集标签不直接成为 TDAI Gold。

因此，正确路线是“真实来源 + TDAI 专属重编排”，不是复制 benchmark，也不是手写一个看起来像真实团队的故事。

## 2. 已通过的来源容量初筛

### SWE-Gym / OpenHands-SFT

- SWE-Gym revision：`bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb`。
- OpenHands-SFT revision：`4aaa5a4a4b5861f4799d2336908760c190ac3b17`，split `train.success.oss`，491 条成功轨迹。
- 六个候选 repo 均达到“至少 6 条候选 task、至少 20 条可保留消息”的容量下限。

| Repo | 成功轨迹 | 推断唯一 task | 6 条最长轨迹总可用消息 | 初筛 |
|---|---:|---:|---:|---|
| `getmoto/moto` | 155 | 71 | 600 | 通过 |
| `python/mypy` | 46 | 27 | 528 | 通过 |
| `pandas-dev/pandas` | 70 | 61 | 526 | 通过 |
| `dask/dask` | 45 | 29 | 388 | 通过 |
| `iterative/dvc` | 36 | 24 | 508 | 通过 |
| `pydantic/pydantic` | 11 | 7 | 356 | 仅 reserve |

这里的唯一 task 是由 `<pr_description>` 规范化后 hash 推断，不能替代发布方 ID。正式准入必须先 join SWE-Gym 的 `instance_id/base_commit`。

### Open-SWE-Traces v1.0

- 候选冻结 revision：`6c426da40f5478986398531f065ac5b523fa3ec6`，只使用 `config=v1.0`。
- splits：`openhands=84,066`、`sweagent=67,153`，合计 151,219；正式 lock 以固定 parquet 的本地重算和 hash 为准。
- v1.0 字段为 `trajectory`，不能按当前 main 文档假定为 `messages`。
- Open-SWE 本体没有 `base_commit`，必须按 `instance_id` m:1 join 冻结的 `nebius/SWE-rebench-V2`。
- 只准入 `resolved=1` 且 repo license 为 MIT/Apache-2.0/BSD-2-Clause/BSD-3-Clause 的记录；每个 Team 同时要求 `unique_tasks>=6` 和 `unique_trajectories>=6`。
- 不导入 `reasoning_content`、`think`、reference patch 或 model patch 到 L0/L1/L2/Skill。

W04 当前只保留候选：Go `open-telemetry/opentelemetry-go-contrib`，Node/TS 从 `elastic/synthetics` 与 `webpack-contrib/copy-webpack-plugin` 中按全量成功密度选择。全部为 `PENDING`。

## 3. 已确认的源码约束

- Session 真实身份为 `spaceId + teamId + agentId + taskId?`；`projectRef` 只是数据组织信息。
- Skill 可见性以 Team/Agent ownership 为基础。
- Knowledge 由当前 Agent 的 fixed asset binding 解析。
- Memory 是 self 加同 Team 最多两个 imported Agent。
- 另一个 Team 的资产不可见，只能验证隔离，不能当作可见干扰。
- 旧 `compileWorldFixture()` 会暴露全 World 资产，且正式来源不能继续使用硬编码 `project-authored/MIT`。
- 旧 Pilot 的 `allowLlmExtract: true` 不适合正式公平评测；正式策略必须关闭 write/extract/reflection/archive/write-back。

## 4. D0 未完成项

| 未完成项 | 为什么阻塞正式 W01 | 完成证据 |
|---|---|---|
| OpenHands → SWE-Gym 确定性 join | 目前无法证明每条轨迹的正式 task/base commit | join 规则、成功率、歧义/失败清单与输出 hash |
| 逐 source task commit 的 LICENSE/NOTICE | 当前 main 许可不能代表历史 commit 和第三方文件 | license manifest 与文件 hash |
| 数据文件 hash | revision 仍不足以证明下载内容与统计一致 | source-lock、逐文件 SHA-256、row counts |
| Formal V2 schema | 旧扁平 World 会破坏可见性、公私字段隔离 | schema/types/tests 全通过 |
| visible-set resolver | 不能让 Team B 或非绑定资产进入 Case | Team/Agent/fixed-asset/imported-memory 权限测试 |
| snapshot/reset/run record | Variant 或 Case 之间可能受残留状态影响 | 重建 hash 一致、跨 Case 残留测试、run record |
| Gold/Pair 审计器 | 不能仅凭改写 query 声称唯一或无需工具 | asset ablation、controlled delta、no-tool evidence |

## 5. 下一步顺序

1. 先完成 source lock、join 和 license manifest；失败轨迹直接剔除，Pydantic 余量不足则替换 repo。
2. 实现 Formal V2 schema 与 public/private 编译边界。
3. 实现 identity-aware visible-set、snapshot/reset 和审计测试。
4. D0 Gate 全通过后，再创建 D1 分支转换 W01；不提前批量生成对话、Memory、Skill 或 Gold。
