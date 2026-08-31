# T14 Sol Review

- Team: T14 云原生交付
- Split: hidden_test
- Cases: 40（15 Positive、15 paired No-tool Negative、10 natural Coding Negative）
- Pair 单变量：15/15 已核对。
- Positive 路由：10 条 search/discovery，5 条 direct。
- Skill 来源：Aidas-dev/k8s-agent-skills @ 077702b44a5367fde0496db6a91b015f1416312a（MIT）与 fluxcd/agent-skills @ e7e95ef1648a72f5276db6f98b799c5974ea846f（Apache-2.0）；16 个 Skill 正文与 1 个引用资源均按冻结哈希字节一致导入。
- 资产闭环：10 L0（每个 12-20 条消息）、16 L1、5 L2、1 L3、16 Skill、3 Knowledge。
- 注入边界：L0/L1 不注入，L2 仅 path+summary，L3 全文；Positive 答案不在首屏注入中。
- Gold：由 Sol 根据生产 Memory、Skill、Knowledge 路由源码重建；Luna private_proposal 仅作为复核输入。
- Provider：仅序列化 caseId、language、contextMessages、query；身份、资产、pair、Gold 和判分字段均不进入 provider。
