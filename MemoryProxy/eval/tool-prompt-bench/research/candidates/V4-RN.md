# V4-RN：中性措辞与组件 Mask

```yaml
candidate_id: V4-RN
infrastructure_ancestor: R05@c86b154f9f597da0788592c66b93d574fd3f10f9
git_parent: task1-candidate-base-v1^{commit}
behavior_parent: <STATIC-PARENT-MANIFEST.variantId/promptSha256>
depends_on: [task1-measurement-v2, Stage-1.5-repeat-and-replica-probe]
branch_group: decision-sibling
```

## 身份与部分序

```text
task1-candidate-base-v1^{commit} + frozen static_parent manifest
├─ RN-R rhetoric-only
└─ RN-M component-mask-only
   两者分别通过后
   └─ RN-RM explicit combo
```

| 节点 | 分支 | worktree |
|---|---|---|
| RN-R | `codex/task1-method-v4rn-rhetoric` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4rn-r` |
| RN-M | `codex/task1-method-v4rn-mask` | `D:\projects\TencentDB-Agent-Memory-task1-method-v4rn-m` |
| RN-RM | `codex/task1-combo-v4rn-rm` | `D:\projects\TencentDB-Agent-Memory-task1-combo-v4rn-rm` |

RN-R 与 RN-M 是平行消融，不是一个候选的两个同时步骤。RN-RM 是条件性组合。

RN-R、RN-M 的 Git 父节点都是共同 candidate-base commit；行为父输入都由同一 `STATIC-PARENT-MANIFEST.json` 指定，不能把 Variant 名误当 commit。

## 进入条件

先对 `static_parent` 做 canonical repeats，建立 Luna 自身波动基线。只有有限 order/paraphrase probe 显示 flip 超过噪声，或正式 trace 显示同 family 近邻工具受修辞/组件长度影响时，才启动对应分支。

若 canonical 和 replica 的差异不超过重复噪声，V4-RN 不进入正式候选。

## 单因子

RN-R 只改 sibling cards 的客观、对称措辞。字段集合、字段顺序、tool order、注入位置、contract 和 token 目标保持不变。禁止没有合同依据的 `best`、`preferred`、`always`、`recommended`、`powerful` 或泛化 `must use`。

RN-M 只切换 `Purpose / Guidelines / Limitations / Parameters / Examples` 组件 mask，父候选原措辞和顺序保持不变。各 mask 从同一个完整父候选平行生成，不累计删除。

RN-RM 只应用两个已通过节点的精确可见 diff，并重新运行全部 Gate。

## 改动边界与不变量

允许 ToolPromptSpec 的目标 decision card、component manifest、neutrality/symmetry lint、replica generator 和 candidate snapshots。

禁止改 RuntimeToolContract、Execution schema、Runtime Binding、capability、Gold/scorer、工具排序、cache marker、graph、TSCG、cue pruning 和四态 gate。RN-R 不能删组件，RN-M 不能重写句子。

## Gate 与指标

- exact name/path/body/schema/capability parity。
- sibling field-set/order parity 按节点要求成立。
- 每个目标 card 的 token 和 paraphrase semantic review 有记录。
- replicas 不含 Gold/case 信息，production 仍固定 canonical order。
- smoke 和 unseen Dev fold 后才跑完整 Dev。

报告 ECR、FCR_attempt、TSR、CTA n/attempt、PairExact、family/confusion-edge accuracy、worst-order、worst-paraphrase、FlipAny、PositionGap、group agreement、static/full token、provider input to horizon 和 overcall。

接受条件是共同硬约束通过，并在 canonical 或 worst-case 上改善预注册偏差，且 unseen fold 复现。只降低 flip 但 canonical 行为或 token 明显变差，不接受。

## 停止与保存

语义审校失败、contract 变化、效果落在噪声内、canonical/worst-case 都无改善、任一 family/pair 退化时停止。RN-R 或 RN-M 单项失败则不能进入 RN-RM。每个节点保存 parent、target cards/masks、semantic review、replica matrix、Prompt/hash、指标、token ledger 和 decision。
