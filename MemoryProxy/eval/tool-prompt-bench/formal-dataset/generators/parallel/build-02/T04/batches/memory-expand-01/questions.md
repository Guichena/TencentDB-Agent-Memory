# Sol review questions for t04-memory-expand-01

- MEM-02：Positive 是否只缺历史会话确认的同步客户端行为等价清单；Negative 是否只补足请求构造、集合/错误映射、异常分类和阻塞式控制流？
- MEM-03：是否将 Maven plugin 的 execution、goal 重复绑定、参数继承与 profile 覆盖，与 dependency convergence 和 lifecycle 阶段清楚区分？Negative 是否只补足插件配置诊断值？
- MEM-04：Positive 是否只缺历史 Druid Jackson 安全边界；Negative 是否只补足目标模块入口白名单、未知类型拒绝、普通对象兼容和旁边模块隔离？
- MEM-05：是否将 Maven dependency convergence 的直接声明、dependencyManagement、传递路径、scope 与临时 exclusion 边界，与 plugin 故障清楚区分？
- MEM-06：Positive 是否只缺历史 Spring 迁移场景的整合关系；Negative 是否只补足项目归属、验证先后和不可跨边界归因规则？
- 五组 provider-visible 文本是否没有泄漏内部资产标识、路由/工具名、端点、Gold 或配对标签，并且合成记忆没有被表述为外部源码事实？
