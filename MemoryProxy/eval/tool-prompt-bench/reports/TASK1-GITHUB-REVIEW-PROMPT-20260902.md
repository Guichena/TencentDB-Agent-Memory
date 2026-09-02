# Task 1 GitHub 独立审查提示词

请对下面的 GitHub 分支做一次独立、只读审查：

- 仓库：`https://github.com/Guichena/TencentDB-Agent-Memory`
- 分支：`codex/task1-repo-backed-640`
- 正式评测计划：`MemoryProxy/eval/tool-prompt-bench/reports/TASK1-FORMAL-EVALUATION-MASTER-PLAN-20260902.md`

不要根据这段提示词直接下结论。请先拉取该分支，记录最新 HEAD，然后以实际源码、正式数据、runtime binding、测试和计划文档为准。不要修改代码，不要运行正式模型评测，不要打开或使用 Hidden Gold 调整方案。

## 审查目标

判断当前代码和正式评测计划能否保证：

1. 除 Prompt Variant 外，各 Variant 使用相同数据、Workspace、资产、模型、预算和评分规则。
2. 每个正式 Case 本身合理，模型能看到正确的对话历史和指定 revision 的真实源码。
3. scorer 只要求输入或前序工具结果能够推出的行为，并按完整 Episode 评分。
4. 不合格、答案泄露或资格无法确认的数据不会进入正式 Smoke、Dev 和 Hidden。

只关注会影响评测公平性、结果正确性或能否开始大规模评测的问题。不要建议与本次评测无关的通用平台化、防御性框架、发布流程或工程重构。

## 必查内容

### 数据资格

- 核对当前激活的数据投影、Dev/Hidden 数量、Positive、paired Negative 和 Natural Negative 构成。
- 检查计划中提到的 `hard_exclude`、`unresolved_preflight` 和 `qualified_candidate` 是否已有 Git 内可验证的来源，是否真正接入 loader、readiness、prepare 和 scorer。
- 检查 pair 是否原子保留或原子排除。
- 检查源码、Provider 输入、Memory、Skill、Knowledge listing 是否会直接泄露目标答案、工具名或资产 ID。
- 复核 `T03-MEM-001-P` 是否仍把 DVC Case 绑定到 MONAI Workspace。
- 复核 `T18-MEM-05-P` 是否仍要求输入中不可推出的日期，当前计划将其排除是否合理。
- 判断旧 40 例 Smoke 是否仍被默认执行，新的 Smoke 是否必须从最终合格 Dev 重建。

### 仓库和 Workspace

- 核对正式数据涉及的 repo、revision 和逻辑 Workspace 数量，不沿用文档里的手写数字。
- 检查 runner 当前是否仍创建空 Workspace。
- 判断计划中的最小恢复方案是否足够：从本地 cache 创建独立 checkout，验证目录非空、HEAD 等于指定 revision、工作树干净，并避免 Case 间污染。
- 检查 Playwright revision 缺失会影响哪些 Case，重试失败后成对排除是否会破坏数据平衡。
- 检查源码本身是否包含目标 Memory、Skill 或 Knowledge 内容，从而让 Positive Case 无需调用工具也能作答。

### 对话上下文

- 检查 `MemoryProxy/src/common/codex-history-transport.ts`、`MemoryProxy/src/codexHandler.ts` 和 `MemoryProxy/eval/tool-prompt-bench/real-chain-adapter.ts`。
- 确认历史消息是否从单条 JSON 用户文本转换成原生 `user`、`assistant`、最终 `user` 消息。
- 确认普通请求在没有显式 transport header 时保持不变。
- 确认 transport header 不会转发到 Provider，envelope 也不会残留在 Provider 输入中。
- 检查转换发生在 Prompt 注入和 Provider 转发之前，且不会改变正式输入哈希的比较含义。
- 判断现有单元测试是否足够，正式 Smoke 前还需要哪一个最小真实 Codex 探针。

### 运行与评分公平性

- 列出正式 runner 当前实际支持的 Variant，不把只存在于其他分支或尚未注册的 V4 当成可运行候选。
- 检查模型、reasoning effort、wall-time、repeat、Case 顺序和 TDAI 调用预算是否能对所有 Variant 保持一致。
- 检查 scorer 是否区分首个正确动作、完整链成功、严格最短链、额外调用和 No-tool 误调用。
- 检查多步链是否允许模型在后续决策中自行完成，而不是只按第一轮判失败。
- 检查 Gold 是否只在 Episode 完成后评分，执行器是否会根据私有 Gold 在线停止。
- 检查旧 800 例、旧 240 例或旧 40 例身份是否仍被硬编码到当前正式路径。

### 正式评测计划

- 判断六阶段计划是否遗漏了开始大规模 Dev 前真正必要的任务。
- 判断哪些任务可以删除，因为它们不影响公平性或正确性。
- 特别检查“探针和新 Smoke 通过后直接进入大规模 Dev”是否成立，是否还缺一个小规模全流程演练。
- 判断基础设施失败只重跑受影响 Case 是否公平，并给出最小记录要求。
- 判断排除大量数据后，剩余样本是否还能支持原定结论；如果不能，应如何缩小结论范围。

## 输出要求

请按下面结构输出：

1. **结论**：当前是否可以开始单例探针、正式 Smoke 和大规模 Dev，分别回答“可以”或“不可以”。
2. **阻塞问题**：只列必须在下一阶段前修复的问题，按严重程度排序。每项给出 GitHub 文件路径和行号、实际证据、影响及最小修复。
3. **非阻塞问题**：不会破坏公平性或正确性，但应在报告中说明的问题。
4. **计划缺口**：指出计划遗漏、顺序错误或仍然过度设计的部分。
5. **最小后续清单**：给出从当前 HEAD 到大规模 Dev 的最短任务序列，最多 10 项。
6. **可信度边界**：列出由于 GitHub 分支缺少本地 cache、外部 receipt、服务状态或密封 Gold 而无法验证的结论。

不要只复述计划文档，也不要把已有报告当成事实来源。所有关键判断都应回到当前分支的实际代码、数据和测试。若文档与源码冲突，以源码为准并明确指出冲突。
