# 开源 Skill 与评测靶子配对方案

> 状态：候选来源与第一批配对已完成只读核验；本文是候选研究记录。正式拓扑以 `TASK1-DATASET-CONSTRUCTION-RUNBOOK.md` 的一个 Space、T01 至 T10 为准。冻结基线已有 T01 的 5 组检索压力 pair、10 条正式试点 case，但完整 400 条主集合和真实链路指标资格尚未完成。

> Task 1 范围：正式实验运行到第一个目标资产响应，检查完整最小 Memory/Skill/Knowledge 调用链，不执行后续 coding，也不验证最终任务完成度。上游 workspace/verifier 只作历史研究资料，不运行。若两个 Skill 都同样合理，应修改或替换 case，不能通过执行上游任务来决定 Task 1 Gold。

机器可读候选清单见 `source-locks/open-skills/target-candidates.json`。该清单只记录候选路径、revision 与 Git blob，不代表正式资产。只有被 Team 采用并实际导入的 Skill 包才补齐许可证、实际资源目录和 SHA-256；未采用候选不设置正式指标资格。18 个后端、前端、客户端和测试候选的逐项研究与风险审计见 [`ENGINEERING-SKILL-CANDIDATE-RESEARCH.md`](./ENGINEERING-SKILL-CANDIDATE-RESEARCH.md)。

所有靶子的当前多轮对话和历史 Session 按 [`CONVERSATION-CONTEXT-CONTRACT.md`](./CONVERSATION-CONTEXT-CONTRACT.md) 构造；不再用单句 Query 直接测试 Skill 关键词触发。

## 1. 决策

T01～T03 继承历史 W01～W03 的候选研究，并改用“先确定 Skill 靶子，再选择自然工程上下文”的建设顺序。正式 Skill 不再一律要求从两条历史轨迹提炼，而分为三类：

| 类型 | 来源 | 作用 | 准入要求 |
|---|---|---|---|
| 开源原生 Skill | 许可清楚的 `SKILL.md` 与资源目录 | 直接成为目标 Skill 或真实干扰 Skill | 被采用时冻结 repo/revision/path/license/hash，保留归属声明，并完成 MemoryProxy 导入适配与路由边界审核 |
| 开源任务随附 Skill | 同一开源任务包内的 task 与 Skills；workspace/verifier 仅作可选参考 | 优先用于 Skill Positive，因为任务与 Skill 已天然配对 | 冻结 task、Skill、许可和实际使用的资源；Query 必须改写成当前系统的自然请求，不能复制 benchmark 提示词 |
| 系统专属 Skill | Luna 根据固定仓库代码、测试、文档和任务约束生成 | 补充 repo 专属流程、版本边界和近义干扰 | 不得发明技术事实；保存 generator/model/prompt、输入证据、输出 hash；人工复核“是否值得调用”和唯一首动作即可 |

历史轨迹可以用于构造 L0/L1/L2、历史决策和旧版本干扰，也可以由 Luna 按冻结 Team 世界合成。只有明确声称“这是团队从外部历史中总结的流程”并实际引用外部内容时，才保存对应来源。开源导入 Skill 和合成 Skill 不需要伪造历史会话。

## 2. 已核验来源

| 来源 | 冻结 revision | 许可 | 正式用途 |
|---|---|---|---|
| `benchflow-ai/skillsbench` v1.1 | `b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af` | Apache-2.0 | 首批任务与 Skill 成对靶子；使用 `tasks/` 中 87 个 active task，不使用 14 个 excluded task |
| `github/awesome-copilot` | `f11a4e441c5ff061b4f8ae37952be8c602e4034e` | MIT；个别 Skill 另带许可证/NOTICE 时同时保留 | 成熟通用 Skill 与语义干扰，优先选择依赖少、边界明确的条目 |
| `openai/skills` | `49f948faa9258a0c61caceaf225e179651397431` | 按 Skill 目录许可证核验；本批 `jupyter-notebook` 为 Apache-2.0 | 官方通用 Skill 与资源包 |
| SWE-Gym + OpenHands-SFT | 见历史 W01～W03 研究记录 | 见逐 repo license report | 可选工程题材；不要求应用 patch、安装依赖或运行上游测试 |

`Skill-Use-Bench` 仍不使用：已核验版本缺少可执行的顶层 LICENSE。`SWE-Skills-Bench` 不作为正式基座：49 条抽样中只有 1 条带非空 repo commit，无法稳定恢复任务环境。

## 3. 第一批强配对

以下组合同时具有 task、Skill 和上游验证材料，适合用作自然工程题材；Task 1 不运行上游 verifier，而是先写 Positive，再生成单变量 No-tool Negative。

| 靶子 | 开源任务 | 目标 Skill | 为什么适合 Task 1 | 配对负例 |
|---|---|---|---|---|
| Python 构建/测试失败定位 | SkillsBench `fix-build-agentops` | 候选池为 `testing-python`、`temporal-python-testing`、`analyze-ci`、`uv-package-manager` | 真实失败仓库、修复和 build verifier 很强，但必须先读失败日志和 passing diff，按根因确定唯一 Skill；不能预设 `testing-python` | 在当前上下文中给出准确失败根因和唯一测试命令，完整 Skill 池不变，Gold 改为 No Tool |
| Python 覆盖率改进 | 从 Moto/Mypy/Pandas/Dask/MONAI 固定 checkout 选择一个未覆盖分支并写固定测试 | GitHub `pytest-coverage` | Skill 边界明确，正文短，适合测试模型是否因“pytest”词面过度调用 | 当前消息直接给出未覆盖行和测试模板，或任务只是修复已有失败而非提升覆盖率 |
| Python fuzzing | SkillsBench `setup-fuzzing-py` | `discover-important-function` → `fuzzing-python` → `setup-env` | task 与三段式 Skill 天然匹配，可测试首个 Skill 入口和后续资源依赖 | workspace 已包含可运行 `fuzz.py`，当前任务只要求解释一个本地异常，不需要加载 fuzzing 流程 |
| 并行数据处理 | SkillsBench `parallel-tfidf-search` | `python-parallelization`；同池 `memory-optimization`、`workload-balancing` 作为竞争项 | task 有确定性正确性与加速比 verifier，能区分并行、内存和负载均衡 Skill | 当前代码已经是正确的多进程实现，只要求修复一个局部格式错误 |
| 时间序列去趋势 | SkillsBench `econ-detrending-correlation` | `timeseries-detrending` | 与 Pandas 数据任务技术域相近，Skill 专门性高，适合团队多项目场景 | 当前上下文已给出算法与参数，只需按本地函数签名接线 |
| TRL/GRPO 训练无提升 | SkillsBench `debug-trl-grpo` | `rl-post-training`、`grpo`、`trl` | 三个 Skill 分别覆盖诊断流程、算法和代码库，天然形成相似但用途不同的选择题 | 当前消息明确给出错误常量、函数和修复值，只需本地编辑；或问题属于普通 PyTorch shape bug，不应加载 GRPO 算法 Skill |
| NLP 论文代码复现 | SkillsBench `simpo-code-reproduction` | `nlp-research-repo-package-installment`，`pdf` 作为辅助 Skill | task 同时要求环境复现、论文读取和固定数值验证，能形成多 Skill 但首动作可控的 Case | workspace 已有完全锁定环境，任务只要求修改已定位的损失函数；环境 Skill 不再是必要首步 |
| 可复现 Notebook | 从 Pandas/Dask/MONAI 固定代码和公开示例生成一个实验/教程任务 | OpenAI `jupyter-notebook` | Skill 带模板、脚本和 references，能真实测试 `skill_view` 后是否读取 manifest 资源 | 已提供完整 `.ipynb`，只要求修改一个代码 cell；Notebook Skill 仍可见但不应调用 |

第一批不使用 `python-pypi-package-builder`、`quality-playbook` 等大而泛的 Skill 作为 Positive。它们适合作为团队库干扰，但过宽的触发描述会把评测变成“Skill 自己要求强制触发”，难以判断系统提示词是否真的学会了边界。

## 4. T01～T03 对历史 W01～W03 的吸收

正式数据只有一个 Space。历史 W01、W02、W03 分别并入 T01、T02、T03；历史 A/B Team 改为同一 Team 下的项目流，不再作为隔离 Team。源码没有 `projectId`，因此项目边界由 Task、workspace、repo/commit、Memory 内容和 Knowledge binding 表达。Task 1 的有效干扰来自当前 Team 的可见资产，跨 Team 资产不计入难度。

| 当前 Team | 项目流 | 项目与任务来源 | 首批目标 Skill | 可选工程题材 |
|---|---|---|---|---|
| T01 Python 可靠性 | CI 与测试 | `fix-build-agentops` + Moto 测试任务 | `testing-python`、`pytest-coverage`、`analyze-ci` | Moto 的历史与仓库片段 |
| T01 Python 可靠性 | 类型与安全验证 | Mypy + `setup-fuzzing-py` | `fuzzing-python`、`discover-important-function`、`setup-env` | Mypy 的历史与仓库片段 |
| T02 数据计算 | DataFrame 与分析 | Pandas + `econ-detrending-correlation` | `timeseries-detrending`、后续 Luna 生成一个 Pandas 专属回归 Skill | Pandas 历史与最小 Knowledge |
| T02 数据计算 | 分布式与性能 | Dask + `parallel-tfidf-search` | `python-parallelization`、`memory-optimization`、`workload-balancing` | Dask 历史与最小 Knowledge |
| T03 ML 工程 | 环境与复现 | DVC + `simpo-code-reproduction` | `nlp-research-repo-package-installment`、`jupyter-notebook`、`pdf` | DVC 的 CLI/版本历史和最小 Knowledge |
| T03 ML 工程 | 训练与框架调试 | MONAI + `debug-trl-grpo` | `rl-post-training`、`grpo`、`trl` | MONAI 历史与最小 Knowledge |

这个结构允许真实的同 Team 多项目干扰：例如 T02 的 Dask 性能任务可以同时看到 `python-parallelization`、`memory-optimization` 和 Pandas 项目流的相关 Skill。T03 的 DVC CLI 任务能看到环境复现 Skill 与 Notebook Skill，但只有当前信息缺口确实需要它们时才应调用。

## 5. 工程开发扩展靶子

除 T01～T03 的 Python/Data/ML 首批靶子外，还可为 T04～T10 选择后端、前端、客户端/SDK、测试质量等工程轨道。正式归属只需等 Skill 触发边界和最短工具链 Gold 审清，不要求先完成整个工程任务。

### 5.1 可直接冻结的任务/Skill 配对

| 轨道 | 具体工作内容 | 任务与 Skill | 固定验证 | 首调用边界 |
|---|---|---|---|---|
| 后端 namespace | 在固定 Spring workspace 中只处理 Java EE `javax` → `jakarta`，同时保留 `javax.sql`、`javax.crypto` 等 JDK namespace | SkillsBench `spring-boot-jakarta-migration` 的窄任务变体；目标 `jakarta-namespace`，同池放 `spring-boot-migration`、`spring-security-6`、`restclient-migration` | `mvn clean compile`、`mvn test`，以及 no-old-validation、persistence/validation namespace 断言 | namespace 迁移选窄 Skill；普通 Java 编译错、Maven 插件升级、已给出精确 import 替换时不调用 |
| 后端 HTTP client | 只把 `ExternalApiService` 从同步 `RestTemplate` 迁移到 Spring 6.1 `RestClient`，保持 GET/POST、响应和错误处理行为 | 同一固定 workspace 的窄任务变体；目标 `restclient-migration` | service 测试、`mvn compile/test`，静态检查不再创建 `RestTemplate` | 异步 `WebClient`、Controller 路由、namespace 迁移不能误选；全量迁移任务因多个 Skill 同时合理只作压力样本 |
| 后端安全 | 对固定 `package-lock.json` 做离线依赖漏洞审计，只输出 HIGH/CRITICAL CVE 与修复版本 | SkillsBench `software-dependency-audit`；主 Skill `trivy-offline-vulnerability-scanning`，同池 `cvss-score-extraction`、`vulnerability-csv-reporting` | CSV schema、允许的 severity/CVE 格式与固定漏洞记录 | 未扫描且需要确定漏洞集合时用扫描 Skill；已有扫描 JSON 只需补 CVSS 时选提取 Skill；完整结果已给出只需转 CSV 时不能误用扫描 Skill |
| 前端可视化 | 把固定股票 CSV 做成离线 D3 气泡图、行业聚类、tooltip、legend 和双向联动表格 | SkillsBench `data-to-d3`；目标 `d3-visualization` | DOM、数据一致性、ETF/股票 tooltip、聚类、legend、表格联动与数值格式 | task 要求 D3 v6、Skill 正文默认 v7，必须先生成显式 v6 适配 diff；静态 Markdown/CSV 汇总和普通 React 布局不调用 |
| 前端性能 | 定位并修复 Next.js 电商页的慢 API、购物车延迟、compare 首屏 bundle 与重复渲染 | SkillsBench `react-performance-debugging`；`browser-testing` 与 `react-best-practices` | 页面/API 时延阈值、外部 API 未被绕过、render count、bundle 大小、交互功能 | 没有性能证据时先 `browser-testing`；已经给出测量与根因、需要选择 React/Next 优化模式时先 `react-best-practices`；已给具体代码变更时 No Tool |
| 前端稳定性 | 修复 Next.js 页面 CLS、主题闪烁、字体 FOIT 和无尺寸图片，不破坏选择器与功能 | SkillsBench `fix-visual-stability`；`browser-testing`、`web-interface-guidelines`、`react-best-practices` | CLS `<0.1`、主题脚本、`font-display: swap`、全部图片有尺寸、页面正常渲染 | 未知问题位置时先测量；已有 CLS/DOM 证据时查看界面规范；只要求改已定位图片属性时 No Tool |
| 测试/构建 | 修复真实 `google/auto` Java 构建失败，记录原因、生成标准 diff 并使 Maven 构建通过 | SkillsBench `fix-build-google-auto`；候选池为 lifecycle、dependency、plugin 三个 Maven Skill | 原因文件和有效 unified diff 存在，修复后 build 成功 | 先核失败日志和 passing diff：依赖冲突选 dependency、插件配置选 plugin、阶段/profile/goal 才选 lifecycle；核验前不得预设 Gold |

同一个 workspace 可以形成多个 Case，但不能让一个 Case 同时拥有两个同样合理的首调用。例如 React 性能任务拆成“先测量”的 `browser-testing` Positive 和“已有测量、选择优化模式”的 `react-best-practices` Positive；两条 Case 必须明确改变当前信息，而不是把两个 Skill 都写进 Gold。

### 5.2 需要补最小任务上下文的工程靶子

| 轨道 | 具体工作内容 | 目标 Skill | 最小构造方式 | 当前状态 |
|---|---|---|---|---|
| CLI 客户端 | 在 DVC `import-url` 命令增加 `--no-exec`，保持 command/repo 两层参数透传并补单元、功能测试 | Luna 基于固定 DVC commit、issue、patch touched files 和 tests 生成窄边界 `dvc-cli-option-contract`；OpenAI `cli-creator` 只作“新建 CLI”语义干扰，不作目标 | 使用已锁 issue、base commit、涉及文件和测试名写自然 Query；reference patch 不进入可见资产 | source anchor 已锁；只待 Skill 和 Query 草稿 |
| SDK 客户端 | 用固定版本 Qdrant SDK 实现 collection 初始化、批量 upsert、过滤检索和错误重试 | GitHub `qdrant-clients-sdk` | 固定 SDK 版本、接口签名和一段已有项目上下文即可，不需要真的搭 Qdrant 服务 | Skill 已候选；只待版本化任务上下文 |
| JS/TS 单测 | 为固定 API client 或状态函数补异步成功、失败、重试和 mock 清理回归测试 | GitHub `javascript-typescript-jest` | 给出函数签名、现有实现和测试目标，保证任务阶段只有“补单测”一个信息缺口 | Skill 已候选；只待自然 Query |
| 浏览器 E2E | 按给定用户场景生成 Playwright 测试，覆盖表单、导航、错误提示和响应式断点 | GitHub `playwright-generate-test` 或 `webapp-testing` | 固定一个页面结构和用户场景，区分“生成持久测试”与“临时探索页面” | 适合作测试轨道扩量；与前端性能测量 Case 分开 |

建设优先级分层处理：Jakarta namespace、RestClient、Trivy audit 和无基线时的 browser diagnosis 可直接写最小正负对；D3 先统一 v6 描述；React 优化/界面规范先中性化强制触发措辞；Maven 只需读失败材料确定根因。DVC、Qdrant、Jest、System.CommandLine 和浏览器 E2E 只需补自然、版本明确的任务上下文，不要求搭完整工程 fixture。

还要单独做触发措辞审计。上游 `react-best-practices` 的原始 description 带有“任何 React/Next 修改前 MUST 调用”的强制措辞，若原样放进正式资产池，会人为推高 React 负例的误调用率；`qdrant-clients-sdk` 和 `webapp-testing` 的原始边界又偏宽。处理方式是同时保存 raw package 和 adapted package，只允许修改 listing description、宿主工具名和明确不适用边界，正文技术规则保持可追溯，并记录逐行 diff。若缩窄后仍无法形成稳定正负边界，该 Skill 只能作为干扰或探索项，不能进入主指标。Jakarta、RestClient 与 Trivy 的任务边界相对具体，可优先进入 A 级小样本；Maven 仍要先核失败根因，不能预设 lifecycle Skill。

## 6. 每个靶子的最小数据包

每个 Skill Positive 在进入 formal registry 前必须有以下文件或记录：

1. `skill-source.json`：repo、revision、path、license、原始 SHA-256、导入后 SHA-256、是否修改。
2. `skill-package/`：`SKILL.md` 和完整资源 manifest；移除运行时不支持的宿主专属调用后要记录 diff，不能静默改写。
3. `task-source.json`：开源 task 或 repo current anchor 的固定引用；workspace/verifier 只有实际使用时才记录。
4. `positive.json`：自然 Query、当前上下文、workspace、目标 Skill 和允许的首动作。
5. `negative.json`：与 Positive 共用相同 identity、资产 snapshot 和表达风格，只增加一个已登记的信息条件。
6. `decision-review.json`：为什么需要该 Skill、相邻 Skill 为什么不对、负例为什么无需资产、reviewer 和内容 hash。

导入 MemoryProxy 时使用生产 `/v3/skill/create` 形状：`name + content + resources + team_id + agent_id + user_id`。原生目录中的资源文件逐个映射为 `resources[]`，保留 path、encoding、mime type、可执行位；目标 Agent 自有 Skill 进入 listing，同 Team 干扰 Skill 使用 `visibility=team` 并通过真实 ACL/search 核验。

## 7. Luna 负责什么

Luna 使用固定模型和生成模板批量完成以下工作：

- 把开源 task 改写成当前 Team 的自然 Query，不复制 benchmark 文字，不暴露 Skill 名称或 Gold；
- 为 repo 专属流程生成 Skill 草稿及 `use_when`/`do_not_use_when`，所有技术步骤必须引用固定代码、测试或文档；
- 为每个 Positive 生成一个单变量 Negative 和一组近义干扰候选；
- 生成 Memory/L1 草稿、Knowledge query 草稿和当前上下文，但不能决定最终 Gold；
- 输出 generator model、reasoning、prompt version、输入 ids、随机种子和内容 hash。

确定性脚本负责 schema、hash、manifest、许可、路径、可见性和正负 delta；人工只复核任务是否自然、首动作是否唯一以及负例是否确实无需资产。Luna 输出在复核前统一标记 `draft`。

## 8. 建设顺序

1. 先在 T01～T03 实现四个初始靶子：`fix-build-agentops` 先做信息缺口审计后再选 Skill，`fuzzing-python`、`python-parallelization`、`rl-post-training` 可直接进入最小配对；工程扩展同时选择一个边界窄的靶子检查跨语言导入。
2. 每个靶子先完成 1 Positive + 1 paired Negative，不先追求数量。
3. 通过生产 Skill 导入、listing/search、manifest/read 和首动作 Gold 检查后，再扩成每 Team 3 个 Skill Positive。
4. 之后补 Memory 与 Knowledge Positive，并保持相同 Team 多项目资产池。
5. 最后再增加自然 coding negatives 和更多 Case；数量可以扩大，但不允许通过复制模板增加样本。

工程扩展采用相同顺序：先冻结 Jakarta、RestClient、Trivy、browser diagnosis 四个窄靶子，并统一 D3 v6 描述；每个只写一条首动作唯一的 Positive 和一条单变量 Negative。React 优化、界面规范、Maven 及客户端/测试任务只需完成边界复核后再晋级，不执行完整 coding 任务。

这些初始靶子都通过后，T01～T03 的候选映射才冻结。若某个 Skill 在实际 Luna 生成审查中总是因自身描述过宽而触发，则先缩窄导入版 description/use boundary；仍无法形成稳定边界时，把它降为干扰 Skill，不围绕它写 Positive。若 `fix-build-agentops` 的信息缺口不能证明 `testing-python` 唯一必要，则改选 `analyze-ci`、`uv-package-manager` 等真正匹配的 Skill，或者替换该靶子，不能为了保持表格名称写错 Gold。
