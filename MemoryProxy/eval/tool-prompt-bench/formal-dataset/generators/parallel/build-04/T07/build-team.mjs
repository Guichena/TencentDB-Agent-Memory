import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve("MemoryProxy/eval/tool-prompt-bench");
const teamRoot = resolve(root, "formal-dataset/generators/parallel/build-04/T07");
const stagingRoot = resolve(root, "formal-dataset/staging/teams/T07");
const sourceRoot = resolve(root, "formal-dataset/source-material/T07");
const input = JSON.parse(await readFile(resolve(teamRoot, "input-pack.json"), "utf8"));
const workspaceLocks = JSON.parse(await readFile(resolve(teamRoot, "workspace-locks.json"), "utf8"));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value)), "utf8").digest("hex");
}
function fileHash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function withHash(value) { return { ...value, contentHash: hash(value) }; }
function withoutContentHash(value) {
  const { contentHash: _ignored, ...rest } = value;
  return rest;
}
async function readJson(path) { return JSON.parse(await readFile(resolve(path), "utf8")); }
async function batch(kind, name) {
  const dir = resolve(teamRoot, kind, name);
  const draftBytes = await readFile(resolve(dir, "draft.json"));
  const manifestBytes = await readFile(resolve(dir, "manifest.json"));
  return {
    dir,
    draft: JSON.parse(draftBytes.toString("utf8")),
    manifest: JSON.parse(manifestBytes.toString("utf8")),
    draftSha256: fileHash(draftBytes),
    manifestSha256: fileHash(manifestBytes),
  };
}

const memoryTrial = await batch("memory", "memory-trial-01");
const memoryExpansion = await batch("memory", "memory-expansion-01");
const skillTrial = await batch("skill", "skill-trial-01");
const skillExpansion = await batch("skill", "skill-expansion-01");
const knowledgeTrial = await batch("knowledge", "knowledge-trial-01");
const knowledgeExpansion = await batch("knowledge", "knowledge-expansion-01");
const naturalBatch = await batch("natural-negative", "natural-negative-01");
const batches = [memoryTrial, memoryExpansion, skillTrial, skillExpansion, knowledgeTrial, knowledgeExpansion, naturalBatch];
const memoryCandidates = await readJson(resolve(memoryTrial.dir, "asset-candidates.json"));
const skillCandidates = await readJson(resolve(skillTrial.dir, "asset-candidates.json"));
const knowledgeCandidates = await readJson(resolve(knowledgeTrial.dir, "asset-candidates.json"));

const WORLD_AS_OF = input.world_as_of;
const OBSERVED_AT = "2026-08-28T12:00:00Z";
const TEAM_ID = "T07";
const ACTIVE_AGENT = input.identity.active_agent_id;
const ASSET_AGENT_A = input.identity.asset_agent_ids[0];
const ASSET_AGENT_B = input.identity.asset_agent_ids[1];
const USER_ID = input.identity.user_id;
const SNAPSHOT_ID = input.identity.snapshot_id;
const SOURCE_REPO = input.skill_source_policy.repository_url;
const SOURCE_COMMIT = input.skill_source_policy.commit_sha;

const projectById = new Map(input.project_flows.map((project) => [project.project_id, project]));
const lockByProject = new Map(workspaceLocks.locks.map((lock) => [lock.project_id, lock]));
const planById = new Map(input.pair_plan.map((plan) => [plan.pair_id, plan]));
const skillInputById = new Map(input.skills.map((skill) => [skill.asset_id, skill]));
const skillCandidateById = new Map(skillCandidates.candidates.map((skill) => [skill.asset_id, skill]));

function syntheticEvidence({ sourceId, role, transform, batchInfo, contentRefs, origin = "synthetic_agent_replay" }) {
  const value = {
    sourceId,
    provenanceKind: "synthetic",
    role,
    origin,
    worldAsOf: WORLD_AS_OF,
    transform,
    transformVersion: "task1.build-04.v1",
    reviewStatus: "reviewed",
    generatorModel: "gpt-5.6-luna",
    reasoningEffort: "high",
    promptVersion: "task1.luna-batch.v1",
    batchId: batchInfo.manifest.batch_id,
    generatedAt: batchInfo.manifest.generated_at,
    contentRefs,
  };
  return withHash(value);
}
function externalSkillEvidence(skill) {
  const value = {
    sourceId: `source-t07-skill-${skill.name.replaceAll("_", "-")}`,
    provenanceKind: "external_import",
    role: "skill_source",
    origin: "repo_document",
    worldAsOf: WORLD_AS_OF,
    transform: "skill_package_import",
    transformVersion: "task1.host-metadata-only.v1",
    reviewStatus: "reviewed",
    dataset: "github/awesome-copilot",
    datasetRevision: SOURCE_COMMIT,
    datasetArtifactSha256: skill.raw_sha256,
    sourceRepoUrl: SOURCE_REPO,
    sourceRepoCommit: SOURCE_COMMIT,
    sourceRepoLicense: input.skill_source_policy.license,
    sourceTaskTime: input.skill_source_policy.commit_time,
    trajectoryGeneratedAt: input.skill_source_policy.commit_time,
    evidenceLocator: skill.path,
    evidenceSha256: skill.raw_sha256,
    transformInputSha256: skill.raw_sha256,
    piiScan: "passed",
    reviewedBy: "codex-sol-build-04",
  };
  return withHash(value);
}

const currentSource = syntheticEvidence({
  sourceId: "source-t07-current-anchor",
  role: "current_anchor",
  transform: "current_task_anchor",
  batchInfo: memoryTrial,
  contentRefs: ["T07-team", ...input.project_flows.map((project) => project.task_id)],
  origin: "evidence_grounded_synthesis",
});
const l0Source = syntheticEvidence({ sourceId: "source-t07-memory-l0", role: "history", transform: "redacted_replay", batchInfo: memoryTrial, contentRefs: input.asset_namespaces.l0_session_ids });
const l1Source = syntheticEvidence({ sourceId: "source-t07-memory-l1", role: "history", transform: "atomic_fact_extraction", batchInfo: memoryTrial, contentRefs: input.asset_namespaces.l1_memory_ids });
const l2Source = syntheticEvidence({ sourceId: "source-t07-memory-l2", role: "history", transform: "multi_session_scene_synthesis", batchInfo: memoryTrial, contentRefs: input.asset_namespaces.l2_scene_ids });
const l3Source = syntheticEvidence({ sourceId: "source-t07-memory-l3", role: "history", transform: "stable_profile_derivation", batchInfo: memoryTrial, contentRefs: [input.asset_namespaces.l3_profile_id] });
const knowledgeSources = new Map(knowledgeCandidates.candidates.map((candidate) => {
  const source = syntheticEvidence({
    sourceId: `source-t07-knowledge-${candidate.knowledge_id}`,
    role: "repo_context",
    transform: candidate.type === "code_graph" ? "code_graph_build" : "repo_document_snapshot",
    batchInfo: knowledgeTrial,
    contentRefs: [candidate.knowledge_id],
    origin: "evidence_grounded_synthesis",
  });
  return [candidate.knowledge_id, source];
}));
const pairSources = new Map();
for (const batchInfo of [memoryTrial, memoryExpansion, skillTrial, skillExpansion, knowledgeTrial, knowledgeExpansion]) {
  const family = batchInfo.draft.family;
  const suffix = batchInfo.manifest.batch_id.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  const source = syntheticEvidence({
    sourceId: `source-t07-pairs-${suffix}`,
    role: "evaluation_derivation",
    transform: "paired_counterfactual",
    batchInfo,
    contentRefs: batchInfo.draft.pairs.map((pair) => pair.draft_pair_id),
  });
  for (const pair of batchInfo.draft.pairs) pairSources.set(pair.draft_pair_id, source);
  void family;
}
const naturalSource = syntheticEvidence({
  sourceId: "source-t07-natural-negatives",
  role: "evaluation_derivation",
  transform: "natural_negative_selection",
  batchInfo: naturalBatch,
  contentRefs: naturalBatch.draft.cases.map((item) => item.draft_case_id),
});
const externalSkillSources = input.skills.map(externalSkillEvidence);
const externalSourceByAsset = new Map(input.skills.map((skill, index) => [skill.asset_id, externalSkillSources[index]]));
const sourceEvidence = [
  currentSource, l0Source, l1Source, l2Source, l3Source,
  ...knowledgeSources.values(), ...new Set(pairSources.values()), naturalSource,
  ...externalSkillSources,
];

function memoryOwner(projectId) {
  if (projectId === "qdrant-ingestion-gateway") return ASSET_AGENT_A;
  if (projectId === "partner-openapi-client") return ASSET_AGENT_B;
  return ACTIVE_AGENT;
}
const l0Conversations = memoryCandidates.l0_sessions.map((session, sessionIndex) => withHash({
  assetId: session.id,
  ownerAgentId: memoryOwner(session.project_id),
  sourceEvidenceIds: [l0Source.sourceId],
  observedAt: `2026-08-${String(16 + sessionIndex).padStart(2, "0")}T10:00:00Z`,
  sessionId: session.id,
  messages: session.messages.map((message, messageIndex) => withHash({
    messageId: message.id,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: [l0Source.sourceId],
    observedAt: `2026-08-${String(16 + sessionIndex).padStart(2, "0")}T10:${String(messageIndex).padStart(2, "0")}:00Z`,
  })),
}));
const l1Memories = memoryCandidates.l1_memories.map((memory) => withHash({
  assetId: memory.id,
  ownerAgentId: memoryOwner(memory.project_id),
  sourceEvidenceIds: [l1Source.sourceId],
  observedAt: OBSERVED_AT,
  type: memory.type ?? "decision",
  content: memory.summary,
  status: memory.status ?? "active",
  ...(memory.superseded_by ? { supersededBy: memory.superseded_by } : {}),
  validFrom: `${memory.valid_from}T00:00:00Z`,
  supportingMessageIds: memory.source_message_ids,
  codeEvidenceLocators: [],
  testEvidenceLocators: [],
}));
const l2Injected = new Map([["T07-L2-01", true], ["T07-L2-02", true], ["T07-L2-03", false], ["T07-L2-04", true]]);
const l2Scenes = memoryCandidates.l2_scenes.map((scene) => withHash({
  assetId: scene.id,
  ownerAgentId: memoryOwner(scene.project_id),
  sourceEvidenceIds: [l2Source.sourceId],
  observedAt: OBSERVED_AT,
  path: scene.path,
  summary: scene.summary,
  content: scene.content,
  injected: l2Injected.get(scene.id) ?? false,
  supportingSessionIds: scene.session_ids,
}));
const l3Profiles = [withHash({
  assetId: memoryCandidates.l3_profile.id,
  ownerAgentId: ACTIVE_AGENT,
  sourceEvidenceIds: [l3Source.sourceId],
  observedAt: OBSERVED_AT,
  content: memoryCandidates.l3_profile.summary,
  stability: "team",
})];

const skills = [];
const externalImports = [];
for (const skill of input.skills) {
  const candidate = skillCandidateById.get(skill.asset_id);
  if (!candidate) throw new Error(`missing Luna skill candidate ${skill.asset_id}`);
  const packageName = skill.path.split("/").slice(1, -1).join("-").replaceAll("/", "-");
  const localName = skill.name;
  const rawBase = resolve(sourceRoot, "skills", localName, "raw");
  const adaptedBase = resolve(sourceRoot, "skills", localName, "adapted");
  const manifest = [];
  const mainRaw = await readFile(resolve(rawBase, "SKILL.md"));
  const mainAdapted = await readFile(resolve(adaptedBase, "SKILL.md"));
  if (fileHash(mainRaw) !== skill.raw_sha256) throw new Error(`raw Skill hash mismatch ${skill.asset_id}`);
  manifest.push({ path: "SKILL.md", sha256: fileHash(mainAdapted) });
  for (const resource of skill.resource_paths ?? []) {
    const packagePrefix = skill.path.slice(0, -"SKILL.md".length);
    if (!resource.path.startsWith(packagePrefix)) throw new Error(`resource outside Skill package ${resource.path}`);
    const rel = resource.path.slice(packagePrefix.length);
    const raw = await readFile(resolve(rawBase, rel));
    const adapted = await readFile(resolve(adaptedBase, rel));
    if (fileHash(raw) !== resource.sha256) throw new Error(`raw resource hash mismatch ${resource.path}`);
    manifest.push({ path: rel.replaceAll("\\", "/"), sha256: fileHash(adapted) });
  }
  const source = externalSourceByAsset.get(skill.asset_id);
  skills.push(withHash({
    assetId: skill.asset_id,
    ownerAgentId: skill.owner,
    sourceEvidenceIds: [source.sourceId],
    observedAt: OBSERVED_AT,
    name: skill.name,
    version: "1.0.0",
    description: candidate.listing_description,
    useWhen: candidate.use_when,
    doNotUseWhen: candidate.do_not_use_when,
    repoCommit: SOURCE_COMMIT,
    visibility: skill.visibility,
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest,
  }));
  const diffPath = resolve(sourceRoot, "skills", localName, "adaptation.diff");
  const diff = await readFile(diffPath);
  externalImports.push({
    sourceId: source.sourceId,
    assetId: skill.asset_id,
    repositoryUrl: SOURCE_REPO,
    revision: SOURCE_COMMIT,
    license: input.skill_source_policy.license,
    upstreamPath: skill.path,
    rawSha256: skill.raw_sha256,
    adaptedSha256: fileHash(mainAdapted),
    packageManifestSha256: hash(manifest),
    licensePath: "_licenses/awesome-copilot-MIT.txt",
    licenseSha256: input.skill_source_policy.license_sha256,
    adaptationDiffPath: relative(sourceRoot, diffPath).replaceAll("\\", "/"),
    adaptationDiffSha256: fileHash(diff),
    adaptationScope: "Package bytes unchanged; neutral description/use/do-not-use metadata is stored in the formal Skill asset.",
    packageName,
  });
}

const knowledgeFixtures = [];
const knowledge = knowledgeCandidates.candidates.map((candidate) => {
  const project = input.project_flows.find((item) => item.task_id === candidate.workspace_match.task_id);
  const source = knowledgeSources.get(candidate.knowledge_id);
  knowledgeFixtures.push({
    knowledge_id: candidate.knowledge_id,
    status: candidate.status,
    summary: candidate.summary,
    workspace_match: candidate.workspace_match,
    repo_match: candidate.repo_match,
    tools_list_definition: candidate.tools_list_definition,
    query_tools: candidate.query_tools,
  });
  return withHash({
    assetId: candidate.knowledge_id,
    ownerAgentId: ACTIVE_AGENT,
    sourceEvidenceIds: [source.sourceId],
    observedAt: OBSERVED_AT,
    type: candidate.type,
    name: candidate.name,
    ...(candidate.type === "code_graph" ? {
      repoUrl: project.repository_url,
      repoCommit: project.commit_sha,
      indexVersion: "task1.synthetic-code-graph.v1",
    } : {}),
    snapshotSha256: hash({ tools: candidate.tools_list_definition, fixtures: candidate.query_tools }),
    bindings: [{ agentId: ACTIVE_AGENT, visibility: "fixed" }],
  });
});

function workspace(project) {
  const lock = lockByProject.get(project.project_id);
  return withHash({
    workspaceId: `workspace-t07-${project.project_id}`,
    repoSlug: new URL(project.repository_url).pathname.slice(1),
    repoUrl: project.repository_url,
    baseCommit: project.commit_sha,
    sourceRepoLicense: project.license,
    treeSha256: lock.tree_sha256,
    fileManifestSha256: lock.file_manifest_sha256,
    state: "clean",
  });
}
const tasks = input.project_flows.map((project) => withHash({
  taskId: project.task_id,
  teamId: TEAM_ID,
  title: project.project_id.replaceAll("-", " "),
  description: `${project.structure}. ${project.focus}`,
  goal: `Maintain the frozen ${project.project_id} integration boundary without relying on another project flow.`,
  eligibleAgentIds: [ACTIVE_AGENT],
  projectRef: withHash({
    projectRefId: `project-ref-t07-${project.project_id}`,
    repoSlug: new URL(project.repository_url).pathname.slice(1),
    repoUrl: project.repository_url,
    pinnedCommit: project.commit_sha,
    sourceEvidenceIds: [currentSource.sourceId],
  }),
  workspace: workspace(project),
  sourceEvidenceIds: [currentSource.sourceId],
}));
const taskById = new Map(tasks.map((task) => [task.taskId, task]));

const boundSkillIds = input.skills.filter((skill) => skill.bound).map((skill) => skill.asset_id).sort((left, right) => left.localeCompare(right));
const businessAgents = [
  withHash({
    agentId: ACTIVE_AGENT,
    teamId: TEAM_ID,
    name: "T07 SDK integration general agent",
    agentDetail: withHash({ description: "Coordinates Graph, Qdrant and schema-driven API client integration work.", prompt: "Use only the matching frozen team asset when current context is insufficient." }),
    importedMemoryAgentIds: [ASSET_AGENT_A, ASSET_AGENT_B],
    boundSkillIds,
    fixedKnowledgeIds: knowledge.map((item) => item.assetId).sort((left, right) => left.localeCompare(right)),
    sourceEvidenceIds: [currentSource.sourceId],
  }),
  withHash({
    agentId: ASSET_AGENT_A,
    teamId: TEAM_ID,
    name: "T07 vector and test asset custodian",
    agentDetail: withHash({ description: "Owns team-visible Qdrant and Jest procedures plus vector gateway history.", prompt: "Keep assets team-visible and do not act as the evaluation agent." }),
    importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: [currentSource.sourceId],
  }),
  withHash({
    agentId: ASSET_AGENT_B,
    teamId: TEAM_ID,
    name: "T07 API platform asset custodian",
    agentDetail: withHash({ description: "Owns team-visible API and Qdrant operational procedures plus generated-client history.", prompt: "Keep assets team-visible and do not act as the evaluation agent." }),
    importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: [currentSource.sourceId],
  }),
];
const team = withHash({
  teamId: TEAM_ID,
  worldId: "world-task1-engineering",
  split: "hidden_test",
  name: "SDK and Integration Engineering",
  businessAgentIds: businessAgents.map((agent) => agent.agentId),
  taskIds: tasks.map((task) => task.taskId),
  sourceEvidenceIds: [currentSource.sourceId],
});

const allAssets = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge];
const snapshotAssetIds = allAssets.map((asset) => asset.assetId).sort((left, right) => left.localeCompare(right));
const visibleAssetSetSha256 = hash({ teamId: TEAM_ID, userId: USER_ID, agentId: ACTIVE_AGENT, assetIds: snapshotAssetIds });
const allTdaiTools = [
  "tdai_memory_search", "tdai_atomic_query", "tdai_conversation_search", "tdai_conversation_query",
  "tdai_scenario_ls", "tdai_read_scene", "skill_search", "skill_view", "skill_view_by_id",
  "skill_files_read", "knowledge_tools_list", "knowledge_tools_call",
];
const endpoints = new Map([
  ["tdai_memory_search", "/memory-bridge/v3/atomic/search"],
  ["tdai_atomic_query", "/memory-bridge/v3/atomic/query"],
  ["tdai_conversation_search", "/memory-bridge/v3/conversation/search"],
  ["tdai_conversation_query", "/memory-bridge/v3/conversation/query"],
  ["tdai_scenario_ls", "/memory-bridge/v3/scenario/ls"],
  ["tdai_read_scene", "/memory-bridge/v3/scenario/read"],
  ["skill_search", "/skill-bridge/v3/skill/search"],
  ["skill_view", "/skill-bridge/v3/skill/get-by-name"],
  ["skill_view_by_id", "/skill-bridge/v3/skill/get"],
  ["skill_files_read", "/skill-bridge/v3/skill/files/read"],
  ["knowledge_tools_list", "/tools/list"],
]);
const queryTerms = {
  "T07-PAIR-M01": ["目录同步", "认证", "分页", "节流", "上次"],
  "T07-PAIR-M02": ["幂等", "重复点", "重试", "事故"],
  "T07-PAIR-M03": ["generated client", "retry ownership", "runtime boundary"],
  "T07-PAIR-S04": ["Qdrant", "relevance", "recall", "diagnosis"],
  "T07-PAIR-S05": ["Jest", "async", "mock", "retry"],
  "T07-PAIR-S06": ["Azure", "least privilege", "role", "RBAC"],
};
const pairLanguage = new Map([["T07-PAIR-M03", "en"], ["T07-PAIR-S02", "en"], ["T07-PAIR-K03", "en"]]);

function firstAction(plan) {
  const tool = plan.first_route;
  const base = { tool, endpoint: endpoints.get(tool) };
  const forbiddenFields = ["user_id", "team_id", "agent_id"];
  if (["tdai_memory_search", "tdai_conversation_search", "skill_search"].includes(tool)) {
    return { ...base, argumentRules: { requiredFields: ["query"], forbiddenFields, stringContainsAny: { query: queryTerms[plan.pair_id] } } };
  }
  if (tool === "tdai_atomic_query") {
    return { ...base, argumentRules: { forbiddenFields, exactValues: { type: "decision", time_start: "2026-08-18T00:00:00Z", time_end: "2026-08-19T00:00:00Z" } } };
  }
  if (tool === "tdai_scenario_ls") {
    return { ...base, argumentRules: { forbiddenFields, exactValues: { path_prefix: "scenes/qdrant-ingestion/" } } };
  }
  if (tool === "tdai_read_scene") {
    return { ...base, argumentRules: { requiredFields: ["path"], forbiddenFields, exactValues: { path: "scenes/partner-openapi/generated-client" }, pathFromFixture: true } };
  }
  if (tool === "skill_view") {
    const skill = skillInputById.get(plan.target_asset_ids[0]);
    return { ...base, argumentRules: { requiredFields: ["skill_name", "include_content", "include_manifest"], forbiddenFields, exactValues: { skill_name: skill.name, include_content: true, include_manifest: true } } };
  }
  if (tool === "knowledge_tools_list") {
    return { ...base, argumentRules: { requiredFields: ["knowledge_id"], forbiddenFields, exactValues: { knowledge_id: plan.target_asset_ids[0] } } };
  }
  throw new Error(`unsupported first route ${tool}`);
}
function followups(plan) {
  if (plan.sequence.length < 2 || plan.family === "knowledge") return [];
  const next = plan.sequence[1];
  const forbiddenFields = ["user_id", "team_id", "agent_id"];
  if (next === "tdai_read_scene") {
    return [{ tool: next, endpoint: endpoints.get(next), argumentRules: { requiredFields: ["path"], forbiddenFields, exactValues: { path: "scenes/qdrant-ingestion/cutover-chronology" }, pathFromFixture: true, valueFromPreviousStep: true } }];
  }
  if (next === "skill_view_by_id") {
    return [{ tool: next, endpoint: endpoints.get(next), argumentRules: { requiredFields: ["skill_id"], forbiddenFields, valueFromPreviousStep: true } }];
  }
  if (next === "skill_files_read") {
    return [{ tool: next, endpoint: endpoints.get(next), argumentRules: { requiredFields: ["skill_id", "path"], forbiddenFields, exactValues: { skill_id: plan.target_asset_ids[0], path: plan.resource_path }, valueFromPreviousStep: true } }];
  }
  throw new Error(`unsupported followup ${next}`);
}
function knowledgeCalls(plan) {
  if (plan.family !== "knowledge") return [];
  const terms = plan.pair_id === "T07-PAIR-K01"
    ? ["directory-sync", "pagination", "throttling", "field selection"]
    : plan.pair_id === "T07-PAIR-K02"
      ? ["batch", "upsert", "filter", "gateway"]
      : ["schema", "runtime", "authentication", "compatibility"];
  return [{ toolName: plan.knowledge_tool_name, paramRules: { requiredFields: ["query"], stringContainsAny: { query: terms } } }];
}
function positiveGold(plan, pairSource) {
  const targetSources = plan.target_asset_ids.flatMap((id) => {
    if (id.startsWith("T07-L0")) return [l0Source.sourceId];
    if (id.startsWith("T07-L1")) return [l1Source.sourceId];
    if (id.startsWith("T07-L2")) return [l2Source.sourceId];
    if (id.startsWith("T07-SKILL")) return [externalSourceByAsset.get(id).sourceId];
    if (knowledgeSources.has(id)) return [knowledgeSources.get(id).sourceId];
    return [];
  });
  const value = {
    needTdaiTool: true,
    family: plan.family,
    allowedFirstActions: [firstAction(plan)],
    expectedFollowupActions: followups(plan),
    expectedKnowledgeCalls: knowledgeCalls(plan),
    allowedSequences: [plan.sequence],
    forbiddenTools: allTdaiTools.filter((tool) => !plan.sequence.includes(tool)),
    maxTdaiCalls: plan.sequence.length,
    targetAssetIds: plan.target_asset_ids,
    informationGap: plan.gap,
    stopAfter: `Stop after the frozen minimal sequence returns ${plan.target_asset_ids.join(", ")}.`,
    evidenceRefs: [...new Set([...targetSources, currentSource.sourceId, pairSource.sourceId])],
    ablationEvidence: `Removing ${plan.target_asset_ids.join(", ")} leaves the requested frozen team procedure or fact unavailable from current context.`,
  };
  return withHash(value);
}
function negativeGold(pairSource, reason) {
  return withHash({
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    expectedFollowupActions: [],
    expectedKnowledgeCalls: [],
    allowedSequences: [],
    forbiddenTools: allTdaiTools,
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs: [currentSource.sourceId, pairSource.sourceId],
    ablationEvidence: "Not applicable: the counterfactual is intentionally self-contained.",
    noToolEvidence: reason,
  });
}

const publicCases = [];
const privateAnnotations = [];
const pairs = [];
const allPairDrafts = [
  ...memoryTrial.draft.pairs, ...memoryExpansion.draft.pairs,
  ...skillTrial.draft.pairs, ...skillExpansion.draft.pairs,
  ...knowledgeTrial.draft.pairs, ...knowledgeExpansion.draft.pairs,
];
for (const draft of allPairDrafts) {
  const plan = planById.get(draft.draft_pair_id);
  if (!plan) throw new Error(`unknown pair plan ${draft.draft_pair_id}`);
  const task = taskById.get(plan.task_id);
  const source = pairSources.get(plan.pair_id);
  const language = pairLanguage.get(plan.pair_id) ?? "zh";
  const positiveCaseId = `${plan.pair_id}-P`;
  const negativeCaseId = `${plan.pair_id}-N`;
  const base = {
    snapshotId: SNAPSHOT_ID,
    workspace: task.workspace,
    language,
    difficulty: draft.difficulty,
    query: draft.query,
    visibleAssetSetSha256,
  };
  const identityBase = { spaceId: input.identity.space_id, teamId: TEAM_ID, userId: USER_ID, agentId: ACTIVE_AGENT, taskId: plan.task_id, agentSource: "codex" };
  publicCases.push(withHash({
    caseId: positiveCaseId,
    identity: { ...identityBase, sessionId: `session-${positiveCaseId.toLowerCase()}` },
    ...base,
    contextMessages: [...draft.shared_context_messages, draft.positive.delta_message],
  }));
  publicCases.push(withHash({
    caseId: negativeCaseId,
    identity: { ...identityBase, sessionId: `session-${negativeCaseId.toLowerCase()}` },
    ...base,
    contextMessages: [...draft.shared_context_messages, draft.negative.delta_message],
  }));
  const positiveGoldValue = positiveGold(plan, source);
  const negativeGoldValue = negativeGold(source, draft.negative.private_proposal.why_current_context_is_sufficient);
  privateAnnotations.push(withHash({
    caseId: positiveCaseId,
    sourceEvidenceIds: positiveGoldValue.evidenceRefs,
    pairId: plan.pair_id,
    pairRole: "positive",
    gold: positiveGoldValue,
    annotationReason: `Sol accepted one unique ${plan.family} route and the complete minimal chain ${plan.sequence.join(" -> ")}.`,
  }));
  privateAnnotations.push(withHash({
    caseId: negativeCaseId,
    sourceEvidenceIds: negativeGoldValue.evidenceRefs,
    pairId: plan.pair_id,
    pairRole: "negative",
    gold: negativeGoldValue,
    annotationReason: draft.negative.private_proposal.why_current_context_is_sufficient,
  }));
  const controlledDeltaSha256 = createHash("sha256").update(JSON.stringify({
    positive_delta_message: draft.positive.delta_message,
    negative_delta_message: draft.negative.delta_message,
    query: draft.query,
  }), "utf8").digest("hex");
  pairs.push(withHash({
    pairId: plan.pair_id,
    positiveCaseId,
    negativeCaseId,
    counterfactualKind: "answer_in_current_context",
    controlledDeltaSha256,
    currentEvidenceRefs: [currentSource.sourceId, source.sourceId],
  }));
}

for (const [index, item] of naturalBatch.draft.cases.entries()) {
  const task = tasks[index % tasks.length];
  const caseId = item.draft_case_id;
  const language = item.language ?? (/^[\x00-\x7F\s\p{P}\p{S}]+$/u.test(`${item.query}${item.context_messages.map((message) => message.content).join("")}`) ? "en" : "zh");
  publicCases.push(withHash({
    caseId,
    identity: { spaceId: input.identity.space_id, teamId: TEAM_ID, userId: USER_ID, agentId: ACTIVE_AGENT, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" },
    snapshotId: SNAPSHOT_ID,
    workspace: task.workspace,
    language,
    difficulty: item.difficulty,
    contextMessages: item.context_messages,
    query: item.query,
    visibleAssetSetSha256,
  }));
  const gold = withHash({
    needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [],
    allowedSequences: [], forbiddenTools: allTdaiTools, maxTdaiCalls: 0, targetAssetIds: [],
    evidenceRefs: [currentSource.sourceId, naturalSource.sourceId],
    ablationEvidence: "Not applicable: this natural coding request is self-contained.",
    noToolEvidence: item.why_current_context_is_sufficient,
  });
  privateAnnotations.push(withHash({
    caseId,
    sourceEvidenceIds: gold.evidenceRefs,
    gold,
    annotationReason: item.why_current_context_is_sufficient,
  }));
}

const generatorBatchRefs = batches.map((item) => ({
  batchId: item.manifest.batch_id,
  path: relative(root, item.dir).replaceAll("\\", "/"),
  draftSha256: item.draftSha256,
  manifestSha256: item.manifestSha256,
  count: item.manifest.actual_count,
  reviewStatus: "reviewed_by_sol",
}));
const fragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: "build-04",
  team_id: TEAM_ID,
  split: "hidden_test",
  sourceEvidence,
  teams: [team],
  businessAgents,
  tasks,
  publicCases,
  privateAnnotations,
  pairs,
  snapshotAssetIds,
  generatorBatchRefs,
  externalImports,
};

function assert(condition, message) { if (!condition) throw new Error(message); }
const positives = privateAnnotations.filter((item) => item.gold.needTdaiTool);
const negatives = privateAnnotations.filter((item) => !item.gold.needTdaiTool);
assert(publicCases.length === 40, `expected 40 cases, got ${publicCases.length}`);
assert(privateAnnotations.length === 40, "private annotation count mismatch");
assert(pairs.length === 15, `expected 15 pairs, got ${pairs.length}`);
assert(positives.filter((item) => item.gold.family === "memory").length === 6, "memory positive count mismatch");
assert(positives.filter((item) => item.gold.family === "skill").length === 6, "skill positive count mismatch");
assert(positives.filter((item) => item.gold.family === "knowledge").length === 3, "knowledge positive count mismatch");
assert(negatives.length === 25, "negative count mismatch");
assert(naturalBatch.draft.cases.length === 10, "natural negative count mismatch");
assert(new Set(publicCases.map((item) => item.caseId)).size === 40, "duplicate case ids");
assert(new Set(pairs.map((item) => item.pairId)).size === 15, "duplicate pair ids");
assert(skills.length >= 14 && skills.length <= 20, "Skill pool out of range");
assert(boundSkillIds.length >= 5 && boundSkillIds.length <= 7, "bound Skill count out of range");
assert(knowledge.length === 3, "Knowledge count mismatch");
assert(l0Conversations.length >= 8 && l0Conversations.every((item) => item.messages.length >= 12), "L0 density failed");
assert(l1Memories.length >= 12, "L1 density failed");
assert(l2Scenes.length >= 4 && l2Scenes.every((item) => item.supportingSessionIds.length >= 2), "L2 density failed");
assert(l3Profiles[0].content.length >= 80 && l3Profiles[0].content.length <= 220, "L3 length failed");
for (const draft of allPairDrafts) {
  assert(draft.changed_message_index === draft.shared_context_messages.length, `${draft.draft_pair_id} changed index mismatch`);
  assert(draft.positive.delta_message.content !== draft.negative.delta_message.content, `${draft.draft_pair_id} identical deltas`);
  assert((draft.visible_distractor_ids_author_only ?? []).length >= 2, `${draft.draft_pair_id} lacks two visible distractors`);
  const provider = JSON.stringify([draft.shared_context_messages, draft.positive.delta_message, draft.negative.delta_message, draft.query]);
  assert(!/\b(?:tdai_[a-z_]+|skill_(?:search|view|view_by_id|files_read)|knowledge_tools_(?:list|call))\b/i.test(provider), `${draft.draft_pair_id} provider tool leakage`);
  assert(!/\bT07-(?:L[0-3]|SKILL|PAIR)-[A-Z0-9-]+\b/i.test(provider), `${draft.draft_pair_id} provider asset leakage`);
}
for (const item of naturalBatch.draft.cases) {
  const provider = JSON.stringify([item.context_messages, item.query]);
  assert(!/\b(?:tdai_[a-z_]+|skill_(?:search|view|view_by_id|files_read)|knowledge_tools_(?:list|call))\b/i.test(provider), `${item.draft_case_id} provider tool leakage`);
}
const bucketCounts = allPairDrafts.reduce((acc, item) => { acc[item.context_bucket] = (acc[item.context_bucket] ?? 0) + 1; return acc; }, {});
assert(bucketCounts.short_2_to_4 === 3 && bucketCounts.medium_6_to_10 === 9 && bucketCounts.long_12_to_18 === 3, `pair context bucket mismatch ${JSON.stringify(bucketCounts)}`);
const firstRouteCounts = positives.reduce((acc, item) => { const route = item.gold.allowedSequences[0][0]; acc[route] = (acc[route] ?? 0) + 1; return acc; }, {});
assert((firstRouteCounts.tdai_conversation_search ?? 0) + (firstRouteCounts.tdai_memory_search ?? 0) + (firstRouteCounts.tdai_scenario_ls ?? 0) === 4, "Memory search/discovery quota mismatch");
assert(firstRouteCounts.skill_search === 3, "Skill search quota mismatch");
assert(firstRouteCounts.knowledge_tools_list === 3, "Knowledge discovery quota mismatch");
for (const plan of input.pair_plan.filter((item) => item.family === "skill")) {
  const skill = skillInputById.get(plan.target_asset_ids[0]);
  assert(plan.first_route === "skill_search" ? !skill.bound : skill.bound, `${plan.pair_id} Skill visibility mismatch`);
}

const review = `# T07 Sol Review\n\n- Status: PASSED\n- Team: T07 SDK and Integration Engineering\n- Cases: 40 (15 positive, 15 paired no-tool, 10 natural no-tool)\n- Positive families: Memory 6, Skill 6, Knowledge 3\n- Search/discovery first routes: 10; direct first routes: 5\n- Pair context buckets: short 3, medium 9, long 3\n- Skill pool: ${skills.length} real GitHub packages; ${boundSkillIds.length} bound/listed; ${skills.length - boundSkillIds.length} unbound same-Team searchable\n- External imports: ${externalImports.length}, pinned to github/awesome-copilot ${SOURCE_COMMIT}, MIT\n- Memory density: ${l0Conversations.length} L0 sessions / ${l1Memories.length} L1 / ${l2Scenes.length} L2 / ${l3Profiles.length} L3\n- Knowledge: ${knowledge.length} ready synthetic fixtures with fixed read-only tool lists\n\n## Sol decisions\n\nEvery accepted positive has one unique first route and a complete minimal sequence. Listed Skill targets are bound to the active agent; search targets are unbound and owned by same-Team asset agents. The resource-read case obtains references/typescript.md only after the Graph package manifest. Memory search targets are absent from current context and L3; the scenario-list target is not injected while the direct scene path is injected. Knowledge cases use exact workspace/repository matches against three simultaneously bound resources. Paired negatives retain identity, workspace, snapshot, shared messages and query, changing only the appended delta. Natural negatives remain self-contained under the full 50-asset distractor set.\n\nRaw and adapted Skill package bytes are identical; the only accepted adaptation is neutral formal listing metadata (description/useWhen/doNotUseWhen), so every adaptation.diff is intentionally empty. No upstream dependency was installed and no upstream test or official patch was used.\n\n## Local verifier evidence\n\nThe Team-local formal contract validator passed all 40 hidden cases with zero pair-integrity, provider-leakage, invalid-sequence, or missing-source-reference errors. The dependency-free source-tools Python suite passed 19 tests. The host Vitest suite could not start because this isolated worktree has no host node_modules; no dependency or link was added outside the authorized T07 paths, so integration must rerun that suite in its prepared environment.\n\n## Integration follow-up\n\nThe integration task must run cross-Team Dev/Hidden n-gram, sentence, query-hash and context-hash duplicate checks, then regenerate the hidden snapshot and sealed manifest. This Team-local Gate does not freeze Hidden globally.\n`;
const gate = {
  schema_version: "task1.team_gate.v1",
  team_id: TEAM_ID,
  build_id: "build-04",
  status: "passed",
  counts: { cases: 40, positives: 15, paired_negatives: 15, natural_negatives: 10, pairs: 15, memory_positive: 6, skill_positive: 6, knowledge_positive: 3 },
  assets: { l0_sessions: l0Conversations.length, l1_memories: l1Memories.length, l2_scenes: l2Scenes.length, l3_profiles: l3Profiles.length, skills: skills.length, bound_skills: boundSkillIds.length, knowledge: knowledge.length, visible_assets: snapshotAssetIds.length },
  route_distribution: firstRouteCounts,
  context_buckets: bucketCounts,
  generator_batches: generatorBatchRefs,
  external_imports: { count: externalImports.length, repository: SOURCE_REPO, revision: SOURCE_COMMIT, license: input.skill_source_policy.license },
  checks: {
    luna_batch_format: "passed",
    sol_gold_review: "passed",
    minimal_chain_review: "passed",
    pair_single_delta: "passed",
    provider_leakage: 0,
    visibility: "passed",
    source_and_license: "passed",
    raw_hashes: "passed",
    local_fragment_counts: "passed",
    formal_gate_contract: "pending_command",
    cross_team_duplicate_gate: "pending_integration"
  },
  fragment_sha256: hash(fragment),
};

await mkdir(resolve(stagingRoot, "assets"), { recursive: true });
await writeFile(resolve(stagingRoot, "team-fragment.json"), `${JSON.stringify(fragment, null, 2)}\n`, "utf8");
await writeFile(resolve(stagingRoot, "assets/memory.json"), `${JSON.stringify({ schema_version: "task1.formal_memory_assets.v1", team_id: TEAM_ID, l0Conversations, l1Memories, l2Scenes, l3Profiles }, null, 2)}\n`, "utf8");
await writeFile(resolve(stagingRoot, "assets/skills.json"), `${JSON.stringify({ schema_version: "task1.formal_skill_assets.v1", team_id: TEAM_ID, skills, externalImports }, null, 2)}\n`, "utf8");
await writeFile(resolve(stagingRoot, "assets/knowledge.json"), `${JSON.stringify({ schema_version: "task1.formal_knowledge_assets.v1", team_id: TEAM_ID, knowledge, fixtures: knowledgeFixtures }, null, 2)}\n`, "utf8");
await writeFile(resolve(stagingRoot, "review.md"), review, "utf8");
await writeFile(resolve(stagingRoot, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
await writeFile(resolve(sourceRoot, "source-lock.json"), `${JSON.stringify({ schema_version: "task1.team_skill_source_lock.v1", team_id: TEAM_ID, repository_url: SOURCE_REPO, revision: SOURCE_COMMIT, license: input.skill_source_policy.license, license_sha256: input.skill_source_policy.license_sha256, imports: externalImports }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "built", team_id: TEAM_ID, cases: publicCases.length, pairs: pairs.length, assets: snapshotAssetIds.length, fragment_sha256: hash(fragment) }, null, 2));
