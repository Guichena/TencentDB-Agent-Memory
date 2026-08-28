# Gate P01 Pilot

- Pilot status: `PASSED`
- formal P01 status: `INCOMPLETE`
- branch: `codex/task1-p01-world-integration`
- parent code gate: `task1-c07-pass` (`2dc7bc8b57442d2beae62efd5d570a83955b374d`)
- verified implementation commit: `fc9e207`
- checked at: `2026-08-28 Asia/Shanghai`
- scope: 把 3 个共享 World、48 条 case 的 Pilot 接到 C07 Mock 合同 runner；不启动 Luna、不把 Mock 结果计入正式任务一指标

## 本轮修正

| 问题 | 修正 |
|---|---|
| P01 旧分支不包含 V0～V3/C07 | 从 `task1-c07-pass` 新建独立集成分支，只迁入 World Pilot |
| runner 只识别旧 `CASES/FIXTURES` | 同时解析 `WORLD_CASES/WORLD_FIXTURES`，重复 id 直接拒绝 |
| World workspace 没有项目文件 | 只把当前 case 的活动项目落入独立 workspace，并记录文件清单 |
| Knowledge 仍走合成 Bridge | World case 改走 `startWorldMockServer()`；旧 100 case 保持冻结 Bridge |
| workspace 路径可能逃逸 | 写入前拒绝绝对路径、空路径和 `..` 逃逸路径 |
| 两条会话检索 Gold 不唯一 | W01 改用“越过前缀边界”，W02 改用“version attribute together”作为主探针 |
| C07 严格类型推断报错 | 为 Knowledge 工具模板显式标注 `WorldKnowledgeTool[]` |
| PowerShell 不展开 Python 的 `*.ts` 参数 | `check-quotes.py` 无参数时自行扫描同目录 TypeScript 文件 |

## 验证结果

| 检查 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 4 个测试文件、62 个测试全部通过 |
| `npm run eval:tool-prompt:worlds:gate` | 0 | 3 World / 48 case 结构、Gold 回放、唯一性、完整性、引号检查全部通过 |
| Gold 合同回放 | 0 | 36 条正例为 `CORRECT_CALL`，12 条 No Tool 为 `NO_TDAI_INTENT`，54 次 Bridge 请求成功 |
| 检索唯一性 | 0 | 12 个探针全部满足 Gold 第一；要求竞争记录的 5 条 tie 按元数据判别 |
| `python tools/test_schemas.py` | 0 | 10 个 schema、14 个拒绝用例，0 failure |
| `python tools/verify_lock.py` | 0 | 11/11 上游 hash 一致，0 mismatch，0 unreachable |
| `npx tsc --noEmit --pretty false` | 2 | 全项目仍有 54 条既有错误；P01 World/runner/test 新增错误 0 |
| `git diff --check` | 0 | 无 whitespace error |

## Pilot 注入 Token

编码固定为 `o200k_base`。静态工具说明和动态 World 资产分开保存，因为只有静态部分属于任务一 Prompt 优化成本。

| World | 总注入 | 静态工具说明 | 动态 World 资产 | 动态占比 |
|---|---:|---:|---:|---:|
| W01 | 5,584 | 3,103 | 2,481 | 44.4% |
| W02 | 5,444 | 3,100 | 2,344 | 43.1% |
| W03 | 5,483 | 3,097 | 2,386 | 43.5% |

这些是 `legacy` Profile 在 Pilot World 上的纯函数注入成本，不是 Luna Provider usage，也不是正式 V0 行为指标。正式运行仍须保存 input、cached input、cache-write input、output 和 reasoning output 五类 Provider token。

## 为什么正式 P01 仍未通过

当前 runner 仍属于 `mock-contract`：它预渲染生产 renderer 输出，manifest 明确记录 `formalMetricEligible: false`。正式 P01 还缺：

1. 与 `EXPERIMENT-DESIGN.md` 一致的 10 World / 200 case 数据与 Sealed Test；W01～W03 只能作为 Pilot/Dev。
2. 已批准且许可证、来源引用完整的 World 来源路线；`tdai-proxybench/DECISION.md` 当前仍为 `PENDING`，并且其中的 400 case 旧口径必须先与 200 case 最新计划统一。
3. 通过真实数据面准备 Space、Team、Agent、Task、L0/L1/L2/L3、Skill 和 Knowledge 快照的 World Loader。
4. 正常 Session Init、生产 MemoryProxy 单次注入以及真实 Memory/Skill/Knowledge 首入口 observer。
5. 十个 World 的无模型 dry run、Prompt 捕获、合同 trace 和运行前后资产 hash 不变证明。

## 决策

P01 Pilot Gate 通过，可以继续用于 runner、Gold、评分器和数据形状回归。正式 P01 Gate 保持未通过；在真实链路和正式 World 数据冻结之前，不得启动 Luna Campaign，也不得把本 Gate 的调用结果写入任务一优化指标。
