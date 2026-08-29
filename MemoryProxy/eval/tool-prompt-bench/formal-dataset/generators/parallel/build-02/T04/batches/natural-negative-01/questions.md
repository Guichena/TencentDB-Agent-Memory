# T04 DS03 natural negative draft

- T04-DS03-NN-001：PetClinic 局部 import 对照，区分 Java EE 命名空间替换与 JDK-owned javax 保留。
- T04-DS03-NN-002：PetClinic 编译错误修复，直接恢复 `javax.sql.DataSource`，不添加依赖。
- T04-DS03-NN-003：同步客户端成功文本与 404 异常的控制流解释。
- T04-DS03-NN-004：同步客户端 422 错误测试，区分 HTTP 错误、服务错误与连接失败。
- T04-DS03-NN-005：同步客户端成功列表测试，补充第二元素映射断言。
- T04-DS03-NN-006：Druid Jackson 多态字段拒绝与普通 query 合法兼容的双样例。
- T04-DS03-NN-007：Druid 白名单合法请求的解析字段断言。
- T04-DS03-NN-008：Google Auto 依赖树同层冲突的版本解析。
- T04-DS03-NN-009：Google Auto Maven lifecycle CLI，区分 `test` 与 `integration-test` 阶段。
- T04-DS03-NN-010：Google Auto Maven plugin profile 未激活的根因与 CLI 记录。

## Sol review questions

- 10 例是否均能只凭当前代码、日志和显式要求完成，不依赖历史会话、资产内容或额外查询？
- 是否覆盖 PetClinic、同步 REST consumer、Druid backend、Google Auto 四条项目流？
- 是否分别覆盖 Jakarta/JDK 包边界、同步 HTTP 错误与测试、Jackson 对抗输入与合法请求、Maven dependency/lifecycle/plugin 三种不同根因？
- provider 可见文本是否没有资产 ID、内部工具/路由/端点、Gold/pair/评测标签或其他内部路由术语？
- 每条是否至少保留两个相关但不必要的 author-only 干扰资产，且这些 ID 均来自 T04 冻结池？
