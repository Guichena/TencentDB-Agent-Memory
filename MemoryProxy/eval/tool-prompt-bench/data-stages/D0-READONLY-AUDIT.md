# D0 只读复核报告

> 日期：2026-08-29
> 状态：`PASS`。W01～W03 的来源文件、source-task join、72-task source pack、逐 commit 许可、Formal V2、公私隔离、真实可见性、快照与 provenance gate 均已冻结并通过测试，可以从本提交创建 D1 分支开始 W01 draft 转换。

## 1. 结论

公开数据适合做真实事实基座，但不提供可直接照搬的 TencentDB Agent Memory World。正式数据必须经过三层转换与复核：

1. 以冻结的真实 repo task、base commit、成功轨迹和测试结果建立事实层。
2. 依据 MemoryProxy 源码建立 Space、Team、Business Agent、Task、Session 和资产 binding；外部 `repo/project/agent` 字段不直接成为运行参数。
3. 依据当前信息缺口构造 Positive/Negative 与 Gold；上游工具调用、reference patch 或数据集标签不直接成为 TDAI Gold。

因此，正确路线是“真实来源 + TDAI 专属重编排”，不是复制 benchmark，也不是手写一个看起来像真实团队的故事。

## 2. 已通过的来源与 source-pack Gate

### SWE-Gym / OpenHands-SFT

- SWE-Gym revision：`bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb`。
- OpenHands-SFT revision：`4aaa5a4a4b5861f4799d2336908760c190ac3b17`，split `train.success.oss`，491 条成功轨迹。
- 两个文件已冻结：SWE-Gym 2,438 行，SHA-256 `60569cea74bb281f7a5579467436a2bc1932c6e0c5f2f7fa0d084392abd9ad97`；OpenHands-SFT 491 行，SHA-256 `ea4bf37de020e165c5210bedddeef523d8834a89a35a8c65fec24f76f0eae4f1`。
- 使用全局唯一精确 join：487 条匹配、4 条歧义排除、0 条未匹配；合格记录均取得 SWE-Gym 官方 `instance_id/base_commit`。
- 六个正式候选 repo 均达到“history/current anchor 各至少 6 个且互不重叠”的容量下限。

| Repo | 唯一官方 task | messages≥20 | 决定 |
|---|---:|---:|---|
| `getmoto/moto` | 69 | 69 | W01 A |
| `python/mypy` | 27 | 27 | W01 B |
| `pandas-dev/pandas` | 61 | 60 | W02 A |
| `dask/dask` | 29 | 28 | W02 B |
| `iterative/dvc` | 23 | 23 | W03 A |
| `Project-MONAI/MONAI` | 53 | 50 | W03 B |
| `conan-io/conan` | 12 | 11 | reserve |
| `pydantic/pydantic` | 7 | 7 | reserve |

正式 Team 至少锁 12 个官方 task，并拆成互斥的 history≥6/current-anchor≥6。公开任务只提供事实和锚点，不能自动成为 MemoryProxy Query、资产或 Gold。

六个正式 Team 已各选 12 个 task，共 72 条（36 history + 36 current anchor）。机器 Gate 已验证：预期 Team/repo 映射、6/6 分工、40 位 base commit、64 位 problem hash、messages≥20、Team 内 instance/problem hash/patch path 唯一。选型同时按真实子系统复核，而不是只取最长轨迹；Dask 库存没有 `dask/bag/` task，因此不虚构 Bag 覆盖。

逐 base commit 许可报告覆盖 72 条根许可证和 5 条由所选 `dask/array` 路径触发的 NumPy 条件许可证；77 条均为 HTTP 200、SHA-256 已保存、SPDX 可识别，`fail_closed=false`。许可证正文不写入仓库。

### D3 候选：Open-SWE-Traces v1.0

- 候选冻结 revision：`6c426da40f5478986398531f065ac5b523fa3ec6`，只使用 `config=v1.0`。
- splits：`openhands=84,066`、`sweagent=67,153`，合计 151,219；正式 lock 以固定 parquet 的本地重算和 hash 为准。
- v1.0 字段为 `trajectory`，不能按当前 main 文档假定为 `messages`。
- Open-SWE 本体没有 `base_commit`，必须按 `instance_id` m:1 join 冻结的 `nebius/SWE-rebench-V2`。
- 只准入 `resolved=1` 且 repo license 为 MIT/Apache-2.0/BSD-2-Clause/BSD-3-Clause 的记录；每个 Team 同时要求 `unique_tasks>=6` 和 `unique_trajectories>=6`。
- 不导入 `reasoning_content`、`think`、reference patch 或 model patch 到 L0/L1/L2/Skill。

W04 当前只保留候选：Go `open-telemetry/opentelemetry-go-contrib`，Node/TS 从 `elastic/synthetics` 与 `webpack-contrib/copy-webpack-plugin` 中按全量成功密度选择。全部为 `PENDING`，在 D3 首次使用时锁定，不阻塞 W01～W03 的 D0 Gate。

## 3. 已确认的源码约束

- Session 真实身份为 `spaceId + teamId + agentId + taskId?`；`projectRef` 只是数据组织信息。
- Skill 可见性以 Team/Agent ownership 为基础。
- Knowledge 由当前 Agent 的 fixed asset binding 解析。
- Memory 是 self 加同 Team 最多两个 imported Agent。
- 另一个 Team 的资产不可见，只能验证隔离，不能当作可见干扰。
- 旧 `compileWorldFixture()` 会暴露全 World 资产，且正式来源不能继续使用硬编码 `project-authored/MIT`。
- 旧 Pilot 的 `allowLlmExtract: true` 不适合正式公平评测；正式策略必须关闭 write/extract/reflection/archive/write-back。

## 4. D0 完成证据

| Gate | 证据 |
|---|---|
| 数据文件与 join | `source-lock.yaml`、`join-report.json`、`trajectory-density.json` |
| 真实任务选择 | `candidate-inventory.json`、`W01-W03-SOURCE-PACK-SELECTION.md`、`source-pack-selection.json` |
| 许可 | `license-manifest.jsonl`、`license-report.json`（77 records，0 blocker） |
| 禁止照抄 | `TRANSFORM-CONTRACT.md` 与 FormalTransform allowlist |
| 源码实体/可见性 | `formal-schema.ts`、`formal-visibility.ts`、`formal-compile.ts` 及 tests |
| 公私隔离/快照/防泄漏 | `formal-snapshot.ts`、`formal-provenance.ts` 及 tests |
| 自动验证 | Formal Vitest 17/17；source-tools unittest 19/19；目标 Formal 模块 strict TypeScript 通过 |

真实 SQLite/KV/cache/workspace reset 需要实际 Case 与服务链路，归入 D5、正式评测前 Gate。Positive 消融、paired Negative 单变量差异和 Gold 唯一性需要 D1/D2 的实际 Case，不能在不生成 Case 的 D0 中伪造“已验证”。

## 5. 下一步顺序

1. 提交 D0 来源合同与机器产物，从该提交创建 `codex/task1-data-d1-w01`。
2. D1 只处理 W01 的 moto/mypy：先转换 history L0 draft，再从证据提炼 L1/L2/Skill/Knowledge draft。
3. 完成资产和 workspace 复核后才构造 40 个 Case；Gold 不由上游标签自动生成。
4. W01 的 source、time、pair、asset-ablation、Gold uniqueness 和 snapshot Gate 全通过后，才进入 D2。
