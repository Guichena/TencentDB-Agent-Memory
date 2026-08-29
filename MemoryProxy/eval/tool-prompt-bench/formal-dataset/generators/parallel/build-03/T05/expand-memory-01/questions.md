# T05 DS05 Memory 扩批自检

本批次生成 T05-MEM-BP-02 至 T05-MEM-BP-06 共 5 组 memory 正负 pair，分别覆盖商品页 CLS rollout、控制台重渲染归因、结账定位器约定、Canvas/SVG 历史决策和报告预览事故场景。每组正负例共享八条上下文与同一 query，仅第九条 delta 改变；正例只保留 blueprint 指定的信息缺口，负例只补足该缺口。路由候选严格按 input-pack，目标资产与至少两个同域干扰均置于 author-only 字段。

已生成完整冻结命名空间：10 个 L0 session（每个 12 条消息）、16 个 L1（均引用现有 message_id，含 active 与 superseded）、4 个 L2（每个引用两个 session）和 1 个团队 L3。T05-L0-01 保留 pilot negative 的坐标结论；所有内容为合成 memory，external_source_ids=[]。L3 仅描述稳定团队偏好，不含任何 case 答案。provider 可见文本未使用禁止词、工具名或资产 id；未写入 staging 或最终 Gold。


