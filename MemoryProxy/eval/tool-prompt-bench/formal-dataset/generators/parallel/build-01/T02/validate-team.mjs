import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = resolve(scriptDir, "..", "..", "..", "..");
const repoDir = resolve(formalDir, "..", "..", "..", "..");
const stagingDir = join(formalDir, "staging", "teams", "T02");
const sourceDir = join(formalDir, "source-material", "T02");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
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
  if (!condition) errors.push(`${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
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
const sourceLock = readJson(join(scriptDir, "source-pack.lock.json"));
const skillManifest = readJson(join(sourceDir, "skill-sources.json"));
const projectManifest = readJson(join(sourceDir, "project-sources.json"));

check("dedicated branch", git("branch", "--show-current") === "codex/task1-data-build-v2-t01-t02", git("branch", "--show-current"));
const launchCommit = git("rev-parse", "task1-data-parallel-launch-v2^{commit}");
check("launch tag commit", launchCommit === "ef2ca4bd84e529c6c7d8a8df661520cbc3bf4bb0", launchCommit);
check("schema baseline ancestor", spawnSync("git", ["merge-base", "--is-ancestor", "1048681880b51e7a52a6b8b0b731eadeec44e118", "HEAD"], { cwd: repoDir }).status === 0);
check("content baseline ancestor", spawnSync("git", ["merge-base", "--is-ancestor", "960021e472456515a89d3c2c4f2962fbf6cc51a1", "HEAD"], { cwd: repoDir }).status === 0);
const allowedPrefixes = [
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-01/T01/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-01/T02/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T01/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T02/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T01/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T02/",
];
const statusResult = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoDir, encoding: "utf8", windowsHide: true });
if (statusResult.status !== 0) throw new Error(`git status failed: ${statusResult.stderr}`);
const changedPaths = statusResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/"));
check("write scope", changedPaths.filter((path) => !allowedPrefixes.some((prefix) => path.startsWith(prefix))).length === 0, changedPaths.filter((path) => !allowedPrefixes.some((prefix) => path.startsWith(prefix))));

const requiredKeys = ["schema_version", "build_id", "team_id", "split", "sourceEvidence", "teams", "businessAgents", "tasks", "publicCases", "privateAnnotations", "pairs", "snapshotAssetIds", "generatorBatchRefs", "externalImports"].sort();
check("team fragment keys", JSON.stringify(Object.keys(fragment).sort()) === JSON.stringify(requiredKeys), Object.keys(fragment).sort());
check("team fragment identity", fragment.schema_version === "task1.team_fragment.v1" && fragment.build_id === "build-01" && fragment.team_id === "T02" && fragment.split === "dev");
check("formal schema preview", formalReport.valid === true && formalReport.errors.length === 0, formalReport.errors);
check("formal case count", formalReport.case_count === 80 && formalReport.team_case_counts.T02 === 40, formalReport.team_case_counts);
check("formal pair count", formalReport.pair_count === 30 && formalReport.pairs_by_team.T02 === 15, formalReport.pairs_by_team);
check("formal pair integrity", formalReport.pair_integrity_error_count === 0, formalReport.pair_integrity_errors);
check("formal provider leakage", formalReport.provider_leakage_count === 0, formalReport.provider_leakage_count);
check("formal sequence validity", formalReport.invalid_sequence_count === 0, formalReport.invalid_sequence_count);
check("formal source refs", formalReport.missing_source_ref_count === 0, formalReport.missing_source_ref_count);

check("public cases", fragment.publicCases.length === 40, fragment.publicCases.length);
check("private annotations", fragment.privateAnnotations.length === 40, fragment.privateAnnotations.length);
check("pairs", fragment.pairs.length === 15, fragment.pairs.length);
const caseById = new Map(fragment.publicCases.map((item) => [item.caseId, item]));
const annotationById = new Map(fragment.privateAnnotations.map((item) => [item.caseId, item]));
const positive = fragment.privateAnnotations.filter((item) => item.pairRole === "positive");
const negative = fragment.privateAnnotations.filter((item) => item.pairRole === "negative");
const natural = fragment.privateAnnotations.filter((item) => !item.pairId);
check("paired roles", positive.length === 15 && negative.length === 15, { positive: positive.length, negative: negative.length });
check("natural negatives", natural.length === 10 && natural.every((item) => !item.gold.needTdaiTool), natural.length);
check("positive family quota", JSON.stringify(countBy(positive, (item) => item.gold.family)) === JSON.stringify({ knowledge: 3, memory: 6, skill: 6 }), countBy(positive, (item) => item.gold.family));
check("all negatives no-tool", [...negative, ...natural].every((item) => !item.gold.needTdaiTool && item.gold.maxTdaiCalls === 0 && item.gold.allowedSequences.length === 0));
const expectedPositiveTasks = {
  "T02-MEMORY-001-P": "T02-TASK-PANDAS-RESAMPLING",
  "T02-MEMORY-002-P": "T02-TASK-DASK-PARALLEL",
  "T02-MEMORY-003-P": "T02-TASK-NOTEBOOK-HANDOFF",
  "T02-MEMORY-004-P": "T02-TASK-TIMESERIES-DETREND",
  "T02-MEMORY-005-P": "T02-TASK-TIMESERIES-DETREND",
  "T02-MEMORY-006-P": "T02-TASK-DASK-PARALLEL",
  "T02-SKILL-007-P": "T02-TASK-TIMESERIES-DETREND",
  "T02-SKILL-008-P": "T02-TASK-DASK-PARALLEL",
  "T02-SKILL-009-P": "T02-TASK-DASK-PARALLEL",
  "T02-SKILL-010-P": "T02-TASK-DASK-PARALLEL",
  "T02-SKILL-011-P": "T02-TASK-PANDAS-RESAMPLING",
  "T02-SKILL-012-P": "T02-TASK-NOTEBOOK-HANDOFF",
  "T02-KNOWLEDGE-013-P": "T02-TASK-PANDAS-RESAMPLING",
  "T02-KNOWLEDGE-014-P": "T02-TASK-DASK-PARALLEL",
  "T02-KNOWLEDGE-015-P": "T02-TASK-DASK-PARALLEL",
};
const taskAssignmentErrors = Object.entries(expectedPositiveTasks).flatMap(([caseId, taskId]) => caseById.get(caseId)?.identity.taskId === taskId ? [] : [`${caseId}:${caseById.get(caseId)?.identity.taskId}`]);
check("positive task assignments", taskAssignmentErrors.length === 0, taskAssignmentErrors);
for (const pair of fragment.pairs) {
  const p = caseById.get(pair.positiveCaseId);
  const n = caseById.get(pair.negativeCaseId);
  if (!p || !n) { errors.push(`${pair.pairId}: missing case`); continue; }
  const changed = p.contextMessages.flatMap((message, index) => canonicalSha256(message) === canonicalSha256(n.contextMessages[index]) ? [] : [index]);
  check(`${pair.pairId} one message delta`, p.contextMessages.length === n.contextMessages.length && changed.length === 1, changed);
  if (changed.length === 1) {
    const actual = sha256(JSON.stringify({ positive_delta_message: p.contextMessages[changed[0]], negative_delta_message: n.contextMessages[changed[0]], query: p.query }));
    check(`${pair.pairId} delta hash`, actual === pair.controlledDeltaSha256, { expected: pair.controlledDeltaSha256, actual });
  }
  check(`${pair.pairId} roles`, annotationById.get(p.caseId)?.pairRole === "positive" && annotationById.get(n.caseId)?.pairRole === "negative");
}

const providerPayloads = fragment.publicCases.map(({ caseId, language, contextMessages, query }) => ({ caseId, language, contextMessages, query }));
const providerText = JSON.stringify(providerPayloads.map(({ language, contextMessages, query }) => ({ language, contextMessages, query })));
const leakagePatterns = [/\bT02-(?:L[0-3]|SKILL)-/i, /\bcg-t02/i, /\bwiki-t02/i, /\btdai_/i, /\bskill_(?:search|view|files)/i, /\bknowledge_tools_/i, /\bGold\b/i, /\bbenchmark\b/i, /gpt-5\.6-luna/i, /判分(?:理由|依据)?/];
check("provider leakage scan", leakagePatterns.every((pattern) => !pattern.test(providerText)), leakagePatterns.filter((pattern) => pattern.test(providerText)).map(String));
check("no duplicate provider case", new Set(providerPayloads.map(canonicalSha256)).size === providerPayloads.length);

check("memory asset quota", memory.l0Conversations.length === 10 && memory.l0Conversations.reduce((sum, item) => sum + item.messages.length, 0) === 120 && memory.l1Memories.length === 15 && memory.l2Scenes.length === 4 && memory.l3Profiles.length === 1, buildSummary.counts);
check("runtime instruction mappings", ["T02-L1-PANDAS-RESAMPLE-TIMEZONE", "T02-L1-TIMESERIES-DETREND-LINEAR", "T02-L1-DASK-PARTITION-SKEW", "T02-L1-DASK-MEMORY-BOUNDARY", "T02-L1-NOTEBOOK-EXECUTION-ORDER"].every((id) => memory.runtimeTypeMappings[id] === "instruction" && memory.l1Memories.find((item) => item.assetId === id)?.type === "decision"));
check("superseded memory link", memory.l1Memories.find((item) => item.assetId === "T02-L1-TIMESERIES-DIFFERENCE-OLD")?.supersededBy === "T02-L1-TIMESERIES-DETREND-LINEAR");

const memoryRoutes = positive.filter((item) => item.gold.family === "memory").map((item) => item.gold.allowedSequences[0].join("->"));
check("memory route distribution", JSON.stringify(countBy(memoryRoutes, (item) => item)) === JSON.stringify({ tdai_atomic_query: 1, tdai_conversation_search: 2, tdai_memory_search: 2, tdai_read_scene: 1 }), countBy(memoryRoutes, (item) => item));
const skillRoutes = positive.filter((item) => item.gold.family === "skill").map((item) => item.gold.allowedSequences[0].join("->"));
check("skill route distribution", JSON.stringify(countBy(skillRoutes, (item) => item)) === JSON.stringify({ "skill_search->skill_view_by_id": 3, skill_view: 2, "skill_view->skill_files_read": 1 }), countBy(skillRoutes, (item) => item));
const knowledgeRoutes = positive.filter((item) => item.gold.family === "knowledge").map((item) => item.gold.allowedSequences[0].join("->"));
check("knowledge route distribution", knowledgeRoutes.length === 3 && knowledgeRoutes.every((item) => item === "knowledge_tools_list->knowledge_tools_call"), knowledgeRoutes);
const endpointByTool = { tdai_memory_search: "/memory-bridge/v3/atomic/search", tdai_atomic_query: "/memory-bridge/v3/atomic/query", tdai_conversation_search: "/memory-bridge/v3/conversation/search", tdai_read_scene: "/memory-bridge/v3/scenario/read", skill_search: "/skill-bridge/v3/skill/search", skill_view: "/skill-bridge/v3/skill/get-by-name", skill_view_by_id: "/skill-bridge/v3/skill/get", skill_files_read: "/skill-bridge/v3/skill/files/read", knowledge_tools_list: "/tools/list" };
const endpointErrors = [];
for (const item of positive) for (const action of [...item.gold.allowedFirstActions, ...(item.gold.expectedFollowupActions ?? [])]) if (endpointByTool[action.tool] !== action.endpoint) endpointErrors.push(`${item.caseId}:${action.tool}:${action.endpoint}`);
check("production endpoints", endpointErrors.length === 0, endpointErrors);

const agent = fragment.businessAgents[0];
check("skill counts", skillsFile.skills.length === 15 && agent.boundSkillIds.length === 5 && skillsFile.skills.filter((item) => !agent.boundSkillIds.includes(item.assetId)).length === 10, { total: skillsFile.skills.length, listed: agent.boundSkillIds.length });
check("knowledge count", knowledgeFile.knowledge.length === 3 && agent.fixedKnowledgeIds.length === 3, knowledgeFile.knowledge.length);
const stagedAssetIds = [...memory.l0Conversations, ...memory.l1Memories, ...memory.l2Scenes, ...memory.l3Profiles, ...skillsFile.skills, ...knowledgeFile.knowledge].map((asset) => asset.assetId).sort();
check("snapshot asset ids", JSON.stringify(fragment.snapshotAssetIds) === JSON.stringify(stagedAssetIds), fragment.snapshotAssetIds.length);
check("fragment Luna batch refs", fragment.generatorBatchRefs.length === 8 && fragment.generatorBatchRefs.every((batch) => batch.generatorModel === "gpt-5.6-luna" && batch.reasoningEffort === "high" && /^[a-f0-9]{64}$/.test(batch.draftSha256)), fragment.generatorBatchRefs);
check("fragment external imports", fragment.externalImports.length === 15 && fragment.externalImports.every((item) => item.assetId && item.repository.startsWith("https://github.com/") && /^[a-f0-9]{40}$/.test(item.commit) && /^[a-f0-9]{64}$/.test(item.rawSha256)), fragment.externalImports.length);
check("project/task counts", projectManifest.projects.length === 4 && fragment.tasks.length === 4, { projects: projectManifest.projects.length, tasks: fragment.tasks.length });

const pinsByName = new Map(inputPack.skill_source_pins.map((pin) => [pin.name, pin]));
const packageErrors = [];
for (const source of skillManifest.sources) {
  const pin = pinsByName.get(source.name);
  const packageDir = join(sourceDir, source.package_path);
  const metadata = readJson(join(packageDir, "metadata.json"));
  if (!pin || metadata.repository_url !== pin.repo || metadata.revision !== pin.revision || metadata.source_path !== pin.path || metadata.license_spdx !== pin.license) packageErrors.push(`${source.name}: pin mismatch`);
  if (!metadata.repository_url.startsWith("https://github.com/") || !/^[a-f0-9]{40}$/.test(metadata.revision)) packageErrors.push(`${source.name}: invalid repository/revision`);
  for (const file of metadata.raw_files) if (sha256(readFileSync(join(packageDir, "raw", ...file.path.split("/")))) !== file.sha256) packageErrors.push(`${source.name}: raw hash ${file.path}`);
  for (const file of metadata.adapted_files) if (sha256(readFileSync(join(packageDir, "adapted", ...file.path.split("/")))) !== file.sha256) packageErrors.push(`${source.name}: adapted hash ${file.path}`);
  if (!existsSync(join(packageDir, metadata.adaptation_diff)) || statSync(join(packageDir, metadata.adaptation_diff)).size === 0) packageErrors.push(`${source.name}: adaptation diff`);
  if (!existsSync(resolve(packageDir, metadata.license_file))) packageErrors.push(`${source.name}: license`);
}
check("GitHub Skill source packages", skillManifest.sources.length === 15 && packageErrors.length === 0, packageErrors);
const projectErrors = [];
for (const project of projectManifest.projects) {
  const packageDir = join(sourceDir, project.package_path);
  const metadata = readJson(join(packageDir, "metadata.json"));
  for (const file of metadata.files) if (sha256(readFileSync(join(packageDir, "raw", ...file.path.split("/")))) !== file.sha256) projectErrors.push(`${project.repo_slug}:${file.path}`);
  if (metadata.revision !== project.revision || metadata.file_manifest_sha256 !== project.file_manifest_sha256 || metadata.tree_sha256 !== project.tree_sha256) projectErrors.push(`${project.repo_slug}: manifest mismatch`);
}
check("GitHub project source packages", projectManifest.projects.length === 4 && projectErrors.length === 0, projectErrors);
check("frozen input pack", inputLock.frozen && sha256(readFileSync(join(scriptDir, inputLock.input_pack))) === inputLock.sha256, inputLock.sha256);
check("frozen source pack", sourceLock.frozen && sha256(readFileSync(join(sourceDir, "skill-sources.json"))) === sourceLock.skill_sources_sha256 && sha256(readFileSync(join(sourceDir, "project-sources.json"))) === sourceLock.project_sources_sha256, sourceLock);

const lunaSpecs = [
  ["asset-world/asset-world-batch-01", "t02-asset-world-batch-01", 33, "asset"],
  ["trials/memory-trial-01", "t02-memory-trial-01", 1, "pairs"],
  ["trials/skill-trial-01", "t02-skill-trial-01", 1, "pairs"],
  ["trials/knowledge-trial-01", "t02-knowledge-trial-01", 1, "pairs"],
  ["expansion/memory-batch-01", "t02-memory-expansion-batch-01", 5, "pairs"],
  ["expansion/skill-batch-01", "t02-skill-expansion-batch-01", 5, "pairs"],
  ["expansion/knowledge-batch-01", "t02-knowledge-expansion-batch-01", 2, "pairs"],
  ["expansion/natural-negative-batch-01", "t02-natural-negative-batch-01", 10, "cases"],
];
const lunaErrors = [];
for (const [directory, batchId, count, kind] of lunaSpecs) {
  const batchDir = join(scriptDir, directory);
  const manifest = readJson(join(batchDir, "manifest.json"));
  const draftBytes = readFileSync(join(batchDir, "draft.json"));
  const draft = JSON.parse(draftBytes.toString("utf8"));
  const actualCount = kind === "asset" ? draft.l0_sessions.length + draft.l1_memories.length + draft.l2_scenes.length + draft.l3_profiles.length + draft.knowledge_fixtures.length : draft[kind].length;
  if (manifest.batch_id !== batchId || manifest.generator_model !== "gpt-5.6-luna" || manifest.reasoning_effort !== "high" || manifest.fork_turns !== "none" || manifest.actual_count !== count || actualCount !== count) lunaErrors.push(`${batchId}: metadata/count`);
  if (kind === "asset") {
    if (sha256(draftBytes) !== "7673cfc3a7048aad3fddbc52e614eeca8868bc64e1a65ec9b3149871a14d5435") lunaErrors.push(`${batchId}: draft hash`);
  } else if (manifest.raw_output_sha256 !== sha256(draftBytes)) lunaErrors.push(`${batchId}: draft hash`);
  for (const name of ["draft.json", "manifest.json", "questions.md"]) if (!existsSync(join(batchDir, name))) lunaErrors.push(`${batchId}: missing ${name}`);
}
check("Luna batches", lunaErrors.length === 0, lunaErrors);
check("review present", existsSync(join(stagingDir, "review.md")) && statSync(join(stagingDir, "review.md")).size > 0);
check("build summary consistency", buildSummary.counts.cases === 40 && buildSummary.counts.pairs === 15 && buildSummary.counts.skills === 15 && buildSummary.counts.github_project_sources === 4, buildSummary.counts);

const gate = {
  schema_version: "task1.team_gate.v1",
  team_id: "T02",
  split: "dev",
  status: errors.length === 0 ? "pass" : "fail",
  launch_commit: launchCommit,
  branch: git("branch", "--show-current"),
  counts: buildSummary.counts,
  formal_validation: { valid: formalReport.valid, case_count: formalReport.case_count, team_case_count: formalReport.team_case_counts.T02, pair_count: formalReport.pair_count, team_pair_count: formalReport.pairs_by_team.T02, pair_integrity_error_count: formalReport.pair_integrity_error_count, provider_leakage_count: formalReport.provider_leakage_count, invalid_sequence_count: formalReport.invalid_sequence_count, missing_source_ref_count: formalReport.missing_source_ref_count, report: "../../../generators/parallel/build-01/T02/formal-validation-report.json" },
  luna_batches: lunaSpecs.map(([, batchId, count]) => ({ batch_id: batchId, count })),
  github_skill_source_count: skillManifest.sources.length,
  github_project_source_count: projectManifest.projects.length,
  checks,
  error_count: errors.length,
  errors,
  integration_issues: [
    "The global integrator must preserve the explicit formal decision -> runtime instruction mappings, especially the dated direct atomic-query target, when materializing production Memory fixtures.",
    "The global integrator must regenerate global snapshots and cross-Team hashes; this Team fragment intentionally does not write contract, snapshot, provider, or status files."
  ]
};
writeFileSync(join(stagingDir, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify(gate, null, 2));
if (errors.length > 0) process.exitCode = 1;
