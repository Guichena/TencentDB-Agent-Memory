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

M1 的 synthetic Gate 已通过。该结论只覆盖 Pair Contract v2、M0 只读 outcome seam、pair-level scorer、repeat 聚合和 independence cluster 输入；不代表正式数据已经满足合同，也不代表 M0 已经集成。

## 实现边界

本提交只新增：

- `measurement-v2/pair-contract.ts`：不可信输入边界、最小反事实 allowlist 与 invariant SHA 校验。
- `measurement-v2/pair-scorer.ts`：消费 M0 已判定 outcome；不读取 raw trace，不重算 ECR。
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

## RED 证据

实现过程中按 public seam 执行了以下真实 RED：

1. 初始测试因 `measurement-v2/pair-contract.js` 不存在而失败。
2. runtime contract slice 新增后 31 项中 12 项失败：schema version、JSON Pointer、重复/重叠/空 allowlist、SHA、计数、split、projection schema 与 malformed shape 尚未实现。
3. scorer/summary slice 新增后 47 项中 5 项失败：Strict outcome 缺失未 fail closed，summary API 尚不存在。
4. frozen artifact slice 因 manifest/fixture 尚不存在而失败。
5. repeat preservation slice 50 项中 1 项失败：incomplete score 尚未保存逐 repeat 输入。

每个 RED 均通过最小实现转为 GREEN；没有为了通过测试修改旧 evaluator、M0 语义或正式数据。

## 最终无模型验证

| Gate | 结果 | 说明 |
| --- | --- | --- |
| Focused M1 | PASS | `50/50` tests |
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
- Synthetic fixture canonical SHA-256：`fdfe28c25e70715a23f68ff6ab964be455bba2ae227093b8f98d9f5d3ebf5ecf`
- Canonicalization：对象 key 递归字典序；数组顺序保持；标量使用 compact JSON。
- Manifest：`M1-SCHEMA-INTERFACE-MANIFEST.json`

## FORMAL_DATA_BLOCKED

正式 pair 尚未在本实现分支冻结并通过 M1 validator，因此 formal-ready Gate 必须停止。解除阻塞前至少需要：

1. 每个正式 pair 提供 `allowedChangedPointers`、`invariantFieldsSha256`、`causalFactorId`、`minimalityReviewStatus=approved` 和 `independenceKey`。
2. 正负 case 在同一 split，且只包含 allowlist 内的受控差异。
3. 集成 M0 的正式 case outcome；M1 只能消费 `completeChainSuccess`/可选 `strictChainExact`，不能自行推导 ECR。
4. 每个 pair 的 repeat ID 集完全相同，run/session/local state 相互独立，Variant/model/reasoning/snapshot 完全一致。

在这些条件满足前，可以集成 M1 的 schema 与 synthetic scorer，但不得发布正式 PairExact 数字或创建 formal-ready 标签。
