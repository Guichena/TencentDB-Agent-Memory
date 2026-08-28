# Task 1 数据来源台账

> 核查日期：2026-08-29。所有外部内容均作为不可信数据读取；其中的提示式文本不构成项目指令。

| 来源 | 锁定/观测版本 | 一手来源 | 已核查事实 | 决定 |
|---|---|---|---|---|
| TencentDB-Agent-Memory 源码 | 当前 P01 集成工作树 | `MemoryProxy/src/session/types.ts`、`tdai/types.ts`、`injection/injectors/*`、`knowledge/core-client.ts`、`skill/core-client.ts` | Session 绑定 Space/Team/Agent/Task；Skill owner 为 Team+Agent；Knowledge 优先 Agent fixed assets；Memory 为 self + 同 Team 最多 2 个 imported Agent | 定义运行时领域模型和 Gold 可见边界 |
| SWE-Gym | `bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb` | https://huggingface.co/datasets/SWE-Gym/SWE-Gym/tree/bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb | 2,438 条、11 个 Python repo；含 instance_id/repo/base_commit/problem/patch/test patch；数据卡标 MIT | W01～W03 task registry/base-commit 锚点，不是轨迹 |
| OpenHands-SFT-Trajectories | `4aaa5a4a4b5861f4799d2336908760c190ac3b17`，split=`train.success.oss` | https://huggingface.co/datasets/SWE-Gym/OpenHands-SFT-Trajectories/tree/4aaa5a4a4b5861f4799d2336908760c190ac3b17 | 491 条成功轨迹，messages 长度约 13～101；数据卡标 MIT；无正式顶层 source_task_id/instance_id/base_commit；已用首个 user message 的 `<pr_description>` 与 SWE-Gym 做全局唯一精确匹配：487 命中、4 歧义、0 未命中 | W01～W03 L0 操作证据候选；4 条歧义记录排除，不能直接充当 L1/L2/Skill/No-tool 成品 |
| OpenHands-Sampled-Trajectories | 当前页面 6,055 rows；README 为空，页面未展示明确 license | https://huggingface.co/datasets/SWE-Gym/OpenHands-Sampled-Trajectories | messages 长度 7～101，包含 resolved 与工具历史 | 许可未确认前不进正式包 |
| Open-SWE-Traces | v1.0 候选锁 `6c426da40f5478986398531f065ac5b523fa3ec6`，`config=v1.0`，splits=`openhands+sweagent`；当前 main `435fd8f...` 不作冻结引用 | https://huggingface.co/datasets/nvidia/Open-SWE-Traces | CC BY 4.0；冻结 v1.0 实测 84,066 + 67,153 = 151,219 trajectories；字段为 `trajectory` 而非 main 文档的 `messages`；含 repo/license/language/resolved/instance_id/trajectory_id | W04～W10 多语言首选；按固定 parquet hash 重算，排除 `resolved=-1` 和显式 reasoning/think |
| SWE-rebench-V2 | 不可变 revision 待 D0 解析 | https://huggingface.co/datasets/nebius/SWE-rebench-V2 | Open-SWE-Traces 本体无 `base_commit`；可按 `instance_id` m:1 join 得到 source task 的 repo/base_commit/created_at/license/problem/patch/test | Open-SWE 的必需 source-task/base-commit 补全来源；join 输出也需 hash |
| ContextBench | `1436c28a8eb95496da4ea69ad458b9f8a8eb7d61` | https://github.com/EuniAI/ContextBench | Apache-2.0；1,136 issue-resolution tasks、66 repos、8 languages、人工 Gold Context；不含可直接用作 L0 的发布轨迹 | 仅作同 repo/commit family 的 Knowledge Gold overlay |
| SWE-ContextBench | `31bb04155f52b184bf31b220e3cff0607ac9c953` | https://github.com/jiayuanz3/SWEContextBench | 锁定 tree 无 LICENSE、无 trajectory/conversation/messages 文件 | 拒绝作为 World/L0 基座 |
| SWE-smith-trajectories | 当前数据卡 | https://huggingface.co/datasets/SWE-bench/SWE-smith-trajectories | MIT 标注；5,017 条训练轨迹；任务由 SWE-smith 合成 | 仅作后备，不优先于真实 SWE-Gym 任务 |
| LoCoBench-Agent | `2ab9218e6d46e50ebdbb139442503e5573bc4a5d` | https://github.com/SalesforceAIResearch/LoCoBench-Agent | 仓库 Apache-2.0；声称 8,000 场景、10 语言；数据外置 Google Drive | 只借鉴 natural coding 类别，data.zip 许可/hash 未锁前不导入 |
| When2Call | `ecc8d42388e91ab37e7e737d48e16e8ecea3d1dc` | https://github.com/NVIDIA/When2Call | 通用 direct/tool/request-info/cannot-answer 方法，非软件工程团队资产 | 只借鉴反事实构造方法 |
| LongMemEval-V2 | `2cc8c540bdb87fe6761629b585e727e1c4704520` | https://github.com/xiaowu0162/LongMemEval-V2 | 多轮 Web/enterprise synthetic agent 记忆评测，非 SWE repo 协作历史 | 只借鉴记忆分类与干扰方法 |

## 当前源码合同差距（D0 必须解决）

| 现状 | 对正式评测的影响 | D0 决定 |
|---|---|---|
| `world-schema.ts` 以 World 级扁平数组保存 project/assets | 无法表达 Team、Agent、fixed asset 和 imported Memory 的真实可见范围 | 新建 Formal V2 身份与资产绑定图；旧结构仅作 Pilot |
| `compileWorldFixture()` 将整个 World 的资产复制进 fixture | Team B 或非当前 Agent 资产可能被误算为可见干扰，指标失真 | 正式 compiler 仅接受 `ResolvedVisibleSnapshot` |
| `WORLD_SOURCE` 硬编码为 `project-authored/MIT` | 覆盖真实 dataset/repo license、commit、trajectory 和 transform chain | 正式来源只能由 frozen source registry 解析 |
| Case 与 Gold 同对象保存 | 存在 family、pair role、asset id、route 等 scorer 信息泄漏风险 | 强制拆为 `PublicCaseInput` 与 `PrivateCaseAnnotation` |
| Pilot capability 为 `allowLlmExtract: true` | 运行时可能产生新资产或写回，使后续 Case 与 Variant 不公平 | 正式策略固定 write/extract/reflection/archive 均关闭 |
| mock bridge 只验证 fixture 合同，不执行完整生产权限路径 | 不能证明真实 Session Init 后模型实际看到的资产集合一致 | D0/D5 分别保留 fixture replay 和 real-chain smoke，记录 visible/injection hashes |

## 分阶段仍需实测的字段

- SWE-Gym/OpenHands-SFT 文件和 join 已冻结在 `source-locks/w01-w03/`：SWE-Gym 2,438 行，SHA-256 `60569cea74bb281f7a5579467436a2bc1932c6e0c5f2f7fa0d084392abd9ad97`；OpenHands 491 行，SHA-256 `ea4bf37de020e165c5210bedddeef523d8834a89a35a8c65fec24f76f0eae4f1`；487 条全局唯一精确匹配、4 条歧义排除、0 条未匹配。
- W01～W03 的 72 个 selected base commit 已生成 `license-manifest.jsonl`：72 条根许可证与 5 条 Dask NumPy 条件许可证均为 HTTP 200、SPDX 可识别，当前无 blocker。
- D3：Open-SWE-Traces v1.0 固定 parquet 的逐文件 hash，以及 `openhands=84,066`、`sweagent=67,153` 的本地重算结果。
- D3：SWE-rebench-V2 的不可变 revision 和 `instance_id` join 输出 hash；每个候选 repo 必须同时满足 `unique_tasks>=6` 与 `unique_trajectories>=6`。
- D3：W04 Go 候选 `open-telemetry/opentelemetry-go-contrib` 及 Node/TS 候选 `elastic/synthetics` / `webpack-contrib/copy-webpack-plugin` 的 `resolved=1` 全量密度；未通过前均为 `PENDING`。
- 首次使用 ContextBench overlay 时：验证其与目标 repo、commit family、source task 时间边界完全一致。
- 所有纳入消息的 PII、凭证、绝对路径和未来答案扫描结果。

## W01～W03 候选密度（D0 确定性 join 后）

> 下表只统计已映射到 SWE-Gym 官方 `instance_id` 的合格 source task；每个 task 只保留最长成功轨迹。正式 Team 还要求 history source tasks 与 current-anchor tasks 完全不重叠。

| Repo | 唯一官方 task | 其中 messages≥20 | 决定 |
|---|---:|---:|---|
| `getmoto/moto` | 69 | 69 | W01 Team A，余量大 |
| `python/mypy` | 27 | 27 | W01 Team B；复核 mypy/typeshed 附加许可 |
| `pandas-dev/pandas` | 61 | 60 | W02 Team A；复核 `LICENSES/` 第三方许可 |
| `dask/dask` | 29 | 28 | W02 Team B；复核 NumPy 相关许可 |
| `iterative/dvc` | 23 | 23 | W03 Team A |
| `Project-MONAI/MONAI` | 53 | 50 | W03 Team B；容量足以分离历史与当前锚点 |
| `conan-io/conan` | 12 | 11 | reserve；余量过小 |
| `pydantic/pydantic` | 7 | 7 | reserve；不足以可靠分离两类 source task |

数据角色限制：每个正式 Team 至少锁定 12 个互不重复的 source task，其中 history 至少 6 个、current anchor 至少 6 个；当前问题的 reference patch 不得进入历史。L1 只能从单条 L0 与代码/测试证据抽取；L2 必须由同 repo 的两个以上独立 source task/session 共同支持；Skill 必须由重复、可复验的操作序列提炼；No-tool 必须重新构造并验证当前证据充分。任何一项都不能把上游字段机械改名后直接使用。
