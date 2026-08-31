import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const repoRoot = resolve(import.meta.dirname, "../../../../../../../..");
const datasetRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const stagingRoot = join(datasetRoot, "staging/teams/T20");
const buildRoot = join(datasetRoot, "generators/parallel/build-10/T20");
const sourceRoot = join(datasetRoot, "source-material/T20");
const contractPath = join(stagingRoot, "team-fragment.json");
const requiredPaths = [
  contractPath,
  join(stagingRoot, "memory-assets.json"),
  join(stagingRoot, "skill-assets.json"),
  join(stagingRoot, "knowledge-assets.json"),
  join(stagingRoot, "review.md"),
];
const errors = [];
for (const path of requiredPaths) if (!existsSync(path)) errors.push(`missing ${path}`);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sortValue = (value) => Array.isArray(value) ? value.map(sortValue)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])])) : value;
const shaText = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const sha = (value) => shaText(JSON.stringify(sortValue(value)));
const contract = readJson(contractPath);

const formal = spawnSync(process.execPath, [
  join(repoRoot, "MemoryProxy/node_modules/tsx/dist/cli.mjs"),
  join(datasetRoot, "scripts/validate-formal-dataset.ts"),
  "--contract", contractPath,
], { cwd: join(repoRoot, "MemoryProxy"), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
let formalReport = null;
try { formalReport = JSON.parse(formal.stdout.trim()); } catch { errors.push("formal validator did not emit JSON"); }
if (formal.status !== 0 || !formalReport?.valid) errors.push("formal schema/compiler/provider-leakage validation failed");

const annotations = contract.privateAnnotations;
const positives = annotations.filter((item) => item.gold.needTdaiTool);
const negatives = annotations.filter((item) => !item.gold.needTdaiTool);
const pairedNegatives = negatives.filter((item) => item.pairRole === "negative");
const naturalNegatives = negatives.filter((item) => !item.pairId);
const count = (value, expected, label) => { if (value !== expected) errors.push(`${label}: expected ${expected}, got ${value}`); };
count(contract.publicCases.length, 40, "cases");
count(contract.pairs.length, 15, "pairs");
count(positives.filter((item) => item.gold.family === "memory").length, 6, "memory positives");
count(positives.filter((item) => item.gold.family === "skill").length, 6, "skill positives");
count(positives.filter((item) => item.gold.family === "knowledge").length, 3, "knowledge positives");
count(pairedNegatives.length, 15, "paired negatives");
count(naturalNegatives.length, 10, "natural negatives");
const discoveryTools = new Set(["knowledge_tools_list", "skill_search", "tdai_conversation_search", "tdai_memory_search", "tdai_scenario_ls"]);
const discovery = positives.filter((item) => item.gold.allowedFirstActions.some((action) => discoveryTools.has(action.tool))).length;
count(discovery, 10, "discovery positives");
count(positives.length - discovery, 5, "direct positives");

const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
for (const pair of contract.pairs) {
  const positive = publicById.get(pair.positiveCaseId);
  const negative = publicById.get(pair.negativeCaseId);
  if (!positive || !negative) { errors.push(`${pair.pairId}: incomplete cases`); continue; }
  if (positive.query !== negative.query) errors.push(`${pair.pairId}: query changed`);
  if (sha(positive.workspace) !== sha(negative.workspace) || positive.snapshotId !== negative.snapshotId) errors.push(`${pair.pairId}: workspace/snapshot changed`);
  const stripSession = (identity) => { const { sessionId, ...rest } = identity; void sessionId; return rest; };
  if (sha(stripSession(positive.identity)) !== sha(stripSession(negative.identity))) errors.push(`${pair.pairId}: identity changed`);
  if (positive.contextMessages.length !== negative.contextMessages.length) errors.push(`${pair.pairId}: context length changed`);
  const changed = positive.contextMessages.flatMap((message, index) => sha(message) === sha(negative.contextMessages[index]) ? [] : [index]);
  if (changed.length !== 1) errors.push(`${pair.pairId}: expected one context delta, got ${changed.length}`);
}

const providerText = contract.publicCases.map((item) => JSON.stringify({ contextMessages: item.contextMessages, query: item.query })).join("\n");
const leakagePatterns = [
  /\btdai_[a-z_]+\b/i, /\bskill_(?:search|view|view_by_id|files_read)\b/i,
  /\bknowledge_tools_(?:list|call)\b/i, /\bT20-(?:L[0-3]|SKILL|KNOW)-[A-Z0-9-]+\b/i,
  /\bGold\b/i, /判分(?:理由|依据)?/, /\bMemory\s+L[0-3]\b/i,
];
for (const pattern of leakagePatterns) if (pattern.test(providerText)) errors.push(`provider leakage ${String(pattern)}`);

count(contract.assets.l0Conversations.length, 10, "L0");
for (const item of contract.assets.l0Conversations) if (item.messages.length < 12 || item.messages.length > 20) errors.push(`${item.assetId}: L0 message count ${item.messages.length}`);
count(contract.assets.l1Memories.length, 16, "L1");
count(contract.assets.l2Scenes.length, 5, "L2");
for (const item of contract.assets.l2Scenes) {
  if (item.supportingSessionIds.length < 2) errors.push(`${item.assetId}: insufficient scene support`);
  if (/\b(?:\d+(?:\.\d+)?%|\d+\s*(?:秒|分钟|ms)|urn:)/i.test(item.summary)) errors.push(`${item.assetId}: scene summary leaks a target value`);
}
count(contract.assets.l3Profiles.length, 1, "L3");
count(contract.assets.skills.length, 16, "skills");
count(contract.assets.knowledge.length, 3, "knowledge");
if (contract.externalImports.filter((item) => item.kind === "skill").length !== 16) errors.push("adopted skill count is not 16");

const sourceLock = readJson(join(sourceRoot, "source-lock.json"));
for (const file of sourceLock.files) {
  const localPath = join(repoRoot, file.localPath);
  const local = readFileSync(localPath);
  const localActual = createHash("sha256").update(local).digest("hex");
  if (localActual !== (file.localSha256 ?? file.rawSha256)) errors.push(`local source hash mismatch ${file.sourceId}`);
  const raw = file.rawArchivePath ? gunzipSync(readFileSync(join(repoRoot, file.rawArchivePath))) : local;
  const rawActual = createHash("sha256").update(raw).digest("hex");
  if (rawActual !== file.rawSha256) errors.push(`raw source hash mismatch ${file.sourceId}`);
}
for (const repo of sourceLock.repositories) {
  const local = readFileSync(join(repoRoot, repo.licensePath));
  const localActual = createHash("sha256").update(local).digest("hex");
  if (localActual !== (repo.localLicenseSha256 ?? repo.licenseSha256)) errors.push(`local license hash mismatch ${repo.repository}`);
  const raw = repo.licenseRawArchivePath ? gunzipSync(readFileSync(join(repoRoot, repo.licenseRawArchivePath))) : local;
  const rawActual = createHash("sha256").update(raw).digest("hex");
  if (rawActual !== repo.licenseSha256) errors.push(`license hash mismatch ${repo.repository}`);
}
const adaptedRaw = readJson(join(buildRoot, "batches/skill-main-01/skill-assets.json"));
for (const imported of contract.externalImports.filter((item) => item.kind === "skill")) {
  const adapted = adaptedRaw.candidates.find((item) => item.source_id === imported.sourceId);
  if (!adapted || sha(adapted) !== imported.adaptedSha256) errors.push(`adapted hash mismatch ${imported.sourceId}`);
}

const normalize = (value) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const grams = (value, width = 12) => {
  const tokens = normalize(value).match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const result = new Set();
  for (let index = 0; index + width <= tokens.length; index += 1) result.add(tokens.slice(index, index + width).join(" "));
  return result;
};
const jaccard = (left, right) => {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
};
const oldPath = join(datasetRoot, "registry/contracts/formal-v1.json");
const oldContract = readJson(oldPath);
const oldQueries = new Set(oldContract.publicCases.map((item) => sha(normalize(item.query))));
const oldContexts = new Set(oldContract.publicCases.map((item) => sha(item.contextMessages)));
let exactQueryCopies = 0;
let exactContextCopies = 0;
let highOrderCopies = 0;
let maxNgramSimilarity = 0;
const oldGramSets = oldContract.publicCases.map((item) => grams(`${item.contextMessages.map((message) => message.content).join(" ")} ${item.query}`)).filter((item) => item.size >= 8);
for (const item of contract.publicCases) {
  if (oldQueries.has(sha(normalize(item.query)))) exactQueryCopies += 1;
  if (oldContexts.has(sha(item.contextMessages))) exactContextCopies += 1;
  const current = grams(`${item.contextMessages.map((message) => message.content).join(" ")} ${item.query}`);
  if (current.size < 8) continue;
  for (const old of oldGramSets) {
    const score = jaccard(current, old);
    if (score > maxNgramSimilarity) maxNgramSimilarity = score;
    if (score >= 0.9) highOrderCopies += 1;
  }
}
if (exactQueryCopies || exactContextCopies || highOrderCopies) errors.push("old-set copy check failed");

const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8" });
const allowedPrefixes = [
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-10/T20/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T20/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T20/",
];
for (const line of status.stdout.split(/\r?\n/).filter(Boolean)) {
  const path = line.slice(3).replaceAll("\\", "/");
  if (!allowedPrefixes.some((prefix) => path.startsWith(prefix))) errors.push(`write outside allowed paths: ${path}`);
}
const diffCheck = spawnSync("git", ["diff", "--check"], { cwd: repoRoot, encoding: "utf8" });
if (diffCheck.status !== 0) errors.push("git diff --check failed");

const report = {
  schema_version: "task1.team_gate.v1", team_id: "T20", valid: errors.length === 0,
  errors, formal_validation: {
    valid: formalReport?.valid ?? false,
    case_count: formalReport?.case_count ?? null,
    pair_count: formalReport?.pair_count ?? null,
    provider_leakage_count: formalReport?.provider_leakage_count ?? null,
    invalid_sequence_count: formalReport?.invalid_sequence_count ?? null,
    missing_source_ref_count: formalReport?.missing_source_ref_count ?? null,
    provider_sha256: formalReport?.provider_sha256 ?? null,
  },
  counts: contract.counts,
  assets: { l0: contract.assets.l0Conversations.length, l1: contract.assets.l1Memories.length, l2: contract.assets.l2Scenes.length, l3: contract.assets.l3Profiles.length, skills: contract.assets.skills.length, knowledge: contract.assets.knowledge.length },
  batches: contract.generatorBatchRefs,
  source_review: { adopted_skills: 16, source_files: sourceLock.files.length, repository_count: sourceLock.repositories.length, raw_hash_mismatches: errors.filter((item) => item.startsWith("raw source hash")).length, adapted_hash_mismatches: errors.filter((item) => item.startsWith("adapted hash")).length },
  old_set_hash_only_comparison: { exact_query_copies: exactQueryCopies, exact_context_copies: exactContextCopies, high_order_ngram_copies: highOrderCopies, max_ngram_jaccard: Number(maxNgramSimilarity.toFixed(6)) },
  git: { diff_check: diffCheck.status === 0, allowed_paths_only: !errors.some((item) => item.startsWith("write outside")) },
};
writeFileSync(join(stagingRoot, "gate.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
