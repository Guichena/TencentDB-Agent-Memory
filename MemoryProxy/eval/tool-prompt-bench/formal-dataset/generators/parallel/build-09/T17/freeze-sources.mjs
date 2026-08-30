import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const workspace = process.cwd();
const team = "T17";
const buildRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09", team);
const sourceRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material", team);

const repositories = {
  agents: {
    repository: "https://github.com/wshobson/agents",
    slug: "wshobson/agents",
    revision: "38e19c20d2b154510b0e624a2e3e186b19b5c527",
    committedAt: "2026-08-26T12:14:08Z",
    treeSha: "126e6a70b327db3e744797ba952f06bdf67aa5c5",
    license: "MIT",
    licensePath: "LICENSE",
  },
  claudeSkills: {
    repository: "https://github.com/jeffallan/claude-skills",
    slug: "jeffallan/claude-skills",
    revision: "882ef55e377dbf9a4dbe496bb41ac6ccd0e555cf",
    committedAt: "2026-08-07T20:19:14Z",
    treeSha: "2b301c97991bcf5f838cce82637332bb28ae4b83",
    license: "MIT",
    licensePath: "LICENSE",
  },
};

const selected = [
  ["T17-SKL-01", "agents", "plugins/accessibility-compliance/skills/screen-reader-testing/SKILL.md", "screen-reader-testing", "listed"],
  ["T17-SKL-02", "agents", "plugins/accessibility-compliance/skills/wcag-audit-patterns/SKILL.md", "wcag-audit-patterns", "listed"],
  ["T17-SKL-03", "agents", "plugins/framework-migration/skills/react-modernization/SKILL.md", "react-modernization", "listed"],
  ["T17-SKL-04", "agents", "plugins/frontend-mobile-development/skills/nextjs-app-router-patterns/SKILL.md", "nextjs-app-router-patterns", "listed"],
  ["T17-SKL-05", "agents", "plugins/frontend-mobile-development/skills/react-state-management/SKILL.md", "react-state-management", "listed"],
  ["T17-SKL-06", "agents", "plugins/frontend-mobile-development/skills/tailwind-design-system/SKILL.md", "tailwind-design-system", "listed"],
  ["T17-SKL-07", "agents", "plugins/ui-design/skills/design-system-patterns/SKILL.md", "design-system-patterns", "searchable"],
  ["T17-SKL-08", "agents", "plugins/ui-design/skills/responsive-design/SKILL.md", "responsive-design", "searchable"],
  ["T17-SKL-09", "agents", "plugins/ui-design/skills/web-component-design/SKILL.md", "web-component-design", "searchable"],
  ["T17-SKL-10", "agents", "plugins/ui-design/skills/accessibility-compliance/SKILL.md", "accessibility-compliance", "searchable"],
  ["T17-SKL-11", "agents", "plugins/developer-essentials/skills/e2e-testing-patterns/SKILL.md", "e2e-testing-patterns", "searchable"],
  ["T17-SKL-12", "agents", "plugins/javascript-typescript/skills/javascript-testing-patterns/SKILL.md", "javascript-testing-patterns", "searchable"],
  ["T17-SKL-13", "claudeSkills", "skills/react-expert/SKILL.md", "react-expert", "searchable"],
  ["T17-SKL-14", "claudeSkills", "skills/nextjs-developer/SKILL.md", "nextjs-developer", "searchable"],
  ["T17-SKL-15", "claudeSkills", "skills/playwright-expert/SKILL.md", "playwright-expert", "searchable"],
  ["T17-SKL-16", "claudeSkills", "skills/typescript-pro/SKILL.md", "typescript-pro", "searchable"],
];
const selectedResources = [
  ["T17-SKL-02", "agents", "plugins/accessibility-compliance/skills/wcag-audit-patterns/references/details.md", "references/details.md"],
];

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const rawUrl = (repo, path) => `https://raw.githubusercontent.com/${repo.slug}/${repo.revision}/${path}`;

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Codex-Dataset-Builder" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

await mkdir(sourceRoot, { recursive: true });
const locks = [];
for (const [assetId, repoKey, path, name, listing] of selected) {
  const repo = repositories[repoKey];
  const raw = await fetchText(rawUrl(repo, path));
  const destination = resolve(sourceRoot, "raw", repoKey, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, raw, "utf8");
  locks.push({
    assetId,
    name,
    listing,
    repository: repo.repository,
    revision: repo.revision,
    license: repo.license,
    path,
    rawSha256: sha256(raw),
    copiedTo: destination.slice(workspace.length + 1).replaceAll("\\", "/"),
  });
}

const resourceLocks = [];
for (const [assetId, repoKey, path, manifestPath] of selectedResources) {
  const repo = repositories[repoKey];
  const raw = await fetchText(rawUrl(repo, path));
  const destination = resolve(sourceRoot, "raw", repoKey, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, raw, "utf8");
  resourceLocks.push({
    assetId,
    repository: repo.repository,
    revision: repo.revision,
    license: repo.license,
    path,
    manifestPath,
    rawSha256: sha256(raw),
    copiedTo: destination.slice(workspace.length + 1).replaceAll("\\", "/"),
  });
}

for (const [repoKey, repo] of Object.entries(repositories)) {
  const licenseText = await fetchText(rawUrl(repo, repo.licensePath));
  const destination = resolve(sourceRoot, "licenses", `${repoKey}-${basename(repo.licensePath)}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, licenseText, "utf8");
  repo.licenseSha256 = sha256(licenseText);
  repo.licenseCopiedTo = destination.slice(workspace.length + 1).replaceAll("\\", "/");
}

const sourceLock = {
  schema_version: "task1.skill_source_lock.v1",
  team_id: team,
  frozen_at: "2026-08-31T12:00:00+08:00",
  repositories,
  skills: locks,
  resources: resourceLocks,
};
await writeFile(resolve(buildRoot, "source-lock.json"), `${JSON.stringify(sourceLock, null, 2)}\n`, "utf8");

const git = (...args) => execFileSync("git", ["-c", "safe.directory=D:/projects/TencentDB-Agent-Memory-task1-data-build-20team-t17-t18", ...args], {
  cwd: workspace,
  encoding: "utf8",
});
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
    active_agent_id: "agent-task1-t17-general",
    asset_agents: ["agent-task1-t17-assets-a", "agent-task1-t17-assets-b"],
    user_id: "user-task1-t17-eval",
    snapshot_id: "snapshot-task1-formal-v2-dev",
  },
  workspace: {
    workspace_id: "workspace-task1-t17-launch",
    repo_slug: "TencentCloud/TencentDB-Agent-Memory",
    repo_url: "https://github.com/TencentCloud/TencentDB-Agent-Memory.git",
    base_commit: baseCommit,
    source_repo_license: "MIT",
    tree_sha256: sha256(treeInventory),
    file_manifest_sha256: sha256(fileManifest),
    state: "clean",
  },
  project_streams: [
    { id: "T17-PROJ-AURORA", name: "Aurora 组件与设计系统", scope: "组件契约、token、可访问性与跨浏览器样式" },
    { id: "T17-PROJ-ATLAS", name: "Atlas 状态与数据缓存", scope: "客户端状态边界、查询缓存、乐观更新与失效策略" },
    { id: "T17-PROJ-HELIOS", name: "Helios SSR 与 hydration", scope: "服务端渲染、流式边界、hydration 一致性与 RSC" },
    { id: "T17-PROJ-FOUNDRY", name: "Foundry 构建与模块边界", scope: "bundle 分包、模块所有权、monorepo 边界与兼容目标" },
    { id: "T17-PROJ-PULSE", name: "Pulse Web 性能", scope: "Core Web Vitals、长任务、渲染抖动与资源优先级" },
  ],
  asset_contract: {
    l0_sessions: 10,
    l0_messages_each: "12-20",
    l1_memories: 16,
    l2_scenes: 5,
    l3_profiles: 1,
    skills: 16,
    listed_skills: 6,
    searchable_skills: 10,
    knowledge_resources: 3,
  },
  frozen_asset_plan: {
    memory_positive_routes: [
      { slot: "MEM-01", target: "T17-L1-03", sequence: ["tdai_memory_search"], fact: "Atlas 查询缓存对跨租户 mutation 的最终失效边界" },
      { slot: "MEM-02", target: "T17-L0-02", sequence: ["tdai_conversation_search"], fact: "Helios hydration 事故复盘中批准的精确诊断措辞" },
      { slot: "MEM-03", target: "T17-L1-11", sequence: ["tdai_memory_search"], fact: "Foundry 异步 chunk 的冻结体积预算及例外条件" },
      { slot: "MEM-04", target: "T17-L0-08", sequence: ["tdai_conversation_search"], fact: "Aurora combobox 屏幕阅读器兼容讨论中的原始回退顺序" },
      { slot: "MEM-05", target: "T17-L1-15", sequence: ["tdai_atomic_query"], fact: "指定时间窗内 instruction 类型的浏览器兼容下限" },
      { slot: "MEM-06", target: "T17-L2-04", sequence: ["tdai_read_scene"], injected_path: "projects/helios/streaming-hydration-rollout.md", fact: "流式边界分批启用的完整检查清单" },
    ],
    skill_positive_routes: [
      { slot: "SKL-01", target: "T17-SKL-04", sequence: ["skill_view"] },
      { slot: "SKL-02", target: "T17-SKL-05", sequence: ["skill_view"] },
      { slot: "SKL-03", target: "T17-SKL-07", sequence: ["skill_search", "skill_view_by_id"] },
      { slot: "SKL-04", target: "T17-SKL-08", sequence: ["skill_search", "skill_view_by_id"] },
      { slot: "SKL-05", target: "T17-SKL-10", sequence: ["skill_search", "skill_view_by_id"] },
      { slot: "SKL-06", target: "T17-SKL-02", sequence: ["skill_view", "skill_files_read"], resource_path: "references/details.md" },
    ],
    knowledge_resources: [
      { asset_id: "T17-KNW-01", type: "wiki", name: "Aurora architecture decisions", about: "Aurora token、组件与可访问性架构决策索引。", tools: ["search", "read_page"] },
      { asset_id: "T17-KNW-02", type: "wiki", name: "Helios rendering decisions", about: "Helios SSR、streaming 与 hydration 设计决策索引。", tools: ["search", "read_page"] },
      { asset_id: "T17-KNW-03", type: "wiki", name: "Foundry build decisions", about: "Foundry chunk、模块边界与构建决策索引。", tools: ["search", "read_page"] },
    ],
    knowledge_positive_routes: [
      { slot: "KNW-01", target: "T17-KNW-01", sequence: ["knowledge_tools_list", "knowledge_tools_call"], tool_name: "search", params: { query: "TokenRegistry impact inventory" } },
      { slot: "KNW-02", target: "T17-KNW-02", sequence: ["knowledge_tools_list", "knowledge_tools_call"], tool_name: "search", params: { query: "hydration boundary ownership rationale" } },
      { slot: "KNW-03", target: "T17-KNW-03", sequence: ["knowledge_tools_list", "knowledge_tools_call"], tool_name: "search", params: { query: "createChunkPlan direct callers" } },
    ],
  },
  case_contract: {
    memory_positive: 6,
    skill_positive: 6,
    knowledge_positive: 3,
    paired_no_tool_negative: 15,
    natural_coding_negative: 10,
    pairs: 15,
    discovery_positive: 10,
    direct_positive: 5,
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
      listed: ["skill_view"],
      search: ["skill_search", "skill_view_by_id"],
      resource: ["skill_view", "skill_files_read"],
      endpoints: {
        skill_search: "/skill-bridge/v3/skill/search",
        skill_view: "/skill-bridge/v3/skill/get-by-name",
        skill_view_by_id: "/skill-bridge/v3/skill/get",
        skill_files_read: "/skill-bridge/v3/skill/files/read",
      },
      source_decision: "Current production search returns skill_id and the formal runbook freezes search -> skill_view_by_id so the follow-up id is obtained from the previous response. Listed Skills continue to use skill_view by injected name.",
    },
    knowledge: {
      sequence: ["knowledge_tools_list", "knowledge_tools_call"],
      endpoints: ["/tools/list", "/tools/call"],
      list_required: ["knowledge_id"],
      call_required: ["knowledge_id", "tool_name", "params"],
    },
  },
  leakage_forbidden_provider_fields: [
    "gold", "target", "expected", "pairId", "pair_id", "informationGap", "information_gap",
    "knowledge_id", "assetId", "allowedSequences", "allowedFirstActions",
  ],
  skill_sources: locks,
  skill_resource_sources: resourceLocks,
};
await writeFile(resolve(buildRoot, "input-pack.json"), `${JSON.stringify(inputPack, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ team, skills: locks.length, sourceLock: "source-lock.json", inputPack: "input-pack.json" }, null, 2));
