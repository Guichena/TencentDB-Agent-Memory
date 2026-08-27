# Gate C03

- status: `PASSED`
- branch: `codex/task1-code-c03-v1b`
- parent integration commit: `13b523f2cc421a41a912254e6c6c6b5e42508c79`
- verified implementation commit: `fa42fb24b8a6b3d5e6b06a946726395d6a585f78`
- verified artifact commit: `307e964`
- merge commit: `87483d5aa4786a15ca8f7136879a09682dca366c`
- scope: 在冻结 V1a 上完成 V1b Semantic Dedup，并以 `compact` profile 形成正式 V1；不含 Tool/No-Tool Gate、Family Gate、when/avoid/contrast、描述去偏、布局调整或 Capability 裁剪
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- 新增 `semantic-compact` Renderer，严格接在 `protocol-compact` 之后；`selection-calibrated` 与 `capability-pruned` 在各自阶段开始前逐字节继承正式 V1。
- 为 10 个被去重的行为语义建立稳定 id、删除位置、唯一保留位置与理由，并由 Duplicate Semantic Unit Lint 校验。
- Memory 工具目录不再重复 Memory guide 已拥有的能力声明、触发概述、拒绝禁止、层级概述、检索预算和 L2 path 去重规则。
- Memory 与 Skill 的 session 身份规则由共享执行协议唯一拥有，并根据实际启用 family 渲染为 `memory`、`skill` 或 `memory / skill`；Knowledge-only 不注入无关身份说明。
- Skill listing 将多次重复强化的 mandatory-load 说明压成一条同等强度的规则，并删除其逻辑反面的重复 skip 句。
- 保留不能证明等价的约束：Memory 5xx/4xx 重试策略、云端 Skill 不可用 `read_file / tool_use` 访问、Knowledge `files` 每资源每会话一次，以及 wiki 禁止全量 `list_pages`。Knowledge 块因此在 C03 规范能力面上逐字节不变。

## 变更边界

生产代码限定为：

- `src/injection/tool-prompt/semantic-compact.ts`
- `src/injection/tool-prompt/compiler.ts`
- `src/injection/tool-prompt/profiles.ts`
- `src/injection/tool-prompt/index.ts`

验证代码与冻结产物限定为 Compiler 测试、stage capture 脚本、package capture 命令、C03 Variant 文件和本 Gate。没有修改原始 Renderer、Bridge、Core、Handler、Adapter、Agent Profile、InjectionPipeline、数据集、World、Runner、Scorer、服务配置或模型配置。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、45 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 冻结的 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-c03` | 0 | 生成 6 个 profile、18 个 Prompt 文件和 2 个差异/语义所有权文件；提交后复跑工作树保持 clean |
| `npx tsc --noEmit --pretty false` | 2 | 54 条既有生产基线诊断，本阶段相关文件新增诊断 0 |
| `git diff --check` | 0 | 无 whitespace error |

### 类型诊断基线

- `codex/task1-v0-baseline`：54 条诊断。
- C03：54 条诊断。
- 使用“只保留 error headline、去除 `(line,column)`、排序、UTF-8 SHA-256”的既定标准化方式，两者指纹均为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。
- `tool-prompt`、Compiler 测试和 capture 脚本新增诊断数为 0。

## 语义、合同与能力门禁

- 10 个语义所有权 id 全部唯一；每个删除 marker 在目标 surface 中为 0，每个 retained marker 在声明 owner 中恰好为 1。
- 七种非空 Memory/Skill/Knowledge family mask 均验证共享身份规则只出现一次且只描述实际启用的 Memory/Skill family。
- V1a 与 V1 的 RuntimeToolContract id、Prompt spec id 和全部 `<tool name>` 集合一致，没有删除、增加或改名工具。
- Memory 6 个工具、Skill read-only 与 allow-write 工具面、Knowledge list/call 两步合同均保持可编译。
- CodeBuddy、Claude Code、WorkBuddy、Pi、无 anchor fallback，以及有 Task/无 Task 两种 Session shape 的 Provider-visible 结果均通过。
- `legacy` 与 C00、`contract-corrected` 与 C01、`protocol-compact` 与 C02 的 `injection.txt`/`prompt.txt` 均由生成脚本逐字节比较；任一祖先变化会直接失败。
- `selection-calibrated` 与 `capability-pruned` 当前逐字节继承 `compact`，没有提前混入 C04/C05 改造。

机器清单：

- `variants/c03/semantic-unit-ownership.json`
- `variants/c03/v1a-to-v1-diff.json`

## Prompt 与 Token 冻结结果

规范 Capability Signature：

```text
memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0
```

| 指标 | V1a | V1 | Delta |
|---|---:|---:|---:|
| Total injection bytes | 16,326 | 14,690 | -1,636 |
| Total injection tokens (`o200k_base`) | 4,413 | 4,027 | -386 (-8.7%) |
| Provider-visible system bytes | 16,535 | 14,899 | -1,636 |
| Provider-visible system tokens (`o200k_base`) | 4,466 | 4,080 | -386 |

相对原始 V0 的 4,863 total injection tokens，正式 V1 减少 836 tokens（约 17.2%）；相对 V0-C 的 5,126 tokens，减少 1,099 tokens（约 21.4%）。

逐块 Token delta（相对 V1a）：

- `skill_tools`: `-17`
- `available_skills`: `-135`
- `knowledge_tools`: `0`
- `tdai_memory_tools`: `-227`
- `tdai_profile_memory` 中的 memory guide: `-7`

V1 total injection SHA-256 为 `444be855524cb01e8c0377eba8b36b9b4da8911f20e4df14b8bba7dfc24e8167`；Provider-visible system SHA-256 为 `9dac01f195138de458e1e2d85b554daf274b6c138c76ef35998d269335f9af14`。相对 V1a 的首个变化位于 Provider Prompt UTF-8 byte `155`，稳定前缀长度为 `155` bytes。

## 未解决但不阻塞 C03 的事项

- 尚未运行 Luna/Codex 模型，因此本 Gate 不包含有效调用率、误调用率或工具选择正确率结论。
- C03 只证明重复语义具有唯一所有者、合同不变且静态 Token 继续下降，不证明行为效果一定优于 V1a；正式评测仍应保留 V1a 与 V1 两个中间版本。
- Skill listing 仍保留 `mandatory` 与 `partially relevant` 的推广性措辞；其选择中立化属于 C04，不能在 C03 提前改写。
- Capability 关闭时的工具卡裁剪属于 C05；本阶段只验证不同 family mask 下共享身份文案正确，没有改变工具暴露策略。
- Prefix 在 byte 155 发生变化已保存；最终 prompt cache 影响需结合正式运行的 cached-input 指标判断。

## 决策

C03 通过。正式 V1 是 V1a 的递进子版本，只删除有等价保留位置的重复行为语义；唯一约束、运行时合同、工具集合、动态资产和注入布局均保持。允许以非 squash merge 合回 `codex/task1-code-integration`；集成主线复跑通过并补记 merge commit 后，才能创建 `codex/task1-code-c04-v2`。

## 集成主线复跑

C03 已通过 merge commit `87483d5aa4786a15ca8f7136879a09682dca366c` 以非 squash 方式合入 `codex/task1-code-integration`。合并后复跑：

- `npm test`：45/45 通过。
- `npm run eval:tool-prompt:validate`：100 case / 100 fixture 通过。
- `npm run eval:tool-prompt:capture-c03`：成功且工作树无变化，C00/C01/C02 祖先逐字节比较再次通过。
- `npx tsc --noEmit --pretty false`：仍为 54 条既有诊断，标准化指纹仍为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`，阶段相关新增诊断为 0。
- `git diff --check`：通过。

集成 Gate 通过，允许从包含本记录更新的最新集成提交创建 `codex/task1-code-c04-v2`。
