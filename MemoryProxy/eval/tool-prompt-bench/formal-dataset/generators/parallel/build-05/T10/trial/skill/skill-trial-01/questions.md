# Sol review questions

- 确认本批次只有一组 `T10-DRAFT-SKILL-001`，Positive 的首动作严格是冻结的已列出目标资料查看动作。
- 确认 Positive 与 Negative 共享全部六条上下文消息和同一 query，仅在 `changed_message_index: 6` 追加一条不同 delta；Positive 保留唯一生命周期流程缺口，Negative 只补齐该缺口。
- 确认 provider-visible 文本没有工具名、Skill 名、私有资产 ID、Gold 或评测语言；目标资产、路由和动作序列只出现在 author-only 字段。
- 确认 Negative 只使用冻结 Maven lifecycle 原文支持的默认 phase 顺序、phase/goal 语义、`-pl/-am` 反应堆选择、`test`/`package` 职责与不进入安装/发布的边界，没有发明额外 Skill 技术步骤。
- 确认 `asset-candidates.json` 未被修改；没有改动 source-material、staging、schema、registry、provider、snapshot 或其他批次目录。
- 确认 `raw-draft.json` 与 `draft.json` 字节一致，manifest 声明模型、推理强度、prompt 版本、DS05/T10 批次信息和实际生成时间正确，且 actual_count 为 1。
