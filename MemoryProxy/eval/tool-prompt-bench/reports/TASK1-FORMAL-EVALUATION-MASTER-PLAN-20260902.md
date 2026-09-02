# Task 1 正式评测计划

> 更新日期：2026-09-02
>
> 当前分支：`codex/task1-repo-backed-640`
>
> 起始基线：`fe01116a6ba5ed29f702c22127c7a3eca3a66940`

## 目标

这次工作只保证两件事：

1. **评测公平**：除 Prompt Variant 外，各 Variant 使用相同数据、源码、资产、模型、预算和评分规则。
2. **结果正确**：Case 本身合理，模型能看到正确上下文和源码，scorer 只检查输入中可以推出的行为。

不影响这两件事的防御性建设不进入当前范围。我们不追求把运行器改成通用评测平台，也不为极端异常设计复杂恢复流程。

## 当前还没解决的问题

| 问题 | 当前情况 | 处理方式 |
| --- | --- | --- |
| 数据资格 | 640 例中，366 例已确定硬排除，196 例仍需资格预检，78 例初步合格 | 硬排除直接剔除；196 例只做一次轻量预检，仍不确定就剔除 |
| 合格配对不足 | 当前 78 个初步合格 Case 中没有完整 pair | 从 196 例中确认可用 pair；如果最终 pair 仍少，就缩小结论范围，不补造数据 |
| 旧 Smoke 已失效 | 旧 40 例中有 19 例硬排除、15 例待确认、6 例初步合格 | 不再修旧清单，从最终合格 Dev 重新抽 Smoke |
| Workspace 为空 | `formal-prepare-runner.ts` 仍创建空目录 | 从本地 repo cache 恢复真实源码 |
| 仓库缺一个 revision | 27 个 revision 已缓存 26 个，Playwright commit `de214f440b7e34937fe4886f046b78b757136087` 缺失 | 最后重试一次，失败就剔除相关 8 例 |
| Workspace 统计不一致 | 旧 Smoke 实际是 19 个逻辑 Workspace，不是 18 个 | 不再手写数量，由最终 selection 自动统计 |
| T03 绑定错误 | `T03-MEM-001-P` 是 DVC Case，当前却绑定 MONAI | 如果该 pair 合格，改成 DVC revision；否则整对剔除 |
| T18 参数不合理 | 输入无法推出隐藏日期，而且该 pair 已被全量审计判为硬排除 | 整对剔除，不放宽 scorer，也不向上下文补答案 |
| 对话历史传输错误 | 历史消息曾作为 JSON 文本放进一条用户消息 | 原生 `user`、`assistant` 历史转换和定向测试已提交，仍需真实探针 |
| Runtime 仍读旧身份 | 部分 loader、readiness、restore plan 和 R04/R05 文档仍绑定旧数据或旧 Smoke | 改为读取新的合格投影和新 Smoke，不再写死数量 |
| 方法范围未定 | 现有 Variant 和 V4 候选混在一起，部分 V4 还不能运行 | 先跑当前已经注册、能进入正式 runner 的方法；V4 不阻塞本轮 |

现在还不能直接开始大规模评测。真正的阻塞项只有数据资格、真实 Workspace、上下文传输和统一运行协议。

## 最小公平性规则

| 项目 | 统一规则 |
| --- | --- |
| 数据 | 所有 Variant 使用同一份合格 Case 清单和 pair 清单 |
| Workspace | 同一 Case 使用相同 repo 和 revision，每次运行前恢复为干净源码 |
| Memory、Skill、Knowledge | 同一轮评测共享同一份只读资产快照和可见性配置 |
| 模型 | 模型、reasoning effort、wall-time 和 repeat 相同 |
| Prompt | 只允许被比较的 Prompt Variant 不同 |
| Episode | 最多 4 次 TDAI 调用，到终答、超时或预算结束 |
| 评分 | 完整 Episode 结束后统一评分，不只看第一轮 |
| Gold | 执行时不把私有 Gold 交给模型，运行结束后再评分 |
| No-tool | 整个 Episode 中出现不必要的 TDAI 调用就算误调用 |
| 重跑 | 只允许因明确基础设施故障重跑受影响 Case，设置保持不变 |

我们只保留能直接影响比较公平性的这些约束，不再增加多层 receipt、重复 seal 或整轮重建规则。

## 数据怎么处理

原始 Formal-640 保持只读，新建一份合格投影。生成过程很简单：

1. 366 个 `hard_exclude` 直接排除。
2. 196 个 `unresolved_preflight` 各做一次确定性预检。
3. 预检通过的进入合格投影，失败或仍无法判断的直接排除。
4. Positive 和 paired Negative 一起保留或一起排除。
5. 78 个 `qualified_candidate` 继续保留，但仍检查 Workspace 和直接答案泄露。
6. Hidden 与 Dev 使用同一资格规则，但方法选择完成前不查看 Hidden Gold。

轻量预检只检查以下内容：

- 预期直接打开的 Skill 是否真的在当前 Agent listing 中。
- 预期搜索的 Skill 是否没有被直接列出，而且查询线索能找到它。
- Knowledge ID 和目标资源是否对当前 Agent 可见。
- Memory path、session ID、日期和过滤条件是否能从可见输入或前一步工具结果推出。
- Workspace 源码是否直接包含目标 Memory、Skill、Knowledge 正文或目标答案。
- Provider 输入是否已经泄露工具名、资产 ID 或目标答案。

不修不合理 Case，也不为了保住 Case 改聊天上下文。一次预检后仍说不清资格的数据就排除。

产物只需要三份：

- `qualified-cases.jsonl`
- `excluded-cases.jsonl`
- `qualified-projection-manifest.json`

## 仓库和 Workspace 怎么处理

现有 cache 已覆盖 27 个 revision 中的 26 个。接下来不需要预先建立 65 份完整工作区，只需要：

1. 对 Playwright 缺失 commit 最后重试一次。
2. 完成数据排除后，从合格投影计算实际使用的 repo、revision 和 Workspace。
3. 为这些入选 Workspace 生成固定映射：`caseId -> repoUrl -> revision -> subdir`。
4. 每次 Case 开始前，从本地 cache 创建一个新的独立 checkout。
5. 检查目录非空、`HEAD` 等于指定 revision、工作树干净。
6. Case 结束后丢弃该 checkout，不把修改带到下一次运行。

不安装项目依赖，不运行项目测试，也不允许 Case 运行时临时拉取其他 revision。Task 1 只判断工具调用，源码能被模型正常查看就够了。

## 对话上下文怎么处理

当前修复方向是正确的：runner 仍通过一个显式 transport 把历史交给 MemoryProxy，MemoryProxy 在注入 Prompt 前将其展开成原生 Responses 消息：

```text
user history
assistant history
...
final user query
```

代码审查和定向测试已经完成。正式 Smoke 前只需要用一个带历史的 No-tool Case 做真实 Codex 探针，直接检查 Provider trace 中的角色序列。

只要 Provider 看到的是原生多轮消息，而不是 `task1_user_history_envelope` JSON 文本，这个问题就算解决，不再扩展新的 transport 框架。

## 评测分六个阶段

### 阶段 1：冻结合格数据

- 生成全量排除清单。
- 对 196 个待定 Case 做一次轻量资格预检。
- 修正合格的 T03 DVC binding，排除 T18 pair。
- 生成 Dev 和 Hidden 合格投影。
- 从合格 Dev 重新抽取 Smoke。

完成条件：正式 selection 中没有硬排除和待定 Case，所有 pair 完整。

### 阶段 2：接通真实 Workspace 和上下文

- 完成 Playwright revision 的重试或排除。
- 为入选 Case 生成 Workspace 映射。
- runner 从本地 cache 恢复精确 revision，不再创建空目录。
- 用真实 Codex 探针确认原生历史消息修复。
- loader、readiness 和 restore plan 改读新投影。

完成条件：任意入选 Case 都能得到非空、干净、revision 正确的源码，带历史 Case 在 Provider 侧显示为原生消息。

### 阶段 3：冻结比较协议

- 从正式注册表列出本轮实际 Variant。
- 优先使用当前可运行方法，不等 V4。
- 固定模型、reasoning effort、wall-time、4 次调用上限和 repeat。
- 固定评分：首个 TDAI 动作、完整链成功、额外调用和 No-tool 误调用。
- 固定 Case 顺序或随机种子，所有 Variant 使用同一安排。

完成条件：除 Prompt 外，没有其他实验变量随 Variant 改变。

### 阶段 4：探针和 Smoke

先跑少量真实探针：

- 一个 Memory 直接调用。
- 一个 Memory 多步链。
- 一个 Skill 搜索或读取链。
- 一个 Knowledge 发现和调用链。
- 一个带历史的 No-tool Case。

资产恢复只做一次，确认入选 Case 所需的 Memory、Skill、Knowledge 可见即可。无需为每个 Case 建复杂的独立 R05 证明。

探针通过后运行新 Smoke。Smoke 的作用是确认所有 Variant 都能正常完成运行、收集和评分。模型答错属于评测结果，只有空 Workspace、上下文错误、资产不可见或 scorer 错误才阻塞下一阶段。

完成条件：Smoke 没有系统性基础设施错误，所有结果能统一评分。

### 阶段 5：大规模 Dev

- 对全部合格 Dev Case 运行所有冻结 Variant。
- 同一 Case、同一 Variant 使用相同 repeat 和预算。
- 基础设施失败只重跑受影响 Case，并记录原因。
- 运行结束后统一评分和汇总。
- 按工具族、Positive、paired Negative、Natural Negative 和语言查看结果。
- 用预先确定的主指标选择最终方法。

完成条件：Dev 结果完整，方法选择不使用 Hidden。

### 阶段 6：Hidden 和最终报告

- 锁定 Dev 选出的最终方法。
- 使用相同数据资格规则、模型设置和评分规则运行 Hidden。
- 不根据 Hidden 结果继续修改 Prompt。
- 汇总 Dev、Hidden、排除数据比例和主要误差类型。
- 保存 Case 清单、配置、Prompt hash、Workspace revision、原始调用记录和评分结果。

完成条件：结果可以由保存的运行记录重新计算，报告清楚说明数据排除和适用范围。

## 不做的事情

本轮明确不做以下工作：

- 不把全局 `npm run typecheck` 清零作为模型评测前提，只跑与正式链相关的测试。
- 不建立 G0 到 G13 之类的多层 Gate。
- 不为每个 Case 生成多套重复 receipt 和 seal。
- 不因一个基础设施 Case 失败就重建整个 Campaign。
- 不提前物化已经被排除的 Workspace。
- 不重写完整 Codex agent loop，只用统一 wall-time 和 4 次 TDAI 调用上限。
- 不安装被测仓库依赖，也不运行它们的项目测试。
- 不等待尚未可运行的 V4 方法，不让方法扩展阻塞基础评测。
- 不修不合理数据，不通过补上下文或放宽隐藏参数来保留它们。

## 接下来直接做什么

按顺序完成以下工作：

1. 生成 `qualified-cases.jsonl` 和 `excluded-cases.jsonl`。
2. 对 Playwright 做最后一次重试，失败就排除相关 pair。
3. 为最终入选 Case 生成 Workspace 映射并实现本地 checkout。
4. 让正式 runner 读取新投影和真实 Workspace。
5. 跑 5 类单例探针。
6. 重建 Smoke，Smoke 正常后直接进入大规模 Dev。

这六项完成后，就具备开始大规模评测的条件。
