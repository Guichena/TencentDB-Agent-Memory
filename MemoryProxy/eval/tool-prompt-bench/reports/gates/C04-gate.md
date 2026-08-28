# Gate C04

- status: `PASSED`
- branch: `codex/task1-code-c04-v2`
- parent integration commit: `93381f712365fa26836f85c80e33c1e3bf8437aa`
- verified implementation commit: `a0d6e5fc0f97c79e63bd1865f2fceeefff5979f5`
- verified artifact commit: `b9bfdca`
- scope: 在冻结 V1 上完成 V2 Tool/No-Tool 与 Family 选择校准；不含注入位置调整、动态资产改写、Capability 裁剪、Query/Gold/历史驱动的动态 profile 或模型评测
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- 新增 `selection-calibrated` Renderer，严格接在正式 V1 的 `semantic-compact` 之后；`capability-pruned` 在 C05 开始前逐字节继承 V2。
- 在既有共享协议宿主内增加一个最短全局 Tool/No-Tool Gate，并只渲染当前 Capability Signature 已启用的 Memory、Skill、Knowledge family 行。
- 明确 No-Tool 边界：纯/自包含 coding、通用知识、当前上下文已足够、需要本地工作树精确/最新源码时不调用注入工具。
- 明确正向边界：缺失信息确实由持久资产提供，或支持的资产 lifecycle/write 动作与工具卡匹配时才调用；后者避免全局 Gate 与 `skill_extract/create/update/delete` 等生命周期卡矛盾。
- Memory、Skill、Knowledge 工具卡统一为真实 `path`、`body`、必要 `response` 与中性 `when/avoid/contrast`，删除冗长 `use/returns` 推广说明。
- 中立化 `<available_skills>` 固定包装文案：可见 Skill 是候选工作流，不因存在或关键词重合而调用；动态 Skill 条目、顺序和可见范围逐字节保持。
- Memory guide 只保留检索预算、空结果禁止编造、L2 path 不重复读取三条操作约束；全局选择 Gate 与工具卡拥有选择语义。
- Knowledge 保留资源元数据、真实 endpoint/Header、list/call 卡及动态子工具约束；移除重复且有偏的长篇调用推广。
- 修正 `skill_delete` 的 ToolPromptSpec，使 V2 `when` 与 C01 已确认的“物理删除全部版本”合同一致，不再错误写成 archived。

## 深模块与变更边界

选择校准集中在 `src/injection/tool-prompt/selection-calibrated.ts`，外部仍只调用 `compileToolPrompt()`：

- Injector 不新增 V2 参数或互相协调接口。
- Compiler 复用 RuntimeToolContract 的工具存在性、response kind 与 C02 已生成的 path/body。
- ToolPromptSpec 成为 `when/avoid/contrast` 的唯一模型决策来源，不复制 transport 真值。
- Surface Coordinator 继续选择唯一 policy host；没有新增顶层 XML 块、Hook 或注入点。

生产代码限定为：

- `src/injection/tool-prompt/selection-calibrated.ts`
- `src/injection/tool-prompt/compiler.ts`
- `src/injection/tool-prompt/profiles.ts`
- `src/injection/tool-prompt/index.ts`
- `src/injection/tool-prompt/specs/skill.ts`

验证代码与冻结产物限定为 Compiler 测试、stage capture 脚本、package capture 命令、C04 Variant 文件和本 Gate。没有修改原始 Renderer、Bridge、Core、Handler、Adapter、Agent Profile、InjectionPipeline、数据集、World、Runner、Scorer、服务配置或模型配置。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、47 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 冻结的 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-c04` | 0 | 生成 6 个 profile、18 个 Prompt 文件和 2 个差异/选择策略文件；提交后复跑工作树保持 clean |
| `npx tsc --noEmit --pretty false` | 2 | 54 条既有生产基线诊断，本阶段相关文件新增诊断 0 |
| `git diff --check` | 0 | 无 whitespace error |

### 类型诊断基线

- `codex/task1-v0-baseline`：54 条诊断。
- C04：54 条诊断。
- 使用既定标准化方式，两者指纹均为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。
- `tool-prompt`、Compiler 测试和 capture 脚本新增诊断数为 0。

## 选择、合同与偏置门禁

- 七种非空 Memory/Skill/Knowledge family mask 均验证全局选择 Gate 恰好出现一次，启用 family 行各一次，关闭 family 行为零。
- Description Bias Lint 确认静态 Prompt 不含 `mandatory`、`partially relevant`、`MUST load`、`Err on the side`、`always better`、`outperform` 及 Knowledge 强制推广措辞；动态资产先排除再 lint，避免把用户资产误判为固定 Prompt。
- Selection Contradiction Lint 确认 Tool/No-Tool 边界齐全，每张可见工具卡恰好一个 `when`、没有旧 `use/returns`、`when` 与 `avoid` 不相同、所有 contrast 目标均实际可见。
- 全局 Gate 同时容纳读取和 asset lifecycle/write 动作，不与 `skill_extract` 或 allow-write 卡矛盾。
- V1 与 V2 的全部 `<tool name>`、`path` 和 `body` 逐项相同；Skill bytes 下载显式保留 `response: bytes`。
- Skill dynamic listing、Knowledge resource metadata、L3/L2 动态 Memory 的 SHA-256 均与 V1 相同。
- CodeBuddy、Claude Code、WorkBuddy、Pi、无 anchor fallback，以及有 Task/无 Task两种 Session shape 的 Provider-visible 结果均通过。
- `legacy` 与 C00、`contract-corrected` 与 C01、`protocol-compact` 与 C02、`compact` 与 C03 的 `injection.txt`/`prompt.txt` 均逐字节冻结。
- `capability-pruned` 当前逐字节继承 `selection-calibrated`，没有提前混入 C05 改造。

机器清单：

- `variants/c04/selection-policy.json`
- `variants/c04/v1-to-v2-diff.json`

## Prompt 与 Token 冻结结果

规范 Capability Signature：

```text
memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0
```

| 指标 | V1 | V2 | Delta |
|---|---:|---:|---:|
| Total injection bytes | 14,690 | 9,081 | -5,609 |
| Total injection tokens (`o200k_base`) | 4,027 | 2,308 | -1,719 (-42.7%) |
| Provider-visible system bytes | 14,899 | 9,290 | -5,609 |
| Provider-visible system tokens (`o200k_base`) | 4,080 | 2,361 | -1,719 |
| Diagnostic static-template tokens | — | 2,111 | — |
| Dynamic-asset tokens | 201 | 201 | 0 |
| Runtime-binding tokens | 65 | 65 | 0 |

相对原始 V0 的 4,863 total injection tokens，V2 减少 2,555 tokens（约 52.5%）；相对 V0-C 的 5,126 tokens，减少 2,818 tokens（约 55.0%）。

逐块 Token delta（相对 V1）：

- `skill_tools`: `-322`
- `available_skills`: `-132`
- `knowledge_tools`: `-616`
- `tdai_memory_tools`: `-49`
- `tdai_profile_memory` 中的 memory guide: `-600`

V2 total injection SHA-256 为 `80d6f7f3e2289649d62280fa87a41372938eab35c2f0f27095261c9af045bc03`；Provider-visible system SHA-256 为 `420680e1be50559bc9a3e416029d98001ec987087ec7fa8b59c0f3b5ba70fdf2`。相对 V1 的首个变化位于 Provider Prompt UTF-8 byte `443`，稳定前缀长度为 `443` bytes。

## 未解决但不阻塞 C04 的事项

- 尚未运行 Luna/Codex 模型，因此本 Gate 不包含有效调用率、误调用率或工具选择正确率结论。
- V2 的静态逻辑与 token 门禁通过不等于行为收益已被证明；正式 Dev 评测必须同时保留 V1 与 V2，若 V1 的行为指标更好，V1 仍可成为最终候选。
- `capability-pruned` 尚未按 `allowLlmWrite`、`isExtractionAllowed()` 或 family/resource 配置裁剪工具卡与外壳；这是 C05 的唯一任务。
- 全局 Gate 位于既有唯一 policy host，物理 Hook/anchor 未移动；独立 Layout Probe 不在 C04 范围。
- Prompt cache 的真实 cached-input 命中仍需正式运行数据判断；本阶段只保存稳定前缀与 hash。

## 决策

C04 通过。V2 仅改变静态选择语义和中性描述，Runtime Contract、共享协议、工具执行字段、动态资产、注入位置和 Capability 配置均保持。允许以非 squash merge 合回 `codex/task1-code-integration`；集成主线复跑通过并补记 merge commit 后，才能创建 `codex/task1-code-c05-v3`。
