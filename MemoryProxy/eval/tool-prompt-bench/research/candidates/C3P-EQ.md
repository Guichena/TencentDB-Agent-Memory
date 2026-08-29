# C-3P-EQ：三平面字节等价 Compiler Seam

## 身份与依赖

```yaml
candidate_id: C-3P-EQ
kind: compiler-parity
git_parent: task1-candidate-base-v1^{commit}
behavior_parent_variant: <STATIC-PARENT-MANIFEST.variantId>
behavior_parent_prompt_sha256: <STATIC-PARENT-MANIFEST.promptSha256>
depends_on: [task1-measurement-v2, Stage-1-static-parent]
branch_group: compiler-parity
branch: codex/task1-method-c3p-eq
worktree: D:\projects\TencentDB-Agent-Memory-task1-method-c3p-eq
formal_model_runs: 0
```

`static_parent` 由 V0 至 V3 正式 Dev 和 Selection Contract 决定。它是行为父 Variant 和冻结 Prompt artifact，不一定是独立 Git 提交。Git 分支从共同 candidate-base commit 创建，再由 manifest 指向该 Variant。V3 只是先验默认，不能在本卡硬编码。

## 进入条件

`task1-candidate-base-v1`、Measurement-v2、Selection Contract 和 `STATIC-PARENT-MANIFEST.json` 均已冻结；所有父 Prompt snapshot/hash 可重现；本节点有明确工程时间预算。缺任一项时不创建正式实现分支。

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

1. 每个 PromptUnit 恰好属于一个 plane，来源可追踪。
2. 动态值不得进入 Decision/Execution；稳定合同不得进入 Runtime Binding。
3. 全部 fixture byte parity、contract lint、capability pruning 和 snapshots 通过。
4. metadata 从 parse、rebuild 到 serialize 保真。
5. diff 只落在内部类型/编译 seam allowlist。
6. 正式模型调用数为 0。

## 接受与停止

全部 parity Gate 通过才接受。任一 provider-visible byte、工具集合、contract、capability、metadata 或 dynamic ownership 变化都立即停止。失败分支和 parity 报告保留，但不得成为 V4-G、TSCG 或 V4-L 的隐藏父节点；这些方法改从 frozen `static_parent` 建最小独立 seam。

## 产物

保存 parent manifest、plane ownership、source map、byte/metadata parity、snapshot manifest、Gate 报告、首差异定位和 decision。通过后冻结 pass commit，后续方法从它平行分叉。
