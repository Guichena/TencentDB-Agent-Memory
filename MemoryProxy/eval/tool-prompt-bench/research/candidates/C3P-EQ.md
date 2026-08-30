# C-3P-EQ：三平面字节等价 Compiler Seam

## 身份与依赖

```yaml
candidate_id: C-3P-EQ
kind: compiler-parity
infrastructure_ancestor: R05@c86b154f9f597da0788592c66b93d574fd3f10f9
structural_git_parent: c86b154f9f597da0788592c66b93d574fd3f10f9
formal_merge_parents: [C3P-structural-preparation@d80ce4d, task1-candidate-base-v1^{commit}]
formal_merge_policy: non-squash-two-parent-merge-on-the-same-C3P-branch
behavior_parent_variant: <STATIC-PARENT-MANIFEST.variantId>
behavior_parent_prompt_sha256: <STATIC-PARENT-MANIFEST.promptSha256>
depends_on_for_formal_parent: [task1-measurement-v2, Stage-1-static-parent]
branch_group: compiler-parity
branch: codex/task1-method-c3p-eq
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-c3p-eq
formal_model_runs: 0
structural_preparation_gate: d80ce4d
semantic_ownership_attested: false
```

`static_parent` 由 V0 至 V3 正式 Dev 和 Selection Contract 决定。它是行为父 Variant 和冻结 Prompt artifact，不一定是独立 Git 提交。V3 只是先验默认，不能在本卡硬编码。

为不让完整 Compiler 工程被人工模型运行阻塞，已从 R05 pass commit `c86b154` 建立同名工程预备分支。C-3P-0 `e06e66e` 建 conservative membership inventory，结构 C-3P-1 `27b0188` 验证 UTF-8 byte coverage，Gate `d80ce4d` 明确固定 `semanticOwnershipAttested=false`。该分支没有行为父 Variant、不能生成新 Variant、不能运行模型，也不能替代尚未冻结的 candidate-base。

Stage 1 产生 `task1-candidate-base-v1^{commit}` 和 `static_parent` 后，不重建准备阶段、不改名、不 rebase、不 squash，也不把准备提交 cherry-pick 到另一条隐藏线。应在同一个 C-3P 分支创建一次显式 two-parent merge：第一父为当前 C-3P structural tip，第二父为冻结 candidate-base。该 merge commit 同时继承准备成果和正式 Measurement/R05 底座，成为完整 C-3P 阶段的即时 Git 父；随后针对精确 `static_parent` artifact 完成语义 catalog、renderer 和全量 parity Gate。

## 进入条件

正式候选进入条件不变：`task1-candidate-base-v1`、Measurement-v2、Selection Contract 和 `STATIC-PARENT-MANIFEST.json` 均已冻结；所有父 Prompt snapshot/hash 可重现；本节点有明确工程时间预算。

工程预备态的较窄进入条件已经满足：R05 代码 Gate 已通过且工作树干净；改动严格限制在 detached candidate-membership/source-map seam；五个生产 surface × 五个 compiled profile 的 inventory 证明 compiler content/hash/unit order 不变。它尚未证明完整 injection、metadata、tool schema/order 或语义 ownership parity，不能以“结构覆盖”放宽这些正式条件。

## 目标和非目标

本节点只把父候选的编译输入分为 Decision、Execution、Runtime Binding 三个平面，再按原顺序渲染回完全相同的 provider-visible 内容。

- Decision：Tool/No-Tool、family、when/avoid/contrast、typed relation。
- Execution：exact name/method/path/header/body/schema/required/forbidden fields。
- Runtime Binding：session、space、identity、asset listing、L2/L3 snapshot。

本节点不优化 ECR、FCR、TSR 或 token，不改变文本、空白、顺序、注入位置和 cache marker。它只建立后续方法可归因的内部 seam。

## Task 1 指标

本节点没有行为收益假设，正式模型运行数为 0。只记录 byte parity、contract parity、metadata parity、ownership completeness、determinism 和 token/hash 不变性。任何 ECR/FCR/TSR 提升声明都越出本卡证据。

## 单因子与改动面

允许在 `src/injection/tool-prompt/` 增加 plane ownership、source provenance、纯函数 compiler/renderer 和 parity harness，允许扩展内部诊断字段但不改变已有 `content`。

禁止修改 RuntimeToolContract、specs 模型可见文本、injector 输出、pipeline 布局、V0 至 V3 profile、Evaluator、Gold、数据和运行配置。语义等价不能替代字节等价。

## 字节等价合同

对每个冻结 family/surface/capability/runtime fixture：

- system text block UTF-8 bytes、标签、空白和换行一致。
- block 数量、顺序和注入位置一致。
- provider-visible tool schema、工具顺序和 description 一致。
- `cache_control`、breakpoint 和其他 metadata 逐字段一致。
- 完整 injection、system capture 和 per-unit SHA 一致。
- Runtime Binding 使用相同 fixture 值，不能靠删除动态字段通过。
- 同一输入连续编译两次 canonical SHA 一致。

只有与 Task 1 无关且机器证明非 provider-visible 的非确定字段可以进入显式 ignore allowlist。system/tools/injection/cache metadata 永不允许忽略。

## Gate

1. C-3P-0 为每个现有 PromptUnit 建立非空、可追踪的 conservative possible-plane membership；含多个 plane 的 unit 必须标为 mixed，`exactOwnership=false`。
2. 结构 C-3P-1 把 mixed unit 的候选 spans 限制为连续、UTF-8 合法且无重叠/无空洞；它只允许声明 `structuralCoverageExact=true`，固定 `semanticOwnershipAttested=false`。
3. 完整 C-3P-EQ 必须用经审校的 per-unit/per-anchor catalog 证明最终每个 provider-visible byte span 恰好属于一个语义 plane，按原序连接与冻结父 bytes 完全一致。
4. 动态值不得进入 Decision/Execution；稳定合同不得进入 Runtime Binding。
5. 全部 fixture byte parity、contract lint、capability pruning 和 snapshots 通过。
6. metadata 从 parse、rebuild 到 serialize 保真。
7. diff 只落在内部类型/编译 seam allowlist。
8. 正式模型调用数为 0。

## 接受与停止

结构准备 Gate 已接受并独立保存，但完整 C-3P-EQ 只有全部正式 parity Gate 通过后才接受。任一 provider-visible byte、工具集合、contract、capability、metadata 或 dynamic ownership 变化都立即停止。当前 structural pass 不得成为 V4-G、TSCG 或 V4-L 的隐藏父节点；完整 parity 未通过时，这些方法从 frozen `static_parent` 建最小独立 seam。

## 产物

保存 parent manifest、plane ownership、source map、byte/metadata parity、snapshot manifest、Gate 报告、首差异定位和 decision。只有完整 C-3P-EQ Gate 通过后才冻结可继承的 pass commit；structural preparation commit 只作为同一方法的内部递进检查点。
