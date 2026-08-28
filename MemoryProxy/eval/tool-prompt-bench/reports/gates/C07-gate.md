# Gate C07

- status: `PASSED`
- branch: `codex/task1-c07-eval-correctness`
- parent code-freeze commit: `d0996809ed63f6cfc67504ad180db0d48ac70475`
- verified implementation commit: `f440ac63c6d27d3cd62ea21834dbcd38bcecad47`
- scope: 修复会阻断链路或污染任务一指标的身份、上游、重复注入、usage 和 Pilot 分层问题；不修改 V0 至 V3 Prompt，不运行模型，不启动容器，不改本机 Codex 或 MemoryProxy 持久配置
- checked at: `2026-08-28 Asia/Shanghai`

## 为什么这些问题会影响任务一

| 问题 | 对指标的影响 | C07 处理 |
|---|---|---|
| Runner 预渲染 Prompt 后，MemoryProxy 仍执行 Session Init/生产注入 | 同一 Variant 可能被重复注入，调用率、误调用率和 Token 均失真 | 只在诊断环境、专用 Space、专用 Header 三条件同时满足时绕过第二次注入 |
| 官方 Provider Bearer 同时被当作 TDAI user key | TDAI 鉴权可能失败，或无法证明实际请求使用预注册 Provider | 分离 Provider Authorization 与独立 `x-tdai-user-key` |
| YAML 的 Codex agent URL/key 或全局 key 覆盖当前官方登录 | 实际模型、上游和鉴权模式可能与实验清单不一致 | 增加 Codex-only invocation override，并从 `/health` 预检实际 URL 与 client-auth passthrough |
| 缺失 usage 字段被补成 0 | Token 与 cache 指标产生伪数据 | 五类 usage 任一缺失、非数值或为负即记为 `INFRASTRUCTURE_ERROR` |
| Mock Bridge 结果没有层次标识 | 100-case 合同/Pilot 数字可能被误写入正式报告 | manifest、trace、evaluation、score、usage 全部标记 `formalMetricEligible=false` |
| V0-C 描述了两个 Skill 只读入口但 Mock 未实现 | 合同正确的调用会被误判失败 | 补齐 get-by-id 与 raw file-download Mock 合同 |

## V6.1 对齐结论

- 继续把 Prompt Variant 作为行为实验的唯一优化变量；C07 没有改任何 Prompt 文案、块位置、Capability 投影或 cache identity。
- 静态注入 Token 与 Provider usage 分开保存；Provider usage 包含 input、cached input、cache-write input、output、reasoning output。
- Prompt Cache 仍以冻结 Prompt、稳定前缀和 Provider usage 双口径判断，不把 Hash 等同于真实 cache hit。
- 旧 100 case 只保留为合同与 Pilot 层。正式 V6.1 指标仍必须使用共享真实 World、正常 Session Init、生产 InjectionPipeline 单次注入和真实 Memory/Skill/Knowledge 首入口观测。

## 安全、架构与对抗复核

- 诊断旁路在 TDAI 鉴权之后执行；普通生产请求、错误 Space、缺失环境开关或错误 Header 均不能触发。
- `x-tdai-user-key` 与 `x-tdai-eval-mode` 在上游转发前剥离；TDAI key 还会从模型 shell 与 Langfuse debug metadata 中排除，运行产物只保存是否配置，不保存值。
- `/health` 和真实 Codex 转发共用 `resolveCodexUpstream()`，避免“预检一套路由、执行另一套路由”。健康信息不暴露 apiKey。
- Runner 使用参数数组与 `shell: false`；新增 PowerShell 参数不拼接执行凭据。
- 没有新增依赖、锁文件、Bridge 写权限、资产抽取能力或 Prompt 工具暴露面。
- 新增回归直接证明官方 Provider Authorization 保留，而两个 TDAI-only Header 不会转发。

## 验证命令与结果

| 命令 | Exit | 结果 |
|---|---:|---|
| `npm test` | 0 | 3 个测试文件、58 个测试全部通过 |
| `npm run eval:tool-prompt:validate` | 0 | 100 case / 100 fixture 合同回归通过 |
| 评测目录独立 strict TypeScript 编译 | 0 | 所有 `eval/tool-prompt-bench/*.ts` 通过 |
| `npm run eval:tool-prompt:capture-freeze` | 0 | 六个冻结 Prompt 复算成功；清单只把相关源码基点更新为 C07 实现提交，Prompt/Token/Hash 字段无变化 |
| `start-benchmark-proxy.ps1 ... -PrepareOnly` | 0 | 只生成 Docker 命令；Codex-only 官方上游、client passthrough、只读 config 和诊断开关均明确 |
| `run-benchmark.ps1 ... -PrepareOnly` | 0 | 固定 `gpt-5.6-luna` / `high` / `medium`，未启动 Codex 或模型 |
| `npx tsc --noEmit --pretty false` | 2 | 仍为 54 条既有诊断；标准化指纹未变；C07 新增诊断 0 |
| `git diff --check` | 0 | 无 whitespace error |

全量类型诊断继续使用既定标准化方式：只保留 error headline、删除 `(line,column)`、排序并计算 UTF-8 SHA-256。结果仍为 `ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c`。

## Prompt 与 Token 冻结证明

`src/injection/**` 在 C07 中无 diff。`variants/code-freeze/code-freeze-manifest.json` 只更新 `sourceCommit` 与由该提交派生的 `generatedAt`，用于把实验运行器基点指向 `f440ac63c6d27d3cd62ea21834dbcd38bcecad47`；全部 Prompt、Token、bytes、hash、稳定前缀和缓存身份字段保持不变。复跑冻结捕获后，六个 Variant 仍保持 C06 清单：

| Variant | Injection tokens (`o200k_base`) | Provider tokens |
|---|---:|---:|
| V0 | 4,863 | 4,916 |
| V0-C | 5,126 | 5,179 |
| V1a | 4,413 | 4,466 |
| V1 | 4,027 | 4,080 |
| V2 | 2,308 | 2,361 |
| V3 | 2,224 | 2,277 |

因此 C07 不改变任何候选的静态 Token 数，也不改变相邻版本稳定前缀；它只确保后续 Provider usage 和行为结果不会被运行器伪造或混层。

## 明确不处理的事项

- DCO、依赖审计和生产基线已有的 54 条类型诊断不影响当前 Prompt 冻结或评测运行面，本阶段不扩张范围修复。
- 本 Gate 没有启动 MemoryProxy 容器、Langfuse 或 Codex 模型，因此不声称真实链路或行为指标已经通过。
- 正式评测 Harness、共享 World 数据、真实历史/工作区输入和首入口 observer 仍属于 P01 数据/真实链路阶段；完成并冻结前，旧 100-case 结果只能称为 Pilot。

## 决策

C07 通过。`task1-code-freeze` 继续只表示 V0 至 V3 Prompt 冻结点；后续实验运行器以 C07 通过提交为基点。只有 P01 的真实链路与数据 Gate 通过后，才允许开始任务一正式 V0/V0-C/Final 配对评测。
