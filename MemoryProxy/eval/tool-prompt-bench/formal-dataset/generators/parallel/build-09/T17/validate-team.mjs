import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = process.cwd();
const stagingRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T17");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const canonicalSha256 = (value) => sha256(Buffer.from(canonical(value), "utf8"));
const normalize = (value) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const ngrams = (value, width = 12) => {
  const tokens = normalize(value).match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const result = new Set();
  for (let index = 0; index + width <= tokens.length; index += 1) result.add(tokens.slice(index, index + width).join(" "));
  return result;
};
const jaccard = (left, right) => {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common += 1;
  return common / (left.size + right.size - common);
};
const duplicates = (values) => {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated];
};

const errors = [];
const checks = [];
const check = (condition, label) => {
  checks.push({ label, passed: Boolean(condition) });
  if (!condition) errors.push(label);
};

const fragment = await readJson(resolve(stagingRoot, "team-fragment.json"));
const memory = await readJson(resolve(stagingRoot, "assets/memory.json"));
const skills = await readJson(resolve(stagingRoot, "assets/skills.json"));
const knowledge = await readJson(resolve(stagingRoot, "assets/knowledge.json"));
await readFile(resolve(stagingRoot, "review.md"), "utf8");

check(fragment.team_id === "T17" && fragment.dataset_revision === "formal-v2", "fragment identifies T17 formal-v2");
check(fragment.teams.length === 1 && fragment.teams[0].split === "dev", "T17 team split is dev");
check(fragment.publicCases.length === 40, "case count is exactly 40");
check(fragment.privateAnnotations.length === 40, "annotation count is exactly 40");
check(fragment.pairs.length === 15, "pair count is exactly 15");

const annotations = new Map(fragment.privateAnnotations.map((item) => [item.caseId, item]));
const cases = new Map(fragment.publicCases.map((item) => [item.caseId, item]));
const positives = fragment.privateAnnotations.filter((item) => item.gold.needTdaiTool);
const countFamily = (family) => positives.filter((item) => item.gold.family === family).length;
check(countFamily("memory") === 6, "Memory Positive count is 6");
check(countFamily("skill") === 6, "Skill Positive count is 6");
check(countFamily("knowledge") === 3, "Knowledge Positive count is 3");
check(fragment.privateAnnotations.filter((item) => item.pairRole === "negative").length === 15, "paired No-tool Negative count is 15");
check(fragment.privateAnnotations.filter((item) => !item.pairId).length === 10, "natural coding Negative count is 10");
const discoveryTools = new Set(["tdai_memory_search", "tdai_conversation_search", "tdai_scenario_ls", "skill_search", "knowledge_tools_list"]);
const discovery = positives.filter((item) => item.gold.allowedFirstActions.some((entry) => discoveryTools.has(entry.tool))).length;
check(discovery === 10 && positives.length - discovery === 5, "Gold route distribution is 10 discovery / 5 direct");

const ids = [
  ...fragment.publicCases.map((item) => item.caseId),
  ...fragment.pairs.map((item) => item.pairId),
  ...fragment.sourceEvidence.map((item) => item.sourceId),
  ...memory.l0Conversations.map((item) => item.assetId),
  ...memory.l1Memories.map((item) => item.assetId),
  ...memory.l2Scenes.map((item) => item.assetId),
  ...memory.l3Profiles.map((item) => item.assetId),
  ...skills.skills.map((item) => item.assetId),
  ...knowledge.knowledge.map((item) => item.assetId),
];
check(duplicates(ids).length === 0, "case, pair, source, and asset ids are globally unique in T17");
check(ids.every((id) => id.toLowerCase().includes("t17")), "all case, pair, source, and asset ids carry the T17 namespace");
const batchIds = fragment.generatorBatchRefs.map((item) => item.batchId);
check(duplicates(batchIds).length === 0 && batchIds.every((id) => id.toLowerCase().includes("t17")), "accepted batch ids are unique and T17-namespaced");

check(memory.l0Conversations.length === 10, "L0 session count is 10");
check(memory.l0Conversations.every((item) => item.messages.length >= 12 && item.messages.length <= 20), "every L0 session has 12-20 messages");
check(memory.l1Memories.length === 16, "L1 memory count is 16");
check(memory.l2Scenes.length === 5 && memory.l2Scenes.every((item) => item.injected && item.supportingSessionIds.length >= 2), "L2 scene count is 5 with injected indexes and multi-session support");
check(memory.l3Profiles.length === 1, "L3 profile count is 1");
check(skills.skills.length >= 16, "Skill count is at least 16");
const activeAgentId = fragment.teams[0].businessAgentIds[0];
const activeAgent = fragment.businessAgents.find((item) => item.agentId === activeAgentId);
check(activeAgent.boundSkillIds.length === 6, "listed Skill count is 6");
check(skills.skills.filter((item) => item.visibility === "team").length === 10, "same-Team searchable Skill count is 10");
check(knowledge.knowledge.length === 3 && activeAgent.fixedKnowledgeIds.length === 3, "Knowledge resource and fixed binding counts are 3");
check(knowledge.knowledge.every((item) => item.type === "wiki" && !item.repoUrl && !item.repoCommit), "synthetic Knowledge uses wiki assets without fabricated repository provenance");

for (const pair of fragment.pairs) {
  const positive = cases.get(pair.positiveCaseId);
  const negative = cases.get(pair.negativeCaseId);
  check(Boolean(positive && negative), `${pair.pairId} references two public cases`);
  if (!positive || !negative) continue;
  const { sessionId: positiveSession, ...positiveIdentity } = positive.identity;
  const { sessionId: negativeSession, ...negativeIdentity } = negative.identity;
  void positiveSession;
  void negativeSession;
  check(canonicalSha256({ identity: positiveIdentity, snapshotId: positive.snapshotId, workspace: positive.workspace, language: positive.language, difficulty: positive.difficulty, query: positive.query, visibleAssetSetSha256: positive.visibleAssetSetSha256 })
    === canonicalSha256({ identity: negativeIdentity, snapshotId: negative.snapshotId, workspace: negative.workspace, language: negative.language, difficulty: negative.difficulty, query: negative.query, visibleAssetSetSha256: negative.visibleAssetSetSha256 }), `${pair.pairId} frozen fields and query are identical`);
  const changed = positive.contextMessages.flatMap((message, index) => canonicalSha256(message) === canonicalSha256(negative.contextMessages[index]) ? [] : [index]);
  check(positive.contextMessages.length === negative.contextMessages.length && changed.length === 1, `${pair.pairId} changes exactly one registered context message`);
  if (changed.length === 1) {
    const actual = sha256(Buffer.from(JSON.stringify({ positive_delta_message: positive.contextMessages[changed[0]], negative_delta_message: negative.contextMessages[changed[0]], query: positive.query }), "utf8"));
    check(actual === pair.controlledDeltaSha256, `${pair.pairId} controlledDeltaSha256 is reproducible`);
  }
  check(annotations.get(pair.positiveCaseId)?.pairRole === "positive" && annotations.get(pair.negativeCaseId)?.pairRole === "negative", `${pair.pairId} annotations are bijective`);
}

const allAssetIds = new Set([
  ...memory.l0Conversations, ...memory.l1Memories, ...memory.l2Scenes, ...memory.l3Profiles,
  ...skills.skills, ...knowledge.knowledge,
].map((item) => item.assetId));
for (const annotation of positives) {
  const gold = annotation.gold;
  check(gold.allowedFirstActions.length > 0 && gold.allowedSequences.length > 0, `${annotation.caseId} has non-empty first action and sequence`);
  check(gold.maxTdaiCalls === Math.min(...gold.allowedSequences.map((sequence) => sequence.length)), `${annotation.caseId} stops at the shortest legal chain`);
  check(gold.targetAssetIds.every((assetId) => allAssetIds.has(assetId)), `${annotation.caseId} targets visible T17 assets`);
  const sequence = gold.allowedSequences[0];
  if (sequence[0] === "skill_search") {
    check(sequence[1] === "skill_view_by_id" && gold.expectedFollowupActions?.[0]?.argumentRules?.valueFromPreviousStep === true, `${annotation.caseId} obtains skill_id from the search response`);
    check(!activeAgent.boundSkillIds.includes(gold.targetAssetIds[0]) && skills.skills.find((item) => item.assetId === gold.targetAssetIds[0])?.visibility === "team", `${annotation.caseId} search target is unlisted but same-Team visible`);
  }
  if (sequence.includes("skill_files_read")) {
    check(gold.expectedFollowupActions?.[0]?.argumentRules?.valueFromPreviousStep === true && gold.expectedFollowupActions?.[0]?.argumentRules?.exactValues?.path === "references/details.md", `${annotation.caseId} obtains skill_id from view and uses a manifest path`);
  }
  if (gold.family === "knowledge") {
    const fixture = knowledge.fixtures.find((item) => item.assetId === gold.targetAssetIds[0]);
    const expected = gold.expectedKnowledgeCalls?.[0];
    check(sequence.join("/") === "knowledge_tools_list/knowledge_tools_call" && expected?.toolName === fixture?.call.toolName && canonicalSha256(expected?.paramRules?.exactValues) === canonicalSha256(fixture?.call.params), `${annotation.caseId} Knowledge list/call tool and params match the frozen fixture`);
  }
  if (sequence[0] === "tdai_read_scene") {
    const path = gold.allowedFirstActions[0].argumentRules?.exactValues?.path;
    check(memory.l2Scenes.some((item) => item.path === path && item.injected), `${annotation.caseId} reads a path available from the injected L2 index`);
  }
}

// Case IDs are dataset routing metadata, not prompt/provider-visible text.  Audit
// only the fields actually projected into the provider prompt.
const providerRows = fragment.publicCases.map((item) => ({ language: item.language, contextMessages: item.contextMessages, query: item.query }));
const providerText = JSON.stringify(providerRows);
const leakagePatterns = [
  /allowedFirstActions|allowedSequences|targetAssetIds|informationGap|annotationReason|pairId|pair_id|knowledge_id/,
  /\btdai_(?:memory|conversation|atomic|scenario|read)[a-z_]*\b/i,
  /\bskill_(?:search|view|view_by_id|files_read)\b/i,
  /\bknowledge_tools_(?:list|call)\b/i,
  /\bT17-(?:L[0-3]|SKL|KNW|SRC)-[A-Z0-9-]+\b/i,
];
const leakageMatches = leakagePatterns.filter((pattern) => pattern.test(providerText)).map(String);
check(leakageMatches.length === 0, "provider-visible projection has zero private-field, tool-name, and asset-id leakage");

for (const source of fragment.sourceEvidence) {
  if (source.provenanceKind === "synthetic") {
    check(!("sourceRepoUrl" in source) && !("sourceRepoCommit" in source) && !("sourceRepoLicense" in source) && !("evidenceLocator" in source), `${source.sourceId} synthetic provenance contains no external repository fields`);
  } else {
    check(/^https:\/\/github\.com\//.test(source.sourceRepoUrl) && /^[a-f0-9]{40}$/.test(source.sourceRepoCommit) && /^[a-f0-9]{64}$/.test(source.evidenceSha256), `${source.sourceId} external provenance pins repository, commit, and hash`);
  }
}

for (const audit of skills.adaptationAudit) {
  const rawBytes = await readFile(resolve(workspace, audit.rawPath));
  const adaptedBytes = await readFile(resolve(workspace, audit.adaptedPath));
  const diffBytes = await readFile(resolve(workspace, audit.diffPath));
  check(sha256(rawBytes) === audit.rawSha256, `${audit.assetId} raw SHA-256 is reproducible`);
  check(sha256(adaptedBytes) === audit.adaptedSha256, `${audit.assetId} adapted SHA-256 is reproducible`);
  check(sha256(diffBytes) === audit.diffSha256 && audit.coreStepsPreserved === true, `${audit.assetId} adaptation diff is present and core steps are preserved`);
}

let oldExactQueryCopies = 0;
let oldExactContextCopies = 0;
let oldHighOrderCopies = 0;
try {
  const oldContract = await readJson(resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json"));
  const oldQueryHashes = new Set(oldContract.publicCases.map((item) => canonicalSha256(normalize(item.query))));
  const oldContextHashes = new Set(oldContract.publicCases.map((item) => canonicalSha256(item.contextMessages)));
  const oldGramSets = oldContract.publicCases.map((item) => ngrams(`${item.contextMessages.map((message) => message.content).join(" ")} ${item.query}`)).filter((set) => set.size >= 8);
  for (const item of fragment.publicCases) {
    if (oldQueryHashes.has(canonicalSha256(normalize(item.query)))) oldExactQueryCopies += 1;
    if (oldContextHashes.has(canonicalSha256(item.contextMessages))) oldExactContextCopies += 1;
    const grams = ngrams(`${item.contextMessages.map((message) => message.content).join(" ")} ${item.query}`);
    if (grams.size >= 8 && oldGramSets.some((old) => jaccard(grams, old) >= 0.9)) oldHighOrderCopies += 1;
  }
  check(oldExactQueryCopies === 0 && oldExactContextCopies === 0 && oldHighOrderCopies === 0, "no exact Query/context or >=0.9 high-order n-gram copy against frozen formal-v1.1 ancestor");
} catch (error) {
  errors.push(`old-set hash/duplicate audit failed: ${String(error)}`);
}

const categoryCounts = {
  memory_positive: countFamily("memory"),
  skill_positive: countFamily("skill"),
  knowledge_positive: countFamily("knowledge"),
  paired_no_tool_negative: fragment.privateAnnotations.filter((item) => item.pairRole === "negative").length,
  natural_coding_negative: fragment.privateAnnotations.filter((item) => !item.pairId).length,
};
const gate = {
  schema_version: "task1.team_gate.v2",
  dataset_revision: "formal-v2",
  team_id: "T17",
  status: errors.length === 0 ? "passed" : "failed",
  checked_at: "2026-08-31T23:30:00+08:00",
  counts: { cases: fragment.publicCases.length, pairs: fragment.pairs.length, ...categoryCounts },
  route_distribution: { discovery: discovery, direct: positives.length - discovery },
  assets: { l0_sessions: memory.l0Conversations.length, l1_memories: memory.l1Memories.length, l2_scenes: memory.l2Scenes.length, l3_profiles: memory.l3Profiles.length, skills: skills.skills.length, knowledge: knowledge.knowledge.length },
  luna_batches: fragment.generatorBatchRefs,
  skill_sources: [...new Map(skills.adaptationAudit.map((item) => [item.repository, { repository: item.repository, revision: item.revision, license: item.license }])).values()],
  provider_leakage_count: leakageMatches.length,
  old_set_duplicate_audit: { exact_query_copies: oldExactQueryCopies, exact_context_copies: oldExactContextCopies, high_order_ngram_copies: oldHighOrderCopies },
  checks,
  errors,
  known_limitations: [
    "Team Gate validates the staged fragment and deterministic fixtures; the integration task must build the full formal-v2 world/snapshot and run real-service restoration.",
    "Task 1 stops after acquiring the target asset and does not execute or score the requested coding work.",
  ],
  artifact_sha256: {
    team_fragment: sha256(await readFile(resolve(stagingRoot, "team-fragment.json"))),
    memory: sha256(await readFile(resolve(stagingRoot, "assets/memory.json"))),
    skills: sha256(await readFile(resolve(stagingRoot, "assets/skills.json"))),
    knowledge: sha256(await readFile(resolve(stagingRoot, "assets/knowledge.json"))),
    review: sha256(await readFile(resolve(stagingRoot, "review.md"))),
  },
};
await writeFile(resolve(stagingRoot, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
console.log(JSON.stringify(gate, null, 2));
if (errors.length) process.exitCode = 1;
