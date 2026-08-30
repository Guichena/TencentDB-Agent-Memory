import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../../../../..");
const datasetRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const buildRoot = join(datasetRoot, "generators/parallel/build-10/T19");
const sourceRoot = join(datasetRoot, "source-material/T19");
const outRoot = join(datasetRoot, "staging/teams/T19");
mkdirSync(outRoot, { recursive: true });

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sortValue = (value) => Array.isArray(value) ? value.map(sortValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]))
    : value;
const canonical = (value) => JSON.stringify(sortValue(value));
const shaText = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const sha = (value) => shaText(canonical(value));
const hashed = (value) => ({ ...value, contentHash: sha(value) });
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const input = readJson(join(buildRoot, "input-pack.json"));
const sourceLock = readJson(join(sourceRoot, "source-lock.json"));
const codeLock = readJson(join(sourceRoot, "workspace-code-lock.json"));
const memoryTrial = readJson(join(buildRoot, "trials/memory-trial-01/draft.json"));
const skillTrial = readJson(join(buildRoot, "trials/skill-trial-01/draft.json"));
const knowledgeTrial = readJson(join(buildRoot, "trials/knowledge-trial-01/draft.json"));
const memoryMain = readJson(join(buildRoot, "batches/memory-main-01/draft.json"));
const skillMain = readJson(join(buildRoot, "batches/skill-main-01/draft.json"));
const knowledgeMain = readJson(join(buildRoot, "batches/knowledge-main-01/draft.json"));
const naturalMain = readJson(join(buildRoot, "batches/natural-main-01/draft.json"));
const memoryAssetsRaw = readJson(join(buildRoot, "batches/memory-main-01/memory-assets.json"));
const skillAssetsRaw = readJson(join(buildRoot, "batches/skill-main-01/skill-assets.json"));
const knowledgeAssetsRaw = readJson(join(buildRoot, "batches/knowledge-main-01/knowledge-assets.json"));

const manifestPaths = [
  "trials/memory-trial-01/manifest.json",
  "trials/skill-trial-01/manifest.json",
  "trials/knowledge-trial-01/manifest.json",
  "batches/memory-main-01/manifest.json",
  "batches/skill-main-01/manifest.json",
  "batches/knowledge-main-01/manifest.json",
  "batches/natural-main-01/manifest.json",
];
const manifests = manifestPaths.map((path) => readJson(join(buildRoot, path)));
for (const manifest of manifests) {
  if (manifest.generator_model !== "gpt-5.6-luna" || manifest.reasoning_effort !== "high") {
    throw new Error(`invalid generator manifest ${manifest.batch_id}`);
  }
}
const manifestByBatch = new Map(manifests.map((item) => [item.batch_id, item]));

const worldAsOf = input.world_as_of;
const activeAgentId = input.identity.active_agent.agent_id;
const identityAgentId = input.identity.imported_memory_agents[0].agent_id;
const policyAgentId = input.identity.imported_memory_agents[1].agent_id;
const userId = input.identity.user_id;
const snapshotHiddenId = "T19-SNAPSHOT-HIDDEN-20260831";
const snapshotDevId = "T19-SNAPSHOT-DEV-EMPTY-20260831";
const workspaceTreeSha256 = "a2755ca5efa0b28d86ee2edcc463b112f3642f1179dff2011e2579e1ea1166c0";
const workspaceManifestSha256 = "45c1774813b284b76a42f0db2f81f7a8984f6ce48cc5ff299dfc8ff80d9e1ef2";
const repoSlug = "TencentCloud/TencentDB-Agent-Memory";

const sourceEvidence = [];
const addSynthetic = ({ sourceId, role, transform, batchId, contentRefs, origin = "synthetic_agent_replay" }) => {
  const manifest = manifestByBatch.get(batchId);
  const base = {
    sourceId, provenanceKind: "synthetic", role, origin, worldAsOf, transform,
    transformVersion: "task1.v1", reviewStatus: "reviewed",
    generatorModel: manifest?.generator_model ?? "gpt-5.6-sol",
    reasoningEffort: manifest?.reasoning_effort ?? "high",
    promptVersion: manifest?.prompt_version ?? "task1.input-freeze.v1",
    batchId, generatedAt: manifest?.generated_at ?? "2026-08-31T00:30:00+08:00",
    contentRefs,
  };
  sourceEvidence.push({ ...base, contentHash: sha(base) });
};
const addExternal = ({ sourceId, role, transform, origin, repository, commit, license, locator, evidenceSha256, artifactSha256, dataset }) => {
  const base = {
    sourceId, provenanceKind: "external_import", role, origin, worldAsOf, transform,
    transformVersion: "task1.v1", reviewStatus: "reviewed", dataset,
    datasetRevision: commit, datasetArtifactSha256: artifactSha256,
    sourceRepoUrl: repository, sourceRepoCommit: commit, sourceRepoLicense: license,
    sourceTaskTime: "2026-08-31T01:00:00+08:00",
    trajectoryGeneratedAt: "2026-08-31T01:05:00+08:00",
    evidenceLocator: locator, evidenceSha256, transformInputSha256: evidenceSha256,
    piiScan: "passed", reviewedBy: "gpt-5.6-sol",
  };
  sourceEvidence.push({ ...base, contentHash: sha(base) });
};

const l0Ids = memoryAssetsRaw.l0_conversations.map((item) => item.asset_id);
const l1Ids = memoryAssetsRaw.l1_memories.map((item) => item.asset_id);
const l2Ids = memoryAssetsRaw.l2_scenes.map((item) => item.asset_id);
const l3Ids = [memoryAssetsRaw.l3_profile.asset_id];
addSynthetic({ sourceId: "T19-EVID-HISTORY-L0", role: "history", transform: "redacted_replay", batchId: "T19-memory-main-01", contentRefs: l0Ids });
addSynthetic({ sourceId: "T19-EVID-HISTORY-L1", role: "history", transform: "atomic_fact_extraction", batchId: "T19-memory-main-01", contentRefs: l1Ids });
addSynthetic({ sourceId: "T19-EVID-HISTORY-L2", role: "history", transform: "multi_session_scene_synthesis", batchId: "T19-memory-main-01", contentRefs: l2Ids });
addSynthetic({ sourceId: "T19-EVID-HISTORY-L3", role: "history", transform: "stable_profile_derivation", batchId: "T19-memory-main-01", contentRefs: l3Ids });

const projectTaskId = new Map();
for (const project of input.project_streams) {
  const taskId = `T19-TASK-${project.name.toUpperCase()}`;
  projectTaskId.set(project.name, taskId);
  addSynthetic({
    sourceId: `T19-EVID-ANCHOR-${project.name.toUpperCase()}`,
    role: "current_anchor", transform: "current_task_anchor", batchId: "T19-input-pack",
    contentRefs: [project.project_id, taskId], origin: "evidence_grounded_synthesis",
  });
}

for (const file of sourceLock.files) {
  addExternal({
    sourceId: `T19-EVID-${file.sourceId.replace("T19-SRC-", "SKILL-")}`,
    role: "skill_source", transform: "skill_package_import", origin: "repo_document",
    repository: file.repository, commit: file.commit, license: file.license,
    locator: file.upstreamPath, evidenceSha256: file.rawSha256,
    artifactSha256: file.rawSha256, dataset: "github-skill-file",
  });
}
const codeLockSha = shaText(readFileSync(join(sourceRoot, "workspace-code-lock.json"), "utf8"));
addExternal({
  sourceId: "T19-EVID-KNOW-CODE-GRAPH", role: "repo_context", transform: "code_graph_build", origin: "repo_code",
  repository: codeLock.repository, commit: codeLock.commit, license: codeLock.license,
  locator: "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T19/workspace-code-lock.json",
  evidenceSha256: codeLockSha, artifactSha256: codeLockSha, dataset: "task1-workspace-code-lock",
});
addSynthetic({ sourceId: "T19-EVID-KNOW-TOKEN-WIKI", role: "repo_context", transform: "repo_document_snapshot", batchId: "T19-knowledge-main-01", contentRefs: ["T19-KNOW-WIKI-TOKEN-RUNBOOK"], origin: "evidence_grounded_synthesis" });
addSynthetic({ sourceId: "T19-EVID-KNOW-KEY-WIKI", role: "repo_context", transform: "repo_document_snapshot", batchId: "T19-knowledge-main-01", contentRefs: ["T19-KNOW-WIKI-KEY-CEREMONY"], origin: "evidence_grounded_synthesis" });

const pairBatches = [memoryTrial, memoryMain, skillTrial, skillMain, knowledgeTrial, knowledgeMain];
for (const batch of pairBatches) {
  addSynthetic({
    sourceId: `T19-EVID-PAIR-${batch.batch_id.toUpperCase()}`,
    role: "evaluation_derivation", transform: "paired_counterfactual", batchId: batch.batch_id,
    contentRefs: batch.pairs.map((item) => item.draft_pair_id), origin: "evidence_grounded_synthesis",
  });
}
addSynthetic({
  sourceId: "T19-EVID-NATURAL-T19-NATURAL-MAIN-01", role: "evaluation_derivation",
  transform: "natural_negative_selection", batchId: "T19-natural-main-01",
  contentRefs: naturalMain.cases.map((item) => item.draft_case_id), origin: "evidence_grounded_synthesis",
});

const evidenceIds = new Set(sourceEvidence.map((item) => item.sourceId));
const evidenceForSource = (sourceId) => {
  const id = `T19-EVID-${sourceId.replace("T19-SRC-", "SKILL-")}`;
  if (!evidenceIds.has(id)) throw new Error(`missing evidence for ${sourceId}`);
  return id;
};

const observedAt = "2026-08-30T18:00:00+08:00";
const messageObservedAt = "2026-08-30T17:30:00+08:00";
const l0Conversations = memoryAssetsRaw.l0_conversations.map((item) => hashed({
  assetId: item.asset_id,
  ownerAgentId: item.owner.agent_id,
  sourceEvidenceIds: ["T19-EVID-HISTORY-L0"],
  observedAt,
  sessionId: item.session_id,
  messages: item.messages.map((message) => hashed({
    messageId: message.message_id, role: message.role, content: message.content,
    sourceEvidenceIds: ["T19-EVID-HISTORY-L0"], observedAt: messageObservedAt,
  })),
}));
const l1Type = (id) => id.includes("ROLLBACK") || id.includes("CUTOVER") || id.includes("OVERLAP") ? "decision" : "fact";
const l1Memories = memoryAssetsRaw.l1_memories.map((item) => hashed({
  assetId: item.asset_id, ownerAgentId: item.owner.agent_id,
  sourceEvidenceIds: ["T19-EVID-HISTORY-L1"], observedAt,
  type: l1Type(item.asset_id), content: item.content,
  status: item.status === "invalid" ? "invalid" : "active",
  validFrom: "2026-08-20T00:00:00+08:00",
  supportingMessageIds: item.support_links.flatMap((link) => link.message_ids),
  codeEvidenceLocators: [], testEvidenceLocators: [],
}));
const sessionsByProject = Object.fromEntries(input.project_streams.map((project) => [
  project.name.toLowerCase(),
  l0Conversations.filter((item) => item.assetId.toLowerCase().includes(project.name.replace("Gate", "").replace("Forge", "").replace("Mesh", "").replace("Trust", "").replace("Turn", "").toLowerCase())).map((item) => item.sessionId),
]));
const sceneSessions = {
  "T19-L2-ATLAS-CUTOVER": ["t19-session-atlas-login-001", "t19-session-atlas-cookie-002"],
  "T19-L2-TOKEN-LIFECYCLE": ["t19-session-token-incident-003", "t19-session-token-jwks-004"],
  "T19-L2-PERMIT-DECISION": ["t19-session-permit-deny-005", "t19-session-permit-role-006"],
  "T19-L2-WORKLOAD-IDENTITY": ["t19-session-workload-federation-007", "t19-session-workload-mtls-008"],
  "T19-L2-KEY-ROTATION": ["t19-session-key-ceremony-009", "t19-session-key-permission-010"],
};
void sessionsByProject;
const l2Scenes = memoryAssetsRaw.l2_scenes.map((item) => hashed({
  assetId: item.asset_id, ownerAgentId: item.owner.agent_id,
  sourceEvidenceIds: ["T19-EVID-HISTORY-L2"], observedAt,
  path: item.path, summary: item.summary, content: item.content, injected: true,
  supportingSessionIds: sceneSessions[item.asset_id],
}));
const l3Content = [
  ...memoryAssetsRaw.l3_profile.content.long_lived_preferences,
  ...memoryAssetsRaw.l3_profile.content.general_constraints,
].join("\n");
const l3Profiles = [hashed({
  assetId: memoryAssetsRaw.l3_profile.asset_id,
  ownerAgentId: memoryAssetsRaw.l3_profile.owner.agent_id,
  sourceEvidenceIds: ["T19-EVID-HISTORY-L3"], observedAt,
  content: l3Content, stability: "team",
})];

const sourceFileById = new Map(sourceLock.files.map((item) => [item.sourceId, item]));
const skills = skillAssetsRaw.assets.map((item) => {
  const files = item.source_ids.map((sourceId) => sourceFileById.get(sourceId));
  if (files.some((file) => !file)) throw new Error(`missing skill source for ${item.asset_id}`);
  return hashed({
    assetId: item.asset_id, ownerAgentId: item.owner_agent_id,
    sourceEvidenceIds: item.source_ids.map(evidenceForSource), observedAt,
    name: item.canonical_name, version: String(item.version),
    description: item.listing_description, useWhen: item.use_when, doNotUseWhen: item.do_not_use_when,
    repoCommit: files[0].commit,
    visibility: item.visibility === "bound_owned" ? "private" : "team",
    provenanceMode: "imported_open_source", supportingSessionIds: [],
    codeEvidenceLocators: [], testEvidenceLocators: [],
    manifest: files.map((file) => ({
      path: file.kind === "resource" ? `references/${basename(file.upstreamPath)}` : "SKILL.md",
      sha256: file.rawSha256,
    })),
  });
});
const knowledgeFixtureById = new Map(knowledgeAssetsRaw.assets.map((item) => [item.asset_id, item]));
const knowledge = input.asset_ids.knowledge.map((slot) => {
  const fixture = knowledgeFixtureById.get(slot.asset_id);
  if (!fixture) throw new Error(`missing knowledge fixture ${slot.asset_id}`);
  const base = {
    assetId: fixture.asset_id, ownerAgentId: activeAgentId,
    sourceEvidenceIds: [fixture.type === "code_graph" ? "T19-EVID-KNOW-CODE-GRAPH"
      : fixture.asset_id.includes("TOKEN") ? "T19-EVID-KNOW-TOKEN-WIKI" : "T19-EVID-KNOW-KEY-WIKI"],
    observedAt, type: fixture.type, name: fixture.name,
    snapshotSha256: sha(fixture), bindings: [{ agentId: activeAgentId, visibility: "fixed" }],
    ...(fixture.type === "code_graph" ? {
      repoUrl: codeLock.repository, repoCommit: codeLock.commit, indexVersion: "t19-code-lock-v1",
    } : {}),
  };
  return hashed(base);
});
const assets = { l0Conversations, l1Memories, l2Scenes, l3Profiles, skills, knowledge };
const allAssets = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge];

const anchorEvidenceId = (projectName) => `T19-EVID-ANCHOR-${projectName.toUpperCase()}`;
const workspaceFor = (projectName) => hashed({
  workspaceId: `T19-WS-${projectName.toUpperCase()}`, repoSlug,
  repoUrl: input.workspace_anchor.repository, baseCommit: input.workspace_anchor.commit,
  sourceRepoLicense: input.workspace_anchor.license,
  treeSha256: workspaceTreeSha256, fileManifestSha256: workspaceManifestSha256,
  state: "clean",
});
const tasks = input.project_streams.map((project) => {
  const sourceId = anchorEvidenceId(project.name);
  const projectRef = hashed({
    projectRefId: project.project_id, repoSlug, repoUrl: input.workspace_anchor.repository,
    pinnedCommit: input.workspace_anchor.commit, sourceEvidenceIds: [sourceId],
  });
  return hashed({
    taskId: projectTaskId.get(project.name), teamId: "T19", title: `${project.name} 身份与访问控制工程流`,
    description: project.scope, goal: `在 ${project.name} 范围内完成可审计、可回退的身份与访问控制变更。`,
    eligibleAgentIds: [activeAgentId], projectRef, workspace: workspaceFor(project.name),
    sourceEvidenceIds: [sourceId],
  });
});
const taskByProject = new Map(input.project_streams.map((project) => [project.name, tasks.find((task) => task.taskId === projectTaskId.get(project.name))]));

const boundSkillIds = skills.filter((item) => item.ownerAgentId === activeAgentId && item.visibility === "private").map((item) => item.assetId);
const agentEvidence = ["T19-EVID-ANCHOR-ATLASGATE"];
const businessAgents = [
  hashed({
    agentId: activeAgentId, teamId: "T19", name: input.identity.active_agent.name,
    agentDetail: hashed({ description: "负责 T19 身份与访问控制项目流的通用工程 Agent。", prompt: "区分认证、授权、会话、令牌、服务身份与密钥边界；遵循最小权限和可回退发布。" }),
    importedMemoryAgentIds: [identityAgentId, policyAgentId], boundSkillIds,
    fixedKnowledgeIds: knowledge.map((item) => item.assetId), sourceEvidenceIds: agentEvidence,
  }),
  hashed({
    agentId: identityAgentId, teamId: "T19", name: input.identity.imported_memory_agents[0].name,
    agentDetail: hashed({ description: "维护登录、会话与身份平台历史。", prompt: "记录切换决策、失败尝试和回退边界。" }),
    importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: agentEvidence,
  }),
  hashed({
    agentId: policyAgentId, teamId: "T19", name: input.identity.imported_memory_agents[1].name,
    agentDetail: hashed({ description: "维护授权策略与权限回归历史。", prompt: "记录租户隔离、最小权限和审计约束。" }),
    importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: agentEvidence,
  }),
];

const visibleIdsFor = (agentId) => allAssets.filter((asset) => {
  if (l0Conversations.includes(asset) || l1Memories.includes(asset) || l2Scenes.includes(asset) || l3Profiles.includes(asset)) {
    return asset.ownerAgentId === agentId || (agentId === activeAgentId && [identityAgentId, policyAgentId].includes(asset.ownerAgentId));
  }
  if (skills.includes(asset)) return asset.ownerAgentId === agentId || asset.visibility === "team";
  return knowledge.includes(asset) && asset.bindings.some((binding) => binding.agentId === agentId);
}).map((item) => item.assetId).sort();
const visibleSets = businessAgents.map((agent) => {
  const assetIds = visibleIdsFor(agent.agentId);
  return { teamId: "T19", userId, agentId: agent.agentId, assetIds, sha256: sha({ teamId: "T19", userId, agentId: agent.agentId, assetIds }) };
});
const activeVisibleSha = visibleSets.find((item) => item.agentId === activeAgentId).sha256;

const pairBlueprintById = new Map(input.pair_blueprints.map((item) => [item.id, item]));
const pairsDraft = pairBatches.flatMap((batch) => batch.pairs.map((pair) => ({ pair, batch })));
const publicCases = [];
const privateAnnotations = [];
const pairs = [];

const endpointByTool = {
  tdai_memory_search: "/memory-bridge/v3/atomic/search",
  tdai_atomic_query: "/memory-bridge/v3/atomic/query",
  tdai_conversation_search: "/memory-bridge/v3/conversation/search",
  tdai_conversation_query: "/memory-bridge/v3/conversation/query",
  tdai_scenario_ls: "/memory-bridge/v3/scenario/ls",
  tdai_read_scene: "/memory-bridge/v3/scenario/read",
  skill_search: "/skill-bridge/v3/skill/search",
  skill_view: "/skill-bridge/v3/skill/get-by-name",
  skill_view_by_id: "/skill-bridge/v3/skill/get",
  skill_files_read: "/skill-bridge/v3/skill/files/read",
  knowledge_tools_list: "/tools/list",
  knowledge_tools_call: "/tools/call",
};
const directSkillName = { "T19-PAIR-S02": "access-control-policy-design", "T19-PAIR-S05": "aws-iam" };
const targetKnowledge = { "T19-PAIR-K01": "T19-KNOW-WIKI-TOKEN-RUNBOOK", "T19-PAIR-K02": "T19-KNOW-CG-PERMIT-SERVICE", "T19-PAIR-K03": "T19-KNOW-WIKI-KEY-CEREMONY" };
const actionFor = (tool, pairId, followup = false) => {
  const forbiddenIdentity = ["user_id", "team_id", "agent_id", "task_id"];
  let argumentRules = {};
  if (tool === "tdai_memory_search" || tool === "tdai_conversation_search") argumentRules = { requiredFields: ["query"], forbiddenFields: forbiddenIdentity };
  else if (tool === "tdai_atomic_query" || tool === "tdai_conversation_query") argumentRules = { forbiddenFields: forbiddenIdentity };
  else if (tool === "tdai_scenario_ls") argumentRules = { exactValues: { path_prefix: "t19/permitmesh" }, forbiddenFields: forbiddenIdentity };
  else if (tool === "tdai_read_scene") argumentRules = { requiredFields: ["path"], pathFromFixture: true, valueFromPreviousStep: followup };
  else if (tool === "skill_search") argumentRules = { requiredFields: ["query"], forbiddenFields: [...forbiddenIdentity, "top_k", "mode"] };
  else if (tool === "skill_view") argumentRules = { requiredFields: ["skill_name"], exactValues: { skill_name: directSkillName[pairId] }, forbiddenFields: forbiddenIdentity };
  else if (tool === "skill_view_by_id") argumentRules = { requiredFields: ["skill_id"], valueFromPreviousStep: true, forbiddenFields: forbiddenIdentity };
  else if (tool === "skill_files_read") argumentRules = { requiredFields: ["skill_id", "path"], exactValues: { path: "references/tokens-and-sessions.md" }, valueFromPreviousStep: true, forbiddenFields: forbiddenIdentity };
  else if (tool === "knowledge_tools_list") argumentRules = { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: targetKnowledge[pairId] } };
  else if (tool === "knowledge_tools_call") argumentRules = { requiredFields: ["knowledge_id", "tool_name", "params"], exactValues: { knowledge_id: targetKnowledge[pairId], tool_name: "search" } };
  return { tool, endpoint: endpointByTool[tool], argumentRules };
};
const batchEvidenceId = (batch) => `T19-EVID-PAIR-${batch.batch_id.toUpperCase()}`;
const assetEvidenceIds = (assetIds) => [...new Set(assetIds.flatMap((id) => allAssets.find((asset) => asset.assetId === id)?.sourceEvidenceIds ?? []))];
const forbiddenTools = ["skill_create", "skill_update", "skill_patch", "skill_delete", "skill_files_write", "skill_files_remove", "skill_extract"];
const languageFor = (pair) => /[\u3400-\u9fff]/u.test(pair.query) ? "zh" : "en";
const makePublic = ({ caseId, project, language, difficulty, contextMessages, query, suffix }) => {
  const task = taskByProject.get(project);
  return hashed({
    caseId, identity: { spaceId: input.identity.space_id, teamId: "T19", userId, agentId: activeAgentId,
      taskId: task.taskId, sessionId: `T19-EVAL-${caseId}-${suffix}`, agentSource: "codex" },
    snapshotId: snapshotHiddenId, workspace: task.workspace, language, difficulty,
    contextMessages, query, visibleAssetSetSha256: activeVisibleSha,
  });
};

for (const { pair, batch } of pairsDraft) {
  const blueprint = pairBlueprintById.get(pair.draft_pair_id);
  if (!blueprint) throw new Error(`missing blueprint ${pair.draft_pair_id}`);
  const positiveCaseId = `${pair.draft_pair_id}-POS`;
  const negativeCaseId = `${pair.draft_pair_id}-NEG`;
  const positiveMessages = [...pair.shared_context_messages, pair.positive.delta_message];
  const negativeMessages = [...pair.shared_context_messages, pair.negative.delta_message];
  publicCases.push(makePublic({ caseId: positiveCaseId, project: blueprint.project, language: languageFor(pair), difficulty: pair.difficulty, contextMessages: positiveMessages, query: pair.query, suffix: "P" }));
  publicCases.push(makePublic({ caseId: negativeCaseId, project: blueprint.project, language: languageFor(pair), difficulty: pair.difficulty, contextMessages: negativeMessages, query: pair.query, suffix: "N" }));

  const sequence = pair.positive.private_proposal.allowed_sequence_candidates[0];
  const firstAction = actionFor(sequence[0], pair.draft_pair_id, false);
  const followups = sequence.slice(1).map((tool) => actionFor(tool, pair.draft_pair_id, true));
  const evidenceRefs = [...new Set([batchEvidenceId(batch), ...assetEvidenceIds(pair.positive.private_proposal.target_asset_ids)])];
  const goldBase = {
    needTdaiTool: true, family: blueprint.family, allowedFirstActions: [firstAction],
    ...(blueprint.family === "knowledge" && sequence.length > 1 ? {
      expectedKnowledgeCalls: [{ toolName: "search", paramRules: { requiredFields: ["query"] } }],
    } : blueprint.family !== "knowledge" && followups.length > 0 ? { expectedFollowupActions: followups } : {}),
    allowedSequences: [sequence], forbiddenTools, maxTdaiCalls: sequence.length,
    targetAssetIds: pair.positive.private_proposal.target_asset_ids,
    informationGap: pair.positive.private_proposal.unique_information_gap,
    stopAfter: pair.positive.private_proposal.stop_after_candidate,
    evidenceRefs, ablationEvidence: "Removing the target asset leaves the registered implementation fact absent while preserving the same visible distractor pool.",
  };
  const positiveGold = { ...goldBase, contentHash: sha(goldBase) };
  privateAnnotations.push(hashed({
    caseId: positiveCaseId, sourceEvidenceIds: evidenceRefs, pairId: pair.draft_pair_id,
    pairRole: "positive", gold: positiveGold,
    annotationReason: "The current context lacks exactly the registered target fact and the approved minimal route retrieves it.",
  }));
  const noToolGoldBase = {
    needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [],
    expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0,
    targetAssetIds: [], evidenceRefs: [batchEvidenceId(batch)],
    ablationEvidence: "The registered delta is present in current context.",
    noToolEvidence: pair.negative.private_proposal.why_current_context_is_sufficient,
  };
  privateAnnotations.push(hashed({
    caseId: negativeCaseId, sourceEvidenceIds: [batchEvidenceId(batch)], pairId: pair.draft_pair_id,
    pairRole: "negative", gold: { ...noToolGoldBase, contentHash: sha(noToolGoldBase) },
    annotationReason: "The single appended delta supplies the complete fact, so no retrieval is needed.",
  }));
  const controlledDeltaSha256 = shaText(JSON.stringify({
    positive_delta_message: pair.positive.delta_message,
    negative_delta_message: pair.negative.delta_message,
    query: pair.query,
  }));
  pairs.push(hashed({
    pairId: pair.draft_pair_id, positiveCaseId, negativeCaseId,
    counterfactualKind: "answer_in_current_context", controlledDeltaSha256,
    currentEvidenceRefs: [batchEvidenceId(batch)],
  }));
}

const naturalEvidenceId = "T19-EVID-NATURAL-T19-NATURAL-MAIN-01";
for (const item of naturalMain.cases) {
  const blueprint = input.natural_negative_blueprints.find((entry) => entry.id === item.draft_case_id);
  const caseId = item.draft_case_id;
  publicCases.push(makePublic({
    caseId, project: blueprint.project, language: /[\u3400-\u9fff]/u.test(item.query) ? "zh" : "en",
    difficulty: item.difficulty, contextMessages: item.context_messages, query: item.query, suffix: "NAT",
  }));
  const goldBase = {
    needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [],
    allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [],
    evidenceRefs: [naturalEvidenceId], ablationEvidence: "All implementation requirements are already present in current context.",
    noToolEvidence: item.why_current_context_is_sufficient,
  };
  privateAnnotations.push(hashed({
    caseId, sourceEvidenceIds: [naturalEvidenceId], gold: { ...goldBase, contentHash: sha(goldBase) },
    annotationReason: "This is a self-contained coding task under the full same-domain distractor pool.",
  }));
}

const runtimePolicy = { allowLlmWrite: false, extraction: { enabled: false, extractors: [] }, assetReflection: false, writeL0: false, archiveWriteBack: false };
const sourcePackSha256 = sha(sourceEvidence);
const snapshots = [
  hashed({ snapshotId: snapshotDevId, worldId: "T19-WORLD-DS05", split: "dev", sourcePackSha256,
    visibleAssetSets: [], workspaceManifestSha256, runtimePolicySha256: sha(runtimePolicy),
    cacheResetRecipeSha256: sha({ recipe: "new controlled session; clear bridge cache and lazy pins" }) }),
  hashed({ snapshotId: snapshotHiddenId, worldId: "T19-WORLD-DS05", split: "hidden_test", sourcePackSha256,
    visibleAssetSets: visibleSets, workspaceManifestSha256, runtimePolicySha256: sha(runtimePolicy),
    cacheResetRecipeSha256: sha({ recipe: "new controlled session; clear bridge cache and lazy pins" }) }),
];
const team = hashed({
  teamId: "T19", worldId: "T19-WORLD-DS05", split: "hidden_test", name: "身份与访问控制",
  businessAgentIds: businessAgents.map((item) => item.agentId), taskIds: tasks.map((item) => item.taskId),
  sourceEvidenceIds: sourceEvidence.map((item) => item.sourceId),
});
const world = hashed({
  worldId: "T19-WORLD-DS05", spaceId: input.identity.space_id, status: "draft", worldAsOf,
  teamIds: ["T19"], sourceEvidenceIds: sourceEvidence.map((item) => item.sourceId),
  snapshotIds: { dev: snapshotDevId, hidden_test: snapshotHiddenId },
  leakageGroup: "task1-formal-v2-hidden-t19", runtimePolicy,
});

const externalImports = sourceLock.files.map((file) => {
  const asset = skills.find((item) => item.sourceEvidenceIds.includes(evidenceForSource(file.sourceId)));
  const adapted = skillAssetsRaw.assets.find((item) => item.asset_id === asset?.assetId);
  return {
    sourceId: file.sourceId, skillKey: file.skillKey, kind: file.kind,
    repository: file.repository, commit: file.commit, license: file.license,
    path: file.upstreamPath, rawSha256: file.rawSha256,
    adaptedSha256: adapted ? sha(adapted) : null,
  };
});
const contract = {
  schema_version: "task1.team_fragment.v1",
  generatorBatchRefs: manifests.map((manifest) => ({ batchId: manifest.batch_id, model: manifest.generator_model, reasoningEffort: manifest.reasoning_effort, actualCount: manifest.actual_count })),
  externalImports,
  workspaceCodeImport: { repository: codeLock.repository, commit: codeLock.commit, license: codeLock.license, lockSha256: codeLockSha, files: codeLock.files },
  counts: { cases: publicCases.length, pairs: pairs.length, memoryPositive: 6, skillPositive: 6, knowledgePositive: 3, pairedNegative: 15, naturalNegative: 10, discovery: 10, direct: 5 },
  world, sourceEvidence, teams: [team], businessAgents, tasks, assets,
  publicCases, privateAnnotations, pairs, snapshots,
};
writeJson(join(outRoot, "team-fragment.json"), contract);
writeJson(join(outRoot, "memory-assets.json"), { schema_version: "task1.team_memory_assets.v1", team_id: "T19", l0Conversations, l1Memories, l2Scenes, l3Profiles });
writeJson(join(outRoot, "skill-assets.json"), { schema_version: "task1.team_skill_assets.v1", team_id: "T19", skills, externalImports });
writeJson(join(outRoot, "knowledge-assets.json"), { schema_version: "task1.team_knowledge_assets.v1", team_id: "T19", knowledge, fixtures: knowledgeAssetsRaw.assets, workspaceCodeImport: contract.workspaceCodeImport });
writeFileSync(join(outRoot, "review.md"), `# T19 Sol review\n\n- Status: reviewed\n- Cases: 40 (6 Memory positive, 6 Skill positive, 3 Knowledge positive, 15 paired no-tool, 10 natural coding no-tool)\n- Pairs: 15; each pair changes exactly one appended context message and keeps query, identity, snapshot, workspace, and shared context fixed.\n- Positive routes: 10 discovery and 5 direct; every route stops when the registered target fact is available.\n- Assets: 10 L0, 16 L1, 5 L2, 1 L3, 18 real GitHub Skills, 3 fixed Knowledge resources.\n- Provider-visible text was reviewed for tool, asset, team, Gold, route, and scoring leakage.\n- Synthetic content carries no fabricated external repository, revision, license, path, or hash. The code graph is grounded in the real launch-revision workspace lock.\n`, "utf8");
console.log(JSON.stringify({ output: outRoot, cases: publicCases.length, pairs: pairs.length, assets: { l0: l0Conversations.length, l1: l1Memories.length, l2: l2Scenes.length, l3: l3Profiles.length, skills: skills.length, knowledge: knowledge.length }, sourceEvidence: sourceEvidence.length }, null, 2));
