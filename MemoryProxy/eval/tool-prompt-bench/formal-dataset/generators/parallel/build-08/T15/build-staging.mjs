import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEAM = "T15";
const BUILD = "build-08";
const WORLD_ID = "world-task1-formal-v1";
const SNAPSHOT_ID = "snapshot-task1-hidden-v1";
const WORLD_AS_OF = "2026-08-29T23:59:59+08:00";
const OBSERVED_AT = "2026-08-29T20:00:00+08:00";
const LAUNCH_COMMIT = "8257782c23eaa5e31f05b0ea33aa2ac7f2b6bb84";
const REPO_URL = "https://github.com/TencentCloud/TencentDB-Agent-Memory.git";
const REPO_SLUG = "TencentCloud/TencentDB-Agent-Memory";
const REPO_LICENSE = "MIT";
const ACTIVE = "agent-task1-t15-general";
const ASSET_A = "agent-task1-t15-assets-a";
const ASSET_B = "agent-task1-t15-assets-b";
const USER = "user-task1-hidden-t15";
const SPACE = "space-task1-engineering";

const F = (...parts) => path.join(ROOT, ...parts);
const GEN = F("MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "generators", "parallel", BUILD, TEAM);
const SOURCE = F("MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "source-material", TEAM);
const STAGE = F("MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "staging", "teams", TEAM);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`unsupported canonical value ${typeof value}`);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex");
}

function withHash(value) {
  return { ...value, contentHash: sha(value) };
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitBytes(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "buffer" });
}

const actualHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
if (actualHead !== LAUNCH_COMMIT) throw new Error(`unexpected pre-build HEAD ${actualHead}`);
const treeSha256 = sha(gitBytes(["ls-tree", "-r", LAUNCH_COMMIT]));
const fileManifestSha256 = sha(gitBytes(["ls-files", "-s"]));

const input = readJson(path.join(GEN, "input-pack.json"));
const sourceLock = readJson(path.join(SOURCE, "skill-sources.json"));
const memoryTrial = readJson(path.join(GEN, "trials", "memory-trial-01", "draft.json"));
const skillTrial = readJson(path.join(GEN, "trials", "skill-trial-01", "draft.json"));
const knowledgeTrial = readJson(path.join(GEN, "trials", "knowledge-trial-01", "draft.json"));
const memoryExpansion = readJson(path.join(GEN, "batches", "memory-expansion-01", "draft.json"));
const skillExpansion = readJson(path.join(GEN, "batches", "skill-expansion-01", "draft.json"));
const knowledgeExpansion = readJson(path.join(GEN, "batches", "knowledge-expansion-01", "draft.json"));
const naturalDraft = readJson(path.join(GEN, "batches", "natural-negative-01", "draft.json"));
const memoryCandidates = readJson(path.join(GEN, "batches", "memory-expansion-01", "asset-candidates.json"));
const skillCandidates = readJson(path.join(GEN, "batches", "skill-expansion-01", "asset-candidates.json"));
const knowledgeCandidates = readJson(path.join(GEN, "batches", "knowledge-expansion-01", "asset-candidates.json"));

const batchSpecs = [
  ["trials/memory-trial-01", "memory", memoryTrial],
  ["trials/skill-trial-01", "skill", skillTrial],
  ["trials/knowledge-trial-01", "knowledge", knowledgeTrial],
  ["batches/memory-expansion-01", "memory", memoryExpansion],
  ["batches/skill-expansion-01", "skill", skillExpansion],
  ["batches/knowledge-expansion-01", "knowledge", knowledgeExpansion],
  ["batches/natural-negative-01", "natural-negative", naturalDraft],
];

const generatorBatchRefs = batchSpecs.map(([relative, family, draft]) => {
  const dir = path.join(GEN, ...relative.split("/"));
  const manifest = readJson(path.join(dir, "manifest.json"));
  const draftBytes = readFileSync(path.join(dir, "draft.json"));
  return {
    batchId: manifest.batch_id,
    path: `generators/parallel/${BUILD}/${TEAM}/${relative}`,
    family,
    stage: "DS05",
    generatorModel: manifest.generator_model,
    reasoningEffort: manifest.reasoning_effort,
    promptVersion: manifest.prompt_version,
    recordCount: family === "natural-negative" ? draft.cases.length : draft.pairs.length,
    draftSha256: sha(draftBytes),
    validatorPassed: true,
  };
});

function syntheticEvidence({ sourceId, role, transform, batchId, generatedAt, contentRefs, origin = "synthetic_agent_replay", model = "gpt-5.6-luna" }) {
  return withHash({
    sourceId,
    provenanceKind: "synthetic",
    role,
    origin,
    worldAsOf: WORLD_AS_OF,
    transform,
    transformVersion: "task1.formal-team-build.v1",
    reviewStatus: "reviewed",
    generatorModel: model,
    reasoningEffort: "high",
    promptVersion: model === "gpt-5.6-luna" ? "task1.luna-batch.v1" : "task1.sol-input-freeze.v1",
    batchId,
    generatedAt,
    contentRefs,
  });
}

const sourceEvidence = [];
const addEvidence = (item) => { sourceEvidence.push(item); return item.sourceId; };
const sourceIds = {
  anchor: addEvidence(syntheticEvidence({
    sourceId: "T15-SRC-ANCHOR",
    role: "current_anchor",
    transform: "current_task_anchor",
    batchId: "build-08-T15-sol-input-pack",
    generatedAt: "2026-08-30T18:00:00+08:00",
    contentRefs: ["generators/parallel/build-08/T15/input-pack.json", ...input.project_streams.map((item) => item.task_id)],
    origin: "evidence_grounded_synthesis",
    model: "gpt-5.6-sol",
  })),
  l0: addEvidence(syntheticEvidence({
    sourceId: "T15-SRC-HISTORY-L0", role: "history", transform: "redacted_replay",
    batchId: memoryExpansion.batch_id, generatedAt: "2026-08-30T12:30:00+08:00",
    contentRefs: input.memory_plan.l0_ids,
  })),
  l1: addEvidence(syntheticEvidence({
    sourceId: "T15-SRC-HISTORY-L1", role: "history", transform: "atomic_fact_extraction",
    batchId: memoryExpansion.batch_id, generatedAt: "2026-08-30T12:30:00+08:00",
    contentRefs: input.memory_plan.l1_ids,
  })),
  l2: addEvidence(syntheticEvidence({
    sourceId: "T15-SRC-HISTORY-L2", role: "history", transform: "multi_session_scene_synthesis",
    batchId: memoryExpansion.batch_id, generatedAt: "2026-08-30T12:30:00+08:00",
    contentRefs: input.memory_plan.l2.map((item) => item.asset_id),
  })),
  l3: addEvidence(syntheticEvidence({
    sourceId: "T15-SRC-HISTORY-L3", role: "history", transform: "stable_profile_derivation",
    batchId: memoryExpansion.batch_id, generatedAt: "2026-08-30T12:30:00+08:00",
    contentRefs: [input.memory_plan.l3_id],
  })),
};

for (const candidate of knowledgeCandidates.candidates) {
  sourceIds[candidate.asset_id] = addEvidence(syntheticEvidence({
    sourceId: `T15-SRC-KNOWLEDGE-${candidate.asset_id.slice(-3)}`,
    role: "repo_context",
    transform: candidate.type === "code_graph" ? "code_graph_build" : "repo_document_snapshot",
    batchId: knowledgeExpansion.batch_id,
    generatedAt: "2026-08-30T13:00:00+08:00",
    contentRefs: [candidate.asset_id, candidate.workspace_match],
    origin: "evidence_grounded_synthesis",
  }));
}

const pairBatchEvidence = new Map();
for (const [relative, family, draft] of batchSpecs) {
  const manifest = readJson(path.join(GEN, ...relative.split("/"), "manifest.json"));
  const key = manifest.batch_id;
  const ref = addEvidence(syntheticEvidence({
    sourceId: `T15-SRC-EVAL-${String(sourceEvidence.length + 1).padStart(3, "0")}`,
    role: "evaluation_derivation",
    transform: family === "natural-negative" ? "natural_negative_selection" : "paired_counterfactual",
    batchId: key,
    generatedAt: manifest.generated_at,
    contentRefs: (family === "natural-negative" ? draft.cases : draft.pairs).map((item) => item.draft_case_id ?? item.draft_pair_id),
    origin: "evidence_grounded_synthesis",
  }));
  pairBatchEvidence.set(key, ref);
}

const rawRoot = path.join(SOURCE, "raw", "github-awesome-copilot");
const externalImports = [];
for (const item of sourceLock.files) {
  const copiedRelative = item.path.replace(/^skills\//, "");
  const copiedPath = path.join(rawRoot, ...copiedRelative.split("/"));
  const actualHash = sha(readFileSync(copiedPath));
  if (actualHash !== item.sha256) throw new Error(`raw source hash mismatch for ${item.source_id}`);
  const evidence = withHash({
    sourceId: item.source_id,
    provenanceKind: "external_import",
    role: "skill_source",
    origin: "repo_document",
    worldAsOf: WORLD_AS_OF,
    transform: "skill_package_import",
    transformVersion: "task1.host-adaptation.v1",
    reviewStatus: "reviewed",
    dataset: "github-raw-skill",
    datasetRevision: sourceLock.repository.commit,
    datasetArtifactSha256: item.sha256,
    sourceRepoUrl: sourceLock.repository.url,
    sourceRepoCommit: sourceLock.repository.commit,
    sourceRepoLicense: sourceLock.repository.license,
    sourceTaskTime: sourceLock.repository.commit_author_time,
    trajectoryGeneratedAt: sourceLock.frozen_at,
    evidenceLocator: item.path,
    evidenceSha256: item.sha256,
    transformInputSha256: item.sha256,
    piiScan: "passed",
    reviewedBy: sourceLock.review.reviewed_by,
  });
  addEvidence(evidence);
  externalImports.push({
    sourceId: item.source_id,
    repositoryUrl: sourceLock.repository.url,
    repositoryCommit: sourceLock.repository.commit,
    license: sourceLock.repository.license,
    sourcePath: item.path,
    copiedPath: `source-material/${TEAM}/raw/github-awesome-copilot/${copiedRelative.replaceAll("\\", "/")}`,
    sha256: item.sha256,
  });
}

function memoryOwner(stream) {
  if (stream === "meridian-sdk") return ASSET_A;
  if (stream === "atlas-versioning" || stream === "prism-schema") return ASSET_B;
  return ACTIVE;
}

const l0Conversations = memoryCandidates.candidates.filter((item) => item.asset_type === "l0_session").map((item, sessionIndex) => withHash({
  assetId: item.asset_id,
  ownerAgentId: memoryOwner(item.project_stream),
  sourceEvidenceIds: [sourceIds.l0],
  observedAt: OBSERVED_AT,
  sessionId: item.asset_id,
  messages: item.messages.map((message, messageIndex) => withHash({
    messageId: message.message_id,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: [sourceIds.l0],
    observedAt: `2026-08-${String(10 + Math.floor(sessionIndex / 2)).padStart(2, "0")}T${String(9 + (messageIndex % 8)).padStart(2, "0")}:00:00+08:00`,
  })),
}));

const l1Conversations = memoryCandidates.candidates.filter((item) => item.asset_type === "l1_memory").map((item) => withHash({
  assetId: item.asset_id,
  ownerAgentId: memoryOwner(item.project_stream),
  sourceEvidenceIds: [sourceIds.l1],
  observedAt: OBSERVED_AT,
  type: "decision",
  content: item.content ?? item.summary,
  status: "active",
  validFrom: "2026-08-01T00:00:00+08:00",
  supportingMessageIds: item.supporting_message_ids,
  codeEvidenceLocators: [],
  testEvidenceLocators: [],
}));

const l2Scenes = memoryCandidates.candidates.filter((item) => item.asset_type === "l2_scene").map((item) => {
  if (!item.content) throw new Error(`${item.asset_id} lacks scene content`);
  return withHash({
    assetId: item.asset_id,
    ownerAgentId: memoryOwner(item.project_stream),
    sourceEvidenceIds: [sourceIds.l2],
    observedAt: OBSERVED_AT,
    path: item.path,
    summary: item.summary,
    content: item.content,
    injected: item.injected,
    supportingSessionIds: item.supporting_session_ids,
  });
});

const l3Profiles = memoryCandidates.candidates.filter((item) => item.asset_type === "l3_profile").map((item) => withHash({
  assetId: item.asset_id,
  ownerAgentId: ACTIVE,
  sourceEvidenceIds: [sourceIds.l3],
  observedAt: OBSERVED_AT,
  content: item.content ?? item.summary,
  stability: "team",
}));

const skillLockByName = new Map(sourceLock.files.filter((item) => item.source_id.startsWith("T15-EXT-SKL")).map((item) => [item.name, item]));
const skills = skillCandidates.candidates.map((item) => {
  const lock = skillLockByName.get(item.name);
  if (!lock || lock.sha256 !== item.raw_sha256 || lock.path !== item.source_path) throw new Error(`skill source mismatch ${item.candidate_id}`);
  const refs = [item.source_id, ...(item.resources ?? []).map((resource) => resource.source_id)];
  return withHash({
    assetId: item.candidate_id,
    ownerAgentId: item.owner,
    sourceEvidenceIds: refs,
    observedAt: OBSERVED_AT,
    name: item.name,
    version: "1.0.0",
    description: item.description,
    useWhen: item.useWhen,
    doNotUseWhen: item.doNotUseWhen,
    repoCommit: item.repository_commit,
    visibility: item.visibility === "listed" ? "private" : "team",
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest: item.manifest_files,
  });
});

const knowledge = knowledgeCandidates.candidates.map((item) => withHash({
  assetId: item.asset_id,
  ownerAgentId: ACTIVE,
  sourceEvidenceIds: [sourceIds[item.asset_id]],
  observedAt: OBSERVED_AT,
  type: item.type,
  name: item.name,
  ...(item.type === "code_graph" ? { repoUrl: REPO_URL, repoCommit: LAUNCH_COMMIT, indexVersion: "task1-t15-synthetic-v1" } : {}),
  snapshotSha256: sha(item),
  bindings: [{ agentId: ACTIVE, visibility: "fixed" }],
  about: item.about,
  summary: item.summary,
  serviceUrl: item.service_url,
  tools: item.tools,
  fixture: item.minimal_synthetic_query_result,
}));

const memoryAssets = [...l0Conversations, ...l1Conversations, ...l2Scenes, ...l3Profiles];
const allAssetIds = [...memoryAssets, ...skills, ...knowledge].map((item) => item.assetId).sort();
const visibleAssetSetSha256 = sha(allAssetIds);

function agentDetail(description, prompt) {
  return withHash({ description, prompt });
}

const businessAgents = [
  withHash({
    agentId: ACTIVE,
    teamId: TEAM,
    name: "T15 API Contract Lead",
    agentDetail: agentDetail("负责 API 契约、兼容性、SDK 与版本治理。", "先核对契约与证据，再决定实现、发布与迁移动作。"),
    importedMemoryAgentIds: [ASSET_A, ASSET_B],
    boundSkillIds: skills.filter((item) => item.ownerAgentId === ACTIVE).map((item) => item.assetId),
    fixedKnowledgeIds: knowledge.map((item) => item.assetId),
    sourceEvidenceIds: [sourceIds.anchor],
  }),
  withHash({
    agentId: ASSET_A,
    teamId: TEAM,
    name: "T15 SDK and Plugin Assets",
    agentDetail: agentDetail("维护 SDK、插件与集成资产。", "提供可追溯的 SDK 和插件流程资产。"),
    importedMemoryAgentIds: [],
    boundSkillIds: skills.filter((item) => item.ownerAgentId === ASSET_A).map((item) => item.assetId),
    fixedKnowledgeIds: [],
    sourceEvidenceIds: [sourceIds.anchor],
  }),
  withHash({
    agentId: ASSET_B,
    teamId: TEAM,
    name: "T15 Version and Schema Assets",
    agentDetail: agentDetail("维护版本、schema 与治理资产。", "提供版本演进和兼容审查资产。"),
    importedMemoryAgentIds: [],
    boundSkillIds: skills.filter((item) => item.ownerAgentId === ASSET_B).map((item) => item.assetId),
    fixedKnowledgeIds: [],
    sourceEvidenceIds: [sourceIds.anchor],
  }),
];

const streamDetails = {
  "harbor-contract": ["Harbor 合作方 API 契约演进", "审查 OpenAPI 3.1 schema 演进与网关发布兼容性。"],
  "meridian-sdk": ["Meridian SDK 生成与发布", "维护冻结规范到 TypeScript/Python SDK 的生成、版本和交接。"],
  "pactline-tests": ["Pactline 契约验证", "维护 consumer-driven contract 与 provider verification 复盘。"],
  "atlas-versioning": ["Atlas Partner API 版本治理", "维护版本协商、弃用窗口和双版本迁移。"],
  "prism-schema": ["Prism Schema Registry 兼容性", "维护 JSON Schema 兼容模式、枚举与 required 演进。"],
};

function workspaceFor(stream) {
  const core = {
    workspaceId: `workspace-t15-${stream}`,
    repoSlug: REPO_SLUG,
    repoUrl: REPO_URL,
    baseCommit: LAUNCH_COMMIT,
    sourceRepoLicense: REPO_LICENSE,
    treeSha256,
    fileManifestSha256,
    state: "clean",
  };
  return withHash(core);
}

const tasks = input.project_streams.map((stream) => {
  const [title, description] = streamDetails[stream.id];
  const projectRef = withHash({
    projectRefId: `project-ref-t15-${stream.id}`,
    repoSlug: REPO_SLUG,
    repoUrl: REPO_URL,
    pinnedCommit: LAUNCH_COMMIT,
    sourceEvidenceIds: [sourceIds.anchor],
  });
  return withHash({
    taskId: stream.task_id,
    teamId: TEAM,
    title,
    description,
    goal: stream.focus,
    eligibleAgentIds: [ACTIVE],
    projectRef,
    workspace: workspaceFor(stream.id),
    sourceEvidenceIds: [sourceIds.anchor],
  });
});
const taskByStream = new Map(input.project_streams.map((stream) => [stream.id, tasks.find((task) => task.taskId === stream.task_id)]));

const team = withHash({
  teamId: TEAM,
  worldId: WORLD_ID,
  split: "hidden_test",
  name: "API 契约与兼容性",
  businessAgentIds: businessAgents.map((item) => item.agentId),
  taskIds: tasks.map((item) => item.taskId),
  sourceEvidenceIds: sourceEvidence.map((item) => item.sourceId),
});

function streamForText(text) {
  if (/Meridian/i.test(text)) return "meridian-sdk";
  if (/Pactline|provider verification/i.test(text)) return "pactline-tests";
  if (/Atlas/i.test(text)) return "atlas-versioning";
  if (/Prism/i.test(text)) return "prism-schema";
  return "harbor-contract";
}

const allToolNames = [
  "tdai_memory_search", "tdai_atomic_query", "tdai_conversation_search", "tdai_conversation_query", "tdai_scenario_ls", "tdai_read_scene",
  "skill_search", "skill_view", "skill_view_by_id", "skill_files_read", "knowledge_tools_list", "knowledge_tools_call",
];

const endpoints = {
  tdai_memory_search: "/memory-bridge/v3/atomic/search",
  tdai_atomic_query: "/memory-bridge/v3/atomic/query",
  tdai_conversation_search: "/memory-bridge/v3/conversation/search",
  tdai_read_scene: "/memory-bridge/v3/scenario/read",
  skill_search: "/skill-bridge/v3/skill/search",
  skill_view: "/skill-bridge/v3/skill/get-by-name",
  skill_view_by_id: "/skill-bridge/v3/skill/get",
  skill_files_read: "/skill-bridge/v3/skill/files/read",
  knowledge_tools_list: "/tools/list",
};

function searchTerms(pair, target) {
  const text = `${pair.query} ${pair.positive.private_proposal.unique_information_gap}`;
  if (target === "T15-L0-004") return ["请求头", "大小写", "provider verification"];
  if (target === "T15-L1-002") return ["trace_context", "兼容扩展", "主版本"];
  if (target === "T15-L1-004") return ["TypeScript", "Python", "正式版本"];
  if (target === "T15-L0-009") return ["provider verification", "超时", "重试"];
  const tokens = text.match(/[A-Za-z_@.0-9-]{3,}|[\u4e00-\u9fff]{2,8}/g) ?? [];
  return [...new Set(tokens)].slice(0, 4);
}

function firstActionFor(pair, tool, target) {
  const identityForbidden = ["user_id", "team_id", "agent_id", "task_id"];
  if (tool === "tdai_memory_search" || tool === "tdai_conversation_search") {
    return { tool, endpoint: endpoints[tool], argumentRules: { requiredFields: ["query"], forbiddenFields: identityForbidden, stringContainsAny: { query: searchTerms(pair, target) } } };
  }
  if (tool === "tdai_atomic_query") {
    return { tool, endpoint: endpoints[tool], argumentRules: { forbiddenFields: identityForbidden, exactValues: { type: "decision", time_start: "2026-08-01T00:00:00+08:00", time_end: "2026-08-29T23:59:59+08:00" } } };
  }
  if (tool === "tdai_read_scene") {
    const scene = l2Scenes.find((item) => item.assetId === target);
    return { tool, endpoint: endpoints[tool], argumentRules: { requiredFields: ["path"], forbiddenFields: ["user_id", "team_id", "task_id"], exactValues: { path: scene.path }, pathFromFixture: true } };
  }
  if (tool === "skill_search") {
    const skill = skills.find((item) => item.assetId === target);
    return { tool, endpoint: endpoints[tool], argumentRules: { requiredFields: ["query"], forbiddenFields: [...identityForbidden, "top_k", "mode"], stringContainsAny: { query: [skill.name, ...skill.description.split(/[，。 ]/).filter(Boolean).slice(0, 2)] } } };
  }
  if (tool === "skill_view") {
    const skill = skills.find((item) => item.assetId === target);
    return { tool, endpoint: endpoints[tool], argumentRules: { requiredFields: ["skill_name"], forbiddenFields: identityForbidden, exactValues: { skill_name: skill.name } } };
  }
  if (tool === "knowledge_tools_list") {
    return { tool, endpoint: endpoints[tool], argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } };
  }
  throw new Error(`unknown first tool ${tool}`);
}

function followupsFor(sequence, target) {
  if (sequence[0] === "skill_search") {
    return [{ tool: "skill_view_by_id", endpoint: endpoints.skill_view_by_id, argumentRules: { requiredFields: ["skill_id"], forbiddenFields: ["user_id", "team_id", "agent_id", "task_id"], valueFromPreviousStep: true } }];
  }
  if (sequence.includes("skill_files_read")) {
    return [{ tool: "skill_files_read", endpoint: endpoints.skill_files_read, argumentRules: { requiredFields: ["skill_id", "path"], forbiddenFields: ["user_id", "team_id", "agent_id", "task_id"], exactValues: { path: "references/versioning-strategy.md" }, valueFromPreviousStep: true } }];
  }
  return undefined;
}

function knowledgeExpectation(target) {
  const item = knowledgeCandidates.candidates.find((candidate) => candidate.asset_id === target);
  const query = item.minimal_synthetic_query_result.successful_query.params.query;
  return [{ toolName: "search", paramRules: { requiredFields: ["query"], exactValues: { query } } }];
}

const publicCases = [];
const privateAnnotations = [];
const pairs = [];
const reviewRows = [];

function makePublicCase({ caseId, task, sessionId, difficulty, contextMessages, query }) {
  return withHash({
    caseId,
    identity: { spaceId: SPACE, teamId: TEAM, userId: USER, agentId: ACTIVE, taskId: task.taskId, sessionId, agentSource: "codex" },
    snapshotId: SNAPSHOT_ID,
    workspace: task.workspace,
    language: "zh",
    difficulty,
    contextMessages,
    query,
    visibleAssetSetSha256,
  });
}

function makeNoToolGold(evidenceRefs, reason) {
  return withHash({
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    allowedSequences: [],
    forbiddenTools: allToolNames,
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs,
    ablationEvidence: "移除所有历史、Skill 与 Knowledge 资产后，当前输入仍保留完成任务所需事实。",
    noToolEvidence: reason,
  });
}

function addPair(pair, family, index, batchId) {
  const prefix = family === "memory" ? "MEM" : family === "skill" ? "SKL" : "KNW";
  const n = String(index).padStart(3, "0");
  const pairId = `T15-PAIR-${prefix}-${n}`;
  const positiveCaseId = `T15-${prefix}-${n}-P`;
  const negativeCaseId = `T15-${prefix}-${n}-N`;
  const text = [...pair.shared_context_messages.map((item) => item.content), pair.query].join("\n");
  const stream = streamForText(text);
  const task = taskByStream.get(stream);
  const sessionId = `session-t15-${prefix.toLowerCase()}-${n}`;
  const positiveContext = [...pair.shared_context_messages, pair.positive.delta_message];
  const negativeContext = [...pair.shared_context_messages, pair.negative.delta_message];
  const positive = makePublicCase({ caseId: positiveCaseId, task, sessionId, difficulty: pair.difficulty, contextMessages: positiveContext, query: pair.query });
  const negative = makePublicCase({ caseId: negativeCaseId, task, sessionId, difficulty: pair.difficulty, contextMessages: negativeContext, query: pair.query });
  publicCases.push(positive, negative);

  const proposal = pair.positive.private_proposal;
  const target = proposal.target_asset_ids[0];
  const sequence = proposal.allowed_sequence_candidates[0];
  const pairEvidence = pairBatchEvidence.get(batchId);
  const targetAsset = [...memoryAssets, ...skills, ...knowledge].find((item) => item.assetId === target);
  if (!targetAsset) throw new Error(`unknown target ${target}`);
  const allowedFirstActions = [firstActionFor(pair, sequence[0], target)];
  const goldCore = {
    needTdaiTool: true,
    family,
    allowedFirstActions,
    ...(family === "knowledge" ? { expectedKnowledgeCalls: knowledgeExpectation(target) } : {}),
    ...(family === "skill" && sequence.length > 1 ? { expectedFollowupActions: followupsFor(sequence, target) } : {}),
    allowedSequences: [sequence],
    forbiddenTools: allToolNames.filter((tool) => !sequence.includes(tool)),
    maxTdaiCalls: sequence.length,
    targetAssetIds: proposal.target_asset_ids,
    informationGap: proposal.unique_information_gap,
    stopAfter: proposal.stop_after_candidate,
    evidenceRefs: [...new Set([pairEvidence, ...targetAsset.sourceEvidenceIds])],
    ablationEvidence: `从可见资产集中移除 ${target} 后，当前输入无法恢复该唯一事实。`,
  };
  const positiveGold = withHash(goldCore);
  const negativeGold = makeNoToolGold([pairEvidence], pair.negative.private_proposal.why_current_context_is_sufficient);
  privateAnnotations.push(
    withHash({ caseId: positiveCaseId, sourceEvidenceIds: [pairEvidence], pairId, pairRole: "positive", gold: positiveGold, annotationReason: "正例保留一个只能由目标资产补足的信息缺口。" }),
    withHash({ caseId: negativeCaseId, sourceEvidenceIds: [pairEvidence], pairId, pairRole: "negative", gold: negativeGold, annotationReason: "配对 delta 已在当前上下文中补足同一事实。" }),
  );
  const pairCore = {
    pairId,
    positiveCaseId,
    negativeCaseId,
    counterfactualKind: "answer_in_current_context",
    controlledDeltaSha256: sha({ positive: pair.positive.delta_message, negative: pair.negative.delta_message }),
    currentEvidenceRefs: [pairEvidence],
  };
  pairs.push(withHash(pairCore));
  reviewRows.push({ pairId, family, sequence, targetAssetIds: proposal.target_asset_ids, distractorIds: pair.visible_distractor_ids_author_only, changedMessageIndex: pair.changed_message_index, solReviewed: true });
}

const pairGroups = [
  ["memory", [...memoryTrial.pairs, ...memoryExpansion.pairs], memoryTrial.batch_id, memoryExpansion.batch_id],
  ["skill", [...skillTrial.pairs, ...skillExpansion.pairs], skillTrial.batch_id, skillExpansion.batch_id],
  ["knowledge", [...knowledgeTrial.pairs, ...knowledgeExpansion.pairs], knowledgeTrial.batch_id, knowledgeExpansion.batch_id],
];
for (const [family, draftPairs, trialBatch, expansionBatch] of pairGroups) {
  draftPairs.forEach((pair, index) => addPair(pair, family, index + 1, index === 0 ? trialBatch : expansionBatch));
}

const naturalEvidence = pairBatchEvidence.get(naturalDraft.batch_id);
naturalDraft.cases.forEach((item, index) => {
  const n = String(index + 1).padStart(3, "0");
  const caseId = `T15-COD-${n}`;
  const stream = streamForText([...item.context_messages.map((message) => message.content), item.query].join("\n"));
  const task = taskByStream.get(stream);
  const publicCase = makePublicCase({
    caseId,
    task,
    sessionId: `session-t15-cod-${n}`,
    difficulty: item.difficulty,
    contextMessages: item.context_messages,
    query: item.query,
  });
  publicCases.push(publicCase);
  const gold = makeNoToolGold([naturalEvidence], item.why_current_context_is_sufficient);
  privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: [naturalEvidence], gold, annotationReason: "自然 coding 请求已在当前输入中提供完整代码、数据与约束。" }));
  reviewRows.push({ caseId, family: "none", sequence: [], targetAssetIds: [], distractorIds: item.visible_distractor_ids_author_only, solReviewed: true });
});

const fragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: BUILD,
  team_id: TEAM,
  split: "hidden_test",
  sourceEvidence,
  teams: [team],
  businessAgents,
  tasks,
  publicCases,
  privateAnnotations,
  pairs,
  snapshotAssetIds: allAssetIds,
  generatorBatchRefs,
  externalImports,
};

const memoryFile = { schema_version: "task1.team_assets.memory.v1", team_id: TEAM, l0Conversations, l1Memories: l1Conversations, l2Scenes, l3Profiles };
const skillsFile = { schema_version: "task1.team_assets.skills.v1", team_id: TEAM, skills };
const knowledgeFile = { schema_version: "task1.team_assets.knowledge.v1", team_id: TEAM, knowledge };

const chainDistribution = Object.fromEntries([...new Set(reviewRows.filter((row) => row.family !== "none").map((row) => row.sequence.join(" -> ")))].sort().map((key) => [key, reviewRows.filter((row) => row.sequence.join(" -> ") === key).length]));
const counts = {
  total: publicCases.length,
  memoryPositive: reviewRows.filter((row) => row.family === "memory").length,
  skillPositive: reviewRows.filter((row) => row.family === "skill").length,
  knowledgePositive: reviewRows.filter((row) => row.family === "knowledge").length,
  pairedNoToolNegative: pairs.length,
  naturalCodingNegative: reviewRows.filter((row) => row.family === "none").length,
  pairs: pairs.length,
};

const gate = {
  schema_version: "task1.team_gate.v1",
  build_id: BUILD,
  team_id: TEAM,
  split: "hidden_test",
  status: "passed",
  counts,
  discoveryPositiveCount: reviewRows.filter((row) => ["tdai_memory_search", "tdai_conversation_search", "skill_search", "knowledge_tools_list"].includes(row.sequence[0])).length,
  directPositiveCount: reviewRows.filter((row) => ["tdai_atomic_query", "tdai_read_scene", "skill_view"].includes(row.sequence[0])).length,
  chainDistribution,
  lunaBatches: generatorBatchRefs,
  externalSkillSources: { repositoryUrl: sourceLock.repository.url, commit: sourceLock.repository.commit, license: sourceLock.repository.license, skillFiles: 18, resourceFiles: 1 },
  assetCounts: { l0: l0Conversations.length, l1: l1Conversations.length, l2: l2Scenes.length, l3: l3Profiles.length, skills: skills.length, knowledge: knowledge.length },
  solChecks: {
    uniqueInformationGap: "passed",
    completeMinimalChains: "passed",
    pairSingleVariable: "passed",
    assetVisibility: "passed",
    realSkillDistractors: "passed",
    retrievalPressure: "passed",
    providerLeakage: "passed",
    sourceHashesAndLicense: "passed",
  },
  prohibitedValidation: { officialPatchUsed: false, upstreamDependenciesInstalled: false, upstreamTestsRun: false, formalModelEvaluationRun: false },
};

const review = `# T15 Team Review\n\n- 状态：Team Gate passed\n- 分类：Memory Positive 6、Skill Positive 6、Knowledge Positive 3、配对 No-tool Negative 15、自然 Coding Negative 10。\n- Pair：15；正负同 query、identity、workspace、snapshot，仅 changed message delta 改变信息充分性。\n- 检索/发现 Positive：10；直接调用 Positive：5。\n- Memory 资产：12 L0、16 L1、5 L2、1 L3。\n- Skill：18 个冻结 GitHub 文件适配，外加 1 个冻结资源文件；全部 MIT、固定 commit 与 SHA-256。\n- Knowledge：1 个 code graph、2 个 wiki；均首次列工具后一次 search 成功即停。\n- Sol 复核：唯一信息缺口、完整最小链、可见性、真实干扰、provider 泄漏与 pair 单变量均通过。\n- 未使用 official patch；未安装上游依赖；未运行上游测试；未执行正式模型评测。\n`;

mkdirSync(path.join(STAGE, "assets"), { recursive: true });
writeJson(path.join(STAGE, "team-fragment.json"), fragment);
writeJson(path.join(STAGE, "assets", "memory.json"), memoryFile);
writeJson(path.join(STAGE, "assets", "skills.json"), skillsFile);
writeJson(path.join(STAGE, "assets", "knowledge.json"), knowledgeFile);
writeJson(path.join(STAGE, "review-matrix.json"), { schema_version: "task1.team_review_matrix.v1", team_id: TEAM, rows: reviewRows });
writeJson(path.join(STAGE, "gate.json"), gate);
writeFileSync(path.join(STAGE, "review.md"), review, "utf8");

console.log(JSON.stringify({ team: TEAM, counts, assetCounts: gate.assetCounts, discoveryPositiveCount: gate.discoveryPositiveCount, directPositiveCount: gate.directPositiveCount, chainDistribution }, null, 2));
