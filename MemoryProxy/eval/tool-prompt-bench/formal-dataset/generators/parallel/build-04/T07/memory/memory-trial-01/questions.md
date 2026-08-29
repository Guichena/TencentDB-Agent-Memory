# T07 memory trial 01

Sol 修正已关闭：

- L1-03 已改为 partner-openapi-client 的生成客户端重试归属与运行时边界当前决策，并引用 L0-08 的真实消息。
- L1-11 已改为带 valid_from 的 active 服务到服务认证决策；L1-01 保留为 superseded 认证替代项并指向 L1-11。
- L2-01 已改为 partner OpenAPI generated-client 场景；L2-03 已改为 Qdrant ingestion cutover chronology。
- 全部 L1 已补齐 type/status/valid_from（superseded 项补 superseded_by）；全部 L2 已补齐稳定 path、非泄漏 summary 和完整 content。

候选内容仍全部为 synthetic，未引入外部来源；最终 route 与正式 Gold 仍由 Sol 负责。
