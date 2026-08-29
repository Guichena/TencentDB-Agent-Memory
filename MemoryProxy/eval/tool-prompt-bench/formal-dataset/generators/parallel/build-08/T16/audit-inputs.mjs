import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GEN = path.join(ROOT, "MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "generators", "parallel", "build-08", "T16");
const SOURCE = path.join(ROOT, "MemoryProxy", "eval", "tool-prompt-bench", "formal-dataset", "source-material", "T16");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

const input = readJson(path.join(GEN, "input-pack.json"));
const lock = readJson(path.join(SOURCE, "skill-sources.json"));
const specs = [
  ["trials/memory-trial-01", "memory", 1],
  ["trials/skill-trial-01", "skill", 1],
  ["trials/knowledge-trial-01", "knowledge", 1],
  ["batches/memory-expansion-01", "memory", 5],
  ["batches/skill-expansion-01", "skill", 5],
  ["batches/knowledge-expansion-01", "knowledge", 2],
  ["batches/natural-negative-01", "natural-negative", 10],
];

const loaded = specs.map(([relative, family, count]) => {
  const dir = path.join(GEN, ...relative.split("/"));
  const draft = readJson(path.join(dir, "draft.json"));
  const manifest = readJson(path.join(dir, "manifest.json"));
  check(manifest.generator_model === "gpt-5.6-luna", `${relative} model mismatch`);
  check(manifest.reasoning_effort === "high", `${relative} reasoning mismatch`);
  check(manifest.prompt_version === "task1.luna-batch.v1", `${relative} prompt mismatch`);
  check(manifest.actual_count === count, `${relative} manifest count mismatch`);
  check((family === "natural-negative" ? draft.cases : draft.pairs).length === count, `${relative} draft count mismatch`);
  return { relative, family, count, draft, manifest };
});
check(new Set(loaded.map((item) => item.manifest.batch_id)).size === 7, "batch ids must be unique");

const pairDrafts = loaded.filter((item) => item.family !== "natural-negative").flatMap((item) => item.draft.pairs);
const providerForbidden = [
  /\bTDAI\b/i, /\btdai_[a-z_]+\b/i, /\bskill_(?:search|view|view_by_id|files_read)\b/i,
  /\bknowledge_id\b/i, /\btools\/(?:list|call)\b/i, /allowedSequences|targetAssetIds|informationGap|\bGold\b/i,
  /\bT16-(?:L[0-3]|SKL|KNW|EXT)-[A-Z0-9-]+\b/i,
];
for (const pair of pairDrafts) {
  check(pair.changed_message_index === pair.shared_context_messages.length, `${pair.draft_pair_id} changed index mismatch`);
  check(pair.visible_distractor_ids_author_only.length >= 3, `${pair.draft_pair_id} lacks distractors`);
  check(pair.positive.private_proposal.allowed_sequence_candidates.length === 1, `${pair.draft_pair_id} must have one sequence`);
  check(pair.positive.private_proposal.target_asset_ids.length === 1, `${pair.draft_pair_id} must have one target`);
  check(Boolean(pair.positive.private_proposal.unique_information_gap), `${pair.draft_pair_id} lacks information gap`);
  check(Boolean(pair.negative.private_proposal.why_current_context_is_sufficient), `${pair.draft_pair_id} lacks no-tool evidence`);
  const text = [...pair.shared_context_messages, pair.positive.delta_message, { content: pair.query }].map((item) => item.content).join("\n");
  providerForbidden.forEach((pattern) => check(!pattern.test(text), `${pair.draft_pair_id} provider leak ${pattern}`));
}

const memoryDrafts = pairDrafts.filter((item) => item.positive.private_proposal.route === "memory");
const skillDrafts = pairDrafts.filter((item) => item.positive.private_proposal.route === "skill");
const knowledgeDrafts = pairDrafts.filter((item) => item.positive.private_proposal.route === "knowledge");
const routeKey = (pair) => pair.positive.private_proposal.allowed_sequence_candidates[0].join("/");
const countRoute = (pairs, route) => pairs.filter((pair) => routeKey(pair) === route).length;
check(memoryDrafts.length === 6, "memory pair count mismatch");
check(countRoute(memoryDrafts, "tdai_memory_search") === 2, "memory_search count mismatch");
check(countRoute(memoryDrafts, "tdai_conversation_search") === 2, "conversation_search count mismatch");
check(countRoute(memoryDrafts, "tdai_atomic_query") === 1, "atomic_query count mismatch");
check(countRoute(memoryDrafts, "tdai_read_scene") === 1, "read_scene count mismatch");
check(skillDrafts.length === 6, "skill pair count mismatch");
check(countRoute(skillDrafts, "skill_search/skill_view_by_id") === 3, "skill search count mismatch");
check(countRoute(skillDrafts, "skill_view") === 2, "skill direct count mismatch");
check(countRoute(skillDrafts, "skill_view/skill_files_read") === 1, "skill resource count mismatch");
check(knowledgeDrafts.length === 3 && knowledgeDrafts.every((pair) => routeKey(pair) === "knowledge_tools_list/knowledge_tools_call"), "knowledge routes mismatch");

const memoryCandidates = readJson(path.join(GEN, "batches", "memory-expansion-01", "asset-candidates.json")).candidates;
const memoryById = new Map(memoryCandidates.map((item) => [item.asset_id, item]));
const l0 = memoryCandidates.filter((item) => item.asset_type === "l0_session");
const l1 = memoryCandidates.filter((item) => item.asset_type === "l1_memory");
const l2 = memoryCandidates.filter((item) => item.asset_type === "l2_scene");
const l3 = memoryCandidates.filter((item) => item.asset_type === "l3_profile");
check(l0.length === 12 && l1.length === 16 && l2.length === 5 && l3.length === 1, "memory asset counts mismatch");
const messageIds = new Set();
for (const session of l0) {
  check(session.messages.length >= 12 && session.messages.length <= 24, `${session.asset_id} message count invalid`);
  for (const message of session.messages) {
    check(!messageIds.has(message.message_id), `duplicate message ${message.message_id}`);
    messageIds.add(message.message_id);
  }
}
for (const item of l1) {
  check(item.supporting_message_ids.length > 0, `${item.asset_id} lacks supporting messages`);
  item.supporting_message_ids.forEach((id) => check(messageIds.has(id), `${item.asset_id} unknown message ${id}`));
}
const expectedScenes = new Map(input.memory_plan.l2.map((item) => [item.asset_id, item.path]));
for (const scene of l2) {
  check(scene.path === expectedScenes.get(scene.asset_id), `${scene.asset_id} path mismatch`);
  check(scene.injected === true && Boolean(scene.content) && Boolean(scene.summary), `${scene.asset_id} content mismatch`);
  check(scene.supporting_memory_ids.length >= 2 && scene.supporting_session_ids.length >= 2, `${scene.asset_id} support count mismatch`);
  scene.supporting_memory_ids.forEach((id) => check(memoryById.get(id)?.asset_type === "l1_memory", `${scene.asset_id} unknown L1 ${id}`));
  scene.supporting_session_ids.forEach((id) => check(memoryById.get(id)?.asset_type === "l0_session", `${scene.asset_id} unknown L0 ${id}`));
}
check([...l3[0].summary].length >= 80 && [...l3[0].summary].length <= 220, "L3 length mismatch");
for (const pair of memoryDrafts) {
  const target = memoryById.get(pair.positive.private_proposal.target_asset_ids[0]);
  const first = pair.positive.private_proposal.allowed_sequence_candidates[0][0];
  if (first === "tdai_memory_search" || first === "tdai_atomic_query") check(target?.asset_type === "l1_memory", `${pair.draft_pair_id} target type mismatch`);
  if (first === "tdai_conversation_search") check(target?.asset_type === "l0_session", `${pair.draft_pair_id} target type mismatch`);
  if (first === "tdai_read_scene") check(target?.asset_type === "l2_scene", `${pair.draft_pair_id} target type mismatch`);
}

const skillCandidates = readJson(path.join(GEN, "batches", "skill-expansion-01", "asset-candidates.json")).candidates;
const expectedSkills = [
  ["cloud-design-patterns", "T16-EXT-SKL-001"], ["python-azure-iot-edge-modules", "T16-EXT-SKL-002"],
  ["aws-cloudwatch-investigation", "T16-EXT-SKL-003"], ["incident-postmortem", "T16-EXT-SKL-004"],
  ["bug-reproduction-brief", "T16-EXT-SKL-005"], ["create-github-action-workflow-specification", "T16-EXT-SKL-006"],
  ["saga-orchestration", "T16-EXT-SKL-013"], ["cqrs-implementation", "T16-EXT-SKL-014"],
  ["projection-patterns", "T16-EXT-SKL-015"], ["microservices-patterns", "T16-EXT-SKL-016"],
  ["workflow-orchestration-patterns", "T16-EXT-SKL-017"], ["qdrant-monitoring", "T16-EXT-SKL-007"],
  ["mvvm-toolkit-messenger", "T16-EXT-SKL-008"], ["aspire", "T16-EXT-SKL-009"],
  ["bug-receipt", "T16-EXT-SKL-010"], ["project-workflow-analysis-blueprint-generator", "T16-EXT-SKL-011"],
  ["build-evidence-map", "T16-EXT-SKL-012"],
];
check(skillCandidates.length === 17, "skill count mismatch");
expectedSkills.forEach(([name, sourceId], index) => {
  const id = `T16-SKL-${String(index + 1).padStart(3, "0")}`;
  const item = skillCandidates.find((candidate) => candidate.candidate_id === id);
  check(item?.name === name && item?.source_id === sourceId, `${id} mapping mismatch`);
  check(item?.visibility === (index < 6 ? "listed" : "same-team-search"), `${id} visibility mismatch`);
});

const repositoryByKey = new Map(lock.repositories.map((item) => [item.key, item]));
check(lock.repositories.length === 2 && lock.files.length === 18, "source lock counts mismatch");
for (const repository of lock.repositories) {
  check(repository.license === "MIT", `${repository.key} license mismatch`);
  check(sha(readFileSync(path.join(SOURCE, "raw", repository.key, "LICENSE"))) === repository.license_sha256, `${repository.key} license hash mismatch`);
}
for (const item of lock.files) {
  check(repositoryByKey.has(item.repository_key), `${item.source_id} repository missing`);
  check(sha(readFileSync(path.join(SOURCE, "raw", item.repository_key, ...item.copied_path.split("/")))) === item.sha256, `${item.source_id} raw hash mismatch`);
}

const knowledgeTrial = readJson(path.join(GEN, "trials", "knowledge-trial-01", "asset-candidates.json")).candidates;
const knowledgeExpansion = readJson(path.join(GEN, "batches", "knowledge-expansion-01", "asset-candidates.json")).candidates;
const knowledgeById = new Map(knowledgeExpansion.map((item) => [item.asset_id, item]));
knowledgeById.set("T16-KNW-002", knowledgeTrial.find((item) => item.asset_id === "T16-KNW-002"));
check(knowledgeById.size === 3, "knowledge count mismatch");
for (const pair of knowledgeDrafts) {
  const target = knowledgeById.get(pair.positive.private_proposal.target_asset_ids[0]);
  check(target?.minimal_synthetic_query_result?.successful_query?.tool_name === "search", `${pair.draft_pair_id} search tool mismatch`);
  check(target?.minimal_synthetic_query_result?.successful_query?.result?.rule_text === pair.negative.delta_message.content, `${pair.draft_pair_id} direct result mismatch`);
}

const natural = loaded.find((item) => item.family === "natural-negative").draft.cases;
check(natural.length === 10 && natural.every((item) => item.visible_distractor_ids_author_only.length >= 3), "natural negative shape mismatch");
const streamCounts = Object.fromEntries(input.project_streams.map((stream) => {
  const marker = stream.name.split(" ")[0];
  return [stream.name, natural.filter((item) => JSON.stringify(item).includes(marker)).length];
}));
Object.entries(streamCounts).forEach(([name, count]) => check(count === 2, `${name} natural count ${count}`));
for (const item of natural) {
  const text = [...item.context_messages, { content: item.query }].map((message) => message.content).join("\n");
  providerForbidden.forEach((pattern) => check(!pattern.test(text), `${item.draft_case_id} provider leak ${pattern}`));
}

console.log(JSON.stringify({
  schema_version: "task1.t16_input_audit.v1",
  valid: errors.length === 0,
  luna_batches: loaded.length,
  pair_count: pairDrafts.length,
  natural_negative_count: natural.length,
  source_repositories: lock.repositories.length,
  external_files: lock.files.length,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
