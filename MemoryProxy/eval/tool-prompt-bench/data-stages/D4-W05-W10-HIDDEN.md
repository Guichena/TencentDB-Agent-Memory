# D4：W05～W10 Hidden Test 密封

## 目标

构造六个未参与 Prompt 调整的 Space、十二个 Team 和 240 条 Hidden Test，并在不查看模型表现的前提下完成结构与合同验收。

## 前置

D3 Gate 全通过；Dev schema、生成器、scorer 和冲突键冻结。

## 执行

1. 从未进入 Dev 的 Open-SWE-Traces repo family 中选择 12 个 Team，覆盖多种语言和任务类别。
2. 生成者只接触分配给自己的 source pack；Prompt 优化者不读取具体 Hidden Query/Gold。
3. 使用冻结生成器完成每 World 40 Case；不因来源难度修改 schema 或评分合同。
4. 运行 source/license/time/pair/schema/future-leakage/asset-ablation/fixture replay。
5. 独立 reviewer 复核 Positive 唯一性和 Negative 当前证据；有分歧时只做数据仲裁，不运行候选 Prompt。
6. 运行全局 provenance graph，确认与 Dev 在 repo/fork/source task/trajectory/patch/Skill/Wiki/CodeGraph/Query 上零交叉。
7. 生成内容 hash、加密/访问控制或等价密封清单；冻结后不再编辑。

## 产物

- `formal-worlds/W05/`～`W10/`
- Hidden source/attribution/license manifests
- 240 Case sealed manifest
- reviewer/仲裁记录
- Dev/Test 全局 provenance graph
- D4 Gate 报告

## Gate

- [ ] 六 World、十二 Team、240 Case 全部通过冻结合同。
- [ ] Dev/Test provenance graph 零交叉。
- [ ] Hidden Query/Gold 未用于 Prompt 修改或模型挑选。
- [ ] 每个 World 都能从空数据栈确定性恢复并得到相同 hash。
- [ ] 冻结 manifest 记录 schema、generator、scorer 和 source revisions。
