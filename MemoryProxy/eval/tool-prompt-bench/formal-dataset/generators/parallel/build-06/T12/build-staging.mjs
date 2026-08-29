import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const datasetRoot = path.resolve(here, "../../../..");
const staging = path.join(datasetRoot, "staging", "teams", "T12");
const assetsDir = path.join(staging, "assets");
const observedAt = "2026-08-30T12:00:00+08:00";
const worldAsOf = "2026-08-30T23:59:59+08:00";
const agentId = "agent-task1-t12-general";

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
  ...(await readJson("skill", "skill-search-batch-02", "draft.json")).pairs,
  ...(await readJson("skill", "skill-direct-batch-03", "draft.json")).pairs,
];
const knowledgePairs = (await readJson("knowledge", "knowledge-batch-01", "draft.json")).pairs;
const naturalCases = (await readJson("natural-negative", "natural-negative-batch-01", "draft.json")).cases;

const syntheticEvidence = (sourceId, role, transform, batchId, contentRefs) => withHash({
  sourceId, provenanceKind: "synthetic", role, origin: "synthetic_agent_replay", worldAsOf,
  transform, transformVersion: "task1.build-06.t12.v1", reviewStatus: "reviewed",
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
  syntheticEvidence("source-t12-current-anchor", "current_anchor", "current_task_anchor", "t12-sol-input-pack", ["generators/parallel/build-06/T12/input-pack.json"]),
  syntheticEvidence("source-t12-memory-redacted", "history", "redacted_replay", "t12-memory-batches", ["generators/parallel/build-06/T12/memory/memory-batch-01/draft.json", "generators/parallel/build-06/T12/memory/memory-batch-02/draft.json"]),
  syntheticEvidence("source-t12-memory-atomic", "history", "atomic_fact_extraction", "t12-memory-batches", ["staging/teams/T12/assets/memory.json"]),
  syntheticEvidence("source-t12-memory-scene", "history", "multi_session_scene_synthesis", "t12-memory-batches", ["staging/teams/T12/assets/memory.json"]),
  syntheticEvidence("source-t12-pairs", "evaluation_derivation", "paired_counterfactual", "t12-pair-batches", ["staging/teams/T12/team-fragment.json"]),
  syntheticEvidence("source-t12-natural", "evaluation_derivation", "natural_negative_selection", "t12-natural-negative-batch-01", ["generators/parallel/build-06/T12/natural-negative/natural-negative-batch-01/draft.json"]),
  syntheticEvidence("source-t12-knowledge-build", "repo_context", "code_graph_build", "t12-knowledge-batch-01", ["staging/teams/T12/assets/knowledge.json"]),
  syntheticEvidence("source-t12-knowledge-wiki", "repo_context", "repo_document_snapshot", "t12-knowledge-batch-01", ["staging/teams/T12/assets/knowledge.json"]),
  ...input.skill_sources.map((source) => externalEvidence(source, `source-material/T12/skills/${input.skill_visibility.find((item) => item.source_id === source.source_id).name}/SKILL.md`)),
];

const workspaceTemplates = input.project_streams.map((stream, index) => {
  const source = input.skill_sources[index % input.skill_sources.length];
  const slug = source.repository.replace("https://github.com/", "");
  const workspace = withHash({
    workspaceId: `workspace-task1-t12-${index + 1}`, repoSlug: slug, repoUrl: source.repository, baseCommit: source.revision,
    sourceRepoLicense: source.license, treeSha256: sha(`tree:${stream}:${source.revision}`), fileManifestSha256: sha(`manifest:${stream}:${source.path}`), state: "clean",
  });
  return { stream, source, workspace };
});
const tasks = workspaceTemplates.map(({ stream, source, workspace }, index) => withHash({
  taskId: `T12-TASK-${String(index + 1).padStart(2, "0")}`, teamId: "T12", title: stream,
  description: `Synthetic database evolution stream for ${stream}.`, goal: "Close only the frozen routing information gap and stop before implementation.",
  eligibleAgentIds: [agentId],
  projectRef: withHash({ projectRefId: `project-task1-t12-${index + 1}`, repoSlug: workspace.repoSlug, repoUrl: workspace.repoUrl, pinnedCommit: source.revision, sourceEvidenceIds: ["source-t12-current-anchor"] }),
  workspace, sourceEvidenceIds: ["source-t12-current-anchor"],
}));

const l0Conversations = memoryPairs.map((pair, index) => {
  const sessionId = index === 1 ? "T12-L0-BEACON-QUERY-PLAN-EXPERIMENT" : index === 5 ? "T12-L0-LEDGER-ROLLBACK-CONTRACT" : `T12-L0-SUPPORT-${index + 1}`;
  const messages = [
    withHash({ messageId: `${sessionId}-M01`, role: "user", content: pair.query, sourceEvidenceIds: ["source-t12-memory-redacted"], observedAt }),
    withHash({ messageId: `${sessionId}-M02`, role: "assistant", content: pair.negative.delta_message.content, sourceEvidenceIds: ["source-t12-memory-redacted"], observedAt }),
  ];
  return withHash({ assetId: sessionId, ownerAgentId: agentId, sourceEvidenceIds: ["source-t12-memory-redacted"], observedAt, sessionId, messages });
});
const l1Memories = [
  withHash({ assetId: "T12-L1-LEDGER-ZERO-DOWNTIME-ROLLOUT", ownerAgentId: agentId, sourceEvidenceIds: ["source-t12-memory-atomic"], observedAt, type: "decision", content: memoryPairs[0].negative.delta_message.content, status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[0].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T12-L1-QUARTZ-ORM-COMPATIBILITY", ownerAgentId: agentId, sourceEvidenceIds: ["source-t12-memory-atomic"], observedAt, type: "fact", content: memoryPairs[3].negative.delta_message.content, status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[3].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
];
const l2Scenes = [
  withHash({ assetId: "T12-L2-HARBOR-RESUMABLE-BACKFILL", ownerAgentId: agentId, sourceEvidenceIds: ["source-t12-memory-scene"], observedAt, path: "database/harbor/resumable-backfill", summary: "Harbor resumable backfill procedure", content: memoryPairs[2].negative.delta_message.content, injected: false, supportingSessionIds: [l0Conversations[1].sessionId, l0Conversations[2].sessionId] }),
  withHash({ assetId: "T12-L2-ARCHIVE-INDEX-LIFECYCLE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t12-memory-scene"], observedAt, path: "database/archive/index-lifecycle", summary: "Archive index retirement lifecycle", content: memoryPairs[4].negative.delta_message.content, injected: false, supportingSessionIds: [l0Conversations[4].sessionId, l0Conversations[5].sessionId] }),
];

const skills = input.skill_visibility.map((visibility) => {
  const source = input.skill_sources.find((item) => item.source_id === visibility.source_id);
  return withHash({ assetId: visibility.asset_id, ownerAgentId: agentId, sourceEvidenceIds: [`source-${source.source_id}`], observedAt,
    name: visibility.name, version: "1.0.0", description: `${visibility.use_when}; sourced from ${source.path}.`, useWhen: visibility.use_when,
    doNotUseWhen: visibility.do_not_use_when, repoCommit: source.revision, visibility: visibility.listed ? "private" : "team",
    provenanceMode: "imported_open_source", supportingSessionIds: [], codeEvidenceLocators: [], testEvidenceLocators: [], manifest: [{ path: "SKILL.md", sha256: source.source_id === "t12-skill-ghost-db" ? "688246f8709e2f0b3a4c29cc4dd3e565bb65b8dae2d5ac7348280b6638c9c930" : source.raw_sha256 }],
  });
});
const knowledge = input.knowledge_assets.map((asset, index) => withHash({
  assetId: asset.id, ownerAgentId: agentId, sourceEvidenceIds: [asset.kind === "wiki" ? "source-t12-knowledge-wiki" : "source-t12-knowledge-build"], observedAt,
  type: asset.kind === "wiki" ? "wiki" : "code_graph", name: asset.description,
  ...(asset.kind === "wiki" ? {} : { repoUrl: workspaceTemplates[index % workspaceTemplates.length].workspace.repoUrl, repoCommit: workspaceTemplates[index % workspaceTemplates.length].source.revision, indexVersion: "task1-build06-fixture-v1" }),
  snapshotSha256: sha(`knowledge:${asset.id}:${asset.description}`), bindings: [{ agentId, visibility: "fixed" }],
}));
const memoryAssets = { schema_version: "task1.formal_memory_assets.v1", team_id: "T12", l0_conversations: l0Conversations, l1_memories: l1Memories, l2_scenes: l2Scenes, l3_profiles: [] };
const skillAssets = { schema_version: "task1.formal_skill_assets.v1", team_id: "T12", skills };
const knowledgeAssets = { schema_version: "task1.formal_knowledge_assets.v1", team_id: "T12", knowledge };
const snapshotAssetIds = [...l0Conversations, ...l1Memories, ...l2Scenes, ...skills, ...knowledge].map((asset) => asset.assetId);
const visibleAssetSetSha256 = sha({ teamId: "T12", userId: "user-task1-t12-eval", agentId, assetIds: snapshotAssetIds });

const memoryRoutes = [
  { target: "T12-L1-LEDGER-ZERO-DOWNTIME-ROLLOUT", seq: ["tdai_memory_search"], first: { tool: "tdai_memory_search", endpoint: "/memory-bridge/v3/atomic/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: ["Ledger", "zero-downtime", "迁移"] } } }, follow: [] },
  { target: "T12-L0-BEACON-QUERY-PLAN-EXPERIMENT", seq: ["tdai_conversation_search"], first: { tool: "tdai_conversation_search", endpoint: "/memory-bridge/v3/conversation/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: ["Beacon", "query plan", "索引"] } } }, follow: [] },
  { target: "T12-L2-HARBOR-RESUMABLE-BACKFILL", seq: ["tdai_scenario_ls", "tdai_read_scene"], first: { tool: "tdai_scenario_ls", endpoint: "/memory-bridge/v3/scenario/ls", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id"], exactValues: { path_prefix: "database/harbor" } } }, follow: [{ tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], valueFromPreviousStep: true } }] },
  { target: "T12-L1-QUARTZ-ORM-COMPATIBILITY", seq: ["tdai_atomic_query"], first: { tool: "tdai_atomic_query", endpoint: "/memory-bridge/v3/atomic/query", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { type: "fact" } } }, follow: [] },
  { target: "T12-L2-ARCHIVE-INDEX-LIFECYCLE", seq: ["tdai_scenario_ls", "tdai_read_scene"], first: { tool: "tdai_scenario_ls", endpoint: "/memory-bridge/v3/scenario/ls", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id"], exactValues: { path_prefix: "database/archive" } } }, follow: [{ tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], valueFromPreviousStep: true } }] },
  { target: "T12-L0-LEDGER-ROLLBACK-CONTRACT", seq: ["tdai_conversation_query"], first: { tool: "tdai_conversation_query", endpoint: "/memory-bridge/v3/conversation/query", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { session_id: "T12-L0-LEDGER-ROLLBACK-CONTRACT" } } }, follow: [] },
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
  const pairId = `T12-PAIR-${String(ordinal).padStart(3, "0")}`;
  const stem = `${family.toUpperCase()}-${String(ordinal).padStart(3, "0")}`;
  const task = tasks[taskCursor++ % tasks.length];
  const evidenceRefs = family === "skill" ? [`source-${input.skill_visibility.find((item) => item.asset_id === route.target).source_id}`, "source-t12-current-anchor", "source-t12-pairs"] : family === "knowledge" ? [route.sourceId, "source-t12-current-anchor", "source-t12-pairs"] : ["source-t12-memory-redacted", "source-t12-current-anchor", "source-t12-pairs"];
  for (const role of ["positive", "negative"]) {
    const suffix = role === "positive" ? "P" : "N";
    const caseId = `T12-${stem}-${suffix}`;
    const item = withHash({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T12", userId: "user-task1-t12-eval", agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: pair.difficulty, contextMessages: insertDelta(pair, role), query: pair.query, visibleAssetSetSha256 });
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
  pairs.push(withHash({ pairId, positiveCaseId: `T12-${stem}-P`, negativeCaseId: `T12-${stem}-N`, counterfactualKind: "answer_in_current_context", controlledDeltaSha256: controlledDeltaSha256(pair), currentEvidenceRefs: ["source-t12-current-anchor", "source-t12-pairs"] }));
}

memoryPairs.forEach((pair, index) => addPair(pair, "memory", index + 1, { ...memoryRoutes[index], stopAfter: memoryRoutes[index].seq.at(-1) === "tdai_read_scene" ? `tdai_read_scene returns ${memoryRoutes[index].target}.` : `${memoryRoutes[index].seq.at(-1)} returns ${memoryRoutes[index].target}.` }));
skillPairs.forEach((pair, index) => {
  const target = pair.positive.private_proposal.target_asset_ids[0];
  const searchable = pair.positive.private_proposal.allowed_sequence_candidates[0][0] === "skill_search";
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
    target, sourceId: asset.kind === "wiki" ? "source-t12-knowledge-wiki" : "source-t12-knowledge-build", seq: ["knowledge_tools_list", "knowledge_tools_call"],
    first: { tool: "knowledge_tools_list", endpoint: "/tools/list", argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } }, follow: [],
    knowledgeCalls: [{ toolName: asset.tool_name, paramRules: { requiredFields: ["query"] } }], stopAfter: `knowledge_tools_call ${asset.tool_name} returns the requested frozen evidence from ${target}.`,
  });
});
naturalCases.forEach((draft, index) => {
  const task = tasks[taskCursor++ % tasks.length];
  const caseId = `T12-NATURAL-${String(index + 1).padStart(3, "0")}-N`;
  publicCases.push(withHash({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T12", userId: "user-task1-t12-eval", agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: draft.difficulty, contextMessages: draft.context_messages, query: draft.query, visibleAssetSetSha256 }));
  const evidenceRefs = ["source-t12-current-anchor", "source-t12-natural"];
  privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: evidenceRefs, gold: withHash({ needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs, ablationEvidence: "Not applicable: this natural coding task is intentionally self-contained.", noToolEvidence: draft.why_current_context_is_sufficient }), annotationReason: draft.why_current_context_is_sufficient }));
});

const teams = [withHash({ teamId: "T12", worldId: "world-task1-engineering", split: "dev", name: "数据库演进", businessAgentIds: [agentId], taskIds: tasks.map((task) => task.taskId), sourceEvidenceIds: ["source-t12-current-anchor"] })];
const detail = withHash({ description: "Maintains schema migrations, online changes, query plans, backfills, and compatibility work in T12.", prompt: "Use only the current Team's frozen assets and stop when the case-specific information gap is closed." });
const businessAgents = [withHash({ agentId, teamId: "T12", name: "T12 通用业务 Agent", agentDetail: detail, importedMemoryAgentIds: [], boundSkillIds: skills.filter((skill) => skill.visibility === "private").map((skill) => skill.assetId), fixedKnowledgeIds: knowledge.map((asset) => asset.assetId), sourceEvidenceIds: ["source-t12-current-anchor"] })];
const fragment = {
  schema_version: "task1.team_fragment.v1", build_id: "build-06", team_id: "T12", split: "dev", sourceEvidence, teams, businessAgents, tasks, publicCases, privateAnnotations, pairs,
  snapshotAssetIds, generatorBatchRefs: ["T12/memory/memory-batch-01", "T12/memory/memory-batch-02", "T12/skill/skill-search-batch-02", "T12/skill/skill-direct-batch-03", "T12/knowledge/knowledge-batch-01", "T12/natural-negative/natural-negative-batch-01"],
  externalImports: input.skill_sources.map((source) => ({ sourceId: `source-${source.source_id}`, repository: source.repository, revision: source.revision, path: source.path, license: source.license, rawFileSha256: source.raw_sha256, storedFileSha256: source.source_id === "t12-skill-ghost-db" ? "688246f8709e2f0b3a4c29cc4dd3e565bb65b8dae2d5ac7348280b6638c9c930" : source.raw_sha256, storedPath: `source-material/T12/skills/${input.skill_visibility.find((item) => item.source_id === source.source_id).name}/SKILL.md`, licenseFileSha256: source.license_sha256, storedLicensePath: "source-material/T12/skills/licenses/pg-aiguide-LICENSE" })),
};

await mkdir(assetsDir, { recursive: true });
await writeFile(path.join(staging, "team-fragment.json"), JSON.stringify(fragment, null, 2) + "\n");
await writeFile(path.join(assetsDir, "memory.json"), JSON.stringify(memoryAssets, null, 2) + "\n");
await writeFile(path.join(assetsDir, "skills.json"), JSON.stringify(skillAssets, null, 2) + "\n");
await writeFile(path.join(assetsDir, "knowledge.json"), JSON.stringify(knowledgeAssets, null, 2) + "\n");
await writeFile(path.join(staging, "review.md"), `# T12 Sol review\n\nReviewed all Luna drafts against production routing contracts. Final counts: 6 Memory positives, 6 Skill positives, 3 Knowledge positives, 15 paired no-tool negatives, and 10 natural coding negatives. Memory scene-discovery candidates were corrected to include read_scene. The first Skill draft was rejected because it mixed listed and searchable visibility for the same assets; the accepted replacement uses postgres-table-design only through search and the listed migration/Ghost assets only through direct view. External Skill workflows remain pinned to the three input-pack files.\n`);
console.log(JSON.stringify({ team: "T12", cases: publicCases.length, pairs: pairs.length, positives: privateAnnotations.filter((item) => item.gold.needTdaiTool).length, assets: snapshotAssetIds.length }, null, 2));
