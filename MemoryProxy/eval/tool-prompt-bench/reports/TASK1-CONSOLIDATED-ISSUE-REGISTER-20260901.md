# Task 1 问题总登记册

生成日期：2026-09-01

审计基点：`9ed0d66ea508e2eaab41b938dbb0091c4a593303`（功能提交 `2c323b55a087af83388cac9f5d775b63095e1dbb`）

本文合并三个来源的全部问题：2026-08-31 的阶段 A/B/C 审计、同日的 V0-V3 源码审查、以及 2026-09-01 对 `2c323b5` 修复结果的复核。**本文所列每一条都在当前 HEAD 上重新验证过**，不沿用任何旧结论。

## 0. 复验方法与本轮修正

本轮把此前所有结论逐条在当前代码上重跑，而非引用历史报告。执行内容：

- 全文读取 `src/injection/tool-prompt/` 八个源文件，含此前只读了导出面的 `protocol-compact.ts`（19KB）；
- 用**项目自带的 tiktoken**（`get_encoding("o200k_base")`，与 `capture-profile-artifacts.ts:79` 同一实例）重新计量 6 个 profile 的冻结产物；
- `npx tsc --noEmit` 重新计数并按路径归类；
- 重跑覆盖矩阵生成器验证确定性；
- 用 merge-base diff 重新统计四个方法分支真正新增的 profile 与 variant；
- 加载真实 spec/contract 对象统计决策语义完整度，而非用 grep 估算。

复验推翻了 5 条旧结论，必须记录：

| 旧结论 | 复验结果 |
|---|---|
| B-2：覆盖矩阵零代码零产物 | **错误，已解决**。`DS09-FORMAL-V2.1-COVERAGE-MATRIX.json/.md` 存在，12 维度齐全，确定性成立 |
| D-6：R05 preflight CLI 有 3 条类型错误 | **已被 `2c323b5` 修复**，诊断数因此 58→55 |
| D-5：MemoryProxy 诊断 58 条 | 当前为 **55 条**，旧数含已修的 3 条 |
| spec 总数 24 条 | 实际 **20 条**（旧数是 grep `id:` 误计） |
| D-3 涉及"三个 lint" | 数量正确为 3，但 `protocol-compact.ts` 无 lint 且**靠构造 fail-closed**，需区别对待 |

## 1. 当前状态总览

| 阶段 | 当前结论 | 依据 |
|---|---|---|
| A：800 例数据接入 | 已冻结，仅剩文档勘误 | tag `...stage-a-v1` = `a22cebd`，数据身份三重 hash 一致 |
| B：离线测量基座 | 离线 Gate 全绿 | Integration 192/192、Measurement-v2 116/116、R05 96/96、R03 63/63、Formal runtime 34/34 |
| B-live：真实栈预检 | 未执行 | 未启 Docker、未恢复真实资产、未调模型 |
| C：Prompt 方法实验 | 未开始，且有 3 项须先决策 | 无 `task1-exp-*` 分支；四个源分支祖先不统一 |
| V0-V3 Prompt 冻结 | 有效，未被阶段 B 修复触碰 | `git diff a22cebd..HEAD -- src/injection/tool-prompt/ variants/` 为空 |

问题按类别编号：`R-` 已解决、`M-` 指标口径、`P-` 提示词质量、`S-` 代码结构、`E-` 代码缺陷、`C-` 阶段 C、`A-` 文档勘误。

## 2. 已解决（记录在案，不再是待办）

这些是 2026-08-31 审计报出、已由 `2c323b5` 解决的问题。保留记录以免被重复提出或重复返工。

### R-1：restore plan 未迁移导致 15 个测试失败

原状：`formal-assets/restore-plan.ts` 未随 800 例 bindings 迁移，`restore-plan.ts:333` 抛 `Formal asset restore: binding snapshot mismatch`，`formal-asset-restore-plan-contract.test.ts` 11 失败、`formal-asset-restore-plan.test.ts` 4 失败（二者在干净 Stage A 树上是全绿，故确定为当时工作区引入）。

现状：`r05:gate` 96/96 通过。附带确认原先被 snapshot mismatch 提前拦掉的 fail-closed 测试（`fails closed on a binding whose visible set hash is not frozen`）已恢复按预期路径失败。

### R-2：B1.1 覆盖矩阵

原状：报为零代码零产物。**该结论错误**（当时检索词未命中 DS09 命名）。

现状核实：`formal-dataset/scripts/build-formal-v21-coverage.ts` + `formal-dataset/reports/DS09-FORMAL-V2.1-COVERAGE-MATRIX.json`（17KB）与 `.md`（1.5KB）。逐项验证：

- 输入确为 §B1.1 要求的派生源：`loadFormalProviderSplit`、`loadPrivateMeasurementSplit`、`loadFormalCaseBindings`、`loadFormalSmokePreregistration`、`registry/contracts/formal-v2.json`；
- 计数 `providerCases 800 / privateGold 800 / pairs 300 / caseBindings 800 / runtimeContracts 22 / smokeCases 40 / teams 20`，`valid: true`、`errors: []`；
- 12 个维度全部存在：split、team、language、difficulty、family、terminal、operation、chainLength、route、negative、counterfactual、pair；
- 含 §B1.1 要求的风险定向复核队列 `riskReviewQueues`：`multiStepCaseIds`、`typedBindingCaseIds`、`unlabeledDifficultyCaseIds`、`addedTeamCaseIds`；
- 含 `splitComparisons`（Dev 与 Frozen Holdout 可比性）；
- 确定性成立：重跑 `eval:tool-prompt:formal:coverage` 后文件 SHA-256 不变（`de95b7df1741acf6...`）；
- 已接 npm 脚本，并被 `formal-dataset-registry.test.ts` 引用。

### R-3：STAGE-B2 gate 报告结论过期

原状：报告写 BLOCKED、21 条 contract（Knowledge 11）、Smoke v2 未生成，与工作树矛盾。

现状：已重写为离线 PASS，contract 数更正为 22，并记录 restore plan 的 432 actions / 285 requirements / 386 assets。

### R-4：阶段 B 全部工作未提交

原状：26 改 + 1 未跟踪，分支与 Stage A 同指 `a22cebd`。

现状：已提交为 `2c323b5`，工作树干净（唯一脏文件是审计文档本身）。

### R-5：restore plan 产物与 T17-T20 receipt 缺失

现状：restore plan 已固定为 432 actions / 285 requirements / 386 assets 并记入 gate 报告。

### R-6：R05 preflight CLI 参数类型未对齐

原状：`r05-runtime-preflight-contract.ts` 3 条错误（`preregistrationPath`、`manifestPaths` 不在参数类型上，一个隐式 any），当时判断会挡住 B-live。

现状：`2c323b5` 已修改该文件，当前 `tsc` 输出中该路径 0 条错误。这是 MemoryProxy 诊断数从 58 降到 55 的原因。

## 3. 待办：提示词质量

### P-1（高）：V2 的 contrast 机制只覆盖了 20 条 spec 中的 2 条，且 smoke 关键路由全部为空

`compiler.ts` 的设计注释称 C04 编译 "contract-backed when/avoid/contrast cards"。实测该机制严重欠填充。

加载真实 spec 对象统计（非 grep）：

| family | spec 数 | 缺 `avoid` | 缺 `contrasts` |
|---|---:|---:|---:|
| memory | 6 | 5 | 4 |
| skill | 12 | 10 | 12 |
| knowledge | 2 | 1 | 2 |
| **合计** | **20** | **16** | **18** |

全目录**只有 2 条** spec 带 `contrasts`，且是互指的一对：

```
tdai_memory_search      -> contrasts: tdai_conversation_search
tdai_conversation_search -> contrasts: tdai_memory_search
```

渲染逻辑决定了缺失字段不产生任何文本（`selection-calibrated.ts:292-294`）：

```ts
`    when: ${spec.when}`,
...(spec.avoid ? [`    avoid: ${spec.avoid}`] : []),
...(spec.contrasts ?? []).map(...)
```

因此 V2 的工具卡在绝大多数工具上退化为只有 `when` 一行。冻结的 V2 提示词全文只出现 5 次 `avoid`、3 次 `contrast`。

为什么这是高严重度：§B2 的 40 例 smoke 明确要求覆盖 Skill 的 direct view / search-to-view / view-to-files-read 三条路由，以及 Knowledge 的 list-to-call 链。这六个工具的 contrast 覆盖**全部为零**：

```
skill_search          contrasts=0  avoid=no
skill_view            contrasts=0  avoid=no
skill_view_by_id      contrasts=0  avoid=no
skill_files_read      contrasts=0  avoid=yes
knowledge_tools_list  contrasts=0  avoid=no
knowledge_tools_call  contrasts=0  avoid=yes
```

`TerminalSelectionRate` 与"工具选择正确率"恰恰考察模型区分同族相邻工具的能力，而 V2 引入的区分机制在被考察的路由上没有内容。memory 那一对证明机制本身有效——填充了就有输出——所以这是数据欠填，不是设计缺陷。

处理建议：为 4 个 Skill 只读工具与 2 个 Knowledge 工具补 `contrasts` 与 `avoid`。这是**改 Prompt 语义**，属于新 Variant 而非 bug fix，因此不能在已冻结的 V2 上原地改；应作为候选改进（例如 V2.1）走同一实验流程验证。若不做，报告须说明 V2/V3 的 terminal 选择能力测的是"只有 when 的卡片"，不是完整的 when/avoid/contrast 设计。

## 4. 待办：指标口径

### M-1（高）：V2 静态 Token 节省的 86.4% 来自中文改英文，而非结构去重

用项目自带 tiktoken（`o200k_base`）对冻结产物计量：

| Variant | 总 token | CJK 字数 | CJK 孤立 token |
|---|---:|---:|---:|
| V0 | 4863 | 2803 | 2093 |
| V0-C | 5126 | 2868 | 2135 |
| V1a | 4413 | 2747 | 2054 |
| V1 | 4027 | 2510 | 1880 |
| V2 | 2308 | 530 | 395 |
| V3 | 2224 | 492 | 364 |

```
V1 -> V2 总 token 降幅      : 1719
V1 -> V2 中文孤立 token 降幅: 1485
可归因比例                  : 86.4%
```

机制已在源码层确认：`renderSelectionGate`（`selection-calibrated.ts:180`）输出全英文（`## Tool / no-tool gate` 及其条目），而 `calibrateSurface` 移除的是中文正文（如"这组 TDAI 记忆能力与 Claude Code 原生 Memory/MEMORY.md 具有同等优先级……"）。对照 V1a 的 `renderSharedExecutionGrammar` 仍输出中文（`## 统一工具调用协议`），CJK 字数在 V1a 仍有 2747——**中文塌陷精确发生在 V2 这一级**，与测量数据一致。

o200k_base 下中文约 0.75 token/字、英文约 0.25 token/字符，同义内容换语言即产生数量级差异。真正的结构去重仅贡献约 234 token。

注意：孤立 tokenize 拼接 CJK 与其上下文内实际切分不完全等价（边界效应），1485 应视为估计；量级不受影响。

影响：`StaticToolTokens` 是四个主指标之一。若报告把 V2/V3 降幅表述为提示词结构优化成果，会高估方法贡献。行为侧同理——V0-V1 用中文给决策指引、V2-V3 用英文，数据集含 `language` 维度（已在 DS09 覆盖矩阵中），语言交互效应无法与校准质量分离。

处理建议（不改代码）：Token 台账对 V1→V2 额外披露"其中约 1485 token 归因于语言构成变化"；错误分析给出**按 Case 语言分层**的 Complete Chain / FCR 分解；可迁移性说明写明面向中文部署或换 CJK 切分特性不同的模型时该收益不等比例保留。

### M-2（中）：V0-V1 在只读实验中描述了 3 个不可调用的写工具

冻结的实验 capability signature 为 `memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0`。对冻结产物检索：

| Variant | 出现的写/抽取工具 |
|---|---|
| V0 / V0-C / V1a / V1 | `skill_create`、`skill_patch`、`skill_extract` |
| V2 | `skill_extract` |
| V3 | 无 |

V0 至 V1 向模型宣传了 3 个运行时必然拒绝的工具，V2 宣传 1 个，只有 V3 通过能力剪枝清零。

这忠实反映 V0 的生产行为，不是缺陷。但若模型在 no-tool 样本上尝试 `skill_create`，该尝试计入 V0 的 `FalseCallAttemptRate`——惩罚在"提示词质量"意义上合理，但**量级由本次运行的能力配置决定**。在写入开启的生产配置下，V3 在此项剪不掉任何东西，这部分差距会缩小甚至消失。

处理建议：`FalseCallAttemptRate` 错误分解把"尝试调用不可用写工具"单列一类，与"选错只读工具族"区分；可迁移性说明写明该项差距配置相关。这也给 §F"Token 节省来自静态说明还是挪到动态区"补第三个答案：来自剪掉本配置下不可调用的工具。

### M-3（中）：`stablePrefixTokens` 不是 provider cache 前缀，不可作为 cache 结论依据

`capture-profile-artifacts.ts:1050` 的定义：

```ts
const stablePrefixBytes = changedAt ?? Math.min(parentBytes.length, promptBytes.length);
```

即**与父 profile 的首个分歧字节**。因此 V0（`parent: null`，`changedAt === null`）取全长，manifest 显示 `stablePrefixTokens: 4916`；V1a 的 37 意思是"相对父级 V0-C 在 37 token 后开始分歧"。

这是 profile 血缘诊断，照字面引用会得出"V1a 把 cache 前缀从 4916 砍到 37"这类错误结论。

真正的 cache 前缀保真度由 `formal-cache-structure-gate.test.ts` 覆盖，且覆盖充分：15+ 测试检查静态/动态块顺序、变动 session 上下文背后隐藏的静态漂移、V0-C 混合块动态资产前置、被移动的注解 tag object 等。报告涉及 cache 时应引该 gate。

## 5. 待办：代码结构

### S-1（中）：三个 lint 全部不在生产编译路径上

各渲染器的导出面与 lint 归属：

| 文件 | 导出的 apply | 导出的 lint | throw 处数 |
|---|---|---|---:|
| `protocol-compact.ts` | `applyProtocolCompaction` | **无**（靠构造 fail-closed） | 14 |
| `semantic-compact.ts` | `applySemanticCompaction` | `lintDuplicateSemanticUnits` | 6 |
| `selection-calibrated.ts` | `applySelectionCalibration` | `lintSelectionPolicy` | 15 |
| `capability-pruned.ts` | `applyCapabilityPruning` | `lintCapabilityPrunedSurface` | 13 |

`grep -nE "lint" src/injection/tool-prompt/compiler.ts` 结果为空——三个 lint 无一被 `compileToolPrompt` 调用。实际调用者只有 `tool-prompt-compiler.test.ts` 与 `capture-profile-artifacts.ts`。

后果：这些不变量只在测试与 artifact 捕获时（使用固定实验 signature）生效，不在真正给模型服务的路径上。运行期若 `resolveSessionCapabilitySignature` 依 session 推导出不同 signature，产出的提示词不受任何 lint 约束。

具体风险在 `capability-pruned.ts` 的 `pruneSurface`：

```ts
source.replace(/  <tool name="([^"]+)">\n[\s\S]*?  <\/tool>\n?/g, ...)
```

依赖**恰好两个空格的缩进**；缩进漂移或卡片正文出现 `  </tool>` 字样会导致漏剪或早停，而唯一能抓到这类漂移的正是脱链的 `lintCapabilityPrunedSurface`（它比对 `actualToolIds` 与 `expectedToolIds`）。漏剪的直接表现是模型看到调不动的工具。

对本次实验影响有限：signature 固定，且 §E1 smoke 要求校验注入 artifact hash 与冻结产物一致，hash 比对间接覆盖这一层。但属"最强守卫没接在服务路径上"。

处理建议：在 `compileToolPrompt` 末尾对 `capability-pruned` 内联一次 `lintCapabilityPrunedSurface`，或在 R05 preflight 中对实际运行 signature 跑一次三个 lint。作为 PR 前可选加固。

### S-2（中）：`removeIfPresent` 静默 no-op，且同仓库已有正确模式

`semantic-compact.ts:272` 与 `selection-calibrated.ts:348` 的实现是"存在才删、不存在原样返回"，共 **7 个调用点**（semantic 5 处：156/157/162/167/179；selection 2 处：221/225）。

对比 `protocol-compact.ts:455` 的 `replaceOnce`：

```ts
const first = source.indexOf(from);
const last = source.lastIndexOf(from);
if (first < 0 || first !== last) throw new Error(`${label} expected exactly one fragment`);
```

**片段缺失（`first < 0`）也抛错**。V1a 全程如此：`captureOne`、`replaceOnce`、`replaceRegexOnce`、`insertExecutionGrammar` 均在数量不为 1 时抛错，且零 `removeIfPresent`。

即正确模式在同一仓库、同一 seam 内已经存在，V1（C03）与 V2（C04）引入的是不一致，不是设计取向。

后果：上游 Prompt 文案改一个标点，对应删除即静默失效，重复规则留在提示词里，profile 静默向父级退化，而无任何 gate 失败。S-1 与 S-2 组合才是真风险——静默失效 + 守卫脱链 = 退化无人察觉。冻结产物 hash 比对能兜住本次实验，但不构成代码级保护。

处理建议：把这 7 处改为 fail-closed（缺失即抛），与 V1a 对齐。此改动不影响当前输出（现有片段都存在），因此不改变任何冻结 hash。

### S-3（低）：capability signature 重复键静默取最后一个

`runtime-contract.ts:371`：

```ts
const fields = new Map(signature.split(";").map((part) => { ... }));
```

Map 语义决定重复键静默采用最后一次赋值。`memory=1;...;memory=0` 会静默解析为 `memory=false`，不报错。

该文件其余校验都是 fail-closed（值非 `0`/`1` 或键缺失均抛 `invalid capability signature ... missing key=0|1`），这是唯一静默通道。signature 由内部生成而非外部输入，风险低；但它同时驱动提示词内容、共享 host 选择与 cache identity，一个重复键会在"看起来合法"的情况下改变提示词。

处理建议：解析时对重复键抛错。

### S-4（低）：`resolveSessionCapabilitySignature` 对缺失标志 fail-open

`capability-pruned.ts:64`：

```ts
if (!flags) return baseSignature;
return constrainCapabilitySignature(baseSignature, {
  memory: flags.chat_memory !== false,
  skill: flags.skill !== false,
  wiki: flags.llm_wiki !== false,
  codeGraph: flags.code_graph !== false,
});
```

`undefined`（标志缺失）被视为允许。若 session-init 上报的 `AssetCapabilityFlags` 只含部分字段（例如有 `skill` 而无 `chat_memory`），V3 会保留 memory 表面。方向与本文件其余大量 `throw` 相反。

本次实验不受影响（signature 固定且完整），属生产健壮性缺口。

### S-5（低）：`memory=0` 时共享策略宿主迁移

`surface-coordinator.ts` 按固定家族序 `["memory","skill","knowledge"]` 取第一个活跃家族作为 `policyHost` 与 `executionGrammarHost`。确定性无问题（同 signature 必得同 host，与调用顺序无关）。

但 `memory=0` 时宿主从 memory 迁至 skill，整块共享策略/语法文本换到另一 block 内，V1a 及之后所有 profile 的提示词结构随之变化。本次实验三家族全开，host 恒为 memory。作为生产注意事项记录：不同能力配置的 session 之间共享文本位置会跳变，可能影响 provider 侧前缀复用。

## 6. 待办：代码缺陷

### E-1（中）：`src/config.ts` 类型错误由 C06 引入，修复已存在于 v4-g 分支

当前 HEAD 仍复现：

```
src/config.ts(8,8): error TS2724:
  '"./injection/tool-prompt/profiles.js"' has no exported member named 'ToolPromptProfile'.
  Did you mean 'parseToolPromptProfile'?
```

`config.ts` 从 `profiles.js` 导入 `ToolPromptProfile` 类型，但 `profiles.ts` 只把该类型从 `types.js` 导入自用，从未 re-export。

归因证据（`2c323b5` 的审计把它归为"既存漂移"，处置结论无异议，但归因需更正——它是任务一自有缺陷）：

- `git show task1-code-freeze:MemoryProxy/src/config.ts` 只导入 `parseToolPromptProfile`，无类型导入；
- 逐 tag 检查 `task1-c00-pass` 至 `task1-code-freeze` 的 `profiles.ts`，`export type { ToolPromptProfile }` 均不存在；
- `git log` 定位到 `6a12b4a`（`feat(tool-prompt-bench): bind variants to production profiles`，C06 的 variant→profile 绑定）新增了该类型导入，从此二者不匹配。

即 C00-C07 的 Prompt 冻结本身干净，缺陷出现在 C06 的绑定提交。它不影响运行（类型导入编译期擦除，vitest 走 esbuild 不做类型检查），全部测试为绿掩盖了它。

现成修复：`codex/task1-method-v4-g` 的 `profiles.ts` 末尾有 `export type { ToolPromptProfile } from "./types.js";`。该行与 typed-action-graph 方法无关，属纯修复。

处理建议：采纳进公共基座，而非让四个创新候选各带一份——后者还会污染 §6"相对公共基座只有方法相关文件"的判定。

### E-2（中）：typecheck 基线不变量已失效且无自动化守护

C01-C05 每份 gate 都断言"仍为 54 条既有诊断，标准化指纹仍为 `ecf5cfe9...`，阶段相关新增诊断为 0"。当前实测 MemoryProxy 自身 **55 条**（另 55 条位于 MemoryCore/MemoryKnowledge），其中 1 条在任务一自有路径（即 E-1）。

根因是该不变量从未自动化：

- `variants/code-freeze/code-freeze-manifest.json` 的 `typecheckBaseline: { diagnostics: 54, normalizedSha256: "ecf5cfe9..." }` 是**写死字面量**，`capture-code-freeze.ts` 生成时不重算不比对；
- `npm run typecheck` 存在，但不在 `formal:gate`、`r05:gate`、`integration:gate` 任何一条链中；只有 `measurement-v2:gate` 对子工程跑 `tsc -p`。

因此 C06 之后再无环节核对该指纹，54 → 55 静默漂移。这与"任务一 focused TypeScript 通过"不矛盾：focused 覆盖 measurement-v2 子工程，漂移发生在 `src/` 主路径。

处理建议：修完 E-1 后把基线更新为真实值，并将标准化指纹校验接入 `integration:gate`；否则不变量继续空转。

### E-3（低）：EXPERIMENT-FREEZE-MANIFEST 仍是 v1.1 / 640

当前内容：提及 `formal-v1.1`（是）、提及 `formal-v2.1`（否）、`"total": 640`、`"dev": 240`。生成脚本 `capture-r02-experiment-freeze.ts` 仍钉死 `DATA_TAG = "task1-data-formal-v1.1"` 与 `counts?.total !== 640 || counts.dev !== 240`。

已实测它不在任何活跃 gate 路径上（`formal:gate`、`r05:gate`、`integration:gate` 均不引用），全仓只有 `r02-experiment-freeze.test.ts` 读取，属允许保留的历史 R02 证据。

仍需处理的理由：它是唯一名为 "EXPERIMENT FREEZE MANIFEST" 的文件，极易在写报告时被误引为当前数据身份，把 640/240 写进正式结论。

处理建议：迁到 v2.1，或显式重命名/标注为 R02 历史证据。

## 7. 待办：阶段 C

阶段 C 未开始（`task1-exp-*` 分支数为 0）。以下是对四个源分支现状的核查，目的是在移植前暴露必须先决策的事项。

用 merge-base diff 重新统计真正新增的 profile 与 variant（旧审计的计数把既有 V0-V3 也算进去了，已修正）：

| 源分支 | merge-base | 新增 profile | 新增 variant 键 |
|---|---|---:|---:|
| `codex/task1-method-c3p-eq` | `c86b154` | **0** | **0** |
| `codex/task1-method-tscg-lite` | `0373227` | 4（tscg-sig/sdm/dro/cfo） | 4（TSCG-SIG/SDM/DRO/CFO） |
| `codex/task1-method-v4-g` | `0373227` | 2（typed-action-graph、-deduplicated） | **0** |
| `codex/task1-method-v4-rn` | `0373227` | 1（neutral-symmetric） | 1（V4-RN） |

四个分支祖先不统一，且无一位于 `fa79ab9`（candidate base）或 `a22cebd`（stage-a），故四次移植是真正的 rebase 而非 cherry-pick。

### C-1（高）：C-3P-EQ 不是可运行候选，产不出 Dev 数据

证据：

- `variant-profiles.ts` 在该分支上原封不动，只有 V0-V3；
- `types.ts` 的 `TOOL_PROMPT_PROFILES` 零新增；
- 对 `src/injection/tool-prompt/index.ts` 的改动是纯 export 追加（`buildToolPromptPlaneSourceMap`、`TOOL_PROMPT_PLANES` 等 plane inventory 类型与函数），不改变任何 provider 可见 Prompt；
- 其自有 gate `C3P-STRUCTURAL-PREPARATION-GATE.md` 明写 "PASS — engineering preparation only … does not prove semantic plane ownership and is not a complete `C-3P-EQ` Gate"，且 `semanticOwnershipAttested` 为 "deliberately and unconditionally `false`"。

结论：它是三平面归属的分析/度量工具，不是 Prompt 变体。按现状移植后无法参与 40 例 smoke，也产不出 320 Dev 对比，§6 的 `READY_FOR_MODEL_SMOKE` 对它无意义。

需要的决策（二选一，须在阶段 C 开始前定）：

1. 承认它是分析工具，从"四个创新候选"中移出，不占 smoke/Dev 预算——正式对比只有 3 个方法，报告口径同步调整；
2. 为它补真实 profile 与渲染器——但这属新增方法实现，远超 §6"只允许移植"的授权，且引入新自变量，需重估工期。

不决策而直接按"四个候选"排预算，阶段 F 会在运行中才发现少一个候选。

### C-2（高）：v4-g 的 2 个 profile 未注册为 runner variant，正式 runner 会直接抛错

这是本轮新发现。`v4-g` 在 `types.ts` 注册了 `typed-action-graph` 与 `typed-action-graph-deduplicated`，但 `eval/tool-prompt-bench/variant-profiles.ts` **完全未改**，仍只有 V0-V3。

而 runner 的 variant 解析是 fail-closed 的（`variant-profiles.ts:19`）：

```ts
export function resolveToolPromptVariant(value: string): ResolvedToolPromptVariant {
  if (Object.prototype.hasOwnProperty.call(TOOL_PROMPT_VARIANT_PROFILES, value)) { ... }
  throw new Error(`unsupported tool prompt variant ${JSON.stringify(value)}; expected one of ...`);
}
```

调用者包含正式运行路径：`codex-runner.ts`、`formal-prepare-entry.ts`、`formal-prepare-runner.ts`。这与 C06 gate 记录的"未知 Variant 在启动模型或创建运行目录前失败"一致。

后果：v4-g 当前只能通过自己的 capture 脚本产出静态 artifact，**无法经正式 runner 跑 smoke 或 Dev**。移植时必须补 variant 注册（如 `"V4-G1": "typed-action-graph"`、`"V4-G2": "typed-action-graph-deduplicated"`），否则该候选静态 Gate 通过但一进模型阶段即失败。

对比 tscg-lite 与 v4-rn 均已正确注册，说明这是 v4-g 单独的遗漏。

### C-3（高）：候选实际是 7 个 profile 而非 4 个，smoke/Dev 预算需重算

tscg-lite 4 + v4-g 2 + v4-rn 1 + c3p-eq 0 = **7 个可运行 profile**。而 §D4 的 smoke 预算与 §F"一周受限模式最多选 1 到 2 个候选"都按"4 个候选"叙述。40 例 smoke 若覆盖全部 profile 是 7 × 40 = **280 次运行**，而非隐含的 160 次。

需在 D4 冻结前明确：tscg ladder 四级是否全进 smoke，还是只取端点（`tscg-sig` 与 `tscg-cfo`）；v4-g 的 G1/G2 是否都进。这直接决定账户预算。

### C-4（中）：共享文件重叠，移植冲突面集中

`tscg-lite` 与 `v4-g` 同时改动这批共享生产文件：

```
src/injection/tool-prompt/compiler.ts
src/injection/tool-prompt/profiles.ts
src/injection/tool-prompt/index.ts
src/injection/injectors/skill-injector.ts
src/injection/injectors/skill-tools-injector.ts
src/injection/injectors/knowledge-tools-injector.ts
src/injection/injectors/tdai-profile-memory-injector.ts
src/injection/injectors/tdai-tools-injector.ts   （tscg-lite 独有）
src/__tests__/tool-prompt-compiler.test.ts
```

`v4-g` 与 `v4-rn` 同时改 `MemoryProxy/package.json`（各自 capture 脚本）。

§6 禁止移植分支互相继承，因此这些重叠编辑必须在每个分支上各自对着已被 B0 改造过的新基座重解一遍。建议在移植前统一"方法相关文件"口径（`package.json` 脚本追加、共享 injector 的 gating 改动是否计入），否则四个候选的 gate 判定会不一致。

### C-5（通过项）：V0-V3 输出不变量在三个候选上守得住

- **v4-g**：把 5 处 `profile === "capability-pruned"` 改为 `usesCapabilityPruning(profile)`，该函数对 V3 返回值不变、仅对自己新增的 2 个 profile 额外为真，属行为保持型重构；且已正确扩展 `compiler.ts` 的全部 4 处 renderer cascade 条件；
- **tscg-lite**：已在 4 处 cascade 条件中加入 `definition.renderer === "tscg-lite"`，并用 `compilerVersion: tscgProfile ? TSCG_LITE_COMPILER_VERSION : TOOL_PROMPT_COMPILER_VERSION` 区分版本；
- **v4-rn**：`variant-profiles.ts` 仅追加一个键，不动 V0-V3 取值；
- **c3p-eq**：纯 export 追加。

`compiler.ts` 的 renderer cascade 用 `definition.renderer === "..."` 逐级串联，新增 renderer 必须同时改 4 处条件——这是移植时的结构性陷阱，但 tscg-lite 与 v4-g 两位作者都已正确处理。

## 8. 待办：文档勘误

### A-1（低）：Stage A gate 报告宣称 PASS，但该 tag 打出时含 2 个失败测试

在干净的 `a22cebd` 工作树上，`formal-build-frozen-restore-plan.test.ts` 为 3 测试 2 失败，统一原因 `worktree dataset status does not match the frozen Tag blob`。根因是阶段 A 换入了 v2.1 的 status blob，却把 `build-frozen-restore-plan.ts` 留在解析 `registry/contracts/formal-v1.json`。

`2c323b5` 的审计（§3.1）已把它重述为"Stage A 的声明边界本来就是 `PASS for Stage A freeze`，10 个失败说明旧 Measurement-v2 manifest 未迁移，而非 800 例公开数据错误"，并决定保留 Stage A tag 为不可变 checkpoint。该处置合理。

仅剩勘误需求：`STAGE-A-800-DATA-INTEGRATION-GATE.md` 正文的 "Stage A 专用 Gate 和 Prompt 回归通过" 与实测不符，建议加一段勘误说明该 tag 打出时 `formal-build-frozen-restore-plan.test.ts` 有 2 个失败、已由阶段 B 修复。不建议改写历史 tag。

## 8.5 已核实无问题的设计（记录以免被误改）

以下几项曾被怀疑是缺陷，核实后确认是正确设计。记录在案，避免后续有人"修"掉它们。

**`TOOL_PROMPT_COMPILER_VERSION = "c05.1"` 不是漏更新。** C06/C07 完全没有触碰渲染器（`git diff task1-c05-pass..task1-c07-pass -- src/injection/tool-prompt/` 为空），版本号跟随最后一次 renderer 变更是正确语义。不要因为"已经做到 C07"就把它改成 c07。

**V3 的能力剪枝不变量是刻意的双向 fail-closed。** `assertConsistentCapabilityState` 强制三条：`skill_write/skill_extract ⇒ skill=1`、`wiki/code_graph ⇒ knowledge=1`、`knowledge=1 ⇒ wiki∨code_graph`。`lintCapabilityPrunedSurface` 同时检查"启用家族缺 surface"与"禁用家族留 surface"两个方向。`applyCapabilityPruning` 对禁用家族直接抛 `cannot compile disabled ... prompt surface` 而非静默产出空表面。这些抛错路径是设计的一部分，不是过度防御。

**`constrainCapabilitySignature` 只做单调收窄**（全部 `&&`），不会因 session 标志反而放宽进程级能力，并重新施加上述不变量。

**`formalMetricEligible: false` 是三处 `as const` 的刻意不变量**，含义是"这些构建产物本身不是正式指标"，不是未完成标记。

**`src/injection/tool-prompt/` 全目录零 TODO/FIXME/XXX/HACK/placeholder。**

## 9. 问题总表

| ID | 严重度 | 问题 | 类型 | 阻塞对象 |
|---|---|---|---|---|
| P-1 | 高 | 20 条 spec 中 18 条无 contrasts；6 个 smoke 关键路由全为 0 | 提示词质量 | terminal 选择指标的解释力 |
| M-1 | 高 | V2 静态 Token 节省 86.4% 来自中文改英文 | 指标口径 | Token 台账、可迁移性结论 |
| C-1 | 高 | C-3P-EQ 无 profile，产不出 Dev 数据 | 阶段 C 决策 | 候选口径与预算 |
| C-2 | 高 | v4-g 未注册 runner variant，正式 runner 抛错 | 阶段 C 缺陷 | v4-g 的 smoke/Dev |
| C-3 | 高 | 实际 7 个 profile 而非 4 个 | 阶段 C 决策 | D4 冻结、账户预算 |
| M-2 | 中 | V0-V1 描述 3 个本配置不可调用的写工具 | 指标口径 | FCR 错误分解 |
| M-3 | 中 | `stablePrefixTokens` 语义被误读风险 | 指标口径 | cache 结论 |
| S-1 | 中 | 三个 lint 均不在生产编译路径上 | 代码结构 | 运行期提示词正确性 |
| S-2 | 中 | `removeIfPresent` 静默 no-op（7 处），V1a 已有正确模式 | 代码结构 | 与 S-1 组合致静默退化 |
| E-1 | 中 | `config.ts` TS2724，C06 引入；修复已在 v4-g | 代码缺陷 | 类型检查、候选 diff 纯净度 |
| E-2 | 中 | typecheck 基线不变量失效（54 写死 vs 实际 55） | 流程缺陷 | 后续诊断漂移无法发现 |
| C-4 | 中 | 共享文件重叠，移植冲突面集中 | 阶段 C 风险 | 四次移植 |
| S-3 | 低 | capability signature 重复键静默取最后 | 代码健壮性 | 生产 |
| S-4 | 低 | 缺失能力标志 fail-open | 代码健壮性 | 生产 |
| S-5 | 低 | `memory=0` 时共享策略宿主迁移 | 代码结构 | 生产前缀复用 |
| E-3 | 低 | EXPERIMENT-FREEZE-MANIFEST 仍 v1.1 / 640 | 代码缺陷 | 报告数据身份 |
| A-1 | 低 | Stage A gate 报告需勘误 | 文档 | 汇报可信度 |
| P-4 | 高 | V4-RN 捆绑中性措辞与 contrast 补全，结果无法归因 | 阶段 C 方法学 | V4-RN 的 Dev 结论 |
| M-4 | 中 | `forbidden` 命中是提示词合规，不是调用失败 | 指标口径 | 错误分解表述 |
| P-2 | 中 | Gold 对 read_scene 的 agent_id 判定不统一（仅冻结集 4 步） | 数据一致性 | read_scene 结果解读 |
| P-3 | 低 | 各 profile 工具菜单大小不同（10/12/14/13）— 第 14 章重新判定为能力补全，非混淆 | 指标口径 | 仅需在报告说明来源 |

已解决：R-1 至 R-6（详见第 2 章）。

## 10. 建议处理顺序

与 live preflight 主线并行，不冲突：

**在 B-live 之前（都是低风险、不改冻结产物）**

1. **E-1**：采纳 v4-g 的一行 `export type { ToolPromptProfile } from "./types.js";`。纯修复，不改运行行为。
2. **E-2**：基线更新为真实值并把标准化指纹校验接入 `integration:gate`。
3. **A-1**：给 Stage A gate 报告加勘误段。
4. **S-2**：7 处 `removeIfPresent` 改为 fail-closed，与 V1a 对齐。因现有片段都存在，此改动不改变任何输出，故不影响冻结 hash——但改完必须复跑 `integration:gate` 确认。

**B-live 与 candidate-base tag**（按 `2c323b5` 审计第 6 章执行，本文不重复）

**在阶段 C 移植之前（决策项，无代码）**

5. **C-1**：定 C-3P-EQ 的定性（分析工具 or 补 profile）。
6. **C-3**：定 7 个 profile 中哪些进 smoke，据此重算 D4 预算。
7. **C-4**：统一"方法相关文件"口径。

**移植时**

8. **C-2**：v4-g 必须补 variant 注册，否则静态 Gate 过、模型阶段必失败。

**报告撰写时（不改代码）**

9. **M-1**：Token 台账披露语言归因；错误分析给出按语言分层的 Complete Chain / FCR。
10. **M-2**：FCR 错误分解单列"尝试不可用写工具"。
11. **M-3**：cache 结论引 `formal-cache-structure-gate`，不引 `stablePrefixTokens`。
12. **P-1**：若不补 contrasts，须说明 V2/V3 的 terminal 选择测的是"只有 when 的卡片"。

**可选加固 / 生产项**

13. **S-1**：至少在 R05 preflight 对实际 signature 跑一次三个 lint。
14. **S-3 / S-4 / S-5**：记录为生产注意事项，本次实验不必处理。

**新 Variant 候选（不可在已冻结 V2 上原地改）**

15. **P-1 的实质修复**：为 4 个 Skill 只读工具与 2 个 Knowledge 工具补 `contrasts`/`avoid`，作为 V2.1 走同一实验流程验证。

## 11. 本文未验证项

诚实声明，以下未在本轮覆盖：

- **B-live 全部内容**：未启 Docker、未恢复真实资产、未调模型，故三服务 health、restore/inspect receipt、T17-T20 真实资产可见性、运行期 signature 与捕获时是否一致，均处未知；
- **dataset registry 疑似 flake**（旧 B-7）：单跑通过、在 `r05:gate` 内曾失败 1 个，本轮尝试连跑 3 次因超时未完成，故**未能确认或排除**。该文件承担 800/320/480/300 契约验证，建议单独复跑数次；
- **M-1 的行为侧效应**：只证明了 Token 归因，中英文 Case 的行为差异需 320 Dev 分层结果才能回答；
- **四个方法分支的渲染器实现**：只核了 profile/variant 注册与 compiler cascade 扩展完整性，未做等深度源码审查（`tscg-lite.ts`、`typed-action-graph.ts`、neutral-symmetric 渲染器均未读）；
- **Langfuse 连接状态**；
- **formal-v2.1 数据语义质量**：DS07/DS08/DS09 已有独立证据，本轮未重做。

## 12. 本轮执行的命令

```
git worktree list / branch -a / tag --list / rev-parse / merge-base / diff --name-only / log -S
git show <tag>:<path>                      （逐 tag 比对 profiles.ts 与 config.ts）
npx tsc --noEmit                           （诊断计数与路径归类）
npm run eval:tool-prompt:formal:coverage   （覆盖矩阵确定性，跑两次比对 SHA-256）
npx vitest run formal-dataset-registry / formal-build-frozen-restore-plan
npm run eval:tool-prompt:formal:r05:gate   （96/96 确认 R-1、R-6）
npx tsx <临时脚本>                          （加载真实 spec/contract 统计决策语义完整度）
node -e （require tiktoken get_encoding o200k_base，重算 6 个 profile 的 CJK 归因）
逐文件读取 src/injection/tool-prompt/ 全部 8 个源文件
```

未执行：任何 Docker 启动、任何模型调用、任何 git 写操作（commit / tag / push / checkout / stash / reset）。唯一写入是本文件与一次确定性重跑（产物逐字节未变）。

## 13. 与 server-team 原始代码的对照审查

补充日期：2026-09-01（同日追加）

对照基准：`D:\projects\TencentDB-Agent-Memory-server-team`，commit `29d609a`（`v2.0.1-beta.2`）。

动机：`RuntimeToolContract` 是任务一手写的派生物，其 `sourceRefs` 指向 server-team 生产代码。若契约本身失真，V0-C 的"契约修正"会把 V0 修向错误方向，且 V0-C→V3 全部继承，scorer 也建在同一错误上。因此必须以生产代码而非契约为基准复核。

### 13.1 契约对生产代码的保真度：全部通过

**路径**：18 条已映射契约路径逐条命中 server-team 的 allowlist——`MemoryProxy/src/memory/memory-bridge.ts:46` 的 6 条 memory 子路径与 `MemoryProxy/src/skill/skill-bridge.ts:140` 的 12 条 skill 子路径，无一错误。任务一的命名映射（如 `scenario/read` → `tdai_read_scene`、`get-by-name` → `skill_view`）是正常改名，不是路径错误。

**参数**：memory 契约与 `MemoryCore/src/gateway/generated/schemas.ts` 逐字段一致：

| 契约 | required | optional | 结论 |
|---|---|---|---|
| `tdai_memory_search` | `query` | `limit,type,time_start,time_end` | 与 `atomicSearchRequestSchema` 一致 |
| `tdai_atomic_query` | （无） | `limit,offset,type,time_start,time_end` | 一致（`limit`/`offset` 来自组合的 `paginationSchema:41`） |
| `tdai_conversation_search` | `query` | `limit,session_id,time_start,time_end` | 与 `conversationSearchRequestSchema` 一致 |
| `tdai_conversation_query` | （无） | `session_id,limit,offset,time_start,time_end` | 一致 |
| `tdai_read_scene` | `path` | `agent_id,version` | 与 `scenarioReadRequestSchema` 一致，`agent_id` 见 13.2 |
| `tdai_scenario_ls` | （无） | `path_prefix` | `scenarioListRequestSchema:236` 确有 `path_prefix` |

审查中我曾误判两处，均已自我推翻：一是以为 `tdai_atomic_query` 的 `limit/offset` 无出处（实际来自 `paginationSchema`）；二是以为 `tdai_read_scene` 自相矛盾地同时把 `agent_id` 列入 optional 与 forbidden（实际它有独立的 `forbiddenArgs: ["user_id","team_id","task_id"]`，**刻意排除** `agent_id`）。契约比初判更准确。

**提示词**：6 个 profile 的全部工具卡与契约在 path、requiredArgs、method 上零不符；卡片体内未出现该契约的 forbiddenArgs。

**未映射项**：server-team 的 skill allowlist 有 3 条未被任务一映射：`list`、`versions`、`listing`。`listing` 对应 `<available_skills>` 块（非工具卡），`list`/`versions` 任务一未考察。建议确认 Gold 是否需要，若不需要则在报告中说明这是有意的考察范围收窄。

### 13.2 `agent_id` 的语义落差：核实后不是缺陷

Gold 共 445 步，`agent_id` 出现在 `arguments.forbidden` 的有 **245 步 / 182 案例**（memory 82、skill 157、knowledge 6），在 `required` 中 **0 次**，无自相矛盾。

而 server-team 侧 `agent_id` 在 memory 是**功能性选择器**，不是禁用字段：

- `memory-bridge.ts:384`：search 类若模型不传 `agent_id`，扇出查询 self + 全部借入 ctx；传了则走单目标；
- `memory-bridge.ts:443`：`selectTargetCtx(ctxs, inboundBody.agent_id)` 按它选中具体 imported agent；
- `memory-bridge.ts:230-232`：按 `agentId` 匹配 ctx。

初判这是"推理正确的模型被判失败"的缺陷。核实后**不成立**，依据两条：

1. **不存在借入 agent**。`worlds/formal-schema.ts:155` 虽建模了 `importedMemoryAgentIds`，但数据集中全部 **146 处均为空数组 `[]`**；冻结产物的 `<tdai_profile_memory>` 也只有一个 `role="self"`。故不存在需要选借入 agent 的案例，合规模型不会传 `agent_id`。
2. **skill 侧禁用是正确的**。`skill-bridge.ts:591` 起明确 identity 由 bridge 从 session 强制 stamp（v3 strict-isolation 中间件要求 team_id/agent_id/user_id），模型无法选择。故 157 个 skill 步禁用 `agent_id` 与生产行为一致。

结论：Gold 的禁用是合理严格，记录为"已核实不是问题"，避免后续重复怀疑。

### 13.3 问题 M-4（中）：`forbidden` 命中衡量的是提示词合规，不是调用失败

这是 13.2 的副产品，但影响报告表述的正确性。

server-team 从不因身份字段的**存在**而拒绝请求：

- `memory-bridge.ts:338-343` 的 `makeOutbound` 展开顺序是 `...inboundBody` 在前、`user_id/team_id/agent_id` 在后，即模型传的身份被**静默覆盖**，不返回 400；
- `MemoryCore` 的 `idFieldsSchema:24` 注明身份字段"**全部可选**：接口 schema 层不做必填校验"，其错误码是 404/403 的归属校验，与存在性无关；
- schemas.ts 未使用 `.strict()`，未知键按 Zod 默认被剥离而非拒绝。

因此当模型多传 `user_id` 时，真实链路上**调用是成功的**，只是 scorer 的 `matchesArguments`（`scorer.ts:237-239`，要求 `readJsonPath(body, field) === undefined`）判该步不匹配。

这是任务一合理的设计选择——它考察提示词是否教会模型不要伪造身份。但报告不得把这类命中描述为"调用失败"或"工具调用错误"，否则与真实链路事实相反。建议在错误分解中单列"身份字段合规违规（调用成功但不合规）"，与真正的调用失败区分。

### 13.4 问题 P-2（中）：Gold 对 `tdai_read_scene` 的 `agent_id` 判定不统一，且不一致只存在于冻结验证集

23 个 `tdai_read_scene` 步中，**4 步禁用 `agent_id`、19 步不禁用**，而契约明确将其列为 optional。4 例全部落在 hidden 分片：

```
T07-PAIR-M04-P  step-2
T07-PAIR-M06-P  step-1
T08-PAIR-M03-P  step-2
T08-PAIR-M06-P  step-1
```

即 Dev 的 19 步统一允许，只有 Frozen Holdout 有 4 步更严。实际影响低（无借入 agent，合规模型不会传），但两点值得记录：一是同一工具同一契约下判定不统一；二是不一致恰好落在冻结后不可据其改 Prompt 的分片里，若将来引入借入 agent，这 4 步会直接变成错判。

建议：不修改已冻结数据，在报告的数据说明中记录该不统一，并在 `tdai_read_scene` 的结果解读中标注。

### 13.5 问题 P-3（中）：各 profile 的工具菜单大小不同，需作为"工具选择正确率"的口径说明

冻结产物中 `<tool name="...">` 卡片数：

| Variant | 卡片数 | 相对 V0 |
|---|---:|---|
| V0 | 10 | 基线 |
| V0-C | 12 | +`skill_view_by_id`、+`skill_files_download` |
| V1a / V1 / V2 | 14 | 再 +`knowledge_tools_list`、+`knowledge_tools_call` |
| V3 | 13 | 上述 14 项减 `skill_extract`（能力剪枝） |

其中 knowledge 的 +2 **不是覆盖缺口**：V0 的 `<knowledge_tools>` 块内容完整（含 list→call 两步链、完整 curl、`tool_name` 与 `params` 约定、`knowledge_id` 不拼 URL 的警告），5 个顶层块与 V1a 相同，只是未采用 `<tool name=>` 卡片格式。V0-C 的 +2 则对应 C07 记录的"补齐两个 Skill 只读入口"。

但事实仍然成立：模型在不同 profile 下面对的可选工具集合大小不同（10 / 12 / 14 / 13）。`TerminalSelectionRate` 的分母语义因此不完全可比，报告需说明该差异，不能仅以"选择更准"解释 V1a 之后的提升。

### 13.6 问题 P-4（高）：V4-RN 同时改变两件事，结果无法归因

`v4-rn` 修改了 `specs/memory.ts`、`specs/skill.ts`、`specs/knowledge.ts`——**124 行纯新增、0 删除**，只添加 `neutralPurpose`、`neutralWhen`、`neutralContrasts`、`responseHints` 等新字段，原有 `when`/`contrasts` 未动。**隔离是安全的**，V0-V3 输出不受影响（这一点已核实，不是问题）。

问题在于新增内容的性质。V4-RN 给 12 个 skill 工具中的 10 个添加了 `neutralContrasts`，而这些工具在 V0-V3 的 `contrasts` 中**全部为空**：

```
skill_search          contrasts(V0-V3)=无   neutralContrasts(V4-RN)=有
skill_view            contrasts(V0-V3)=无   neutralContrasts(V4-RN)=有
skill_view_by_id      contrasts(V0-V3)=无   neutralContrasts(V4-RN)=有
skill_files_read      contrasts(V0-V3)=无   neutralContrasts(V4-RN)=有
skill_files_download  contrasts(V0-V3)=无   neutralContrasts(V4-RN)=有
（另 5 个写工具同样从无到有；仅 skill_extract 与 skill_delete 未加）
```

memory 侧同理：`tdai_atomic_query` 与 `tdai_conversation_query` 在 V0-V3 无 contrasts，V4-RN 补上了。

因此 V4-RN 捆绑了两个自变量：

1. 中性对称卡片措辞（它声明的方法本身）；
2. **为原本没有区分信息的工具补上了 contrast 覆盖**——恰好是 P-1 指出的空缺，且恰好覆盖 4 条 smoke 关键只读路由。

若 V4-RN 的 `TerminalSelectionRate` 上升，实验无法区分是措辞中性化起作用，还是仅仅因为"这些工具第一次有了区分信息"。这违反 §2.1"唯一自变量是 Prompt Variant"在方法内部粒度上的意图。

处理建议（三选一，须在 V4-RN 跑 Dev 前定）：

1. 增加一个 V4-RN 消融档：保留中性措辞，但不注入新增的 `neutralContrasts`，以隔离措辞效应；
2. 先把缺失的 contrasts 补进一个 V2.1 基线，让 V4-RN 与 contrast 完整的基线比较；
3. 至少在报告中显式声明该混淆，并说明 V4-RN 的收益上限包含了 contrast 补全的贡献。

方案 1 最干净且成本最低，建议采用。

### 13.7 本章新增条目的处置顺序

第 10 章的顺序仍然有效，以下四项插入其中：

**在 V4-RN 跑 Dev 之前（阻塞项）**

- **P-4**：定 V4-RN 的消融方案。建议采用消融档（保留中性措辞、不注入新增 `neutralContrasts`），成本最低且能干净隔离措辞效应。若不做，V4-RN 的 Dev 结果只能作为"措辞 + contrast 补全"的合并效应报告，不能声称是中性对称卡片的贡献。这条与 P-1 是同一根因的两面，应一并决策。

**报告撰写时（不改代码、不改数据）**

- **M-4**：错误分解单列"身份字段合规违规（调用成功但不合规）"，与真正的调用失败区分。表述上不得把 `forbidden` 命中写成"调用失败"。
- **P-3**：说明各 profile 工具菜单大小为 10/12/14/13，`TerminalSelectionRate` 的分母语义不完全可比；V1a 之后的提升不能仅以"选择更准"解释。同时说明 knowledge 的 +2 是格式差异而非 V0 覆盖缺口。
- **P-2**：在数据说明中记录 Gold 对 `tdai_read_scene` 的 `agent_id` 判定不统一（19 允许 / 4 禁用，4 例全在冻结集），并在该工具的结果解读处标注。不修改已冻结数据。

**无需处置（已核实不是问题，记录以免重复怀疑）**

- 契约对 server-team 的路径与参数保真度（13.1）；
- `agent_id` 在 Gold 中被禁用的合理性（13.2）；
- v4-rn 对三个 specs 文件的修改是纯新增，V0-V3 输出不受影响（13.6 首段）。

### 13.8 本章的方法与未验证项

本章执行：读取 server-team `29d609a` 的 `memory-bridge.ts`、`skill-bridge.ts`、`MemoryCore/src/gateway/generated/schemas.ts`、`tdai-fixed-asset.ts`；用 tsx 加载真实契约对象与 MemoryCore schema 逐字段比对；解析 800 条 Gold 的 445 个 step 统计参数判定；比对四个方法分支相对各自 merge-base 的 `src/injection/tool-prompt/` 变更。

本章**未**覆盖：

- 四个创新渲染器的实现正文。`tscg-lite.ts`、`typed-action-graph.ts`、`neutral-symmetric.ts`、`three-plane.ts` 均只核了注册面、compiler cascade 扩展完整性与 specs 影响面，未逐行读实现。tscg-lite 另外修改了 `runtime-contract.ts`，该改动对契约保真度的影响**尚未核实**，应在移植前单独审查；
- MemoryKnowledge 侧的路由与 header 契约（`KNOWLEDGE_HEADERS` 只声明 `content-type` 与 `x-tdai-service-id`，而 V0 正文示例给出 6 个额外 header），未与 MemoryKnowledge 生产代码比对；
- skill 契约的 requiredArgs/optionalArgs 未与 skill 侧 schema 逐字段比对（本章只比对了 memory 的 6 条）；
- 未映射的 3 条 skill 子路径（`list`、`versions`、`listing`）是否被 Gold 需要。

## 14. 逐代审查：每一代的改动是否正确、相对前代是否改进、对任务一是否有效

补充日期：2026-09-01（同日追加）

审查框架：V0-V3 是继承链 `legacy → contract-corrected → protocol-compact → compact → selection-calibrated → capability-pruned`，每代只在父代上加一个变换。因此判据是三条：**改动本身是否正确**（对 server-team 生产代码）、**相对前代是否真的改进**、**对任务一三个主指标是否有效**。

本章推翻了前文三处判断，先记录：

| 前文判断 | 本章结论 |
|---|---|
| P-3：工具菜单大小不同（10/12/14/13）是混淆 | **判错**。卡片增长是 V0-C 与 V1a 在补 V0 缺失的能力覆盖，是功能改进而非混淆。P-3 降级 |
| V2 删掉了 memory 多步链规则 | **判错**。规则被重述进卡片字段（`when`/`avoid`），语义等价 |
| V2 丢掉 knowledge operation 路由是退化 | **判错**。委托运行时 `tools/list` 发现更正确，见 14.5 |

我用 `grep -o` 词频下降推断语义丢失，这个方法本身不可靠——压缩型改动本就会降低词频而保留语义。本章改为读卡片正文判定。

### 14.1 V0 → V0-C（contract-corrected）：价值最高的一代

改动：15 条契约修正。抽样对 server-team `29d609a` 验真，全部为真：

- `skill-search-bm25-contract`：V0 写"关键词 + **语义**检索"。`skill-bridge.ts:760` 明确 "LLM only supplies `query` — top_k / mode / scope / any other field is dropped"（2026-08-10 硬白名单），Core 默认 BM25。V0-C 改为"BM25 关键词检索"——**真修正**；
- `skill-team-result-view-by-id`：`get-by-name` 限于当前 owner agent，团队搜索命中需 `/get`。V0-C 因此**新增 `skill_view_by_id` 卡片**；
- `skill-file-read-json-only`：`/files/read` 返回 JSON 信封，原始字节走 `/files/download`。V0-C 因此**新增 `skill_files_download` 卡片**；
- `knowledge-node-requires-include-code`：`node` 仅在 `includeCode=true` 时返回源码。已验证 `MemoryKnowledge/src/routes/code-graph.ts:89` 与 `routes/tools.ts:159` 默认 `false`（"默认 false 以节省上下文"）——**真修正**；
- 6 条 `expected_version` 修正（update/patch/delete/files_write/files_remove）：对本实验无影响（写工具在 `skill_write=0` 下不可调用），但对生产准确。

对任务一有效性：**高**。它是唯一填补真实能力缺口的一代——`skill_view_by_id` 与 `skill_files_download` 让 §B2 要求的 search-to-view 与 view-to-files-read 路由第一次可达。卡片 10→12 即此。为此 Token 上升 245 是应该付的代价。

仍可改进：`skill-search-bm25-contract` 修正了描述，但 V0-C 正文仍出现 `top_k` 字面量（各一次，在"不要在 body 里加 top_k/mode 等其它字段（会被忽略）"句中）。既然 bridge 无条件丢弃，更彻底的做法是不出现该字段名，避免模型把它当可调项。收益小、风险零。

### 14.2 V0-C → V1a（protocol-compact）：工程质量最高的一代

改动：把 POST/JSON/公共 header/响应信封/错误分类提取为 `renderSharedExecutionGrammar` 渲染一次；路径由契约派生；把 knowledge 补成正式工具卡（12→14）。Token −363。

正确性有代码级保证。`protocol-compact.ts` 全文 **14 处 throw、零 `removeIfPresent`**：`captureOne`、`replaceOnce`、`replaceRegexOnce`、`insertExecutionGrammar` 均在匹配数不为 1 时抛错，且 `replaceOnce` 对**片段缺失也抛错**（`first < 0` 即抛）。上游文案任何漂移都会让构建失败，而不是静默产出退化提示词。

对任务一有效性：**高**。去重无损，且是全链唯一有构造性证明的一代。knowledge 补卡使三族在卡片层面首次齐备。

### 14.3 V1a → V1（compact / semantic-compact）：有效但纪律回退

改动：语义级去重，为每条重复规则指定唯一保留所有者，6 条 `SEMANTIC_UNIT_INVENTORY` 记录 removed/retained 位置，`lintDuplicateSemanticUnits` 校验"恰好一个保留者"。Token −386。

对任务一有效性：**中**。去重方向正确，所有权模型可审计。

缺陷（已在 S-2 记录，此处给出代际归因）：这一代引入了 `removeIfPresent`——片段缺失时**静默返回原文**，5 个调用点（`semantic-compact.ts:156/157/162/167/179`）。这相对 V1a 是纪律回退：同一 seam 内 V1a 的 `replaceOnce` 对缺失抛错，V1 却选择静默。叠加 `lintDuplicateSemanticUnits` 不在生产编译路径上（S-1），上游改一个标点即可让 V1 静默退化回 V1a 而无任何 gate 失败。

可改进：把这 5 处改为 fail-closed。因现有片段都存在，改动不产生输出差异，故不影响任何冻结 hash，但需复跑 `integration:gate` 确认。

### 14.4 V1 → V2（selection-calibrated）：Token 赢最多，但招牌机制是空的

改动：7 条集中所有权的共享选择策略 + `renderSelectionGate` 全局 gate + 契约支撑的 when/avoid/contrast 卡片。Token −1719（全链最大）。

本轮核实推翻了两处"退化"初判：

- **memory 多步链规则未丢失**。V2 的 `tdai_read_scene` 卡片保留了等价语义：`when: A scene path is known from the injected index or scenario listing and its full body is required.` 对应原"path 必须先从 `<l2_scene_index>` 或 tdai_scenario_ls 获取"；`avoid: Do not invent a scene path.` 对应原"不要凭空构造"；连 imported 记忆传 `agent_id` 的指引也保留在 body 示例里。这正是 C04 应做的：语义保留、形式压缩；
- Gold 侧有 8 个 `read_scene` 步带 typed binding（`argumentPath: path` ← `priorStepId: step-1` 的 `data.entries.0.path`，`comparison: exact`），即链路由 binding 强制。V2 的卡片语义与该 binding 一致。

对任务一有效性：**中偏高**。它是唯一为"是否调用 / 调用哪一族"写入显式 gate 的一代，直接对应主指标 1 与 2。

但缺陷集中且都落在主指标上：

1. **招牌的 contrast 机制 18/20 为空**（P-1）。`renderSelectionGate` 的 family 级路由是实的，但工具级 when/avoid/contrast 卡片里，20 条 spec 只有 2 条有 `contrasts`（memory 互指一对），4 条 smoke 关键 skill 只读路由与 2 条 knowledge 工具**全部为 0**。而 `TerminalSelectionRate` 恰恰考察同族相邻工具的区分。招牌机制在被考察处没有内容；
2. **Token 节省的 86.4% 来自中文改英文**（M-1），真正去重仅约 234 token；
3. 引入 2 处 `removeIfPresent`（`selection-calibrated.ts:221/225`），同 14.3。

### 14.5 关于 V2 删除 knowledge "意图 → 起手"映射：可辩护，甚至更正确

V0/V0-C/V1a/V1 的 knowledge 块含一段固定映射：`架构 → explore；符号名在哪 → search；要源码 → node（includeCode=true）；谁调用 X → callers/callees；影响面 → search 后 impact；为什么这么设计 → wiki search 后 read_page`。V2 删除，未重述。

初判为退化，核实后**不成立**，三条依据：

1. `MemoryKnowledge/src/routes/tools.ts` 的 `tools/list` 在运行时返回每个 operation 的**名称 + 描述 + params**（如 `search`："BM25 全文搜索 wiki 页面内容。用关键词查找相关文档。"；`includeCode`："是否包含完整源码（默认 false 以节省上下文）"）。Gold 的 knowledge 链第一步恰是 `knowledge_tools_list`，故模型必然先拿到这份清单；
2. 该映射是**资源类型特定**的。wiki 与 code_graph 暴露的工具集不同，静态提示词无法预知某资源暴露哪些 operation；对不暴露 `explore`/`node` 的 wiki 资源，V0-V1 那张表本身就是错的。V2 改为"执行 `tools/list` 返回的 name 与 params"是更正确的抽象；
3. 丢掉 `includeCode=true` 对本数据集无影响。Gold 仅 3 个 `node` 步，其 `stopAfter` 均只要位置（如"返回 AliasPrinter 位于 mypy/stubgen.py:364 后停止"），而 `node` 不带 `includeCode` 即返回位置/签名/调用链。

残留事实（非缺陷，供解读）：Gold 有 **118 个 knowledge 步、其中 60 个带精确 terminal operation、覆盖 11 种 operation**（`search` 29、`search_pages` 11、`search_code` 6、`node` 3、`search_symbols` 3 等），且 knowledge 步 **0 typed binding**。即 operation 选择完全依赖运行时发现是否奏效——这是实验要回答的经验问题，而非提示词缺陷。V2/V3 与 V0-V1 在此点上的差异应作为一个明确的对比维度报告。

### 14.6 V2 → V3（capability-pruned）：正确但在本实验中被闲置

改动：按 session 能力事实求交剪枝，13 处双向 fail-closed 断言。Token −84。

对任务一有效性：**低**——不是方法不好，而是配置使其无从发挥。实验 signature 冻结为 `memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0`，三族全开、仅两个 skill 子能力关闭，故 V3 实际只剪掉 1 张卡（`skill_extract`），14→13。

**最大的可改进点在这里**：`resolveSessionCapabilitySignature` 已支持按 session 资产标志收窄，但实验用的是全局固定 signature。若改为**按每条 Case 实际绑定的资源类型派生** signature（该 Case 只绑 wiki 就 `code_graph=0`，只绑 code_graph 就 `wiki=0`，无 Skill 资产就 `skill=0`），V3 能剪掉整段不可用的族说明与资源策略文本。收益远大于 84 token，且**直接降低 no-tool 误调用**（模型看不到本 Case 根本没有的资源，就不会去调）。这既符合"从快照派生、不引入新自变量"的原则（binding 已经知道每条 Case 的可见资产），也让 V3 的方法第一次被真正考察。

代价：不同 Case 的静态前缀不同，会削弱 provider prompt cache 命中。这是真实权衡，须在报告中量化 `cached_tokens` 变化，不能只报 Token 下降。

### 14.7 各代小结

| 代 | 改动 | 正确性 | 相对前代 | 对任务一有效性 | 主要缺陷 |
|---|---|---|---|---|---|
| V0-C | 15 条契约修正 + 补 2 张卡 | 对 server-team 验真通过 | 补真实能力缺口 | **高** | 仍出现 `top_k` 字面量 |
| V1a | 共享执行语法 + 契约派生路径 + 补 knowledge 卡 | 14 处 throw、零静默 | 无损去重 | **高** | 无 |
| V1 | 语义去重 + 唯一所有者 | 有 lint 但脱链 | 方向对 | 中 | 引入 5 处静默 `removeIfPresent` |
| V2 | 共享选择 gate + when/avoid/contrast 卡 | 语义保留已核实 | Token 赢最多 | 中偏高 | contrast 18/20 空；86.4% 节省来自换语言 |
| V3 | 按能力求交剪枝 | 13 处双向断言 | 正确但仅剪 1 张卡 | **低（被配置闲置）** | signature 全局固定，方法未被考察 |

### 14.8 这条方法链上仍可改进的地方（按对主指标的预期收益排序）

1. **补齐 V2 的 contrast 覆盖**（对应 P-1）。为 `skill_search`/`skill_view`/`skill_view_by_id`/`skill_files_read` 与 `knowledge_tools_list`/`knowledge_tools_call` 补 `contrasts` 与 `avoid`。唯一直接作用于主指标 `TerminalSelectionRate` 的改进，且机制已存在（memory 那一对证明填了就有输出）。
2. **V3 按 Case 资源类型派生 signature**（14.6）。同时改善 `StaticToolTokens` 与 `FalseCallAttemptRate`，并让 V3 第一次被真正考察。须同时量化 cache 影响。
3. **把发现规则显式写进提示词**（承接 14.5）。V2 删掉资源特定映射是对的，但可以补一条与资源无关的规则：先 `tools/list`，再按返回的 `description` 选最窄匹配的 operation，不要凭名字猜。这不引入资源特定知识，却直接支撑 60 个带精确 terminal operation 的 Gold 步。
4. **把 V1a 的 fail-closed 纪律回填 V1/V2**（S-2）。7 处 `removeIfPresent` 改为缺失即抛。不改变输出，纯消除静默退化风险。
5. **移除 `top_k` 字面量**（14.1）。收益最小但零风险。

前三项都改变提示词语义，**必须作为新 Variant（如 V2.1 / V3.1）走同一实验流程**，不得在已冻结的 V0-V3 上原地改。第 4、5 项不改变输出，可直接进公共基座。
