/**
 * W03 对话历史。held-out test world，措辞与 W01、W02 刻意不重叠。
 */
import { conversation, transcript } from "./world-schema.js";
import type { WorldConversation } from "./world-schema.js";

export const CONVERSATIONS: WorldConversation[] = [
  transcript(
    "sess-w03-table-strategy",
    "web-console",
    "系列表格渲染策略",
    "2026-07-22T13:40:00.000Z",
    `
    U: 表格这块最后是走 memo 还是虚拟化？我倾向 memo，改动小。
    A: 先看这次录到的数据。默认视图 12 条系列，每条约 5000 点，表格 5000 行：

         组件           渲染次数   自身耗时   提交次数
         SeriesTable          1     142ms          1
         SeriesRow         5000     318ms          1
         SeriesCell       20000     496ms          1
         Legend               1      96ms          1

       首次挂载 956ms，其中行和单元格占 814ms。
    U: 那把 SeriesRow 和 SeriesCell memo 掉不就好了？
    A: memo 省的是重复渲染时的 diff，不省首次挂载。这 5000 行 20000 个单元格
       无论如何都要挂到 DOM 上。
    U: 交互的时候呢？我主要是嫌排序卡。
    A: 排序那次录的是：

         SeriesRow      渲染 5000 次   271ms
         SeriesCell     渲染 20000 次  438ms

       memo 之后行和单元格的 props 确实没变，可以跳过重渲染。
       但排序改变了行顺序，key 对应的位置变了，React 仍然要做 5000 次 reconcile。
    U: 所以 memo 能省一部分但不能解决？
    A: 对。实际试过一版全 memo：排序从 709ms 降到 512ms，还是卡。
       瓶颈在挂载的节点总量，不在 diff。
    U: 虚拟化能降到多少？
    A: 视口一次只渲染约 30 行。首次挂载预计 60～80ms，排序几乎不受行数影响。
    U: 虚拟化要改的东西多吗？
    A: 主要三件：行高必须固定、排序要挪出渲染路径、滚动容器要接管高度。
    U: 行高固定这条会不会影响现在的换行单元格？
    A: 会。现在有两列在窄屏下会换行。虚拟化之后需要截断或者加 tooltip。
    U: 那就截断加 tooltip。这个代价可以接受。
    A: 那就定虚拟化。之前那版全 memo 的方案作废。
    U: 六月那会儿定的是全 memo 吧？
    A: 是。六月的结论是每个行和单元格都 memo，表格仍然整体渲染。
       现在这个数据推翻了它。
    U: 行，以虚拟化为准。顺序按什么来？
    A: 先固定行高并录一次基线，再引入窗口容器，再把排序挪出渲染路径，最后复测。
    U: 复测要交什么？
    A: 前后两份 production build 的 profile，都挂到 PR 上。
    `,
  ),
  transcript(
    "sess-w03-profiling-setup",
    "web-console",
    "Profile 采集环境",
    "2026-07-10T09:20:00.000Z",
    `
    U: profiler 直接在 dev server 上录可以吗？方便一点。
    A: 不行，dev build 会把 render 数算两遍。
    U: 为什么会算两遍？
    A: StrictMode 在开发模式下故意双调用渲染函数，用来暴露副作用。
       profiler 把两次都记进去了。
    U: 差多少？
    A: 同一个交互，dev 录到 SeriesRow 渲染 10000 次，production build 录到 5000 次。
       耗时也差不止一倍，因为 dev 还带 warning 检查。
    U: 那 production build 怎么开 profiler？
    A: 用带 profiling 的构建配置，保留 profiler hook 但关掉开发检查。
    U: 录的时候还要注意什么？
    A: 关掉浏览器扩展，一次只录一个交互。多个交互混在一起没法归因。
    U: 明白，以后都用 production build 录。
    A: 记下了。这条要写进规范，之前有人拿 dev 数据下过结论。
    `,
  ),
  transcript(
    "sess-w03-legend-finding",
    "web-console",
    "Legend 开销归因",
    "2026-07-18T15:30:00.000Z",
    `
    U: 这次 trace 最大的开销在哪？
    A: legend，占了整体 render 时间的 40%。
    U: legend 就一行图例，怎么会这么贵？
    A: 它自身耗时只有 96ms，但它导致的子组件重渲染是主要成本。
       每次父组件 render 它都重建 color scale。
    U: 重建一个 scale 有多贵？
    A: scale 本身不贵，问题是它是新对象。所有接收 scale 的子组件
       props 身份都变了，memo 全部失效。
    U: 有多少子组件接收 scale？
    A: 12 个系列的图例项，加上表格里 12 列的表头色块，一共 24 个。
    U: 那 scale 应该怎么建？
    A: 从系列 key 列表派生，memo 在那个列表上。key 列表不变的时候 scale 身份就稳定。
    U: 系列 key 什么时候会变？
    A: 只有用户增删系列的时候。滚动、排序、hover 都不会变。
    U: 那就 memo 在 key 列表上。
    A: 这样 24 个子组件在滚动和排序时都能真正跳过。
    `,
  ),
  transcript(
    "sess-w03-perf-review",
    "web-console",
    "合并前的性能评审",
    "2026-07-25T10:15:00.000Z",
    `
    U: 性能相关的 PR 合并前要过哪些检查？
    A: 四条：production build 的前后 profile、交互预算 60fps 达标、
       新增依赖不超过 20kB gzip、Playwright 的时序断言已更新。
    U: 交互预算怎么量？
    A: 从输入事件到下一帧提交完成。60fps 就是 16.7ms 以内。
    U: 5000 行的表格排序能做到 16.7ms？
    A: 虚拟化之后可以，因为排序只影响视口内那 30 行的渲染。
       排序本身的计算要挪到渲染路径之外。
    U: 20kB 这个阈值是怎么定的？
    A: 首屏 bundle 现在 180kB gzip，再加 20kB 会让 3G 下的首屏超过 5 秒。
    U: Playwright 断言断在什么上？
    A: 断交互延迟，不要断测试总时长。总时长受 CI 机器负载影响，会随机失败。
    U: 这四条写到哪了？
    A: 写在 plans/console/perf-review.md 里，评审的时候按那份逐条过。
       另外交互预算的当前实测记在 plans/console/interaction-budget.md，
       排序和滚动现在都还不达标。
    `,
  ),
  transcript(
    "sess-w03-virtualization-rollout",
    "web-console",
    "虚拟化落地顺序",
    "2026-07-23T11:00:00.000Z",
    `
    U: 虚拟化具体分几步做？
    A: 四步。第一步固定行高并录基线，第二步引入窗口容器，
       第三步把排序挪出渲染路径，第四步复测并附两份 capture。
    U: 为什么行高要先固定？
    A: 窗口容器需要用行高算出总高度和当前视口的起止索引。行高不定就算不出来。
    U: 现在行高是多少？
    A: 大部分 36px，但有两列在窄屏会换行变成 56px。
    U: 那就统一 36 加截断。
    A: 好。第三步那个排序，现在是在 useMemo 里做的？
    U: 是，在 Dashboard 里 useMemo 排完再传给表格。
    A: 那已经在渲染路径里了。5000 条的排序大约 12ms，每次依赖变化都重跑一遍。
    U: 挪到哪？
    A: 挪到数据层，或者用 worker。视口只需要有序的索引，不需要在渲染时排。
    U: 先挪数据层，worker 以后再说。
    A: 记下。第四步复测的时候两份 capture 都要 production build。
    `,
  ),
  transcript(
    "sess-w03-draw-calls",
    "three-viewer",
    "楼层场景 draw call",
    "2026-05-26T13:20:00.000Z",
    `
    U: 楼层视图在中端机上掉到 20fps。
    A: 看渲染统计：

         draw calls   2400
         triangles    418k
         textures       36
         programs       12

       2400 次 draw call 是主要问题，三角形数量不算高。
    U: 为什么这么多 draw call？
    A: 每个墙面、门、窗都是独立 mesh。静态部分一共 2180 个 mesh。
    U: 用 instancing 吗？
    A: 可以，但这些 mesh 材质不完全相同，instancing 需要按材质分组，
       材质管理会变复杂。
    U: 那合并几何？
    A: 静态部分按材质分组合并。分组之后大约 12 个材质，
       draw call 能降到 300 出头。
    U: 合并之后还能单独选中某个墙面吗？
    A: 不能直接选。需要额外维护一层 id 到顶点区间的映射。
    U: 选中功能现在用得多吗？
    A: 只在编辑模式用，浏览模式不需要。可以只在编辑模式加载未合并版本。
    U: 那就合并，编辑模式单独处理。
    A: 合并之后实测 draw call 310，帧率回到 58。
    `,
  ),
  transcript(
    "sess-w03-startup",
    "mobile-shell",
    "冷启动时间",
    "2026-05-14T09:50:00.000Z",
    `
    U: 冷启动现在 2.1 秒，想压到 1.5 以内。
    A: 拆了一下首帧之前的耗时：

         阶段                耗时
         JS bundle 解析      620ms
         analytics 初始化    310ms
         主题与本地化        140ms
         首屏组件挂载        480ms
         其余               550ms

    U: analytics 为什么要在首帧之前？
    A: 没有必要，只是初始化写在了入口。它要建网络连接，310ms 大部分在等握手。
    U: 挪到首帧之后。首屏组件那 480ms 呢？
    A: dashboard 整个被同步 import 进来了。改成懒加载可以把它挪出首帧。
    U: 懒加载之后会闪一下白屏吗？
    A: 会有一帧 fallback，用 splash 占位就看不出来。
    U: 两个都改，看看效果。
    A: 改完冷启动 1.72 秒，降了 380ms。剩下的主要在 bundle 解析。
    `,
  ),
  transcript(
    "sess-w03-cache-stampede",
    "api-gateway",
    "边缘缓存击穿",
    "2026-04-21T18:50:00.000Z",
    `
    U: 刚才上线之后边缘直接被打满了。
    A: 部署清空了边缘缓存，峰值流量同时回源。回源 QPS 从平时 200 涨到 4800。
    U: 缓存清空是必要的吗？
    A: 那次是因为改了响应结构，旧缓存不能继续用。但可以不一次全清。
    U: 怎么避免同时回源？
    A: 用 stale-while-revalidate。缓存过期后先返回旧值，后台异步回源刷新，
       这样不会所有请求都等新值。
    U: max-age 设多少？
    A: 30 秒，配 120 秒的 stale-while-revalidate。短 max-age 保证新鲜度，
       stale 窗口吸收回源压力。
    U: 为什么不干脆设长 TTL？
    A: 长 TTL 的数据新鲜度不够，而且过期时刻仍然会有一批请求同时回源，
       只是把问题推迟了。
    U: 那就 30 加 120。
    A: 已经改了 src/cache.ts。
    `,
  ),
  conversation(
    "sess-w03-measure-first",
    "web-console",
    "先量再改",
    "2026-06-28T11:00:00.000Z",
    "这个组件看着就慢，能不能直接先优化了再说？",
    "先录一次 profile。上次凭感觉改的那个组件，实际只占 3% 的渲染时间。",
    "那次改了多少？",
    "改了两百行，整体快了不到 1%。",
  ),
  conversation(
    "sess-w03-dashboard-scale",
    "web-console",
    "默认视图数据量",
    "2026-06-20T08:00:00.000Z",
    "默认视图到底多少数据？",
    "12 条系列，每条约 5000 点，表格 5000 行。",
    "这是常见情况还是极端情况？",
    "P50 是 8 条系列，P95 到 12 条。按 12 条设计不算过度。",
  ),
  conversation(
    "sess-w03-css-modules",
    "web-console",
    "样式方案",
    "2026-02-19T09:30:00.000Z",
    "新组件用 CSS modules 还是 styled-components？",
    "CSS modules。运行时零开销，虚拟化那块每帧都在挂节点，不想再加运行时样式计算。",
  ),
  conversation(
    "sess-w03-playwright",
    "web-console",
    "时序断言写法",
    "2026-07-08T14:20:00.000Z",
    "Playwright 里这个性能断言怎么写才稳？",
    "断交互延迟，不要断测试总时长。总时长受 CI 负载影响会随机失败。",
  ),
  conversation(
    "sess-w03-a11y",
    "web-console",
    "虚拟列表可访问性",
    "2026-07-24T16:00:00.000Z",
    "虚拟化之后屏幕阅读器读到的行数是不是就只有视口那些？",
    "如果不处理就是。aria-rowcount 要报全量行数，aria-rowindex 按真实索引给。",
  ),
  conversation(
    "sess-w03-strict-null",
    "web-console",
    "strict null 迁移",
    "2026-06-11T10:30:00.000Z",
    "这个模块开 strictNullChecks 报了七十多个错。",
    "在边界处收窄，不要每个使用点都加判断。入口校验一次，内部就能假设非空。",
  ),
  conversation(
    "sess-w03-webgl-loss",
    "three-viewer",
    "WebGL context 丢失",
    "2026-06-05T15:10:00.000Z",
    "切后台再回来场景变黑了。",
    "context 丢了。restore 的时候要重建纹理和 buffer，旧 handle 不能复用。",
  ),
  conversation(
    "sess-w03-d3-habit",
    "web-console",
    "scale 使用习惯",
    "2026-02-18T09:00:00.000Z",
    "我习惯在组件里直接建 d3 scale，这样不好吗？",
    "在渲染里建就会每次产生新对象。放到渲染外面算好，传值进来。",
  ),
  transcript(
    "sess-w03-row-height",
    "web-console",
    "行高统一",
    "2026-07-23T11:20:00.000Z",
    `
    U: 虚拟化要求行高固定，现在哪些行高不一致？
    A: 统计了一下：

         行数    行高    原因
         4812    36px   正常
         188     56px   名称列换行
          --     56px   标签列在窄屏换行（视窗口宽度）

    U: 换行的是哪两列？
    A: 系列名称列和标签列。名称超过 28 个字符就换行。
    U: 截断会不会让名称看不全？
    A: 会，所以配 tooltip。名称的完整值放 title，hover 能看到。
    U: 标签列呢？标签可能有好几个。
    A: 标签列改成只显示前两个，其余折叠成 +N，点开是弹层。
    U: 那就这么改，行高统一 36。
    A: 记下。这也让总高度可以直接用行数乘 36 算出来。
    `,
  ),
  transcript(
    "sess-w03-sort-location",
    "web-console",
    "排序位置",
    "2026-07-23T11:45:00.000Z",
    `
    U: 现在排序在哪做的？
    A: Dashboard 里的 useMemo：

         const sorted = useMemo(() => [...series].sort((a, b) => b.peak - a.peak), [series]);

       5000 条约 12ms，每次 series 变化都重跑。
    U: 12ms 好像还能接受？
    A: 单看可以，但它在渲染路径里，和渲染开销叠加。而且它复制了整个数组，
       5000 个对象的浅拷贝也有成本。
    U: 挪到哪合适？
    A: 数据层。视口只需要有序的索引，不需要在渲染时得到有序数组。
    U: 用 worker 呢？
    A: 5000 条不值得开 worker，通信开销比排序本身还大。数据层就够。
    U: 那先挪数据层。
    A: 好。如果以后到五万条再考虑 worker。
    `,
  ),
  transcript(
    "sess-w03-bundle-budget",
    "web-console",
    "依赖体积预算",
    "2026-07-25T10:30:00.000Z",
    `
    U: 虚拟化要引入的那个库多大？
    A: gzip 后 14kB。首屏 bundle 现在 180kB。
    U: 预算是多少？
    A: 单个新依赖不超过 20kB gzip。14kB 在预算内。
    U: 20kB 这个数是怎么来的？
    A: 按 3G 下首屏 5 秒的目标反推。180kB 已经接近上限，再加 20kB 就会超。
    U: 有没有更小的替代？
    A: 有个 6kB 的，但它不支持动态行高，也没有可访问性处理。
       我们行高固定，但 aria 那部分要自己写。
    U: 自己写 aria 的话工作量多少？
    A: 大概半天，主要是 rowcount 和 rowindex 的映射。
    U: 那用 14kB 那个，省下半天。
    A: 好。它的 aria 处理已经是全量行数而不是视口行数，正好符合要求。
    `,
  ),
  transcript(
    "sess-w03-a11y-rowcount",
    "web-console",
    "窗口化列表的 aria",
    "2026-07-24T16:10:00.000Z",
    `
    U: 虚拟化之后屏幕阅读器读到的是视口那 30 行吗？
    A: 如果不处理就是。默认情况下 DOM 里只有 30 行，阅读器就只知道 30 行。
    U: 那要改什么？
    A: 两个属性。aria-rowcount 放在容器上，报全量行数；
       aria-rowindex 放在每行上，用真实索引而不是视口内的序号。
    U: 真实索引从哪来？
    A: 窗口容器本来就要算视口起止索引，加上偏移就是真实索引。
    U: 排序之后索引会变吧？
    A: 会，但排序后的顺序就是用户看到的顺序，aria 索引跟着排序后的位置走是对的。
    U: 有没有办法验证？
    A: 用 VoiceOver 或者 NVDA 读一遍，确认它报的总行数是 5000 而不是 30。
    `,
  ),
  transcript(
    "sess-w03-picking",
    "three-viewer",
    "合并后的拾取",
    "2026-05-26T14:00:00.000Z",
    `
    U: 合并几何之后还能点选单个墙面吗？
    A: 不能直接点选。合并之后一个 mesh 里有几百个墙面，raycast 只能告诉你打到了
       这个合并体，不知道是哪一段。
    U: 那编辑模式怎么办？
    A: 两个方案。一是维护 id 到顶点区间的映射，raycast 拿到面索引之后反查；
       二是编辑模式单独加载未合并版本。
    U: 映射那个方案性能如何？
    A: 查询很快，但要维护额外的数据结构，几何变更时容易不同步。
    U: 编辑模式的性能要求高吗？
    A: 不高。编辑时视角通常固定在局部，可见 mesh 数量本来就少。
    U: 那就编辑模式加载未合并版本，浏览模式用合并的。
    A: 记下。两个版本从同一份数据构建，不会不同步。
    `,
  ),
  conversation(
    "sess-w03-summary-bar",
    "web-console",
    "汇总条的数据来源",
    "2026-07-19T14:30:00.000Z",
    "顶部汇总条是从表格数据算的还是单独取的？",
    "从同一份可见系列算。它和导出面板都走 pickVisible，所以改那个函数会影响三处。",
  ),
  conversation(
    "sess-w03-export-panel",
    "web-console",
    "导出范围",
    "2026-07-17T10:00:00.000Z",
    "导出是导全部还是当前可见？",
    "当前可见，和汇总条一致。都用 pickVisible 取。",
  ),
  conversation(
    "sess-w03-tooltip-cost",
    "web-console",
    "tooltip 开销",
    "2026-07-24T09:30:00.000Z",
    "行里加 tooltip 会不会又把渲染开销加回来？",
    "用原生 title 属性不会，它不产生额外节点。自定义 tooltip 组件才会。",
  ),
  conversation(
    "sess-w03-scroll-perf",
    "web-console",
    "滚动帧率",
    "2026-07-20T15:00:00.000Z",
    "滚动现在多少帧？",
    "42ms 一帧，大约 24fps。全量渲染时滚动要重算所有行的位置。",
  ),
  conversation(
    "sess-w03-series-p95",
    "web-console",
    "系列数量分布",
    "2026-06-20T08:30:00.000Z",
    "12 条系列是最坏情况吗？",
    "P95。P50 是 8 条，最多见过 15 条。按 12 条设计不算过度。",
  ),
  conversation(
    "sess-w03-lazy-fallback",
    "mobile-shell",
    "懒加载占位",
    "2026-05-15T10:00:00.000Z",
    "dashboard 改懒加载之后会闪一下吗？",
    "会有一帧 fallback。用 splash 占位就看不出来，因为 splash 本来就在显示。",
  ),
  conversation(
    "sess-w03-analytics-defer",
    "mobile-shell",
    "analytics 延后",
    "2026-05-14T10:30:00.000Z",
    "analytics 延后会丢事件吗？",
    "不会，事件先入队。它只是不在首帧之前建连。",
  ),
  conversation(
    "sess-w03-stale-window",
    "api-gateway",
    "stale 窗口长度",
    "2026-04-22T14:00:00.000Z",
    "stale-while-revalidate 设 120 秒的依据是什么？",
    "回源刷新 P99 是 800ms，120 秒有充足余量，同时不会让用户看到太旧的数据。",
  ),
  conversation(
    "sess-w03-strict-null-boundary",
    "web-console",
    "收窄位置",
    "2026-06-11T11:00:00.000Z",
    "边界收窄具体指哪一层？",
    "接口响应解析那一层。解析完就保证非空，往下传的类型里不再带 undefined。",
  ),
];
