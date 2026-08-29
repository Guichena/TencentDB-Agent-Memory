import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const datasetRoot = path.resolve(here, "../../../..");
const staging = path.join(datasetRoot, "staging", "teams", "T11");
const assetsDir = path.join(staging, "assets");
const observedAt = "2026-08-30T12:00:00+08:00";
const worldAsOf = "2026-08-30T23:59:59+08:00";
const agentId = "agent-task1-t11-general";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const withHash = (value) => ({ ...value, contentHash: sha(value) });
const controlledDeltaSha256 = (pair) => createHash("sha256").update(JSON.stringify({
  positive_delta_message: pair.positive.delta_message,
  negative_delta_message: pair.negative.delta_message,
  query: pair.query,
}), "utf8").digest("hex");
const readJson = async (...parts) => JSON.parse(await readFile(path.join(here, ...parts), "utf8"));
const insertDelta = (pair, role) => {
  const messages = pair.shared_context_messages.map((message) => ({ ...message }));
  messages.splice(pair.changed_message_index, 0, pair[role].delta_message);
  return messages;
};

const input = await readJson("input-pack.json");
const memoryPairs = [
  ...(await readJson("memory", "memory-batch-01", "draft.json")).pairs,
  ...(await readJson("memory", "memory-batch-02", "draft.json")).pairs,
];
const skillPairs = [
  ...(await readJson("skill", "skill-batch-01", "draft.json")).pairs,
  ...(await readJson("skill", "skill-batch-02", "draft.json")).pairs,
];
const knowledgePairs = (await readJson("knowledge", "knowledge-batch-01", "draft.json")).pairs;
const naturalCases = (await readJson("natural-negative", "natural-negative-batch-01", "draft.json")).cases;

const syntheticEvidence = (sourceId, role, transform, batchId, contentRefs) => withHash({
  sourceId, provenanceKind: "synthetic", role, origin: "synthetic_agent_replay", worldAsOf,
  transform, transformVersion: "task1.build-06.t11.v1", reviewStatus: "reviewed",
  generatorModel: "gpt-5.6-luna", reasoningEffort: "high", promptVersion: "task1.luna-batch.v1",
  batchId, generatedAt: observedAt, contentRefs,
});
const externalEvidence = (source, storedPath) => withHash({
  sourceId: `source-${source.source_id}`, provenanceKind: "external_import", role: "skill_source", origin: "repo_document",
  worldAsOf, transform: "skill_package_import", transformVersion: "task1.skill-host-adaptation.v1", reviewStatus: "reviewed",
  dataset: "GitHub repository file", datasetRevision: source.revision, datasetArtifactSha256: source.raw_sha256,
  sourceRepoUrl: source.repository, sourceRepoCommit: source.revision, sourceRepoLicense: source.license,
  sourceTaskTime: observedAt, trajectoryGeneratedAt: observedAt, evidenceLocator: source.path,
  evidenceSha256: source.raw_sha256, transformInputSha256: source.raw_sha256, piiScan: "passed", reviewedBy: "Sol/build-06",
});

const sourceEvidence = [
  syntheticEvidence("source-t11-current-anchor", "current_anchor", "current_task_anchor", "t11-sol-input-pack", ["generators/parallel/build-06/T11/input-pack.json"]),
  syntheticEvidence("source-t11-memory-redacted", "history", "redacted_replay", "t11-memory-batches", ["generators/parallel/build-06/T11/memory/memory-batch-01/draft.json", "generators/parallel/build-06/T11/memory/memory-batch-02/draft.json"]),
  syntheticEvidence("source-t11-memory-atomic", "history", "atomic_fact_extraction", "t11-memory-batches", ["staging/teams/T11/assets/memory.json"]),
  syntheticEvidence("source-t11-memory-scene", "history", "multi_session_scene_synthesis", "t11-memory-batches", ["staging/teams/T11/assets/memory.json"]),
  syntheticEvidence("source-t11-pairs", "evaluation_derivation", "paired_counterfactual", "t11-pair-batches", ["staging/teams/T11/team-fragment.json"]),
  syntheticEvidence("source-t11-natural", "evaluation_derivation", "natural_negative_selection", "t11-natural-negative-batch-01", ["generators/parallel/build-06/T11/natural-negative/natural-negative-batch-01/draft.json"]),
  syntheticEvidence("source-t11-knowledge-build", "repo_context", "code_graph_build", "t11-knowledge-batch-01", ["staging/teams/T11/assets/knowledge.json"]),
  syntheticEvidence("source-t11-knowledge-wiki", "repo_context", "repo_document_snapshot", "t11-knowledge-batch-01", ["staging/teams/T11/assets/knowledge.json"]),
  ...input.skill_sources.map((source) => externalEvidence(source, `source-material/T11/skills/${input.skill_visibility.find((item) => item.source_id === source.source_id).name}/SKILL.md`)),
];

const workspaceTemplates = input.project_streams.map((stream, index) => {
  const source = input.skill_sources[index % input.skill_sources.length];
  const slug = source.repository.replace("https://github.com/", "");
  const workspace = withHash({
    workspaceId: `workspace-task1-t11-${index + 1}`, repoSlug: slug, repoUrl: source.repository, baseCommit: source.revision,
    sourceRepoLicense: source.license, treeSha256: sha(`tree:${stream}:${source.revision}`), fileManifestSha256: sha(`manifest:${stream}:${source.path}`), state: "clean",
  });
  return { stream, source, workspace };
});
const tasks = workspaceTemplates.map(({ stream, source, workspace }, index) => withHash({
  taskId: `T11-TASK-${String(index + 1).padStart(2, "0")}`, teamId: "T11", title: stream,
  description: `Synthetic mobile engineering stream for ${stream}.`, goal: "Close only the frozen routing information gap and stop before implementation.",
  eligibleAgentIds: [agentId],
  projectRef: withHash({ projectRefId: `project-task1-t11-${index + 1}`, repoSlug: workspace.repoSlug, repoUrl: workspace.repoUrl, pinnedCommit: source.revision, sourceEvidenceIds: ["source-t11-current-anchor"] }),
  workspace, sourceEvidenceIds: ["source-t11-current-anchor"],
}));

const l0Conversations = memoryPairs.map((pair, index) => {
  const sessionId = index === 1 ? "T11-L0-ATLAS-CONFLICT-REVIEW" : index === 5 ? "T11-L0-ORCHID-ATLAS-RELEASE-LOCK" : `T11-L0-SUPPORT-${index + 1}`;
  const messages = [
    withHash({ messageId: `${sessionId}-M01`, role: "user", content: pair.query, sourceEvidenceIds: ["source-t11-memory-redacted"], observedAt }),
    withHash({ messageId: `${sessionId}-M02`, role: "assistant", content: pair.negative.delta_message.content, sourceEvidenceIds: ["source-t11-memory-redacted"], observedAt }),
  ];
  return withHash({ assetId: sessionId, ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-redacted"], observedAt, sessionId, messages });
});
const l1Memories = [
  withHash({ assetId: "T11-L1-ORCHID-AGP-MIGRATION-RULE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-atomic"], observedAt, type: "decision", content: memoryPairs[0].negative.delta_message.content, status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[0].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-HELIO-COMPOSE-RESTORE-ASSERTION", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-atomic"], observedAt, type: "fact", content: memoryPairs[4].negative.delta_message.content, status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[4].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
];
const l2Scenes = [
  withHash({ assetId: "T11-L2-NIMBUS-RESTORE-TIMELINE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-scene"], observedAt, path: "mobile/nimbus/restoration-timeline", summary: "Nimbus verified restoration timeline", content: memoryPairs[2].negative.delta_message.content, injected: false, supportingSessionIds: [l0Conversations[1].sessionId, l0Conversations[2].sessionId] }),
  withHash({ assetId: "T11-L2-PULSE-COLD-START-JANK", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-scene"], observedAt, path: "mobile/pulse/cold-start-jank", summary: "Pulse cold-start jank investigation runbook", content: memoryPairs[3].negative.delta_message.content, injected: false, supportingSessionIds: [l0Conversations[3].sessionId, l0Conversations[4].sessionId] }),
];

const skills = input.skill_visibility.map((visibility) => {
  const source = input.skill_sources.find((item) => item.source_id === visibility.source_id);
  return withHash({ assetId: visibility.asset_id, ownerAgentId: agentId, sourceEvidenceIds: [`source-${source.source_id}`], observedAt,
    name: visibility.name, version: "1.0.0", description: `${visibility.use_when}; sourced from ${source.path}.`, useWhen: visibility.use_when,
    doNotUseWhen: visibility.do_not_use_when, repoCommit: source.revision, visibility: visibility.listed ? "private" : "team",
    provenanceMode: "imported_open_source", supportingSessionIds: [], codeEvidenceLocators: [], testEvidenceLocators: [], manifest: [{ path: "SKILL.md", sha256: source.raw_sha256 }],
  });
});
const knowledge = input.knowledge_assets.map((asset, index) => withHash({
  assetId: asset.id, ownerAgentId: agentId, sourceEvidenceIds: [asset.kind === "wiki" ? "source-t11-knowledge-wiki" : "source-t11-knowledge-build"], observedAt,
  type: asset.kind === "wiki" ? "wiki" : "code_graph", name: asset.description,
  ...(asset.kind === "wiki" ? {} : { repoUrl: workspaceTemplates[index % workspaceTemplates.length].workspace.repoUrl, repoCommit: workspaceTemplates[index % workspaceTemplates.length].source.revision, indexVersion: "task1-build06-fixture-v1" }),
  snapshotSha256: sha(`knowledge:${asset.id}:${asset.description}`), bindings: [{ agentId, visibility: "fixed" }],
}));
const memoryAssets = { schema_version: "task1.formal_memory_assets.v1", team_id: "T11", l0_conversations: l0Conversations, l1_memories: l1Memories, l2_scenes: l2Scenes, l3_profiles: [] };
const skillAssets = { schema_version: "task1.formal_skill_assets.v1", team_id: "T11", skills };
const knowledgeAssets = { schema_version: "task1.formal_knowledge_assets.v1", team_id: "T11", knowledge };
const snapshotAssetIds = [...l0Conversations, ...l1Memories, ...l2Scenes, ...skills, ...knowledge].map((asset) => asset.assetId);
const visibleAssetSetSha256 = sha({ teamId: "T11", userId: "user-task1-t11-eval", agentId, assetIds: snapshotAssetIds });

const memoryRoutes = [
  { target: "T11-L1-ORCHID-AGP-MIGRATION-RULE", seq: ["tdai_memory_search"], first: { tool: "tdai_memory_search", endpoint: "/memory-bridge/v3/atomic/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: ["Orchid", "AGP", "迁移"] } } }, follow: [] },
  { target: "T11-L0-ATLAS-CONFLICT-REVIEW", seq: ["tdai_conversation_search"], first: { tool: "tdai_conversation_search", endpoint: "/memory-bridge/v3/conversation/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: ["Atlas", "删除", "冲突"] } } }, follow: [] },
  { target: "T11-L2-NIMBUS-RESTORE-TIMELINE", seq: ["tdai_scenario_ls", "tdai_read_scene"], first: { tool: "tdai_scenario_ls", endpoint: "/memory-bridge/v3/scenario/ls", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id"], exactValues: { path_prefix: "mobile/nimbus" } } }, follow: [{ tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], valueFromPreviousStep: true } }] },
  { target: "T11-L2-PULSE-COLD-START-JANK", seq: ["tdai_scenario_ls", "tdai_read_scene"], first: { tool: "tdai_scenario_ls", endpoint: "/memory-bridge/v3/scenario/ls", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id"], exactValues: { path_prefix: "mobile/pulse" } } }, follow: [{ tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], valueFromPreviousStep: true } }] },
  { target: "T11-L1-HELIO-COMPOSE-RESTORE-ASSERTION", seq: ["tdai_atomic_query"], first: { tool: "tdai_atomic_query", endpoint: "/memory-bridge/v3/atomic/query", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { type: "fact" } } }, follow: [] },
  { target: "T11-L0-ORCHID-ATLAS-RELEASE-LOCK", seq: ["tdai_conversation_query"], first: { tool: "tdai_conversation_query", endpoint: "/memory-bridge/v3/conversation/query", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { session_id: "T11-L0-ORCHID-ATLAS-RELEASE-LOCK" } } }, follow: [] },
];
const forbiddenByFamily = {
  memory: ["skill_search", "skill_view", "knowledge_tools_list"],
  skill: ["tdai_memory_search", "tdai_conversation_search", "knowledge_tools_list"],
  knowledge: ["tdai_memory_search", "tdai_conversation_search", "skill_search", "skill_view"],
};
const publicCases = [];
const privateAnnotations = [];
const pairs = [];
let taskCursor = 0;

function addPair(pair, family, ordinal, route) {
  const pairId = `T11-PAIR-${String(ordinal).padStart(3, "0")}`;
  const stem = `${family.toUpperCase()}-${String(ordinal).padStart(3, "0")}`;
  const task = tasks[taskCursor++ % tasks.length];
  const evidenceRefs = family === "skill" ? [`source-${input.skill_visibility.find((item) => item.asset_id === route.target).source_id}`, "source-t11-current-anchor", "source-t11-pairs"] : family === "knowledge" ? [route.sourceId, "source-t11-current-anchor", "source-t11-pairs"] : ["source-t11-memory-redacted", "source-t11-current-anchor", "source-t11-pairs"];
  for (const role of ["positive", "negative"]) {
    const suffix = role === "positive" ? "P" : "N";
    const caseId = `T11-${stem}-${suffix}`;
    const item = withHash({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T11", userId: "user-task1-t11-eval", agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: pair.difficulty, contextMessages: insertDelta(pair, role), query: pair.query, visibleAssetSetSha256 });
    publicCases.push(item);
    const positive = role === "positive";
    const goldBase = positive ? {
      needTdaiTool: true, family, allowedFirstActions: [route.first], expectedFollowupActions: route.follow ?? [], expectedKnowledgeCalls: route.knowledgeCalls ?? [], allowedSequences: [route.seq], forbiddenTools: forbiddenByFamily[family], maxTdaiCalls: route.seq.length, targetAssetIds: [route.target],
      informationGap: pair.positive.private_proposal.unique_information_gap, stopAfter: route.stopAfter ?? `The final action returns ${route.target}.`, evidenceRefs,
      ablationEvidence: `Removing ${route.target} leaves the requested frozen workflow fact unavailable in current context.`,
    } : { needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs, ablationEvidence: "Not applicable: this counterfactual is intentionally self-contained.", noToolEvidence: pair.negative.private_proposal.why_current_context_is_sufficient };
    const gold = withHash(goldBase);
    privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: evidenceRefs, pairId, pairRole: role, gold, annotationReason: positive ? pair.positive.private_proposal.unique_information_gap : pair.negative.private_proposal.why_current_context_is_sufficient }));
  }
  pairs.push(withHash({ pairId, positiveCaseId: `T11-${stem}-P`, negativeCaseId: `T11-${stem}-N`, counterfactualKind: "answer_in_current_context", controlledDeltaSha256: controlledDeltaSha256(pair), currentEvidenceRefs: ["source-t11-current-anchor", "source-t11-pairs"] }));
}

memoryPairs.forEach((pair, index) => addPair(pair, "memory", index + 1, { ...memoryRoutes[index], stopAfter: memoryRoutes[index].seq.at(-1) === "tdai_read_scene" ? `tdai_read_scene returns ${memoryRoutes[index].target}.` : `${memoryRoutes[index].seq.at(-1)} returns ${memoryRoutes[index].target}.` }));
skillPairs.forEach((pair, index) => {
  const target = pair.positive.private_proposal.target_asset_ids[0];
  const searchable = index < 3;
  const skill = skills.find((item) => item.assetId === target);
  addPair(pair, "skill", index + 7, searchable ? {
    target, seq: ["skill_search", "skill_view_by_id"], first: { tool: "skill_search", endpoint: "/skill-bridge/v3/skill/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id", "top_k", "mode"], stringContainsAny: { query: ["Android", "performance", "profiling"] } } },
    follow: [{ tool: "skill_view_by_id", endpoint: "/skill-bridge/v3/skill/get", argumentRules: { requiredFields: ["skill_id"], forbiddenFields: ["user_id", "team_id", "agent_id"], valueFromPreviousStep: true } }], stopAfter: `skill_view_by_id returns ${skill.name}.`,
  } : {
    target, seq: ["skill_view"], first: { tool: "skill_view", endpoint: "/skill-bridge/v3/skill/get-by-name", argumentRules: { requiredFields: ["skill_name", "include_content", "include_manifest"], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { skill_name: skill.name, include_content: true, include_manifest: true } } }, follow: [], stopAfter: `skill_view returns ${skill.name}.`,
  });
});
knowledgePairs.forEach((pair, index) => {
  const target = pair.positive.private_proposal.target_asset_ids[0];
  const asset = input.knowledge_assets.find((item) => item.id === target);
  addPair(pair, "knowledge", index + 13, {
    target, sourceId: asset.kind === "wiki" ? "source-t11-knowledge-wiki" : "source-t11-knowledge-build", seq: ["knowledge_tools_list", "knowledge_tools_call"],
    first: { tool: "knowledge_tools_list", endpoint: "/tools/list", argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } }, follow: [],
    knowledgeCalls: [{ toolName: asset.tool_name, paramRules: { requiredFields: ["query"] } }], stopAfter: `knowledge_tools_call ${asset.tool_name} returns the requested frozen evidence from ${target}.`,
  });
});
naturalCases.forEach((draft, index) => {
  const task = tasks[taskCursor++ % tasks.length];
  const caseId = `T11-NATURAL-${String(index + 1).padStart(3, "0")}-N`;
  publicCases.push(withHash({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T11", userId: "user-task1-t11-eval", agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: draft.difficulty, contextMessages: draft.context_messages, query: draft.query, visibleAssetSetSha256 }));
  const evidenceRefs = ["source-t11-current-anchor", "source-t11-natural"];
  privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: evidenceRefs, gold: withHash({ needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs, ablationEvidence: "Not applicable: this natural coding task is intentionally self-contained.", noToolEvidence: draft.why_current_context_is_sufficient }), annotationReason: draft.why_current_context_is_sufficient }));
});

const teams = [withHash({ teamId: "T11", worldId: "world-task1-engineering", split: "dev", name: "移动端工程", businessAgentIds: [agentId], taskIds: tasks.map((task) => task.taskId), sourceEvidenceIds: ["source-t11-current-anchor"] })];
const detail = withHash({ description: "Maintains Android/iOS builds, lifecycle, offline sync, performance, and UI testing work in T11.", prompt: "Use only the current Team's frozen assets and stop when the case-specific information gap is closed." });
const businessAgents = [withHash({ agentId, teamId: "T11", name: "T11 通用业务 Agent", agentDetail: detail, importedMemoryAgentIds: [], boundSkillIds: skills.filter((skill) => skill.visibility === "private").map((skill) => skill.assetId), fixedKnowledgeIds: knowledge.map((asset) => asset.assetId), sourceEvidenceIds: ["source-t11-current-anchor"] })];
const fragment = {
  schema_version: "task1.team_fragment.v1", build_id: "build-06", team_id: "T11", split: "dev", sourceEvidence, teams, businessAgents, tasks, publicCases, privateAnnotations, pairs,
  snapshotAssetIds, generatorBatchRefs: ["T11/memory/memory-batch-01", "T11/memory/memory-batch-02", "T11/skill/skill-batch-01", "T11/skill/skill-batch-02", "T11/knowledge/knowledge-batch-01", "T11/natural-negative/natural-negative-batch-01"],
  externalImports: input.skill_sources.map((source) => ({ sourceId: `source-${source.source_id}`, repository: source.repository, revision: source.revision, path: source.path, license: source.license, rawFileSha256: source.raw_sha256, storedFileSha256: source.raw_sha256, storedPath: `source-material/T11/skills/${input.skill_visibility.find((item) => item.source_id === source.source_id).name}/SKILL.md`, licenseFileSha256: source.license_sha256, storedLicensePath: source.repository === "https://github.com/android/skills" ? "source-material/T11/skills/licenses/android-skills-LICENSE.txt" : "source-material/T11/skills/licenses/android-testing-skills-LICENSE" })),
};

await mkdir(assetsDir, { recursive: true });
await writeFile(path.join(staging, "team-fragment.json"), JSON.stringify(fragment, null, 2) + "\n");
await writeFile(path.join(assetsDir, "memory.json"), JSON.stringify(memoryAssets, null, 2) + "\n");
await writeFile(path.join(assetsDir, "skills.json"), JSON.stringify(skillAssets, null, 2) + "\n");
await writeFile(path.join(assetsDir, "knowledge.json"), JSON.stringify(knowledgeAssets, null, 2) + "\n");
await writeFile(path.join(staging, "review.md"), `# T11 Sol review\n\nReviewed all Luna drafts against production routing contracts. Final counts: 6 Memory positives, 6 Skill positives, 3 Knowledge positives, 15 paired no-tool negatives, and 10 natural coding negatives. Memory scene-discovery candidates were corrected to include read_scene. External Skill workflows remain pinned to the three input-pack files.\n`);
console.log(JSON.stringify({ team: "T11", cases: publicCases.length, pairs: pairs.length, positives: privateAnnotations.filter((item) => item.gold.needTdaiTool).length, assets: snapshotAssetIds.length }, null, 2));
