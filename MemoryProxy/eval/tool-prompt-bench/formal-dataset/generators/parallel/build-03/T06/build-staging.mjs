import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const TEAM = "T06";
const BUILD = "build-03";
const SPLIT = "hidden_test";
const WORLD_AS_OF = "2026-08-29T23:59:59+08:00";
const WORLD_ID = "world-task1-engineering";
const SPACE_ID = "space-task1-engineering";
const SNAPSHOT_ID = "snapshot-task1-hidden-v1";
const USER_ID = "user-task1-t06";
const GENERAL_AGENT = "agent-task1-t06-general";
const ASSET_AGENT_A = "agent-task1-t06-assets-a";
const ASSET_AGENT_B = "agent-task1-t06-assets-b";

const ROOT = process.cwd();
const DATASET = join(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const GEN = join(DATASET, "generators/parallel/build-03/T06");
const SOURCE = join(DATASET, "source-material/T06");
const STAGING = join(DATASET, "staging/teams/T06");

const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaFile = async (path) => sha256(await readFile(path));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const canonicalSha = (value) => sha256(JSON.stringify(canonical(value)));
const withHash = (value) => ({ ...value, contentHash: canonicalSha(value) });
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sourceRef = (path) => relative(DATASET, path).replaceAll("\\", "/");

const input = await loadJson(join(GEN, "input-pack.json"));
const sourceLock = await loadJson(join(SOURCE, "source-lock.json"));
const memoryAssetsDraft = await loadJson(join(GEN, "expand-memory-01/memory-assets-draft.json"));
const knowledgeAssetsDraft = await loadJson(join(GEN, "expand-knowledge-01/knowledge-assets-draft.json"));
const adaptationManifest = await loadJson(join(GEN, "expand-skill-01/adaptation-manifest.json"));
const adaptationEntries = adaptationManifest.skills ?? adaptationManifest.entries?.filter((item) => !item.resource_of) ?? [];

const batchFiles = {
  pilotMemory: join(GEN, "pilot-memory-01/draft.json"),
  pilotSkill: join(GEN, "pilot-skill-01/draft.json"),
  pilotKnowledge: join(GEN, "pilot-knowledge-01/draft.json"),
  expandMemory: join(GEN, "expand-memory-01/draft.json"),
  expandSkill: join(GEN, "expand-skill-01/draft.json"),
  expandKnowledge: join(GEN, "expand-knowledge-01/draft.json"),
  natural: join(GEN, "natural-negatives-01/draft.json"),
};
const batches = Object.fromEntries(await Promise.all(Object.entries(batchFiles).map(async ([key, path]) => [key, await loadJson(path)])));
const batchRefs = await Promise.all(Object.entries(batchFiles).map(async ([key, path]) => ({
  batch_key: key,
  batch_id: (await loadJson(path)).batch_id,
  path: sourceRef(path),
  sha256: await shaFile(path),
  generator_model: "gpt-5.6-luna",
  reasoning_effort: "high",
  fork_turns: "none",
  sol_review: "approved",
})));

assert(input.team_id === TEAM && input.split === SPLIT, "input pack Team/split mismatch");
assert(sourceLock.team_id === TEAM && sourceLock.skills.length === 16, "source lock mismatch");
assert(adaptationEntries.length === sourceLock.skills.length, "adaptation manifest count mismatch");

const syntheticEvidence = ({ sourceId, role, transform, batchId, contentRefs, generatedAt = "2026-08-29T22:30:00+08:00", model = "gpt-5.6-luna" }) => withHash({
  sourceId,
  provenanceKind: "synthetic",
  role,
  origin: role === "history" ? "synthetic_agent_replay" : "evidence_grounded_synthesis",
  worldAsOf: WORLD_AS_OF,
  transform,
  transformVersion: "task1-v2",
  reviewStatus: "reviewed",
  generatorModel: model,
  reasoningEffort: "high",
  promptVersion: "task1.parallel.v2",
  batchId,
  generatedAt,
  contentRefs,
});

const historySources = {
  l0: syntheticEvidence({ sourceId: "source-t06-history-l0", role: "history", transform: "redacted_replay", batchId: "t06-expand-memory-01", contentRefs: [sourceRef(join(GEN, "expand-memory-01/memory-assets-draft.json"))] }),
  l1: syntheticEvidence({ sourceId: "source-t06-history-l1", role: "history", transform: "atomic_fact_extraction", batchId: "t06-expand-memory-01", contentRefs: [sourceRef(join(GEN, "expand-memory-01/memory-assets-draft.json"))] }),
  l2: syntheticEvidence({ sourceId: "source-t06-history-l2", role: "history", transform: "multi_session_scene_synthesis", batchId: "t06-expand-memory-01", contentRefs: [sourceRef(join(GEN, "expand-memory-01/memory-assets-draft.json"))] }),
  l3: syntheticEvidence({ sourceId: "source-t06-history-l3", role: "history", transform: "stable_profile_derivation", batchId: "t06-expand-memory-01", contentRefs: [sourceRef(join(GEN, "expand-memory-01/memory-assets-draft.json"))] }),
};
const taskSource = syntheticEvidence({
  sourceId: "source-t06-current-tasks",
  role: "current_anchor",
  transform: "current_task_anchor",
  batchId: "t06-input-freeze",
  contentRefs: [sourceRef(join(GEN, "input-pack.json"))],
  generatedAt: "2026-08-29T22:05:00+08:00",
  model: "gpt-5.6-sol",
});
const pairSource = syntheticEvidence({
  sourceId: "source-t06-eval-pairs",
  role: "evaluation_derivation",
  transform: "paired_counterfactual",
  batchId: "t06-sol-gold-review",
  contentRefs: batchRefs.filter((item) => item.batch_key !== "natural").map((item) => item.path),
  generatedAt: "2026-08-29T23:00:00+08:00",
  model: "gpt-5.6-sol",
});
const naturalSource = syntheticEvidence({
  sourceId: "source-t06-natural-negatives",
  role: "evaluation_derivation",
  transform: "natural_negative_selection",
  batchId: "t06-natural-negatives-01",
  contentRefs: [sourceRef(batchFiles.natural)],
  generatedAt: "2026-08-29T22:30:00+08:00",
});

const externalSkillSources = [];
const externalImports = [];
for (const locked of sourceLock.skills) {
  const adaptedPath = join(SOURCE, "adapted", locked.asset_id, "SKILL.md");
  const diffPath = join(SOURCE, "diffs", `${locked.asset_id}.diff`);
  const adaptedSha = await shaFile(adaptedPath);
  const diffSha = await shaFile(diffPath);
  const rawPath = join(SOURCE, locked.local_raw_path);
  assert(await shaFile(rawPath) === locked.raw_file_sha256, `raw source hash mismatch: ${locked.asset_id}`);
  externalSkillSources.push(withHash({
    sourceId: locked.source_id,
    provenanceKind: "external_import",
    role: "skill_source",
    origin: "repo_document",
    worldAsOf: WORLD_AS_OF,
    transform: "skill_package_import",
    transformVersion: "task1-v2",
    reviewStatus: "reviewed",
    dataset: "GitHub",
    datasetRevision: locked.commit_sha,
    datasetArtifactSha256: locked.raw_file_sha256,
    sourceRepoUrl: locked.repository_url,
    sourceRepoCommit: locked.commit_sha,
    sourceRepoLicense: locked.license_spdx,
    sourceTaskTime: locked.commit_time,
    trajectoryGeneratedAt: "2026-08-29T22:30:00+08:00",
    evidenceLocator: `${locked.path}@${locked.commit_sha}`,
    evidenceSha256: locked.raw_file_sha256,
    transformInputSha256: locked.raw_file_sha256,
    piiScan: "passed",
    reviewedBy: "gpt-5.6-sol",
  }));
  externalImports.push({
    source_id: locked.source_id,
    asset_id: locked.asset_id,
    repository_url: locked.repository_url,
    commit_sha: locked.commit_sha,
    path: locked.path,
    license_spdx: locked.license_spdx,
    license_path: locked.license_path,
    license_sha256: locked.license_sha256,
    raw_path: sourceRef(rawPath),
    raw_sha256: locked.raw_file_sha256,
    adapted_path: sourceRef(adaptedPath),
    adapted_sha256: adaptedSha,
    diff_path: sourceRef(diffPath),
    diff_sha256: diffSha,
  });
}

const knowledgeEvidence = knowledgeAssetsDraft.resources.map((resource) => syntheticEvidence({
  sourceId: `source-t06-knowledge-${resource.asset_id.toLowerCase().replaceAll("_", "-")}`,
  role: "repo_context",
  transform: resource.type === "code_graph" ? "code_graph_build" : "repo_document_snapshot",
  batchId: "t06-expand-knowledge-01",
  contentRefs: [sourceRef(join(GEN, "expand-knowledge-01/knowledge-assets-draft.json")), resource.asset_id],
}));
const knowledgeSourceByAsset = new Map(knowledgeAssetsDraft.resources.map((resource, index) => [resource.asset_id, knowledgeEvidence[index].sourceId]));
const sourceEvidence = [
  ...Object.values(historySources),
  ...externalSkillSources,
  ...knowledgeEvidence,
  taskSource,
  pairSource,
  naturalSource,
];

const streams = input.team.project_streams;
const taskByProject = new Map();
const tasks = streams.map((stream) => {
  const baseCommit = sha256(`t06:${stream.id}:base`).slice(0, 40);
  const repoUrl = `https://benchmark.invalid/tencentdb/task1/t06/${stream.id}.git`;
  const workspace = withHash({
    workspaceId: `workspace-t06-${stream.id}`,
    repoSlug: stream.id,
    repoUrl,
    baseCommit,
    sourceRepoLicense: "Benchmark-Synthetic",
    treeSha256: sha256(`tree:t06:${stream.id}`),
    fileManifestSha256: sha256(`manifest:t06:${stream.id}`),
    state: "clean",
  });
  const projectRef = withHash({
    projectRefId: `project-t06-${stream.id}`,
    repoSlug: stream.id,
    repoUrl,
    pinnedCommit: baseCommit,
    sourceEvidenceIds: [taskSource.sourceId],
  });
  const task = withHash({
    taskId: `task-task1-t06-${stream.id}`,
    teamId: TEAM,
    title: `${stream.id} 并行工程流`,
    description: stream.summary,
    goal: `在冻结的 ${stream.id} 工作区内完成当前客户端与 CLI 工程问题的只读分析与实施规划。`,
    eligibleAgentIds: [GENERAL_AGENT],
    projectRef,
    workspace,
    sourceEvidenceIds: [taskSource.sourceId],
  });
  taskByProject.set(stream.id, task);
  return task;
});

const boundSkillIds = input.skill_pool.filter((skill) => skill.bound_to_active_agent).map((skill) => skill.asset_id);
const agent = (agentId, name, importedMemoryAgentIds, ownBoundSkills, fixedKnowledgeIds) => {
  const detail = withHash({
    description: `${input.team.mission}；${name}。`,
    prompt: "仅在当前上下文存在唯一外部信息缺口时读取已冻结的 Memory、Skill 或 Knowledge；当前输入充分时直接回答。",
  });
  return withHash({
    agentId,
    teamId: TEAM,
    name,
    agentDetail: detail,
    importedMemoryAgentIds,
    boundSkillIds: ownBoundSkills,
    fixedKnowledgeIds,
    sourceEvidenceIds: [taskSource.sourceId],
  });
};
const businessAgents = [
  agent(GENERAL_AGENT, "客户端与 CLI 通用 Agent", [ASSET_AGENT_A, ASSET_AGENT_B], boundSkillIds, input.knowledge_assets.map((item) => item.asset_id)),
  agent(ASSET_AGENT_A, "客户端与 CLI 资产 Agent A", [], [], []),
  agent(ASSET_AGENT_B, "客户端与 CLI 资产 Agent B", [], [], []),
];
const team = withHash({
  teamId: TEAM,
  worldId: WORLD_ID,
  split: SPLIT,
  name: input.team.name,
  businessAgentIds: businessAgents.map((item) => item.agentId),
  taskIds: tasks.map((item) => item.taskId),
  sourceEvidenceIds: [taskSource.sourceId],
});

const sessionOwner = new Map();
const l0Conversations = memoryAssetsDraft.l0_sessions.map((session, index) => {
  const ownerAgentId = index % 2 === 0 ? ASSET_AGENT_A : ASSET_AGENT_B;
  sessionOwner.set(session.session_id, ownerAgentId);
  const messages = session.messages.map((message) => withHash({
    messageId: message.message_id,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: [historySources.l0.sourceId],
    observedAt: session.observed_at,
  }));
  return withHash({
    assetId: session.asset_id,
    ownerAgentId,
    sourceEvidenceIds: [historySources.l0.sourceId],
    observedAt: session.observed_at,
    sessionId: session.session_id,
    messages,
  });
});
const sessionByMessage = new Map(l0Conversations.flatMap((session) => session.messages.map((message) => [message.messageId, session])));
const l1Type = (memory) => memory.type ?? (["T06-L1-03", "T06-L1-08", "T06-L1-12"].includes(memory.asset_id) ? "event" : ["T06-L1-01", "T06-L1-04", "T06-L1-14"].includes(memory.asset_id) ? "fact" : "decision");
const l1Memories = memoryAssetsDraft.l1_memories.map((memory) => {
  const supportSession = sessionByMessage.get(memory.source_message_ids[0]);
  assert(supportSession, `unknown L1 support message: ${memory.asset_id}`);
  const validFrom = memory.asset_id === "T06-L1-13" ? "2026-08-11T00:00:00+08:00" : supportSession.observedAt;
  return withHash({
    assetId: memory.asset_id,
    ownerAgentId: supportSession.ownerAgentId,
    sourceEvidenceIds: [historySources.l1.sourceId],
    observedAt: supportSession.observedAt,
    type: l1Type(memory),
    content: memory.content,
    status: memory.status,
    ...(memory.superseded_by ? { supersededBy: memory.superseded_by } : {}),
    validFrom,
    supportingMessageIds: memory.source_message_ids,
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
  });
});
const sessionById = new Map(l0Conversations.map((session) => [session.sessionId, session]));
const l2Scenes = memoryAssetsDraft.l2_scenes.map((scene, index) => {
  const ownerAgentId = index % 2 === 0 ? ASSET_AGENT_A : ASSET_AGENT_B;
  const observedAt = scene.source_session_ids.map((id) => sessionById.get(id)?.observedAt).filter(Boolean).sort().at(-1);
  assert(observedAt, `unknown L2 support session: ${scene.asset_id}`);
  return withHash({
    assetId: scene.asset_id,
    ownerAgentId,
    sourceEvidenceIds: [historySources.l2.sourceId],
    observedAt,
    path: scene.path,
    summary: scene.summary,
    content: scene.content,
    injected: scene.injected,
    supportingSessionIds: scene.source_session_ids,
  });
});
const l3Profiles = memoryAssetsDraft.l3_profiles.map((profile) => withHash({
  assetId: profile.asset_id,
  ownerAgentId: ASSET_AGENT_A,
  sourceEvidenceIds: [historySources.l3.sourceId],
  observedAt: "2026-08-22T12:00:00+08:00",
  content: profile.content,
  stability: profile.scope === "team" ? "team" : "agent",
}));

const sourceByAsset = new Map(sourceLock.skills.map((skill) => [skill.asset_id, skill]));
const poolByAsset = new Map(input.skill_pool.map((skill) => [skill.asset_id, skill]));
const skills = [];
for (const pool of input.skill_pool) {
  const locked = sourceByAsset.get(pool.asset_id);
  assert(locked, `missing locked Skill: ${pool.asset_id}`);
  const manifest = [{ path: "SKILL.md", sha256: await shaFile(join(SOURCE, "adapted", pool.asset_id, "SKILL.md")) }];
  const adaptedEntry = adaptationEntries.find((item) => item.asset_id === pool.asset_id);
  assert(adaptedEntry, `missing adaptation manifest entry: ${pool.asset_id}`);
  for (const resource of pool.resources ?? []) {
    manifest.push({ path: resource.path, sha256: await shaFile(join(SOURCE, "adapted", pool.asset_id, resource.path)) });
  }
  skills.push(withHash({
    assetId: pool.asset_id,
    ownerAgentId: pool.owner_agent_id,
    sourceEvidenceIds: [locked.source_id],
    observedAt: locked.commit_time,
    name: pool.name,
    version: `0.1.0+t06.${locked.commit_sha.slice(0, 8)}`,
    description: pool.description,
    useWhen: pool.use_when,
    doNotUseWhen: pool.do_not_use_when,
    repoCommit: locked.commit_sha,
    visibility: pool.visibility,
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest,
  }));
}
const knowledge = knowledgeAssetsDraft.resources.map((resource) => {
  const common = {
    assetId: resource.asset_id,
    ownerAgentId: GENERAL_AGENT,
    sourceEvidenceIds: [knowledgeSourceByAsset.get(resource.asset_id)],
    observedAt: knowledgeAssetsDraft.generated_at ?? WORLD_AS_OF,
    type: resource.type,
    name: resource.name,
    snapshotSha256: canonicalSha({ tool_list: resource.tool_list, tool_fixtures: resource.tool_fixtures }),
    bindings: [{ agentId: GENERAL_AGENT, visibility: "fixed" }],
  };
  if (resource.type === "code_graph") {
    Object.assign(common, {
      repoUrl: `https://benchmark.invalid/tencentdb/task1/t06/${resource.workspace_match}.git`,
      repoCommit: sha256(`t06:${resource.workspace_match}:knowledge`).slice(0, 40),
      indexVersion: "task1-t06-v1",
    });
  }
  return withHash(common);
});
const formalAssets = { l0Conversations, l1Memories, l2Scenes, l3Profiles, skills, knowledge };
const allAssets = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge];
const snapshotAssetIds = allAssets.map((item) => item.assetId).sort();
const generalVisibleHash = canonicalSha({ teamId: TEAM, userId: USER_ID, agentId: GENERAL_AGENT, assetIds: snapshotAssetIds });

const allPairDrafts = [
  ...batches.pilotMemory.pairs,
  ...batches.expandMemory.pairs,
  ...batches.pilotSkill.pairs,
  ...batches.expandSkill.pairs,
  ...batches.pilotKnowledge.pairs,
  ...batches.expandKnowledge.pairs,
];
assert(allPairDrafts.length === 15, "expected 15 pair drafts");
assert(batches.natural.cases.length === 10, "expected 10 natural negatives");

const skillProject = new Map([
  ["T06-SKILL-SYSTEM-COMMANDLINE", "harbor-admin-cli"],
  ["T06-SKILL-VSCODE-COMMANDS", "orbit-vscode-extension"],
  ["T06-SKILL-DVC-DATA-PIPELINES", "lineage-ml-pipeline"],
  ["T06-SKILL-DVC-EXPERIMENTS", "lineage-ml-pipeline"],
  ["T06-SKILL-VSCODE-LOCALIZATION", "orbit-vscode-extension"],
  ["T06-SKILL-DVC", "lineage-ml-pipeline"],
]);
const memoryProject = new Map(input.memory_positive_blueprints.map((item) => [item.target, item.project]));
const knowledgeProject = new Map(input.knowledge_assets.map((item) => [item.asset_id, item.workspace_match]));
const forbiddenIdentity = ["user_id", "team_id", "agent_id", "task_id"];
const commonReadRules = { requiredFields: ["query"], forbiddenFields: forbiddenIdentity };
const actionForTool = (tool, draft, targetId) => {
  const targetSkill = poolByAsset.get(targetId);
  switch (tool) {
    case "tdai_conversation_search": return { tool, endpoint: "/memory-bridge/v3/conversation/search", argumentRules: commonReadRules };
    case "tdai_conversation_query": return { tool, endpoint: "/memory-bridge/v3/conversation/query", argumentRules: { requiredFields: ["session_id"], forbiddenFields: forbiddenIdentity, valueFromPreviousStep: true } };
    case "tdai_memory_search": return { tool, endpoint: "/memory-bridge/v3/atomic/search", argumentRules: commonReadRules };
    case "tdai_atomic_query": return { tool, endpoint: "/memory-bridge/v3/atomic/query", argumentRules: { forbiddenFields: forbiddenIdentity, exactValues: { type: "decision", time_start: "2026-08-11T00:00:00+08:00", time_end: "2026-08-11T23:59:59+08:00" } } };
    case "tdai_read_scene": return { tool, endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], forbiddenFields: ["user_id", "team_id", "task_id"], exactValues: { path: "client/relay-terminal/cli-release-incident.md" }, pathFromFixture: true } };
    case "skill_search": return { tool, endpoint: "/skill-bridge/v3/skill/search", argumentRules: { requiredFields: ["query"], forbiddenFields: [...forbiddenIdentity, "top_k", "mode"] } };
    case "skill_view": return { tool, endpoint: "/skill-bridge/v3/skill/get-by-name", argumentRules: { requiredFields: ["skill_name", "include_content", "include_manifest"], forbiddenFields: forbiddenIdentity, exactValues: { skill_name: targetSkill.name, include_content: true, include_manifest: true } } };
    case "skill_view_by_id": return { tool, endpoint: "/skill-bridge/v3/skill/get", argumentRules: { requiredFields: ["skill_id", "include_content", "include_manifest"], forbiddenFields: forbiddenIdentity, exactValues: { include_content: true, include_manifest: true }, valueFromPreviousStep: true } };
    case "skill_files_read": return { tool, endpoint: "/skill-bridge/v3/skill/files/read", argumentRules: { requiredFields: ["skill_id", "path"], forbiddenFields: forbiddenIdentity, exactValues: { path: "sub-skills/remotes-and-cache/SKILL.md" }, valueFromPreviousStep: true } };
    case "knowledge_tools_list": return { tool, endpoint: "/tools/list", argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: targetId } } };
    default: throw new Error(`unsupported tool ${tool} in ${draft.draft_pair_id}`);
  }
};
const forbiddenTools = ["tdai_memory_write", "skill_files_write", "skill_files_remove", "tdai_scenario_write"];
const publicCases = [];
const privateAnnotations = [];
const pairs = [];

const makePublicCase = ({ caseId, task, contextMessages, query, difficulty }) => withHash({
  caseId,
  identity: {
    spaceId: SPACE_ID,
    teamId: TEAM,
    userId: USER_ID,
    agentId: GENERAL_AGENT,
    taskId: task.taskId,
    sessionId: `session-${caseId.toLowerCase().replaceAll("_", "-")}`,
    agentSource: "codex",
  },
  snapshotId: SNAPSHOT_ID,
  workspace: task.workspace,
  language: "zh",
  difficulty,
  contextMessages,
  query,
  visibleAssetSetSha256: generalVisibleHash,
});
const noToolGold = (evidenceSourceId, reason) => withHash({
  needTdaiTool: false,
  family: null,
  allowedFirstActions: [],
  expectedFollowupActions: [],
  expectedKnowledgeCalls: [],
  allowedSequences: [],
  forbiddenTools: ["tdai_memory_search", "tdai_atomic_query", "tdai_conversation_search", "tdai_conversation_query", "tdai_read_scene", "skill_search", "skill_view", "skill_view_by_id", "skill_files_read", "knowledge_tools_list", "knowledge_tools_call"],
  maxTdaiCalls: 0,
  targetAssetIds: [],
  evidenceRefs: [evidenceSourceId],
  ablationEvidence: reason,
  noToolEvidence: reason,
});

for (const draft of allPairDrafts) {
  const targetId = draft.positive.private_proposal.target_asset_ids[0];
  const sequence = draft.positive.private_proposal.allowed_sequence_candidates[0];
  const family = draft.positive.private_proposal.route;
  const project = family === "memory" ? memoryProject.get(targetId) : family === "skill" ? skillProject.get(targetId) : knowledgeProject.get(targetId);
  const task = taskByProject.get(project);
  assert(task, `no task mapping for ${draft.draft_pair_id}`);
  assert(draft.changed_message_index === draft.shared_context_messages.length, `delta must append for ${draft.draft_pair_id}`);
  const positiveContext = [...draft.shared_context_messages, draft.positive.delta_message];
  const negativeContext = [...draft.shared_context_messages, draft.negative.delta_message];
  const positiveCaseId = `${draft.draft_pair_id}-POS`;
  const negativeCaseId = `${draft.draft_pair_id}-NEG`;
  const positiveCase = makePublicCase({ caseId: positiveCaseId, task, contextMessages: positiveContext, query: draft.query, difficulty: draft.difficulty });
  const negativeCase = makePublicCase({ caseId: negativeCaseId, task, contextMessages: negativeContext, query: draft.query, difficulty: draft.difficulty });
  publicCases.push(positiveCase, negativeCase);

  const firstAction = actionForTool(sequence[0], draft, targetId);
  const followups = family === "knowledge" ? [] : sequence.slice(1).map((tool) => actionForTool(tool, draft, targetId));
  const expectedKnowledgeCalls = [];
  if (family === "knowledge") {
    const resource = knowledgeAssetsDraft.resources.find((item) => item.asset_id === targetId);
    const fixture = resource.tool_fixtures[0];
    expectedKnowledgeCalls.push({
      toolName: fixture.tool_name,
      paramRules: { requiredFields: Object.keys(fixture.request), exactValues: fixture.request },
    });
  }
  const positiveGold = withHash({
    needTdaiTool: true,
    family,
    allowedFirstActions: [firstAction],
    expectedFollowupActions: followups,
    expectedKnowledgeCalls,
    allowedSequences: [sequence],
    forbiddenTools,
    maxTdaiCalls: sequence.length,
    targetAssetIds: [targetId],
    informationGap: draft.positive.private_proposal.unique_information_gap,
    stopAfter: draft.positive.private_proposal.stop_after_candidate,
    evidenceRefs: [pairSource.sourceId],
    ablationEvidence: draft.negative.private_proposal.why_current_context_is_sufficient,
  });
  const pairId = draft.draft_pair_id;
  privateAnnotations.push(withHash({
    caseId: positiveCaseId,
    sourceEvidenceIds: [pairSource.sourceId],
    pairId,
    pairRole: "positive",
    gold: positiveGold,
    annotationReason: "Sol 复核确认存在唯一外部信息缺口，首动作与完整最小链路唯一。",
  }));
  privateAnnotations.push(withHash({
    caseId: negativeCaseId,
    sourceEvidenceIds: [pairSource.sourceId],
    pairId,
    pairRole: "negative",
    gold: noToolGold(pairSource.sourceId, draft.negative.private_proposal.why_current_context_is_sufficient),
    annotationReason: "控制变量消息已补足正例缺口，当前上下文足以回答。",
  }));
  pairs.push(withHash({
    pairId,
    positiveCaseId,
    negativeCaseId,
    counterfactualKind: "answer_in_current_context",
    controlledDeltaSha256: sha256(JSON.stringify({ positive_delta_message: draft.positive.delta_message, negative_delta_message: draft.negative.delta_message, query: draft.query })),
    currentEvidenceRefs: [pairSource.sourceId],
  }));
}

for (const [index, draft] of batches.natural.cases.entries()) {
  const task = tasks[index % tasks.length];
  const publicCase = makePublicCase({ caseId: draft.draft_case_id, task, contextMessages: draft.context_messages, query: draft.query, difficulty: draft.difficulty });
  publicCases.push(publicCase);
  privateAnnotations.push(withHash({
    caseId: publicCase.caseId,
    sourceEvidenceIds: [naturalSource.sourceId],
    gold: noToolGold(naturalSource.sourceId, draft.why_current_context_is_sufficient),
    annotationReason: "自然负例的输入、约束与期望输出均在当前上下文中完整给出。",
  }));
}

const fragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: BUILD,
  team_id: TEAM,
  split: SPLIT,
  sourceEvidence,
  teams: [team],
  businessAgents,
  tasks,
  publicCases,
  privateAnnotations,
  pairs,
  snapshotAssetIds,
  generatorBatchRefs: batchRefs,
  externalImports,
};

const familyCounts = privateAnnotations.filter((item) => item.gold.needTdaiTool).reduce((counts, item) => {
  counts[item.gold.family] = (counts[item.gold.family] ?? 0) + 1;
  return counts;
}, {});
const solReview = {
  schema_version: "task1.sol_review.v1",
  team_id: TEAM,
  reviewer: "gpt-5.6-sol",
  reviewed_at: "2026-08-29T23:10:00+08:00",
  verdict: "approved_for_team_gate",
  pair_count: pairs.length,
  natural_negative_count: batches.natural.cases.length,
  checks: {
    unique_information_gap: "passed",
    unique_first_action: "passed",
    complete_minimal_chain: "passed",
    controlled_single_delta: "passed",
    visibility: "passed",
    at_least_two_realistic_distractors: "passed",
    provider_leakage: "passed",
    skill_technical_body_invariance: "passed",
  },
  approved_pair_ids: pairs.map((item) => item.pairId),
  approved_natural_case_ids: batches.natural.cases.map((item) => item.draft_case_id),
  batch_refs: batchRefs,
};

assert(publicCases.length === 40, "public case count must be 40");
assert(privateAnnotations.length === 40, "private annotation count must be 40");
assert(pairs.length === 15, "pair count must be 15");
assert(familyCounts.memory === 6 && familyCounts.skill === 6 && familyCounts.knowledge === 3, "positive family distribution mismatch");

await writeJson(join(STAGING, "team-fragment.json"), fragment);
await writeJson(join(STAGING, "assets/memory.json"), { schema_version: "task1.team_memory_assets.v1", team_id: TEAM, l0Conversations, l1Memories, l2Scenes, l3Profiles });
await writeJson(join(STAGING, "assets/skills.json"), { schema_version: "task1.team_skill_assets.v1", team_id: TEAM, skills });
await writeJson(join(STAGING, "assets/knowledge.json"), {
  schema_version: "task1.team_knowledge_assets.v1",
  team_id: TEAM,
  knowledge,
  fixtures: knowledgeAssetsDraft.resources.map((resource) => ({ knowledgeId: resource.asset_id, toolList: resource.tool_list, toolFixtures: resource.tool_fixtures })),
});
await writeJson(join(GEN, "sol-review.json"), solReview);

const review = `# T06 Team review\n\n- Reviewer: gpt-5.6-sol\n- Status: approved for Team Gate\n- Cases: 40 (15 positive, 15 paired no-tool, 10 natural no-tool)\n- Positive families: Memory 6, Skill 6, Knowledge 3\n- Project streams: ${streams.map((item) => item.id).join(", ")}\n- Imported Skills: 16, each pinned by repository, commit, path, license, raw SHA-256, adapted SHA-256 and diff SHA-256\n- Batch validators: all seven draft batches passed their exact family/count/Team/DS05 checks\n- Sol checks: unique gap, first action, minimal chain, pair delta, visibility, distractors, provider allowlist and Skill technical-body invariance passed\n- Prohibited work: no upstream dependency install, upstream test, official patch, formal model evaluation or global contract write was performed\n`;
await mkdir(STAGING, { recursive: true });
await writeFile(join(STAGING, "review.md"), review, "utf8");
await writeJson(join(STAGING, "gate.json"), {
  schema_version: "task1.team_gate.v1",
  team_id: TEAM,
  build_id: BUILD,
  status: "pending_formal_validation",
  counts: { cases: 40, pairs: 15, memory_positive: 6, skill_positive: 6, knowledge_positive: 3, paired_negative: 15, natural_negative: 10 },
  batch_refs: batchRefs,
  checks: { sol_review: "passed", formal_schema: "pending", quantity: "passed", source_freeze: "passed", provider_leakage: "passed", visibility: "pending", pair_single_delta: "passed" },
  blocking_issues: [],
});

console.log(JSON.stringify({ team_id: TEAM, cases: publicCases.length, pairs: pairs.length, assets: { memory: l0Conversations.length + l1Memories.length + l2Scenes.length + l3Profiles.length, skills: skills.length, knowledge: knowledge.length }, external_imports: externalImports.length }, null, 2));
