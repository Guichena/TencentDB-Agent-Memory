# Sol review questions

- 确认五个 Positive 的唯一缺口分别对应冻结技能正文；S2 首动为 `skill_view`，S3-S5 首动为 `skill_search` 后 `skill_view_by_id`，S6 严格为 `skill_view` 后读取 `references/notebook-structure.md`。
- 确认每个 Negative 的新增消息独立提供足够的固定流程，route 均为 `none`，且每对消息只在最后追加一条 delta、`changed_message_index` 等于共享消息长度。
- 确认 S6 的 Positive 缺口确实包含 notebook-structure.md 的字段级要求，而不是只缺主页面的 notebook 工作流。
- 确认五个 `external_source_ids` 与对应冻结来源完全匹配，source_fact_map 定位到正文或结构参考，distractor 仅为作者侧信息。
- 确认 provider-visible 文本未泄漏资产标识、动作名或生成/评分元语言。
