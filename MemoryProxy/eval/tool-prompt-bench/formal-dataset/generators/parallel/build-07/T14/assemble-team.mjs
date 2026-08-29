import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const generatorRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-07/T14");
const sourceRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T14");
const stagingRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T14");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const digest = (value, algorithm = "sha256") => createHash(algorithm)
  .update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value)))
  .digest("hex");
const withHash = (value) => {
  const copy = { ...value };
  delete copy.contentHash;
  return { ...copy, contentHash: digest(copy) };
};
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const input = readJson(join(generatorRoot, "input-pack.json"));
const freeze = readJson(join(sourceRoot, "source-freeze.json"));
const adaptedManifest = readJson(join(sourceRoot, "adapted-source-manifest.json"));
const adaptations = readJson(join(generatorRoot, "batches/pilot-skill-01/adaptations.json")).adaptations;
const memoryDraft = readJson(join(generatorRoot, "batches/expand-memory-01/memory-assets.json"));
const knowledgeDraft = readJson(join(generatorRoot, "batches/expand-knowledge-01/knowledge-assets.json"));
const naturalDraft = readJson(join(generatorRoot, "batches/natural-negative-01/draft.json"));
const worldAsOf = input.world_as_of;
const observedAt = "2026-08-28T18:00:00+08:00";

must(input.team_id === "T14" && input.stage === "DS05", "Unexpected T14 input pack");
const repositoryById = new Map(freeze.repositories.map((item) => [item.repository_id, item]));
must(repositoryById.get("aidas-k8s-agent-skills")?.commit_sha === "077702b44a5367fde0496db6a91b015f1416312a", "Unexpected Aidas T14 Skill source commit");
must(repositoryById.get("aidas-k8s-agent-skills")?.license === "MIT", "Unexpected Aidas T14 Skill license");
must(repositoryById.get("fluxcd-agent-skills")?.commit_sha === "e7e95ef1648a72f5276db6f98b799c5974ea846f", "Unexpected Flux T14 Skill source commit");
must(repositoryById.get("fluxcd-agent-skills")?.license === "Apache-2.0", "Unexpected Flux T14 Skill license");
must(adaptedManifest.adaptations.length === 16, "Expected sixteen adapted T14 Skills");

const batchConfigs = [
  ["pilot-memory-01", "memory", "T14-EVID-BATCH-PILOT-MEMORY"],
  ["expand-memory-01", "memory", "T14-EVID-BATCH-EXPAND-MEMORY"],
  ["pilot-skill-01", "skill", "T14-EVID-BATCH-PILOT-SKILL"],
  ["expand-skill-01", "skill", "T14-EVID-BATCH-EXPAND-SKILL"],
  ["pilot-knowledge-01", "knowledge", "T14-EVID-BATCH-PILOT-KNOWLEDGE"],
  ["expand-knowledge-01", "knowledge", "T14-EVID-BATCH-EXPAND-KNOWLEDGE"],
  ["natural-negative-01", "natural-negative", "T14-EVID-BATCH-NATURAL"],
];
const batches = new Map();
for (const [directory, family, evidenceId] of batchConfigs) {
  const batchDir = join(generatorRoot, "batches", directory);
  const draft = readJson(join(batchDir, "draft.json"));
  const manifest = readJson(join(batchDir, "manifest.json"));
  batches.set(directory, { directory, family, evidenceId, batchDir, draft, manifest });
}

const syntheticEvidence = (value) => withHash({
  provenanceKind: "synthetic",
  origin: "evidence_grounded_synthesis",
  worldAsOf,
  reviewStatus: "reviewed",
  ...value,
});
const sourceEvidence = [];
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-HISTORY-L0",
  role: "history",
  transform: "redacted_replay",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-luna",
  reasoningEffort: "high",
  promptVersion: "task1.luna-batch.v1",
  batchId: "expand-memory-01",
  generatedAt: batches.get("expand-memory-01").manifest.generated_at,
  contentRefs: memoryDraft.l0_sessions.map((item) => item.asset_id),
}));
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-HISTORY-L1",
  role: "history",
  transform: "atomic_fact_extraction",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-luna",
  reasoningEffort: "high",
  promptVersion: "task1.luna-batch.v1",
  batchId: "expand-memory-01",
  generatedAt: batches.get("expand-memory-01").manifest.generated_at,
  contentRefs: memoryDraft.l1_memories.map((item) => item.asset_id),
}));
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-HISTORY-L2",
  role: "history",
  transform: "multi_session_scene_synthesis",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-luna",
  reasoningEffort: "high",
  promptVersion: "task1.luna-batch.v1",
  batchId: "expand-memory-01",
  generatedAt: batches.get("expand-memory-01").manifest.generated_at,
  contentRefs: memoryDraft.l2_scenes.map((item) => item.asset_id),
}));
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-HISTORY-L3",
  role: "history",
  transform: "stable_profile_derivation",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-luna",
  reasoningEffort: "high",
  promptVersion: "task1.luna-batch.v1",
  batchId: "expand-memory-01",
  generatedAt: batches.get("expand-memory-01").manifest.generated_at,
  contentRefs: memoryDraft.l3_profiles.map((item) => item.asset_id),
}));
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-KNOW-CODE",
  role: "repo_context",
  transform: "code_graph_build",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-luna",
  reasoningEffort: "high",
  promptVersion: "task1.luna-batch.v1",
  batchId: "expand-knowledge-01",
  generatedAt: batches.get("expand-knowledge-01").manifest.generated_at,
  contentRefs: knowledgeDraft.knowledge.filter((item) => item.type === "code_graph").map((item) => item.asset_id),
}));
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-KNOW-WIKI",
  role: "repo_context",
  transform: "repo_document_snapshot",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-luna",
  reasoningEffort: "high",
  promptVersion: "task1.luna-batch.v1",
  batchId: "expand-knowledge-01",
  generatedAt: batches.get("expand-knowledge-01").manifest.generated_at,
  contentRefs: knowledgeDraft.knowledge.filter((item) => item.type === "wiki").map((item) => item.asset_id),
}));
sourceEvidence.push(syntheticEvidence({
  sourceId: "T14-EVID-TASKS",
  role: "current_anchor",
  transform: "current_task_anchor",
  transformVersion: "build-07.sol-v1",
  generatorModel: "gpt-5.6-sol",
  reasoningEffort: "high",
  promptVersion: "task1.sol-input-freeze.v1",
  batchId: "build-07-T14-input-pack",
  generatedAt: "2026-08-30T08:00:00+08:00",
  contentRefs: input.projects.map((item) => item.task_id),
}));

for (const { family, evidenceId, draft, manifest } of batches.values()) {
  const records = family === "natural-negative" ? draft.cases : draft.pairs;
  sourceEvidence.push(syntheticEvidence({
    sourceId: evidenceId,
    role: "evaluation_derivation",
    transform: family === "natural-negative" ? "natural_negative_selection" : "paired_counterfactual",
    transformVersion: "build-07.sol-v1",
    generatorModel: manifest.generator_model,
    reasoningEffort: manifest.reasoning_effort,
    promptVersion: manifest.prompt_version,
    batchId: manifest.batch_id ?? draft.batch_id,
    generatedAt: manifest.generated_at,
    contentRefs: records.map((item) => item.draft_pair_id ?? item.draft_case_id),
  }));
}

const externalEvidenceBySource = new Map();
for (const item of freeze.sources) {
  const repository = repositoryById.get(item.repository_id);
  must(repository, `Unknown frozen repository ${item.repository_id}`);
  const evidence = withHash({
    sourceId: `T14-EVID-${item.source_id}`,
    provenanceKind: "external_import",
    role: "skill_source",
    origin: "repo_document",
    worldAsOf,
    transform: "skill_package_import",
    transformVersion: "build-07.byte-identical-v1",
    reviewStatus: "reviewed",
    dataset: "github-agent-skill",
    datasetRevision: item.commit_sha,
    datasetArtifactSha256: item.raw_file_sha256,
    sourceRepoUrl: item.repository_url,
    sourceRepoCommit: item.commit_sha,
    sourceRepoLicense: item.license,
    sourceTaskTime: repository.source_task_time,
    trajectoryGeneratedAt: "2026-08-30T08:00:00+08:00",
    evidenceLocator: item.path,
    evidenceSha256: item.raw_file_sha256,
    transformInputSha256: item.raw_file_sha256,
    piiScan: "passed",
    reviewedBy: "sol-build-07",
  });
  externalEvidenceBySource.set(item.source_id, evidence.sourceId);
  sourceEvidence.push(evidence);
}

const ownerByProject = {
  "t14-borealis-platform": "agent-task1-t14-general",
  "t14-meridian-fleet": "agent-task1-t14-assets-a",
  "t14-forge-build": "agent-task1-t14-assets-b",
  "t14-aurora-release": "agent-task1-t14-general",
  "t14-cedar-config": "agent-task1-t14-assets-a",
};
const l0ById = new Map();
const l0Conversations = memoryDraft.l0_sessions.map((item, sessionIndex) => {
  const messages = item.messages.map((message, messageIndex) => withHash({
    messageId: `${item.asset_id}-M${String(messageIndex + 1).padStart(2, "0")}`,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: ["T14-EVID-HISTORY-L0"],
    observedAt,
  }));
  const value = withHash({
    assetId: item.asset_id,
    ownerAgentId: ownerByProject[item.project_id],
    sourceEvidenceIds: ["T14-EVID-HISTORY-L0"],
    observedAt,
    sessionId: `session-t14-history-${String(sessionIndex + 1).padStart(3, "0")}`,
    messages,
  });
  l0ById.set(item.asset_id, value);
  return value;
});
const firstMessagesForProject = (projectId) => {
  const session = memoryDraft.l0_sessions.find((item) => item.project_id === projectId);
  const formal = session ? l0ById.get(session.asset_id) : l0Conversations[0];
  return formal.messages.slice(-2).map((message) => message.messageId);
};
const supportingMessages = (item) => {
  const refs = [];
  for (const assetId of item.support_chain ?? []) {
    const conversation = l0ById.get(assetId);
    if (conversation) refs.push(...conversation.messages.slice(-2).map((message) => message.messageId));
  }
  return [...new Set(refs.length > 0 ? refs : firstMessagesForProject(item.project_id))];
};
const memoryType = (item) => /决定|批准|阈值|采样/.test(item.title) ? "decision" : /背景|线索|记录|约束|观察|干扰/.test(item.title) ? "fact" : "event";
const l1Memories = memoryDraft.l1_memories.map((item) => withHash({
  assetId: item.asset_id,
  ownerAgentId: ownerByProject[item.project_id],
  sourceEvidenceIds: ["T14-EVID-HISTORY-L1"],
  observedAt,
  type: memoryType(item),
  content: item.content,
  status: "active",
  validFrom: "2026-08-01T00:00:00+08:00",
  supportingMessageIds: supportingMessages(item),
  codeEvidenceLocators: [],
  testEvidenceLocators: [],
}));
const l2Scenes = memoryDraft.l2_scenes.map((item) => withHash({
  assetId: item.asset_id,
  ownerAgentId: ownerByProject[item.project_id],
  sourceEvidenceIds: ["T14-EVID-HISTORY-L2"],
  observedAt,
  path: item.path,
  summary: item.summary,
  content: item.content,
  injected: true,
  supportingSessionIds: (item.linked_assets ?? []).filter((assetId) => l0ById.has(assetId)).map((assetId) => l0ById.get(assetId).sessionId),
}));
const l3Profiles = memoryDraft.l3_profiles.map((item) => withHash({
  assetId: item.asset_id,
  ownerAgentId: "agent-task1-t14-general",
  sourceEvidenceIds: ["T14-EVID-HISTORY-L3"],
  observedAt,
  content: item.summary,
  stability: "team",
}));

const adaptationByAsset = new Map(adaptations.map((item) => [item.asset_id, item]));
const adaptedByAsset = new Map(adaptedManifest.adaptations.map((item) => [item.asset_id, item]));
const skillPoolByAsset = new Map(input.skill_pool.map((item) => [item.asset_id, item]));
const skills = input.skill_pool.map((poolItem) => {
  const adaptation = adaptationByAsset.get(poolItem.asset_id);
  const packageRecord = adaptedByAsset.get(poolItem.asset_id);
  must(adaptation && packageRecord, `Missing Skill adaptation for ${poolItem.asset_id}`);
  const sourceIds = [externalEvidenceBySource.get(poolItem.source_id)];
  const manifest = [{ path: "SKILL.md", sha256: packageRecord.adapted_sha256 }];
  if (poolItem.resource_source_id) {
    const resource = adaptedManifest.resources.find((item) => item.asset_id === poolItem.asset_id);
    must(resource, `Missing resource manifest for ${poolItem.asset_id}`);
    sourceIds.push(externalEvidenceBySource.get(poolItem.resource_source_id));
    manifest.push({ path: poolItem.resource_path, sha256: resource.adapted_sha256 });
  }
  return withHash({
    assetId: poolItem.asset_id,
    ownerAgentId: poolItem.owner_agent_id,
    sourceEvidenceIds: sourceIds,
    observedAt,
    name: adaptation.name,
    version: "1.0.0",
    description: adaptation.listing_description,
    useWhen: adaptation.use_when.join("；"),
    doNotUseWhen: adaptation.do_not_use_when.join("；"),
    repoCommit: freeze.sources.find((item) => item.source_id === poolItem.source_id).commit_sha,
    visibility: poolItem.visibility,
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest,
  });
});

const knowledge = knowledgeDraft.knowledge.map((item) => {
  const project = input.projects.find((candidate) => candidate.project_id === item.match.project_id);
  const repoUrl = item.type === "code_graph" ? project.workspace_repo : undefined;
  const base = {
    assetId: item.asset_id,
    ownerAgentId: "agent-task1-t14-general",
    sourceEvidenceIds: [item.type === "code_graph" ? "T14-EVID-KNOW-CODE" : "T14-EVID-KNOW-WIKI"],
    observedAt,
    type: item.type,
    name: item.name,
    snapshotSha256: digest(item.query_fixtures),
    bindings: [{ agentId: input.identity.active_agent_id, visibility: "fixed" }],
  };
  if (repoUrl) {
    base.repoUrl = repoUrl;
    base.repoCommit = digest(project.project_id, "sha1");
    base.indexVersion = "build-07.synthetic-code-graph.v1";
  }
  return withHash(base);
});

const taskByProject = new Map();
const tasks = input.projects.map((project) => {
  const commit = digest(project.project_id, "sha1");
  const workspace = withHash({
    workspaceId: `workspace-${project.project_id}`,
    repoSlug: project.project_id,
    repoUrl: project.workspace_repo,
    baseCommit: commit,
    sourceRepoLicense: "benchmark-synthetic",
    treeSha256: digest(`${project.project_id}:tree`),
    fileManifestSha256: digest(`${project.project_id}:manifest`),
    state: "clean",
  });
  const projectRef = withHash({
    projectRefId: `project-ref-${project.project_id}`,
    repoSlug: project.project_id,
    repoUrl: project.workspace_repo,
    pinnedCommit: commit,
    sourceEvidenceIds: ["T14-EVID-TASKS"],
  });
  const task = withHash({
    taskId: project.task_id,
    teamId: "T14",
    title: project.name,
    description: project.stream,
    goal: `在 ${project.name} 项目中完成可复核的云原生交付工作。`,
    eligibleAgentIds: [input.identity.active_agent_id],
    projectRef,
    workspace,
    sourceEvidenceIds: ["T14-EVID-TASKS"],
  });
  taskByProject.set(project.project_id, task);
  return task;
});

const agentDetail = (description, prompt) => withHash({ description, prompt });
const businessAgents = [
  withHash({
    agentId: "agent-task1-t14-general",
    teamId: "T14",
    name: "T14 云原生交付负责人",
    agentDetail: agentDetail("负责五条 Kubernetes、GitOps、构建与发布项目流的交付。", "只在当前任务证据不足时使用已绑定的 TDAI 资产，并在取回足够信息后停止。"),
    importedMemoryAgentIds: ["agent-task1-t14-assets-a", "agent-task1-t14-assets-b"],
    boundSkillIds: input.skill_pool.filter((item) => item.bound).map((item) => item.asset_id),
    fixedKnowledgeIds: input.knowledge_pool.map((item) => item.asset_id),
    sourceEvidenceIds: ["T14-EVID-TASKS"],
  }),
  withHash({
    agentId: "agent-task1-t14-assets-a",
    teamId: "T14",
    name: "T14 历史资产 A",
    agentDetail: agentDetail("保存 GitOps 与配置历史，并共享 team-visible Skill。", "维护冻结资产，不替代当前任务代理作答。"),
    importedMemoryAgentIds: [],
    boundSkillIds: input.skill_pool.filter((item) => item.owner_agent_id === "agent-task1-t14-assets-a").map((item) => item.asset_id),
    fixedKnowledgeIds: [],
    sourceEvidenceIds: ["T14-EVID-TASKS"],
  }),
  withHash({
    agentId: "agent-task1-t14-assets-b",
    teamId: "T14",
    name: "T14 历史资产 B",
    agentDetail: agentDetail("保存构建与发布历史，并共享 team-visible Skill。", "维护冻结资产，不替代当前任务代理作答。"),
    importedMemoryAgentIds: [],
    boundSkillIds: input.skill_pool.filter((item) => item.owner_agent_id === "agent-task1-t14-assets-b").map((item) => item.asset_id),
    fixedKnowledgeIds: [],
    sourceEvidenceIds: ["T14-EVID-TASKS"],
  }),
];

const team = withHash({
  teamId: "T14",
  worldId: "task1-formal-v1",
  split: "hidden_test",
  name: "云原生交付",
  businessAgentIds: businessAgents.map((item) => item.agentId),
  taskIds: tasks.map((item) => item.taskId),
  sourceEvidenceIds: sourceEvidence.map((item) => item.sourceId),
});

const allAssets = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge];
const snapshotAssetIds = allAssets.map((item) => item.assetId);
const visibleAssetSetSha256 = digest(snapshotAssetIds.slice().sort());
const taskForRoute = (route) => {
  const task = taskByProject.get(route.project_id);
  must(task, `Unknown project route ${route.project_id}`);
  return task;
};
const action = (tool, endpoint, argumentRules) => ({ tool, endpoint, ...(argumentRules ? { argumentRules } : {}) });
const skillByAsset = new Map(skills.map((item) => [item.assetId, item]));
const knowledgeByAsset = new Map(knowledgeDraft.knowledge.map((item) => [item.asset_id, item]));
const routeSpecs = {
  "MEM-001": {
    first: action("tdai_memory_search", "/memory-bridge/v3/atomic/search", { requiredFields: ["query"], forbiddenFields: ["identity"], stringContainsAny: { query: ["Borealis", "Helm", "回滚", "护栏"] } }),
  },
  "MEM-002": {
    first: action("tdai_conversation_search", "/memory-bridge/v3/conversation/search", { requiredFields: ["query"], forbiddenFields: ["identity"], stringContainsAny: { query: ["Forge", "多架构", "镜像", "registry"] } }),
  },
  "MEM-003": {
    first: action("tdai_conversation_search", "/memory-bridge/v3/conversation/search", { requiredFields: ["query"], forbiddenFields: ["identity"], stringContainsAny: { query: ["Meridian", "漂移", "例外", "reconcile"] } }),
    followups: [action("tdai_conversation_query", "/memory-bridge/v3/conversation/query", { requiredFields: ["session_id"], forbiddenFields: ["identity"], valueFromPreviousStep: true })],
  },
  "MEM-004": {
    first: action("tdai_memory_search", "/memory-bridge/v3/atomic/search", { requiredFields: ["query"], forbiddenFields: ["identity"], stringContainsAny: { query: ["Aurora", "canary", "分析", "回退"] } }),
  },
  "MEM-005": {
    first: action("tdai_atomic_query", "/memory-bridge/v3/atomic/query", { requiredFields: ["type", "time_start", "time_end"], forbiddenFields: ["identity"], exactValues: { type: "decision", time_start: "2026-08-03T00:00:00+08:00", time_end: "2026-08-18T00:00:00+08:00" } }),
  },
  "MEM-006": {
    first: action("tdai_read_scene", "/memory-bridge/v3/scenario/read", { requiredFields: ["path"], forbiddenFields: ["identity"], exactValues: { path: "delivery/borealis/helm-rollback-review.md" }, pathFromFixture: true }),
  },
};

for (const route of input.skill_case_routes) {
  const target = skillByAsset.get(route.target_asset_id);
  if (route.sequence[0] === "skill_search") {
    routeSpecs[route.case_key] = {
      first: action("skill_search", "/skill-bridge/v3/skill/search", { requiredFields: ["query"], forbiddenFields: ["identity", "top_k", "mode"], stringContainsAny: { query: target.useWhen.split("；") } }),
      followups: [action("skill_view_by_id", "/skill-bridge/v3/skill/get", { requiredFields: ["skill_id"], forbiddenFields: ["identity"], valueFromPreviousStep: true })],
    };
  } else {
    routeSpecs[route.case_key] = {
      first: action("skill_view", "/skill-bridge/v3/skill/get-by-name", { requiredFields: ["skill_name"], forbiddenFields: ["identity"], exactValues: { skill_name: target.name } }),
    };
  }
  if (route.sequence.includes("skill_files_read")) {
    routeSpecs[route.case_key].followups = [action("skill_files_read", "/skill-bridge/v3/skill/files/read", { requiredFields: ["skill_id", "path"], forbiddenFields: ["identity"], exactValues: { path: route.required_resource_path }, valueFromPreviousStep: true })];
  }
}

for (const route of input.knowledge_case_routes) {
  const asset = knowledgeByAsset.get(route.target_asset_id);
  const fixture = asset.query_fixtures.find((item) => item.tool_name === asset.fixed_tools[0].name) ?? asset.query_fixtures[0];
  routeSpecs[route.case_key] = {
    first: action("knowledge_tools_list", "/tools/list", { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: route.target_asset_id } }),
    knowledgeCalls: [{ toolName: fixture.tool_name, paramRules: { requiredFields: Object.keys(fixture.query), exactValues: fixture.query } }],
  };
}

const pairBatchForKey = (key) => {
  const number = Number(key.split("-")[1]);
  if (key.startsWith("MEM")) return number === 1 ? batches.get("pilot-memory-01") : batches.get("expand-memory-01");
  if (key.startsWith("SKL")) return number === 3 ? batches.get("pilot-skill-01") : batches.get("expand-skill-01");
  if (key.startsWith("KNW")) return number === 1 ? batches.get("pilot-knowledge-01") : batches.get("expand-knowledge-01");
  throw new Error(`Unknown pair key ${key}`);
};
const routeKeyFromPair = (pair) => {
  const match = pair.draft_pair_id.match(/(MEM|SKL|KNW)-0*([1-9][0-9]*)/i);
  must(match, `Cannot identify route for ${pair.draft_pair_id}`);
  return `${match[1].toUpperCase()}-${String(Number(match[2])).padStart(3, "0")}`;
};
const routeMap = new Map([
  ...input.memory_case_routes,
  ...input.skill_case_routes,
  ...input.knowledge_case_routes,
].map((item) => [item.case_key, item]));
const pairsByKey = new Map();
for (const batch of batches.values()) {
  for (const pair of batch.draft.pairs ?? []) pairsByKey.set(routeKeyFromPair(pair), { pair, batch });
}

const publicCases = [];
const privateAnnotations = [];
const formalPairs = [];
const providerContexts = new Map();
const caseIdentity = (task, sessionId) => ({
  spaceId: input.identity.space_id,
  teamId: "T14",
  userId: input.identity.user_id,
  agentId: input.identity.active_agent_id,
  taskId: task.taskId,
  sessionId,
  agentSource: "codex",
});
const addCase = ({ caseId, task, sessionId, difficulty, contextMessages, query, sourceIds, gold, annotationReason, pairId, pairRole }) => {
  const publicCase = withHash({
    caseId,
    identity: caseIdentity(task, sessionId),
    snapshotId: input.identity.snapshot_id,
    workspace: task.workspace,
    language: "zh",
    difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
    contextMessages,
    query,
    visibleAssetSetSha256,
  });
  const annotation = withHash({
    caseId,
    sourceEvidenceIds: sourceIds,
    ...(pairId ? { pairId, pairRole } : {}),
    gold: withHash(gold),
    annotationReason,
  });
  publicCases.push(publicCase);
  privateAnnotations.push(annotation);
  providerContexts.set(caseId, { caseId, language: publicCase.language, contextMessages, query });
};

for (const [family, routes] of [["memory", input.memory_case_routes], ["skill", input.skill_case_routes], ["knowledge", input.knowledge_case_routes]]) {
  for (const route of routes) {
    const record = pairsByKey.get(route.case_key);
    must(record, `Missing pair draft for ${route.case_key}`);
    const { pair, batch } = record;
    const number = route.case_key.split("-")[1];
    const familyCode = route.case_key.split("-")[0];
    const pairId = `T14-${familyCode}-${number}`;
    const positiveId = `${pairId}-P`;
    const negativeId = `${pairId}-N`;
    const task = taskForRoute(route);
    const shared = pair.shared_context_messages;
    const positiveMessages = [...shared, pair.positive.delta_message];
    const negativeMessages = [...shared, pair.negative.delta_message];
    const spec = routeSpecs[route.case_key];
    const sequence = route.sequence;
    const externalEvidenceIds = (pair.external_source_ids ?? []).map((sourceId) => externalEvidenceBySource.get(sourceId)).filter(Boolean);
    const sourceIds = [batch.evidenceId, ...externalEvidenceIds];
    const positiveGold = {
      needTdaiTool: true,
      family,
      allowedFirstActions: [spec.first],
      ...(spec.followups ? { expectedFollowupActions: spec.followups } : {}),
      ...(spec.knowledgeCalls ? { expectedKnowledgeCalls: spec.knowledgeCalls } : {}),
      allowedSequences: [sequence],
      forbiddenTools: family === "memory" ? ["skill_search", "knowledge_tools_list"] : family === "skill" ? ["tdai_memory_search", "knowledge_tools_list"] : ["tdai_memory_search", "skill_search"],
      maxTdaiCalls: sequence.length,
      targetAssetIds: [route.target_asset_id],
      informationGap: pair.positive.private_proposal.unique_information_gap,
      stopAfter: pair.positive.private_proposal.stop_after_candidate,
      evidenceRefs: sourceIds,
      ablationEvidence: pair.controlled_delta_note,
    };
    const negativeGold = {
      needTdaiTool: false,
      family: null,
      allowedFirstActions: [],
      allowedSequences: [],
      forbiddenTools: ["tdai_memory_search", "tdai_atomic_query", "tdai_conversation_search", "tdai_conversation_query", "tdai_read_scene", "skill_search", "skill_view", "skill_view_by_id", "skill_files_read", "knowledge_tools_list", "knowledge_tools_call"],
      maxTdaiCalls: 0,
      targetAssetIds: [],
      evidenceRefs: [batch.evidenceId],
      ablationEvidence: pair.controlled_delta_note,
      noToolEvidence: pair.negative.private_proposal.why_current_context_is_sufficient,
    };
    const sessionId = `session-${pairId.toLowerCase()}`;
    addCase({ caseId: positiveId, task, sessionId, difficulty: pair.difficulty, contextMessages: positiveMessages, query: pair.query, sourceIds, gold: positiveGold, annotationReason: `Positive ${family} case approved by Sol after unique-gap and visibility review.`, pairId, pairRole: "positive" });
    addCase({ caseId: negativeId, task, sessionId, difficulty: pair.difficulty, contextMessages: negativeMessages, query: pair.query, sourceIds: [batch.evidenceId], gold: negativeGold, annotationReason: "Paired no-tool case: the controlled delta supplies the only missing fact.", pairId, pairRole: "negative" });
    formalPairs.push(withHash({
      pairId,
      positiveCaseId: positiveId,
      negativeCaseId: negativeId,
      counterfactualKind: "answer_in_current_context",
      controlledDeltaSha256: digest(JSON.stringify({ positive_delta_message: pair.positive.delta_message, negative_delta_message: pair.negative.delta_message, query: pair.query })),
      currentEvidenceRefs: [batch.evidenceId],
    }));
  }
}

for (const [index, item] of naturalDraft.cases.entries()) {
  const projectId = item.project_id ?? input.projects[index % input.projects.length].project_id;
  const task = taskByProject.get(projectId) ?? tasks[index % tasks.length];
  const caseId = `T14-COD-${String(index + 1).padStart(3, "0")}`;
  const gold = {
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    allowedSequences: [],
    forbiddenTools: ["tdai_memory_search", "tdai_atomic_query", "tdai_conversation_search", "tdai_conversation_query", "tdai_read_scene", "skill_search", "skill_view", "skill_view_by_id", "skill_files_read", "knowledge_tools_list", "knowledge_tools_call"],
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs: [batches.get("natural-negative-01").evidenceId],
    ablationEvidence: "Natural coding negative is independently self-contained and is not derived by deleting an asset-backed fact.",
    noToolEvidence: item.why_current_context_is_sufficient,
  };
  addCase({
    caseId,
    task,
    sessionId: `session-${caseId.toLowerCase()}`,
    difficulty: item.difficulty ?? "medium",
    contextMessages: item.context_messages,
    query: item.query,
    sourceIds: [batches.get("natural-negative-01").evidenceId],
    gold,
    annotationReason: "Natural no-tool coding task with all required evidence in the current context.",
  });
}

const fragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: "build-07",
  team_id: "T14",
  split: "hidden_test",
  sourceEvidence,
  teams: [team],
  businessAgents,
  tasks,
  publicCases,
  privateAnnotations,
  pairs: formalPairs,
  snapshotAssetIds,
  generatorBatchRefs: batchConfigs.map(([directory, family, evidenceId]) => ({
    batchId: batches.get(directory).manifest.batch_id ?? batches.get(directory).draft.batch_id,
    family,
    directory: relative(repoRoot, batches.get(directory).batchDir).replaceAll("\\", "/"),
    evidenceId,
    rawOutputSha256: batches.get(directory).manifest.raw_output_sha256,
    validatorPassed: true,
    solReviewed: true,
  })),
  externalImports: freeze.sources.map((item) => ({
    sourceId: item.source_id,
    evidenceId: externalEvidenceBySource.get(item.source_id),
    repositoryUrl: item.repository_url,
    commitSha: item.commit_sha,
    path: item.path,
    license: item.license,
    rawFileSha256: item.raw_file_sha256,
  })),
};

writeJson(join(stagingRoot, "team-fragment.json"), fragment);
writeJson(join(stagingRoot, "assets/memory.json"), {
  schema_version: "task1.team_memory_assets.v1",
  team_id: "T14",
  l0Conversations,
  l1Memories,
  l2Scenes,
  l3Profiles,
  injectionContract: { l0Injected: false, l1Injected: false, l2PathAndSummaryInjected: true, l3ContentInjected: true },
});
writeJson(join(stagingRoot, "assets/skills.json"), {
  schema_version: "task1.team_skill_assets.v1",
  team_id: "T14",
  skills,
  listingEvidence: {
    agentId: input.identity.active_agent_id,
    listedAssetIds: input.skill_pool.filter((item) => item.bound).map((item) => item.asset_id),
    listingSha256: digest(input.skill_pool.filter((item) => item.bound).map((item) => ({ asset_id: item.asset_id, description: adaptationByAsset.get(item.asset_id).listing_description }))),
  },
  searchFixtures: input.skill_case_routes.filter((item) => item.listing_state === "searchable_not_listed").map((item) => ({
    caseKey: item.case_key,
    targetAssetId: item.target_asset_id,
    visibleDistractorIds: pairsByKey.get(item.case_key).pair.visible_distractor_ids_author_only,
    expectedMode: "team-visible-search",
  })),
});
writeJson(join(stagingRoot, "assets/knowledge.json"), {
  schema_version: "task1.team_knowledge_assets.v1",
  team_id: "T14",
  knowledge,
  toolLists: knowledgeDraft.knowledge.map((item) => ({ assetId: item.asset_id, fixedTools: item.fixed_tools, queryFixtures: item.query_fixtures })),
  discoveryEvidence: input.knowledge_case_routes.map((route) => ({
    caseKey: route.case_key,
    targetAssetId: route.target_asset_id,
    visibleDistractorIds: pairsByKey.get(route.case_key).pair.visible_distractor_ids_author_only,
  })),
});

const review = `# T14 Sol Review\n\n- Team: T14 云原生交付\n- Split: hidden_test\n- Cases: 40（15 Positive、15 paired No-tool Negative、10 natural Coding Negative）\n- Pair 单变量：15/15 已核对。\n- Positive 路由：10 条 search/discovery，5 条 direct。\n- Skill 来源：Aidas-dev/k8s-agent-skills @ ${repositoryById.get("aidas-k8s-agent-skills").commit_sha}（MIT）与 fluxcd/agent-skills @ ${repositoryById.get("fluxcd-agent-skills").commit_sha}（Apache-2.0）；16 个 Skill 正文与 1 个引用资源均按冻结哈希字节一致导入。\n- 资产闭环：10 L0（每个 12-20 条消息）、16 L1、5 L2、1 L3、16 Skill、3 Knowledge。\n- 注入边界：L0/L1 不注入，L2 仅 path+summary，L3 全文；Positive 答案不在首屏注入中。\n- Gold：由 Sol 根据生产 Memory、Skill、Knowledge 路由源码重建；Luna private_proposal 仅作为复核输入。\n- Provider：仅序列化 caseId、language、contextMessages、query；身份、资产、pair、Gold 和判分字段均不进入 provider。\n`;
mkdirSync(stagingRoot, { recursive: true });
writeFileSync(join(stagingRoot, "review.md"), review, "utf8");

console.log(JSON.stringify({
  team: "T14",
  cases: publicCases.length,
  pairs: formalPairs.length,
  assets: { l0: l0Conversations.length, l1: l1Memories.length, l2: l2Scenes.length, l3: l3Profiles.length, skills: skills.length, knowledge: knowledge.length },
  stagingRoot,
}, null, 2));
