# Gate C06

- status: `PASSED`
- branch: `codex/task1-code-c06-freeze`
- parent integration commit: `bb72333f4fe260737dabfb5fe8ed45fc7606c763`
- verified implementation commit: `99fd4da8e8e16f876c967c2d53afaf4da9b4b155`
- verified campaign fix commit: `d935e88a5e53eba3eb3b8aa74316ec5b4d064b73`
- verified inventory commit: `df031ab09dce589a3ba65ed957834a8596c417e5`
- merge commit: `PENDING_INTEGRATION`
- code-freeze tag: `PENDING_INTEGRATION`
- scope: 冻结 V0、V0-C、V1a、V1、V2、V3 的同构建选择链路、Token/Hash/稳定前缀清单和实验交接面；不新增 Prompt 优化，不运行模型，不导入 World、Gold 或真实资产
- checked at: `2026-08-28 Asia/Shanghai`

## 本阶段完成内容

- 新增严格的 Variant/Profile 映射，未知 Variant 在启动模型或创建运行目录前失败：`V0 -> legacy`、`V0-C -> contract-corrected`、`V1a -> protocol-compact`、`V1 -> compact`、`V2 -> selection-calibrated`、`V3 -> capability-pruned`。
- `prompt-harness.ts` 通过生产 `InjectionPipeline` 和 Compiler profile 渲染实际 Provider-visible Prompt，不再把 `--variant` 只当运行标签。
- Runner manifest 保存 Variant、真实 profile 和 Capability Signature，六个 profile 的 Prompt hash 互不相同。
- `run-benchmark.ps1` 的 `-Variant` 参数已允许全部六个冻结版本；`-PrepareOnly` 已验证能生成 V3 命令且不会调用 Codex。
- 正式实验口径固定 `skillExtractionEnabled=false`。V0 至 V2 作为冻结历史表面仍暴露 `skill_extract`，V3 按生产能力事实裁剪；这正是 V2/V3 的阶段差异，不是跨版本污染。
- 新增 `code-freeze-manifest.json`，保存六个 profile 的逐块 bytes/token/hash、相邻版本稳定前缀、阶段 tag、差异产物 hash、缓存命名空间和 runner 纯渲染 Smoke。
- 默认生产 profile 保持 `legacy`，C06 没有修改任何 Prompt 文案、Bridge endpoint、权限、身份注入、上游配置或注入位置。

## 审计结果

审计范围为 `5299c00..C06`。生产变更集中在任务一的五个 Injector、Tool Prompt Compiler/Profile 模块、配置接线、缓存身份和验证代码；没有把数据分支中的 `worlds/`、Gold、资产快照、正式模型输出或本地账号配置带入代码线。

安全、架构和反向用例复核结论：

- 无新增凭证、外部上游、shell 拼接、Bridge allowlist 或执行权限变更。
- Compiler 是非 Legacy profile 的唯一生成入口；Legacy 保留原 Renderer，避免用新 Compiler 自证旧输出一致。
- profile 进入配置 hash、Pipeline Bundle 和 Hook cache identity；六个 profile 的缓存命名空间唯一。
- Runner 先严格解析 Variant，再进行文件系统或进程操作；非法值不会静默回退。
- 审计发现并修复一项阻断问题：PowerShell campaign wrapper 原先只接受 `V0`，会导致 V0-C 至 V3 无法执行。修复后六个值均在 `ValidateSet` 中，V3 `-PrepareOnly` 返回成功。
- 未发现其他阻断项。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、51 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 100 case / 100 fixture 合同回归通过 |
| `npm run eval:tool-prompt:capture-freeze` | 0 | 六 profile、六缓存命名空间、五相邻 diff 和六 runner smoke 完整；复跑无差异 |
| `run-benchmark.ps1 ... -Variant V3 ... -PrepareOnly` | 0 | 生成真实 V3 campaign 命令；未启动 Codex/模型 |
| Runner 缺参契约 | 2 | 输出含六个 Variant 的 usage |
| Runner 非法 `--variant latest` | 1 | 在模型调用前拒绝，并列出六个允许值 |
| `npx tsc --noEmit --pretty false` | 2 | 54 条既有基线诊断；C06 相关新增诊断 0 |
| `git diff --check 5299c00..HEAD` | 0 | 无 whitespace error |
| Check 独立测试脚本 | 0 | 通过 |

类型诊断继续使用基线标准化指纹 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。全量类型检查本身不是绿色，但诊断数量和指纹均未被任务一改造改变。

## 冻结 Profile 清单

规范 Capability Signature：

```text
memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0
```

| Variant | Profile | Injection bytes | Injection tokens (`o200k_base`) | Provider tokens | 相邻版本稳定前缀 bytes |
|---|---|---:|---:|---:|---:|
| V0 | `legacy` | 17,227 | 4,863 | 4,916 | 17,436（自身全长） |
| V0-C | `contract-corrected` | 18,129 | 5,126 | 5,179 | 903 |
| V1a | `protocol-compact` | 16,326 | 4,413 | 4,466 | 155 |
| V1 | `compact` | 14,690 | 4,027 | 4,080 | 155 |
| V2 | `selection-calibrated` | 9,081 | 2,308 | 2,361 | 443 |
| V3 | `capability-pruned` | 8,713 | 2,224 | 2,277 | 1,714 |

V3 相对 V0 减少 2,639 个注入 token（约 54.3%）；这是静态 Token 指标，不代表行为指标已经改善。完整逐块清单和 SHA-256 以 `variants/code-freeze/code-freeze-manifest.json` 为准。

## 未解决但不阻塞 C06 的事项

- 没有运行 Luna/Codex，因而尚无有效调用率、误调用率、工具选择正确率或真实 cached-input 命中率结论。
- 当前 100 case / 100 fixture 是代码合同回归集，不替代数据线最终冻结的多 World 正式评测集。
- 全量类型检查的 54 条既有错误需由原生产基线单独治理；它们不影响本阶段测试与 Prompt 评测链路，且本任务没有扩大范围修复。
- 正式实验仍须等待数据交接 Gate，通过后由用户手动启动 MemoryProxy/Codex campaign。

## 决策

C06 分支 Gate 通过。允许以非 squash merge 合回 `codex/task1-code-integration`。合并后必须复跑关键门禁，补记 merge commit，并把最终集成记录提交同时标记为 `task1-c06-pass` 和唯一 `task1-code-freeze`；在此之前不得宣告代码线冻结完成。
