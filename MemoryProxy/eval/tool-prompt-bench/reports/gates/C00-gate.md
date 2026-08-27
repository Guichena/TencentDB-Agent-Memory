# Gate C00

- status: `PASSED`
- branch: `codex/task1-code-c00-compiler`
- verified implementation commit: `60bbcf62d1d447d930247e88c343e5f8aa65ad93`
- branch head: Gate 记录与冻结产物所在提交（本文件提交）
- parent integration commit: `5832020bc5116782a1ea8baf09637c4e059ae077`
- merge commit: 待以 `--no-ff` 合回 `codex/task1-code-integration` 后补记
- scope: C00 Compiler、Variant seam、Runtime Contract、Prompt Spec、PromptUnit、缓存隔离、Legacy parity 和静态 Token/Hash 冻结
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- 新增 `injection.toolPromptProfile`，默认值为 `legacy`；未知值在配置构建时直接失败。
- 冻结递进 profile：`legacy -> contract-corrected -> protocol-compact -> compact -> selection-calibrated -> capability-pruned`。
- 建立 Memory、Skill、Knowledge 的 RuntimeToolContract 和决策 Spec，并把 Bridge allowlist 导出为合同证据。
- 建立确定性的 Compiler、PromptUnit 和 Prompt Surface Coordinator。
- `legacy` 继续走原有 Renderer；五个候选 profile 走 Compiler 的 frozen-compatibility renderer。
- 接入 `tdai_memory_tools`、`memory-tools-guide`、`skill_tools`、`available_skills` 外围规则和 `knowledge_tools` 五个任务一表面；动态画像、场景索引、Skill Listing 和 Knowledge Resource 内容仍由原 Injector 产生。
- Hook id、point、anchor、priority、cacheStrategy 和物理注入位置保持不变。
- Pipeline persisted hook cache 使用 profile + capability 的独立 cache identity；Legacy 继续使用历史 hook id。
- 增加可重复生成的 C00 Prompt、Token、Hash 与稳定前缀产物。

## 变更范围

实现提交共修改或新增 28 个文件，范围限定为：

- `src/injection/tool-prompt/` Compiler 模块。
- 五个任务一相关 Injector 的 profile 接入。
- Injection Pipeline 和 prewarm 的 cache identity。
- 配置类型、默认值、示例和启动日志。
- Memory/Skill Bridge allowlist 的只读导出，不改变转发行为。
- C00 合同与 Provider-visible parity 测试。
- C00 Token/Hash 产物生成脚本。

没有修改 Handler 路由、Bridge 执行语义、Core API、Session 注册合同、Agent Profile 实现、数据集 case、World 或模型运行逻辑。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、39 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 冻结的 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-c00` | 0 | 生成六个 profile 的注入内容、Provider Prompt 与 manifest，共 18 个文件 |
| `npx tsc --noEmit --pretty false` | 1 | 54 条生产基线诊断；本阶段新增诊断为 0 |
| `git diff --check` | 0 | 无 whitespace error |

### 类型诊断基线

- `codex/task1-v0-baseline` 诊断数：54。
- C00 诊断数：54。
- 去除因本阶段在 Bridge 文件顶部导出 allowlist 而产生的行号变化后，两边诊断指纹相同：`ba86b0be746c3844b3fe2763478117a6c2f0d053a2f8e147ebd15627173a8598`。
- C00 新模块、测试、Artifact 脚本和被改 Injector 的新增诊断数：0。
- 这些诊断是 `5299c00` 上已有的生产基线问题，本任务不顺手修改。

## Legacy parity 覆盖

Provider-visible parity 测试覆盖：

- CodeBuddy / OpenAI。
- Claude Code / Anthropic。
- WorkBuddy / OpenAI。
- Pi / OpenAI。
- 未识别 AgentProfile 的无 anchor fallback。
- 有 Task 和无 Task 两种 Session identity。
- 五个候选 profile 相对 Legacy 的完整序列化请求体比较。

结果：所有组合逐对象相等；现有 XML 标签、Markdown/Label 结构、Hook 顺序和注入位置均未改变。

## Prompt 与 Token 冻结产物

产物目录：`eval/tool-prompt-bench/variants/c00/<profile>/full-readonly/`。

每个 profile 保存：

- `injection.txt`：规范输入下五个生产注入块的任务一总注入内容。
- `prompt.txt`：上述注入块经过真实 InjectionPipeline 和 CodeBuddy AgentProfile 后的完整 Provider-visible system 内容。
- `manifest.json`：逐块 chars、UTF-8 bytes、`o200k_base` tokens、SHA-256、静态模板、动态资产、运行绑定、稳定前缀和首次变化位置。

六个 profile 的 C00 结果一致：

| 字段 | 值 |
|---|---:|
| Total injection bytes | 17,227 |
| Total injection tokens (`o200k_base`) | 4,863 |
| Total injection SHA-256 | `c84371246a0e9502fdbf78bc11dd98a7eebdf22bd2b26030f66d6206cee3842c` |
| Provider-visible system bytes | 17,436 |
| Provider-visible system tokens (`o200k_base`) | 4,916 |
| Provider-visible system SHA-256 | `69e866ec8b97dd65177d08f9d42bf703bdf6dbea1df2c760bb5f666926166f95` |
| Diagnostic static-template tokens | 4,579 |
| Diagnostic dynamic-asset tokens | 201 |
| Diagnostic runtime-binding tokens | 65 |
| First changed byte from parent | `null` |
| Stable prefix bytes | 17,436 |

静态模板、动态资产和运行绑定分别编码，受 tokenizer 边界影响不能相加；`totalInjectionTokens=4,863` 是规范 Prompt 的权威总量。实际 Provider usage、cached input 和模型输出 Token 属于正式 Campaign 产物，本阶段没有运行模型，不能用规范冻结值代替。

## 未解决但不阻塞 C00 的事项

- `contract-corrected` 至 `capability-pruned` 在 C00 有意继承相同字节；各自的唯一改造必须留在 C01 至 C05。
- RuntimeToolContract 已由 Bridge allowlist 和 Core Schema 静态核对，真实 Contract Probe 属于 C01。
- 当前规范产物用于证明确定性、字节 parity 和计量链路；它不是正式 World 数据或模型效果结论。
- 全量类型检查的 54 条生产基线诊断继续保留，不影响本阶段测试与 Prompt 编译路径。

## 决策

C00 通过。它完成了 V6.1 要求的完整 Compiler 主路径和公平切换基础，且没有改变 Legacy 生产 Prompt，也没有提前混入后续优化。允许将本阶段以非 squash 方式合回 `codex/task1-code-integration`；集成主线复跑关键检查通过后，才能从新的集成提交创建 `codex/task1-code-c01-v0c`。
