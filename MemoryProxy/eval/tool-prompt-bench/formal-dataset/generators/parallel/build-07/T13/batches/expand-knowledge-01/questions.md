# Sol review questions

- Positive KNW002 的唯一缺口是否严格限定为 SentryGrid 手册中收敛动作的责任角色和记录入口，没有泄漏分级阈值、演练步骤或修复结论？
- Negative KNW002 是否只补入“由当班事故指挥统一确认收敛动作并记录复盘入口”，并保持两个同域项目的排除项与 query 不变？
- Positive KNW003 的唯一缺口是否严格限定为 BatchProfileCollector 的固定影响节点和边数量，没有泄漏性能成因、火焰图解读或修复建议？
- Negative KNW003 是否只补入 profile/collector.go:88、jobs/runner.go:211 与 2 条边，并保持其他项目排除项与 query 不变？
- 两组自然项目线索是否分别唯一指向事故响应手册和 Nimbus 代码索引，同时使目标结果不在固定资源列表首屏可见？
- 三种 Knowledge fixture 是否保持完整、ready、事实一致，且每组只有一个资源能补足对应缺口？
