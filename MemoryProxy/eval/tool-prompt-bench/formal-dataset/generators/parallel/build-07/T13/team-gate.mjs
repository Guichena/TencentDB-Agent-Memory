import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const generatorRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-07/T13");
const sourceRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T13");
const stagingRoot = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T13");
const validator = join(repoRoot, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/DS02/T01/validate-luna-batch.mjs");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const digest = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest("hex");
const hashFile = (path) => digest(readFileSync(path));
const errors = [];
const checks = [];
const check = (name, condition, detail) => {
  const passed = Boolean(condition);
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
};
const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const verifyHash = (label, value) => {
  if (!value || typeof value !== "object" || typeof value.contentHash !== "string") {
    check(`${label}.contentHash`, false, "missing contentHash");
    return;
  }
  const copy = { ...value };
  delete copy.contentHash;
  check(`${label}.contentHash`, digest(copy) === value.contentHash, "contentHash must match canonical object without contentHash");
};

for (const relativePath of ["team-fragment.json", "assets/memory.json", "assets/skills.json", "assets/knowledge.json", "review.md"]) {
  check(`required:${relativePath}`, existsSync(join(stagingRoot, relativePath)), "required staging artifact must exist");
}
if (errors.length > 0) throw new Error(errors.join("\n"));

const fragment = readJson(join(stagingRoot, "team-fragment.json"));
const memory = readJson(join(stagingRoot, "assets/memory.json"));
const skill = readJson(join(stagingRoot, "assets/skills.json"));
const knowledge = readJson(join(stagingRoot, "assets/knowledge.json"));
const input = readJson(join(generatorRoot, "input-pack.json"));
const freeze = readJson(join(sourceRoot, "source-freeze.json"));
const adapted = readJson(join(sourceRoot, "adapted-source-manifest.json"));

check("fragment.identity", fragment.schema_version === "task1.team_fragment.v1" && fragment.build_id === "build-07" && fragment.team_id === "T13" && fragment.split === "hidden_test", "team fragment identity and split must be frozen");
check("case.total", fragment.publicCases.length === 40 && fragment.privateAnnotations.length === 40, "expected 40 public cases and 40 private annotations");
check("pair.total", fragment.pairs.length === 15, "expected 15 formal pairs");
const annotations = new Map(fragment.privateAnnotations.map((item) => [item.caseId, item]));
const cases = new Map(fragment.publicCases.map((item) => [item.caseId, item]));
const positive = fragment.privateAnnotations.filter((item) => item.gold.needTdaiTool);
const noTool = fragment.privateAnnotations.filter((item) => !item.gold.needTdaiTool);
check("category.memory_positive", positive.filter((item) => item.gold.family === "memory").length === 6, "expected six Memory Positive cases");
check("category.skill_positive", positive.filter((item) => item.gold.family === "skill").length === 6, "expected six Skill Positive cases");
check("category.knowledge_positive", positive.filter((item) => item.gold.family === "knowledge").length === 3, "expected three Knowledge Positive cases");
check("category.paired_negative", fragment.privateAnnotations.filter((item) => item.pairRole === "negative" && !item.gold.needTdaiTool).length === 15, "expected fifteen paired No-tool Negative cases");
check("category.natural_negative", fragment.publicCases.filter((item) => /^T13-COD-/.test(item.caseId)).length === 10, "expected ten natural Coding Negative cases");
check("category.no_tool_total", noTool.length === 25, "expected twenty-five no-tool cases");

for (const pair of fragment.pairs) {
  const p = cases.get(pair.positiveCaseId);
  const n = cases.get(pair.negativeCaseId);
  const pa = annotations.get(pair.positiveCaseId);
  const na = annotations.get(pair.negativeCaseId);
  check(`pair:${pair.pairId}:exists`, Boolean(p && n && pa && na), "both public cases and private annotations must exist");
  if (!p || !n || !pa || !na) continue;
  check(`pair:${pair.pairId}:identity`, equal(p.identity, n.identity) && p.snapshotId === n.snapshotId && equal(p.workspace, n.workspace), "pair identity, snapshot and workspace must match exactly");
  check(`pair:${pair.pairId}:query`, p.query === n.query, "pair query must be identical");
  const samePrefix = p.contextMessages.length === n.contextMessages.length
    && p.contextMessages.slice(0, -1).every((message, index) => equal(message, n.contextMessages[index]));
  const oneDelta = samePrefix && p.contextMessages.at(-1)?.role === n.contextMessages.at(-1)?.role && p.contextMessages.at(-1)?.content !== n.contextMessages.at(-1)?.content;
  check(`pair:${pair.pairId}:single_variable`, oneDelta, "only the appended delta message may differ");
  check(`pair:${pair.pairId}:roles`, pa.pairRole === "positive" && na.pairRole === "negative" && pa.pairId === pair.pairId && na.pairId === pair.pairId, "pair annotations must preserve roles");
  check(`pair:${pair.pairId}:gold`, pa.gold.needTdaiTool && !na.gold.needTdaiTool, "Positive must need a tool and paired Negative must not");
  check(`pair:${pair.pairId}:delta_hash`, /^[0-9a-f]{64}$/.test(pair.controlledDeltaSha256), "controlled delta hash must be sha256");
}

const visible = new Set(fragment.snapshotAssetIds);
check("snapshot.asset_ids_unique", visible.size === fragment.snapshotAssetIds.length, "snapshot asset ids must be unique");
for (const annotation of positive) {
  check(`visibility:${annotation.caseId}`, annotation.gold.targetAssetIds.length > 0 && annotation.gold.targetAssetIds.every((assetId) => visible.has(assetId)), "every Gold target must be visible in the team snapshot");
  const shortest = Math.min(...annotation.gold.allowedSequences.map((sequence) => sequence.length));
  check(`gold:${annotation.caseId}:minimal`, annotation.gold.maxTdaiCalls === shortest, "maxTdaiCalls must equal the shortest complete allowed sequence");
  check(`gold:${annotation.caseId}:complete`, annotation.gold.allowedFirstActions.length > 0 && annotation.gold.allowedSequences.length > 0 && annotation.gold.informationGap && annotation.gold.stopAfter && annotation.gold.ablationEvidence, "positive Gold must include first action, sequence, gap, stop point and ablation evidence");
  for (const sequence of annotation.gold.allowedSequences) {
    check(`gold:${annotation.caseId}:first_action`, sequence[0] === annotation.gold.allowedFirstActions[0].tool, "allowed sequence must start with allowedFirstActions");
    const followups = annotation.gold.expectedFollowupActions ?? [];
    if (followups.length > 0) check(`gold:${annotation.caseId}:followups`, equal(sequence.slice(1), followups.map((item) => item.tool)), "follow-up actions must match sequence");
    if (annotation.gold.family === "knowledge") check(`gold:${annotation.caseId}:knowledge_followup`, (annotation.gold.expectedKnowledgeCalls?.length ?? 0) === sequence.length - 1, "Knowledge follow-up expectations must cover every /tools/call");
  }
}
for (const annotation of noTool) {
  check(`gold:${annotation.caseId}:no_tool`, annotation.gold.family === null && annotation.gold.allowedFirstActions.length === 0 && annotation.gold.allowedSequences.length === 0 && annotation.gold.maxTdaiCalls === 0 && annotation.gold.targetAssetIds.length === 0 && Boolean(annotation.gold.noToolEvidence), "no-tool Gold must be complete and empty of tool actions");
}

const discoveryKeys = new Set([
  ...input.memory_case_routes.filter((item) => item.search_or_discovery).map((item) => item.case_key),
  ...input.skill_case_routes.filter((item) => item.sequence[0] === "skill_search").map((item) => item.case_key),
  ...input.knowledge_case_routes.map((item) => item.case_key),
]);
check("gold.discovery_distribution", discoveryKeys.size === 10, "frozen routes must contain ten search/discovery Positive cases");
check("gold.direct_distribution", positive.length - discoveryKeys.size === 5, "remaining five Positive cases must be direct calls");
const routeEndpoints = new Set(positive.flatMap((item) => [
  ...item.gold.allowedFirstActions.map((action) => action.endpoint),
  ...(item.gold.expectedFollowupActions ?? []).map((action) => action.endpoint),
]));
for (const endpoint of [
  "/memory-bridge/v3/atomic/search", "/memory-bridge/v3/atomic/query", "/memory-bridge/v3/conversation/search", "/memory-bridge/v3/conversation/query", "/memory-bridge/v3/scenario/read",
  "/skill-bridge/v3/skill/search", "/skill-bridge/v3/skill/get-by-name", "/skill-bridge/v3/skill/get", "/skill-bridge/v3/skill/files/read", "/tools/list",
]) check(`route.endpoint:${endpoint}`, routeEndpoints.has(endpoint), "production route endpoint must be represented by frozen Gold");

check("assets.memory.counts", memory.l0Conversations.length === 10 && memory.l1Memories.length === 16 && memory.l2Scenes.length === 5 && memory.l3Profiles.length === 1, "Memory asset counts must be 10/16/5/1");
check("assets.memory.l0_depth", memory.l0Conversations.every((item) => item.messages.length >= 12 && item.messages.length <= 20), "every L0 conversation must contain 12-20 messages");
check("assets.memory.injection", memory.injectionContract.l0Injected === false && memory.injectionContract.l1Injected === false && memory.injectionContract.l2PathAndSummaryInjected === true && memory.injectionContract.l3ContentInjected === true, "injection boundary must match production");
check("assets.memory.l2_complete", memory.l2Scenes.every((item) => item.path && item.summary && item.content && item.supportingSessionIds.length > 0), "every L2 scene must have path, hidden full content and supporting session");
const l0Text = (assetId) => memory.l0Conversations.find((item) => item.assetId === assetId)?.messages.map((item) => item.content).join("\n") ?? "";
const l1Text = (assetId) => memory.l1Memories.find((item) => item.assetId === assetId)?.content ?? "";
const l2Item = (assetId) => memory.l2Scenes.find((item) => item.assetId === assetId);
check("memory.closure.mem001", ["5 分钟", "14", "1 小时", "2", "3%"].every((term) => l1Text("T13-L1-003").includes(term)), "MEM001 target L1 must contain the complete decision");
check("memory.closure.mem002", ["order_id", "traceparent", "20%", "100%"].every((term) => l0Text("T13-L0-003").includes(term)), "MEM002 target L0 must contain the complete linkage and sampling decision");
check("memory.closure.mem003", ["30 秒", "2 分钟", "10 分钟", "3 次", "人工队列"].every((term) => l0Text("T13-L0-004").includes(term)), "MEM003 target L0 must contain the complete retry boundary");
check("memory.closure.mem004", ["10%", "8", "50 万", "5%"].every((term) => l1Text("T13-L1-010").includes(term)), "MEM004 target L1 must contain the complete profiling decision");
check("memory.closure.mem005", ["15%", "5 分钟", "70%", "1%"].every((term) => l1Text("T13-L1-013").includes(term)), "MEM005 target L1 must contain the complete migration decision");
check("memory.closure.mem006", l2Item("T13-L2-005")?.path === "incidents/sentrygrid/noise-budget-review.md" && ["12 分钟", "每小时 3 次", "incident commander"].every((term) => l2Item("T13-L2-005")?.content.includes(term)) && !["12 分钟", "每小时 3 次"].some((term) => l2Item("T13-L2-005")?.summary.includes(term)), "MEM006 L2 must hide facts from summary but expose them through read_scene content");

check("assets.skill.count", skill.skills.length === 16, "expected sixteen Skill assets");
check("assets.skill.listing", skill.listingEvidence.listedAssetIds.length === 6 && skill.searchFixtures.length === 3, "native listing must contain six own Skills and three Positive routes must require discovery");
check("assets.skill.real_distractors", skill.searchFixtures.every((item) => item.visibleDistractorIds.length >= 3 && item.visibleDistractorIds.every((assetId) => visible.has(assetId))), "every search route must retain at least three real visible Skill distractors");
check("source.freeze.repo", freeze.repository_url === "https://github.com/grafana/skills" && freeze.commit_sha === "51d33e71e191b409bbd25fc7be2684c610d18166" && freeze.license === "Apache-2.0", "Skill repository, commit and license must remain frozen");
for (const item of freeze.sources) {
  const rawPath = join(sourceRoot, item.local_path);
  check(`source.raw:${item.source_id}`, existsSync(rawPath) && hashFile(rawPath) === item.raw_file_sha256, "raw source file must match frozen sha256");
}
for (const item of [...adapted.adaptations, ...adapted.resources]) {
  const rawPath = join(sourceRoot, item.raw_path);
  const adaptedPath = join(sourceRoot, item.adapted_path);
  check(`source.adapted:${item.source_id}`, existsSync(rawPath) && existsSync(adaptedPath) && hashFile(rawPath) === hashFile(adaptedPath) && item.body_transform === "byte_identical", "adapted technical body must be byte-identical to frozen raw source");
}

check("assets.knowledge.count", knowledge.knowledge.length === 3 && knowledge.toolLists.length === 3, "expected three ready Knowledge resources and tool lists");
check("assets.knowledge.binding", knowledge.knowledge.every((item) => item.bindings.some((binding) => binding.agentId === input.identity.active_agent_id && binding.visibility === "fixed")), "every Knowledge asset must be fixed-bound to the active agent");
check("assets.knowledge.fixtures", knowledge.toolLists.every((item) => item.fixedTools.length > 0 && item.queryFixtures.length > 0), "every Knowledge resource must expose fixed tools and a target fixture");

const providerKeys = ["caseId", "contextMessages", "language", "query"];
const providerLeak = /\btdai_[a-z_]+\b|\bskill_(?:search|view|view_by_id|files_read)\b|\bknowledge_tools_(?:list|call)\b|\bT13-(?:L0|L1|L2|L3|SKILL|KNOW)-[A-Z0-9:-]+\b|\bGold\b|\btargetAssetIds?\b|\bexpectedFollowupActions?\b|\bpairId\b|\binformationGap\b/i;
for (const item of fragment.publicCases) {
  const provider = { caseId: item.caseId, language: item.language, contextMessages: item.contextMessages, query: item.query };
  check(`provider:${item.caseId}:shape`, equal(Object.keys(provider).sort(), providerKeys), "provider object must contain only the four safe fields");
  check(`provider:${item.caseId}:leakage`, !providerLeak.test(JSON.stringify(provider)), "provider-visible text must not contain tool, asset, pair or Gold internals");
}
const l3Visible = memory.l3Profiles.map((item) => item.content).join("\n");
const l2Visible = memory.l2Scenes.map((item) => `${item.path}\n${item.summary}`).join("\n");
check("injection.answer_not_in_l3", !["burn rate 超过 14", "order_id 并透传 traceparent", "固定 10% 采样", "保留 15%", "静默窗口上限为 12 分钟"].some((answer) => l3Visible.includes(answer)), "L3 injection must not reveal Positive answers");
check("injection.answer_not_in_l2_summary", !["order_id 并透传 traceparent", "30 秒、2 分钟、10 分钟", "固定 10% 采样", "保留 15%", "静默窗口上限为 12 分钟"].some((answer) => l2Visible.includes(answer)), "L2 path+summary injection must not reveal Positive answers");

const batchValidation = [];
for (const ref of fragment.generatorBatchRefs) {
  const expectedCount = ref.family === "natural-negative" ? 10 : ref.directory.includes("pilot-") ? 1 : ref.family === "knowledge" ? 2 : 5;
  try {
    const output = execFileSync(process.execPath, [validator, join(repoRoot, ref.directory), ref.family, String(expectedCount), "T13", "DS05"], { cwd: repoRoot, encoding: "utf8" });
    const result = JSON.parse(output);
    batchValidation.push({ batchId: ref.batchId, valid: result.valid, count: result.actual_count, sha256: result.raw_output_sha256 });
    check(`batch:${ref.batchId}`, result.valid && result.actual_count === expectedCount, "Luna batch validator must pass at its frozen expected count");
  } catch (error) {
    batchValidation.push({ batchId: ref.batchId, valid: false, error: String(error) });
    check(`batch:${ref.batchId}`, false, "Luna batch validator execution failed");
  }
}
check("batch.model", fragment.generatorBatchRefs.length === 7 && fragment.generatorBatchRefs.every((ref) => {
  const manifest = readJson(join(repoRoot, ref.directory, "manifest.json"));
  return manifest.generator_model === "gpt-5.6-luna" && manifest.reasoning_effort === "high";
}), "all seven batch manifests must record gpt-5.6-luna/high");

for (const [index, value] of fragment.sourceEvidence.entries()) verifyHash(`sourceEvidence[${index}]`, value);
for (const [index, value] of fragment.teams.entries()) verifyHash(`teams[${index}]`, value);
for (const [index, value] of fragment.businessAgents.entries()) {
  verifyHash(`businessAgents[${index}]`, value);
  verifyHash(`businessAgents[${index}].agentDetail`, value.agentDetail);
}
for (const [index, value] of fragment.tasks.entries()) {
  verifyHash(`tasks[${index}]`, value);
  verifyHash(`tasks[${index}].projectRef`, value.projectRef);
  verifyHash(`tasks[${index}].workspace`, value.workspace);
}
for (const [index, value] of fragment.publicCases.entries()) {
  verifyHash(`publicCases[${index}]`, value);
  verifyHash(`publicCases[${index}].workspace`, value.workspace);
}
for (const [index, value] of fragment.privateAnnotations.entries()) {
  verifyHash(`privateAnnotations[${index}]`, value);
  verifyHash(`privateAnnotations[${index}].gold`, value.gold);
}
for (const [index, value] of fragment.pairs.entries()) verifyHash(`pairs[${index}]`, value);
for (const [kind, values] of [["l0", memory.l0Conversations], ["l1", memory.l1Memories], ["l2", memory.l2Scenes], ["l3", memory.l3Profiles], ["skill", skill.skills], ["knowledge", knowledge.knowledge]]) {
  for (const [index, value] of values.entries()) {
    verifyHash(`assets.${kind}[${index}]`, value);
    if (kind === "l0") for (const [messageIndex, message] of value.messages.entries()) verifyHash(`assets.${kind}[${index}].messages[${messageIndex}]`, message);
  }
}

const buckets = { short: 0, medium: 0, long: 0 };
for (const item of fragment.publicCases) {
  if (item.contextMessages.length <= 5) buckets.short += 1;
  else if (item.contextMessages.length <= 10) buckets.medium += 1;
  else buckets.long += 1;
}
check("context.distribution", buckets.short > 0 && buckets.medium > 0 && buckets.long > 0, "final Team must contain short, medium and long contexts");
const queryCounts = new Map();
for (const item of fragment.publicCases) queryCounts.set(item.query, (queryCounts.get(item.query) ?? 0) + 1);
check("query.duplicate_policy", [...queryCounts.values()].every((count) => count <= 2) && [...queryCounts.values()].filter((count) => count === 2).length === 15, "only the fifteen controlled pairs may share a query");

const branch = execFileSync("git", ["branch", "--show-current"], { cwd: repoRoot, encoding: "utf8" }).trim();
const launch = execFileSync("git", ["rev-parse", "task1-data-parallel-launch-16team-v1^{commit}"], { cwd: repoRoot, encoding: "utf8" }).trim();
const schema = execFileSync("git", ["rev-parse", "task1-data-parallel-baseline-v2^{commit}"], { cwd: repoRoot, encoding: "utf8" }).trim();
check("git.branch", branch === "codex/task1-data-build-16team-t13-t14", "must remain on the dedicated task branch");
check("git.schema_baseline", schema === "1048681880b51e7a52a6b8b0b731eadeec44e118", "schema tag must resolve to the frozen commit");
for (const ancestor of [schema, "960021e472456515a89d3c2c4f2962fbf6cc51a1"]) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, "HEAD"], { cwd: repoRoot, stdio: "ignore" });
    check(`git.ancestor:${ancestor.slice(0, 8)}`, true, "baseline must remain an ancestor of HEAD");
  } catch {
    check(`git.ancestor:${ancestor.slice(0, 8)}`, false, "baseline is not an ancestor of HEAD");
  }
}
check("git.launch_resolved", /^[0-9a-f]{40}$/.test(launch), "launch tag must remain resolvable");
const statusLines = execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: repoRoot, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const allowedPrefixes = [
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-07/T13/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T13/",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T13/",
];
const statusPaths = statusLines.map((line) => line.slice(3).replaceAll("\\", "/").replace(/^"|"$/g, ""));
check("git.write_scope", statusPaths.every((path) => allowedPrefixes.some((prefix) => path.startsWith(prefix))), "all changed paths must remain inside the three T13 write roots");

const report = {
  schema_version: "task1.team_gate.v1",
  team_id: "T13",
  build_id: "build-07",
  passed: errors.length === 0,
  checked_by: "sol-build-07",
  counts: {
    total_cases: fragment.publicCases.length,
    memory_positive: positive.filter((item) => item.gold.family === "memory").length,
    skill_positive: positive.filter((item) => item.gold.family === "skill").length,
    knowledge_positive: positive.filter((item) => item.gold.family === "knowledge").length,
    paired_no_tool_negative: fragment.privateAnnotations.filter((item) => item.pairRole === "negative").length,
    natural_coding_negative: fragment.publicCases.filter((item) => /^T13-COD-/.test(item.caseId)).length,
    pairs: fragment.pairs.length,
    search_or_discovery_positive: discoveryKeys.size,
    direct_positive: positive.length - discoveryKeys.size,
  },
  context_buckets: buckets,
  gold_chain_distribution: Object.fromEntries([...new Set(positive.flatMap((item) => item.gold.allowedSequences.map((sequence) => sequence.join(" -> "))))].sort().map((sequence) => [sequence, positive.filter((item) => item.gold.allowedSequences.some((candidate) => candidate.join(" -> ") === sequence)).length])),
  luna_batches: batchValidation,
  source_repository: { url: freeze.repository_url, commit: freeze.commit_sha, license: freeze.license, skill_files: 16, resource_files: 1, body_transform: "byte_identical" },
  checks,
  errors,
};
writeFileSync(join(stagingRoot, "gate.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ team: "T13", passed: report.passed, errors: errors.length, checks: checks.length, counts: report.counts, context_buckets: buckets }, null, 2));
process.exit(report.passed ? 0 : 1);
