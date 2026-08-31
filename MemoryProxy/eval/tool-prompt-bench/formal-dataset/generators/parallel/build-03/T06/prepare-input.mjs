import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const DATASET = join(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const GEN = join(DATASET, "generators/parallel/build-03/T06");
const SOURCE = join(DATASET, "source-material/T06");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const shaFile = async (path) => sha(await readFile(path));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const repositories = {
  awesome: {
    repo: "https://github.com/github/awesome-copilot",
    commit: "f11a4e441c5ff061b4f8ae37952be8c602e4034e",
    time: "2026-08-28T05:41:12Z",
    license: "MIT",
    licensePath: "LICENSE",
    licenseSha: "e32449d23085399adc1222f7a17408b730550258e51627c153cb108ca9955823",
    localLicense: "raw/licenses/github-awesome-copilot.LICENSE",
  },
  arex: {
    repo: "https://github.com/VectorSpaceLab/AREX-Skill",
    commit: "c29af6ca56b0b89814fb4bcff1cbbab0100ff7c9",
    time: "2026-08-28T17:04:41Z",
    license: "Apache-2.0",
    licensePath: "LICENSE",
    licenseSha: "53ec4f1fc089929231324592f7cb091c5ed66c242a1083610f27e4d7304d16c9",
    localLicense: "raw/licenses/VectorSpaceLab-AREX-Skill.LICENSE",
  },
  flutter: {
    repo: "https://github.com/flutter/agent-plugins",
    commit: "864cf8797b190ddb81e4875db6dd6bab89641f62",
    time: "2026-08-24T17:16:53Z",
    license: "BSD-3-Clause",
    licensePath: "LICENSE",
    licenseSha: "5b95696b504e162bcf775060ec416005df9969a95cda6f7d4ddb57327dd74d35",
    localLicense: "raw/licenses/flutter-agent-plugins.LICENSE",
  },
  lifeos: {
    repo: "https://github.com/danielmiessler/LifeOS",
    commit: "ce046f26495c73f007790971869c94d58e0f6a20",
    time: "2026-08-14T21:46:23Z",
    license: "MIT",
    licensePath: "LICENSE",
    licenseSha: "802360a4008afd2f6c93a02c68d1caf34b6a5898b6a00c86421c0e4b4502c968",
    localLicense: "raw/licenses/danielmiessler-LifeOS.LICENSE",
  },
  logseq: {
    repo: "https://github.com/logseq/logseq",
    commit: "3e85583fa47eb2173c136ef45fcc3c1dd2174443",
    time: "2026-08-26T15:33:17Z",
    license: "AGPL-3.0",
    licensePath: "LICENSE.md",
    licenseSha: "2467b8901ba62f7708c479944468a677897472a39ecbda1d23818ecf9538620b",
    localLicense: "raw/licenses/logseq-logseq.LICENSE",
  },
};

const definitions = [
  ["T06-SRC-SYSTEM-COMMANDLINE", "T06-SKILL-SYSTEM-COMMANDLINE", "system-commandline-cli", "awesome", "skills/system-commandline-cli/SKILL.md", "raw/system-commandline-cli/SKILL.md", "579c731ea7a7c948bea8d4ad9eef8d65a94e9f260401d7028ffdd4193372e250", "bound", "agent-task1-t06-general"],
  ["T06-SRC-VSCODE-COMMANDS", "T06-SKILL-VSCODE-COMMANDS", "vscode-extension-commands", "awesome", "skills/vscode-ext-commands/SKILL.md", "raw/vscode-ext-commands/SKILL.md", "64067e4a8188d5c7598f8b208698d7c4f5e1c233f3e6e8e628ec96acd65fdeb6", "bound", "agent-task1-t06-general"],
  ["T06-SRC-VSCODE-L10N", "T06-SKILL-VSCODE-LOCALIZATION", "vscode-extension-localization", "awesome", "skills/vscode-ext-localization/SKILL.md", "raw/vscode-ext-localization/SKILL.md", "a238b58545bc23476ac0bd6451e9b01a225cb125096b90b3425e8e08943e3d6c", "searchable", "agent-task1-t06-assets-a"],
  ["T06-SRC-DOC-WRITER", "T06-SKILL-DOCUMENTATION-WRITER", "documentation-writer", "awesome", "skills/documentation-writer/SKILL.md", "raw/documentation-writer/SKILL.md", "7e8244988c9f4eb63bf8c0edf160578544621eb96e5e51e2d848f1401c5de8f1", "bound", "agent-task1-t06-general"],
  ["T06-SRC-MICROSOFT-DOCS", "T06-SKILL-MICROSOFT-DOCS", "microsoft-docs", "awesome", "skills/microsoft-docs/SKILL.md", "raw/microsoft-docs/SKILL.md", "2c2e0b361eab0d0f2526cf8c3c5df63b996fcdd4c12ffccdccf08f8f8f1f1f9c", "searchable", "agent-task1-t06-assets-a"],
  ["T06-SRC-CSHARP-DOCS", "T06-SKILL-CSHARP-DOCS", "csharp-docs", "awesome", "skills/csharp-docs/SKILL.md", "raw/csharp-docs/SKILL.md", "ddcc59c5f0320af04a59ba090b8e6490ce537aad2d8b2667fdf386686d037826", "searchable", "agent-task1-t06-assets-b"],
  ["T06-SRC-MCP-CLI", "T06-SKILL-MCP-CLI", "mcp-cli", "awesome", "skills/mcp-cli/SKILL.md", "raw/mcp-cli/SKILL.md", "54081db970e9333dad51f8458bc623912fab2087ecacccb6298f2c53833d6070", "searchable", "agent-task1-t06-assets-b"],
  ["T06-SRC-CLI-MASTERY", "T06-SKILL-CLI-MASTERY", "cli-mastery", "awesome", "skills/cli-mastery/SKILL.md", "raw/cli-mastery/SKILL.md", "d3e4194d69f973aa5bf8993c8e68b09fea9f0f2c0427e740a18fd4175d956879", "searchable", "agent-task1-t06-assets-a"],
  ["T06-SRC-DVC", "T06-SKILL-DVC", "dvc-cli", "arex", "skills/repositories/repo-skills/dvc/SKILL.md", "raw/dvc/SKILL.md", "23564b7f96d0aec11f0952116b3cbcf42203a24bc3fa15858cb7b71986491919", "bound", "agent-task1-t06-general"],
  ["T06-SRC-DVC-DATA", "T06-SKILL-DVC-DATA-PIPELINES", "dvc-data-and-pipelines", "arex", "skills/repositories/repo-skills/dvc/sub-skills/data-and-pipelines/SKILL.md", "raw/dvc-data-and-pipelines/SKILL.md", "65b01bf3cc2a80681abee9a992292b4b1133731a8dc22af4decf5289a054a3a7", "searchable", "agent-task1-t06-assets-a"],
  ["T06-SRC-DVC-EXPERIMENTS", "T06-SKILL-DVC-EXPERIMENTS", "dvc-experiments", "arex", "skills/repositories/repo-skills/dvc/sub-skills/experiments/SKILL.md", "raw/dvc-experiments/SKILL.md", "6b13c4ac3c0a9d67b0bcce3d5d04f1d097d6973be2c696855d98cb6f87bdd9b7", "searchable", "agent-task1-t06-assets-b"],
  ["T06-SRC-DVC-REMOTES", "T06-SKILL-DVC-REMOTES-CACHE", "dvc-remotes-and-cache", "arex", "skills/repositories/repo-skills/dvc/sub-skills/remotes-and-cache/SKILL.md", "raw/dvc-remotes-and-cache/SKILL.md", "8b3b00e0ca498fde66d698f4ef0b4a25c41b49cc278cfe2dcb272182b72d348f", "searchable", "agent-task1-t06-assets-a"],
  ["T06-SRC-DVC-METRICS", "T06-SKILL-DVC-METRICS-PARAMS-PLOTS", "dvc-metrics-params-plots", "arex", "skills/repositories/repo-skills/dvc/sub-skills/metrics-params-plots/SKILL.md", "raw/dvc-metrics-params-plots/SKILL.md", "8da58020290b0f84182a7b7abf47a35f6d69b12311fee2663b9a930802acf797", "searchable", "agent-task1-t06-assets-b"],
  ["T06-SRC-DART-CLI", "T06-SKILL-DART-CLI", "dart-build-cli-app", "flutter", "skills/dart-build-cli-app/SKILL.md", "raw/dart-build-cli-app/SKILL.md", "39c82e4ca39fadc8d065bad8c39a08cd719a3fc481b6a74ed6175f33ee3fb412", "searchable", "agent-task1-t06-assets-b"],
  ["T06-SRC-CREATE-CLI", "T06-SKILL-CREATE-CLI", "create-typescript-cli", "lifeos", "LifeOS/install/skills/CreateCLI/SKILL.md", "raw/create-cli/SKILL.md", "28ef0cc19b09539247e2f48a8e124307194f0b91e02cfd4ac68a1b3a0f4e5fb6", "bound", "agent-task1-t06-general"],
  ["T06-SRC-LOGSEQ-CLI", "T06-SKILL-LOGSEQ-CLI-MAINTENANCE", "cli-argument-maintenance", "logseq", ".agents/skills/logseq-cli-maintenance/SKILL.md", "raw/logseq-cli-maintenance/SKILL.md", "e2af5ecd83185b33e269b64e4c6d3e42ccbff6eb8c042c1dfdcb953ff513ccd6", "bound", "agent-task1-t06-general"],
];

const routing = {
  "T06-SKILL-SYSTEM-COMMANDLINE": ["System.CommandLine command architecture", "Use when adding .NET CLI commands, options, arguments, handlers, groups or recursive global options.", "Do not use for ordinary C# APIs, editor extensions, DVC workflows or generic documentation."],
  "T06-SKILL-VSCODE-COMMANDS": ["VS Code extension command contributions", "Use when adding or updating contributed commands, Command Palette entries, side-bar commands, enablement or menu placement.", "Do not use for generic CLI parsing, extension localization-only work or ordinary documentation."],
  "T06-SKILL-VSCODE-LOCALIZATION": ["VS Code extension localization", "Use when localizing extension commands, settings, menus, walkthroughs or runtime strings across supported languages.", "Do not use for command registration without localization, .NET CLI design or DVC."],
  "T06-SKILL-DOCUMENTATION-WRITER": ["Diátaxis documentation workflow", "Use when choosing and writing tutorials, how-to guides, references or explanations for a defined audience and goal.", "Do not use for implementing CLI parsers, extension commands or DVC pipelines."],
  "T06-SKILL-MICROSOFT-DOCS": ["Microsoft documentation lookup", "Use when the task needs current Microsoft, .NET, Azure or VS Code documentation and examples from the documented source routes.", "Do not use when the required implementation procedure is already in a specific local Skill."],
  "T06-SKILL-CSHARP-DOCS": ["C# XML documentation", "Use when documenting C# types and members with XML comments, parameter, return, exception and example tags.", "Do not use for System.CommandLine architecture or non-documentation changes."],
  "T06-SKILL-MCP-CLI": ["MCP command-line client", "Use when discovering MCP servers and tools or calling an MCP tool from a command line with structured arguments.", "Do not use for building an application CLI, parsing its arguments or editing VS Code extensions."],
  "T06-SKILL-CLI-MASTERY": ["Copilot CLI training", "Use for interactive GitHub Copilot CLI lessons, quizzes, scenarios and reference questions.", "Do not use for application CLI implementation, System.CommandLine, VS Code extensions or DVC."],
  "T06-SKILL-DVC": ["DVC CLI task router", "Use when a task names DVC, dvc CLI commands, data pipelines, experiments, remotes, cache, metrics or parameters.", "Do not use for generic CLI creation, editor command contributions or ordinary docs."],
  "T06-SKILL-DVC-DATA-PIPELINES": ["DVC data and pipelines", "Use for dvc init/add, .dvc files, dvc.yaml stages, lock files, repro, status, diff and DAG planning.", "Do not use for experiment queues, remote credentials, generic CLIs or editor extensions."],
  "T06-SKILL-DVC-EXPERIMENTS": ["DVC experiments", "Use for dvc exp run, queue, show, diff, apply, branch, share, rename and cleanup workflows.", "Do not use for ordinary dvc repro pipeline design, remote setup or generic argument parsing."],
  "T06-SKILL-DVC-REMOTES-CACHE": ["DVC remotes and cache", "Use for DVC remote configuration, push/pull/fetch, cache behavior, optional backends and safe garbage collection.", "Do not use for stage construction, experiment comparison, editor commands or generic docs."],
  "T06-SKILL-DVC-METRICS-PARAMS-PLOTS": ["DVC metrics params and plots", "Use for declaring, showing, diffing or troubleshooting DVC metrics, parameters and plots.", "Do not use for remote configuration, generic CLI creation or extension command registration."],
  "T06-SKILL-DART-CLI": ["Dart CLI application construction", "Use when building Dart command-line apps with args, CommandRunner, exit codes, testing and compilation.", "Do not use for .NET System.CommandLine, VS Code extensions or DVC workflows."],
  "T06-SKILL-CREATE-CLI": ["TypeScript CLI construction", "Use when creating or expanding a TypeScript CLI and selecting manual parsing, Commander.js or oclif complexity.", "Do not use for .NET System.CommandLine, DVC operations, VS Code extension commands or plain docs."],
  "T06-SKILL-LOGSEQ-CLI-MAINTENANCE": ["CLI argument and output maintenance", "Use when refactoring CLI parsing, validation, execution, presentation, exit codes and command tests without changing behavior.", "Do not use for new feature delivery unless maintenance is explicitly requested."],
};

const skills = [];
for (const [sourceId, assetId, adaptedName, repoKey, path, localRawPath, rawSha, poolRole, ownerAgentId] of definitions) {
  const repo = repositories[repoKey];
  const actual = await shaFile(join(SOURCE, localRawPath));
  assert(actual === rawSha, `${assetId}: raw SHA mismatch ${actual}`);
  skills.push({
    source_id: sourceId,
    asset_id: assetId,
    adapted_name: adaptedName,
    repository_url: repo.repo,
    commit_sha: repo.commit,
    commit_time: repo.time,
    path,
    license_spdx: repo.license,
    license_path: repo.licensePath,
    license_sha256: repo.licenseSha,
    raw_file_sha256: rawSha,
    raw_url: `${repo.repo}/raw/${repo.commit}/${path}`,
    local_raw_path: localRawPath,
    pool_role: poolRole,
    owner_agent_id: ownerAgentId,
    ...(assetId === "T06-SKILL-DVC" ? { resources: [{ source_id: "T06-SRC-DVC-REMOTES", path: "sub-skills/remotes-and-cache/SKILL.md", raw_file_sha256: "8b3b00e0ca498fde66d698f4ef0b4a25c41b49cc278cfe2dcb272182b72d348f", local_raw_path: "raw/dvc-remotes-and-cache/SKILL.md" }] } : {}),
  });
}
for (const repo of Object.values(repositories)) assert(await shaFile(join(SOURCE, repo.localLicense)) === repo.licenseSha, `${repo.repo}: license SHA mismatch`);

const sourceLock = {
  schema_version: "task1.skill_source_lock.v1",
  team_id: "T06",
  frozen_at: "2026-08-29T23:20:00+08:00",
  frozen_by: "gpt-5.6-sol",
  selection_method: "ordinary GitHub code search; no star threshold",
  world_as_of: "2026-08-29T23:59:59+08:00",
  rules: {
    clear_license_required: true,
    raw_sha256_required: true,
    upstream_dependencies_installed: false,
    upstream_tests_run: false,
    official_patch_used: false,
    allowed_adaptations: ["host tool names", "listing description", "use_when", "do_not_use_when"],
    technical_steps_must_remain: true,
  },
  repositories: Object.values(repositories).map((repo) => ({ ...repo, license_local_path: repo.localLicense })),
  skills,
};

const skillPool = skills.map((skill) => ({
  asset_id: skill.asset_id,
  source_id: skill.source_id,
  name: skill.adapted_name,
  description: routing[skill.asset_id][0],
  use_when: routing[skill.asset_id][1],
  do_not_use_when: routing[skill.asset_id][2],
  owner_agent_id: skill.owner_agent_id,
  visibility: skill.pool_role === "bound" ? "private" : "team",
  bound_to_active_agent: skill.pool_role === "bound",
  raw_path: `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T06/${skill.local_raw_path}`,
  technical_invariant: "Preserve the frozen file's ordered technical workflow, recommendations, examples and safety boundaries; only adapt routing front matter.",
  resources: skill.resources ?? [],
}));

const inputPack = {
  schema_version: "task1.luna_input_pack.v1",
  build_id: "build-03",
  stage: "DS05",
  team_id: "T06",
  split: "hidden_test",
  world_as_of: "2026-08-29T23:59:59+08:00",
  generator_contract: { model: "gpt-5.6-luna", reasoning_effort: "high", fork_turns: "none", verbosity: "concise", prompt_version: "task1.parallel.v2", draft_only: true, may_not_write_staging: true, may_not_decide_final_gold: true },
  team: {
    name: "客户端与 CLI",
    mission: "维护 .NET CLI、VS Code 扩展、DVC 数据流水线以及跨平台命令行体验。",
    project_streams: [
      { id: "harbor-admin-cli", summary: "基于 System.CommandLine 的 .NET 管理 CLI，关注命令组、全局选项、ParseResult 与退出码。" },
      { id: "orbit-vscode-extension", summary: "VS Code 客户端扩展，关注命令贡献、菜单可见性、侧栏入口与本地化。" },
      { id: "lineage-ml-pipeline", summary: "使用 DVC 管理数据、流水线、实验与远端缓存的机器学习项目。" },
      { id: "relay-terminal-client", summary: "跨平台终端客户端，关注参数解析、输出合同、错误边界与回归测试。" },
      { id: "compass-client-docs", summary: "客户端与 CLI 文档流，关注命令参考、示例、变更说明和普通文档干扰。" },
    ],
    agents: [
      { agent_id: "agent-task1-t06-general", role: "当前通用业务 Agent" },
      { agent_id: "agent-task1-t06-assets-a", role: "团队 Skill 与 Memory 资产来源 A" },
      { agent_id: "agent-task1-t06-assets-b", role: "团队 Skill 与 Memory 资产来源 B" },
    ],
  },
  counts: { l0_sessions: 10, l0_messages_each: [12, 12], l1_memories: 16, l2_scenes: 4, l3_profiles: 1, skills: 16, knowledge: 3, memory_pairs: 6, skill_pairs: 6, knowledge_pairs: 3, natural_negatives: 10, total_pairs: 15, total_cases: 40 },
  source_lock: "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T06/source-lock.json",
  skill_pool: skillPool,
  skill_positive_blueprints: [
    { id: "T06-SKILL-BP-01", target_asset_id: "T06-SKILL-SYSTEM-COMMANDLINE", listing_state: "listed", route_candidate: ["skill_view"], intent: "为 .NET 管理 CLI 设计 System.CommandLine 命令组、选项与 handler。" },
    { id: "T06-SKILL-BP-02", target_asset_id: "T06-SKILL-VSCODE-COMMANDS", listing_state: "listed", route_candidate: ["skill_view"], intent: "为 VS Code 扩展增加命令贡献、侧栏入口和可见性条件。" },
    { id: "T06-SKILL-BP-03", target_asset_id: "T06-SKILL-DVC-DATA-PIPELINES", listing_state: "not_listed_same_team_searchable", route_candidate: ["skill_search", "skill_view_by_id"], intent: "为 DVC 项目规划 dvc.yaml stage 与 dry-run repro。" },
    { id: "T06-SKILL-BP-04", target_asset_id: "T06-SKILL-DVC-EXPERIMENTS", listing_state: "not_listed_same_team_searchable", route_candidate: ["skill_search", "skill_view_by_id"], intent: "规划 DVC 实验队列、比较和提升流程。" },
    { id: "T06-SKILL-BP-05", target_asset_id: "T06-SKILL-VSCODE-LOCALIZATION", listing_state: "not_listed_same_team_searchable", route_candidate: ["skill_search", "skill_view_by_id"], intent: "补齐 VS Code 扩展命令、walkthrough 与运行时字符串本地化。" },
    { id: "T06-SKILL-BP-06", target_asset_id: "T06-SKILL-DVC", listing_state: "listed", route_candidate: ["skill_view", "skill_files_read"], resource_path: "sub-skills/remotes-and-cache/SKILL.md", intent: "读取 DVC 路由 Skill 及远端缓存子流程，安全规划 push/pull。" },
  ],
  memory_asset_ids: {
    l0: Array.from({ length: 10 }, (_, index) => `T06-L0-${String(index + 1).padStart(2, "0")}`),
    l1: Array.from({ length: 16 }, (_, index) => `T06-L1-${String(index + 1).padStart(2, "0")}`),
    l2: Array.from({ length: 4 }, (_, index) => `T06-L2-${String(index + 1).padStart(2, "0")}`),
    l3: ["T06-L3-01"],
  },
  memory_positive_blueprints: [
    { id: "T06-MEM-BP-01", project: "harbor-admin-cli", route_candidate: ["tdai_conversation_search"], target: "T06-L0-01", gap_kind: "上次确认的递归全局选项注册与校验结论" },
    { id: "T06-MEM-BP-02", project: "orbit-vscode-extension", route_candidate: ["tdai_conversation_search", "tdai_conversation_query"], target: "T06-L0-03", gap_kind: "需要完整复盘扩展命令 rollout 的顺序与排除项" },
    { id: "T06-MEM-BP-03", project: "relay-terminal-client", route_candidate: ["tdai_memory_search"], target: "T06-L1-05", gap_kind: "历史确认的参数解析与退出码归因" },
    { id: "T06-MEM-BP-04", project: "lineage-ml-pipeline", route_candidate: ["tdai_memory_search"], target: "T06-L1-09", gap_kind: "团队已定的 DVC remote 命名与本地凭据约定" },
    { id: "T06-MEM-BP-05", project: "harbor-admin-cli", route_candidate: ["tdai_atomic_query"], target: "T06-L1-13", gap_kind: "按 decision 类型与 2026-08-11 日期过滤旧的短选项别名决策" },
    { id: "T06-MEM-BP-06", project: "relay-terminal-client", route_candidate: ["tdai_read_scene"], target: "T06-L2-04", injected_path: "client/relay-terminal/cli-release-incident.md", gap_kind: "已注入索引对应的 CLI 发布事故场景正文" },
  ],
  knowledge_assets: [
    { asset_id: "T06-KNOWLEDGE-HARBOR-CG", type: "code_graph", name: "Harbor CLI 代码索引", workspace_match: "harbor-admin-cli", tool_list: [{ name: "find_symbol", required_params: ["symbol"] }] },
    { asset_id: "T06-KNOWLEDGE-ORBIT-WIKI", type: "wiki", name: "Orbit 扩展决策库", workspace_match: "orbit-vscode-extension", tool_list: [{ name: "search_pages", required_params: ["query"] }] },
    { asset_id: "T06-KNOWLEDGE-LINEAGE-CG", type: "code_graph", name: "Lineage DVC 流水线索引", workspace_match: "lineage-ml-pipeline", tool_list: [{ name: "inspect_stage", required_params: ["stage"] }] },
  ],
  knowledge_positive_blueprints: [
    { id: "T06-KNOW-BP-01", target_asset_id: "T06-KNOWLEDGE-HARBOR-CG", route_candidate: ["knowledge_tools_list", "knowledge_tools_call"], intent: "查找 ExportCommand 的定义和注册位置，当前输入没有代码索引结果。" },
    { id: "T06-KNOW-BP-02", target_asset_id: "T06-KNOWLEDGE-ORBIT-WIKI", route_candidate: ["knowledge_tools_list", "knowledge_tools_call"], intent: "查询扩展命令标题与本地化决策，当前输入没有内部页面内容。" },
    { id: "T06-KNOW-BP-03", target_asset_id: "T06-KNOWLEDGE-LINEAGE-CG", route_candidate: ["knowledge_tools_list", "knowledge_tools_call"], intent: "查询 train stage 的依赖、输出与下游，当前输入没有流水线索引结果。" },
  ],
  provider_visible_constraints: { languages: ["zh"], forbidden_tokens: ["tdai_", "skill_search", "skill_view", "skill_files_read", "knowledge_id", "tools/list", "tools/call", "target_asset", "informationGap", "pairId", "/memory-bridge/", "/skill-bridge/"], do_not_name_asset_ids: true, final_query_same_within_pair: true, only_changed_message_index_may_differ: true },
  natural_negative_constraints: { count: 10, self_contained: true, full_distractor_pool_loaded: true, topics: ["C# 参数列表的纯转换", "VS Code package.json 的局部 JSON 编辑", "DVC 命令输出的给定表格整理", "退出码映射计算", "命令帮助文本改写", "路径归一化函数", "参数默认值推导", "扩展命令标识排序", "YAML stage 片段格式化", "普通文档标题层级修正"], must_not_depend_on_history_or_skill_or_knowledge: true },
  sol_review_required: ["unique_information_gap", "unique_first_action", "complete_minimal_chain", "pair_single_delta", "asset_visibility", "realistic_same_domain_distractors", "provider_leakage", "negative_full_chain_sufficiency", "skill_technical_body_invariance"],
};

await writeJson(join(SOURCE, "source-lock.json"), sourceLock);
await writeJson(join(GEN, "input-pack.json"), inputPack);
const freeze = {
  schema_version: "task1.input_freeze.v1",
  team_id: "T06",
  frozen_by: "gpt-5.6-sol",
  frozen_at: "2026-08-29T23:20:00+08:00",
  source_lock_sha256: await shaFile(join(SOURCE, "source-lock.json")),
  input_pack_sha256: await shaFile(join(GEN, "input-pack.json")),
  skill_count: skills.length,
  repository_count: Object.keys(repositories).length,
  raw_and_license_hashes_verified: true,
  clear_licenses_only: true,
  upstream_dependencies_installed: false,
  upstream_tests_run: false,
};
await writeJson(join(GEN, "input-freeze.json"), freeze);
console.log(JSON.stringify(freeze, null, 2));
