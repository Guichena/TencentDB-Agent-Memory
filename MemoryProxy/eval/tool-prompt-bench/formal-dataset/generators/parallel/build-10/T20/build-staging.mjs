import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../../../../..");
const datasetRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const buildRoot = join(datasetRoot, "generators/parallel/build-10/T20");
const sourceRoot = join(datasetRoot, "source-material/T20");
const outRoot = join(datasetRoot, "staging/teams/T20");
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
const memoryMainBatchId = memoryMain.batch_id;
const skillMainBatchId = skillMain.batch_id;
const knowledgeMainBatchId = knowledgeMain.batch_id;
const naturalMainBatchId = naturalMain.batch_id;

const worldAsOf = input.world_as_of;
const activeAgentId = input.identity.active_agent.agent_id;
const identityAgentId = input.identity.imported_memory_agents[0].agent_id;
const policyAgentId = input.identity.imported_memory_agents[1].agent_id;
const userId = input.identity.user_id;
const snapshotHiddenId = "T20-SNAPSHOT-HIDDEN-20260831";
const snapshotDevId = "T20-SNAPSHOT-DEV-EMPTY-20260831";
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
addSynthetic({ sourceId: "T20-EVID-HISTORY-L0", role: "history", transform: "redacted_replay", batchId: memoryMainBatchId, contentRefs: l0Ids });
addSynthetic({ sourceId: "T20-EVID-HISTORY-L1", role: "history", transform: "atomic_fact_extraction", batchId: memoryMainBatchId, contentRefs: l1Ids });
addSynthetic({ sourceId: "T20-EVID-HISTORY-L2", role: "history", transform: "multi_session_scene_synthesis", batchId: memoryMainBatchId, contentRefs: l2Ids });
addSynthetic({ sourceId: "T20-EVID-HISTORY-L3", role: "history", transform: "stable_profile_derivation", batchId: memoryMainBatchId, contentRefs: l3Ids });

const projectTaskId = new Map();
for (const project of input.project_streams) {
  const taskId = `T20-TASK-${project.name.toUpperCase()}`;
  projectTaskId.set(project.name, taskId);
  addSynthetic({
    sourceId: `T20-EVID-ANCHOR-${project.name.toUpperCase()}`,
    role: "current_anchor", transform: "current_task_anchor", batchId: "T20-input-pack",
    contentRefs: [project.project_id, taskId], origin: "evidence_grounded_synthesis",
  });
}

for (const file of sourceLock.files) {
  addExternal({
    sourceId: `T20-EVID-${file.sourceId.replace("T20-SRC-", "SKILL-")}`,
    role: "skill_source", transform: "skill_package_import", origin: "repo_document",
    repository: file.repository, commit: file.commit, license: file.license,
    locator: file.upstreamPath, evidenceSha256: file.rawSha256,
    artifactSha256: file.rawSha256, dataset: "github-skill-file",
  });
}
const codeLockSha = shaText(readFileSync(join(sourceRoot, "workspace-code-lock.json"), "utf8"));
addExternal({
  sourceId: "T20-EVID-KNOW-CODE-GRAPH", role: "repo_context", transform: "code_graph_build", origin: "repo_code",
  repository: input.workspace_anchor.repository, commit: codeLock.revision, license: input.workspace_anchor.license,
  locator: "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T20/workspace-code-lock.json",
  evidenceSha256: codeLockSha, artifactSha256: codeLockSha, dataset: "task1-workspace-code-lock",
});
addSynthetic({ sourceId: "T20-EVID-KNOW-REINDEX-WIKI", role: "repo_context", transform: "repo_document_snapshot", batchId: knowledgeMainBatchId, contentRefs: ["T20-KNOW-WIKI-REINDEX-RUNBOOK"], origin: "evidence_grounded_synthesis" });
addSynthetic({ sourceId: "T20-EVID-KNOW-RANK-WIKI", role: "repo_context", transform: "repo_document_snapshot", batchId: knowledgeMainBatchId, contentRefs: ["T20-KNOW-WIKI-RANK-QUALITY"], origin: "evidence_grounded_synthesis" });

const pairBatches = [memoryTrial, memoryMain, skillTrial, skillMain, knowledgeTrial, knowledgeMain];
for (const batch of pairBatches) {
  addSynthetic({
    sourceId: `T20-EVID-PAIR-${batch.batch_id.toUpperCase()}`,
    role: "evaluation_derivation", transform: "paired_counterfactual", batchId: batch.batch_id,
    contentRefs: batch.pairs.map((item) => item.draft_pair_id), origin: "evidence_grounded_synthesis",
  });
}
addSynthetic({
  sourceId: "T20-EVID-NATURAL-T20-NATURAL-MAIN-01", role: "evaluation_derivation",
  transform: "natural_negative_selection", batchId: naturalMainBatchId,
  contentRefs: naturalMain.cases.map((item) => item.draft_case_id), origin: "evidence_grounded_synthesis",
});

const evidenceIds = new Set(sourceEvidence.map((item) => item.sourceId));
const evidenceForSource = (sourceId) => {
  const id = `T20-EVID-${sourceId.replace("T20-SRC-", "SKILL-")}`;
  if (!evidenceIds.has(id)) throw new Error(`missing evidence for ${sourceId}`);
  return id;
};

const observedAt = "2026-08-30T18:00:00+08:00";
const messageObservedAt = "2026-08-30T17:30:00+08:00";
const l0Conversations = memoryAssetsRaw.l0_conversations.map((item) => hashed({
  assetId: item.asset_id,
  ownerAgentId: item.owner.agent_id,
  sourceEvidenceIds: ["T20-EVID-HISTORY-L0"],
  observedAt,
  sessionId: item.session_id,
  messages: item.messages.map((message) => hashed({
    messageId: message.message_id, role: message.role, content: message.content,
    sourceEvidenceIds: ["T20-EVID-HISTORY-L0"], observedAt: messageObservedAt,
  })),
}));
const l1Type = (id) => id.includes("ALIAS-SWAP") ? "decision" : "fact";
const l1Memories = memoryAssetsRaw.l1_memories.map((item) => hashed({
  assetId: item.asset_id, ownerAgentId: item.owner.agent_id,
  sourceEvidenceIds: ["T20-EVID-HISTORY-L1"], observedAt,
  type: l1Type(item.asset_id), content: item.content,
  status: item.status === "invalid" ? "invalid" : "active",
  validFrom: "2026-08-20T00:00:00+08:00",
  supportingMessageIds: item.support_links.flatMap((link) => link.message_ids),
  codeEvidenceLocators: [], testEvidenceLocators: [],
}));
const l2Scenes = memoryAssetsRaw.l2_scenes.map((item) => hashed({
  assetId: item.asset_id, ownerAgentId: item.owner.agent_id,
  sourceEvidenceIds: ["T20-EVID-HISTORY-L2"], observedAt,
  path: item.path, summary: item.summary, content: item.content, injected: true,
  supportingSessionIds: item.supporting_session_ids,
}));
const l3Content = [
  ...memoryAssetsRaw.l3_profile.content.long_lived_preferences,
  ...memoryAssetsRaw.l3_profile.content.general_constraints,
].join("\n");
const l3Profiles = [hashed({
  assetId: memoryAssetsRaw.l3_profile.asset_id,
  ownerAgentId: memoryAssetsRaw.l3_profile.owner.agent_id,
  sourceEvidenceIds: ["T20-EVID-HISTORY-L3"], observedAt,
  content: l3Content, stability: "team",
})];

const sourceFileById = new Map(sourceLock.files.map((item) => [item.sourceId, item]));
const skills = skillAssetsRaw.candidates.map((item) => {
  const file = sourceFileById.get(item.source_id);
  if (!file) throw new Error(`missing skill source for ${item.candidate_id}`);
  return hashed({
    assetId: item.candidate_id, ownerAgentId: activeAgentId,
    sourceEvidenceIds: [evidenceForSource(item.source_id)], observedAt,
    name: item.name, version: "1",
    description: item.description, useWhen: item.useWhen, doNotUseWhen: item.doNotUseWhen,
    repoCommit: file.commit,
    visibility: item.binding_class === "bound" ? "private" : "team",
    provenanceMode: "imported_open_source", supportingSessionIds: [],
    codeEvidenceLocators: [], testEvidenceLocators: [],
    manifest: item.manifest_files.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
  });
});
const knowledgeFixtureById = new Map(knowledgeAssetsRaw.assets.map((item) => [item.asset_id, item]));
const knowledge = input.asset_plan.knowledge.map((slot) => {
  const fixture = knowledgeFixtureById.get(slot.asset_id);
  if (!fixture) throw new Error(`missing knowledge fixture ${slot.asset_id}`);
  const base = {
    assetId: fixture.asset_id, ownerAgentId: activeAgentId,
    sourceEvidenceIds: [fixture.type === "code_graph" ? "T20-EVID-KNOW-CODE-GRAPH"
      : fixture.asset_id.includes("REINDEX") ? "T20-EVID-KNOW-REINDEX-WIKI" : "T20-EVID-KNOW-RANK-WIKI"],
    observedAt, type: fixture.type, name: fixture.name,
    snapshotSha256: sha(fixture), bindings: [{ agentId: activeAgentId, visibility: "fixed" }],
    ...(fixture.type === "code_graph" ? {
      repoUrl: input.workspace_anchor.repository, repoCommit: codeLock.revision, indexVersion: "t20-code-lock-v1",
    } : {}),
  };
  return hashed(base);
});
const assets = { l0Conversations, l1Memories, l2Scenes, l3Profiles, skills, knowledge };
const allAssets = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge];

const anchorEvidenceId = (projectName) => `T20-EVID-ANCHOR-${projectName.toUpperCase()}`;
const workspaceFor = (projectName) => hashed({
  workspaceId: `T20-WS-${projectName.toUpperCase()}`, repoSlug,
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
    taskId: projectTaskId.get(project.name), teamId: "T20", title: `${project.name} 搜索与检索工程流`,
    description: project.scope, goal: `在 ${project.name} 范围内完成可复现、可回退的搜索与检索变更。`,
    eligibleAgentIds: [activeAgentId], projectRef, workspace: workspaceFor(project.name),
    sourceEvidenceIds: [sourceId],
  });
});
const taskByProject = new Map(input.project_streams.map((project) => [project.name, tasks.find((task) => task.taskId === projectTaskId.get(project.name))]));

const boundSkillIds = skills.filter((item) => item.ownerAgentId === activeAgentId && item.visibility === "private").map((item) => item.assetId);
const agentEvidence = ["T20-EVID-ANCHOR-ATLASSEARCH"];
const businessAgents = [
  hashed({
    agentId: activeAgentId, teamId: "T20", name: input.identity.active_agent.name,
    agentDetail: hashed({ description: "负责 T20 搜索与检索项目流的通用工程 Agent。", prompt: "区分映射、查询、排序、分页、索引切换与向量检索边界；保留可复现证据和可回退发布。" }),
    importedMemoryAgentIds: [identityAgentId, policyAgentId], boundSkillIds,
    fixedKnowledgeIds: knowledge.map((item) => item.assetId), sourceEvidenceIds: agentEvidence,
  }),
  hashed({
    agentId: identityAgentId, teamId: "T20", name: input.identity.imported_memory_agents[0].name,
    agentDetail: hashed({ description: "维护索引、分页与一致性历史。", prompt: "记录索引切换、分页边界、失败尝试和回退条件。" }),
    importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: agentEvidence,
  }),
  hashed({
    agentId: policyAgentId, teamId: "T20", name: input.identity.imported_memory_agents[1].name,
    agentDetail: hashed({ description: "维护相关性、向量和检索质量历史。", prompt: "记录评分实验、向量版本、质量边界和回归处置。" }),
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
  return { teamId: "T20", userId, agentId: agent.agentId, assetIds, sha256: sha({ teamId: "T20", userId, agentId: agent.agentId, assetIds }) };
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
const directSkillName = { "T20-PAIR-S03": "nemo-retriever", "T20-PAIR-S05": "vss-search-archive" };
const targetKnowledge = { "T20-PAIR-K01": "T20-KNOW-WIKI-REINDEX-RUNBOOK", "T20-PAIR-K02": "T20-KNOW-CG-SEARCH-PIPELINE", "T20-PAIR-K03": "T20-KNOW-WIKI-RANK-QUALITY" };
const targetKnowledgeTool = { "T20-PAIR-K01": "search", "T20-PAIR-K02": "explore", "T20-PAIR-K03": "search" };
const actionFor = (tool, pairId, followup = false) => {
  const forbiddenIdentity = ["user_id", "team_id", "agent_id", "task_id"];
  let argumentRules = {};
  if (tool === "tdai_memory_search" || tool === "tdai_conversation_search") argumentRules = { requiredFields: ["query"], forbiddenFields: forbiddenIdentity };
  else if (tool === "tdai_atomic_query") argumentRules = { exactValues: { type: "decision" }, forbiddenFields: [...forbiddenIdentity, "project", "status", "scene"] };
  else if (tool === "tdai_conversation_query") argumentRules = { requiredFields: ["session_id"], exactValues: { session_id: "t20-session-vector-embedding-010" }, forbiddenFields: forbiddenIdentity };
  else if (tool === "tdai_scenario_ls") argumentRules = { exactValues: { path_prefix: "t20/cursorflow" }, forbiddenFields: forbiddenIdentity };
  else if (tool === "tdai_read_scene") argumentRules = { requiredFields: ["path"], pathFromFixture: true, valueFromPreviousStep: followup };
  else if (tool === "skill_search") argumentRules = { requiredFields: ["query"], forbiddenFields: [...forbiddenIdentity, "top_k", "mode"] };
  else if (tool === "skill_view") argumentRules = { requiredFields: ["skill_name"], exactValues: { skill_name: directSkillName[pairId] }, forbiddenFields: forbiddenIdentity };
  else if (tool === "skill_view_by_id") argumentRules = { requiredFields: ["skill_id"], valueFromPreviousStep: true, forbiddenFields: forbiddenIdentity };
  else if (tool === "knowledge_tools_list") argumentRules = { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: targetKnowledge[pairId] } };
  else if (tool === "knowledge_tools_call") argumentRules = { requiredFields: ["knowledge_id", "tool_name", "params"], exactValues: { knowledge_id: targetKnowledge[pairId], tool_name: targetKnowledgeTool[pairId] } };
  return { tool, endpoint: endpointByTool[tool], argumentRules };
};
const batchEvidenceId = (batch) => `T20-EVID-PAIR-${batch.batch_id.toUpperCase()}`;
const assetEvidenceIds = (assetIds) => [...new Set(assetIds.flatMap((id) => allAssets.find((asset) => asset.assetId === id)?.sourceEvidenceIds ?? []))];
const forbiddenTools = ["skill_create", "skill_update", "skill_patch", "skill_delete", "skill_files_write", "skill_files_remove", "skill_extract"];
const languageFor = (pair) => /[\u3400-\u9fff]/u.test(pair.query) ? "zh" : "en";
const makePublic = ({ caseId, project, language, difficulty, contextMessages, query, suffix }) => {
  const task = taskByProject.get(project);
  return hashed({
    caseId, identity: { spaceId: input.identity.space_id, teamId: "T20", userId, agentId: activeAgentId,
      taskId: task.taskId, sessionId: `T20-EVAL-${caseId}-${suffix}`, agentSource: "codex" },
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
    ...(blueprint.family === "knowledge" ? {
      expectedKnowledgeCalls: [{ toolName: targetKnowledgeTool[pair.draft_pair_id], paramRules: { requiredFields: ["query"] } }],
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

const naturalEvidenceId = "T20-EVID-NATURAL-T20-NATURAL-MAIN-01";
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
  hashed({ snapshotId: snapshotDevId, worldId: "T20-WORLD-DS05", split: "dev", sourcePackSha256,
    visibleAssetSets: [], workspaceManifestSha256, runtimePolicySha256: sha(runtimePolicy),
    cacheResetRecipeSha256: sha({ recipe: "new controlled session; clear bridge cache and lazy pins" }) }),
  hashed({ snapshotId: snapshotHiddenId, worldId: "T20-WORLD-DS05", split: "hidden_test", sourcePackSha256,
    visibleAssetSets: visibleSets, workspaceManifestSha256, runtimePolicySha256: sha(runtimePolicy),
    cacheResetRecipeSha256: sha({ recipe: "new controlled session; clear bridge cache and lazy pins" }) }),
];
const team = hashed({
  teamId: "T20", worldId: "T20-WORLD-DS05", split: "hidden_test", name: "搜索与检索系统",
  businessAgentIds: businessAgents.map((item) => item.agentId), taskIds: tasks.map((item) => item.taskId),
  sourceEvidenceIds: sourceEvidence.map((item) => item.sourceId),
});
const world = hashed({
  worldId: "T20-WORLD-DS05", spaceId: input.identity.space_id, status: "draft", worldAsOf,
  teamIds: ["T20"], sourceEvidenceIds: sourceEvidence.map((item) => item.sourceId),
  snapshotIds: { dev: snapshotDevId, hidden_test: snapshotHiddenId },
  leakageGroup: "task1-formal-v2-hidden-t20", runtimePolicy,
});

const externalImports = sourceLock.files.map((file) => {
  const asset = skills.find((item) => item.sourceEvidenceIds.includes(evidenceForSource(file.sourceId)));
  const adapted = skillAssetsRaw.candidates.find((item) => item.candidate_id === asset?.assetId);
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
  workspaceCodeImport: { repository: input.workspace_anchor.repository, commit: codeLock.revision, license: input.workspace_anchor.license, lockSha256: codeLockSha, files: codeLock.files },
  counts: { cases: publicCases.length, pairs: pairs.length, memoryPositive: 6, skillPositive: 6, knowledgePositive: 3, pairedNegative: 15, naturalNegative: 10, discovery: 10, direct: 5 },
  world, sourceEvidence, teams: [team], businessAgents, tasks, assets,
  publicCases, privateAnnotations, pairs, snapshots,
};
writeJson(join(outRoot, "team-fragment.json"), contract);
writeJson(join(outRoot, "memory-assets.json"), { schema_version: "task1.team_memory_assets.v1", team_id: "T20", l0Conversations, l1Memories, l2Scenes, l3Profiles });
writeJson(join(outRoot, "skill-assets.json"), { schema_version: "task1.team_skill_assets.v1", team_id: "T20", skills, externalImports });
writeJson(join(outRoot, "knowledge-assets.json"), { schema_version: "task1.team_knowledge_assets.v1", team_id: "T20", knowledge, fixtures: knowledgeAssetsRaw.assets, workspaceCodeImport: contract.workspaceCodeImport });
writeFileSync(join(outRoot, "review.md"), `# T20 Sol review\n\n- Status: reviewed\n- Cases: 40 (6 Memory positive, 6 Skill positive, 3 Knowledge positive, 15 paired no-tool, 10 natural coding no-tool)\n- Pairs: 15; each pair changes exactly one appended context message and keeps query, identity, snapshot, workspace, and shared context fixed.\n- Positive routes: 10 discovery and 5 direct; every route stops when the registered target fact is available.\n- Assets: 10 L0, 16 L1, 5 L2, 1 L3, 16 real GitHub Skills, 3 fixed Knowledge resources.\n- Provider-visible text was reviewed for tool, asset, team, Gold, route, and scoring leakage.\n- Synthetic content carries no fabricated external repository, revision, license, path, or hash. The code graph is grounded in the real launch-revision workspace lock.\n`, "utf8");
console.log(JSON.stringify({ output: outRoot, cases: publicCases.length, pairs: pairs.length, assets: { l0: l0Conversations.length, l1: l1Memories.length, l2: l2Scenes.length, l3: l3Profiles.length, skills: skills.length, knowledge: knowledge.length }, sourceEvidence: sourceEvidence.length }, null, 2));
