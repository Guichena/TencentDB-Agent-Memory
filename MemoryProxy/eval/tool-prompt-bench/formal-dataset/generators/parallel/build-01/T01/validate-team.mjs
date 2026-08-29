import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = resolve(scriptDir, "..", "..", "..", "..");
const repoDir = resolve(formalDir, "..", "..", "..", "..");
const stagingDir = join(formalDir, "staging", "teams", "T01");
const sourceDir = join(formalDir, "source-material", "T01");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const canonicalSha256 = (value) => sha256(JSON.stringify(stable(value)));
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};

const errors = [];
const checks = [];
function check(name, condition, detail = undefined) {
  checks.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) errors.push(`${name}${detail === undefined ? "" : `: ${detail}`}`);
}
function countBy(items, key) {
  return Object.fromEntries([...new Set(items.map(key))].sort().map((value) => [value, items.filter((item) => key(item) === value).length]));
}

const fragment = readJson(join(stagingDir, "team-fragment.json"));
const memory = readJson(join(stagingDir, "assets", "memory.json"));
const skillsFile = readJson(join(stagingDir, "assets", "skills.json"));
const knowledgeFile = readJson(join(stagingDir, "assets", "knowledge.json"));
const formalReport = readJson(join(scriptDir, "formal-validation-report.json"));
const buildSummary = readJson(join(scriptDir, "build-summary.json"));
const inputPack = readJson(join(scriptDir, "input-pack.json"));
const inputLock = readJson(join(scriptDir, "input-pack.lock.json"));
const sourceManifest = readJson(join(sourceDir, "skill-sources.json"));

check("dedicated branch", git("branch", "--show-current") === "codex/task1-data-build-v2-t01-t02", git("branch", "--show-current"));
const launchCommit = git("rev-parse", "task1-data-parallel-launch-v2^{commit}");
check("launch tag commit", launchCommit === "ef2ca4bd84e529c6c7d8a8df661520cbc3bf4bb0", launchCommit);
check("schema baseline ancestor", spawnSync("git", ["merge-base", "--is-ancestor", "1048681880b51e7a52a6b8b0b731eadeec44e118", "HEAD"], { cwd: repoDir }).status === 0);
check("content baseline ancestor", spawnSync("git", ["merge-base", "--is-ancestor", "960021e472456515a89d3c2c4f2962fbf6cc51a1", "HEAD"], { cwd: repoDir }).status === 0);

const allowedPrefixes = [
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-01/T01/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T01/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T01/",
];
const changedPaths = git("status", "--porcelain=v1", "--untracked-files=all").split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/"));
const outOfScope = changedPaths.filter((path) => !allowedPrefixes.some((prefix) => path.startsWith(prefix)));
check("write scope", outOfScope.length === 0, outOfScope);

const requiredFragmentKeys = ["sourceEvidence", "teams", "businessAgents", "tasks", "publicCases", "privateAnnotations", "pairs"].sort();
check("team fragment keys", JSON.stringify(Object.keys(fragment).sort()) === JSON.stringify(requiredFragmentKeys), Object.keys(fragment).sort());
check("formal schema preview", formalReport.valid === true && formalReport.errors.length === 0, formalReport.errors);
check("formal case count", formalReport.case_count === 40 && formalReport.team_case_counts.T01 === 40, formalReport.team_case_counts);
check("formal pair count", formalReport.pair_count === 15 && formalReport.pairs_by_team.T01 === 15, formalReport.pairs_by_team);
check("formal pair integrity", formalReport.pair_integrity_error_count === 0, formalReport.pair_integrity_errors);
check("formal provider leakage", formalReport.provider_leakage_count === 0, formalReport.provider_leakage_count);
check("formal sequence validity", formalReport.invalid_sequence_count === 0, formalReport.invalid_sequence_count);
check("formal source refs", formalReport.missing_source_ref_count === 0, formalReport.missing_source_ref_count);

check("public cases", fragment.publicCases.length === 40, fragment.publicCases.length);
check("private annotations", fragment.privateAnnotations.length === 40, fragment.privateAnnotations.length);
check("pairs", fragment.pairs.length === 15, fragment.pairs.length);
const annotationsById = new Map(fragment.privateAnnotations.map((item) => [item.caseId, item]));
const casesById = new Map(fragment.publicCases.map((item) => [item.caseId, item]));
const positive = fragment.privateAnnotations.filter((item) => item.pairRole === "positive");
const negative = fragment.privateAnnotations.filter((item) => item.pairRole === "negative");
const natural = fragment.privateAnnotations.filter((item) => !item.pairId);
check("paired role counts", positive.length === 15 && negative.length === 15, { positive: positive.length, negative: negative.length });
check("natural negatives", natural.length === 10 && natural.every((item) => !item.gold.needTdaiTool), natural.length);
check("positive family quota", JSON.stringify(countBy(positive, (item) => item.gold.family)) === JSON.stringify({ knowledge: 3, memory: 6, skill: 6 }), countBy(positive, (item) => item.gold.family));
check("all negatives no-tool", [...negative, ...natural].every((item) => !item.gold.needTdaiTool && item.gold.maxTdaiCalls === 0 && item.gold.allowedSequences.length === 0));

for (const pair of fragment.pairs) {
  const p = casesById.get(pair.positiveCaseId);
  const n = casesById.get(pair.negativeCaseId);
  if (!p || !n) { errors.push(`${pair.pairId}: missing case`); continue; }
  const changed = p.contextMessages.flatMap((message, index) => canonicalSha256(message) === canonicalSha256(n.contextMessages[index]) ? [] : [index]);
  check(`${pair.pairId} one message delta`, p.contextMessages.length === n.contextMessages.length && changed.length === 1, changed);
  if (changed.length === 1) {
    const actual = sha256(JSON.stringify({
      positive_delta_message: p.contextMessages[changed[0]],
      negative_delta_message: n.contextMessages[changed[0]],
      query: p.query,
    }));
    check(`${pair.pairId} delta hash`, actual === pair.controlledDeltaSha256, { expected: pair.controlledDeltaSha256, actual });
  }
  check(`${pair.pairId} annotation roles`, annotationsById.get(p.caseId)?.pairRole === "positive" && annotationsById.get(n.caseId)?.pairRole === "negative");
}

const providerPayloads = fragment.publicCases.map((item) => ({
  caseId: item.caseId,
  language: item.language,
  contextMessages: item.contextMessages,
  query: item.query,
}));
const providerText = JSON.stringify(providerPayloads);
const privateMarkers = ["allowedFirstActions", "targetAssetIds", "annotationReason", "sourceRepoUrl", "generatorModel", "batchId", "gpt-5.6-luna"];
check("provider allowlist leakage scan", privateMarkers.every((marker) => !providerText.includes(marker)), privateMarkers.filter((marker) => providerText.includes(marker)));
const providerHashes = providerPayloads.map((payload) => canonicalSha256(payload));
check("no duplicate provider case", new Set(providerHashes).size === providerHashes.length);

check("memory asset quota", memory.l0Conversations.length === 12 && memory.l1Memories.length === 15 && memory.l2Scenes.length === 4 && memory.l3Profiles.length === 1, {
  l0: memory.l0Conversations.length, l1: memory.l1Memories.length, l2: memory.l2Scenes.length, l3: memory.l3Profiles.length,
});
check("retrieval pressure pilot retained", ["T01-PAIR-001", "T01-PAIR-002", "T01-PAIR-003", "T01-PAIR-004", "T01-PAIR-005"].every((id) => fragment.pairs.some((pair) => pair.pairId === id)) && existsSync(join(formalDir, "fixtures", "T01-retrieval-pressure.json")));
check("runtime instruction mappings", memory.runtimeTypeMappings["T01-L1-MYPY-PARAMSPEC-OPTIONAL-BOUND"] === "instruction" && memory.runtimeTypeMappings["T01-L1-MOTO-PRESENCE-PREDICATE"] === "instruction");
check("formal decision mappings", memory.l1Memories.filter((asset) => ["T01-L1-MYPY-PARAMSPEC-OPTIONAL-BOUND", "T01-L1-MOTO-PRESENCE-PREDICATE"].includes(asset.assetId)).every((asset) => asset.type === "decision" && asset.runtimeType === "instruction"));

const memorySequences = positive.filter((item) => item.gold.family === "memory").map((item) => item.gold.allowedSequences[0].join("->"));
check("memory route distribution", JSON.stringify(countBy(memorySequences, (item) => item)) === JSON.stringify({
  tdai_atomic_query: 2,
  tdai_conversation_search: 3,
  tdai_memory_search: 1,
}), countBy(memorySequences, (item) => item));
const skillSequences = positive.filter((item) => item.gold.family === "skill").map((item) => item.gold.allowedSequences[0].join("->"));
check("skill route distribution", JSON.stringify(countBy(skillSequences, (item) => item)) === JSON.stringify({
  "skill_search->skill_view_by_id": 3,
  skill_view: 2,
  "skill_view->skill_files_read": 1,
}), countBy(skillSequences, (item) => item));
const knowledgeSequences = positive.filter((item) => item.gold.family === "knowledge").map((item) => item.gold.allowedSequences[0].join("->"));
check("knowledge route distribution", knowledgeSequences.length === 3 && knowledgeSequences.every((item) => item === "knowledge_tools_list->knowledge_tools_call"), knowledgeSequences);

const endpointByTool = {
  tdai_memory_search: "/memory-bridge/v3/atomic/search",
  tdai_atomic_query: "/memory-bridge/v3/atomic/query",
  tdai_conversation_search: "/memory-bridge/v3/conversation/search",
  skill_search: "/skill-bridge/v3/skill/search",
  skill_view: "/skill-bridge/v3/skill/get-by-name",
  skill_view_by_id: "/skill-bridge/v3/skill/get",
  skill_files_read: "/skill-bridge/v3/skill/files/read",
  knowledge_tools_list: "/tools/list",
};
const actionErrors = [];
for (const item of positive) {
  for (const action of [...item.gold.allowedFirstActions, ...(item.gold.expectedFollowupActions ?? [])]) {
    if (endpointByTool[action.tool] !== action.endpoint) actionErrors.push(`${item.caseId}:${action.tool}:${action.endpoint}`);
  }
}
check("production endpoints", actionErrors.length === 0, actionErrors);

check("skill asset count", skillsFile.skills.length === 15, skillsFile.skills.length);
const agent = fragment.businessAgents[0];
check("listed Skill count", agent.boundSkillIds.length === 5, agent.boundSkillIds);
check("search Skill count", skillsFile.skills.filter((skill) => !agent.boundSkillIds.includes(skill.assetId)).length === 10);
check("knowledge asset count", knowledgeFile.knowledge.length === 3 && agent.fixedKnowledgeIds.length === 3);
check("source package count", sourceManifest.sources.length === 15, sourceManifest.sources.length);
const pinsByName = new Map(inputPack.skill_source_pins.map((pin) => [pin.name, pin]));
const packageErrors = [];
for (const source of sourceManifest.sources) {
  const pin = pinsByName.get(source.name);
  const packageDir = join(sourceDir, source.package_path);
  const metadataPath = join(packageDir, "metadata.json");
  const metadata = readJson(metadataPath);
  if (!pin || metadata.repository_url !== pin.repo || metadata.revision !== pin.revision || metadata.source_path !== pin.path || metadata.license_spdx !== pin.license) packageErrors.push(`${source.name}: pin mismatch`);
  if (!/^[a-f0-9]{40}$/.test(metadata.revision) || !/^[a-f0-9]{64}$/.test(metadata.main_raw_sha256)) packageErrors.push(`${source.name}: invalid revision/hash`);
  if (!metadata.repository_url.startsWith("https://github.com/")) packageErrors.push(`${source.name}: non-GitHub source`);
  const mainRaw = metadata.raw_files.find((file) => file.path === "SKILL.md");
  if (!mainRaw || sha256(readFileSync(join(packageDir, "raw", "SKILL.md"))) !== metadata.main_raw_sha256) packageErrors.push(`${source.name}: raw SHA mismatch`);
  for (const file of metadata.raw_files) if (sha256(readFileSync(join(packageDir, "raw", ...file.path.split("/")))) !== file.sha256) packageErrors.push(`${source.name}: raw file mismatch ${file.path}`);
  for (const file of metadata.adapted_files) if (sha256(readFileSync(join(packageDir, "adapted", ...file.path.split("/")))) !== file.sha256) packageErrors.push(`${source.name}: adapted file mismatch ${file.path}`);
  const diffPath = join(packageDir, metadata.adaptation_diff);
  if (!existsSync(diffPath) || statSync(diffPath).size === 0) packageErrors.push(`${source.name}: missing adaptation diff`);
  const licensePath = resolve(packageDir, metadata.license_file);
  if (!existsSync(licensePath) || statSync(licensePath).size === 0) packageErrors.push(`${source.name}: missing license`);
}
check("GitHub Skill source packages", packageErrors.length === 0, packageErrors);
check("source input pack lock", sha256(readFileSync(join(scriptDir, inputLock.input_pack))) === inputLock.sha256 && inputLock.frozen === true, inputLock.sha256);

const batchSpecs = [
  [join(scriptDir, "legacy", "memory-batch-01"), "t01-memory-batch-01", 4],
  [join(scriptDir, "legacy", "skill-batch-01"), "t01-skill-batch-01", 4],
  [join(scriptDir, "legacy", "knowledge-batch-01"), "t01-knowledge-batch-01", 2],
  [join(scriptDir, "legacy", "natural-negative-batch-01"), "t01-natural-negative-batch-01", 10],
  [join(scriptDir, "memory-assets", "memory-assets-batch-01"), "t01-memory-assets-batch-01", 20],
];
const batchErrors = [];
for (const [batchDir, batchId, count] of batchSpecs) {
  const manifest = readJson(join(batchDir, "manifest.json"));
  const draft = readJson(join(batchDir, "draft.json"));
  const records = draft.pairs ?? draft.cases ?? draft.assets;
  if (manifest.batch_id !== batchId || manifest.generator_model !== "gpt-5.6-luna" || manifest.reasoning_effort !== "high" || manifest.actual_count !== count || records.length !== count) batchErrors.push(`${batchId}: metadata/count mismatch`);
  if (Object.hasOwn(manifest, "raw_output_file") || Object.hasOwn(manifest, "raw_output_sha256")) batchErrors.push(`${batchId}: stale raw output metadata retained`);
}
const assetManifest = readJson(join(scriptDir, "memory-assets", "memory-assets-batch-01", "manifest.json"));
if (assetManifest.fork_turns !== "none") batchErrors.push("t01-memory-assets-batch-01: fork_turns is not none");
check("Luna batches", batchErrors.length === 0, batchErrors);

check("review present", existsSync(join(stagingDir, "review.md")) && statSync(join(stagingDir, "review.md")).size > 0);
check("build summary consistency", buildSummary.counts.cases === 40 && buildSummary.counts.pairs === 15 && buildSummary.counts.skills === 15);

const gate = {
  schema_version: "task1.team_gate.v1",
  team_id: "T01",
  split: "dev",
  status: errors.length === 0 ? "pass" : "fail",
  launch_commit: launchCommit,
  branch: git("branch", "--show-current"),
  counts: buildSummary.counts,
  formal_validation: {
    valid: formalReport.valid,
    case_count: formalReport.case_count,
    pair_count: formalReport.pair_count,
    pair_integrity_error_count: formalReport.pair_integrity_error_count,
    provider_leakage_count: formalReport.provider_leakage_count,
    invalid_sequence_count: formalReport.invalid_sequence_count,
    missing_source_ref_count: formalReport.missing_source_ref_count,
    report: "../../../generators/parallel/build-01/T01/formal-validation-report.json",
  },
  luna_batches: batchSpecs.map(([, batchId, count]) => ({ batch_id: batchId, count })),
  github_skill_source_count: sourceManifest.sources.length,
  checks,
  error_count: errors.length,
  errors,
  integration_issues: [
    "The global integrator must preserve the explicit formal decision -> runtime instruction mapping for the two direct atomic-query targets when materializing production Memory fixtures.",
    "The global integrator must regenerate snapshots and cross-Team hashes; this Team fragment intentionally does not write global snapshot or contract files."
  ]
};
writeFileSync(join(stagingDir, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify(gate, null, 2));
if (errors.length > 0) process.exitCode = 1;
