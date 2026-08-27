# Gate C02

- status: `PASSED`
- branch: `codex/task1-code-c02-v1a`
- parent integration commit: `ff8815b63e6afb6f4579d8dbc324f290d9bef0b1`
- verified implementation commit: `8aa7f86a41a8da78ef355ebbac246896d92fb6be`
- verified artifact commit: `cb0716a984993aac6636edc5ec255e40583cafc3`
- merge commit: `5ef7c7e5dec6976e8b514a328b55856949739a69`
- scope: V1a 共享调用协议、RuntimeToolContract 驱动的 endpoint/body 校验、Prompt/Token/Hash 冻结；不含行为语义去重、Tool/No-Tool Gate、Family Gate、选择校准、布局调整或 Capability 裁剪
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- 新增 `protocol-compact` Renderer，严格接在 `contract-corrected` 之后；`compact` 及后继 profile 在各自阶段开始前继承该 Renderer。
- Prompt Surface Coordinator 从固定 Capability Signature 计算 active family mask，并按稳定 family 顺序选择唯一 execution-grammar host。
- 在现有 family 顶层标签内部注入一次共享协议，没有新增顶层 XML 块，也没有改变 Hook id、point、anchor、priority 或物理注入位置。
- 共享一次 POST、JSON、Content-Type、Service/Session Header、endpoint 组合、响应信封、错误分类和 bytes 例外；全 Prompt 仅保留一个 canonical curl form。
- Memory 与 Skill 每个 family 只保留一次 endpoint-base 和 runtime header 绑定，工具卡只保存相对 path、body 与原有选择/用途说明。
- Knowledge 将重复的两套完整 curl 外壳编译为 `/tools/list` 与 `/tools/call` 两张合同卡，资源 URL 与遥测 Header 只声明一次。
- RuntimeToolContract 作为 endpoint 和 body 校验真值；Compiler 对每个渲染工具验证合同存在、path 属于正确 family base、required args 齐全且 forbidden args 不出现。
- Memory guide 与 Skill listing 只删除 transport 示例/引用，必须调用、何时调用、何时不调用等决策语义留给 C03/C04，未在本阶段改写。

## 深模块与接口边界

共享协议的实现集中在 `src/injection/tool-prompt/protocol-compact.ts`，外部仍只需调用 `compileToolPrompt()`：

- Injector 不新增 V1a 专用配置或互相协调接口。
- Compiler 内部消费已有 `capabilitySignature` 和 RuntimeToolContract。
- Surface Coordinator 负责唯一宿主决策。
- Tests 与生产调用者都通过 Compiler seam 验证结果，不读取内部转换状态。

这保持了 Compiler 模块的深度和改造 locality；删除该模块会迫使五个 surface 各自重新实现协议压缩与合同校验。

## 变更范围

生产代码限定为：

- `src/injection/tool-prompt/protocol-compact.ts`
- `src/injection/tool-prompt/compiler.ts`
- `src/injection/tool-prompt/profiles.ts`
- `src/injection/tool-prompt/surface-coordinator.ts`
- `src/injection/tool-prompt/index.ts`

测试与冻结产物限定为 Compiler 测试、stage capture 脚本、C02 Variant 文件和本 Gate。没有修改原始 Renderer、Bridge、Core、Handler、Adapter、Agent Profile、InjectionPipeline、数据集、World、Runner、Scorer 或模型配置。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、43 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 冻结的 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-c02` | 0 | 生成 6 个 profile、18 个 Prompt 文件和 2 个差异/转换文件；提交后复跑工作树保持 clean |
| `npx tsc --noEmit --pretty false` | 2 | 54 条既有生产基线诊断，本阶段相关文件新增诊断 0 |
| `git diff --check` | 0 | 无 whitespace error |

### 类型诊断基线

- `codex/task1-v0-baseline`：54 条诊断。
- C02：54 条诊断。
- 使用“去除 `(line,column)`、排序、UTF-8 SHA-256”的同一标准化方式，两者指纹均为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。
- `tool-prompt`、`protocol-compact`、Compiler 测试和 capture 脚本新增诊断数为 0。

## 合同与结构门禁

- 七种非空 Memory/Skill/Knowledge family mask 均验证共享协议恰好出现一次，canonical curl form 恰好出现一次。
- Safe Parser 成功解析由 compact Memory 卡的 `endpoint-base + path + headers + body` 重建出的调用。
- full-readonly 与 allow-write 两种 Skill surface 都经过 required/forbidden args 验证；五个写工具的 `expected_version` 保持存在。
- V1a 保留 V0-C 的全部 Memory/Skill 工具；Knowledge 原有两步操作被显式编译为两张合同卡，没有新增运行时 endpoint。
- CodeBuddy、Claude Code、WorkBuddy、Pi、无 anchor fallback，以及有 Task/无 Task 两种 Session shape 的 Provider-visible 结果均通过。
- `legacy` 与 C00、`contract-corrected` 与 C01 的 `injection.txt`/`prompt.txt` 均由生成脚本逐字节比较；不相同会直接失败。
- `compact`、`selection-calibrated`、`capability-pruned` 当前逐字节继承 `protocol-compact`，没有提前混入 C03 至 C05 改造。

机器清单：

- `variants/c02/protocol-compaction.json`
- `variants/c02/v0c-to-v1a-diff.json`

## Prompt 与 Token 冻结结果

规范 Capability Signature：

```text
memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0
```

| 指标 | V0-C | V1a | Delta |
|---|---:|---:|---:|
| Total injection bytes | 18,129 | 16,326 | -1,803 |
| Total injection tokens (`o200k_base`) | 5,126 | 4,413 | -713 (-13.9%) |
| Provider-visible system bytes | 18,338 | 16,535 | -1,803 |
| Provider-visible system tokens (`o200k_base`) | 5,179 | 4,466 | -713 |
| Diagnostic static-template tokens | 4,824 | 4,216 | -608 |
| Dynamic-asset tokens | 201 | 201 | 0 |
| Runtime-binding tokens | 65 | 65 | 0 |

相对原始 V0 的 4,863 total injection tokens，V1a 已减少 450 tokens（约 9.3%）。

逐块 Token delta（相对 V0-C）：

- `skill_tools`: `-348`
- `knowledge_tools`: `-304`
- `available_skills`: `-22`
- `tdai_profile_memory` 中的 memory guide: `-80`
- `tdai_memory_tools`: `+41`，因为它是规范 Fixture 的共享协议唯一宿主

V1a total injection SHA-256 为 `1ca0590a3ed8919995f6e6f1ffdc9240ee67f6229235ca1e39833076168552fa`；Provider-visible system SHA-256 为 `70771044aac4c998fdb69ce0fefc2f402cc1a13048e78e5f5a5292066c9bc429`。相对 V0-C 的首个变化位于 Provider Prompt UTF-8 byte `155`，稳定前缀长度为 `155` bytes。

## 未解决但不阻塞 C02 的事项

- 尚未运行 Luna/Codex 模型，因此本 Gate 不包含有效调用率、误调用率或工具选择正确率结论。
- V1a 只证明协议压缩正确、可执行且静态 Token 更少，不证明行为效果一定优于 V0-C。
- Shared grammar 的唯一宿主由冻结 Capability Signature 决定；按真实资产 Capability 做确定性裁剪属于 C05，不在 C02 改动。
- Prefix 在 byte 155 发生变化已保存；最终 cache 影响必须结合正式运行 usage/cached-input 指标判断。
- Memory/Skill/Knowledge 与 memory guide/listing 之间仍有行为规则重复，这是 C03 的唯一任务，不能在 C02 顺手删除。

## 决策

C02 通过。V1a 相对 V0-C 的变化仅属于调用协议表示与合同驱动的 transport 编译，决策规则、动态资产和注入布局未变；静态 Prompt Token 明显下降，所有祖先 profile 可复现。允许以非 squash merge 合回 `codex/task1-code-integration`；集成主线复跑通过并补记 merge commit 后，才能创建 `codex/task1-code-c03-v1b`。

## 集成主线复跑

C02 已通过 merge commit `5ef7c7e5dec6976e8b514a328b55856949739a69` 以非 squash 方式合入 `codex/task1-code-integration`。合并后复跑：

- `npm test`：43/43 通过。
- `npm run eval:tool-prompt:validate`：100 case / 100 fixture 通过。
- `npm run eval:tool-prompt:capture-c02`：成功且工作树无变化，Legacy/C01 祖先逐字节比较再次通过。
- `npx tsc --noEmit --pretty false`：仍为 54 条既有诊断，标准化指纹仍为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`，阶段相关新增诊断为 0。
- `git diff --check`：通过。

集成 Gate 通过，允许从包含本记录更新的最新集成提交创建 `codex/task1-code-c03-v1b`。
