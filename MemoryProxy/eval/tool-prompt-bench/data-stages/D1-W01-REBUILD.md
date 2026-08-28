# D1：正式 W01 重建

## 目标

用 D0 准入的两个 repo Team（当前候选为 `getmoto/moto` 和 `python/mypy`）完成第一套真实来源 World，验证从 source pack 到 TDAI snapshot、40 Case 和首调用 Gold 的整条数据流水线。候选 repo 只有在轨迹密度、许可、时间和 Gold 唯一性均通过后才冻结。

## 前置

D0 Gate 全通过；从合入 D0 的数据集成提交创建本阶段分支。

## 执行

1. 为两个 Team 分别冻结 repo/base commits、6～10 个 Task 和历史轨迹。
2. 将每条上游轨迹转换为独立 L0 Session；保存原始/清洗后 hash 和消息映射。
3. 从 L0 证据提取 active/superseded L1；仅从两个以上 Session 聚合 L2；L3 只保存稳定偏好。
4. 从成功轨迹提炼 4～6 个当前 Agent Skill，并加入有来源的同 Team 近义/旧版 Skill。
5. 从 pinned repo code/docs 构建 Agent-bound Wiki/CodeGraph，以及同一可见集合内的错误版本/近义干扰。
6. 每 Team 编写 9 个 Positive、9 个单变量 paired negative、2 个 natural coding negative。
7. 为每个 Positive 做上下文/资产消融，验证唯一首动作；为每个 Negative 验证当前证据足以不调用。
8. 导入隔离的真实本地数据栈，执行无模型 Session Init、Prompt capture 和 Fixture replay。
9. 对每个 Team 做“源码语义复核”：确认业务 Agent、Task、fixed assets、imported Memory 和可见干扰均能由生产 identity 解析；外部 dataset 字段不得直接充当运行时字段。
10. 对每条 Query 做“工作真实性复核”：它必须是该 repo 当前工作状态下合理的下一步任务，不能只是把公开题目改写成“请调用某工具”。

## 产物

- `formal-worlds/W01/` source pack、assets、cases、pairs、Gold、workspace manifests
- W01 snapshot manifest 与恢复命令
- W01 source/time/license/uniqueness/ablation 报告
- 40 Case contract trace
- D1 Gate 报告

## Gate

- [ ] 两 Team 各 20 Case，分布均为 3/3/3 Positive + 9 paired + 2 natural。
- [ ] 18 个 Pair 各自只有一个已登记变量发生改变。
- [ ] 三类 Positive 的首动作唯一，或 Gold 明确允许等价首动作且有理由。
- [ ] 另一个 Team 的资产未被计算为可见干扰。
- [ ] 每个 Team 的 Task、历史、Skill、Knowledge、workspace 来自同一 repo family；没有跨 repo 拼接或只换实体名的模板数据。
- [ ] 上游 trajectory 的原始工具名不参与 TDAI Gold；Gold 来自当前信息缺口与 MemoryProxy 可见资产的联合判定。
- [ ] 每条 Query 经人工或双重 review 判定为真实代码工作中的合理请求，并记录 reviewer 和证据。
- [ ] 所有资产、Case、Gold 有 source evidence、时间和 hash。
- [ ] Snapshot 重建两次得到相同内容 hash 和注入顺序。
- [ ] 无模型真实链路与合同 replay 全通过。
