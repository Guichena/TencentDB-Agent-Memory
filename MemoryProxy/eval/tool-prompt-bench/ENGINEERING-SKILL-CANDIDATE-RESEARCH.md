# 工程开发 Task ↔ Skill 候选研究

> 状态：只读来源核验完成；本文只给出候选与实验边界，不修改现有 World 矩阵、formal schema 或机器清单，也不表示这些候选已经具备正式指标资格。

> 2026-08-29 范围修订：Task 1 只评估模型是否在合适时机完成正确的最短 Memory/Skill/Knowledge 工具链。下文“可执行验证”、workspace 测试和 verifier 只记录候选调研材料，正式数据构造不得安装或运行上游项目，也不复现官方 patch。Skill Gold 只根据生成后的信息缺口、实际 Skill 可见性和 MemoryProxy 工具协议审核；仍有歧义时替换 case。

## 1. 研究结论

可以继续补充后端、前端/Web、客户端/CLI/SDK、测试/质量四类工程任务，但不应先导入一批泛化 Skill 再反向编题。更可靠的顺序是：

1. 先固定一段具体工程上下文和一条明确工作；
2. 确认目标 Skill 提供了完成该工作所缺少的专门流程；
3. 人工确认目标 Skill 对当前信息缺口确实有用且最短工具链唯一；存在歧义时替换 case，上游 verifier 或失败材料只可作为不运行的研究背景；
4. 再把相邻 Skill 放进同 Team 作为干扰，并为每个正例登记误调用边界。

本轮得到 18 个候选。其中 9 个可以复用 SkillsBench 的 task/Skill 配对和可选工程材料；DVC 有既有固定 source anchor；另外 8 个只需自行补最小任务上下文，不要求制作和运行完整 fixture。首批最值得实现的是：

- 后端：Spring Boot `javax` → `jakarta` 迁移；
- 前端：D3 股票可视化；
- 客户端：.NET System.CommandLine 新增子命令；
- 测试：Python CI 失败修复；
- 质量：离线依赖漏洞审计。

## 2. 来源与许可边界

| 来源 | 固定 revision | 许可结论 | 本文用法 |
|---|---|---|---|
| [`benchflow-ai/skillsbench`](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af) | `b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af` | 顶层 [Apache-2.0](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/LICENSE)；嵌入 Skill 声明独立许可时继续保留，例如 `react-best-practices` 声明 MIT | 优先复用成套 task、workspace、Skill 和 verifier |
| [`github/awesome-copilot`](https://github.com/github/awesome-copilot/tree/f11a4e441c5ff061b4f8ae37952be8c602e4034e) | `f11a4e441c5ff061b4f8ae37952be8c602e4034e` | 顶层 [MIT](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/LICENSE)；导入时仍需检查 Skill 目录是否另带 LICENSE/NOTICE | 为客户端、SDK、测试补充边界明确的 Skill；fixture 由本项目自行构造 |
| [`openai/skills`](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431) | `49f948faa9258a0c61caceaf225e179651397431` | 按目录核验；本文使用的 `cli-creator`、`playwright` 均带 Apache-2.0 LICENSE | 补充“构建完整 CLI”和真实浏览器工作流候选 |

只有被 Team 正式选中并实际导入的 Skill 包，才保存实际使用的原始文件、资源目录、LICENSE/NOTICE、revision、Git blob、原始 SHA-256 和导入后 SHA-256。未采用的候选只保留研究链接和候选清单，不要求预先完成 source lock。

## 3. 选择规则

一个候选只有同时满足以下条件，才适合作为 Skill Positive：

- Query 描述的是具体工作，不出现目标 Skill 名称；
- workspace 中确实存在需要该 Skill 专门知识解决的问题；
- 能用编译、测试、静态断言、浏览器指标或稳定输出验证结果；
- 同 Team 放入相邻 Skill 后，目标 Skill 的首动作仍然可唯一判定；
- 能构造同资产快照下的 No-tool 或 Wrong-tool 边界，而不是只写一个含关键词的反例。

如果 Skill 自带“任何相关任务都必须调用”之类宿主命令，它不能原样用作公平 Positive。需要先删除宿主强制措辞、保留技术正文并记录导入 diff；否则只作为压力干扰。

## 4. 后端工程候选

### BE-01：Spring Boot 3 Jakarta namespace 迁移

- **具体工作**：把 Java 8/Spring Boot 2.7 用户服务升级到 Java 21/Spring Boot 3.2；本 Case 只要求迁移 `javax.persistence`、`javax.validation`、`javax.servlet` 等 Java EE namespace，同时保留 `javax.sql`、`javax.crypto` 等 JDK namespace。
- **目标 Skill**：`jakarta-namespace`。
- **可执行验证**：沿用 verifier 的 `test_no_javax_validation`、`test_jakarta_persistence_present`、`test_jakarta_validation_present`，再运行 `mvn clean compile` 与 `mvn test`。
- **用途**：**强 Positive**。技术边界窄，输入、修改面和成功条件都明确。
- **误调用边界**：普通 Java 编译错误、JDK 自带 `javax.sql` 导入、仅升级 Maven 插件、仅迁移 `RestTemplate` 时不应调用；当前消息已精确列出文件和替换内容且只需机械编辑时可做 No-tool Negative。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/spring-boot-jakarta-migration/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/spring-boot-jakarta-migration/environment/skills/jakarta-namespace/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/spring-boot-jakarta-migration/verifier/test_outputs.py)。

### BE-02：Spring HTTP 客户端迁移

- **具体工作**：在同一个 Spring Boot workspace 中只改造 `ExternalApiService`，将同步外部调用从 `RestTemplate` 迁移到 Spring 6.1 `RestClient`，保持 GET/POST、泛型响应和错误处理行为。
- **目标 Skill**：`restclient-migration`。
- **可执行验证**：沿用 `test_rest_client_used`，补充或保留 service 单元测试，并运行 `mvn compile`、`mvn test`；静态检查不得残留 `new RestTemplate()`。
- **用途**：**强 Positive**，但必须从原全量迁移任务中切出单一子任务，否则 `jakarta-namespace`、`spring-security-6` 等多个 Skill 同时正确，无法评工具选择正确率。
- **误调用边界**：仅修改 Controller 路由、只替换 `javax` import、响应对象普通字段变更时不应调用；异步 WebClient 任务也不应误选这个同步 RestClient Skill。
- **来源**：[task/workspace](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/spring-boot-jakarta-migration/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/spring-boot-jakarta-migration/environment/skills/restclient-migration/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/spring-boot-jakarta-migration/verifier/test_outputs.py)。

### BE-03：阻断 Druid 恶意 JSON 绕过

- **具体工作**：修复 Apache Druid 0.20.0 sampler endpoint 中空字符串 key 绕过 JavaScript 安全检查的问题；恶意 payload 必须被拒绝，合法 sampler 请求继续成功。
- **目标 Skill**：`jackson-security`。
- **可执行验证**：沿用 `test_patches_exist`、`test_patches_applied`、`test_legitimate_requests_still_work` 和 `test_cve_2021_25646_exploits_blocked`。
- **用途**：**Positive/高难度压力样本**。它适合测试模型是否会在普通 Java Skill 与 JSON 反序列化安全 Skill 中选对后者；资源消耗高，不建议作为第一批 smoke case。
- **误调用边界**：普通 Jackson DTO 字段映射、无安全语义的未知字段容错、格式化 JSON、只调整响应序列化时不应调用。若 Query 只让解释 CVE 而不要求改代码，应改为 Knowledge/Memory Gold，而不是 Skill Positive。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-druid-loophole-cve/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-druid-loophole-cve/environment/skills/jackson-security/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-druid-loophole-cve/verifier/test_outputs.py)。

### BE-04：Google Auto Maven 构建修复

- **具体工作**：在固定 BugSwarm `google/auto` 失败快照中定位 Travis/Maven 构建失败，记录根因、生成并应用 unified diff，使对应 passing build 脚本成功。
- **目标 Skill**：候选池为 `maven-build-lifecycle`、`maven-dependency-management`、`maven-plugin-configuration`；只有读完失败日志和 passing diff 后才能指定唯一 Gold。
- **可执行验证**：沿用 `test_note_exists`、`test_diff_exists` 和 `test_build_success`；补充检查 diff 能由 `git apply --check` 接受。
- **用途**：**条件 Positive/优先核验任务**。task、失败 workspace 和 build verifier 很强，但当前 task 文本没有说明根因属于 lifecycle、dependency 还是 plugin；不能预先把 `maven-build-lifecycle` 写死成 Gold。
- **误调用边界**：依赖版本冲突应选 dependency Skill，compiler/surefire 配置应选 plugin Skill，阶段/profile/goal 顺序才选 lifecycle Skill；错误已精确定位为一行且修复值已给出时应是 No-tool Negative。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-google-auto/task.md) / [lifecycle Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-google-auto/environment/skills/maven-build-lifecycle/SKILL.md) / [dependency Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-google-auto/environment/skills/maven-dependency-management/SKILL.md) / [plugin Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-google-auto/environment/skills/maven-plugin-configuration/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-google-auto/verifier/test_outputs.py)。

## 5. 前端与 Web 候选

### FE-01：D3 股票气泡图与联动表格

- **具体工作**：读取固定 CSV，生成离线单页 D3 应用；50 个股票以市值控制气泡大小、按行业聚类并带 legend/tooltip，气泡与表格行双向联动。
- **目标 Skill**：`d3-visualization`。
- **可执行验证**：沿用浏览器 verifier，检查输出目录、bubble/table 渲染、ETF 与非 ETF tooltip、双向联动、市值格式、行业聚类、legend 完整性和数据一致性。
- **用途**：**最强前端 Positive**。目标库、数据输入和 DOM 行为都可以确定性验证。
- **来源内差异**：task 明确要求 D3 v6，Skill frontmatter 也写 v6，但正文的通用默认值写成 `d3@7.9.0`。正式导入只需把 Skill 正文统一成 v6 并保存适配 diff；不需要为 Task 1 升级或运行完整 workspace。
- **误调用边界**：仅输出 Markdown 表格、CSV 汇总、服务端生成静态数字列表时不应调用；普通 React 页面布局也不应因为出现“数据”或“图形”词面而调用。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/data-to-d3/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/data-to-d3/environment/skills/d3-visualization/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/data-to-d3/verifier/test_outputs.py)。

### FE-02：React/Next.js 性能修复

- **具体工作**：在电商站点中修复购物车重复渲染、compare 页面首包过大和 API route 串行等待，同时保持商品数据、购物车和 advanced tab 行为不变。
- **目标 Skill**：`react-best-practices`；`browser-testing` 只承担修复前后测量。
- **可执行验证**：沿用 `test_memoization_limits_rerenders`、`test_compare_page_initial_bundle_small`、`test_cart_add_item`、`test_compare_page_works`、`test_real_product_data_rendered` 和 testid 保留检查。
- **用途**：**适配后 Positive**。原 Skill description 含 “MUST invoke before ANY React/Next.js code” 强制措辞，会人为抬高调用率并扩大误调用，不能原样进入正式资产；需做有记录的中性化导入版。
- **误调用边界**：只改静态文案、CSS 颜色、图片 alt、纯类型错误时不应调用性能 Skill；仅要求采集运行时指标而不改代码时，应选 `browser-testing` 而非 React 优化 Skill。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/react-performance-debugging/task.md) / [React Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/react-performance-debugging/environment/skills/react-best-practices/SKILL.md) / [测量 Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/react-performance-debugging/environment/skills/browser-testing/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/react-performance-debugging/verifier/test_outputs.py)。

### FE-03：页面 CLS 与主题闪烁诊断

- **具体工作**：启动 Next.js 商城，复现主题首屏闪烁、字体 FOIT 和图片尺寸缺失导致的 CLS；先生成测量基线，再修复并复测。
- **目标 Skill**：`browser-testing`；真正的代码修复可以把 `react-best-practices` 设为后续允许工具，而非首个 Gold。
- **可执行验证**：沿用 `test_no_theme_flicker`、`test_cls_acceptable`、`test_app_responds_200`、`test_products_render`、`test_foit_prevented`、`test_images_no_cls`；额外保存修复前后 CLS JSON。
- **用途**：**诊断 Positive/多步 Case**。首动作适合测 Skill 调用；完整修复允许后续再选 React Skill。
- **误调用边界**：只检查静态 JSX、改 className、无需启动浏览器的样式 token 变更不应调用；若上下文已经提供可复现截图、确切节点和根因，只需局部编辑，可构成 No-tool Negative。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-visual-stability/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-visual-stability/environment/skills/browser-testing/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-visual-stability/verifier/test_outputs.py)。

## 6. 客户端、CLI 与 SDK 候选

以下候选没有现成 SkillsBench 成套任务。应自己制作 50～200 行左右的最小 fixture，冻结依赖和测试，不需要引入大型真实产品仓库。

### CL-01：为 .NET CLI 新增 `projects export` 子命令

- **具体工作**：在 .NET 8 `System.CommandLine` 应用中新增 `projects export`；接收必填 `--team`、可选 `--format json|csv`、`--output`，通过 `ParseResult` 读取值，支持 cancellation，并把命令注册到 `projects` group。
- **目标 Skill**：`system-commandline-cli`。
- **可执行验证**：`dotnet test` 检查命令树和 handler；运行 `tool projects export --team t1 --format json --output out.json` 应返回 0 和稳定 schema；缺少 `--team` 返回解析错误；`--help` 展示 group、option 和说明。
- **用途**：**强 Positive，自建 fixture**。Skill 的触发条件非常具体，适合与普通 C#、Web API、shell 命令说明形成清晰边界。
- **误调用边界**：非 .NET CLI、Bash/PowerShell 脚本、ASP.NET endpoint、仅修改 README 中的命令示例时不应调用。
- **来源**：[Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/system-commandline-cli/SKILL.md)；来源仓库 MIT。

### CL-02：VS Code 扩展新增侧边栏刷新命令

- **具体工作**：在小型 TypeScript 扩展中增加 `_project.refresh#sideBar`，配置 title、icon、`view/title` group/when，阻止其出现在 Command Palette，并在 `activate()` 中注册 handler。
- **目标 Skill**：`vscode-ext-commands`。
- **可执行验证**：`npm test` 静态校验 `package.json` contributes/menu；mock `vscode.commands.registerCommand` 验证只注册一次、handler 调用 provider refresh；`npm run package` 或 TypeScript compile 通过。
- **用途**：**强 Positive，自建 fixture**。具体工作同时覆盖客户端 manifest 和运行时代码。
- **误调用边界**：用户只是运行 VS Code 内置命令、修改扩展普通业务函数、编辑 keybinding 文档时不应调用；普通 Web 菜单按钮也不应触发。
- **来源**：[Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/vscode-ext-commands/SKILL.md)；来源仓库 MIT。

### CL-03：Microsoft Graph SDK 分页用户同步

- **具体工作**：在 TypeScript 服务中用 Graph SDK 实现 `syncUsers()`：采用适合后台服务的凭据、`$select` 限定字段、遍历 `@odata.nextLink`，遇到 429 尊重 `Retry-After`，不得硬编码 secret。
- **目标 Skill**：`msgraph-sdk`。
- **可执行验证**：用 mock request adapter 固定两页响应和一次 429；Jest 断言两页全部写入、请求含 `$select`、延迟值来自 `Retry-After`、secret 从环境注入；`tsc --noEmit` 通过。
- **用途**：**Positive，自建 fixture**。可与同 workspace 的“只给现有同步器补 Jest 单测”组成 paired tool-selection Case：前者选 Graph Skill，后者选 Jest Skill。
- **误调用边界**：普通 REST API、静态用户数组处理、不涉及 Microsoft 365 的 OAuth、只修改已有 mock 数据时不应调用。
- **来源**：[Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/msgraph-sdk/SKILL.md) 及同目录 references；来源仓库 MIT。

### CL-04：从固定 OpenAPI 构建可复用 CLI

- **具体工作**：给一个本地 project service OpenAPI fixture 构建 `teamctl`：包含 `--help`、`--json doctor`、`projects list --limit`、`projects get`、带 dry-run 的窄写操作和只读 raw request；认证从环境变量读取且错误不得泄露 token。
- **目标 Skill**：OpenAI `cli-creator`。
- **可执行验证**：fixture HTTP server 下运行 help/doctor/list/get/dry-run/raw GET；断言稳定 JSON envelope、分页上限、错误 JSON、token 脱敏，并从另一个工作目录验证 PATH 安装。
- **用途**：**第二批 Positive，自建 fixture**。它测的是“从接口材料构建完整持久 CLI”，不适合拿现有 CLI 的单个 bug 直接配对。
- **误调用边界**：一次性脚本、现有 CLI 单个参数修复、只写 curl 示例、仓库内短数据转换不应调用。
- **来源**：[Skill](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/cli-creator/SKILL.md) / [Apache-2.0 LICENSE](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/cli-creator/LICENSE.txt)。

### CL-05：Qdrant Python SDK 本地向量检索

- **具体工作**：用 Python Qdrant client 的本地模式创建 collection、upsert 带 payload 的向量、按 payload filter 做相似检索，并保证重复 upsert 幂等。
- **目标 Skill**：`qdrant-clients-sdk`。
- **可执行验证**：pytest 在临时目录或 memory mode 运行；断言 collection schema、点数、filter 命中、相似度排序和二次 upsert 后数量不变。
- **用途**：**低优先级 Positive 或团队干扰**。当前 Skill 本体较薄，并把具体示例交给在线 snippets search；未冻结对应 snippet 前，正式 Positive 的信息增益不足。
- **误调用边界**：纯向量数学、FAISS/pgvector、Qdrant 服务部署与运维、只讨论 embedding 生成时不应调用。
- **来源**：[Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/qdrant-clients-sdk/SKILL.md)；来源仓库 MIT。若升级为 Positive，需额外冻结实际使用的官方 SDK 文档/snippet。

### CL-06：DVC `import-url --no-exec` 参数透传

- **具体工作**：在 DVC `import-url` command 新增 `--no-exec`，保持 command layer → repo layer 两层参数透传，默认行为不变，并补齐单元与功能回归测试。
- **目标 Skill**：基于固定 DVC commit、issue、patch touched files 和测试证据生成窄边界 `dvc-cli-option-contract`；OpenAI `cli-creator` 只作为语义干扰。
- **可执行验证**：使用已锁 `iterative__dvc-4075`、base commit `a2f1367a9a75849ef6ad7ee23a5bacc18580f102` 和原始测试；断言 parser 接受 flag、command/repo 两层都收到值、flag 缺省时兼容旧行为。reference patch 只供 verifier，不进入模型可见资产。
- **用途**：**证据化作者 Skill 的 Positive，尚需补 Skill**。source anchor 已足够真实，只需从证据生成窄 Skill、人工复核并导入；不要求完成 DVC 代码修改或运行其测试。不能把 `cli-creator` 错当目标，因为后者明确用于从 API/脚本构建一个新的持久 CLI，而这里是在成熟 CLI 中增加一个参数。
- **误调用边界**：新建独立 CLI 才可能选择 `cli-creator`；普通 DVC pipeline 使用问题、只改帮助文案、当前消息已给出所有 touched files 和精确 patch 时不应调用 `dvc-cli-option-contract`。
- **来源**：本项目固定 source pack [`W01-W03-SOURCE-PACK-SELECTION.md`](source-locks/w01-w03/W01-W03-SOURCE-PACK-SELECTION.md) 的 W03 Team A，任务 `iterative__dvc-4075` / base commit `a2f1367a9a75849ef6ad7ee23a5bacc18580f102`；通用 CLI 干扰来源为 OpenAI [`cli-creator`](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/cli-creator/SKILL.md)。

## 7. 测试与质量候选

### TQ-01：Python CI 失败定位与修复

- **具体工作**：在真实失败构建快照中分析 Python 测试/配置错误，写 `failed_reasons.txt`，生成标准 unified diff，应用修复并重跑 passing build。
- **目标 Skill**：`testing-python`。
- **可执行验证**：沿用 `test_note_exists`、`test_diff_exists`、unidiff 解析和 `test_build_success`。
- **用途**：**条件 Positive**。适合在同 Team 放入 `pytest-coverage`、`analyze-ci` 等近义干扰，测试模型是否把“修失败”误当“提覆盖率”；但必须先从失败日志/通过提交 diff 证明根因确实需要 pytest 测试知识。当前 task 只说“构建失败”，本身不足以证明 `testing-python` 是唯一 Gold。
- **来源内差异**：`testing-python` 正文混有 FastMCP、asyncio mode、inline snapshot 等项目专属规则，未必适用于 AgentOps 构建快照。正式导入应只保留通用 pytest 部分，或将目标改为经过日志核验后更匹配的 Skill，并保存裁剪 diff。
- **误调用边界**：测试已经通过而任务只要求提覆盖率时应选 coverage Skill；失败根因已在当前消息中精确给出、只需改一个配置值时可做 No-tool Negative；普通 Python 功能实现不应因存在 pytest 而调用。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-agentops/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-agentops/environment/skills/testing-python/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/fix-build-agentops/verifier/test_outputs.py)。

### TQ-02：把指定 Python 模块覆盖率提升到 100%

- **具体工作**：提供一个 80～150 行、带边界分支和现有测试的小模块；要求读取 annotate 报告，只为未覆盖路径补原子测试，不修改生产行为。
- **目标 Skill**：`pytest-coverage`。
- **可执行验证**：`pytest --cov=<module> --cov-fail-under=100`，并运行 mutation/snapshot 断言确认没有通过删除分支、`pragma: no cover` 或改生产逻辑作弊。
- **用途**：**强 Positive，自建 fixture**。Skill 很短、目标单一，特别适合评估 token 精简后的触发能力。
- **误调用边界**：修已有失败、普通新增功能、只询问当前覆盖率、非 pytest 项目时不应调用；“写一个测试”不自动等于“提升到 100%”。
- **来源**：[Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/pytest-coverage/SKILL.md)；来源仓库 MIT。

### TQ-03：为真实 Web 流程生成并跑通 Playwright 测试

- **具体工作**：复用 `react-performance-debugging` 或 `fix-visual-stability` workspace，要求为“加载商品 → 加入购物车 → 打开 compare advanced tab”生成一条 Playwright TypeScript 测试，必须先实际探索页面再写测试。
- **目标 Skill**：`playwright-generate-test`；`webapp-testing` 作为近义干扰，或改用 OpenAI `playwright` 构造“只探索、不产出 test file”的配对任务。
- **可执行验证**：启动固定站点，`npx playwright test <generated-file>` 通过；静态断言使用稳定 role/testid selector，不含硬编码 sleep；失败时 trace/screenshot 路径存在。
- **用途**：**Positive，自建 query + 复用 workspace**。它能区分“生成持久测试文件”和“临时浏览器探索”两个相邻 Skill。
- **误调用边界**：纯函数单测、Jest component test、静态 HTML 检查、只要求临时截屏时不应选测试生成 Skill；只探索页面时应选 browser-testing/playwright 而非生成测试。
- **来源**：[生成测试 Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/playwright-generate-test/SKILL.md) / [Web 测试 Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/webapp-testing/SKILL.md) / [OpenAI Playwright Skill](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/playwright/SKILL.md) / [Apache-2.0 LICENSE](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/playwright/LICENSE.txt)。

### TQ-04：TypeScript SDK 的异步与错误路径单测

- **具体工作**：在 CL-03 Graph fixture 的实现已经正确时，仅补 Jest 测试：两页分页、429 retry、异常传播、mock reset 和无 secret 日志。
- **目标 Skill**：`javascript-typescript-jest`。
- **可执行验证**：`npm test -- --runInBand`、coverage threshold；mutation 一个 nextLink 分支后测试必须失败；`tsc --noEmit` 通过。
- **用途**：**paired Positive**。它与 CL-03 共用 workspace，但通过任务阶段区分目标：实现 SDK 逻辑调用 Graph Skill，给正确实现补测试调用 Jest Skill。
- **误调用边界**：实现 Graph API 业务逻辑、Playwright 浏览器 E2E、非 JS/TS 测试、只修 TypeScript 类型错误时不应调用。
- **来源**：[Skill](https://github.com/github/awesome-copilot/blob/f11a4e441c5ff061b4f8ae37952be8c602e4034e/skills/javascript-typescript-jest/SKILL.md)；来源仓库 MIT。

### TQ-05：离线依赖漏洞审计

- **具体工作**：对固定 `package-lock.json` 和固定 Trivy DB 做离线扫描，仅输出 HIGH/CRITICAL，生成字段、顺序和内容稳定的 `security_audit.csv`。
- **目标 Skill**：`trivy-offline-vulnerability-scanning`。
- **可执行验证**：沿用 CSV header/非空字段/CVE 格式检查，并与固定 ground truth 做顺序无关的精确比较。
- **用途**：**强 Positive**。离线数据库消除了在线 CVE 更新造成的结果漂移，特别适合公平评测。
- **误调用边界**：一般 `npm outdated`、依赖升级、许可证审计、源代码 SAST、容器部署时不应调用；当前上下文已给出完整扫描 JSON、只要求转 CSV 时应选 reporting Skill 或 No-tool。
- **来源**：[task](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/software-dependency-audit/task.md) / [Skill](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/software-dependency-audit/environment/skills/trivy-offline-vulnerability-scanning/SKILL.md) / [verifier](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/software-dependency-audit/verifier/test_outputs.py)。

## 8. 推荐的团队资产组合

为了测试“一个真实团队同时维护多个工程项目”，可以把候选按下面四个资产包构建。它们不是新的正式 World 编号，只是供现有矩阵后续吸收的研究分组。

| 资产包 | 目标任务 | 同 Team 近义干扰 | 主要选择题 |
|---|---|---|---|
| Backend service | BE-01～BE-04 | `jakarta-namespace`、`restclient-migration`、`spring-security-6`、`jackson-security`、三种 Maven Skill、普通 Java Skill | namespace、HTTP client、安全反序列化、构建根因能否分开 |
| Web product | FE-01、FE-02、FE-03 | `d3-visualization`、中性化 `react-best-practices`、`browser-testing`、Playwright test Skill | 构建图表、优化代码、运行时测量能否分开 |
| Developer clients | CL-01～CL-06 | System.CommandLine、VS Code command、Graph、CLI creator、Qdrant、DVC 专属 Skill | 具体平台/SDK 能否选对，泛 CLI Skill 是否过度触发 |
| Quality engineering | TQ-01～TQ-05 | pytest、coverage、Jest、Playwright、Trivy | 修失败、提覆盖、单测、E2E、安全审计能否分开 |

同一 Case 的正式干扰池建议保持 6～10 个 Skill，而不是把全部候选塞入所有 Team。公平性来自“同域相似干扰”，不是 Skill 数量本身。

## 9. 建设优先级

### 第一批：直接复用现成 task/Skill 与工程上下文

1. BE-01 `jakarta-namespace`
2. FE-01 `d3-visualization`
3. TQ-05 `trivy-offline-vulnerability-scanning`
4. CL-01 `system-commandline-cli`

前三个可以直接复用固定 task/Skill 与工程上下文，CL-01 只需补一段明确的 .NET CLI 项目背景。它们技术域不同、目标 Skill 边界相对清楚，可以最快检验新 Prompt 是否跨语言、跨工程类型仍能正确选工具。FE-01 必须先处理 D3 v6/v7 描述差异。

### 第二批：制作小型客户端 fixture

1. CL-02 `vscode-ext-commands`
2. CL-03 `msgraph-sdk`
3. TQ-04 `javascript-typescript-jest`
4. TQ-02 `pytest-coverage`

其中 CL-03 与 TQ-04 应使用同一 workspace 制作两条阶段不同的 Positive，可直接测工具选择正确率。

### 第三批：多步或存在偏置风险的压力样本

- BE-03 Druid 安全修复：真实但运行成本高；
- BE-04 Maven 构建：先用失败日志和 passing diff 判定 lifecycle/dependency/plugin 中唯一 Gold；
- TQ-01 Python CI 修复：先核对失败日志和 passing diff，再决定 `testing-python` 是否真是唯一 Gold；
- FE-02 React 性能：必须先中性化强制调用措辞；
- FE-03 视觉稳定性：需要明确首动作和后续允许工具；
- CL-04 完整 CLI：任务面较宽，先在第二批验证 Skill 注入链路；
- CL-05 Qdrant：需额外冻结实际 SDK 文档/snippet。
- CL-06 DVC：需先生成并审核 repo 专属 Skill；`cli-creator` 只能做干扰。

## 10. DVC、Qdrant、Jest 的风险结论

| 候选 | 当前是否可进主指标 | 主要风险 | 达标条件 |
|---|---|---|---|
| DVC `--no-exec` | 否 | 没有现成窄 Skill；若把 reference patch 写入 Skill，会把代码答案泄漏给模型；泛 `cli-creator` 与任务类型不符 | 只用 issue、base code、已有 CLI 约定和测试生成流程 Skill；reference patch 仅供 verifier；验证默认行为与两层参数透传 |
| Qdrant SDK | 否 | `qdrant-clients-sdk` 正文偏薄，并依赖在线 snippet search；SDK 版本和远端服务会造成漂移 | 固定官方 client revision/包版本和实际使用 snippet；使用本地/内存实例；冻结 collection schema、payload、查询结果和失败重试 |
| Jest | 否 | `javascript-typescript-jest` 是通用写测试指南，几乎任何 TS 测试请求都可能触发；若实现与测试同时缺失，Graph Skill 和 Jest Skill 都合理 | workspace 先有正确实现，Query 明确只补单测；用 mutation 验证测试有效；与 Graph 实现 Case 共 workspace 但分阶段 |
| Maven build | 否，直至日志核验 | 一个 task 同时附带 lifecycle、dependency、plugin 三个 Skill，task 文本未暴露根因 | 从失败日志和 passing diff 建立唯一映射，按根因只标一个首调用 Gold，其余作为近义干扰 |

这些候选都可以保留，但“已有真实任务或知名 Skill”不等于“已经是公平 Positive”。只有完成右侧达标条件并被具体 Team 采用后，才登记实际导入来源并进入主指标。

## 11. 正式化前检查

- [ ] Query 不含 Skill 名称和 benchmark 原提示词；
- [ ] Query、当前上下文、Skill 版本与可见干扰均已冻结；若使用 workspace/verifier 作为判断依据，再额外记录其版本；
- [ ] 目标 Skill 原文与导入版 diff 可追溯；
- [ ] 每个 Positive 有同快照 paired Negative；
- [ ] 每个 Skill 登记 `use_when` 与 `do_not_use_when`，并人工审核误调用边界；
- [ ] 多步 Case 记录首动作 Gold、后续允许 Skill 和停止点；
- [ ] 结果保存 effective prompt、注入 token、首次工具序列、选中 Skill、raw response 和运行环境；不运行后续 coding/verifier；
- [ ] 只有完成生产 MemoryProxy 导入、可见性和真实链路检查后，Case 才能标记 `metric_eligible=true`。
