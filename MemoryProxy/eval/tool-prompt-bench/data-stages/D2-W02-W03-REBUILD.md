# D2：正式 W02～W03 重建

## 目标

在不改变 D1 schema/合同的前提下，使用 D0 准入的四个 repo Team（`pandas+dask` 与 `dvc+MONAI`）完成两个 Space，形成 120 条 trajectory-first Dev 数据。四个 Team 均须使用互斥的 history/current-anchor source tasks；不能把公开 benchmark 的题目或 reference patch 原样当成 MemoryProxy Case 与 Gold。

## 前置

D1 Gate 全通过；W01 内容和生成器已合入数据集成主线。

## 执行

1. 分别为四个 Team 运行与 W01 相同的 source density、license、time 和 transform 流程。
2. 生成 W02、W03 的独立资产和每 World 40 Case；不得复制 W01 的 Query、Skill body、Memory 事实或干扰项。
3. 保持 Family、操作类型、难度和中英文表达分层平衡；repo 不能与工具 Family 固定绑定。
4. 运行全局 provenance graph：repo/fork、source task、trajectory、patch、Skill body family、Wiki/CodeGraph、Query 近重复检查。
5. 对 120 条运行 schema、pair、future leakage、Gold uniqueness、asset ablation、fixture replay 和 snapshot restore。
6. 逐 Team 复核业务语义：Task 分组、历史依赖、Skill 适用边界、Knowledge binding 和干扰资产必须符合该 repo 的实际工作方式，不把不同 dataset 的现成案例拼成一个“伪团队”。

## 产物

- `formal-worlds/W02/`、`formal-worlds/W03/`
- 三 World 全局 provenance graph
- 120 Case 分布/唯一性/泄漏报告
- D2 Gate 报告

## Gate

- [ ] W01～W03 共 120 条，三个 Family 各 18 Positive，54 paired negative，12 natural negative。
- [ ] 各 World/Team 均独立通过 D1 Gate。
- [ ] repo family、source task、trajectory、patch、Skill body 和近重复 Query 无跨 World 冲突。
- [ ] 没有因某 repo/技术栈而泄漏应选的工具 Family。
- [ ] 所有新增 Team 均通过 W01 的“系统真实、工作真实、非模板改写”复核。
- [ ] 三个 World 可从空数据栈确定性恢复。
