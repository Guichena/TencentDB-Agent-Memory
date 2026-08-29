# T02 DS03 asset-world batch self-check

## Uncertainty

- L1 的 6 条近邻干扰记忆均为团队内部的保守偏好、决定或事实，未引用冻结输入之外的事实；它们只用于近域区分。
- L2 场景仅汇总已有对话脉络，不把场景摘要写成个案答案或外部项目结论。
- code graph fixture 只保留冻结输入给出的目标符号、文件和行号，并加入少量结构性邻接节点；wiki fixture 原样保留冻结政策摘要。

## Self-check

- [x] JSON 可解析；draft、manifest 均为单个 JSON 对象。
- [x] 精确数量：L0=10、L1=15、L2=4、L3=1、knowledge=3，总数=33。
- [x] 每个 L0 有恰好 12 条消息，角色从 user 开始并严格 user/assistant 交替。
- [x] L0 使用 10 个要求的 ID 各一次；没有在对话正文提及资产 ID。
- [x] L1 使用全部 9 个要求目标各一次，另有 6 个唯一近域干扰项；9 条目标事实、日期、runtime_type、formal_type 与冻结输入一致。
- [x] 旧差分记忆为 superseded，并以线性去趋势记忆作为 superseded_by；其余 L1 为 active。
- [x] 所有 L1 source_session_ids 均引用现有 T02 L0；code_evidence_locators 与 test_evidence_locators 均为空数组。
- [x] L2 使用全部 4 个精确路径和 ID；每个 supporting_session_ids 至少包含 2 个现有 T02 L0。
- [x] L3 使用精确 ID，stability 为 team；正文为长期数据计算偏好，长度在 80–220 个中文字符内。
- [x] code_graph fixtures 保留目标 Resampler/pandas/core/resample.py:119 与 Repartition/dask/dataframe/dask_expr/_repartition.py:29；tools 含 node 和合理干扰项。
- [x] wiki fixture 保留“Compare partition row-count spread ...”冻结政策结果；tools 含 search。
- [x] L0/L2/L3 可见叙述未包含 provider/model 名称、Gold、benchmark/scoring 语言、asset ID、工具路由答案或评分语言；L1 与 wiki fixture 仅保留冻结输入要求的原文事实。
- [x] graph snapshot 的非目标节点未添加冻结输入之外的真实文件行号。
- [x] 所有项目决策明确为团队内部合成记录，不声称是上游仓库事实；未执行上游动作、测试或评测。
- [x] 未读取或复制 T01 内容；输入仅来自冻结的 T02 input-pack、input-pack.lock 和 source-pack.lock。
