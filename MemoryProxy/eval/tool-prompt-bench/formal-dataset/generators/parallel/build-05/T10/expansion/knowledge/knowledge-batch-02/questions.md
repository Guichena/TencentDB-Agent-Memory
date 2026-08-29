# Sol review questions

- 是否只有两个 pair：`T10-DRAFT-KNOW-002` 目标候选发布资料，`T10-DRAFT-KNOW-003` 目标动态版本代码资料，且各自仓库与目标资料匹配？
- 两个 Positive 的唯一候选链路是否都严格为先发现只读资料能力、再查询资料（`knowledge_tools_list` → `knowledge_tools_call`），并在返回目标事实后停止？
- 每个 pair 的 Positive 与 Negative 是否共享八条上下文消息和完全相同的 query，仅在 `changed_message_index: 8` 追加一个不同 delta？
- `T10-DRAFT-KNOW-002` 的 Negative 是否只补入 `rc-evidence-v3` 与 `two-person-review`，`T10-DRAFT-KNOW-003` 的 Negative 是否只补入 `resolveBuildVersion` 与 `src/pyartifact/build_meta.py`？
- provider-visible 文本是否未出现工具名、资源标识、`knowledge_id`、私有资产 id、Gold 或评测语言，也没有引入审批、发布、构建或代码修改动作？
- manifest 的模型、推理强度、prompt 版本、批次号、实际数量和 Asia/Shanghai 时间是否正确，且 `raw-draft.json` 与 `draft.json` 内容完全一致？
