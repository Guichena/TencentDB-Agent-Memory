/**
 * W01 对话历史。
 *
 * 长度按真实分布：评测题需要"从长会话里捞原话"的那几条写成 18～30 轮，
 * 带命令输出、文件行号、表格和中途反悔；一般讨论 8～16 轮；确认类 2～4 轮。
 * 如果整段只有四句，conversation_search 这类题就是白送的，测不出检索。
 */
import { conversation, transcript } from "./world-schema.js";
import type { WorldConversation } from "./world-schema.js";

export const CONVERSATIONS: WorldConversation[] = [
  transcript(
    "sess-w01-v1-scope",
    "proxy-prompt",
    "V1 压缩范围与度量口径",
    "2026-07-14T09:00:00.000Z",
    `
    U: V1 我们从哪块下手？先把现在各块的占比拉出来看看。
    A: 跑了一下当前 V0 的分块统计：

         块                      token    占比
         <skill_tools>            1042    21.7%
         <available_skills>        286     5.9%
         <knowledge_tools>         968    20.1%
         <tdai_memory_tools>      1187    24.7%
         <tdai_profile_memory>     418     8.7%
         其余（框架与分隔）         911    18.9%
         合计                     4812

       静态说明是 skill_tools + knowledge_tools + tdai_memory_tools，一共 3197，占 66.4%。
    U: memory_tools 怎么会比 skill_tools 还大？
    A: 因为它有六个工具，每个都单独写了一遍参数表和 curl 示例。
       src/injection/injectors/tdai-tools-injector.ts:38-140 那一段里，
       atomic/search、atomic/query、conversation/search、conversation/query、
       scenario/ls、scenario/read 各占约 190 token，结构完全重复。
    U: 那三个家族的 curl 示例是不是也各写了一遍？
    A: 是。三份示例除了路径和 body 字段以外一模一样，包括同样的 header 说明：

         -H "x-tdai-service-id: ..." -H "x-conversation-id: ..."

       这段 header 说明重复了三次，单独算 210 token 左右。
    U: 那就先把示例合并成一个通用形式，每个工具旁边只留路径。
    A: 可以，但有个边界要确认：知识家族的 body 是嵌套的（tool_name + params），
       和记忆、技能的平铺 body 不一样。合成一个示例的话，嵌套那层必须单独说明，
       否则模型很可能把 params 平铺上去。
    U: 那就留两个形态：平铺一个，嵌套一个。
    A: 这样合理。预计示例部分从 630 降到 240 左右。
    U: 参数表呢？现在是一行一个字段加类型加示例值？
    A: 对，格式是：

         | 字段 | 类型 | 必填 | 示例 |
         | query | string | 是 | "上次的压缩方案" |

       示例值那一列可以删，字段名和类型已经能推出格式。
    U: 字段名不能动吧？
    A: 不能。字段名和 endpoint 路径都是模型照着拼 curl 的字符串，改了就调不通。
       这两样必须原样保留。
    U: 明白。那 memory guide 呢？之前五月的时候我记得是打算先压 guide 的。
    A: 五月那版计划是先压 guide。但实际量出来 guide 只有 418 token，里面还包含
       L3 画像内容，纯 guide 文本大概 180 token。压它的收益远小于工具说明。
    U: 那就改顺序。工具说明先来，guide 放最后。
    A: 记下了。顺序是：工具说明正文 → 参数表 → memory guide。
    U: guide 最后压的时候要注意什么？
    A: 例子可以删，规则一条都不能少。特别是告诉模型什么时候不要检索的那句，
       删掉之后负样本上的误调用会明显变多。
    U: 度量方式定一下。直接看两个 variant 的平均注入 token 行不行？
    A: 不行。不同 case 的资产量差别很大，池化均值会被资产多的 case 带偏。
       要按同一条 case 做配对比较，再报均值、总量、绝对节省量和节省比例。
    U: 节省率怎么算？
    A: (V0 注入 token - 候选注入 token) / V0 注入 token，逐 case 算完再汇总。
    U: 行。那这轮的结论就是先压工具说明正文。
    A: 是。总结一下这次定的四件事：

         1. V1 先压缩静态工具说明正文，guide 留到后面
         2. curl 示例合并成平铺和嵌套两个形态
         3. 参数表删示例值列，字段名和 endpoint 路径原样保留
         4. Token 按同一条 case 配对比较，不用池化均值
    `,
  ),
  transcript(
    "sess-w01-cache-safety",
    "proxy-prompt",
    "Prompt cache 安全性评审",
    "2026-06-30T14:00:00.000Z",
    `
    U: 我担心注入会把 prompt cache 打掉。现在这套注入到底动了哪一段？
    A: 注入点有两个：system.before_tools 和 system.suffix。两个都在 Codex 自带的
       系统提示之后，所以稳定前缀本身没有被动过。
    U: 稳定前缀具体指到哪里为止？
    A: 指第一个注入块之前的全部内容。当前是从请求开头到 <skill_tools> 出现之前，
       大约 1900 token，这一段在所有 case 和所有 variant 之间都是逐字节相同的。
    U: 怎么验证候选没有动它？
    A: 取那一段单独算 hash。刚跑了一次：

         variant  prefix bytes  prefix sha256(前8位)
         V0             7612    9f2c41ab
         候选A          7612    9f2c41ab
         候选B          7612    9f2c41ab

       三个一致，说明这几个候选都只改了注入区域内部。
    U: 如果哪个候选真把块往前挪了，会怎么样？
    A: 上个月就出过一次。有个候选把 <knowledge_tools> 移到了稳定前缀之前，
       结果 cachedInputTokens 每次都是 0，注入 token 反而只降了 3%。
       复盘记在 incidents/proxy/prompt-cache-miss.md。
    U: 那我直接看 cachedInputTokens 不就知道有没有命中了？
    A: 不能只看它。cache 是否命中还受服务端状态影响，同一个 prompt 在不同时间点
       命中率也会不一样。它只能作为运行事实保存，不能当判据。
    U: 那判据是什么？
    A: 结构检查。也就是前面那个前缀 hash 比对。先确认结构没问题，
       再把 cachedInputTokens 作为辅助观察记下来。
    U: 好。那规则写清楚一点，我要写进约束文档。
    A: 规则是这样：整个注入区域必须保持在稳定 system 前缀之后。
       块与块之间可以重新排序，但不能越过前缀边界。
    U: 块之间重排真的安全？
    A: 安全，但重排之后前缀之后的内容变了，前缀之后那部分的 cache 会失效。
       前缀本身仍然可复用，所以损失有限。不过既然重排没有收益，不建议动。
    U: 明白。那 prompt hash 每次跑都不一样这事怎么处理？
    A: 那是因为 bridge 地址和 session id 每次都是新的。runner 另存一个
       promptCacheTemplateSha256，把这两个运行时值标准化之后再算，用它比对模板稳定性。
    U: 标准化具体替换成什么？
    A: bridge 地址替换成固定占位符，session id 同样。normalizePromptCacheTemplate
       在 codex-runner.ts:104 那个函数里做这件事。
    U: 行，那这条就定了。
    A: 定了。约束一句话版本：候选只能改变计划内的注入区域，
       不能让原本位于注入块之前的稳定 system 前缀变成动态内容。
    `,
  ),
  transcript(
    "sess-w01-v0-baseline",
    "proxy-prompt",
    "V0 基线采集与复核",
    "2026-07-09T15:30:00.000Z",
    `
    U: V0 基线跑完了？
    A: 跑完了。12 条 smoke，全部产出 trace.jsonl、evaluation.json 和 usage.json，
       没有基础设施错误。
    U: 注入 token 多少？
    A: 均值 4812。逐条分布：

         case                              注入token
         memory-dev-preference-001              4703
         memory-dev-scene-read-002              4811
         skill-dev-dialogue-view-001            4795
         skill-dev-search-then-view-003         4802
         knowledge-dev-callers-001              4906
         knowledge-dev-wiki-rationale-002       4913
         notool-dev-humaneval-0                 4744
         notool-dev-context-answer-port         4802
         ...（其余 4 条 4780～4860）

       波动来自各 case 的资产数量不同，主要是 available_skills 那一块。
    U: 这个数字只包含我们注入的部分吧？
    A: 是。只统计 InjectionPipeline 渲染出来的 system prompt，用 o200k_base 编码。
    U: 模型那边报的 input_tokens 是多少？
    A: 均值 11240，差出来的六千多是 Codex 自带的系统与开发者提示。
       所以那个数不能代表我们的注入成本。
    U: cachedInputTokens 有数据吗？
    A: 有，均值 8960。但第一次跑某个 case 的时候是 0，第二次才有，
       这也印证了它受服务端状态影响，不适合当判据。
    U: 评分结果呢？
    A: 正样本里有效调用 7/8，一条是参数不对：knowledge-dev-callers-001 第二步
       params 里把 symbol 写成了 symbol_name。负样本 4 条全部没有调用。
    U: 那条参数错的，是模型问题还是我们说明写得不清楚？
    A: 说明里写的是 symbol，但示例 body 里用的是 symbol_name，前后不一致。
       是我们的问题，injectors/knowledge-tools-injector.ts:76 那个示例要改。
    U: 那这条不算模型失败。
    A: 从指标上仍然算参数错误，但根因记在我们这边。修完要重跑这条。
    `,
  ),
  transcript(
    "sess-w01-token-accounting",
    "proxy-prompt",
    "Token 统计口径",
    "2026-07-01T10:00:00.000Z",
    `
    U: 报告里 token 那一栏直接用上游返回的 input_tokens 行不行？省事。
    A: 不行。上游总输入里还包含 Codex 自带的系统提示和开发者指令，
       那部分我们改不动，混进来会把节省比例稀释掉。
    U: 差多少？
    A: 实测均值 11240 对 4812，差 6428。如果用总量算，
       同样省 500 token 的候选，节省率会从 10.4% 掉到 4.5%。
    U: 那就分开。具体存哪些字段？
    A: 两组：

         注入成本（自己算）
           injectionTokens        o200k_base 编码后的 token 数
           injectionChars         字符数
           injectionBytes         UTF-8 字节数
           injectionSha256        原始文本 hash

         模型用量（从 turn.completed.usage 取）
           inputTokens
           cachedInputTokens
           cacheWriteInputTokens
           outputTokens
           reasoningOutputTokens
    U: 为什么还要存字符数和字节数？
    A: 编码器换版本的时候 token 数会变，字符和字节数不会。有这两个可以回溯校验。
    U: 存在哪？
    A: 每个 run 写 usage.json，整个 campaign 汇总成 campaign-usage.json。
    `,
  ),
  transcript(
    "sess-w01-smoke-failures",
    "proxy-prompt",
    "Smoke 失败归类",
    "2026-07-10T10:20:00.000Z",
    `
    U: 这次 smoke 两条失败，是模型不行还是环境问题？
    A: 先看 stderr。第一条是：

         Error: command execution blocked by policy
         at ExecPolicy.check (codex/exec/policy.rs:214)

       这是执行策略拦截，Mock Bridge 根本没收到请求。属于基础设施错误。
    U: 第二条？
    A: 第二条是超时，180 秒到了 Codex 还没返回。也是基础设施错误。
    U: 模型在被拦那条里说要调用工具吗？
    A: 说了。它在自然语言里写了"我先查一下之前的记录"，还给出了完整的 curl。
       但命令没执行成功。
    U: 那这条绝对不能算没有调用意图。
    A: 对。runner 现在会匹配 blocked by policy，直接标 INFRASTRUCTURE_ERROR，
       评分器单独计数并排除在准确率分母之外。
    U: 一共有几种情况算无效运行？
    A: 六种：Codex 超时、非零退出、blocked by policy、完整 prompt 审计失败、
       Mock Bridge 未启动或协议异常、固定设置与对照组不一致。
    U: 好，那这次 smoke 实际有效的是 10 条。
    A: 是，10 条有效。这 10 条里正样本 6 条全部有效调用，负样本 4 条全部没有调用。
    `,
  ),
  transcript(
    "sess-w01-memory-guide",
    "proxy-prompt",
    "memory guide 压缩边界",
    "2026-07-17T13:40:00.000Z",
    `
    U: guide 那部分现在能开始压了吗？
    A: 可以了，工具说明那一轮已经落地。guide 当前纯文本 180 token，19 行。
    U: 里面哪些是规则，哪些是例子？
    A: 拆开是这样：

         规则   11 行
         例子    5 行
         过渡语  3 行

       例子和过渡语可以删，规则要全留。
    U: 规则里有哪条特别关键？
    A: 这一条：

         "如果答案已经在当前上下文或本地文件中，不要调用记忆工具。"

       它直接压着误调用率。之前有个候选把它连着例子一起删了，
       负样本上的调用率从 8% 涨到 31%。
    U: 那条单独保留，其他的能合并吗？
    A: 可以合并同类项。比如"搜索前先判断是否需要"和"优先使用当前上下文"
       语义重叠，可以并成一条。
    U: 合并之后规则条数变少，会不会让模型觉得约束变松了？
    A: 有这个风险，所以合并要保持祈使语气，一行一条。
       不要写成一段散文，那样模型确实容易忽略。
    U: 行。那压完之后要验证什么？
    A: 重点看负样本的误调用率有没有涨。正样本的有效调用率反而不太受影响。
    `,
  ),
  transcript(
    "sess-w01-gate-checklist",
    "proxy-prompt",
    "开跑前的 Gate",
    "2026-07-08T11:00:00.000Z",
    `
    U: 正式采集之前要确认哪些事？我想列个清单挂在仓库里。
    A: 八项：数据 hash 与 manifest 一致、Gold 序列全部通过 Bridge 测试、
       Proxy 8096/health 正常且 providerBaseUrl 指向本机、手动 smoke 没有策略拦截、
       运行前后登录态正常且产物里没有认证文件副本、模型与 CLI 版本记录完整、
       12 条 smoke 都产出三个产物文件、Test 尚未用于调优。
    U: hash 那条怎么查？
    A: 跑 validate.ts，它会把五个冻结文件的 sha256 和 dataset-manifest.json 比对。
    U: Test 那条靠什么保证？
    A: 脚本层面：跑 test scope 需要显式加 --AllowHeldOutTest。
       流程层面只能靠纪律。
    U: 那就写进清单，让它显式一点。
    A: 已经写了，放在 plans/proxy/benchmark-gate.md。
    `,
  ),
  transcript(
    "sess-w01-variant-label",
    "proxy-prompt",
    "Variant 标签纪律",
    "2026-07-07T14:30:00.000Z",
    `
    U: 我昨天跑了几条带 --variant V1 的，那些能当 V1 数据用吗？
    A: 不能。渲染链路现在还是生产现状 V0，那个标签只是命令行参数，
       实际注入内容和 V0 完全一样。
    U: 所以那些数据是重复的 V0？
    A: 是。当成 V0 的额外重复看可以，当成对照组就是假的。
    U: 那我把标签改回来。什么时候才算真的 V1？
    A: 候选 Prompt 接进渲染链路、并且 run-manifest 里的注入 hash 与 V0 不同，
       那时候才开放对应 variant。
    U: 明白，我先把那批结果的标签清掉。
    `,
  ),
  transcript(
    "sess-w01-endpoint-verbatim",
    "proxy-prompt",
    "endpoint 与字段名原样保留",
    "2026-07-15T11:00:00.000Z",
    `
    U: 路径能不能缩写？比如把 /memory-bridge/v3/ 提出来只写一次，
       后面只写 atomic/search。
    A: 提取公共前缀可以，但每个工具旁边仍然要能看到完整路径。
       模型是照着这个字符串拼 curl 的，看不到完整路径就会拼错。
    U: 怎么算"能看到"？
    A: 比如这样写是安全的：

         base: http://127.0.0.1:PORT
         - tdai_memory_search        POST /memory-bridge/v3/atomic/search
         - tdai_atomic_query         POST /memory-bridge/v3/atomic/query

       这样写不安全：

         base: .../memory-bridge/v3
         - tdai_memory_search        POST atomic/search
    U: 差别在哪？后面那种不是更省？
    A: 省，但模型需要自己拼接两段。实测里有拼成
       /memory-bridge/v3atomic/search 的情况，少了斜杠。
    U: 那就用第一种。字段名同理？
    A: 同理。字段名一个字符都不能改，包括大小写和下划线。
    `,
  ),
  conversation(
    "sess-w01-param-table",
    "proxy-prompt",
    "参数表格式",
    "2026-07-16T10:10:00.000Z",
    "参数表改成一行一个字段可以吗？",
    "可以。字段名和是否必填保留，类型说明能合并，示例值那一列可以删。",
    "删了示例值模型还知道格式吗？",
    "知道。字段名加类型已经够了，比如 time_start 是 string，模型会用 ISO 格式。",
  ),
  conversation(
    "sess-w01-model-frozen",
    "proxy-prompt",
    "固定实验变量",
    "2026-07-05T09:00:00.000Z",
    "对照实验哪些变量必须固定？",
    "模型 gpt-5.6-luna、推理强度 high、详细度 medium、CLI 版本、provider、case 与 Gold、重复次数、runner 版本、超时时间。",
    "CLI 版本变了怎么办？",
    "不同 CLI 版本的运行不合并比较。这些值每个 run 都写进 run-manifest.json。",
  ),
  conversation(
    "sess-w01-repeat-policy",
    "proxy-prompt",
    "重复次数策略",
    "2026-07-06T14:00:00.000Z",
    "每条要跑几次？",
    "基础设施 smoke 1 次，Dev 迭代每个 variant 1 次，入围候选与 V0 复核 3 次，最终 Test 3 次。",
    "预算不够怎么砍？",
    "砍重复次数，不要砍负样本。负样本少了误调用率就没有统计意义。",
  ),
  transcript(
    "sess-w01-false-call",
    "proxy-prompt",
    "误调用类型分析",
    "2026-07-13T16:30:00.000Z",
    `
    U: 负样本上的误调用主要是哪几类？我想按类型改说明。
    A: 34 条负样本里 V0 触发了 6 条，分布是：

         类型                    条数  触发
         self_contained_coding     15     1
         answer_already_available   7     2
         superficial_overlap        8     3
         wrong_tool_hard_negative   4     0
    U: superficial_overlap 触发最多，具体是哪几条？
    A: 三条都是 query 里出现了资产家族的词但语义无关：
       一条问 Node 进程的 memory 涨，一条问 GC 的 migration pause，
       一条问 Chrome Memory 面板的 detached node。
    U: 模型是直接去搜记忆了？
    A: 是。三条都调了 tdai_memory_search，query 参数就是原句里那个词。
    U: 那说明里要加什么？
    A: guide 里那条"答案已在上下文或本地文件中就不要调用"其实覆盖不到这类，
       因为这类的答案根本不在任何地方，是通用知识。要单独加一条：
       家族词出现在技术术语里时不构成调用理由。
    U: hard_negative 那 4 条一条都没触发，是不是题目太简单了？
    A: 有这个可能。那 4 条的资产虽然存在，但 repo_slug 明显不匹配，
       模型比较容易看出来。下一轮可以把仓库名做得更接近一点。
    `,
  ),
  conversation(
    "sess-w01-hard-negative",
    "proxy-prompt",
    "硬负例是否暴露资产",
    "2026-07-04T11:15:00.000Z",
    "负样本要不要干脆不注入工具？",
    "不能。不注入模型就没机会误调用，误调用率也就测不出来了。",
    "所以每条负样本都要暴露资产？",
    "对，至少一个无关资产。这样误调用才是可观察的，不是被我们藏掉的。",
  ),
  conversation(
    "sess-w01-langfuse",
    "proxy-prompt",
    "Langfuse 上报配置",
    "2026-06-19T09:30:00.000Z",
    "容器里 Langfuse 地址怎么配？",
    "用 host.docker.internal:13000。容器内访问不到宿主的 127.0.0.1。",
    "Langfuse 没起会影响实验吗？",
    "不影响模型实验，只是没有可看的页面。本地 trace、usage 和评分仍然由 runner 保存。",
  ),
  conversation(
    "sess-w01-isolation-flags",
    "proxy-prompt",
    "运行隔离设置",
    "2026-06-27T10:40:00.000Z",
    "每次运行要隔离哪些东西？",
    "新工作目录、新 Bridge 端口、新 runId 与 sessionId、新 CODEX_SQLITE_HOME、新临时 HOME 和 USERPROFILE。",
    "Codex 侧的参数呢？",
    "--ephemeral 不留 rollout，--ignore-rules 不读本地规则，--ignore-user-config 不读个人配置，同时关掉 plugins、apps、multi-agent 和 skill search。",
  ),
  transcript(
    "sess-w01-auth-handling",
    "proxy-prompt",
    "认证目录为什么不复制",
    "2026-06-28T11:30:00.000Z",
    `
    U: runner 之前会把 auth.json 复制到临时目录，为什么要去掉？
    A: 因为复制出来的那份会独立刷新 token。Codex 桌面端和 CLI 本来共享缓存登录，
       临时副本刷新或轮换之后，桌面端那边的登录态可能就失效了。
    U: 实际出过问题？
    A: 出过一次。跑完一轮 benchmark 之后桌面端要求重新登录。
    U: 现在怎么处理？
    A: 所有运行引用同一个已经登录的 CODEX_HOME，但不读取、不复制、不修改 auth.json。
       其他状态（sqlite、临时 HOME）仍然是每次新建。
    U: 那并行跑多个 campaign 会不会有竞争？
    A: 会。所以同一时间只启动一个 benchmark 脚本，运行过程中也不要执行
       codex login 或 codex logout。
    `,
  ),
  conversation(
    "sess-w01-injection-order",
    "proxy-prompt",
    "注入块顺序",
    "2026-06-24T14:10:00.000Z",
    "五个块的顺序是固定的吗？",
    "skill_tools、available_skills、knowledge_tools 在 system.before_tools，两个 memory 块在 system.suffix。",
    "块之间能调顺序吗？",
    "同一注入点内可以按 priority 调，但整体不能越过稳定前缀。",
  ),
  conversation(
    "sess-w01-scene-index",
    "proxy-prompt",
    "场景索引 vs 全文",
    "2026-07-03T15:40:00.000Z",
    "L2 场景是全文注入还是只给索引？",
    "只给索引，正文按需用 tdai_read_scene 读。全文注入会把成本推得很高。",
    "索引里放什么？",
    "路径加一句摘要，够模型判断要不要读就行。",
  ),
  conversation(
    "sess-w01-split-discipline",
    "proxy-prompt",
    "Dev/Test 切分纪律",
    "2026-07-12T15:20:00.000Z",
    "Test 能先看一眼分布吗？",
    "分布可以看，具体 case 内容不要看。看过就等于用它调过 Prompt。",
    "同一个资产世界的题分到两边行不行？",
    "不行。Prompt 可能已经针对那个世界的资产名调过，Test 就不再是未见数据。",
  ),
  transcript(
    "sess-w01-grpo-collapse",
    "training-grpo",
    "GRPO 奖励塌陷排查",
    "2026-06-12T09:00:00.000Z",
    `
    U: 这轮训练奖励塌了，第 300 步之后直接掉到底。
    A: 看了下 reward 曲线和 advantage 分布：

         step   mean_reward   advantage_std
         100         0.42          1.03
         200         0.51          2.87
         300         0.38         11.42
         400        -0.12         38.60

       advantage_std 在爆炸，说明归一化没生效。
    U: 归一化那段代码在哪？
    A: training/reward.py 的 advantage 函数。当前是先除以 group_std 再裁剪，
       顺序反了。组内方差大的时候，除完仍然有极端值，裁剪把它们压到边界，
       结果整组都贴在正负 5 上，方向信息就丢了。
    U: 那应该先裁剪？
    A: 对。先按正负 5 裁掉标注噪声，再除以组标准差。这样归一化作用在干净数据上。
    U: 裁剪阈值为什么是 5？
    A: 统计过，超过正负 5 的样本 92% 是标注错误。
    U: 改完重跑一轮看看。
    A: 已经改了，reward.py:2-4。这轮跑到 400 步 advantage_std 稳定在 1.1 左右。
    `,
  ),
  conversation(
    "sess-w01-grpo-group-size",
    "training-grpo",
    "group size 选择",
    "2026-06-14T10:00:00.000Z",
    "group size 放大会不会更稳？",
    "会更稳，但单条样本的奖励异常会被平均掉，不好定位。",
    "所以调试阶段用小的？",
    "对，定位完再放大。",
  ),
  transcript(
    "sess-w01-mobile-jank",
    "mobile-rn",
    "订单列表滑动卡顿",
    "2026-05-08T15:00:00.000Z",
    `
    U: 订单历史页滑起来很卡，Android 13 上尤其明显。
    A: 用 RN profiler 录了一段，滑动 2 秒内的渲染：

         组件          渲染次数   自身耗时
         OrderCard          412      680ms
         OrderHistory         3       12ms
         FlatList             3        8ms

       OrderCard 渲染了 412 次，说明每帧都在重建行。
    U: 为什么每帧都重建？
    A: renderItem 是内联箭头函数，每次父组件渲染都产生新的函数身份，
       FlatList 认为行变了。
    U: 那要不要换个列表库？
    A: 不用。把行组件 memo 掉就够了，renderItem 也提到外面。
       换库要重写交互逻辑，收益不值这个代价。
    U: 改完效果？
    A: OrderCard 渲染次数从 412 降到 18，自身耗时 680ms 降到 34ms。
    `,
  ),
  conversation(
    "sess-w01-mobile-e2e",
    "mobile-rn",
    "端到端测试选型",
    "2026-04-27T10:30:00.000Z",
    "RN 端到端用 Detox 还是 Appium？",
    "Detox。和 RN 的桥接更直接，等待策略也更可靠。",
  ),
  transcript(
    "sess-w01-etl-skew",
    "data-etl",
    "每日聚合分区倾斜",
    "2026-05-30T10:00:00.000Z",
    `
    U: 每日聚合作业最后一个 stage 卡了四十分钟，前面都很快。
    A: 看 stage 的 task 分布：

         task 数    输入数据量
            197      12~40 MB
              2     2.1~2.4 GB
              1        8.7 GB

       典型的分区倾斜，最后一个 task 拖住整个 stage。
    U: 按什么分区的？
    A: 现在按 user_id 单键。有个用户的事件量占了全表 6%。
    U: 那加一维？
    A: 对，改成 user_id 和 hour 组合键。热点用户的数据会被打散到 24 个分区。
    U: 会不会导致同一个用户的数据跨分区，聚合出错？
    A: 不会，groupBy 的键仍然是 user_id 和 day，repartition 只影响物理分布。
    U: 改完跑一次。
    A: 最长 task 输入从 8.7 GB 降到 420 MB，stage 时间从 40 分钟降到 3 分钟。
    `,
  ),
  conversation(
    "sess-w01-etl-oom",
    "data-etl",
    "Executor OOM",
    "2026-05-29T18:00:00.000Z",
    "executor 为什么 OOM？",
    "一个热点 user key 占了大部分分区，单个 task 装不下。",
    "调大内存能解决吗？",
    "能绕过去但不解决问题，数据继续涨还会再 OOM。要从分区键下手。",
  ),
  conversation(
    "sess-w01-etl-udf",
    "data-etl",
    "UDF 还是内置表达式",
    "2026-06-02T14:20:00.000Z",
    "这段清洗逻辑用 UDF 写方便点，行吗？",
    "不建议。UDF 会挡住 Catalyst 优化，优先用内置表达式。",
  ),
  conversation(
    "sess-w01-python-typing",
    "data-etl",
    "类型标注习惯",
    "2026-03-14T08:30:00.000Z",
    "这些函数都要加类型标注吗？",
    "加。以前维护 Python 管道的时候吃过没标注的亏。",
  ),
  conversation(
    "sess-w01-uv-migration",
    "data-etl",
    "环境管理迁移",
    "2026-03-15T09:00:00.000Z",
    "环境还用 pip？",
    "换 uv，解析速度差得太多。",
  ),
  transcript(
    "sess-w01-curl-example-merge",
    "proxy-prompt",
    "curl 示例合并形态",
    "2026-07-15T14:20:00.000Z",
    `
    U: 三个家族的 curl 示例合并成一个够吗？
    A: 不够，body 结构不一样。记忆和技能是平铺的：

         {"query": "..."}
         {"skill_name": "...", "include_content": true}

       知识是嵌套的：

         {"knowledge_id": "...", "tool_name": "callers", "params": {"symbol": "..."}}

    U: 那留两个形态？
    A: 对，平铺一个，嵌套一个。嵌套那层必须单独说明，
       否则模型很可能把 params 里的字段平铺上去。
    U: 实际见过这种错误吗？
    A: 见过。有一次模型直接发了 {"knowledge_id": "...", "symbol": "..."}，
       Bridge 返回 400 说 params is required。
    U: 那嵌套形态的说明要写得显眼一点。
    A: 我在示例上方加一行：params 是嵌套对象，不要把它的字段提到顶层。
    U: 合并之后省了多少？
    A: 示例部分从 630 降到 240，省 390 token。header 说明也从三份合成一份，再省 140。
    `,
  ),
];
