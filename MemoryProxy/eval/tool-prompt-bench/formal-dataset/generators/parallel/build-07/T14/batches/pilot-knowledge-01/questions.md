# Sol review questions

- Positive 的唯一缺口是否严格限定为 Borealis Platform 固定代码索引中的符号文件和行号，没有隐含策略阈值、依赖关系或修复结论？
- Negative 是否只补入 `internal/helm/rollback_guard.go:117`，并保持 Meridian Fleet、Forge Build 排除项和 query 不变？
- Borealis Platform、Helm 回滚护栏和发布路径这些自然线索，是否足以在三个 ready 资源中唯一选择 Borealis 代码索引，同时避免首屏摘要直接给出该定位？
- 三个 Knowledge fixture 是否完整、ready、事实一致，并分别使用 Borealis search、Meridian wiki search 与 Forge impact？
