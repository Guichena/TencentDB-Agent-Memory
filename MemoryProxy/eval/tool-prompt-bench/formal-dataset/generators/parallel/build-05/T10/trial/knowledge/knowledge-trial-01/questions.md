# Sol review questions

- 是否只有一个 pair：`T10-DRAFT-KNOW-001`，且 Positive 的唯一候选目标是匹配仓库的只读代码图，链路严格为 `knowledge_tools_list` → `knowledge_tools_call`？
- Positive 与 Negative 是否共享八条上下文消息和完全相同的 query，并仅在 `changed_message_index: 8` 追加不同 delta？
- Positive 是否只保留 `attachSources` 的 phase 缺口，Negative 是否只补入冻结事实 `verify`，没有引入 POM 修改、构建执行、依赖分析或发布建议？
- 所有 provider-visible 文本是否未出现资源标识、知识工具名、Skill 名、`knowledge_id`、私有资产 id、Gold 或评测语言？
- manifest 的模型、推理强度、prompt 版本、批次号、实际数量和 Asia/Shanghai 时间是否正确，且 raw-draft 与 draft 内容一致？
