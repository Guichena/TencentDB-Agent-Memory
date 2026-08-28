# Gate C05

- status: `PASSED`
- branch: `codex/task1-code-c05-v3`
- parent integration commit: `37aeea09d7813b117998f317a998099d6ff56253`
- verified implementation commit: `3962bf45953eff692540a495f5bfe35592f446e5`
- verified artifact commit: `50e3e22`
- verified test-head commit: `bceacf680235619b5ed675e6f7e3163777d1228a`
- merge commit: `PENDING`
- scope: 在冻结 V2 上只按现有生产能力事实完成 V3 Capability/Lifecycle 确定性裁剪；不含 Query/Gold/历史驱动的动态 Prompt、Bridge 权限或 endpoint 变更、注入位置调整、数据集改造和模型评测
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- 新增 `capability-pruned` Renderer，严格接在正式 V2 `selection-calibrated` 之后；Compiler 仍是 Injector 唯一调用入口。
- 复用生产初始化阶段已有的 Injector 注册状态、Memory/Knowledge 配置、`skillRuntime.allowLlmWrite` 和 `isExtractionAllowed(config, "skill")` 构造进程级 Capability Signature。
- 在单个 Session 内继续与 `AssetCapabilityFlags` 求交：`chat_memory`、`skill`、`llm_wiki`、`code_graph` 只能关闭已有能力，不能越过生产配置打开能力。
- `skill_write=0` 时移除 `skill_create`、`skill_update`、`skill_patch`、`skill_delete`、`skill_files_write`、`skill_files_remove`；`skill_extract=0` 时移除 `skill_extract`。
- Wiki 或 Code Graph 子类型关闭时移除对应动态 `<knowledge>` 资源记录，并把全局 Knowledge 选择行收敛到仍可执行的资源类型。
- Memory、Skill、Knowledge family 关闭时继续使用各 Injector 已有的返回空块路径；共享协议与选择 Gate 只描述有效 family，不保留关闭 family 的 Header、Guide、Listing 或工具卡。
- C05 的 ContextBlock cache key 纳入 Session 有效 Capability Signature；进程级 Hook cache identity 仍包含稳定基础签名。同一 Session、能力与资产快照下 Prompt 字节和 hash 可复现。
- 不新增 `allowLlmExtract`，不改变 Skill/Memory/Knowledge Bridge 的 endpoint、Header、allowlist、身份注入或执行逻辑。

## 深模块与变更边界

Capability 投影集中在 `src/injection/tool-prompt/capability-pruned.ts`：

- `resolveSessionCapabilitySignature()` 只做“生产基础能力 ∩ Session 资产能力”。
- `applyCapabilityPruning()` 只删除不可执行合同、资源与对应选择语义。
- `lintCapabilityPrunedSurface()` 同时检查 family 外壳、工具集合、Knowledge 子类型以及 write/extract 残留。
- `compileToolPrompt()` 返回裁剪后的 `contractIds` 与 `specIds`，审计面和模型可见面一致。
- C04 的 `renderSelectionGate()` 仅增加可选的 capability detail 参数；未传该参数时 V2 和更早输出逐字节不变。

运行时接线只修改五个任务一 Injector：

- `skill-tools-injector.ts`
- `skill-injector.ts`
- `knowledge-tools-injector.ts`
- `tdai-tools-injector.ts`
- `tdai-profile-memory-injector.ts`

没有修改 Bridge、Core、Handler、Adapter、Agent Profile、InjectionPipeline、World、Runner、Scorer、服务配置或模型配置。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、50 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 冻结的 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-c05` | 0 | 生成 6 个 profile、18 个 Prompt 文件、V2→V3 diff、裁剪清单和 9 行能力矩阵；提交后复跑工作树保持 clean |
| `npx tsc --noEmit --pretty false` | 2 | 54 条既有生产基线诊断，本阶段相关文件新增诊断 0 |
| `git diff --check` | 0 | 无 whitespace error |

### 类型诊断基线

- `codex/task1-v0-baseline`：54 条诊断。
- C05：54 条诊断。
- 使用既定标准化方式，基线指纹为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。
- `tool-prompt`、五个 Injector、Compiler 测试和 capture 脚本新增诊断数为 0。

## Capability 与一致性门禁

- 9 个生产支持组合全部通过：`full-readonly`、`full-write-extract`、`memory-only`、`skill-readonly`、`skill-write`、`skill-extract`、`wiki-only`、`code-graph-only`、`skill-and-wiki`。
- 每个组合均保存 Capability Signature、active family、Prompt bytes/token/hash、可见 tool IDs 和 Knowledge resource types。
- 全能力开启（Memory、Skill write、Skill extract、Wiki、Code Graph）时，V3 与 V2 的 `memory-tools`、`memory-guide`、`skill-tools`、`skill-listing`、`knowledge-tools` 五个 surface 逐字节相同。
- 规范 full-readonly 配置只删除 `skill_extract` 及对应生命周期措辞；Runtime Contract、path/body/response、动态 Skill listing、Knowledge 元数据和 L3/L2 Memory 资产没有改写。
- Session capability 只能收窄进程能力；`skill=0` 时 write/extract 必为 0，`knowledge=1` 时至少一个 Wiki/Code Graph 子类型有效，非法签名直接拒绝编译。
- 每个启用组合的共享协议与 Tool/No-Tool Gate 恰好出现一次，可见 `<tool name>` 集合与 Runtime Contract 的能力投影完全一致。
- C05 只在 profile 为 `capability-pruned` 时使用 Session 有效签名；`legacy` 至 V2 的运行时参数和输出路径不变。
- `legacy`、V0-C、V1a、V1、V2 的 `injection.txt` 与 `prompt.txt` 均由 capture 的冻结祖先比较再次验证逐字节不变。

机器清单：

- `variants/c05/capability-matrix.json`
- `variants/c05/capability-pruning.json`
- `variants/c05/v2-to-v3-diff.json`

## Prompt 与 Token 冻结结果

规范 Capability Signature：

```text
memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0
```

| Profile | 版本 | Injection bytes | Injection tokens (`o200k_base`) | Provider tokens | Injection SHA-256 |
|---|---|---:|---:|---:|---|
| `legacy` | V0 | 17,227 | 4,863 | 4,916 | `c84371246a0e9502fdbf78bc11dd98a7eebdf22bd2b26030f66d6206cee3842c` |
| `contract-corrected` | V0-C | 18,129 | 5,126 | 5,179 | `8b3a11049a2125edef37db75e27f117a9f384f52e756b52287d493e70450594b` |
| `protocol-compact` | V1a | 16,326 | 4,413 | 4,466 | `1ca0590a3ed8919995f6e6f1ffdc9240ee67f6229235ca1e39833076168552fa` |
| `compact` | V1 | 14,690 | 4,027 | 4,080 | `444be855524cb01e8c0377eba8b36b9b4da8911f20e4df14b8bba7dfc24e8167` |
| `selection-calibrated` | V2 | 9,081 | 2,308 | 2,361 | `80d6f7f3e2289649d62280fa87a41372938eab35c2f0f27095261c9af045bc03` |
| `capability-pruned` | V3 | 8,713 | 2,224 | 2,277 | `625dba5f8a74df608c3fcabd92b9cc9aea191e4c1d14c89df70d28767587f607` |

规范 full-readonly 下，V3 相对 V2 减少 368 bytes、84 tokens（约 3.6%）；相对原始 V0 减少 2,639 tokens（约 54.3%）。V2→V3 的 Provider-visible system token delta 同为 -84。

逐块 Token delta（相对 V2）：

- `skill_tools`: `-76`
- `tdai_memory_tools` 中唯一共享 Gate 宿主的 Skill lifecycle 措辞：`-8`
- `available_skills`: `0`
- `knowledge_tools`: `0`
- `tdai_profile_memory`: `0`

V3 Provider-visible system SHA-256 为 `ce4fe51c20b815e0288c3b54bcd355b9003f93f48539479f3d1a06d2bb762e70`。相对 V2 的首个变化位于 Provider Prompt UTF-8 byte `1714`，稳定前缀长度为 `1714` bytes。能力矩阵使用同时含 Wiki 与 Code Graph 的独立夹具，因此矩阵行 token 用于组合内审计，不替代规范 full-readonly 的 2,224 token 主指标。

## 未解决但不阻塞 C05 的事项

- 尚未运行 Luna/Codex 模型，因此本 Gate 不包含有效调用率、误调用率或工具选择正确率结论。
- V3 的静态合同、能力一致性和 token 门禁通过不等于行为收益已经证明；正式 Dev 评测必须保留 V0 至 V3 全部候选。
- Session capability 改变时 Prompt 与 ContextBlock cache key 会有意改变；真实上游 cached-input 命中率仍需正式链路运行记录判断。
- Knowledge family 已启用但当前 Session 无任何匹配资源时，现有 Knowledge Injector 返回空块；C05 没有为此增加跨 Hook 的运行时协调器。
- 本阶段没有修改 runner 的真实 profile 选择验证和全版本总清单；这些属于 C06 代码冻结范围。

## 决策

C05 通过。V3 只按生产已有能力事实删除不可执行暴露面，未改变工具执行合同、动态资产内容、注入位置或权限。允许以非 squash merge 合回 `codex/task1-code-integration`；集成主线复跑通过并补记 merge commit 后，才能创建 `codex/task1-code-c06-freeze`。
