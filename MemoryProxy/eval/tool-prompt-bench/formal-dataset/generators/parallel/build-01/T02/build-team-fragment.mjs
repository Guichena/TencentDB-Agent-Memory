import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = join(scriptDir, "..", "..", "..", "..");
const sourceDir = join(formalDir, "source-material", "T02");
const stagingDir = join(formalDir, "staging", "teams", "T02");
const contract = readJson(join(formalDir, "registry", "contracts", "formal-v1.json"));
const inputPack = readJson(join(scriptDir, "input-pack.json"));
const assetDraft = readJson(join(scriptDir, "asset-world", "asset-world-batch-01", "draft.json"));
const assetManifest = readJson(join(scriptDir, "asset-world", "asset-world-batch-01", "manifest.json"));
const skillSources = readJson(join(sourceDir, "skill-sources.json"));
const projectSources = readJson(join(sourceDir, "project-sources.json"));
const worldAsOf = contract.world.worldAsOf;
const agentId = "agent-task1-t02-general";
const userId = "user-task1-t02-eval";

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function sha256(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const canonicalSha256 = (value) => sha256(JSON.stringify(stable(value)));
const hashed = (value) => ({ ...value, contentHash: canonicalSha256(value) });
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function syntheticEvidence({ sourceId, role, transform, transformVersion, manifest, contentRefs }) {
  return hashed({
    sourceId,
    provenanceKind: "synthetic",
    role,
    origin: "evidence_grounded_synthesis",
    worldAsOf,
    transform,
    transformVersion,
    reviewStatus: "reviewed",
    generatorModel: manifest.generator_model,
    reasoningEffort: manifest.reasoning_effort,
    promptVersion: manifest.prompt_version,
    batchId: manifest.batch_id,
    generatedAt: manifest.generated_at,
    contentRefs,
  });
}

const registrySource = contract.sourceEvidence.find((source) => source.sourceId === "source-task1-registry-ds00");
const projectEvidence = projectSources.projects.map((project) => {
  const metadata = readJson(join(sourceDir, project.package_path, "metadata.json"));
  return hashed({
    sourceId: `source-t02-current-${project.task_id.replace(/^T02-TASK-/, "").toLowerCase()}`,
    provenanceKind: "external_import",
    dataset: `${metadata.repo_slug} pinned GitHub workspace`,
    datasetRevision: metadata.revision,
    datasetArtifactSha256: metadata.file_manifest_sha256,
    sourceRepoUrl: metadata.repository_url,
    sourceRepoCommit: metadata.revision,
    sourceRepoLicense: metadata.license_spdx,
    sourceTaskId: metadata.task_id,
    role: "current_anchor",
    origin: "repo_code",
    sourceTaskTime: metadata.commit_time,
    trajectoryGeneratedAt: "2026-08-29T22:00:00+08:00",
    evidenceLocator: `source-material/T02/${project.package_path}/metadata.json`,
    evidenceSha256: project.metadata_sha256,
    transform: "current_task_anchor",
    transformVersion: "task1.t02-github-workspace-freeze.v1",
    transformInputSha256: metadata.tree_sha256,
    worldAsOf,
    piiScan: "passed",
    reviewStatus: "reviewed",
    reviewedBy: "Sol/DS03",
  });
});
const projectEvidenceByTask = new Map(projectSources.projects.map((project, index) => [project.task_id, projectEvidence[index]]));

const skillEvidence = skillSources.sources.map((source) => hashed({
  sourceId: `source-t02-skill-${source.name}`,
  provenanceKind: "external_import",
  dataset: "Pinned public GitHub Skill package",
  datasetRevision: source.revision,
  datasetArtifactSha256: source.main_raw_sha256,
  sourceRepoUrl: source.repository_url,
  sourceRepoCommit: source.revision,
  sourceRepoLicense: source.license_spdx,
  sourceTaskId: source.source_path,
  role: "skill_source",
  origin: "repo_document",
  sourceTaskTime: "2026-08-29T12:00:00Z",
  trajectoryGeneratedAt: "2026-08-29T22:00:00+08:00",
  evidenceLocator: `source-material/T02/${source.package_path}/metadata.json`,
  evidenceSha256: source.metadata_sha256,
  transform: "skill_package_import",
  transformVersion: "task1.t02-github-skill-freeze.v1",
  transformInputSha256: source.main_raw_sha256,
  worldAsOf,
  piiScan: "passed",
  reviewStatus: "reviewed",
  reviewedBy: "Sol/DS03",
}));

const assetEvidence = [
  syntheticEvidence({ sourceId: "source-t02-luna-asset-world-l0", role: "history", transform: "redacted_replay", transformVersion: "task1.t02-asset-world-l0.sol-reviewed.v1", manifest: assetManifest, contentRefs: assetDraft.l0_sessions.map((item) => item.asset_id) }),
  syntheticEvidence({ sourceId: "source-t02-luna-asset-world-l1", role: "history", transform: "atomic_fact_extraction", transformVersion: "task1.t02-asset-world-l1.sol-reviewed.v1", manifest: assetManifest, contentRefs: assetDraft.l1_memories.map((item) => item.asset_id) }),
  syntheticEvidence({ sourceId: "source-t02-luna-asset-world-l2", role: "history", transform: "multi_session_scene_synthesis", transformVersion: "task1.t02-asset-world-l2.sol-reviewed.v1", manifest: assetManifest, contentRefs: assetDraft.l2_scenes.map((item) => item.asset_id) }),
  syntheticEvidence({ sourceId: "source-t02-luna-asset-world-l3", role: "history", transform: "stable_profile_derivation", transformVersion: "task1.t02-asset-world-l3.sol-reviewed.v1", manifest: assetManifest, contentRefs: assetDraft.l3_profiles.map((item) => item.asset_id) }),
  syntheticEvidence({ sourceId: "source-t02-luna-knowledge-code-graphs", role: "repo_context", transform: "code_graph_build", transformVersion: "task1.t02-knowledge-code-graphs.sol-reviewed.v1", manifest: assetManifest, contentRefs: assetDraft.knowledge_fixtures.filter((item) => item.type === "code_graph").map((item) => item.asset_id) }),
  syntheticEvidence({ sourceId: "source-t02-luna-knowledge-wiki", role: "repo_context", transform: "repo_document_snapshot", transformVersion: "task1.t02-knowledge-wiki.sol-reviewed.v1", manifest: assetManifest, contentRefs: assetDraft.knowledge_fixtures.filter((item) => item.type === "wiki").map((item) => item.asset_id) }),
];

const batchSpecs = [
  ["trials/memory-trial-01", "source-t02-luna-memory-trial-01", "paired_counterfactual"],
  ["trials/skill-trial-01", "source-t02-luna-skill-trial-01", "paired_counterfactual"],
  ["trials/knowledge-trial-01", "source-t02-luna-knowledge-trial-01", "paired_counterfactual"],
  ["expansion/memory-batch-01", "source-t02-luna-memory-expansion-batch-01", "paired_counterfactual"],
  ["expansion/skill-batch-01", "source-t02-luna-skill-expansion-batch-01", "paired_counterfactual"],
  ["expansion/knowledge-batch-01", "source-t02-luna-knowledge-expansion-batch-01", "paired_counterfactual"],
  ["expansion/natural-negative-batch-01", "source-t02-luna-natural-negative-batch-01", "natural_negative_selection"],
];
const batchEvidence = batchSpecs.map(([directory, sourceId, transform]) => {
  const manifest = readJson(join(scriptDir, directory, "manifest.json"));
  const draft = readJson(join(scriptDir, directory, "draft.json"));
  const records = draft.pairs ?? draft.cases;
  return syntheticEvidence({ sourceId, role: "evaluation_derivation", transform, transformVersion: `task1.${manifest.batch_id}.sol-reviewed.v1`, manifest, contentRefs: records.map((item) => item.draft_pair_id ?? item.draft_case_id) });
});
const sourceEvidence = [registrySource, ...projectEvidence, ...skillEvidence, ...assetEvidence, ...batchEvidence];
const sourceIdSet = new Set(sourceEvidence.map((source) => source.sourceId));

const tasks = projectSources.projects.map((project) => {
  const metadata = readJson(join(sourceDir, project.package_path, "metadata.json"));
  const currentSourceId = projectEvidenceByTask.get(project.task_id).sourceId;
  const descriptions = {
    "T02-TASK-PANDAS-RESAMPLING": ["Review timezone-aware Pandas resampling and missing-bucket handling at a pinned revision.", "Preserve event-time and reporting-boundary semantics while producing a reviewable plan."],
    "T02-TASK-DASK-PARALLEL": ["Review Dask partition skew, workload balance, and worker-memory boundaries.", "Recover only the exact partition and memory procedure needed by the current review."],
    "T02-TASK-TIMESERIES-DETREND": ["Review a quarterly time-series detrending and correlation workflow.", "Separate trend removal, seasonal scope, and correlation evidence at a pinned revision."],
    "T02-TASK-NOTEBOOK-HANDOFF": ["Prepare a reproducible data-computing Notebook handoff.", "Preserve execution order, diagnostic placement, and input/output evidence."],
  };
  const [description, goal] = descriptions[project.task_id];
  return hashed({
    taskId: project.task_id,
    teamId: "T02",
    title: metadata.title,
    description,
    goal,
    eligibleAgentIds: [agentId],
    projectRef: hashed({ projectRefId: `project-${project.task_id.toLowerCase()}`, repoSlug: metadata.repo_slug, repoUrl: metadata.repository_url, pinnedCommit: metadata.revision, sourceEvidenceIds: [currentSourceId] }),
    workspace: hashed({ workspaceId: `workspace-${project.task_id.toLowerCase()}`, repoSlug: metadata.repo_slug, repoUrl: metadata.repository_url, baseCommit: metadata.revision, sourceRepoLicense: metadata.license_spdx, treeSha256: metadata.tree_sha256, fileManifestSha256: metadata.file_manifest_sha256, state: "clean" }),
    sourceEvidenceIds: [currentSourceId],
  });
});
const taskById = new Map(tasks.map((task) => [task.taskId, task]));

const l0Conversations = assetDraft.l0_sessions.map((session) => hashed({
  assetId: session.asset_id,
  ownerAgentId: agentId,
  sourceEvidenceIds: ["source-t02-luna-asset-world-l0"],
  observedAt: session.observed_at,
  sessionId: session.asset_id,
  messages: session.messages.map((message, index) => hashed({
    messageId: `${session.asset_id}-M${String(index + 1).padStart(3, "0")}`,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: ["source-t02-luna-asset-world-l0"],
    observedAt: session.observed_at,
  })),
}));
const l0ById = new Map(l0Conversations.map((item) => [item.assetId, item]));
const l1Memories = assetDraft.l1_memories.map((item) => {
  const supportingMessageIds = item.source_session_ids.map((id) => l0ById.get(id).messages.at(-1).messageId);
  return hashed({
    assetId: item.asset_id,
    ownerAgentId: agentId,
    sourceEvidenceIds: ["source-t02-luna-asset-world-l1"],
    observedAt: `${item.date}T12:00:00+08:00`,
    type: item.formal_type,
    runtimeType: item.runtime_type,
    content: item.content,
    status: item.status,
    ...(item.superseded_by ? { supersededBy: item.superseded_by, validUntil: "2026-07-14T00:00:00+08:00" } : {}),
    validFrom: `${item.date}T00:00:00+08:00`,
    supportingMessageIds,
    codeEvidenceLocators: item.code_evidence_locators,
    testEvidenceLocators: item.test_evidence_locators,
  });
});
const l2Scenes = assetDraft.l2_scenes.map((item) => hashed({
  assetId: item.asset_id,
  ownerAgentId: agentId,
  sourceEvidenceIds: ["source-t02-luna-asset-world-l2"],
  observedAt: "2026-08-29T21:10:00+08:00",
  path: item.path,
  summary: item.summary,
  content: item.content,
  injected: item.injected,
  supportingSessionIds: item.supporting_session_ids,
}));
const l3Profiles = assetDraft.l3_profiles.map((item) => hashed({
  assetId: item.asset_id,
  ownerAgentId: agentId,
  sourceEvidenceIds: ["source-t02-luna-asset-world-l3"],
  observedAt: "2026-08-29T21:20:00+08:00",
  content: item.content,
  stability: item.stability,
}));

const skillAssetId = (name) => `T02-SKILL-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
const skills = inputPack.skill_source_pins.map((pin) => {
  const metadata = readJson(join(sourceDir, "skills", pin.name, "metadata.json"));
  return hashed({
    assetId: skillAssetId(pin.name),
    ownerAgentId: agentId,
    sourceEvidenceIds: [`source-t02-skill-${pin.name}`],
    observedAt: "2026-08-29T21:30:00+08:00",
    name: pin.name,
    version: "1.0.0",
    description: pin.description,
    useWhen: pin.use_when,
    doNotUseWhen: pin.do_not_use_when,
    repoCommit: pin.revision,
    visibility: pin.visibility === "listed" ? "private" : "team",
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest: metadata.adapted_files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  });
});

const knowledge = assetDraft.knowledge_fixtures.map((item) => hashed({
  assetId: item.asset_id,
  ownerAgentId: agentId,
  sourceEvidenceIds: [item.type === "code_graph" ? "source-t02-luna-knowledge-code-graphs" : "source-t02-luna-knowledge-wiki"],
  observedAt: "2026-08-29T21:40:00+08:00",
  type: item.type,
  name: item.name,
  ...(item.repo_url ? { repoUrl: item.repo_url, repoCommit: item.repo_commit, indexVersion: "task1-codegraph-fixture-v1" } : {}),
  snapshotSha256: canonicalSha256(item.snapshot ?? item.target_result),
  bindings: [{ agentId, visibility: "fixed" }],
}));

const allAssetIds = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge]
  .map((asset) => asset.assetId).sort((left, right) => left.localeCompare(right));
const visibleAssetSetSha256 = canonicalSha256({ teamId: "T02", userId, agentId, assetIds: allAssetIds });
const normalizedMessages = (messages) => messages.map(({ role, content }) => ({ role, content }));

function caseRecord({ caseId, draft, delta, task }) {
  const contextMessages = normalizedMessages(draft.shared_context_messages);
  contextMessages.splice(draft.changed_message_index, 0, { role: delta.role, content: delta.content });
  return hashed({
    caseId,
    identity: { spaceId: "space-task1-engineering", teamId: "T02", userId, agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" },
    snapshotId: "snapshot-task1-dev-v1",
    workspace: task.workspace,
    language: "zh",
    difficulty: draft.difficulty,
    contextMessages,
    query: draft.query,
    visibleAssetSetSha256,
  });
}

const forbidden = {
  memory: ["skill_search", "skill_view", "knowledge_tools_list"],
  skill: ["tdai_memory_search", "tdai_conversation_search", "knowledge_tools_list"],
  knowledge: ["tdai_memory_search", "tdai_conversation_search", "skill_search", "skill_view"],
};
function goldFor(draft, family, sourceRefs) {
  const proposal = draft.positive.private_proposal;
  const sequence = proposal.allowed_sequence_candidates[0];
  const rawTarget = proposal.target_asset_ids[0];
  const target = family === "skill" ? skillAssetId(rawTarget.replace(/^candidate-/, "").split(":")[0]) : rawTarget;
  let allowedFirstActions = [];
  const expectedFollowupActions = [];
  let expectedKnowledgeCalls = [];
  if (family === "memory") {
    const tool = sequence[0];
    const endpoint = {
      tdai_memory_search: "/memory-bridge/v3/atomic/search",
      tdai_conversation_search: "/memory-bridge/v3/conversation/search",
      tdai_atomic_query: "/memory-bridge/v3/atomic/query",
      tdai_read_scene: "/memory-bridge/v3/scenario/read",
    }[tool];
    const argumentRules = tool === "tdai_atomic_query"
      ? { requiredFields: ["type", "time_start", "time_end"], exactValues: { type: "instruction", time_start: "2026-07-14T00:00:00Z", time_end: "2026-07-14T23:59:59Z" } }
      : tool === "tdai_read_scene"
        ? { requiredFields: ["path"], exactValues: { path: "/t02/dask/partition-operations" } }
        : { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: draft.query.split(/[，。；：\s]/).filter((word) => word.length >= 3).slice(0, 5) } };
    allowedFirstActions = [{ tool, endpoint, argumentRules }];
  } else if (family === "skill") {
    const name = rawTarget.replace(/^candidate-/, "").split(":")[0];
    if (sequence[0] === "skill_search") {
      allowedFirstActions = [{ tool: "skill_search", endpoint: "/skill-bridge/v3/skill/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: name.split("-") } } }];
      expectedFollowupActions.push({ tool: "skill_view_by_id", endpoint: "/skill-bridge/v3/skill/get", argumentRules: { requiredFields: ["skill_id"], forbiddenFields: ["user_id", "team_id", "agent_id"], valueFromPreviousStep: true } });
    } else {
      allowedFirstActions = [{ tool: "skill_view", endpoint: "/skill-bridge/v3/skill/get-by-name", argumentRules: { requiredFields: ["skill_name", "include_content", "include_manifest"], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { skill_name: name, include_content: true, include_manifest: true } } }];
      if (sequence.includes("skill_files_read")) expectedFollowupActions.push({ tool: "skill_files_read", endpoint: "/skill-bridge/v3/skill/files/read", argumentRules: { requiredFields: ["skill_id", "path"], exactValues: { path: "references/notebook-structure.md" }, valueFromPreviousStep: true } });
    }
  } else {
    allowedFirstActions = [{ tool: "knowledge_tools_list", endpoint: "/tools/list", argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } }];
    expectedKnowledgeCalls = target === "cg-t02pnd01"
      ? [{ toolName: "node", paramRules: { requiredFields: ["symbol"], exactValues: { symbol: "Resampler" } } }]
      : target === "cg-t02dsk01"
        ? [{ toolName: "node", paramRules: { requiredFields: ["symbol"], exactValues: { symbol: "Repartition" } } }]
        : [{ toolName: "search", paramRules: { requiredFields: ["query"], stringContainsAny: { query: ["partition", "skew", "row-count", "分区"] } } }];
  }
  return hashed({
    needTdaiTool: true,
    family,
    allowedFirstActions,
    expectedFollowupActions,
    expectedKnowledgeCalls,
    allowedSequences: [sequence],
    forbiddenTools: forbidden[family],
    maxTdaiCalls: sequence.length,
    targetAssetIds: [target],
    informationGap: proposal.unique_information_gap,
    stopAfter: proposal.stop_after_candidate,
    evidenceRefs: sourceRefs,
    ablationEvidence: `Removing ${target} leaves the case-specific information gap unresolved.`,
  });
}
function noToolGold(reason, sourceRefs) {
  return hashed({ needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs: sourceRefs, ablationEvidence: "Not applicable: this case is intentionally self-contained.", noToolEvidence: reason });
}
const assetSourceForTarget = (family, target) => family === "skill"
  ? `source-t02-skill-${target.replace(/^candidate-/, "").split(":")[0]}`
  : family === "knowledge"
    ? (target.startsWith("cg-") ? "source-t02-luna-knowledge-code-graphs" : "source-t02-luna-knowledge-wiki")
    : target.startsWith("T02-L0") ? "source-t02-luna-asset-world-l0" : target.startsWith("T02-L2") ? "source-t02-luna-asset-world-l2" : "source-t02-luna-asset-world-l1";

const pairGroups = [
  { family: "memory", batches: [["trials/memory-trial-01", "source-t02-luna-memory-trial-01"], ["expansion/memory-batch-01", "source-t02-luna-memory-expansion-batch-01"]] },
  { family: "skill", batches: [["trials/skill-trial-01", "source-t02-luna-skill-trial-01"], ["expansion/skill-batch-01", "source-t02-luna-skill-expansion-batch-01"]] },
  { family: "knowledge", batches: [["trials/knowledge-trial-01", "source-t02-luna-knowledge-trial-01"], ["expansion/knowledge-batch-01", "source-t02-luna-knowledge-expansion-batch-01"]] },
];
const publicCases = [];
const privateAnnotations = [];
const pairs = [];
let pairNumber = 0;
for (const group of pairGroups) {
  for (const [directory, batchSourceId] of group.batches) {
    const draftBatch = readJson(join(scriptDir, directory, "draft.json"));
    for (const draft of draftBatch.pairs) {
      pairNumber += 1;
      const pairId = `T02-PAIR-${String(pairNumber).padStart(3, "0")}`;
      const label = group.family.toUpperCase();
      const positiveCaseId = `T02-${label}-${String(pairNumber).padStart(3, "0")}-P`;
      const negativeCaseId = `T02-${label}-${String(pairNumber).padStart(3, "0")}-N`;
      const target = draft.positive.private_proposal.target_asset_ids[0];
      const inferredTaskId = target === "cg-t02pnd01" || target.includes("PANDAS") || target === "testing-python"
        ? "T02-TASK-PANDAS-RESAMPLING"
        : target.includes("NOTEBOOK") || target === "jupyter-notebook"
          ? "T02-TASK-NOTEBOOK-HANDOFF"
          : target.includes("TIMESERIES") || target === "T02-L0-03" || target === "timeseries-detrending"
            ? "T02-TASK-TIMESERIES-DETREND"
            : "T02-TASK-DASK-PARALLEL";
      const taskId = draft.source_fact_map?.map((item) => item.source_id).find((id) => taskById.has(id)) ?? inferredTaskId;
      const task = taskById.get(taskId);
      const sourceRefs = [...new Set([batchSourceId, task.sourceEvidenceIds[0], assetSourceForTarget(group.family, target), ...(draft.external_source_ids ?? []).filter((id) => sourceIdSet.has(id))])];
      const positive = caseRecord({ caseId: positiveCaseId, draft, delta: draft.positive.delta_message, task });
      const negative = caseRecord({ caseId: negativeCaseId, draft, delta: draft.negative.delta_message, task });
      publicCases.push(positive, negative);
      privateAnnotations.push(hashed({ caseId: positiveCaseId, sourceEvidenceIds: sourceRefs, pairId, pairRole: "positive", gold: goldFor(draft, group.family, sourceRefs), annotationReason: draft.positive.private_proposal.unique_information_gap }));
      privateAnnotations.push(hashed({ caseId: negativeCaseId, sourceEvidenceIds: sourceRefs, pairId, pairRole: "negative", gold: noToolGold(draft.negative.private_proposal.why_current_context_is_sufficient, sourceRefs), annotationReason: draft.negative.private_proposal.why_current_context_is_sufficient }));
      pairs.push(hashed({ pairId, positiveCaseId, negativeCaseId, counterfactualKind: "answer_in_current_context", controlledDeltaSha256: sha256(JSON.stringify({ positive_delta_message: draft.positive.delta_message, negative_delta_message: draft.negative.delta_message, query: draft.query })), currentEvidenceRefs: sourceRefs }));
    }
  }
}

const naturalBatch = readJson(join(scriptDir, "expansion", "natural-negative-batch-01", "draft.json"));
naturalBatch.cases.forEach((draft, index) => {
  const caseId = `T02-NATURAL-${String(index + 1).padStart(3, "0")}`;
  const taskId = draft.source_fact_map?.map((item) => item.source_id).find((id) => taskById.has(id)) ?? tasks[index % tasks.length].taskId;
  const task = taskById.get(taskId);
  const publicCase = hashed({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T02", userId, agentId, taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: draft.difficulty, contextMessages: normalizedMessages(draft.context_messages), query: draft.query, visibleAssetSetSha256 });
  const sourceRefs = [...new Set(["source-t02-luna-natural-negative-batch-01", task.sourceEvidenceIds[0], ...(draft.external_source_ids ?? []).filter((id) => sourceIdSet.has(id))])];
  publicCases.push(publicCase);
  privateAnnotations.push(hashed({ caseId, sourceEvidenceIds: sourceRefs, gold: noToolGold(draft.why_current_context_is_sufficient, sourceRefs), annotationReason: draft.why_current_context_is_sufficient }));
});

const listedSkillIds = inputPack.skill_source_pins.filter((pin) => pin.visibility === "listed").map((pin) => skillAssetId(pin.name));
const teamSourceIds = sourceEvidence.map((source) => source.sourceId);
const baseTeam = contract.teams.find((team) => team.teamId === "T02");
const finalTeam = hashed({ ...baseTeam, taskIds: tasks.map((task) => task.taskId), sourceEvidenceIds: teamSourceIds, contentHash: undefined });
delete finalTeam.contentHash;
const team = hashed(finalTeam);
const baseAgent = contract.businessAgents.find((agent) => agent.agentId === agentId);
const finalAgent = hashed({
  ...baseAgent,
  agentDetail: hashed({ description: "Maintains Pandas, time-series, Dask parallelism, and reproducible Notebook work in T02.", prompt: "Use only the current Team's frozen assets, preserve data and project boundaries, and stop when the case-specific information gap is closed." }),
  boundSkillIds: listedSkillIds,
  fixedKnowledgeIds: knowledge.map((item) => item.assetId),
  sourceEvidenceIds: teamSourceIds,
  contentHash: undefined,
});
delete finalAgent.contentHash;
const agent = hashed(finalAgent);

const teamFragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: "build-01",
  team_id: "T02",
  split: "dev",
  sourceEvidence,
  teams: [team],
  businessAgents: [agent],
  tasks,
  publicCases: publicCases.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  privateAnnotations: privateAnnotations.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  pairs: pairs.sort((a, b) => a.pairId.localeCompare(b.pairId)),
  snapshotAssetIds: [
    ...l0Conversations,
    ...l1Memories,
    ...l2Scenes,
    ...l3Profiles,
    ...skills,
    ...knowledge,
  ].map((asset) => asset.assetId).sort(),
  generatorBatchRefs: [
    ["asset-world/asset-world-batch-01", "asset-world", 33],
    ["trials/memory-trial-01", "memory", 1],
    ["trials/skill-trial-01", "skill", 1],
    ["trials/knowledge-trial-01", "knowledge", 1],
    ["expansion/memory-batch-01", "memory", 5],
    ["expansion/skill-batch-01", "skill", 5],
    ["expansion/knowledge-batch-01", "knowledge", 2],
    ["expansion/natural-negative-batch-01", "natural-negative", 10],
  ].map(([directory, family, count]) => {
    const manifest = readJson(join(scriptDir, directory, "manifest.json"));
    return {
      batchId: manifest.batch_id,
      path: `formal-dataset/generators/parallel/build-01/T02/${directory}`,
      family,
      count,
      generatorModel: manifest.generator_model,
      reasoningEffort: manifest.reasoning_effort,
      promptVersion: manifest.prompt_version,
      draftSha256: sha256(readFileSync(join(scriptDir, directory, "draft.json"))),
      solReview: "approved",
    };
  }),
  externalImports: skillSources.sources.map((source) => ({
    assetId: skills.find((skill) => skill.name === source.name)?.assetId,
    repository: source.repository_url,
    commit: source.revision,
    path: source.source_path,
    license: source.license_spdx,
    rawSha256: source.main_raw_sha256,
    metadataSha256: source.metadata_sha256,
    localRawPath: `formal-dataset/source-material/T02/${source.package_path}/raw/SKILL.md`,
    localAdaptedPath: `formal-dataset/source-material/T02/${source.package_path}/adapted/SKILL.md`,
  })),
};
mkdirSync(join(stagingDir, "assets"), { recursive: true });
writeJson(join(stagingDir, "team-fragment.json"), teamFragment);
writeJson(join(stagingDir, "assets", "memory.json"), { l0Conversations, l1Memories, l2Scenes, l3Profiles, runtimeTypeMappings: Object.fromEntries(l1Memories.map((item) => [item.assetId, item.runtimeType])) });
writeJson(join(stagingDir, "assets", "skills.json"), { skills });
writeJson(join(stagingDir, "assets", "knowledge.json"), { knowledge });
writeJson(join(scriptDir, "build-summary.json"), {
  schema_version: "task1.team_build_summary.v1",
  team_id: "T02",
  visible_asset_set_sha256: visibleAssetSetSha256,
  counts: {
    cases: teamFragment.publicCases.length,
    pairs: teamFragment.pairs.length,
    natural_negatives: teamFragment.privateAnnotations.filter((item) => !item.pairId).length,
    positive_families: Object.fromEntries(["memory", "skill", "knowledge"].map((family) => [family, teamFragment.privateAnnotations.filter((item) => item.pairRole === "positive" && item.gold.family === family).length])),
    l0: l0Conversations.length,
    l0_messages: l0Conversations.reduce((sum, item) => sum + item.messages.length, 0),
    l1: l1Memories.length,
    l2: l2Scenes.length,
    l3: l3Profiles.length,
    skills: skills.length,
    listed_skills: listedSkillIds.length,
    knowledge: knowledge.length,
    github_skill_sources: skillSources.sources.length,
    github_project_sources: projectSources.projects.length,
    sources: sourceEvidence.length,
  },
});
console.log(JSON.stringify(readJson(join(scriptDir, "build-summary.json")), null, 2));
