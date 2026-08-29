本扩批包含 5 个 memory pair，提交 private_proposal，不设置 Gold。

复核重点：Harbor/Meridian 使用 memory search，Pactline 使用 conversation search，Prism 在明确类型与日期窗口下使用 atomic query，Atlas 使用带可见索引路径的 scene read。每个正例只保留一个事实缺口，命中目标后停止；负例仅在 delta 补足该事实。
