# Gate C01

- status: `PASSED`
- branch: `codex/task1-code-c01-v0c`
- parent integration commit: `bc904285eba817beda3bd2b35ecccf9f1d607451`
- verified implementation commit: `1a836179c7f7d3348dc369d4b10ef7ce6a0ea49a`
- verified artifact commit: `29eed92e226e3c838d057cd5fc70f2c049b2b8d1`
- merge commit: `PENDING_INTEGRATION`
- scope: V0-C 运行合同纠错、源码证据清单、Prompt/Token/Hash 冻结；不含压缩、去重、选择校准、布局调整或 Capability 裁剪
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- `legacy` 继续调用冻结 Renderer，生产默认 profile 仍为 `legacy`。
- `contract-corrected` 及尚未进入各自实现阶段的后继 profile 统一继承 C01 Renderer。
- 新增精确片段 correction engine。每项修正包含稳定 ID、适用 surface、源码证据和 before/after；旧 Renderer 漂移时直接失败，不静默跳过。
- 修正 Memory guide 示例缺少 tenant-routing Header 的内部合同不一致。
- 修正 Skill search 实际为 BM25、团队搜索结果不能交给 agent-scoped `get-by-name`、`files/read` 与 `files/download` 返回类型混淆、五个写接口缺少 `expected_version`、delete 语义和错误说明不准确等问题。
- 将现有 `/skill-bridge/v3/skill/get` 作为 `skill_view_by_id` 纳入 Prompt Contract；未修改 Bridge allowlist、转发或权限行为。
- 修正 Knowledge `node` 只有 `includeCode=true` 才返回源码，以及 `search` 只按符号名、`explore` 才支持文件名的说明。
- 冻结 C01 六个 profile 的规范 Prompt，保存机器可读 correction inventory 和 V0 → V0-C 差异。

## 合同证据边界

共记录 15 项 source-backed correction：

- 规范 `full-readonly` Capability Fixture 实际应用 8 项：Memory guide 1 项、Skill read 4 项、Knowledge 3 项。
- 另外 7 项属于已存在但当前 Fixture 关闭的 Skill write surface；它们只在 `allowLlmWrite=true` 时应用，并由写能力单元测试覆盖。
- 所有 endpoint、字段、返回类型和语义均指向 Memory Bridge、Skill Bridge、Core Skill Schema/Core 或 Knowledge Handler 源码。
- 本阶段没有启动 Docker 服务或真实 Contract Probe；V6.1 允许使用“源码或 Contract Probe”作为 C01 证据，本阶段采用源码证据路径。

机器清单：

- `variants/c01/contract-corrections.json`
- `variants/c01/v0-to-v0c-diff.json`

## 变更范围

生产代码限定为：

- `src/injection/tool-prompt/contract-corrections.ts`
- `src/injection/tool-prompt/compiler.ts`
- `src/injection/tool-prompt/profiles.ts`
- `src/injection/tool-prompt/runtime-contract.ts`
- `src/injection/tool-prompt/specs/skill.ts`
- `src/injection/tool-prompt/index.ts`

测试与冻结产物限定为 Compiler 测试、通用 stage capture 脚本、C01 Variant 文件和本 Gate。没有修改 Bridge、Core、Handler、Adapter、Agent Profile、Pipeline 布局、数据集、World、Runner、Scorer 或模型配置。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、41 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 冻结的 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-c01` | 0 | 生成 6 个 profile、18 个 Prompt 文件和 2 个差异/证据文件；提交后复跑工作树保持 clean |
| `npx tsc --noEmit --pretty false` | 2 | 54 条既有生产基线诊断，本阶段相关文件新增诊断 0 |
| `git diff --check` | 0 | 无 whitespace error |

### 类型诊断基线

- `codex/task1-v0-baseline`：54 条诊断。
- C01：54 条诊断。
- 使用“去除 `(line,column)`、排序、UTF-8 SHA-256”的同一标准化方式，两者指纹均为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。
- `tool-prompt`、`contract-corrections`、Compiler 测试和 capture 脚本新增诊断数为 0。

## Legacy parity 与递进关系

- C01 `legacy` 的 `injection.txt` 和 `prompt.txt` 由生成脚本逐字节对比 C00 冻结文件；不相同会直接失败。
- C01 Legacy total injection SHA-256 仍为 `c84371246a0e9502fdbf78bc11dd98a7eebdf22bd2b26030f66d6206cee3842c`。
- C01 Legacy Provider-visible system SHA-256 仍为 `69e866ec8b97dd65177d08f9d42bf703bdf6dbea1df2c760bb5f666926166f95`。
- `protocol-compact`、`compact`、`selection-calibrated`、`capability-pruned` 在各自阶段开始前均逐字节继承 `contract-corrected`，没有提前混入 C02 至 C05 改造。
- Provider 测试覆盖 CodeBuddy、Claude Code、WorkBuddy、Pi、无 anchor fallback，以及有 Task/无 Task 两种 Session shape。

## Prompt 与 Token 冻结结果

规范 Capability Signature：

```text
memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0
```

| 指标 | V0 Legacy | V0-C | Delta |
|---|---:|---:|---:|
| Total injection bytes | 17,227 | 18,129 | +902 |
| Total injection tokens (`o200k_base`) | 4,863 | 5,126 | +263 |
| Provider-visible system bytes | 17,436 | 18,338 | +902 |
| Provider-visible system tokens (`o200k_base`) | 4,916 | 5,179 | +263 |
| Diagnostic static-template tokens | 4,579 | 4,824 | +245 |
| Dynamic-asset tokens | 201 | 201 | 0 |
| Runtime-binding tokens | 65 | 65 | 0 |

逐块 Token delta：

- `skill_tools`: `+228`
- `knowledge_tools`: `+21`
- `tdai_profile_memory` 中的 memory guide: `+14`
- `available_skills`、`tdai_memory_tools`: `0`

V0-C total injection SHA-256 为 `8b3a11049a2125edef37db75e27f117a9f384f52e756b52287d493e70450594b`；Provider-visible system SHA-256 为 `f20d3e984d5365b415ae22eca8cf5bf6c286f30833255335a8d5af3f70ccdd86`。相对 Legacy 的首个变化位于 Provider Prompt UTF-8 byte `903`，稳定前缀长度为 `903` bytes。

C01 的目标是正确性而不是省 Token。`+263` 是补齐可执行 Skill 读取路径和修正合同说明的显式成本；C02/C03 才允许通过共享协议和语义去重降低 Token，不能把压缩偷混进 C01。

## 未解决但不阻塞 C01 的事项

- 尚未运行 Luna/Codex 模型，因此本 Gate 不包含有效调用率、误调用率或工具选择正确率结论。
- 尚未启动 MemoryProxy、Docker 资产服务或 Langfuse；这些属于代码与数据冻结后的正式实验阶段。
- C01 只证明 Prompt 合同与当前源码一致，不证明新增描述一定提升模型效果。
- Prefix 在 byte 903 发生变化已完整记录；后续阶段必须继续保存每个 Variant 的 prefix/hash，最终是否接受由正式评测和 cache 指标共同决定。

## 决策

C01 通过。V0-C 只包含有源码证据的运行合同修正，Legacy parity 保持，后继 profile 递进关系正确，静态结果可复现且全部 Token/hash 已保存。允许以非 squash merge 合回 `codex/task1-code-integration`；集成主线复跑通过并补记 merge commit 后，才能创建 `codex/task1-code-c02-v1a`。
