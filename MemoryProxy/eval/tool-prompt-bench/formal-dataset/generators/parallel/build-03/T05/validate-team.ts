import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  toProviderVisibleCase,
  validateFormalWorldContract,
  type BusinessAgent,
  type FormalAssets,
  type FormalWorldContract,
  type VisibleAssetSet,
} from "../../../../../worlds/formal-schema.ts";

const ROOT = process.cwd();
const DATASET = join(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const GEN = join(DATASET, "generators/parallel/build-03/T05");
const SOURCE = join(DATASET, "source-material/T05");
const STAGING = join(DATASET, "staging/teams/T05");
const CONTRACT = join(DATASET, "registry/contracts/formal-v1.json");
const TEAM = "T05";
const USER_ID = "user-task1-t05";
const GENERAL = "agent-task1-t05-general";

const load = <T = any>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonical = (value: any): any => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const canonicalSha = (value: unknown) => sha(JSON.stringify(canonical(value)));
const errors: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) errors.push(message); };

const fragment = load(join(STAGING, "team-fragment.json"));
const memory = load(join(STAGING, "assets/memory.json"));
const skillAssets = load(join(STAGING, "assets/skills.json"));
const knowledgeAssets = load(join(STAGING, "assets/knowledge.json"));
const input = load(join(GEN, "input-pack.json"));
const sourceLock = load(join(SOURCE, "source-lock.json"));

check(fragment.schema_version === "task1.team_fragment.v1", "fragment schema version mismatch");
check(fragment.team_id === TEAM && fragment.split === "hidden_test", "fragment Team/split mismatch");
check(fragment.sourceEvidence.length === 26, "source evidence count must be 26");
check(fragment.teams.length === 1 && fragment.businessAgents.length === 3 && fragment.tasks.length === 5, "team/agent/task counts mismatch");
check(fragment.publicCases.length === 40 && fragment.privateAnnotations.length === 40, "case/annotation counts mismatch");
check(fragment.pairs.length === 15, "pair count mismatch");
check(memory.l0Conversations.length === 10 && memory.l1Memories.length === 16 && memory.l2Scenes.length === 4 && memory.l3Profiles.length === 1, "memory asset distribution mismatch");
check(skillAssets.skills.length === 16 && knowledgeAssets.knowledge.length === 3, "skill/knowledge asset counts mismatch");
check(fragment.externalImports.length === 16, "external import count mismatch");

const annotationByCase = new Map(fragment.privateAnnotations.map((item: any) => [item.caseId, item]));
const publicByCase = new Map(fragment.publicCases.map((item: any) => [item.caseId, item]));
const positives = fragment.privateAnnotations.filter((item: any) => item.gold.needTdaiTool);
const noTools = fragment.privateAnnotations.filter((item: any) => !item.gold.needTdaiTool);
const familyCount = (family: string) => positives.filter((item: any) => item.gold.family === family).length;
check(familyCount("memory") === 6 && familyCount("skill") === 6 && familyCount("knowledge") === 3, "positive family distribution mismatch");
check(noTools.length === 25, "no-tool count must be 25");
check(fragment.privateAnnotations.filter((item: any) => item.pairRole === "negative").length === 15, "paired negative count mismatch");
check(fragment.privateAnnotations.filter((item: any) => !item.pairId).length === 10, "natural negative count mismatch");

const firstTools = positives.map((item: any) => item.gold.allowedFirstActions[0]?.tool);
const discoveryTools = new Set(["tdai_conversation_search", "tdai_memory_search", "skill_search", "knowledge_tools_list"]);
check(firstTools.filter((tool: string) => discoveryTools.has(tool)).length === 10, "discovery/search-or-list positive count must be 10");
check(firstTools.filter((tool: string) => !discoveryTools.has(tool)).length === 5, "direct positive count must be 5");
const skillSequences = positives.filter((item: any) => item.gold.family === "skill").map((item: any) => item.gold.allowedSequences[0].join("->"));
check(skillSequences.filter((seq: string) => seq === "skill_view").length === 2, "skill direct-view count must be 2");
check(skillSequences.filter((seq: string) => seq === "skill_search->skill_view_by_id").length === 3, "skill search-view count must be 3");
check(skillSequences.filter((seq: string) => seq === "skill_view->skill_files_read").length === 1, "skill view-resource count must be 1");

const sessions = new Set<string>();
for (const publicCase of fragment.publicCases) {
  check(!sessions.has(publicCase.identity.sessionId), `${publicCase.caseId}: session is not fresh`);
  sessions.add(publicCase.identity.sessionId);
  const provider = toProviderVisibleCase(publicCase);
  check(Object.keys(provider).sort().join(",") === "caseId,contextMessages,language,query", `${publicCase.caseId}: provider allowlist shape mismatch`);
  const visibleText = `${provider.contextMessages.map((item: any) => item.content).join("\n")}\n${provider.query}`.toLowerCase();
  for (const token of input.provider_visible_constraints.forbidden_tokens) {
    check(!visibleText.includes(String(token).toLowerCase()), `${publicCase.caseId}: provider text contains forbidden token ${token}`);
  }
  check(!/t05-(?:l[0-3]|skill|knowledge|src)-/i.test(visibleText), `${publicCase.caseId}: provider text names an internal asset id`);
}

for (const pair of fragment.pairs) {
  const positive: any = publicByCase.get(pair.positiveCaseId);
  const negative: any = publicByCase.get(pair.negativeCaseId);
  const positiveAnnotation: any = annotationByCase.get(pair.positiveCaseId);
  const negativeAnnotation: any = annotationByCase.get(pair.negativeCaseId);
  check(Boolean(positive && negative && positiveAnnotation && negativeAnnotation), `${pair.pairId}: incomplete pair`);
  if (!positive || !negative) continue;
  check(positive.query === negative.query, `${pair.pairId}: query differs`);
  check(positive.snapshotId === negative.snapshotId, `${pair.pairId}: snapshot differs`);
  check(positive.workspace.contentHash === negative.workspace.contentHash, `${pair.pairId}: workspace differs`);
  for (const field of ["spaceId", "teamId", "userId", "agentId", "taskId", "agentSource"]) {
    check(positive.identity[field] === negative.identity[field], `${pair.pairId}: identity ${field} differs`);
  }
  check(positive.identity.sessionId !== negative.identity.sessionId, `${pair.pairId}: paired cases must use fresh sessions`);
  check(positive.contextMessages.length === negative.contextMessages.length, `${pair.pairId}: context length differs`);
  const changed = positive.contextMessages.map((item: any, index: number) => JSON.stringify(item) !== JSON.stringify(negative.contextMessages[index])).filter(Boolean).length;
  check(changed === 1, `${pair.pairId}: controlled context delta count is ${changed}, expected 1`);
  check(positiveAnnotation.gold.needTdaiTool === true && negativeAnnotation.gold.needTdaiTool === false, `${pair.pairId}: pair Gold polarity mismatch`);
}

const draftPaths = [
  "pilot-memory-01/draft.json", "expand-memory-01/draft.json",
  "pilot-skill-01/draft.json", "expand-skill-01/draft.json",
  "pilot-knowledge-01/draft.json", "expand-knowledge-01/draft.json",
];
const draftPairs = draftPaths.flatMap((path) => load(join(GEN, path)).pairs);
for (const draft of draftPairs) {
  const distractors = draft.visible_distractor_ids_author_only;
  const target = draft.positive.private_proposal.target_asset_ids[0];
  check(Array.isArray(distractors) && distractors.length >= 2 && new Set(distractors).size === distractors.length, `${draft.draft_pair_id}: needs two distinct distractors`);
  check(!distractors.includes(target), `${draft.draft_pair_id}: target repeats as distractor`);
}

const splitFrontmatter = (text: string) => {
  const normalized = text.replaceAll("\r\n", "\n");
  const match = normalized.match(/^---\n[\s\S]*?\n---\n/);
  return match ? normalized.slice(match[0].length) : normalized;
};
for (const locked of sourceLock.skills) {
  const rawPath = join(SOURCE, locked.local_raw_path);
  const adaptedPath = join(SOURCE, "adapted", locked.asset_id, "SKILL.md");
  const raw = readFileSync(rawPath);
  const adapted = readFileSync(adaptedPath);
  check(sha(raw) === locked.raw_file_sha256, `${locked.asset_id}: raw SHA mismatch`);
  check(splitFrontmatter(raw.toString("utf8")) === splitFrontmatter(adapted.toString("utf8")), `${locked.asset_id}: technical body changed`);
  check(Boolean(locked.license_spdx && locked.license_sha256), `${locked.asset_id}: license metadata missing`);
  const imported = fragment.externalImports.find((item: any) => item.asset_id === locked.asset_id);
  check(Boolean(imported), `${locked.asset_id}: external import missing`);
  if (imported) {
    check(imported.raw_sha256 === sha(raw) && imported.adapted_sha256 === sha(adapted), `${locked.asset_id}: import hashes mismatch`);
    check(imported.diff_sha256 === sha(readFileSync(join(SOURCE, "diffs", `${locked.asset_id}.diff`))), `${locked.asset_id}: diff hash mismatch`);
  }
  for (const resource of locked.resources ?? []) {
    const relativeResource = resource.path.split("/references/").at(-1);
    const rawResource = readFileSync(join(SOURCE, resource.local_raw_path));
    const adaptedResource = readFileSync(join(SOURCE, "adapted", locked.asset_id, "references", relativeResource));
    check(sha(rawResource) === resource.raw_file_sha256 && sha(rawResource) === sha(adaptedResource), `${locked.asset_id}: resource is not byte-exact`);
  }
}

const base = load<FormalWorldContract>(CONTRACT);
const oldAgentTeam = new Map(base.businessAgents.map((item) => [item.agentId, item.teamId]));
const stagedAssets: FormalAssets = {
  l0Conversations: memory.l0Conversations,
  l1Memories: memory.l1Memories,
  l2Scenes: memory.l2Scenes,
  l3Profiles: memory.l3Profiles,
  skills: skillAssets.skills,
  knowledge: knowledgeAssets.knowledge,
};
const removeTeamAssets = <T extends { ownerAgentId: string }>(items: T[]) => items.filter((item) => oldAgentTeam.get(item.ownerAgentId) !== TEAM);
const removedCaseIds = new Set(base.publicCases.filter((item) => item.identity.teamId === TEAM).map((item) => item.caseId));
const merged: FormalWorldContract = {
  ...base,
  sourceEvidence: [...base.sourceEvidence, ...fragment.sourceEvidence.filter((candidate: any) => !base.sourceEvidence.some((item) => item.sourceId === candidate.sourceId))],
  teams: [...base.teams.filter((item) => item.teamId !== TEAM), ...fragment.teams],
  businessAgents: [...base.businessAgents.filter((item) => item.teamId !== TEAM), ...fragment.businessAgents],
  tasks: [...base.tasks.filter((item) => item.teamId !== TEAM), ...fragment.tasks],
  assets: {
    l0Conversations: [...removeTeamAssets(base.assets.l0Conversations), ...stagedAssets.l0Conversations],
    l1Memories: [...removeTeamAssets(base.assets.l1Memories), ...stagedAssets.l1Memories],
    l2Scenes: [...removeTeamAssets(base.assets.l2Scenes), ...stagedAssets.l2Scenes],
    l3Profiles: [...removeTeamAssets(base.assets.l3Profiles), ...stagedAssets.l3Profiles],
    skills: [...removeTeamAssets(base.assets.skills), ...stagedAssets.skills],
    knowledge: [...removeTeamAssets(base.assets.knowledge), ...stagedAssets.knowledge],
  },
  publicCases: [...base.publicCases.filter((item) => item.identity.teamId !== TEAM), ...fragment.publicCases],
  privateAnnotations: [...base.privateAnnotations.filter((item) => !removedCaseIds.has(item.caseId)), ...fragment.privateAnnotations],
  pairs: [...base.pairs.filter((item) => !removedCaseIds.has(item.positiveCaseId) && !removedCaseIds.has(item.negativeCaseId)), ...fragment.pairs],
  snapshots: structuredClone(base.snapshots),
};

const allMemory = [...stagedAssets.l0Conversations, ...stagedAssets.l1Memories, ...stagedAssets.l2Scenes, ...stagedAssets.l3Profiles];
const teamSkills = stagedAssets.skills;
const visibleSetFor = (agent: BusinessAgent): VisibleAssetSet => {
  const memoryIds = allMemory.filter((asset) => asset.ownerAgentId === agent.agentId || agent.importedMemoryAgentIds.includes(asset.ownerAgentId)).map((asset) => asset.assetId);
  const skillIds = teamSkills.filter((asset) => asset.ownerAgentId === agent.agentId || asset.visibility === "team").map((asset) => asset.assetId);
  const knowledgeIds = stagedAssets.knowledge.filter((asset) => asset.bindings.some((binding) => binding.agentId === agent.agentId)).map((asset) => asset.assetId);
  const assetIds = [...memoryIds, ...skillIds, ...knowledgeIds].sort();
  return { teamId: TEAM, userId: USER_ID, agentId: agent.agentId, assetIds, sha256: canonicalSha({ teamId: TEAM, userId: USER_ID, agentId: agent.agentId, assetIds }) };
};
const teamAgents = fragment.businessAgents as BusinessAgent[];
const visibleSets = teamAgents.map(visibleSetFor);
const hiddenSnapshot = merged.snapshots.find((item) => item.snapshotId === merged.world.snapshotIds.hidden_test);
check(Boolean(hiddenSnapshot), "hidden snapshot missing");
if (hiddenSnapshot) hiddenSnapshot.visibleAssetSets = [...hiddenSnapshot.visibleAssetSets.filter((item) => item.teamId !== TEAM), ...visibleSets];
const generalVisible = visibleSets.find((item) => item.agentId === GENERAL);
check(Boolean(generalVisible), "general visible set missing");
check(generalVisible?.assetIds.length === fragment.snapshotAssetIds.length && generalVisible.assetIds.every((id, index) => id === fragment.snapshotAssetIds[index]), "snapshotAssetIds do not equal general-agent visible assets");
for (const publicCase of fragment.publicCases) check(publicCase.visibleAssetSetSha256 === generalVisible?.sha256, `${publicCase.caseId}: visible asset hash mismatch`);

const formal = validateFormalWorldContract(merged);
errors.push(...formal.errors.map((item) => `formal schema: ${item}`));

const batchValidator = join(DATASET, "generators/DS02/T01/validate-luna-batch.mjs");
const batchSpecs: Array<[string, string, number]> = [
  ["pilot-memory-01", "memory", 1], ["pilot-skill-01", "skill", 1], ["pilot-knowledge-01", "knowledge", 1],
  ["expand-memory-01", "memory", 5], ["expand-skill-01", "skill", 5], ["expand-knowledge-01", "knowledge", 2],
  ["natural-negatives-01", "natural-negative", 10],
];
const batchValidation = batchSpecs.map(([dir, family, count]) => {
  const run = spawnSync(process.execPath, [batchValidator, join(GEN, dir), family, String(count), TEAM, "DS05"], { cwd: ROOT, encoding: "utf8" });
  let report: any;
  try { report = JSON.parse(run.stdout); } catch { report = { valid: false, errors: [run.stderr || run.stdout || "validator emitted no JSON"] }; }
  check(run.status === 0 && report.valid, `${dir}: Luna batch validator failed`);
  return { batch_dir: dir, family, expected_count: count, valid: Boolean(report.valid), raw_output_sha256: report.raw_output_sha256, errors: report.errors ?? [] };
});

const valid = errors.length === 0;
const gate = {
  schema_version: "task1.team_gate.v1",
  team_id: TEAM,
  build_id: "build-03",
  status: valid ? "passed" : "failed",
  counts: { cases: 40, pairs: 15, memory_positive: 6, skill_positive: 6, knowledge_positive: 3, paired_negative: 15, natural_negative: 10, l0: 10, l1: 16, l2: 4, l3: 1, skills: 16, knowledge: 3, external_imports: 16 },
  batch_validations: batchValidation,
  checks: {
    sol_review: "passed",
    luna_batch_format: batchValidation.every((item) => item.valid) ? "passed" : "failed",
    formal_schema: formal.valid ? "passed" : "failed",
    quantity: errors.some((item) => item.includes("count")) ? "failed" : "passed",
    source_freeze: errors.some((item) => /source|sha|license|technical body|resource/i.test(item)) ? "failed" : "passed",
    provider_leakage: errors.some((item) => item.includes("provider")) ? "failed" : "passed",
    visibility: errors.some((item) => /visible|visibility/i.test(item)) ? "failed" : "passed",
    pair_single_delta: errors.some((item) => /pair|delta|query differs|context/i.test(item)) ? "failed" : "passed",
    fresh_sessions: errors.some((item) => item.includes("session")) ? "failed" : "passed",
    distractors: errors.some((item) => item.includes("distractor")) ? "failed" : "passed",
    search_direct_distribution: errors.some((item) => /direct|discovery|search-view|view-resource/.test(item)) ? "failed" : "passed",
  },
  integration_preview: { base_contract: "formal-v1.json", base_contract_sha256: sha(readFileSync(CONTRACT)), formal_validation_error_count: formal.errors.length },
  blocking_issues: errors,
};
writeFileSync(join(STAGING, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
console.log(JSON.stringify(gate, null, 2));
if (!valid) process.exit(1);
