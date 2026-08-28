# Task 1 代码 Gate 索引

本索引只覆盖任务一 Proxy 系统提示词注入代码线。每个阶段均从上一阶段的集成提交创建独立分支，通过 Gate 后以非 squash merge 合回 `codex/task1-code-integration`。

| Stage | 代码目标 | 阶段分支 | Gate | 集成通过 tag |
|---|---|---|---|---|
| C00 | Compiler、Runtime Contract、Profile seam | `codex/task1-code-c00-compiler` | [C00-gate.md](C00-gate.md) | `task1-c00-pass` |
| C01 | V0-C 合同纠错 | `codex/task1-code-c01-v0c` | [C01-gate.md](C01-gate.md) | `task1-c01-pass` |
| C02 | V1a 协议压缩 | `codex/task1-code-c02-v1a` | [C02-gate.md](C02-gate.md) | `task1-c02-pass` |
| C03 | V1 语义去重 | `codex/task1-code-c03-v1b` | [C03-gate.md](C03-gate.md) | `task1-c03-pass` |
| C04 | V2 Tool/No-Tool 与 family 选择校准 | `codex/task1-code-c04-v2` | [C04-gate.md](C04-gate.md) | `task1-c04-pass` |
| C05 | V3 Capability/Lifecycle 裁剪 | `codex/task1-code-c05-v3` | [C05-gate.md](C05-gate.md) | `task1-c05-pass` |
| C06 | 全 profile 回归、Runner 实接线与代码冻结 | `codex/task1-code-c06-freeze` | [C06-gate.md](C06-gate.md) | `PENDING_INTEGRATION` |

## 不可变基点

- 生产基线 commit：`5299c00aaf65481703c180fd69df066d11254eb7`
- 生产基线分支：`codex/task1-v0-baseline`
- 生产基线 tag：`task1-v0-baseline-20260828`
- 代码集成分支：`codex/task1-code-integration`
- 代码冻结 tag：`PENDING_INTEGRATION`

阶段 tag、Gate 内容 hash、相邻版本 diff hash 和全部 Prompt 指标同时保存在 `variants/code-freeze/code-freeze-manifest.json`。该机器清单是实验线校验代码交接完整性的主入口。
