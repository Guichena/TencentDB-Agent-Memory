# M1 No-model Gate：Pair Contract v2 与 PairExact

## Gate 结论

```yaml
candidate_id: M1
branch: codex/task1-measure-m1-pair-schema-v2
base_commit: 2dc7bc8b57442d2beae62efd5d570a83955b374d
synthetic_gate: PASS
formal_data_status: FORMAL_DATA_BLOCKED
model_runs: 0
network_calls: 0
dependency_installs: 0
repeat_aggregation_policy: all-repeats-pass-v1
```

M1 的 synthetic Gate 已通过。该结论只覆盖 Pair Contract v2、Integration-owned outcome seam、pair-level scorer、冻结 campaign/repeat 分母和 independence cluster 输入；不代表正式数据已经满足合同，也不代表 M0/M2 已经集成。

## 实现边界

本提交只新增：

- `measurement-v2/pair-contract.ts`：不可信输入边界、最小反事实 allowlist 与 invariant SHA 校验。
- `measurement-v2/pair-scorer.ts`：消费 Integration 合成的 outcome（M0 chain facts + M2 eligibility/execution evidence）；不读取 raw trace，不重算 ECR 或 final eligibility。
- `measurement-v2/fixtures/m1-pair-v2.synthetic.json`：唯一 synthetic fixture。
- `measurement-v2/M1-SCHEMA-INTERFACE-MANIFEST.json`：公开接口、公式与冻结策略。
- `src/__tests__/tool-prompt-pair-v2.test.ts`：typed synthetic public-API tests。

未修改正式数据/Gold、旧 evaluator/score、Prompt/Variant、runner/adapter/config/auth、工具描述或生产 injection。

## 评分语义

```text
positivePass = M0.completeChainSuccess
negativePass = !negative.executorBoundAttempt
               && !negative.malformedTdaiDispatchIntent
PairExact = all matched repeats satisfy positivePass && negativePass

BoundarySwitch = all matched repeats satisfy
                 positive.executorBoundAttempt
                 && !negative.executorBoundAttempt

StrictPairExact = only when preregistered:
                  all matched repeats satisfy
                  M0.strictChainExact && negativePass
```

`BoundarySwitch` 是弱诊断：negative 只有可识别但未绑定 executor 的 malformed intent 时，`BoundarySwitch=true`，而 `PairExact=false`。`FCR_attempt` 的 executor-bound 定义未被改写。

Repeat 不作为独立 pair。所有逐 repeat outcome 均保存在 `repeatInputs`，匹配成功后另存 `repeatResults`；pair-level 聚合策略固定为 `all-repeats-pass-v1`。`J_frozen`、`J_eligible` 和 cluster 都只按唯一 `pairId` 计数。

`J_frozen` 不再从传入结果行数推断，而由 `pair-summary-campaign-v2` 的冻结 `expectedPairIds` 确定。外部 `frozenPairSetSha256` 绑定正式数据内容，M1 另算只依赖 split 与 pair IDs 的 `expectedPairIdsSha256` 来验证成员表；后者刻意不含 Variant 或执行环境，因此所有候选可以共享同一个 pair 分母。同一 summary 还冻结 Variant、模型、reasoning、provider、API protocol、adapter、execution identity、资产 snapshot、expected repeat set 和评分策略。缺少整 pair、双方共同少 repeat、混入其他 cohort 或评分策略不一致都会使 campaign 标为 incomplete；这些行不能静默改变行为分母。

Outcome 是不可信运行时输入：required string 必须非空，两个 identity 字段必须是 lowercase SHA-256，所有 required boolean 必须显式存在。缺少 `executorBoundAttempt` 或 `malformedTdaiDispatchIntent` 会得到 `NEGATIVE_OUTCOME_INVALID`，绝不会因 JavaScript falsy 规则被算作 clean negative。

保存后重新载入的 `PairScoreV2` 同样不被盲信。Summary 会逐项核对 repeat count/ID、正负输入、逐 repeat 结果、run/session/local state 引用、false-intent 分类、顶层聚合布尔值和 scoring-policy hash；内部不一致的行得到 `PAIR_SCORE_INCONSISTENT`，并从 PairExact/BoundarySwitch/Strict 分母排除。

## RED 证据

实现过程中按 public seam 执行了以下真实 RED：

1. 初始测试因 `measurement-v2/pair-contract.js` 不存在而失败。
2. runtime contract slice 新增后 31 项中 12 项失败：schema version、JSON Pointer、重复/重叠/空 allowlist、SHA、计数、split、projection schema 与 malformed shape 尚未实现。
3. scorer/summary slice 新增后 47 项中 5 项失败：Strict outcome 缺失未 fail closed，summary API 尚不存在。
4. frozen artifact slice 因 manifest/fixture 尚不存在而失败。
5. repeat preservation slice 50 项中 1 项失败：incomplete score 尚未保存逐 repeat 输入。
6. 独立审核反例暴露 2 个 P1：缺失 negative booleans 被当 clean negative；summary 可混合 Variant/split 并在整 pair/整 repeat 缺失时缩小分母。新增 12 个 runtime/campaign RED 后修为 GREEN。
7. 初版把成员表 hash 错误地与 Variant/execution cohort 绑定，导致同一数据集跨候选得到不同成员身份；新增跨 Variant 反例后拆成外部内容 hash 与只绑定 split/pair IDs 的成员 hash。
8. 第二轮独立复核证明可手工伪造顶层 `pairExact=true` 并清空 repeat 证据；新增 serialized-score RED，要求 Summary 从逐 repeat 输入/结果重验聚合一致性。

每个 RED 均通过最小实现转为 GREEN；没有为了通过测试修改旧 evaluator、M0 语义或正式数据。

## 最终无模型验证

| Gate | 结果 | 说明 |
| --- | --- | --- |
| Focused M1 | PASS | `63/63` tests |
| Existing tool-prompt eval | PASS | `30/30` tests |
| Targeted strict TypeScript | PASS | M1 test 与其导入的 measurement-v2 模块无诊断 |
| Repository full typecheck | BASELINE FAIL | 仅报告现存 handler/session/storage 等源码错误；没有 M1 文件诊断 |
| Capture freeze | PASS with observation | 命令退出 `0`；Prompt、token、profile hash 与 adjacent diff 未改变 |
| Locked-surface audit | PASS | capture 命令在 Windows checkout 上重算了 6 个旧 Gate 文档 byte hash；已恢复该生成文件，未纳入 M1 diff |
| `git diff --check` | PASS | 无 whitespace error |

Capture observation 不改变 Task 1 Prompt freeze：变化仅是既有 C00–C05 Gate Markdown 的 checkout-byte SHA，并非 Prompt 内容、token、Variant 或注入源码。本分支保留原冻结 manifest 字节。

## Fixture 与接口冻结

- Pair Contract schema：`2`
- Invariant projection schema：`pair-invariant-projection-v2`
- Repeat policy：`all-repeats-pass-v1`
- Synthetic fixture canonical SHA-256：`dc8de04273b6779819686333a2c4c1bd5f64e068d950ddbd7c4a60e0b23cc570`
- Synthetic scoring-policy SHA-256：`abd2448c425839fcc812f2e335acd86b1bfc22515366f40b8ae16e8e94fb7153`
- Synthetic frozen pair-set content SHA-256：`0c509c532b4710b395567177fb63635ff2a117d1824bcdd357a667df814ddf44`
- Synthetic expected pair-membership SHA-256：`3538dbdd3d97f0a19003d90f8eaac85d479dce5ce47c0268213a1bdc743b55be`
- Canonicalization：对象 key 递归字典序；数组顺序保持；标量使用 compact JSON。
- Manifest：`M1-SCHEMA-INTERFACE-MANIFEST.json`

## FORMAL_DATA_BLOCKED

正式 pair 尚未在本实现分支冻结并通过 M1 validator，因此 formal-ready Gate 必须停止。解除阻塞前至少需要：

1. 每个正式 pair 提供 `allowedChangedPointers`、`invariantFieldsSha256`、`causalFactorId`、`minimalityReviewStatus=approved` 和 `independenceKey`。
2. 正负 case 在同一 split，且只包含 allowlist 内的受控差异。
3. Integration 合成正式 case outcome；M1 只能消费 M0 的 `completeChainSuccess`/可选 `strictChainExact` 和 M2 的 eligibility/execution evidence，不能自行推导 ECR 或 final eligibility。
4. 每个 pair 的 repeat ID 集完全相同，run/session/local state 相互独立，Variant/model/reasoning/provider/API/adapter/execution identity/snapshot 完全一致。
5. 每个 campaign 提供冻结 pair-set SHA、expected pair IDs、expected repeat IDs 和 scoring-policy SHA；所有 Variant 使用同一 split/pair-set，不得混合 Dev/Hidden。

在这些条件满足前，可以集成 M1 的 schema 与 synthetic scorer，但不得发布正式 PairExact 数字或创建 formal-ready 标签。
