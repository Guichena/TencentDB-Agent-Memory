import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const workspace = process.cwd();
const team = "T18";
const datasetRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const buildRoot = resolve(datasetRoot, "generators/parallel/build-09", team);
const sourceRoot = resolve(datasetRoot, "source-material", team);

const repositories = {
  agents: {
    repository: "https://github.com/wshobson/agents",
    slug: "wshobson/agents",
    revision: "38e19c20d2b154510b0e624a2e3e186b19b5c527",
    committedAt: "2026-08-26T12:14:08Z",
    treeSha: "126e6a70b327db3e744797ba952f06bdf67aa5c5",
    license: "MIT",
    licensePath: "LICENSE",
    localDir: "agents",
  },
  claudeSkills: {
    repository: "https://github.com/jeffallan/claude-skills",
    slug: "jeffallan/claude-skills",
    revision: "882ef55e377dbf9a4dbe496bb41ac6ccd0e555cf",
    committedAt: "2026-08-07T20:19:14Z",
    treeSha: "2b301c97991bcf5f838cce82637332bb28ae4b83",
    license: "MIT",
    licensePath: "LICENSE",
    localDir: "claude-skills",
  },
};

const selected = [
  ["T18-SKL-01", "agents", "plugins/python-development/skills/python-performance-optimization/SKILL.md", "python-performance-optimization", "listed"],
  ["T18-SKL-02", "agents", "plugins/systems-programming/skills/go-concurrency-patterns/SKILL.md", "go-concurrency-patterns", "listed"],
  ["T18-SKL-03", "agents", "plugins/developer-essentials/skills/sql-optimization-patterns/SKILL.md", "sql-optimization-patterns", "listed"],
  ["T18-SKL-04", "agents", "plugins/observability-monitoring/skills/distributed-tracing/SKILL.md", "distributed-tracing", "listed"],
  ["T18-SKL-05", "agents", "plugins/observability-monitoring/skills/slo-implementation/SKILL.md", "slo-implementation", "listed"],
  ["T18-SKL-06", "agents", "plugins/data-engineering/skills/spark-optimization/SKILL.md", "spark-optimization", "listed"],
  ["T18-SKL-07", "agents", "plugins/database-design/skills/postgresql/SKILL.md", "postgresql-table-design", "searchable"],
  ["T18-SKL-08", "agents", "plugins/observability-monitoring/skills/prometheus-configuration/SKILL.md", "prometheus-configuration", "searchable"],
  ["T18-SKL-09", "agents", "plugins/cloud-infrastructure/skills/service-mesh-observability/SKILL.md", "service-mesh-observability", "searchable"],
  ["T18-SKL-10", "agents", "plugins/developer-essentials/skills/bazel-build-optimization/SKILL.md", "bazel-build-optimization", "searchable"],
  ["T18-SKL-11", "agents", "plugins/developer-essentials/skills/turborepo-caching/SKILL.md", "turborepo-caching", "searchable"],
  ["T18-SKL-12", "agents", "plugins/systems-programming/skills/memory-safety-patterns/SKILL.md", "memory-safety-patterns", "searchable"],
  ["T18-SKL-13", "agents", "plugins/javascript-typescript/skills/nodejs-backend-patterns/SKILL.md", "nodejs-backend-patterns", "searchable"],
  ["T18-SKL-14", "claudeSkills", "skills/database-optimizer/SKILL.md", "database-optimizer", "searchable"],
  ["T18-SKL-15", "claudeSkills", "skills/golang-pro/SKILL.md", "golang-pro", "searchable"],
  ["T18-SKL-16", "claudeSkills", "skills/rust-engineer/SKILL.md", "rust-engineer", "searchable"],
];
const selectedResources = [
  ["T18-SKL-02", "agents", "plugins/systems-programming/skills/go-concurrency-patterns/references/details.md", "references/details.md"],
];

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const rawUrl = (repo, path) => `https://raw.githubusercontent.com/${repo.slug}/${repo.revision}/${path}`;

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Codex-Dataset-Builder" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function loadText(repoKey, path) {
  const repo = repositories[repoKey];
  const localRoot = process.env.T18_SOURCE_AUDIT_ROOT;
  if (localRoot) return readFile(resolve(localRoot, repo.localDir, path), "utf8");
  return fetchText(rawUrl(repo, path));
}

await mkdir(buildRoot, { recursive: true });
await mkdir(sourceRoot, { recursive: true });
const locks = await Promise.all(selected.map(async ([assetId, repoKey, path, name, listing]) => {
  const repo = repositories[repoKey];
  const raw = await loadText(repoKey, path);
  const destination = resolve(sourceRoot, "raw", repoKey, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, raw, "utf8");
  return {
    assetId, name, listing, repository: repo.repository, revision: repo.revision,
    license: repo.license, path, rawSha256: sha256(raw),
    copiedTo: destination.slice(workspace.length + 1).replaceAll("\\", "/"),
  };
}));

const resourceLocks = await Promise.all(selectedResources.map(async ([assetId, repoKey, path, manifestPath]) => {
  const repo = repositories[repoKey];
  const raw = await loadText(repoKey, path);
  const destination = resolve(sourceRoot, "raw", repoKey, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, raw, "utf8");
  return {
    assetId, repository: repo.repository, revision: repo.revision, license: repo.license,
    path, manifestPath, rawSha256: sha256(raw),
    copiedTo: destination.slice(workspace.length + 1).replaceAll("\\", "/"),
  };
}));

await Promise.all(Object.entries(repositories).map(async ([repoKey, repo]) => {
  const licenseText = await loadText(repoKey, repo.licensePath);
  const destination = resolve(sourceRoot, "licenses", `${repoKey}-${basename(repo.licensePath)}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, licenseText, "utf8");
  repo.licenseSha256 = sha256(licenseText);
  repo.licenseCopiedTo = destination.slice(workspace.length + 1).replaceAll("\\", "/");
}));

const sourceLock = {
  schema_version: "task1.skill_source_lock.v1",
  team_id: team,
  frozen_at: "2026-08-31T23:50:00+08:00",
  repositories,
  skills: locks,
  resources: resourceLocks,
};
await writeFile(resolve(buildRoot, "source-lock.json"), `${JSON.stringify(sourceLock, null, 2)}\n`, "utf8");

const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" });
const baseCommit = git("rev-parse", "task1-data-parallel-launch-20team-v1^{commit}").trim();
const treeInventory = git("ls-tree", "-r", "--full-tree", baseCommit);
const fileManifest = git("ls-tree", "-r", "--name-only", baseCommit);
const inputPack = {
  schema_version: "task1.formal_v2_team_input.v1",
  dataset_revision: "formal-v2",
  build_id: "build-09",
  team_id: team,
  split: "dev",
  identity: {
    space_id: "space-task1-engineering",
    team_id: team,
    active_agent_id: "agent-task1-t18-general",
    asset_agents: ["agent-task1-t18-assets-a", "agent-task1-t18-assets-b"],
    user_id: "user-task1-t18-eval",
    snapshot_id: "snapshot-task1-formal-v2-dev",
  },
  workspace: {
    workspace_id: "workspace-task1-t18-launch",
    repo_slug: "TencentCloud/TencentDB-Agent-Memory",
    repo_url: "https://github.com/TencentCloud/TencentDB-Agent-Memory.git",
    base_commit: baseCommit,
    source_repo_license: "MIT",
    tree_sha256: sha256(treeInventory),
    file_manifest_sha256: sha256(fileManifest),
    state: "clean",
  },
  project_streams: [
    { id: "T18-PROJ-QUARTZ", name: "Quartz 请求性能", scope: "端到端延迟、CPU/内存剖析、热点与容量基线" },
    { id: "T18-PROJ-IRONCLAD", name: "Ironclad 并发运行时", scope: "Go worker pool、背压、竞态与资源生命周期" },
    { id: "T18-PROJ-CASCADE", name: "Cascade 数据吞吐", scope: "Spark 分区、shuffle、数据库计划与批处理吞吐" },
    { id: "T18-PROJ-SENTINEL", name: "Sentinel 性能可观测性", scope: "分布式追踪、采样、SLI/SLO 与性能回归告警" },
    { id: "T18-PROJ-FORGE", name: "Forge 构建效率", scope: "Bazel 远程执行、缓存命中与大型仓库构建性能" },
  ],
  asset_contract: {
    l0_sessions: 10, l0_messages_each: "12-20", l1_memories: 16,
    l2_scenes: 5, l3_profiles: 1, skills: 16, listed_skills: 6,
    searchable_skills: 10, knowledge_resources: 3,
  },
  frozen_asset_plan: {
    memory_positive_routes: [
      { slot: "MEM-01", target: "T18-L1-03", sequence: ["tdai_memory_search"], fact: "Quartz p99 回归的最终根因阈值与适用边界" },
      { slot: "MEM-02", target: "T18-L0-02", sequence: ["tdai_conversation_search"], fact: "Ironclad worker pool 事故中批准的精确诊断措辞" },
      { slot: "MEM-03", target: "T18-L1-11", sequence: ["tdai_memory_search"], fact: "Cascade Spark 数据倾斜缓解的例外规则" },
      { slot: "MEM-04", target: "T18-L0-08", sequence: ["tdai_conversation_search"], fact: "Sentinel trace sampling 回滚讨论的原始顺序" },
      { slot: "MEM-05", target: "T18-L1-15", sequence: ["tdai_atomic_query"], fact: "指定时间窗内 instruction 类型的 CPU profiling 保留配置" },
      { slot: "MEM-06", target: "T18-L2-04", sequence: ["tdai_read_scene"], injected_path: "projects/forge/remote-cache-degradation.md", fact: "Forge 远程缓存退化处置的完整阶段清单" },
    ],
    skill_positive_routes: [
      { slot: "SKL-01", target: "T18-SKL-01", sequence: ["skill_view"] },
      { slot: "SKL-02", target: "T18-SKL-04", sequence: ["skill_view"] },
      { slot: "SKL-03", target: "T18-SKL-07", sequence: ["skill_search", "skill_view_by_id"] },
      { slot: "SKL-04", target: "T18-SKL-10", sequence: ["skill_search", "skill_view_by_id"] },
      { slot: "SKL-05", target: "T18-SKL-14", sequence: ["skill_search", "skill_view_by_id"] },
      { slot: "SKL-06", target: "T18-SKL-02", sequence: ["skill_view", "skill_files_read"], resource_path: "references/details.md" },
    ],
    knowledge_resources: [
      { asset_id: "T18-KNW-01", type: "wiki", name: "Quartz performance decisions", about: "Quartz 延迟、profiling 与容量决策索引。", tools: ["search", "read_page"] },
      { asset_id: "T18-KNW-02", type: "wiki", name: "Cascade throughput decisions", about: "Cascade Spark、数据库与批处理吞吐决策索引。", tools: ["search", "read_page"] },
      { asset_id: "T18-KNW-03", type: "wiki", name: "Forge build performance decisions", about: "Forge 远程执行、缓存与构建性能决策索引。", tools: ["search", "read_page"] },
    ],
    knowledge_positive_routes: [
      { slot: "KNW-01", target: "T18-KNW-01", sequence: ["knowledge_tools_list", "knowledge_tools_call"], tool_name: "search", params: { query: "SpanBudget p99 ownership impact" } },
      { slot: "KNW-02", target: "T18-KNW-02", sequence: ["knowledge_tools_list", "knowledge_tools_call"], tool_name: "search", params: { query: "rebalancePartitions direct consumers" } },
      { slot: "KNW-03", target: "T18-KNW-03", sequence: ["knowledge_tools_list", "knowledge_tools_call"], tool_name: "search", params: { query: "remote execution fallback rationale" } },
    ],
  },
  case_contract: {
    memory_positive: 6, skill_positive: 6, knowledge_positive: 3,
    paired_no_tool_negative: 15, natural_coding_negative: 10, pairs: 15,
    discovery_positive: 10, direct_positive: 5,
  },
  route_contract: {
    memory: {
      search: [
        { tool: "tdai_memory_search", endpoint: "/memory-bridge/v3/atomic/search", required: ["query"] },
        { tool: "tdai_conversation_search", endpoint: "/memory-bridge/v3/conversation/search", required: ["query"] },
      ],
      direct: [
        { tool: "tdai_atomic_query", endpoint: "/memory-bridge/v3/atomic/query", required: [] },
        { tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", required: ["path"] },
      ],
      injected: { l3: "full", l2: "path+summary", l0: "none", l1: "none" },
    },
    skill: {
      listed: ["skill_view"], search: ["skill_search", "skill_view_by_id"],
      resource: ["skill_view", "skill_files_read"],
      endpoints: {
        skill_search: "/skill-bridge/v3/skill/search",
        skill_view: "/skill-bridge/v3/skill/get-by-name",
        skill_view_by_id: "/skill-bridge/v3/skill/get",
        skill_files_read: "/skill-bridge/v3/skill/files/read",
      },
    },
    knowledge: {
      sequence: ["knowledge_tools_list", "knowledge_tools_call"],
      endpoints: ["/tools/list", "/tools/call"],
      list_required: ["knowledge_id"], call_required: ["knowledge_id", "tool_name", "params"],
    },
  },
  leakage_forbidden_provider_fields: [
    "gold", "target", "expected", "pairId", "pair_id", "informationGap",
    "information_gap", "knowledge_id", "assetId", "allowedSequences", "allowedFirstActions",
  ],
  skill_sources: locks,
  skill_resource_sources: resourceLocks,
};
await writeFile(resolve(buildRoot, "input-pack.json"), `${JSON.stringify(inputPack, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ team, skills: locks.length, sourceLock: "source-lock.json", inputPack: "input-pack.json" }, null, 2));
