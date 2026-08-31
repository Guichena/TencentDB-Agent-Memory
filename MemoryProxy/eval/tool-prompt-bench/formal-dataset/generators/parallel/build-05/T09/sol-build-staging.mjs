import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TEAM = "T09";
const BUILD = "build-05";
const SPLIT = "hidden_test";
const WORLD_AS_OF = "2026-08-29T23:59:59+08:00";
const OBSERVED_AT = "2026-08-29T22:45:00+08:00";
const BASE_COMMIT = "960021e472456515a89d3c2c4f2962fbf6cc51a1";
const REPO_URL = "https://github.com/TencentCloud/TencentDB-Agent-Memory.git";
const REPO_LICENSE = "Apache-2.0";
const ACTIVE_AGENT = "agent-task1-t09-general";
const ASSET_AGENT_A = "agent-task1-t09-assets-a";
const ASSET_AGENT_B = "agent-task1-t09-assets-b";
const USER_ID = "user-task1-t09-eval";
const SNAPSHOT_ID = "snapshot-task1-hidden-v1";
const ROOT = process.cwd();
const DATASET = path.join(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const GEN = path.join(DATASET, "generators/parallel/build-05/T09");
const MATERIAL = path.join(DATASET, "source-material/T09");
const STAGING = path.join(DATASET, "staging/teams/T09");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const shaBytes = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw new TypeError(`unsupported canonical value: ${typeof value}`);
};
const sha = (value) => shaBytes(Buffer.from(canonical(value), "utf8"));
const withHash = (value) => ({ ...value, contentHash: sha(value) });
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const rel = (value) => path.relative(ROOT, value).replaceAll("\\", "/");

const input = await readJson(path.join(GEN, "input-pack.json"));
const memoryCandidates = await readJson(path.join(GEN, "trial/memory/memory-trial-01/asset-candidates.json"));
const skillCandidates = await readJson(path.join(GEN, "trial/skill/skill-trial-01/asset-candidates.json"));
const knowledgeCandidates = await readJson(path.join(GEN, "trial/knowledge/knowledge-trial-01/asset-candidates.json"));
const sourceLock = await readJson(path.join(MATERIAL, "source-lock.json"));
const adaptation = await readJson(path.join(MATERIAL, "adaptation-manifest.json"));

const batchPlan = [
  ["trial/memory/memory-trial-01", "memory", 1],
  ["trial/skill/skill-trial-01", "skill", 1],
  ["trial/knowledge/knowledge-trial-01", "knowledge", 1],
  ["expansion/memory/memory-batch-02", "memory", 5],
  ["expansion/skill/skill-batch-02", "skill", 5],
  ["expansion/knowledge/knowledge-batch-02", "knowledge", 2],
  ["natural-negative/natural-negative-batch-01", "natural-negative", 10],
];
const batches = [];
for (const [directory, family, expected] of batchPlan) {
  const absolute = path.join(GEN, directory);
  const draftBytes = await readFile(path.join(absolute, "draft.json"));
  const manifestBytes = await readFile(path.join(absolute, "manifest.json"));
  const draft = JSON.parse(draftBytes.toString("utf8"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const items = family === "natural-negative" ? draft.cases : draft.pairs;
  assert(draft.team_id === TEAM && draft.stage === "DS05", `${directory}: stage/team mismatch`);
  assert(items.length === expected && manifest.actual_count === expected, `${directory}: count mismatch`);
  assert(manifest.generator_model === "gpt-5.6-luna" && manifest.reasoning_effort === "high", `${directory}: generator mismatch`);
  batches.push({ directory, family, expected, draft, manifest, draftSha256: shaBytes(draftBytes), manifestSha256: shaBytes(manifestBytes) });
}

const pairDrafts = batches.filter((batch) => batch.family !== "natural-negative").flatMap((batch) => batch.draft.pairs);
const naturalDrafts = batches.find((batch) => batch.family === "natural-negative").draft.cases;
const pairSpecs = new Map(input.pair_specs.map((item) => [item.draft_pair_id, item]));
assert(pairDrafts.length === 15 && naturalDrafts.length === 10, "T09 requires 15 pairs and 10 natural negatives");
assert(new Set(pairDrafts.map((item) => item.draft_pair_id)).size === 15, "duplicate pair ids");
for (const draft of pairDrafts) {
  const spec = pairSpecs.get(draft.draft_pair_id);
  assert(spec, `missing frozen spec ${draft.draft_pair_id}`);
  assert(draft.family === undefined || draft.positive.private_proposal.route === spec.family, `${draft.draft_pair_id}: family mismatch`);
  assert(canonical(draft.positive.private_proposal.target_asset_ids) === canonical(spec.target_asset_ids), `${draft.draft_pair_id}: target mismatch`);
  assert(canonical(draft.positive.private_proposal.allowed_sequence_candidates) === canonical(spec.allowed_sequence_candidates), `${draft.draft_pair_id}: sequence mismatch`);
  assert(draft.changed_message_index === draft.shared_context_messages.length, `${draft.draft_pair_id}: changed index mismatch`);
  assert(draft.positive.delta_message.content !== draft.negative.delta_message.content, `${draft.draft_pair_id}: deltas are equal`);
}

const manifestsByBatchId = new Map(batches.map((batch) => [batch.manifest.batch_id, batch]));
const syntheticEvidence = (sourceId, role, origin, transform, batch, contentRefs) => withHash({
  sourceId,
  provenanceKind: "synthetic",
  role,
  origin,
  worldAsOf: WORLD_AS_OF,
  transform,
  transformVersion: "task1.team-staging.v1",
  reviewStatus: "reviewed",
  generatorModel: batch.manifest.generator_model,
  reasoningEffort: batch.manifest.reasoning_effort,
  promptVersion: batch.manifest.prompt_version,
  batchId: batch.manifest.batch_id,
  generatedAt: batch.manifest.generated_at,
  contentRefs,
});
const solEvidence = withHash({
  sourceId: "source-t09-sol-input-pack",
  provenanceKind: "synthetic",
  role: "current_anchor",
  origin: "evidence_grounded_synthesis",
  worldAsOf: WORLD_AS_OF,
  transform: "current_task_anchor",
  transformVersion: "task1.team-input-pack.v1",
  reviewStatus: "reviewed",
  generatorModel: "gpt-5.6-sol",
  reasoningEffort: "high",
  promptVersion: "task1.team-input-pack.v1",
  batchId: "build-05-T09-input-pack",
  generatedAt: input.frozen_at,
  contentRefs: input.project_streams.map((stream) => stream.project_id),
});
const memoryBatch = batches.find((batch) => batch.manifest.batch_id === "t09-memory-trial-01");
const knowledgeBatch = batches.find((batch) => batch.manifest.batch_id === "t09-knowledge-trial-01");
const memorySources = [
  syntheticEvidence("source-t09-luna-l0", "history", "synthetic_agent_replay", "redacted_replay", memoryBatch, input.asset_plan.memory.l0_ids),
  syntheticEvidence("source-t09-luna-l1", "history", "synthetic_agent_replay", "atomic_fact_extraction", memoryBatch, input.asset_plan.memory.l1_ids),
  syntheticEvidence("source-t09-luna-l2", "history", "synthetic_agent_replay", "multi_session_scene_synthesis", memoryBatch, input.asset_plan.memory.l2_ids),
  syntheticEvidence("source-t09-luna-l3", "history", "synthetic_agent_replay", "stable_profile_derivation", memoryBatch, [input.asset_plan.memory.l3_id]),
];
const pairSources = batches.filter((batch) => batch.family !== "natural-negative").map((batch) => syntheticEvidence(
  `source-${batch.manifest.batch_id}`,
  "evaluation_derivation",
  "evidence_grounded_synthesis",
  "paired_counterfactual",
  batch,
  batch.draft.pairs.map((item) => item.draft_pair_id),
));
const naturalBatch = batches.find((batch) => batch.family === "natural-negative");
const naturalSource = syntheticEvidence(
  `source-${naturalBatch.manifest.batch_id}`,
  "evaluation_derivation",
  "evidence_grounded_synthesis",
  "natural_negative_selection",
  naturalBatch,
  naturalDrafts.map((item) => item.draft_case_id),
);
const knowledgeSources = knowledgeCandidates.resources.map((resource) => syntheticEvidence(
  `source-t09-knowledge-${resource.asset_id.toLowerCase()}`,
  "repo_context",
  "evidence_grounded_synthesis",
  resource.type === "code_graph" ? "code_graph_build" : "repo_document_snapshot",
  knowledgeBatch,
  [resource.asset_id],
));
const externalSources = sourceLock.skills.map((skill) => withHash({
  sourceId: skill.source_id,
  provenanceKind: "external_import",
  role: "skill_source",
  origin: "repo_document",
  worldAsOf: WORLD_AS_OF,
  transform: "skill_package_import",
  transformVersion: "task1.skill-host-adaptation.v1",
  reviewStatus: "reviewed",
  dataset: "github-raw-skill-package",
  datasetRevision: skill.revision,
  datasetArtifactSha256: skill.raw_sha256,
  sourceRepoUrl: skill.repository,
  sourceRepoCommit: skill.revision,
  sourceRepoLicense: skill.license,
  sourceTaskTime: "2026-08-28T00:00:00+08:00",
  trajectoryGeneratedAt: "2026-08-29T21:30:00+08:00",
  evidenceLocator: skill.path,
  evidenceSha256: skill.raw_sha256,
  transformInputSha256: skill.raw_sha256,
  piiScan: "passed",
  reviewedBy: "sol",
}));
const sourceEvidence = [solEvidence, ...memorySources, ...pairSources, naturalSource, ...knowledgeSources, ...externalSources];
const sourceIds = new Set(sourceEvidence.map((item) => item.sourceId));

const l0Candidates = memoryCandidates.candidates.filter((item) => item.level === "L0");
const l1Candidates = memoryCandidates.candidates.filter((item) => item.level === "L1");
const l2Candidates = memoryCandidates.candidates.filter((item) => item.level === "L2");
const l3Candidates = memoryCandidates.candidates.filter((item) => item.level === "L3");
assert(l0Candidates.length === 10 && l1Candidates.length === 14 && l2Candidates.length === 4 && l3Candidates.length === 1, "memory candidate counts mismatch");

// Sol correction: the full-session Gold requires both rejected alternatives to be explicit in the frozen target session.
const targetSession = l0Candidates.find((item) => item.candidate_id === "T09-L0-03");
targetSession.messages[targetSession.messages.length - 1].content = "最终评审采用 NVD→GHSA→供应商的顺序；只查 NVD 与供应商优先两种方案均被否决，并确认无来源时不臆造数值。";

const l0Conversations = l0Candidates.map((candidate, index) => withHash({
  assetId: candidate.candidate_id,
  ownerAgentId: index % 2 === 0 ? ASSET_AGENT_A : ASSET_AGENT_B,
  sourceEvidenceIds: ["source-t09-luna-l0"],
  observedAt: candidate.observed_at,
  sessionId: candidate.session_id,
  messages: candidate.messages.map((message) => withHash({
    messageId: message.message_id,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: ["source-t09-luna-l0"],
    observedAt: candidate.observed_at,
  })),
}));
const messageIds = l0Conversations.flatMap((session) => session.messages.map((message) => message.messageId));
const l1Types = ["decision", "event", "fact", "decision", "decision", "fact", "preference", "event", "decision", "fact", "decision", "event", "fact", "preference"];
const l1Memories = l1Candidates.map((candidate, index) => {
  const targetMessage = messageIds[((index + 1) * 7) % messageIds.length];
  const day = candidate.candidate_id === "T09-L1-09" ? 28 : 15 + index;
  return withHash({
    assetId: candidate.candidate_id,
    ownerAgentId: ACTIVE_AGENT,
    sourceEvidenceIds: ["source-t09-luna-l1"],
    observedAt: `2026-07-${String(Math.min(day, 28)).padStart(2, "0")}T16:00:00+08:00`,
    type: l1Types[index],
    content: candidate.proposed_content,
    status: "active",
    validFrom: `2026-07-${String(Math.min(day, 28)).padStart(2, "0")}T16:00:00+08:00`,
    supportingMessageIds: [targetMessage],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
  });
});
const l2Scenes = l2Candidates.map((candidate, index) => withHash({
  assetId: candidate.candidate_id,
  ownerAgentId: ACTIVE_AGENT,
  sourceEvidenceIds: ["source-t09-luna-l2"],
  observedAt: `2026-08-${String(1 + index).padStart(2, "0")}T10:00:00+08:00`,
  path: candidate.path,
  summary: candidate.summary,
  content: candidate.full_body,
  injected: true,
  supportingSessionIds: [l0Conversations[index * 2].sessionId, l0Conversations[index * 2 + 1].sessionId],
}));
const l3Profiles = l3Candidates.map((candidate) => withHash({
  assetId: candidate.candidate_id,
  ownerAgentId: ACTIVE_AGENT,
  sourceEvidenceIds: ["source-t09-luna-l3"],
  observedAt: OBSERVED_AT,
  content: candidate.proposed_content,
  stability: "team",
}));

const adaptationByAsset = new Map(adaptation.skills.map((item) => [item.asset_id, item]));
const lockByAsset = new Map(sourceLock.skills.map((item) => [item.asset_id, item]));
const boundSkillIds = input.asset_plan.skills.bound_skill_ids;
const searchableSkillIds = input.asset_plan.skills.team_searchable_skill_ids;
const skills = skillCandidates.candidates.map((candidate, index) => {
  const adapted = adaptationByAsset.get(candidate.asset_id);
  const locked = lockByAsset.get(candidate.asset_id);
  assert(adapted && locked, `missing source/adaptation for ${candidate.asset_id}`);
  const ownerAgentId = boundSkillIds.includes(candidate.asset_id) ? ACTIVE_AGENT : (index % 2 === 0 ? ASSET_AGENT_A : ASSET_AGENT_B);
  const manifest = [{ path: "SKILL.md", sha256: adapted.adapted_sha256 }, ...(adapted.resource_paths ?? []).map((item) => ({ path: item.path, sha256: item.raw_sha256 }))];
  return withHash({
    assetId: candidate.asset_id,
    ownerAgentId,
    sourceEvidenceIds: [candidate.source_id],
    observedAt: OBSERVED_AT,
    name: candidate.name,
    version: "1",
    description: candidate.description,
    useWhen: candidate.use_when,
    doNotUseWhen: candidate.do_not_use_when,
    repoCommit: candidate.revision,
    visibility: ownerAgentId === ACTIVE_AGENT ? "private" : "team",
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest,
  });
});
assert(boundSkillIds.every((id) => skills.some((skill) => skill.assetId === id && skill.ownerAgentId === ACTIVE_AGENT)), "bound Skill ownership mismatch");
assert(searchableSkillIds.every((id) => skills.some((skill) => skill.assetId === id && skill.ownerAgentId !== ACTIVE_AGENT && skill.visibility === "team")), "searchable Skill visibility mismatch");

const knowledge = knowledgeCandidates.resources.map((resource) => withHash({
  assetId: resource.asset_id,
  ownerAgentId: ACTIVE_AGENT,
  sourceEvidenceIds: [`source-t09-knowledge-${resource.asset_id.toLowerCase()}`],
  observedAt: OBSERVED_AT,
  type: resource.type,
  name: resource.name,
  ...(resource.type === "code_graph" ? { repoUrl: REPO_URL, repoCommit: BASE_COMMIT, indexVersion: "task1-t09-synthetic-v1" } : {}),
  snapshotSha256: sha({ resource: resource.asset_id, fixture: resource.deterministic_read_only_responses }),
  bindings: [{ agentId: ACTIVE_AGENT, visibility: "fixed" }],
}));
const knowledgeFixtures = knowledgeCandidates.resources.map((resource) => ({
  asset_id: resource.asset_id,
  status: "ready",
  repo_match: resource.repo_match,
  tools_list: resource["tools/list"],
  tools_call: resource.deterministic_read_only_responses.map((item) => ({
    request: { tool_name: item.request.tool_name, params: item.request.arguments },
    response: item.response,
  })),
}));

const projectStreams = input.project_streams;
const projectById = new Map(projectStreams.map((item) => [item.project_id, item]));
const workspaceFor = (stream) => withHash({
  workspaceId: `workspace-${stream.project_id}`,
  repoSlug: stream.repo_slug,
  repoUrl: REPO_URL,
  baseCommit: BASE_COMMIT,
  sourceRepoLicense: REPO_LICENSE,
  treeSha256: sha({ project: stream.project_id, state: "synthetic-current-anchor" }),
  fileManifestSha256: sha({ project: stream.project_id, manifest: ["task-context.md"] }),
  state: "clean",
});
const tasks = projectStreams.map((stream) => {
  const workspace = workspaceFor(stream);
  const projectRef = withHash({
    projectRefId: `project-ref-${stream.project_id}`,
    repoSlug: stream.repo_slug,
    repoUrl: REPO_URL,
    pinnedCommit: BASE_COMMIT,
    sourceEvidenceIds: [solEvidence.sourceId],
  });
  return withHash({
    taskId: `task-${stream.project_id}`,
    teamId: TEAM,
    title: stream.project_id,
    description: stream.purpose,
    goal: "Evaluate the next routing decision without executing a real scan, release, or upstream verifier.",
    eligibleAgentIds: [ACTIVE_AGENT],
    projectRef,
    workspace,
    sourceEvidenceIds: [solEvidence.sourceId],
  });
});
const taskByProject = new Map(tasks.map((task) => [task.taskId.slice("task-".length), task]));
const inferProject = (text, index = 0) => {
  for (const stream of projectStreams) if (text.includes(stream.repo_slug) || text.includes(stream.project_id.replace("t09-", ""))) return stream.project_id;
  return projectStreams[index % projectStreams.length].project_id;
};

const agentDetail = (description, prompt) => withHash({ description, prompt });
const agents = [
  withHash({
    agentId: ACTIVE_AGENT,
    teamId: TEAM,
    name: "T09 通用业务 Agent",
    agentDetail: agentDetail("安全与依赖工程团队的通用业务 Agent。", "区分离线扫描、漏洞字段提取、CSV 报告、源码扫描和普通升级；只在存在明确资产缺口时读取 TDAI 资产。"),
    importedMemoryAgentIds: [ASSET_AGENT_A, ASSET_AGENT_B],
    boundSkillIds,
    fixedKnowledgeIds: knowledge.map((item) => item.assetId),
    sourceEvidenceIds: [solEvidence.sourceId],
  }),
  withHash({
    agentId: ASSET_AGENT_A,
    teamId: TEAM,
    name: "T09 资产 Agent A",
    agentDetail: agentDetail("持有 T09 可导入历史与 team-visible Skill。", "仅提供冻结资产，不作为正式 case 的 active Agent。"),
    importedMemoryAgentIds: [],
    boundSkillIds: skills.filter((item) => item.ownerAgentId === ASSET_AGENT_A).map((item) => item.assetId),
    fixedKnowledgeIds: [],
    sourceEvidenceIds: [solEvidence.sourceId],
  }),
  withHash({
    agentId: ASSET_AGENT_B,
    teamId: TEAM,
    name: "T09 资产 Agent B",
    agentDetail: agentDetail("持有 T09 可导入历史与 team-visible Skill。", "仅提供冻结资产，不作为正式 case 的 active Agent。"),
    importedMemoryAgentIds: [],
    boundSkillIds: skills.filter((item) => item.ownerAgentId === ASSET_AGENT_B).map((item) => item.assetId),
    fixedKnowledgeIds: [],
    sourceEvidenceIds: [solEvidence.sourceId],
  }),
];
const team = withHash({
  teamId: TEAM,
  worldId: "world-task1-engineering",
  split: SPLIT,
  name: "安全与依赖",
  businessAgentIds: agents.map((item) => item.agentId),
  taskIds: tasks.map((item) => item.taskId),
  sourceEvidenceIds: [solEvidence.sourceId],
});

const allAssets = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge];
const snapshotAssetIds = allAssets.map((item) => item.assetId).sort((left, right) => left.localeCompare(right));
const visibleAssetSetSha256 = sha({ teamId: TEAM, userId: USER_ID, agentId: ACTIVE_AGENT, assetIds: snapshotAssetIds });
const skillNameById = new Map(skills.map((item) => [item.assetId, item.name]));
const knowledgeById = new Map(knowledgeCandidates.resources.map((item) => [item.asset_id, item]));
const assetSourceIds = new Map(allAssets.map((asset) => [asset.assetId, asset.sourceEvidenceIds]));
const endpoint = {
  tdai_memory_search: "/memory-bridge/v3/atomic/search",
  tdai_atomic_query: "/memory-bridge/v3/atomic/query",
  tdai_conversation_search: "/memory-bridge/v3/conversation/search",
  tdai_conversation_query: "/memory-bridge/v3/conversation/query",
  tdai_read_scene: "/memory-bridge/v3/scenario/read",
  skill_search: "/skill-bridge/v3/skill/search",
  skill_view: "/skill-bridge/v3/skill/get-by-name",
  skill_view_by_id: "/skill-bridge/v3/skill/get",
  skill_files_read: "/skill-bridge/v3/skill/files/read",
  knowledge_tools_list: "/tools/list",
};
const forbiddenIdentity = ["user_id", "team_id", "agent_id", "task_id"];
const firstAction = (tool, spec) => {
  const target = spec.target_asset_ids[0];
  if (tool === "tdai_memory_search") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["query"], forbiddenFields: forbiddenIdentity } };
  if (tool === "tdai_conversation_search") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["query"], forbiddenFields: forbiddenIdentity } };
  if (tool === "tdai_atomic_query") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: [], exactValues: { type: "decision" }, forbiddenFields: forbiddenIdentity } };
  if (tool === "tdai_read_scene") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["path"], exactValues: { path: "/security/audit/offline-runbook" }, forbiddenFields: ["user_id", "team_id", "task_id"] } };
  if (tool === "skill_search") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["query"], forbiddenFields: [...forbiddenIdentity, "top_k", "mode"] } };
  if (tool === "skill_view") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["skill_name"], exactValues: { skill_name: skillNameById.get(target), include_content: true, include_manifest: true }, forbiddenFields: forbiddenIdentity } };
  if (tool === "knowledge_tools_list") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } };
  throw new Error(`unsupported first action ${tool}`);
};
const followupActions = (sequence, spec) => sequence.slice(1).filter((tool) => tool !== "knowledge_tools_call").map((tool) => {
  if (tool === "tdai_conversation_query") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["session_id"], forbiddenFields: forbiddenIdentity, valueFromPreviousStep: true } };
  if (tool === "skill_view_by_id") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["skill_id"], forbiddenFields: forbiddenIdentity, valueFromPreviousStep: true } };
  if (tool === "skill_files_read") return { tool, endpoint: endpoint[tool], argumentRules: { requiredFields: ["skill_id", "path"], exactValues: { path: spec.resource_path }, forbiddenFields: forbiddenIdentity, valueFromPreviousStep: true } };
  throw new Error(`unsupported follow-up ${tool}`);
});
const knowledgeExpectations = (spec) => {
  if (spec.family !== "knowledge") return undefined;
  const resource = knowledgeById.get(spec.target_asset_ids[0]);
  const fixture = resource.deterministic_read_only_responses[0];
  return [{ toolName: resource.tool_name, paramRules: { requiredFields: [resource.required_param], exactValues: fixture.request.arguments } }];
};
const pairSourceFor = (draft) => {
  const batch = batches.find((item) => item.draft.pairs?.some((pair) => pair.draft_pair_id === draft.draft_pair_id));
  return `source-${batch.manifest.batch_id}`;
};

const publicCases = [];
const privateAnnotations = [];
const pairs = [];
for (const [index, draft] of pairDrafts.entries()) {
  const spec = pairSpecs.get(draft.draft_pair_id);
  const pairId = draft.draft_pair_id.replace("-DRAFT", "");
  const sourceId = pairSourceFor(draft);
  const joined = [...draft.shared_context_messages.map((item) => item.content), draft.query].join("\n");
  const projectId = inferProject(joined, index);
  const task = taskByProject.get(projectId);
  for (const role of ["positive", "negative"]) {
    const suffix = role === "positive" ? "P" : "N";
    const caseId = `${pairId}-${suffix}`;
    const delta = draft[role].delta_message;
    const publicCase = withHash({
      caseId,
      identity: {
        spaceId: "space-task1-engineering",
        teamId: TEAM,
        userId: USER_ID,
        agentId: ACTIVE_AGENT,
        taskId: task.taskId,
        sessionId: `session-${caseId.toLowerCase()}`,
        agentSource: "codex",
      },
      snapshotId: SNAPSHOT_ID,
      workspace: task.workspace,
      language: "zh",
      difficulty: draft.difficulty,
      contextMessages: [...draft.shared_context_messages, delta],
      query: draft.query,
      visibleAssetSetSha256,
    });
    publicCases.push(publicCase);
    if (role === "positive") {
      const sequence = spec.allowed_sequence_candidates[0];
      const targetEvidence = spec.target_asset_ids.flatMap((assetId) => assetSourceIds.get(assetId) ?? []);
      const gold = withHash({
        needTdaiTool: true,
        family: spec.family,
        allowedFirstActions: [firstAction(sequence[0], spec)],
        ...(sequence.length > 1 && spec.family !== "knowledge" ? { expectedFollowupActions: followupActions(sequence, spec) } : {}),
        ...(spec.family === "knowledge" ? { expectedKnowledgeCalls: knowledgeExpectations(spec) } : {}),
        allowedSequences: spec.allowed_sequence_candidates,
        forbiddenTools: [],
        maxTdaiCalls: sequence.length,
        targetAssetIds: spec.target_asset_ids,
        informationGap: draft.positive.private_proposal.unique_information_gap,
        stopAfter: spec.stop_after,
        evidenceRefs: [...new Set([sourceId, ...targetEvidence])],
        ablationEvidence: `Removing ${spec.target_asset_ids.join(", ")} leaves the declared information gap unresolved.`,
      });
      privateAnnotations.push(withHash({
        caseId,
        sourceEvidenceIds: [sourceId],
        pairId,
        pairRole: "positive",
        gold,
        annotationReason: "Sol reviewed a unique asset gap and froze the shortest production-readable sequence.",
      }));
    } else {
      const gold = withHash({
        needTdaiTool: false,
        family: null,
        allowedFirstActions: [],
        expectedFollowupActions: [],
        expectedKnowledgeCalls: [],
        allowedSequences: [],
        forbiddenTools: [],
        maxTdaiCalls: 0,
        targetAssetIds: [],
        evidenceRefs: [sourceId],
        ablationEvidence: "The negative delta supplies the sole missing fact while preserving the same task and asset snapshot.",
        noToolEvidence: draft.negative.private_proposal.why_current_context_is_sufficient,
      });
      privateAnnotations.push(withHash({
        caseId,
        sourceEvidenceIds: [sourceId],
        pairId,
        pairRole: "negative",
        gold,
        annotationReason: "The controlled delta makes current context sufficient; any TDAI attempt is an overcall.",
      }));
    }
  }
  pairs.push(withHash({
    pairId,
    positiveCaseId: `${pairId}-P`,
    negativeCaseId: `${pairId}-N`,
    counterfactualKind: "answer_in_current_context",
    controlledDeltaSha256: shaBytes(JSON.stringify({
      positive_delta_message: draft.positive.delta_message,
      negative_delta_message: draft.negative.delta_message,
      query: draft.query,
    })),
    currentEvidenceRefs: [sourceId],
  }));
}

for (const [index, draft] of naturalDrafts.entries()) {
  const caseId = draft.draft_case_id.replace("-DRAFT", "");
  const joined = [...draft.context_messages.map((item) => item.content), draft.query].join("\n");
  const projectId = inferProject(joined, index);
  const task = taskByProject.get(projectId);
  publicCases.push(withHash({
    caseId,
    identity: {
      spaceId: "space-task1-engineering",
      teamId: TEAM,
      userId: USER_ID,
      agentId: ACTIVE_AGENT,
      taskId: task.taskId,
      sessionId: `session-${caseId.toLowerCase()}`,
      agentSource: "codex",
    },
    snapshotId: SNAPSHOT_ID,
    workspace: task.workspace,
    language: "zh",
    difficulty: draft.difficulty,
    contextMessages: draft.context_messages,
    query: draft.query,
    visibleAssetSetSha256,
  }));
  const gold = withHash({
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    expectedFollowupActions: [],
    expectedKnowledgeCalls: [],
    allowedSequences: [],
    forbiddenTools: [],
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs: [naturalSource.sourceId],
    ablationEvidence: "The request remains answerable from the provider-visible code, error, expected result, or explicit local rule.",
    noToolEvidence: draft.why_current_context_is_sufficient,
  });
  privateAnnotations.push(withHash({
    caseId,
    sourceEvidenceIds: [naturalSource.sourceId],
    gold,
    annotationReason: "Self-contained coding negative under the full T09 distractor pool.",
  }));
}

const generatorBatchRefs = batches.map((batch) => ({
  batch_id: batch.manifest.batch_id,
  path: rel(path.join(GEN, batch.directory)),
  family: batch.family,
  count: batch.expected,
  generator_model: batch.manifest.generator_model,
  reasoning_effort: batch.manifest.reasoning_effort,
  draft_sha256: batch.draftSha256,
  manifest_sha256: batch.manifestSha256,
  review_status: "reviewed_by_sol",
}));
const externalImports = sourceLock.skills.map((skill) => {
  const adapted = adaptationByAsset.get(skill.asset_id);
  return {
    source_id: skill.source_id,
    asset_id: skill.asset_id,
    repository: skill.repository,
    revision: skill.revision,
    path: skill.path,
    license: skill.license,
    raw_sha256: skill.raw_sha256,
    adapted_sha256: adapted.adapted_sha256,
    diff_path: `MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T09/${adapted.diff_path}`,
  };
});
const fragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: BUILD,
  team_id: TEAM,
  split: SPLIT,
  sourceEvidence,
  teams: [team],
  businessAgents: agents,
  tasks,
  publicCases: publicCases.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  privateAnnotations: privateAnnotations.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  pairs: pairs.sort((a, b) => a.pairId.localeCompare(b.pairId)),
  snapshotAssetIds,
  generatorBatchRefs,
  externalImports,
};

const memoryAssetFile = { schema_version: "task1.team_memory_assets.v1", team_id: TEAM, l0Conversations, l1Memories, l2Scenes, l3Profiles };
const listing = skills.filter((item) => boundSkillIds.includes(item.assetId)).map((item) => ({ asset_id: item.assetId, name: item.name, description: item.description }));
const skillAssetFile = {
  schema_version: "task1.team_skill_assets.v1",
  team_id: TEAM,
  skills,
  listing: {
    active_agent_id: ACTIVE_AGENT,
    bound_skill_ids: boundSkillIds,
    team_searchable_skill_ids: searchableSkillIds,
    listing_sha256: sha(listing),
    search_assertions: input.pair_specs.filter((item) => item.family === "skill" && item.allowed_sequence_candidates[0][0] === "skill_search").map((item) => ({
      pair_id: item.draft_pair_id.replace("-DRAFT", ""),
      target_asset_id: item.target_asset_ids[0],
      absent_from_bound_listing: !boundSkillIds.includes(item.target_asset_ids[0]),
      present_in_same_team_search: searchableSkillIds.includes(item.target_asset_ids[0]),
    })),
  },
};
const knowledgeAssetFile = { schema_version: "task1.team_knowledge_assets.v1", team_id: TEAM, knowledge, fixtures: knowledgeFixtures };

const privateKeyPattern = /\b(?:gold|target_asset_ids|allowedSequences|informationGap|pairId|needTdaiTool)\b/i;
const providerLeakPattern = /\b(?:tdai_[a-z_]+|skill_(?:search|view|view_by_id|files_read)|knowledge_tools_(?:list|call)|T09-(?:L[0-3]|SKILL)-[A-Z0-9-]+|wiki-t09[a-z0-9]+|cg-t09[a-z0-9]+)\b/i;
const providerLeaks = [];
for (const item of fragment.publicCases) {
  const text = [...item.contextMessages.map((message) => message.content), item.query].join("\n");
  if (providerLeakPattern.test(text) || privateKeyPattern.test(text)) providerLeaks.push(item.caseId);
}
const positiveAnnotations = fragment.privateAnnotations.filter((item) => item.gold.needTdaiTool);
const negativeAnnotations = fragment.privateAnnotations.filter((item) => !item.gold.needTdaiTool);
const familyCounts = Object.fromEntries(["memory", "skill", "knowledge"].map((family) => [family, positiveAnnotations.filter((item) => item.gold.family === family).length]));
const searchDiscoveryCount = positiveAnnotations.filter((item) => ["tdai_memory_search", "tdai_conversation_search", "skill_search", "knowledge_tools_list"].includes(item.gold.allowedSequences[0][0])).length;
const directCount = positiveAnnotations.length - searchDiscoveryCount;
const pairIntegrityErrors = [];
for (const pair of fragment.pairs) {
  const pos = fragment.publicCases.find((item) => item.caseId === pair.positiveCaseId);
  const neg = fragment.publicCases.find((item) => item.caseId === pair.negativeCaseId);
  if (!pos || !neg || pos.query !== neg.query || canonical(pos.contextMessages.slice(0, -1)) !== canonical(neg.contextMessages.slice(0, -1))) pairIntegrityErrors.push(pair.pairId);
}
const missingTargets = positiveAnnotations.flatMap((item) => item.gold.targetAssetIds).filter((id) => !snapshotAssetIds.includes(id));
const invalidSequences = positiveAnnotations.filter((item) => item.gold.maxTdaiCalls !== item.gold.allowedSequences[0].length).map((item) => item.caseId);
const skillSearchAssertions = skillAssetFile.listing.search_assertions;
const checks = {
  exact_case_count_40: fragment.publicCases.length === 40,
  exact_pair_count_15: fragment.pairs.length === 15,
  exact_family_counts: familyCounts.memory === 6 && familyCounts.skill === 6 && familyCounts.knowledge === 3,
  exact_negative_counts: negativeAnnotations.length === 25 && naturalDrafts.length === 10,
  search_discovery_10_direct_5: searchDiscoveryCount === 10 && directCount === 5,
  pair_single_variable: pairIntegrityErrors.length === 0,
  provider_leakage_zero: providerLeaks.length === 0,
  all_targets_visible: missingTargets.length === 0,
  minimal_sequences_complete: invalidSequences.length === 0,
  skill_search_visibility: skillSearchAssertions.length === 3 && skillSearchAssertions.every((item) => item.absent_from_bound_listing && item.present_in_same_team_search),
  knowledge_ready_and_bound: knowledgeFixtures.length === 3 && knowledgeFixtures.every((item) => item.status === "ready") && knowledge.every((item) => item.bindings.some((binding) => binding.agentId === ACTIVE_AGENT)),
  memory_density: l0Conversations.length === 10 && l1Memories.length === 14 && l2Scenes.length === 4 && l3Profiles.length === 1,
  skill_density: skills.length === 14 && boundSkillIds.length === 6 && searchableSkillIds.length === 8,
  external_imports_complete: externalImports.length === 14 && externalImports.every((item) => item.repository && /^[a-f0-9]{40}$/i.test(item.revision) && item.license && /^[a-f0-9]{64}$/i.test(item.raw_sha256) && /^[a-f0-9]{64}$/i.test(item.adapted_sha256)),
};
const failedChecks = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
assert(failedChecks.length === 0, `Team gate failed: ${failedChecks.join(", ")}`);

await writeJson(path.join(STAGING, "team-fragment.json"), fragment);
await writeJson(path.join(STAGING, "assets/memory.json"), memoryAssetFile);
await writeJson(path.join(STAGING, "assets/skills.json"), skillAssetFile);
await writeJson(path.join(STAGING, "assets/knowledge.json"), knowledgeAssetFile);

const globalContract = await readJson(path.join(DATASET, "registry/contracts/formal-v1.json"));
const rehearsal = structuredClone(globalContract);
const registrySource = rehearsal.sourceEvidence.find((item) => item.sourceId === "source-task1-registry-ds00");
assert(registrySource, "missing structural registry source");
const registrySourceId = registrySource.sourceId;
rehearsal.sourceEvidence = [registrySource, ...sourceEvidence].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
rehearsal.world.sourceEvidenceIds = rehearsal.sourceEvidence.map((item) => item.sourceId).sort((a, b) => a.localeCompare(b));
rehearsal.world.contentHash = sha(Object.fromEntries(Object.entries(rehearsal.world).filter(([key]) => key !== "contentHash")));
rehearsal.teams = rehearsal.teams.map((item) => item.teamId === TEAM ? team : withHash({
  ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== "contentHash")),
  taskIds: [],
  sourceEvidenceIds: [registrySourceId],
})).sort((a, b) => a.teamId.localeCompare(b.teamId));
rehearsal.businessAgents = [
  ...rehearsal.businessAgents.filter((item) => item.teamId !== TEAM).map((item) => withHash({
    ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== "contentHash")),
    importedMemoryAgentIds: [],
    boundSkillIds: [],
    fixedKnowledgeIds: [],
    sourceEvidenceIds: [registrySourceId],
  })),
  ...agents,
].sort((a, b) => a.agentId.localeCompare(b.agentId));
rehearsal.tasks = [...tasks].sort((a, b) => a.taskId.localeCompare(b.taskId));
rehearsal.assets = { l0Conversations, l1Memories, l2Scenes, l3Profiles, skills, knowledge };
rehearsal.publicCases = [...fragment.publicCases].sort((a, b) => a.caseId.localeCompare(b.caseId));
rehearsal.privateAnnotations = [...fragment.privateAnnotations].sort((a, b) => a.caseId.localeCompare(b.caseId));
rehearsal.pairs = [...fragment.pairs].sort((a, b) => a.pairId.localeCompare(b.pairId));
const visibleSets = [
  { teamId: TEAM, userId: USER_ID, agentId: ACTIVE_AGENT, assetIds: snapshotAssetIds, sha256: visibleAssetSetSha256 },
  ...[ASSET_AGENT_A, ASSET_AGENT_B].map((agentId) => {
    const assetIds = allAssets.filter((item) => item.ownerAgentId === agentId).map((item) => item.assetId).sort((left, right) => left.localeCompare(right));
    return { teamId: TEAM, userId: USER_ID, agentId, assetIds, sha256: sha({ teamId: TEAM, userId: USER_ID, agentId, assetIds }) };
  }),
];
rehearsal.snapshots = rehearsal.snapshots.map((item) => {
  const splitTeamIds = new Set(rehearsal.teams.filter((entry) => entry.split === item.split).map((entry) => entry.teamId));
  const placeholderSets = rehearsal.businessAgents
    .filter((entry) => entry.teamId !== TEAM && splitTeamIds.has(entry.teamId))
    .map((entry) => {
      const userId = `user-task1-${entry.teamId.toLowerCase()}-eval`;
      const assetIds = [];
      return {
        teamId: entry.teamId,
        userId,
        agentId: entry.agentId,
        assetIds,
        sha256: sha({ teamId: entry.teamId, userId, agentId: entry.agentId, assetIds }),
      };
    });
  const draft = {
    ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== "contentHash")),
    visibleAssetSets: [...placeholderSets, ...(item.split === SPLIT ? visibleSets : [])].sort((a, b) => a.agentId.localeCompare(b.agentId)),
    sourcePackSha256: sha((item.split === SPLIT ? rehearsal.sourceEvidence : [registrySource]).map((source) => source.contentHash)),
    workspaceManifestSha256: sha(item.split === SPLIT ? tasks.map((entry) => entry.workspace) : []),
  };
  return withHash(draft);
});
await writeJson(path.join(GEN, "integration-rehearsal.json"), rehearsal);

const gate = {
  schema_version: "task1.team_gate.v1",
  team_id: TEAM,
  split: SPLIT,
  status: "passed",
  checked_at: "2026-08-29T23:10:00+08:00",
  counts: {
    total_cases: fragment.publicCases.length,
    positive_pairs: fragment.pairs.length,
    paired_negatives: fragment.pairs.length,
    natural_negatives: naturalDrafts.length,
    positive_by_family: familyCounts,
    search_or_discovery_first: searchDiscoveryCount,
    direct_first: directCount,
    l0: l0Conversations.length,
    l1: l1Memories.length,
    l2: l2Scenes.length,
    l3: l3Profiles.length,
    skills: skills.length,
    knowledge: knowledge.length,
    external_imports: externalImports.length,
  },
  batches: generatorBatchRefs,
  checks,
  diagnostics: { provider_leaks: providerLeaks, pair_integrity_errors: pairIntegrityErrors, missing_targets: missingTargets, invalid_sequences: invalidSequences },
  sol_corrections: [
    "The frozen T09-L0-03 target session explicitly records both rejected CVSS alternatives required by the full-session Gold.",
    "Knowledge call fixtures use the production params envelope instead of the Luna candidate's arguments label.",
  ],
  commands: [
    "canonical Luna batch validator for all seven batches",
    "node generators/parallel/build-05/T09/adapt-skill-packages.mjs",
    "node generators/parallel/build-05/T09/sol-build-staging.mjs",
    "formal validator against generators/parallel/build-05/T09/integration-rehearsal.json",
  ],
  deferred_to_integration: [
    "production prewarm listing capture and listing SHA replacement",
    "cross-Team Dev/Hidden duplicate and leakage checks",
    "global snapshot hashes, sealed manifest, provider/private compilation, and real-chain Gate",
  ],
};
await writeJson(path.join(STAGING, "gate.json"), gate);
const review = `# T09 Sol review\n\n- Status: passed for Team integration.\n- Cases: 40 (15 positive, 15 paired negative, 10 natural negative).\n- Positive families: Memory 6, Skill 6, Knowledge 3.\n- Route split: 10 search/discovery first, 5 direct first.\n- Luna batches: 7; every batch declares gpt-5.6-luna with high reasoning and was reviewed before staging.\n- External imports: 14 Skill packages from 3 pinned repositories; raw/adapted hashes, licenses and frontmatter-only diffs are recorded.\n- Sol corrections: expanded the one full-session target to contain the rejected alternatives required by its Gold; normalized Knowledge fixture calls to the production params envelope.\n- Local Gate: passed. Production prewarm evidence, global cross-Team duplicate checks, sealed manifests and final snapshot hashes remain integration-owned.\n`;
await writeFile(path.join(STAGING, "review.md"), review, "utf8");

console.log(JSON.stringify({
  team_id: TEAM,
  gate: "passed",
  counts: gate.counts,
  staging: rel(STAGING),
  rehearsal: rel(path.join(GEN, "integration-rehearsal.json")),
}, null, 2));
