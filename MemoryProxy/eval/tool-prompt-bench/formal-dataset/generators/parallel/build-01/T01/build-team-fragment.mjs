import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = join(scriptDir, "..", "..", "..", "..");
const contractPath = join(formalDir, "registry", "contracts", "formal-v1.json");
const stagingDir = join(formalDir, "staging", "teams", "T01");
const legacyDir = join(scriptDir, "legacy");
const sourceDir = join(formalDir, "source-material", "T01");
const memoryDraftPath = join(scriptDir, "memory-assets", "memory-assets-batch-01", "draft.json");
const memoryManifestPath = join(scriptDir, "memory-assets", "memory-assets-batch-01", "manifest.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(
  Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(value),
).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const canonicalSha256 = (value) => sha256(JSON.stringify(stable(value)));
const hashed = (value) => ({ ...value, contentHash: canonicalSha256(value) });
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const contract = readJson(contractPath);
const inputPack = readJson(join(scriptDir, "input-pack.json"));
const memoryDraft = readJson(memoryDraftPath);
const memoryManifest = readJson(memoryManifestPath);
const skillSources = readJson(join(sourceDir, "skill-sources.json"));
const skillCandidates = readJson(join(legacyDir, "skill-batch-01", "asset-candidates.json"));
const agentId = "agent-task1-t01-general";
const worldAsOf = contract.world.worldAsOf;

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

const existingT01Sources = contract.sourceEvidence.filter((source) =>
  source.sourceId === "source-task1-registry-ds00" || source.sourceId.startsWith("source-t01-"));
const existingSourceIds = new Set(existingT01Sources.map((source) => source.sourceId));

const skillExternalSources = [];
for (const source of skillSources.sources) {
  const sourceId = `source-t01-skill-${source.name}`;
  if (existingSourceIds.has(sourceId)) continue;
  skillExternalSources.push(hashed({
    sourceId,
    provenanceKind: "external_import",
    dataset: source.repository_url.includes("skillsbench") ? "SkillsBench pinned GitHub Skill" : "awesome-copilot pinned GitHub Skill",
    datasetRevision: source.revision,
    datasetArtifactSha256: source.main_raw_sha256,
    sourceRepoUrl: source.repository_url,
    sourceRepoCommit: source.revision,
    sourceRepoLicense: source.license_spdx,
    sourceTaskId: source.source_path,
    role: "skill_source",
    origin: "repo_document",
    sourceTaskTime: "2026-08-28T12:00:00+08:00",
    trajectoryGeneratedAt: "2026-08-29T20:00:00+08:00",
    evidenceLocator: `source-material/T01/${source.package_path}/metadata.json`,
    evidenceSha256: source.main_raw_sha256,
    transform: "skill_package_import",
    transformVersion: "task1.github-skill-freeze.v1",
    transformInputSha256: source.main_raw_sha256,
    worldAsOf,
    piiScan: "passed",
    reviewStatus: "reviewed",
    reviewedBy: "Sol/DS02",
  }));
}

const legacySpecs = [
  ["memory-batch-01", "source-t01-luna-memory-batch-01", "paired_counterfactual"],
  ["skill-batch-01", "source-t01-luna-skill-batch-01", "paired_counterfactual"],
  ["knowledge-batch-01", "source-t01-luna-knowledge-batch-01", "paired_counterfactual"],
  ["natural-negative-batch-01", "source-t01-luna-natural-negative-batch-01", "natural_negative_selection"],
];
const legacyBatchEvidence = [];
for (const [directory, sourceId, transform] of legacySpecs) {
  const manifest = readJson(join(legacyDir, directory, "manifest.json"));
  const draft = readJson(join(legacyDir, directory, "draft.json"));
  const records = draft.pairs ?? draft.cases;
  legacyBatchEvidence.push(syntheticEvidence({
    sourceId,
    role: "evaluation_derivation",
    transform,
    transformVersion: `task1.${manifest.batch_id}.sol-reviewed.v1`,
    manifest,
    contentRefs: records.map((record) => record.draft_pair_id ?? record.draft_case_id),
  }));
}

const memoryEvidence = [
  syntheticEvidence({
    sourceId: "source-t01-luna-memory-assets-l1",
    role: "history",
    transform: "atomic_fact_extraction",
    transformVersion: "task1.t01-memory-assets-l1.sol-reviewed.v1",
    manifest: memoryManifest,
    contentRefs: memoryDraft.assets.filter((asset) => asset.level === "L1").map((asset) => asset.asset_id),
  }),
  syntheticEvidence({
    sourceId: "source-t01-luna-memory-assets-l2",
    role: "history",
    transform: "multi_session_scene_synthesis",
    transformVersion: "task1.t01-memory-assets-l2.sol-reviewed.v1",
    manifest: memoryManifest,
    contentRefs: memoryDraft.assets.filter((asset) => asset.level === "L2").map((asset) => asset.asset_id),
  }),
  syntheticEvidence({
    sourceId: "source-t01-luna-memory-assets-l3",
    role: "history",
    transform: "stable_profile_derivation",
    transformVersion: "task1.t01-memory-assets-l3.sol-reviewed.v1",
    manifest: memoryManifest,
    contentRefs: memoryDraft.assets.filter((asset) => asset.level === "L3").map((asset) => asset.asset_id),
  }),
];
const sourceEvidence = [...existingT01Sources, ...skillExternalSources, ...legacyBatchEvidence, ...memoryEvidence];
const sourceIdSet = new Set(sourceEvidence.map((source) => source.sourceId));

const pilotL0 = contract.assets.l0Conversations.filter((asset) => asset.ownerAgentId === agentId);
const allMessageIds = pilotL0.flatMap((session) => session.messages.map((message) => message.messageId));
const firstMessageFor = (asset) => {
  if (asset.asset_id.includes("PARAMSPEC")) return "T01-L0-12-M087";
  if (asset.asset_id.includes("STUBGEN")) return "T01-L0-11-M043";
  if (asset.asset_id.includes("MOTO")) return "T01-L0-01-M099";
  if (asset.asset_id.includes("UJSON") || asset.asset_id.includes("PARALLEL")) return "T01-L0-02-M099";
  return "T01-L0-12-M087";
};
for (const messageId of ["T01-L0-12-M087", "T01-L0-11-M043", "T01-L0-01-M099", "T01-L0-02-M099"]) {
  if (!allMessageIds.includes(messageId)) throw new Error(`missing supporting message ${messageId}`);
}

const l1Memories = memoryDraft.assets.filter((asset) => asset.level === "L1").map((asset) => {
  const dateMatch = asset.grounding_note.match(/\d{4}-\d{2}-\d{2}/);
  const observedAt = dateMatch ? `${dateMatch[0]}T12:00:00Z` : "2026-08-29T19:00:00+08:00";
  const codeEvidenceLocators = asset.asset_id === "T01-L1-MYPY-PARAMSPEC-OPTIONAL-BOUND"
    ? ["mypy/server/astdiff.py#snapshot_definition"]
    : asset.asset_id === "T01-L1-MYPY-STUBGEN-STAR-EXPANSION"
      ? ["mypy/stubgen.py#AliasPrinter.visit_star_expr"]
      : asset.asset_id === "T01-L1-MOTO-PRESENCE-PREDICATE"
        ? ["moto/events/models.py#EventPattern._does_event_match"]
        : [];
  const testEvidenceLocators = asset.asset_id === "T01-L1-MYPY-PARAMSPEC-OPTIONAL-BOUND"
    ? ["T01-L0-12-M087"]
    : asset.asset_id === "T01-L1-MYPY-STUBGEN-STAR-EXPANSION"
      ? ["T01-L0-11-M043"]
      : asset.asset_id === "T01-L1-MOTO-PRESENCE-PREDICATE"
        ? ["T01-L0-01-M098"]
        : [];
  return hashed({
    assetId: asset.asset_id,
    ownerAgentId: agentId,
    sourceEvidenceIds: ["source-t01-luna-memory-assets-l1"],
    observedAt,
    type: asset.formal_type,
    runtimeType: asset.runtime_type,
    title: asset.title,
    content: asset.content,
    status: "active",
    validFrom: observedAt,
    supportingMessageIds: [firstMessageFor(asset)],
    codeEvidenceLocators,
    testEvidenceLocators,
    groundingNote: asset.grounding_note,
  });
});

const l2Scenes = memoryDraft.assets.filter((asset) => asset.level === "L2").map((asset) => hashed({
  assetId: asset.asset_id,
  ownerAgentId: agentId,
  sourceEvidenceIds: ["source-t01-luna-memory-assets-l2"],
  observedAt: "2026-08-29T19:10:00+08:00",
  path: `/t01/python-reliability/${asset.asset_id.toLowerCase()}`,
  summary: asset.title,
  content: asset.content,
  injected: true,
  supportingSessionIds: ["T01-L0-01", "T01-L0-11", "T01-L0-12"],
  memberAssetIds: asset.member_ids,
  groundingNote: asset.grounding_note,
}));

const l3Profiles = memoryDraft.assets.filter((asset) => asset.level === "L3").map((asset) => hashed({
  assetId: asset.asset_id,
  ownerAgentId: agentId,
  sourceEvidenceIds: ["source-t01-luna-memory-assets-l3"],
  observedAt: "2026-08-29T19:20:00+08:00",
  content: asset.content,
  stability: "team",
  memberAssetIds: asset.member_ids,
  groundingNote: asset.grounding_note,
}));

const currentSkillByName = new Map(contract.assets.skills.filter((asset) => asset.ownerAgentId === agentId).map((asset) => [asset.name, asset]));
const candidatesByName = new Map([
  ...skillCandidates.current_assets.map((candidate) => [candidate.name, candidate]),
  ...skillCandidates.candidates.map((candidate) => [candidate.name, candidate]),
]);
const skillAssetId = (name) => `T01-SKILL-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
const skills = inputPack.skill_source_pins.map((pin) => {
  const metadata = readJson(join(sourceDir, "skills", pin.name, "metadata.json"));
  const candidate = candidatesByName.get(pin.name) ?? {};
  const current = currentSkillByName.get(pin.name);
  return hashed({
    assetId: skillAssetId(pin.name),
    ownerAgentId: agentId,
    sourceEvidenceIds: [`source-t01-skill-${pin.name}`],
    observedAt: current?.observedAt ?? "2026-08-29T20:00:00+08:00",
    name: pin.name,
    version: current?.version ?? "1.0.0",
    description: current?.description ?? candidate.description ?? `Frozen ${pin.name} procedure.`,
    useWhen: current?.useWhen ?? candidate.useWhen ?? `Use when ${pin.name} is the exact requested procedure.`,
    doNotUseWhen: current?.doNotUseWhen ?? candidate.doNotUseWhen ?? "Do not use when current context already supplies the procedure.",
    repoCommit: pin.revision,
    visibility: pin.visibility === "listed" ? "private" : "team",
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest: metadata.adapted_files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  });
});

const knowledge = contract.assets.knowledge.filter((asset) => asset.ownerAgentId === agentId);
const allAssetIds = [
  ...pilotL0.map((asset) => asset.assetId),
  ...l1Memories.map((asset) => asset.assetId),
  ...l2Scenes.map((asset) => asset.assetId),
  ...l3Profiles.map((asset) => asset.assetId),
  ...skills.map((asset) => asset.assetId),
  ...knowledge.map((asset) => asset.assetId),
].sort((left, right) => left.localeCompare(right));
const visibleAssetSetSha256 = canonicalSha256({
  teamId: "T01",
  userId: "user-task1-t01-eval",
  agentId,
  assetIds: allAssetIds,
});

const pilotTasks = contract.tasks.filter((task) => task.teamId === "T01");
const taskById = new Map(pilotTasks.map((task) => [task.taskId, task]));
const selectTask = (sourceIds) => sourceIds.some((sourceId) => sourceId.includes("ujson"))
  && !sourceIds.some((sourceId) => sourceId.includes("mypy"))
  ? taskById.get("T01-TASK-UJSON-FUZZING")
  : taskById.get("T01-TASK-MYPY-REGRESSION");

const publicCases = contract.publicCases.filter((item) => item.identity.teamId === "T01").map((item) => {
  const { contentHash: _oldHash, ...rest } = item;
  void _oldHash;
  return hashed({ ...rest, visibleAssetSetSha256 });
});
const privateAnnotations = contract.privateAnnotations.filter((item) => item.caseId.startsWith("T01-"));
const pairs = contract.pairs.filter((item) => item.pairId.startsWith("T01-"));

function normalizedMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function caseRecord({ caseId, draft, delta, task, role }) {
  const contextMessages = normalizedMessages(draft.shared_context_messages);
  contextMessages.splice(draft.changed_message_index, 0, { role: delta.role, content: delta.content });
  return hashed({
    caseId,
    identity: {
      spaceId: "space-task1-engineering",
      teamId: "T01",
      userId: "user-task1-t01-eval",
      agentId,
      taskId: task.taskId,
      sessionId: `session-${caseId.toLowerCase()}`,
      agentSource: "codex",
    },
    snapshotId: "snapshot-task1-dev-v1",
    workspace: task.workspace,
    language: "zh",
    difficulty: draft.difficulty,
    contextMessages,
    query: draft.query,
    visibleAssetSetSha256,
  });
}

const commonForbidden = {
  memory: ["skill_search", "skill_view", "knowledge_tools_list"],
  skill: ["tdai_memory_search", "tdai_conversation_search", "knowledge_tools_list"],
  knowledge: ["tdai_memory_search", "tdai_conversation_search", "skill_search", "skill_view"],
};
const targetName = (candidateId) => candidateId.replace(/^candidate-/, "").split(":")[0];

function goldFor(draft, family, sourceRefs) {
  const proposal = draft.positive.private_proposal;
  const sequence = proposal.allowed_sequence_candidates[0];
  const rawTargets = proposal.target_asset_ids;
  const targets = family === "skill"
    ? [skillAssetId(targetName(rawTargets[0]))]
    : rawTargets.filter((target) => !target.includes(":"));
  let allowedFirstActions;
  let expectedFollowupActions = [];
  let expectedKnowledgeCalls = [];
  if (family === "memory") {
    const tool = sequence[0];
    const endpoint = {
      tdai_memory_search: "/memory-bridge/v3/atomic/search",
      tdai_conversation_search: "/memory-bridge/v3/conversation/search",
      tdai_atomic_query: "/memory-bridge/v3/atomic/query",
    }[tool];
    const argumentRules = tool === "tdai_atomic_query"
      ? {
          requiredFields: ["type", "time_start", "time_end"],
          exactValues: draft.draft_pair_id.includes("MOTO")
            ? { type: "instruction", time_start: "2022-05-13T00:00:00Z", time_end: "2022-05-13T23:59:59Z" }
            : { type: "instruction", time_start: "2021-11-16T00:00:00Z", time_end: "2021-11-16T23:59:59Z" },
        }
      : {
          requiredFields: ["query"],
          forbiddenFields: ["user_id", "team_id", "agent_id"],
          stringContainsAny: { query: draft.draft_pair_id.includes("STUBGEN") ? ["stubgen", "TypeVarTuple", "星号"] : ["ParamSpec", "bound", "snapshot"] },
        };
    allowedFirstActions = [{ tool, endpoint, argumentRules }];
  } else if (family === "skill") {
    const name = targetName(rawTargets[0]);
    if (sequence[0] === "skill_search") {
      allowedFirstActions = [{
        tool: "skill_search",
        endpoint: "/skill-bridge/v3/skill/search",
        argumentRules: {
          requiredFields: ["query"],
          forbiddenFields: ["user_id", "team_id", "agent_id"],
          stringContainsAny: { query: name.split("-") },
        },
      }];
      expectedFollowupActions.push({
        tool: "skill_view_by_id",
        endpoint: "/skill-bridge/v3/skill/get",
        argumentRules: {
          requiredFields: ["skill_id"],
          forbiddenFields: ["user_id", "team_id", "agent_id"],
          valueFromPreviousStep: true,
        },
      });
    } else {
      allowedFirstActions = [{
        tool: "skill_view",
        endpoint: "/skill-bridge/v3/skill/get-by-name",
        argumentRules: {
          requiredFields: ["skill_name", "include_content", "include_manifest"],
          forbiddenFields: ["user_id", "team_id", "agent_id"],
          exactValues: { skill_name: name, include_content: true, include_manifest: true },
        },
      }];
      if (sequence.includes("skill_files_read")) expectedFollowupActions.push({
        tool: "skill_files_read",
        endpoint: "/skill-bridge/v3/skill/files/read",
        argumentRules: {
          requiredFields: ["skill_id", "path"],
          exactValues: { path: "resources/integration-testing.md" },
          valueFromPreviousStep: true,
        },
      });
    }
  } else {
    const knowledgeId = targets[0];
    allowedFirstActions = [{
      tool: "knowledge_tools_list",
      endpoint: "/tools/list",
      argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: knowledgeId } },
    }];
    expectedKnowledgeCalls = knowledgeId === "cg-t01mypy1"
      ? [{ toolName: "node", paramRules: { requiredFields: ["symbol"], exactValues: { symbol: "AliasPrinter" } } }]
      : [{ toolName: "search", paramRules: { requiredFields: ["query"], stringContainsAny: { query: ["replay", "evidence", "promotion", "佐证"] } } }];
  }
  return hashed({
    needTdaiTool: true,
    family,
    allowedFirstActions,
    expectedFollowupActions,
    expectedKnowledgeCalls,
    allowedSequences: [sequence],
    forbiddenTools: commonForbidden[family],
    maxTdaiCalls: sequence.length,
    targetAssetIds: targets,
    informationGap: proposal.unique_information_gap,
    stopAfter: proposal.stop_after_candidate,
    evidenceRefs: sourceRefs,
    ablationEvidence: `Removing ${targets.join(", ")} leaves the case-specific information gap unresolved.`,
  });
}

function noToolGold(reason, sourceRefs) {
  return hashed({
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    expectedFollowupActions: [],
    expectedKnowledgeCalls: [],
    allowedSequences: [],
    forbiddenTools: [],
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs: sourceRefs,
    ablationEvidence: "Not applicable: this case is intentionally self-contained.",
    noToolEvidence: reason,
  });
}

const pairBatches = [
  { directory: "memory-batch-01", family: "memory", sourceId: "source-t01-luna-memory-batch-01", start: 6 },
  { directory: "skill-batch-01", family: "skill", sourceId: "source-t01-luna-skill-batch-01", start: 10 },
  { directory: "knowledge-batch-01", family: "knowledge", sourceId: "source-t01-luna-knowledge-batch-01", start: 14 },
];

for (const batch of pairBatches) {
  const draftBatch = readJson(join(legacyDir, batch.directory, "draft.json"));
  draftBatch.pairs.forEach((draft, offset) => {
    const number = batch.start + offset;
    const pairId = `T01-PAIR-${String(number).padStart(3, "0")}`;
    const familyLabel = batch.family.toUpperCase();
    const positiveCaseId = `T01-${familyLabel}-${String(number).padStart(3, "0")}-P`;
    const negativeCaseId = `T01-${familyLabel}-${String(number).padStart(3, "0")}-N`;
    const task = selectTask(draft.source_ids ?? []);
    const positive = caseRecord({ caseId: positiveCaseId, draft, delta: draft.positive.delta_message, task, role: "positive" });
    const negative = caseRecord({ caseId: negativeCaseId, draft, delta: draft.negative.delta_message, task, role: "negative" });
    publicCases.push(positive, negative);
    const groundedRefs = (draft.source_ids ?? []).filter((sourceId) => sourceIdSet.has(sourceId));
    if (batch.family === "skill") groundedRefs.push(`source-t01-skill-${targetName(draft.positive.private_proposal.target_asset_ids[0])}`);
    const sourceRefs = [...new Set([batch.sourceId, ...groundedRefs])];
    privateAnnotations.push(hashed({
      caseId: positiveCaseId,
      sourceEvidenceIds: sourceRefs,
      pairId,
      pairRole: "positive",
      gold: goldFor(draft, batch.family, sourceRefs),
      annotationReason: draft.positive.private_proposal.unique_information_gap,
    }));
    privateAnnotations.push(hashed({
      caseId: negativeCaseId,
      sourceEvidenceIds: sourceRefs,
      pairId,
      pairRole: "negative",
      gold: noToolGold(draft.negative.private_proposal.why_current_context_is_sufficient, sourceRefs),
      annotationReason: draft.negative.private_proposal.why_current_context_is_sufficient,
    }));
    pairs.push(hashed({
      pairId,
      positiveCaseId,
      negativeCaseId,
      counterfactualKind: "answer_in_current_context",
      controlledDeltaSha256: sha256(JSON.stringify({
        positive_delta_message: draft.positive.delta_message,
        negative_delta_message: draft.negative.delta_message,
        query: draft.query,
      })),
      currentEvidenceRefs: sourceRefs,
    }));
  });
}

const naturalBatch = readJson(join(legacyDir, "natural-negative-batch-01", "draft.json"));
naturalBatch.cases.forEach((draft, index) => {
  const caseId = `T01-NATURAL-${String(index + 1).padStart(3, "0")}`;
  const task = selectTask(draft.source_ids ?? []);
  const publicCase = hashed({
    caseId,
    identity: {
      spaceId: "space-task1-engineering",
      teamId: "T01",
      userId: "user-task1-t01-eval",
      agentId,
      taskId: task.taskId,
      sessionId: `session-${caseId.toLowerCase()}`,
      agentSource: "codex",
    },
    snapshotId: "snapshot-task1-dev-v1",
    workspace: task.workspace,
    language: "zh",
    difficulty: draft.difficulty,
    contextMessages: normalizedMessages(draft.context_messages),
    query: draft.query,
    visibleAssetSetSha256,
  });
  publicCases.push(publicCase);
  const groundedRefs = (draft.source_ids ?? []).filter((sourceId) => sourceIdSet.has(sourceId));
  const sourceRefs = [...new Set(["source-t01-luna-natural-negative-batch-01", ...groundedRefs])];
  privateAnnotations.push(hashed({
    caseId,
    sourceEvidenceIds: sourceRefs,
    gold: noToolGold(draft.why_current_context_is_sufficient, sourceRefs),
    annotationReason: draft.why_current_context_is_sufficient,
  }));
});

const listedSkillIds = inputPack.skill_source_pins.filter((pin) => pin.visibility === "listed").map((pin) => skillAssetId(pin.name));
const teamSourceIds = [
  "source-task1-registry-ds00",
  ...legacyBatchEvidence.map((source) => source.sourceId),
  ...memoryEvidence.map((source) => source.sourceId),
  ...skillExternalSources.map((source) => source.sourceId),
];
const team = hashed({
  ...contract.teams.find((item) => item.teamId === "T01"),
  taskIds: pilotTasks.map((task) => task.taskId),
  sourceEvidenceIds: teamSourceIds,
  contentHash: undefined,
});
delete team.contentHash;
const finalTeam = hashed(team);
const baseAgent = contract.businessAgents.find((item) => item.agentId === agentId);
const agentDetail = hashed({
  description: "Maintains Python reliability, type-analysis, testing, fuzzing, and evidence-review work in T01.",
  prompt: "Use only the current Team's frozen assets, preserve project boundaries, and stop when the case-specific information gap is closed.",
});
const agent = hashed({
  ...baseAgent,
  agentDetail,
  boundSkillIds: listedSkillIds,
  fixedKnowledgeIds: knowledge.map((asset) => asset.assetId),
  sourceEvidenceIds: teamSourceIds,
  contentHash: undefined,
});
delete agent.contentHash;
const finalAgent = hashed(agent);

const teamFragment = {
  schema_version: "task1.team_fragment.v1",
  build_id: "build-01",
  team_id: "T01",
  split: "dev",
  sourceEvidence,
  teams: [finalTeam],
  businessAgents: [finalAgent],
  tasks: pilotTasks,
  publicCases: publicCases.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  privateAnnotations: privateAnnotations.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  pairs: pairs.sort((a, b) => a.pairId.localeCompare(b.pairId)),
  snapshotAssetIds: [
    ...pilotL0,
    ...l1Memories,
    ...l2Scenes,
    ...l3Profiles,
    ...skills,
    ...knowledge,
  ].map((asset) => asset.assetId).sort(),
  generatorBatchRefs: [
    ["legacy/memory-batch-01", "memory", 4],
    ["legacy/skill-batch-01", "skill", 4],
    ["legacy/knowledge-batch-01", "knowledge", 2],
    ["legacy/natural-negative-batch-01", "natural-negative", 10],
    ["memory-assets/memory-assets-batch-01", "memory-assets", 20],
  ].map(([directory, family, count]) => {
    const manifest = readJson(join(scriptDir, directory, "manifest.json"));
    return {
      batchId: manifest.batch_id,
      path: `formal-dataset/generators/parallel/build-01/T01/${directory}`,
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
    localRawPath: `formal-dataset/source-material/T01/${source.package_path}/raw/SKILL.md`,
    localAdaptedPath: `formal-dataset/source-material/T01/${source.package_path}/adapted/SKILL.md`,
  })),
};

mkdirSync(join(stagingDir, "assets"), { recursive: true });
writeJson(join(stagingDir, "team-fragment.json"), teamFragment);
writeJson(join(stagingDir, "assets", "memory.json"), {
  l0Conversations: pilotL0,
  l1Memories,
  l2Scenes,
  l3Profiles,
  runtimeTypeMappings: Object.fromEntries(l1Memories.map((asset) => [asset.assetId, asset.runtimeType])),
});
writeJson(join(stagingDir, "assets", "skills.json"), { skills });
writeJson(join(stagingDir, "assets", "knowledge.json"), { knowledge });
writeJson(join(scriptDir, "build-summary.json"), {
  schema_version: "task1.team_build_summary.v1",
  team_id: "T01",
  visible_asset_set_sha256: visibleAssetSetSha256,
  counts: {
    cases: teamFragment.publicCases.length,
    pairs: teamFragment.pairs.length,
    natural_negatives: teamFragment.privateAnnotations.filter((item) => !item.pairId).length,
    positive_families: Object.fromEntries(["memory", "skill", "knowledge"].map((family) => [family,
      teamFragment.privateAnnotations.filter((item) => item.pairRole === "positive" && item.gold.family === family).length,
    ])),
    l0: pilotL0.length,
    l1: l1Memories.length,
    l2: l2Scenes.length,
    l3: l3Profiles.length,
    skills: skills.length,
    knowledge: knowledge.length,
    sources: sourceEvidence.length,
  },
});
console.log(JSON.stringify(readJson(join(scriptDir, "build-summary.json")), null, 2));
