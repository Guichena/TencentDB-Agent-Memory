import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEAM = "T15";
const F = (...parts) => path.join(ROOT, ...parts);
const STAGE = F("MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "staging", "teams", TEAM);
const SOURCE = F("MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "source-material", TEAM);
const fragment = JSON.parse(readFileSync(path.join(STAGE, "team-fragment.json"), "utf8"));
const memory = JSON.parse(readFileSync(path.join(STAGE, "assets", "memory.json"), "utf8"));
const skillsFile = JSON.parse(readFileSync(path.join(STAGE, "assets", "skills.json"), "utf8"));
const knowledgeFile = JSON.parse(readFileSync(path.join(STAGE, "assets", "knowledge.json"), "utf8"));
const matrix = JSON.parse(readFileSync(path.join(STAGE, "review-matrix.json"), "utf8"));
const gate = JSON.parse(readFileSync(path.join(STAGE, "gate.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(SOURCE, "skill-sources.json"), "utf8"));
const errors = [];

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
const sha = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : canonicalJson(value)).digest("hex");
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const check = (condition, message) => { if (!condition) errors.push(message); };

function walkHashes(value, label = "root") {
  if (Array.isArray(value)) return value.forEach((item, index) => walkHashes(item, `${label}[${index}]`));
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value, "contentHash")) {
    const { contentHash, ...core } = value;
    check(/^[a-f0-9]{64}$/.test(contentHash), `${label}.contentHash is not sha256`);
    check(contentHash === sha(core), `${label}.contentHash mismatch`);
  }
  for (const [key, child] of Object.entries(value)) walkHashes(child, `${label}.${key}`);
}

walkHashes(fragment.sourceEvidence, "sourceEvidence");
walkHashes(fragment.teams, "teams");
walkHashes(fragment.businessAgents, "businessAgents");
walkHashes(fragment.tasks, "tasks");
walkHashes(fragment.publicCases, "publicCases");
walkHashes(fragment.privateAnnotations, "privateAnnotations");
walkHashes(fragment.pairs, "pairs");
walkHashes(memory, "memory");
walkHashes(skillsFile, "skills");
walkHashes(knowledgeFile, "knowledge");

check(fragment.schema_version === "task1.team_fragment.v1", "fragment schema mismatch");
check(fragment.build_id === "build-08" && fragment.team_id === TEAM && fragment.split === "hidden_test", "fragment identity mismatch");
check(fragment.publicCases.length === 40, "public case count must be 40");
check(fragment.privateAnnotations.length === 40, "annotation count must be 40");
check(fragment.pairs.length === 15, "pair count must be 15");
check(new Set(fragment.publicCases.map((item) => item.caseId)).size === 40, "case ids must be unique");
check(new Set(fragment.pairs.map((item) => item.pairId)).size === 15, "pair ids must be unique");
check(fragment.generatorBatchRefs.length === 7, "must reference seven Luna batches");
for (const batch of fragment.generatorBatchRefs) {
  check(batch.generatorModel === "gpt-5.6-luna", `${batch.batchId} model mismatch`);
  check(batch.reasoningEffort === "high", `${batch.batchId} effort mismatch`);
  check(batch.validatorPassed === true, `${batch.batchId} validator not passed`);
  check(/^[a-f0-9]{64}$/.test(batch.draftSha256), `${batch.batchId} draft hash invalid`);
}

const allAssets = [...memory.l0Conversations, ...memory.l1Memories, ...memory.l2Scenes, ...memory.l3Profiles, ...skillsFile.skills, ...knowledgeFile.knowledge];
const assetById = new Map(allAssets.map((item) => [item.assetId, item]));
check(assetById.size === allAssets.length, "asset ids must be unique");
check(memory.l0Conversations.length === 12, "L0 count must be 12");
check(memory.l1Memories.length === 16, "L1 count must be 16");
check(memory.l2Scenes.length === 5, "L2 count must be 5");
check(memory.l3Profiles.length === 1, "L3 count must be 1");
check(skillsFile.skills.length === 18, "Skill count must be 18");
check(knowledgeFile.knowledge.length === 3, "Knowledge count must be 3");
check(fragment.snapshotAssetIds.length === allAssets.length && fragment.snapshotAssetIds.every((id) => assetById.has(id)), "snapshot asset ids mismatch");

const messageIds = new Set();
for (const session of memory.l0Conversations) {
  check(session.messages.length >= 12 && session.messages.length <= 24, `${session.assetId} message count outside 12-24`);
  for (const message of session.messages) {
    check(!messageIds.has(message.messageId), `duplicate message ${message.messageId}`);
    messageIds.add(message.messageId);
  }
}
for (const item of memory.l1Memories) {
  check(item.supportingMessageIds.length > 0, `${item.assetId} lacks supporting messages`);
  item.supportingMessageIds.forEach((id) => check(messageIds.has(id), `${item.assetId} unknown message ${id}`));
}
const sessionIds = new Set(memory.l0Conversations.map((item) => item.sessionId));
for (const scene of memory.l2Scenes) {
  check(scene.supportingSessionIds.length >= 2, `${scene.assetId} needs two sessions`);
  check(Boolean(scene.content?.trim()), `${scene.assetId} lacks content`);
  scene.supportingSessionIds.forEach((id) => check(sessionIds.has(id), `${scene.assetId} unknown session ${id}`));
}
const l3Length = [...memory.l3Profiles[0].content].length;
check(l3Length >= 80 && l3Length <= 220, `L3 length ${l3Length} outside 80-220`);

const sourceById = new Map(fragment.sourceEvidence.map((item) => [item.sourceId, item]));
check(sourceById.size === fragment.sourceEvidence.length, "source ids must be unique");
for (const asset of allAssets) asset.sourceEvidenceIds.forEach((id) => check(sourceById.has(id), `${asset.assetId} unknown source ${id}`));
for (const source of fragment.sourceEvidence.filter((item) => item.provenanceKind === "external_import")) {
  check(source.sourceRepoCommit === lock.repository.commit, `${source.sourceId} commit mismatch`);
  check(source.sourceRepoLicense === "MIT", `${source.sourceId} license mismatch`);
  check(source.sourceTaskTime === lock.repository.commit_author_time, `${source.sourceId} source time mismatch`);
}
check(fragment.externalImports.length === 19, "external import count must be 19");
const rawRoot = path.join(SOURCE, "raw", "github-awesome-copilot");
for (const item of lock.files) {
  const file = path.join(rawRoot, ...item.path.replace(/^skills\//, "").split("/"));
  check(sha(readFileSync(file)) === item.sha256, `raw source hash mismatch ${item.source_id}`);
}

const active = fragment.businessAgents.find((item) => item.agentId === "agent-task1-t15-general");
check(active.importedMemoryAgentIds.length === 2, "active Agent must import two memory Agents");
check(active.boundSkillIds.length === 6, "active listing must have six bound Skills");
check(active.fixedKnowledgeIds.length === 3, "active Agent must have three fixed Knowledge resources");
for (const asset of allAssets) {
  if (asset.assetId.startsWith("T15-L")) check(asset.ownerAgentId === active.agentId || active.importedMemoryAgentIds.includes(asset.ownerAgentId), `${asset.assetId} memory not visible`);
  if (asset.assetId.startsWith("T15-SKL")) check(asset.ownerAgentId === active.agentId || asset.visibility === "team", `${asset.assetId} Skill not visible`);
  if (asset.assetId.startsWith("T15-KNW")) check(asset.bindings.some((binding) => binding.agentId === active.agentId), `${asset.assetId} Knowledge not fixed`);
}

const annotationById = new Map(fragment.privateAnnotations.map((item) => [item.caseId, item]));
const caseById = new Map(fragment.publicCases.map((item) => [item.caseId, item]));
const pairById = new Map(fragment.pairs.map((item) => [item.pairId, item]));
const forbiddenProvider = [
  /\bTDAI\b/i, /\bknowledge_id\b/i, /\btools\/(?:list|call)\b/i,
  /\btdai_[a-z_]+\b/i, /\bskill_(?:search|view|view_by_id|files_read)\b/i, /\bknowledge_tools_(?:list|call)\b/i,
  /\/memory-bridge\//i, /\/skill-bridge\//i, /\/tools\/(?:list|call)/i,
  /\bT15-(?:L[0-3]|SKL|KNW|EXT)-[A-Z0-9-]+\b/i, /\bGold\b/i, /allowedSequences|targetAssetIds|informationGap/i,
];
for (const item of fragment.publicCases) {
  check(annotationById.has(item.caseId), `${item.caseId} lacks annotation`);
  const providerText = [...item.contextMessages.map((message) => message.content), item.query].join("\n");
  forbiddenProvider.forEach((pattern) => check(!pattern.test(providerText), `${item.caseId} provider leakage ${pattern}`));
}

for (const pair of fragment.pairs) {
  const positive = caseById.get(pair.positiveCaseId);
  const negative = caseById.get(pair.negativeCaseId);
  const pa = annotationById.get(pair.positiveCaseId);
  const na = annotationById.get(pair.negativeCaseId);
  check(pa.pairId === pair.pairId && pa.pairRole === "positive", `${pair.pairId} positive annotation mismatch`);
  check(na.pairId === pair.pairId && na.pairRole === "negative", `${pair.pairId} negative annotation mismatch`);
  check(pa.gold.needTdaiTool === true && na.gold.needTdaiTool === false, `${pair.pairId} tool labels mismatch`);
  check(same(positive.identity, negative.identity), `${pair.pairId} identity differs`);
  check(same(positive.workspace, negative.workspace), `${pair.pairId} workspace differs`);
  check(positive.snapshotId === negative.snapshotId && positive.query === negative.query && positive.language === negative.language, `${pair.pairId} fixed fields differ`);
  check(positive.contextMessages.length === negative.contextMessages.length, `${pair.pairId} context lengths differ`);
  check(same(positive.contextMessages.slice(0, -1), negative.contextMessages.slice(0, -1)), `${pair.pairId} differs before delta`);
  check(!same(positive.contextMessages.at(-1), negative.contextMessages.at(-1)), `${pair.pairId} delta must differ`);
  const expectedDeltaHash = createHash("sha256").update(JSON.stringify({ positive_delta_message: positive.contextMessages.at(-1), negative_delta_message: negative.contextMessages.at(-1), query: positive.query }), "utf8").digest("hex");
  check(pair.controlledDeltaSha256 === expectedDeltaHash, `${pair.pairId} controlled delta hash mismatch`);
  check(pa.gold.allowedSequences.length === 1, `${pair.pairId} must have one minimal chain`);
  check(pa.gold.maxTdaiCalls === pa.gold.allowedSequences[0].length, `${pair.pairId} max calls mismatch`);
  check(pa.gold.allowedFirstActions[0].tool === pa.gold.allowedSequences[0][0], `${pair.pairId} first action mismatch`);
  pa.gold.targetAssetIds.forEach((id) => check(assetById.has(id), `${pair.pairId} unknown target ${id}`));
  check(Boolean(na.gold.noToolEvidence) && na.gold.maxTdaiCalls === 0, `${pair.pairId} no-tool Gold incomplete`);
}

for (const item of fragment.publicCases.filter((entry) => entry.caseId.includes("-COD-"))) {
  const gold = annotationById.get(item.caseId).gold;
  check(gold.needTdaiTool === false && gold.maxTdaiCalls === 0 && Boolean(gold.noToolEvidence), `${item.caseId} natural negative Gold invalid`);
}

const positives = fragment.privateAnnotations.filter((item) => item.gold.needTdaiTool);
const familyCounts = Object.groupBy(positives, (item) => item.gold.family);
check((familyCounts.memory ?? []).length === 6, "Memory positive count must be 6");
check((familyCounts.skill ?? []).length === 6, "Skill positive count must be 6");
check((familyCounts.knowledge ?? []).length === 3, "Knowledge positive count must be 3");
const firstTools = positives.map((item) => item.gold.allowedFirstActions[0].tool);
check(firstTools.filter((tool) => ["tdai_memory_search", "tdai_conversation_search", "skill_search", "knowledge_tools_list"].includes(tool)).length === 10, "discovery count must be 10");
check(firstTools.filter((tool) => ["tdai_atomic_query", "tdai_read_scene", "skill_view"].includes(tool)).length === 5, "direct count must be 5");
check(firstTools.filter((tool) => ["tdai_memory_search", "tdai_conversation_search"].includes(tool)).length === 4, "Memory search count must be 4");
check(firstTools.filter((tool) => tool === "skill_search").length === 3, "Skill search count must be 3");
check(firstTools.filter((tool) => tool === "knowledge_tools_list").length === 3, "Knowledge discovery count must be 3");

for (const row of matrix.rows) {
  check(row.solReviewed === true, `${row.pairId ?? row.caseId} lacks Sol review`);
  check(row.distractorIds.length >= (row.family === "none" ? 3 : 2), `${row.pairId ?? row.caseId} lacks distractors`);
  row.distractorIds.forEach((id) => check(assetById.has(id), `${row.pairId ?? row.caseId} unknown distractor ${id}`));
  if (row.pairId) check(pairById.has(row.pairId), `${row.pairId} missing pair`);
}

for (const item of positives.filter((entry) => entry.gold.family === "knowledge")) {
  check(item.gold.allowedSequences[0].join("/") === "knowledge_tools_list/knowledge_tools_call", `${item.caseId} Knowledge sequence mismatch`);
  check(item.gold.expectedKnowledgeCalls?.length === 1 && item.gold.expectedKnowledgeCalls[0].toolName === "search", `${item.caseId} Knowledge call mismatch`);
}
for (const item of positives.filter((entry) => entry.gold.allowedSequences[0].includes("skill_files_read"))) {
  check(item.gold.expectedFollowupActions?.[0]?.argumentRules?.exactValues?.path === "references/versioning-strategy.md", `${item.caseId} resource path mismatch`);
}

check(gate.status === "passed", "gate status must be passed");
check(gate.counts.total === 40 && gate.counts.pairs === 15, "gate counts mismatch");
check(Object.values(gate.solChecks).every((value) => value === "passed"), "one or more Sol checks not passed");

const result = {
  schema_version: "task1.team_gate_validation.v1",
  valid: errors.length === 0,
  team_id: TEAM,
  case_count: fragment.publicCases.length,
  pair_count: fragment.pairs.length,
  discovery_positive_count: gate.discoveryPositiveCount,
  direct_positive_count: gate.directPositiveCount,
  asset_count: allAssets.length,
  external_import_count: fragment.externalImports.length,
  error_count: errors.length,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
