# T06 Knowledge pilot review

批次 `t06-pilot-knowledge-01` 仅包含 `T06-KNOW-BP-01` 一组 pair，内容为 synthetic。共享上下文固定 8 条，`changed_message_index` 为 8，Positive 与 Negative 使用完全相同的 query。

- Positive 唯一缺少 Harbor CLI 中 ExportCommand 的定义与注册结果，允许链路为 `knowledge_tools_list` → `knowledge_tools_call`。
- Negative 的补充消息同时给出定义文件、注册位置和核对边界，因此不应发生调用。
- ImportCommand、StatusCommand 以及两个邻域项目索引作为同域干扰；provider-visible 文本未包含内部资源标识、发现协议名称或 Gold 字段。
- 未使用外部来源；无待 Sol 决策。
