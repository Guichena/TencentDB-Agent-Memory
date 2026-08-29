# Sol review questions

- 确认本批次恰有五组 `T10-DRAFT-SKILL-002` 至 `T10-DRAFT-SKILL-006`，team 为 `T10`、stage 为 `DS05`，且没有改动 trial 文件。
- 确认路由严格符合冻结计划：002、003、005 为 search 后按 id 打开，004 为直接打开已列出资料，006 为打开已列出资料后读取当前 `references/advanced-patterns.md` 资源。
- 已解决 S006 路径歧义：Positive provider-visible delta 明确点名 `references/advanced-patterns.md`，与 private proposal 的 resource path 和完整调用链一致。
- 确认每组 Positive 与 Negative 共享完整上下文和完全相同 query，仅追加一条不同 delta，并且每组 Positive 只保留一个唯一缺口。
- 确认 provider-visible 文本没有内部动作名、Skill 名、私有资产 ID、Gold 或评测语言；这些 author-only 字段可以保留路由与目标。
- 确认 Negative 只提供冻结 adapted 内容支持的事实，没有执行构建、作业或发布，没有改文件，也没有决定正式 Gold。
- 确认五组 source mapping 指向对应冻结 raw Skill；`raw-draft.json` 与 `draft.json` 字节一致，manifest 的模型、推理强度、prompt 版本、Asia/Shanghai 时间、DS05/T10 和计数正确。
- 确认只写入本批次目录，未改 source-material、staging、registry、provider、snapshot 或其他批次路径。
