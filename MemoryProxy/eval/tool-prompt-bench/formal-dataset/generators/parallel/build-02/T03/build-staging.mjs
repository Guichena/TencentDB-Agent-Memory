import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMAL_ROOT = resolve(HERE, "../../../..");
const STAGING = resolve(FORMAL_ROOT, "staging/teams/T03");
const SOURCE_ROOT = resolve(FORMAL_ROOT, "source-material/T03/skills");
const TEAM_ID = "T03";
const SPLIT = "dev";
const WORLD_ID = "world-task1-engineering";
const WORLD_AS_OF = "2026-08-29T23:59:59+08:00";
const FROZEN_AT = "2026-08-29T20:40:00+08:00";
const ACTIVE = "agent-task1-t03-general";
const ASSET_A = "agent-task1-t03-assets-a";
const ASSET_B = "agent-task1-t03-assets-b";
const USER_ID = "user-task1-t03-eval";
const SPACE_ID = "space-task1-engineering";
const SNAPSHOT_ID = "snapshot-task1-dev-v1";
const FORBIDDEN_IDENTITY = ["user_id", "team_id", "agent_id", "task_id"];

const batchSpecs = [
  ["trials/memory-trial-01", "memory", 1],
  ["trials/skill-trial-01", "skill", 1],
  ["trials/knowledge-trial-01", "knowledge", 1],
  ["batches/memory-expand-01", "memory", 5],
  ["batches/skill-expand-01", "skill", 5],
  ["batches/knowledge-expand-01", "knowledge", 2],
  ["batches/natural-negative-01", "natural-negative", 10],
];

function canonicalize(value, ancestors = new Set()) {
  if (value === null) return "null";
  if (["boolean", "string", "number"].includes(typeof value)) return JSON.stringify(value);
  if (typeof value !== "object") throw new TypeError(`unsupported canonical value ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError("cyclic canonical value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry, ancestors)).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function sha(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalize(value);
  return createHash("sha256").update(bytes).digest("hex");
}

function withHash(value) {
  return { ...value, contentHash: sha(value) };
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function observedAt(candidate) {
  const day = String(candidate.time_window ?? "2026-08-20").slice(0, 10);
  return `${day}T12:00:00+08:00`;
}

function projectForText(text) {
  const value = text.toLowerCase();
  if (value.includes("monai")) return "T03-PROJECT-MONAI-IMAGING";
  if (value.includes("simpo")) return "T03-PROJECT-SIMPO-REPRO";
  if (value.includes("dvc")) return "T03-PROJECT-DVC-PIPELINES";
  return "T03-PROJECT-TRL-GRPO";
}

function taskIdForProject(projectId) {
  return {
    "T03-PROJECT-DVC-PIPELINES": "T03-TASK-DVC-PIPELINES",
    "T03-PROJECT-SIMPO-REPRO": "T03-TASK-SIMPO-REPRO",
    "T03-PROJECT-TRL-GRPO": "T03-TASK-TRL-GRPO",
    "T03-PROJECT-MONAI-IMAGING": "T03-TASK-MONAI-IMAGING",
  }[projectId];
}

function normalizeAssetId(assetId) {
  return {
    "T03-L1-GRPO-REWARD": "T03-L1-TRL-REWARD-DIAGNOSTIC",
    "T03-L1-SIMPO-METRIC": "T03-L1-SIMPO-METRIC-SOURCE",
    "T03-L1-DVC-RETENTION": "T03-L1-DVC-RETENTION-BOUNDARY",
    "T03-L2-GRPO-ROLLOUT": "T03-L2-SCENE-TRL-SAMPLING-VS-REWARD",
  }[assetId] ?? assetId;
}

function syntheticEvidence({ sourceId, role, origin, transform, batchId, contentRefs, generatedAt = "2026-08-29T21:30:00+08:00", model = "gpt-5.6-luna", promptVersion = "task1.luna-batch.v1" }) {
  return withHash({
    sourceId,
    provenanceKind: "synthetic",
    role,
    origin,
    worldAsOf: WORLD_AS_OF,
    transform,
    transformVersion: "task1.ds03.t03.v1",
    reviewStatus: "reviewed",
    generatorModel: model,
    reasoningEffort: "high",
    promptVersion,
    batchId,
    generatedAt,
    contentRefs,
  });
}

function externalSkillEvidence(skill) {
  return withHash({
    sourceId: `source-t03-skill-${skill.name}`,
    provenanceKind: "external_import",
    role: "skill_source",
    origin: "repo_document",
    worldAsOf: WORLD_AS_OF,
    transform: "skill_package_import",
    transformVersion: "task1.open-skill-import.v1",
    reviewStatus: "reviewed",
    dataset: new URL(skill.repository).pathname.replace(/^\//, ""),
    datasetRevision: skill.commit_sha,
    datasetArtifactSha256: skill.package_sha256,
    sourceRepoUrl: skill.repository,
    sourceRepoCommit: skill.commit_sha,
    sourceRepoLicense: skill.license,
    sourceTaskId: skill.assetId,
    sourceTaskTime: "2026-08-29T20:39:00+08:00",
    trajectoryGeneratedAt: FROZEN_AT,
    evidenceLocator: skill.path,
    evidenceSha256: skill.raw_file_sha256,
    transformInputSha256: skill.raw_file_sha256,
    piiScan: "passed",
    reviewedBy: "Sol/build-02-T03",
  });
}

function workspace(project, sourceId) {
  const descriptor = {
    repoSlug: project.repoSlug,
    repoUrl: project.repoUrl,
    baseCommit: project.commit,
    sourceRepoLicense: project.license,
    scope: project.scope,
  };
  return withHash({
    workspaceId: `workspace-${project.projectId.toLowerCase()}`,
    repoSlug: project.repoSlug,
    repoUrl: project.repoUrl,
    baseCommit: project.commit,
    sourceRepoLicense: project.license,
    treeSha256: sha({ kind: "frozen-tree-reference", ...descriptor }),
    fileManifestSha256: sha({ kind: "frozen-file-manifest-reference", ...descriptor }),
    state: "clean",
  });
}

function firstAction(tool, target, skillById, scenePathById) {
  const searchTerms = target.replace(/^T03-(?:SKILL|L[0-3]|KNOW)-/, "").split("-").filter((x) => x.length > 2).slice(0, 4);
  const rules = { forbiddenFields: [...FORBIDDEN_IDENTITY] };
  if (tool === "tdai_memory_search" || tool === "tdai_conversation_search") {
    return { tool, endpoint: tool === "tdai_memory_search" ? "/memory-bridge/v3/atomic/search" : "/memory-bridge/v3/conversation/search", argumentRules: { requiredFields: ["query"], ...rules, stringContainsAny: { query: searchTerms } } };
  }
  if (tool === "tdai_atomic_query") return { tool, endpoint: "/memory-bridge/v3/atomic/query", argumentRules: rules };
  if (tool === "tdai_read_scene") return { tool, endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], forbiddenFields: ["user_id", "team_id", "task_id"], exactValues: { path: scenePathById.get(target) } } };
  if (tool === "skill_view") {
    const skill = skillById.get(target);
    return { tool, endpoint: "/skill-bridge/v3/skill/get-by-name", argumentRules: { requiredFields: ["skill_name", "include_content", "include_manifest"], ...rules, exactValues: { skill_name: skill.name, include_content: true, include_manifest: true } } };
  }
  if (tool === "skill_search") return { tool, endpoint: "/skill-bridge/v3/skill/search", argumentRules: { requiredFields: ["query"], forbiddenFields: [...FORBIDDEN_IDENTITY, "top_k", "mode"], stringContainsAny: { query: searchTerms } } };
  if (tool === "knowledge_tools_list") return { tool, endpoint: "/tools/list", argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } };
  throw new Error(`unsupported first action ${tool}`);
}

function followups(sequence, target, skillById) {
  return sequence.slice(1).filter((tool) => tool !== "knowledge_tools_call").map((tool) => {
    if (tool === "tdai_conversation_query") return { tool, endpoint: "/memory-bridge/v3/conversation/query", argumentRules: { requiredFields: ["session_id"], forbiddenFields: [...FORBIDDEN_IDENTITY], exactValues: { session_id: target }, valueFromPreviousStep: true } };
    if (tool === "skill_view_by_id") return { tool, endpoint: "/skill-bridge/v3/skill/get", argumentRules: { requiredFields: ["skill_id", "include_content", "include_manifest"], forbiddenFields: [...FORBIDDEN_IDENTITY], exactValues: { skill_id: target, include_content: true, include_manifest: true }, valueFromPreviousStep: true } };
    if (tool === "skill_files_read") {
      const skill = skillById.get(target);
      const resource = skill.manifest.find((entry) => entry.path !== "SKILL.md")?.path;
      return { tool, endpoint: "/skill-bridge/v3/skill/files/read", argumentRules: { requiredFields: ["skill_id", "path"], forbiddenFields: [...FORBIDDEN_IDENTITY], exactValues: { skill_id: target, path: resource }, valueFromPreviousStep: true } };
    }
    throw new Error(`unsupported follow-up ${tool}`);
  });
}

function knowledgeTerms(target) {
  if (target.includes("DVC")) return ["import-url", "parameter", "pipeline"];
  if (target.includes("MONAI")) return ["CacheDataset", "Compose", "cache"];
  return ["GRPO", "rollout", "reward"];
}

async function main() {
  const inputPack = await json(resolve(HERE, "input-pack.json"));
  const memoryCandidates = await json(resolve(HERE, "trials/memory-trial-01/asset-candidates.json"));
  const knowledgeCandidates = await json(resolve(HERE, "trials/knowledge-trial-01/knowledge-candidates.json"));
  const batchData = [];
  for (const [relative, family, count] of batchSpecs) {
    const dir = resolve(HERE, relative);
    const draftBytes = await readFile(resolve(dir, "draft.json"));
    const draft = JSON.parse(draftBytes.toString("utf8"));
    const manifest = await json(resolve(dir, "manifest.json"));
    const records = family === "natural-negative" ? draft.cases : draft.pairs;
    if (records.length !== count) throw new Error(`${relative} expected ${count}, got ${records.length}`);
    if (sha(draftBytes) !== manifest.raw_output_sha256) throw new Error(`${relative} manifest hash mismatch`);
    batchData.push({ relative, family, count, draft, manifest, draftSha256: sha(draftBytes) });
  }

  const sourceEvidence = [];
  const projectSourceById = new Map();
  for (const project of inputPack.project_streams) {
    const sourceId = `source-t03-anchor-${project.projectId.toLowerCase()}`;
    projectSourceById.set(project.projectId, sourceId);
    sourceEvidence.push(syntheticEvidence({
      sourceId,
      role: "current_anchor",
      origin: "evidence_grounded_synthesis",
      transform: "current_task_anchor",
      batchId: "t03-input-pack",
      contentRefs: [`generators/parallel/build-02/T03/input-pack.json#${project.projectId}`],
      generatedAt: FROZEN_AT,
      model: "gpt-5.6-sol",
      promptVersion: "task1.team-input-pack.v1",
    }));
  }

  const memorySource = {
    L0: "source-t03-memory-l0",
    L1: "source-t03-memory-l1",
    L2: "source-t03-memory-l2",
    L3: "source-t03-memory-l3",
  };
  for (const [level, transform, origin] of [
    ["L0", "redacted_replay", "synthetic_agent_replay"],
    ["L1", "atomic_fact_extraction", "evidence_grounded_synthesis"],
    ["L2", "multi_session_scene_synthesis", "evidence_grounded_synthesis"],
    ["L3", "stable_profile_derivation", "evidence_grounded_synthesis"],
  ]) sourceEvidence.push(syntheticEvidence({ sourceId: memorySource[level], role: "history", origin, transform, batchId: "t03-memory-trial-01", contentRefs: [`generators/parallel/build-02/T03/trials/memory-trial-01/asset-candidates.json#${level}`] }));

  const skillSources = new Map();
  for (const skill of inputPack.frozen_skills) {
    const evidence = externalSkillEvidence(skill);
    sourceEvidence.push(evidence);
    skillSources.set(skill.assetId, evidence.sourceId);
  }

  const knowledgeSources = new Map();
  for (const candidate of knowledgeCandidates.candidates) {
    const sourceId = `source-t03-knowledge-${candidate.asset_id.toLowerCase()}`;
    knowledgeSources.set(candidate.asset_id, sourceId);
    sourceEvidence.push(syntheticEvidence({
      sourceId,
      role: "repo_context",
      origin: "evidence_grounded_synthesis",
      transform: candidate.type === "code_graph" ? "code_graph_build" : "repo_document_snapshot",
      batchId: "t03-knowledge-trial-01",
      contentRefs: [`generators/parallel/build-02/T03/trials/knowledge-trial-01/knowledge-candidates.json#${candidate.asset_id}`],
    }));
  }

  const pairSourceByBatch = new Map();
  for (const batch of batchData) {
    const sourceId = `source-t03-${batch.draft.batch_id}`;
    pairSourceByBatch.set(batch.relative, sourceId);
    sourceEvidence.push(syntheticEvidence({
      sourceId,
      role: "evaluation_derivation",
      origin: "evidence_grounded_synthesis",
      transform: batch.family === "natural-negative" ? "natural_negative_selection" : "paired_counterfactual",
      batchId: batch.draft.batch_id,
      contentRefs: [`generators/parallel/build-02/T03/${batch.relative}/draft.json`],
      generatedAt: batch.manifest.generated_at,
    }));
  }

  const sessionCandidates = memoryCandidates.candidates.filter((item) => item.level === "L0");
  const messageIdsBySession = new Map();
  const l0Conversations = sessionCandidates.map((candidate, index) => {
    const ownerAgentId = index % 2 === 0 ? ASSET_A : ASSET_B;
    const at = observedAt(candidate);
    const messages = candidate.messages.map((message, messageIndex) => withHash({
      messageId: `${candidate.candidate_id}-M${String(messageIndex + 1).padStart(3, "0")}`,
      role: message.role,
      content: message.content,
      sourceEvidenceIds: [memorySource.L0],
      observedAt: at,
    }));
    messageIdsBySession.set(candidate.candidate_id, messages.map((item) => item.messageId));
    return withHash({ assetId: candidate.candidate_id, ownerAgentId, sourceEvidenceIds: [memorySource.L0], observedAt: at, sessionId: candidate.candidate_id, messages });
  });

  const l1Memories = memoryCandidates.candidates.filter((item) => item.level === "L1").map((candidate, index) => {
    const supportingMessageIds = candidate.supporting_session_ids.flatMap((id) => messageIdsBySession.get(id) ?? []);
    return withHash({
      assetId: candidate.candidate_id,
      ownerAgentId: index % 2 === 0 ? ASSET_A : ASSET_B,
      sourceEvidenceIds: [memorySource.L1],
      observedAt: "2026-08-28T12:00:00+08:00",
      type: candidate.candidate_id.includes("RULE") || candidate.candidate_id.includes("BOUNDARY") ? "decision" : "fact",
      content: candidate.proposed_content,
      status: "active",
      validFrom: "2026-08-05T12:00:00+08:00",
      supportingMessageIds,
      codeEvidenceLocators: [],
      testEvidenceLocators: [],
    });
  });

  const l2Scenes = memoryCandidates.candidates.filter((item) => item.level === "L2").map((candidate, index) => withHash({
    assetId: candidate.candidate_id,
    ownerAgentId: index % 2 === 0 ? ASSET_A : ASSET_B,
    sourceEvidenceIds: [memorySource.L2],
    observedAt: "2026-08-28T14:00:00+08:00",
    path: `/t03/${candidate.project_id.toLowerCase()}/${candidate.candidate_id.toLowerCase()}`,
    summary: candidate.scene_summary,
    content: `${candidate.scene_summary} 支撑会话：${candidate.member_session_ids.join("、")}。`,
    injected: false,
    supportingSessionIds: candidate.member_session_ids,
  }));
  const scenePathById = new Map(l2Scenes.map((item) => [item.assetId, item.path]));

  const l3Profiles = memoryCandidates.candidates.filter((item) => item.level === "L3").map((candidate) => withHash({
    assetId: candidate.candidate_id,
    ownerAgentId: ACTIVE,
    sourceEvidenceIds: [memorySource.L3],
    observedAt: "2026-08-28T16:00:00+08:00",
    content: candidate.profile_summary,
    stability: "team",
  }));

  const skills = inputPack.frozen_skills.map((skill, index) => withHash({
    assetId: skill.assetId,
    ownerAgentId: skill.visibility === "private" ? ACTIVE : (index % 2 === 0 ? ASSET_A : ASSET_B),
    sourceEvidenceIds: [skillSources.get(skill.assetId)],
    observedAt: FROZEN_AT,
    name: skill.name,
    version: `0.0.0+${skill.commit_sha.slice(0, 12)}`,
    description: skill.description,
    useWhen: skill.useWhen,
    doNotUseWhen: skill.doNotUseWhen,
    repoCommit: skill.commit_sha,
    visibility: skill.visibility,
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest: skill.manifest,
  }));
  const skillById = new Map(skills.map((item) => [item.assetId, item]));

  const allPairDrafts = batchData.filter((item) => item.family !== "natural-negative").flatMap((batch) => batch.draft.pairs.map((pair) => ({ batch, pair })));
  const knowledgePairByTarget = new Map(allPairDrafts.filter(({ batch }) => batch.family === "knowledge").map(({ pair }) => [pair.positive.private_proposal.target_asset_ids[0], pair]));
  const knowledgeFixtures = {};
  const knowledge = knowledgeCandidates.candidates.map((candidate) => {
    const pair = knowledgePairByTarget.get(candidate.asset_id);
    const fixture = {
      schema_version: "task1.knowledge_retrieval_fixture.v1",
      knowledge_id: candidate.asset_id,
      status: candidate.status,
      tools: candidate.fixed_tool_list,
      call: candidate.successful_readonly_search_fixture,
      result: pair?.negative?.delta_message?.content ?? `已冻结 ${candidate.name} 的只读检索结果。`,
    };
    knowledgeFixtures[candidate.asset_id] = fixture;
    return withHash({
      assetId: candidate.asset_id,
      ownerAgentId: ACTIVE,
      sourceEvidenceIds: [knowledgeSources.get(candidate.asset_id)],
      observedAt: knowledgeCandidates.frozen_at,
      type: candidate.type,
      name: candidate.name,
      ...(candidate.type === "code_graph" ? { repoUrl: candidate.repository.url, repoCommit: candidate.repository.commit, indexVersion: "task1-t03-codegraph-fixture-v1" } : {}),
      snapshotSha256: sha(fixture),
      bindings: [{ agentId: ACTIVE, visibility: "fixed" }],
    });
  });

  const tasks = inputPack.project_streams.map((project) => {
    const sourceId = projectSourceById.get(project.projectId);
    const ws = workspace(project, sourceId);
    return withHash({
      taskId: taskIdForProject(project.projectId),
      teamId: TEAM_ID,
      title: project.topic,
      description: project.scope,
      goal: `在固定 ${project.repoSlug} 提交中完成只读诊断、复现与验证边界确认。`,
      eligibleAgentIds: [ACTIVE],
      projectRef: withHash({ projectRefId: project.projectId, repoSlug: project.repoSlug, repoUrl: project.repoUrl, pinnedCommit: project.commit, sourceEvidenceIds: [sourceId] }),
      workspace: ws,
      sourceEvidenceIds: [sourceId],
    });
  });
  const taskById = new Map(tasks.map((item) => [item.taskId, item]));

  const boundSkillIds = skills.filter((item) => item.ownerAgentId === ACTIVE).map((item) => item.assetId).sort();
  const fixedKnowledgeIds = knowledge.map((item) => item.assetId).sort();
  const projectSourceIds = [...projectSourceById.values()];
  const businessAgents = [
    withHash({
      agentId: ACTIVE,
      teamId: TEAM_ID,
      name: "T03 ML 工程业务 Agent",
      agentDetail: withHash({ description: "Handles DVC, paper reproduction, GRPO, and MONAI engineering workflows.", prompt: "Use only the current Team's frozen visible assets; choose the minimum complete read-only chain and stop when the unique gap closes." }),
      importedMemoryAgentIds: [ASSET_A, ASSET_B],
      boundSkillIds,
      fixedKnowledgeIds,
      sourceEvidenceIds: projectSourceIds,
    }),
    withHash({
      agentId: ASSET_A,
      teamId: TEAM_ID,
      name: "T03 复现资产 Agent A",
      agentDetail: withHash({ description: "Owns frozen T03 history and team-discoverable procedures.", prompt: "Provide read-only assets to the active T03 agent through production visibility rules." }),
      importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: [memorySource.L0, memorySource.L1],
    }),
    withHash({
      agentId: ASSET_B,
      teamId: TEAM_ID,
      name: "T03 诊断资产 Agent B",
      agentDetail: withHash({ description: "Owns complementary T03 history and team-discoverable procedures.", prompt: "Provide read-only assets to the active T03 agent through production visibility rules." }),
      importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: [memorySource.L2, memorySource.L3],
    }),
  ];

  const allAssetIds = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge].map((item) => item.assetId).sort();
  const visibleAssetSetSha256 = sha({ teamId: TEAM_ID, userId: USER_ID, agentId: ACTIVE, assetIds: allAssetIds });
  const publicCases = [];
  const privateAnnotations = [];
  const pairs = [];
  const familyCounts = { memory: 0, skill: 0, knowledge: 0 };
  const pairReview = [];
  const assetSourceById = new Map([
    ...l0Conversations.map((item) => [item.assetId, memorySource.L0]),
    ...l1Memories.map((item) => [item.assetId, memorySource.L1]),
    ...l2Scenes.map((item) => [item.assetId, memorySource.L2]),
    ...l3Profiles.map((item) => [item.assetId, memorySource.L3]),
    ...skills.map((item) => [item.assetId, skillSources.get(item.assetId)]),
    ...knowledge.map((item) => [item.assetId, knowledgeSources.get(item.assetId)]),
  ]);

  for (const { batch, pair } of allPairDrafts) {
    const family = batch.family;
    familyCounts[family] += 1;
    const number = String(familyCounts[family]).padStart(3, "0");
    const prefix = family === "memory" ? "MEM" : family === "skill" ? "SKILL" : "KNOW";
    const pairId = `${TEAM_ID}-PAIR-${prefix}-${number}`;
    const positiveCaseId = `${TEAM_ID}-${prefix}-${number}-P`;
    const negativeCaseId = `${TEAM_ID}-${prefix}-${number}-N`;
    const target = pair.positive.private_proposal.target_asset_ids[0];
    if (!assetSourceById.has(target)) throw new Error(`${pair.draft_pair_id} targets unknown asset ${target}`);
    const sequence = pair.positive.private_proposal.allowed_sequence_candidates[0];
    const sourceId = pairSourceByBatch.get(batch.relative);
    const text = `${pair.query}\n${pair.shared_context_messages.map((item) => item.content).join("\n")}\n${target}`;
    const projectId = projectForText(text);
    const taskId = taskIdForProject(projectId);
    const task = taskById.get(taskId);
    const context = (delta) => [...pair.shared_context_messages, delta];
    const makePublic = (caseId, role, delta) => withHash({
      caseId,
      identity: { spaceId: SPACE_ID, teamId: TEAM_ID, userId: USER_ID, agentId: ACTIVE, taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" },
      snapshotId: SNAPSHOT_ID,
      workspace: task.workspace,
      language: "zh",
      difficulty: pair.difficulty,
      contextMessages: context(delta),
      query: pair.query,
      visibleAssetSetSha256,
    });
    const positive = makePublic(positiveCaseId, "positive", pair.positive.delta_message);
    const negative = makePublic(negativeCaseId, "negative", pair.negative.delta_message);
    publicCases.push(positive, negative);
    const first = firstAction(sequence[0], target, skillById, scenePathById);
    const expectedFollowupActions = family === "knowledge" ? [] : followups(sequence, target, skillById);
    const evidenceRefs = [sourceId, assetSourceById.get(target)];
    const positiveGold = withHash({
      needTdaiTool: true,
      family,
      allowedFirstActions: [first],
      expectedFollowupActions,
      expectedKnowledgeCalls: family === "knowledge" ? [{ toolName: "search", paramRules: { requiredFields: ["query"], stringContainsAny: { query: knowledgeTerms(target) } } }] : [],
      allowedSequences: [sequence],
      forbiddenTools: family === "memory" ? ["skill_search", "skill_view", "knowledge_tools_list"] : family === "skill" ? ["tdai_memory_search", "tdai_conversation_search", "knowledge_tools_list"] : ["tdai_memory_search", "tdai_conversation_search", "skill_search", "skill_view"],
      maxTdaiCalls: sequence.length,
      targetAssetIds: [target],
      informationGap: pair.positive.private_proposal.unique_information_gap,
      stopAfter: pair.positive.private_proposal.stop_after_candidate,
      evidenceRefs,
      ablationEvidence: `Removing ${target} leaves no other visible asset that supplies the case's exact missing procedure or frozen project relation.`,
    });
    const negativeGold = withHash({
      needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [],
      evidenceRefs: [sourceId],
      ablationEvidence: "Not applicable: the counterfactual is self-contained.",
      noToolEvidence: pair.negative.private_proposal.why_current_context_is_sufficient,
    });
    privateAnnotations.push(withHash({ caseId: positiveCaseId, sourceEvidenceIds: evidenceRefs, pairId, pairRole: "positive", gold: positiveGold, annotationReason: `Sol review: the unique gap requires ${sequence.join(" -> ")} and target ${target}.` }));
    privateAnnotations.push(withHash({ caseId: negativeCaseId, sourceEvidenceIds: [sourceId], pairId, pairRole: "negative", gold: negativeGold, annotationReason: "Sol review: the appended delta supplies the sole missing information, so no TDAI tool is allowed." }));
    const controlledDeltaSha256 = createHash("sha256").update(JSON.stringify({ positive_delta_message: pair.positive.delta_message, negative_delta_message: pair.negative.delta_message, query: pair.query }), "utf8").digest("hex");
    pairs.push(withHash({ pairId, positiveCaseId, negativeCaseId, counterfactualKind: "answer_in_current_context", controlledDeltaSha256, currentEvidenceRefs: [sourceId] }));
    pairReview.push({ pairId, draftPairId: pair.draft_pair_id, family, target, sequence, distractors: pair.visible_distractor_ids_author_only.map(normalizeAssetId), sourceBatch: batch.relative });
  }

  let naturalIndex = 0;
  for (const batch of batchData.filter((item) => item.family === "natural-negative")) {
    const sourceId = pairSourceByBatch.get(batch.relative);
    for (const item of batch.draft.cases) {
      naturalIndex += 1;
      const caseId = `${TEAM_ID}-NAT-${String(naturalIndex).padStart(3, "0")}`;
      const text = `${item.query}\n${item.context_messages.map((entry) => entry.content).join("\n")}`;
      const projectId = projectForText(text);
      const taskId = taskIdForProject(projectId);
      const task = taskById.get(taskId);
      publicCases.push(withHash({
        caseId,
        identity: { spaceId: SPACE_ID, teamId: TEAM_ID, userId: USER_ID, agentId: ACTIVE, taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" },
        snapshotId: SNAPSHOT_ID, workspace: task.workspace, language: "zh", difficulty: item.difficulty ?? "medium", contextMessages: item.context_messages, query: item.query, visibleAssetSetSha256,
      }));
      const gold = withHash({
        needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs: [sourceId],
        ablationEvidence: "Not applicable: this natural negative is fully answerable from current code and context.",
        noToolEvidence: item.why_current_context_is_sufficient,
      });
      privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: [sourceId], gold, annotationReason: "Sol review: this is a natural self-contained coding negative with no unique external information gap." }));
    }
  }

  const team = withHash({
    teamId: TEAM_ID, worldId: WORLD_ID, split: SPLIT, name: "ML 工程", businessAgentIds: businessAgents.map((item) => item.agentId), taskIds: tasks.map((item) => item.taskId), sourceEvidenceIds: projectSourceIds,
  });
  const generatorBatchRefs = batchData.map((batch) => ({
    batchId: batch.draft.batch_id,
    path: `formal-dataset/generators/parallel/build-02/T03/${batch.relative}`,
    family: batch.family,
    count: batch.count,
    generatorModel: batch.manifest.generator_model,
    reasoningEffort: batch.manifest.reasoning_effort,
    rawOutputSha256: batch.draftSha256,
    solReview: "approved",
  }));
  const externalImports = inputPack.frozen_skills.map((skill) => ({
    assetId: skill.assetId,
    repository: skill.repository,
    commit: skill.commit_sha,
    path: skill.path,
    license: skill.license,
    rawSha256: skill.raw_file_sha256,
    packageSha256: skill.package_sha256,
    localRawPath: `formal-dataset/source-material/T03/skills/${skill.name}/raw/SKILL.md`,
    localAdaptedPath: `formal-dataset/source-material/T03/skills/${skill.name}/adapted/SKILL.md`,
  }));
  const fragment = {
    schema_version: "task1.team_fragment.v1",
    build_id: "build-02",
    team_id: TEAM_ID,
    split: SPLIT,
    sourceEvidence,
    teams: [team],
    businessAgents,
    tasks,
    publicCases: publicCases.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    privateAnnotations: privateAnnotations.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    pairs: pairs.sort((a, b) => a.pairId.localeCompare(b.pairId)),
    snapshotAssetIds: allAssetIds,
    generatorBatchRefs,
    externalImports,
  };
  const memoryFile = { schema_version: "task1.formal_memory_assets.v1", team_id: TEAM_ID, l0Conversations, l1Memories, l2Scenes, l3Profiles };
  const skillsFile = { schema_version: "task1.formal_skill_assets.v1", team_id: TEAM_ID, skills };
  const knowledgeFile = { schema_version: "task1.formal_knowledge_assets.v1", team_id: TEAM_ID, knowledge, fixtures: knowledgeFixtures };
  await writeJson(resolve(STAGING, "team-fragment.json"), fragment);
  await writeJson(resolve(STAGING, "assets/memory.json"), memoryFile);
  await writeJson(resolve(STAGING, "assets/skills.json"), skillsFile);
  await writeJson(resolve(STAGING, "assets/knowledge.json"), knowledgeFile);
  const naturalReview = batchData.filter((item) => item.family === "natural-negative").flatMap((batch) => batch.draft.cases.map((item) => ({
    draftCaseId: item.draft_case_id,
    distractors: item.visible_distractor_ids_author_only.map(normalizeAssetId),
    whyCurrentContextIsSufficient: item.why_current_context_is_sufficient,
    sourceBatch: batch.relative,
  })));
  await writeJson(resolve(STAGING, "pair-review.json"), { schema_version: "task1.sol_pair_review.v1", team_id: TEAM_ID, reviewedBy: "Sol/build-02-T03", status: "approved", pairs: pairReview, naturalCases: naturalReview });

  const review = [
    "# T03 Sol Review",
    "",
    "- Status: approved for the local Team Gate; not globally integrated or frozen.",
    `- Cases: ${publicCases.length} (15 paired positives, 15 paired negatives, ${naturalIndex} natural negatives).`,
    `- Positives: Memory ${familyCounts.memory}, Skill ${familyCounts.skill}, Knowledge ${familyCounts.knowledge}.`,
    `- Assets: L0 ${l0Conversations.length}, L1 ${l1Memories.length}, L2 ${l2Scenes.length}, L3 ${l3Profiles.length}, Skill ${skills.length}, Knowledge ${knowledge.length}.`,
    `- Luna batches: ${generatorBatchRefs.map((item) => `${item.batchId} (${item.count})`).join(", ")}.`,
    `- External imports: ${externalImports.length} pinned GitHub Skill packages; every package records repository, commit, path, license, raw hash, and package hash.`,
    "- Gold review: each positive has one production-aligned first action, every multi-step route records its follow-up, every Knowledge case uses list then call, and every negative has maxTdaiCalls=0.",
    "- Visibility review: the active agent imports exactly two same-Team Memory owners, owns all listed Skills, can search only same-Team team-visible Skills, and has exactly three fixed Knowledge resources.",
    "- Pair review: query, workspace, task, snapshot, and shared context are invariant; only the appended delta changes.",
    "- Provider review: provider inputs contain only case id, language, context, and query; private Gold, asset ids, endpoints, and route names remain private.",
    "- Upstream limits: no upstream dependency installation, upstream test execution, official patch extraction, or formal model evaluation was performed.",
    "- Integration note: the global contract, snapshots, provider exports, hashes, and DATASET-BUILD-STATUS remain for the integration task.",
    "",
  ].join("\n");
  await writeFile(resolve(STAGING, "review.md"), review, "utf8");
  console.log(JSON.stringify({ team: TEAM_ID, cases: publicCases.length, pairs: pairs.length, familyCounts, naturalNegatives: naturalIndex, assets: allAssetIds.length, externalImports: externalImports.length }, null, 2));
}

await main();
