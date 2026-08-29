import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFormalWorldContract } from "../../../../../worlds/formal-schema.ts";
import { canonicalSha256 } from "../../../../../worlds/formal-snapshot.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildRoot = path.resolve(here, "..");
const datasetRoot = path.resolve(here, "../../../..");
const staging = path.resolve(here, "../../../../staging/teams/T11");
const fragment = JSON.parse(await readFile(path.join(staging, "team-fragment.json"), "utf8"));
const memory = JSON.parse(await readFile(path.join(staging, "assets/memory.json"), "utf8"));
const skills = JSON.parse(await readFile(path.join(staging, "assets/skills.json"), "utf8"));
const knowledge = JSON.parse(await readFile(path.join(staging, "assets/knowledge.json"), "utf8"));
const H = "0".repeat(64);
const visibleSha = fragment.publicCases[0]?.visibleAssetSetSha256;
const contract: any = {
  schemaVersion: "task1.formal.v1",
  world: {
    worldId: "world-task1-engineering", spaceId: "space-task1-engineering", status: "draft",
    worldAsOf: "2026-08-30T23:59:59+08:00", teamIds: ["T11"], sourceEvidenceIds: fragment.sourceEvidence.map((item: any) => item.sourceId),
    snapshotIds: { dev: "snapshot-task1-dev-v1", hidden_test: "snapshot-task1-hidden-v1" }, leakageGroup: "task1-formal-v1",
    runtimePolicy: { allowLlmWrite: false, extraction: { enabled: false, extractors: [] }, assetReflection: false, writeL0: false, archiveWriteBack: false }, contentHash: H,
  },
  teams: fragment.teams, businessAgents: fragment.businessAgents, tasks: fragment.tasks,
  assets: { l0Conversations: memory.l0_conversations, l1Memories: memory.l1_memories, l2Scenes: memory.l2_scenes, l3Profiles: memory.l3_profiles, skills: skills.skills, knowledge: knowledge.knowledge },
  sourceEvidence: fragment.sourceEvidence, publicCases: fragment.publicCases, privateAnnotations: fragment.privateAnnotations, pairs: fragment.pairs,
  snapshots: [
    { snapshotId: "snapshot-task1-dev-v1", worldId: "world-task1-engineering", split: "dev", sourcePackSha256: H, visibleAssetSets: [{ teamId: "T11", userId: "user-task1-t11-eval", agentId: "agent-task1-t11-general", assetIds: fragment.snapshotAssetIds, sha256: visibleSha }], workspaceManifestSha256: H, runtimePolicySha256: H, cacheResetRecipeSha256: H, contentHash: H },
    { snapshotId: "snapshot-task1-hidden-v1", worldId: "world-task1-engineering", split: "hidden_test", sourcePackSha256: H, visibleAssetSets: [], workspaceManifestSha256: H, runtimePolicySha256: H, cacheResetRecipeSha256: H, contentHash: H },
  ],
};
const schema = validateFormalWorldContract(contract);
const annotations = fragment.privateAnnotations;
const positives = annotations.filter((item: any) => item.gold.needTdaiTool);
const negatives = annotations.filter((item: any) => !item.gold.needTdaiTool);
const counts = {
  cases: fragment.publicCases.length, pairs: fragment.pairs.length,
  memoryPositive: positives.filter((item: any) => item.gold.family === "memory").length,
  skillPositive: positives.filter((item: any) => item.gold.family === "skill").length,
  knowledgePositive: positives.filter((item: any) => item.gold.family === "knowledge").length,
  pairedNegative: negatives.filter((item: any) => item.pairId).length,
  naturalNegative: negatives.filter((item: any) => !item.pairId).length,
};
const discovery = positives.filter((item: any) => ["tdai_memory_search", "tdai_conversation_search", "tdai_scenario_ls", "skill_search", "knowledge_tools_list"].includes(item.gold.allowedFirstActions[0]?.tool)).length;
const leakagePatterns = [/target[_ ]?asset/i, /allowed[_ ]?sequence/i, /knowledge_tools_/i, /skill_view/i, /tdai_/i, /\/memory-bridge\//i, /\/skill-bridge\//i, /\/tools\/(?:list|call)/i];
const leakage: string[] = [];
for (const item of fragment.publicCases) {
  const visible = JSON.stringify({ contextMessages: item.contextMessages, query: item.query });
  for (const pattern of leakagePatterns) if (pattern.test(visible)) leakage.push(`${item.caseId}:${pattern}`);
}
const duplicateQueries = fragment.publicCases.length - new Set(fragment.publicCases.map((item: any) => item.query)).size;
const providerPayloads = fragment.publicCases.map((item: any) => canonicalSha256({ language: item.language, contextMessages: item.contextMessages, query: item.query }));
const duplicateProviderPayloads = providerPayloads.length - new Set(providerPayloads).size;
const expected = { cases: 40, pairs: 15, memoryPositive: 6, skillPositive: 6, knowledgePositive: 3, pairedNegative: 15, naturalNegative: 10 };
const errors = [...schema.errors];
function verifyContentHashes(value: any, location: string): void {
  if (Array.isArray(value)) return value.forEach((entry, index) => verifyContentHashes(entry, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  if (typeof value.contentHash === "string") {
    const { contentHash, ...core } = value;
    if (canonicalSha256(core) !== contentHash) errors.push(`${location}: contentHash mismatch`);
  }
  for (const [key, entry] of Object.entries(value)) if (key !== "contentHash") verifyContentHashes(entry, `${location}.${key}`);
}
verifyContentHashes(fragment, "fragment");
verifyContentHashes(memory, "memory");
verifyContentHashes(skills, "skills");
verifyContentHashes(knowledge, "knowledge");
for (const [key, value] of Object.entries(expected)) if ((counts as any)[key] !== value) errors.push(`${key}: expected ${value}, got ${(counts as any)[key]}`);
if (discovery !== 10) errors.push(`discovery positives: expected 10, got ${discovery}`);
if (leakage.length) errors.push(...leakage.map((item) => `provider leakage ${item}`));
if (duplicateQueries !== 15) errors.push(`pair query reuse count: expected 15 pair duplicates, got ${duplicateQueries}`);
if (duplicateProviderPayloads !== 0) errors.push(`duplicate provider payloads: expected 0, got ${duplicateProviderPayloads}`);
for (const item of positives) {
  if (item.gold.allowedSequences.length !== 1 || item.gold.allowedSequences[0].length !== item.gold.maxTdaiCalls) errors.push(`${item.caseId}: incomplete or overlong sequence`);
  if (!fragment.snapshotAssetIds.includes(item.gold.targetAssetIds[0])) errors.push(`${item.caseId}: target not in visible assets`);
  if (item.gold.family === "skill") {
    const target = skills.skills.find((skill: any) => skill.assetId === item.gold.targetAssetIds[0]);
    const first = item.gold.allowedFirstActions[0]?.tool;
    if (first === "skill_search" && (target?.visibility !== "team" || fragment.businessAgents[0].boundSkillIds.includes(target.assetId))) errors.push(`${item.caseId}: search target is listed or not team-visible`);
    if (first === "skill_view" && !fragment.businessAgents[0].boundSkillIds.includes(target?.assetId)) errors.push(`${item.caseId}: direct target is not listed`);
  }
}
const publicById = new Map(fragment.publicCases.map((item: any) => [item.caseId, item]));
for (const pair of fragment.pairs) {
  const positive: any = publicById.get(pair.positiveCaseId);
  const negative: any = publicById.get(pair.negativeCaseId);
  if (!positive || !negative) continue;
  const { sessionId: _positiveSession, ...positiveIdentity } = positive.identity;
  const { sessionId: _negativeSession, ...negativeIdentity } = negative.identity;
  if (canonicalSha256({ identity: positiveIdentity, snapshotId: positive.snapshotId, workspace: positive.workspace, language: positive.language, difficulty: positive.difficulty, query: positive.query, visibleAssetSetSha256: positive.visibleAssetSetSha256 }) !== canonicalSha256({ identity: negativeIdentity, snapshotId: negative.snapshotId, workspace: negative.workspace, language: negative.language, difficulty: negative.difficulty, query: negative.query, visibleAssetSetSha256: negative.visibleAssetSetSha256 })) errors.push(`${pair.pairId}: frozen pair fields differ`);
  const changed = positive.contextMessages.flatMap((message: any, index: number) => canonicalSha256(message) === canonicalSha256(negative.contextMessages[index]) ? [] : [index]);
  if (changed.length !== 1) errors.push(`${pair.pairId}: expected one context delta, got ${changed.length}`);
  else {
    const actual = createHash("sha256").update(JSON.stringify({ positive_delta_message: positive.contextMessages[changed[0]], negative_delta_message: negative.contextMessages[changed[0]], query: positive.query }), "utf8").digest("hex");
    if (actual !== pair.controlledDeltaSha256) errors.push(`${pair.pairId}: controlledDeltaSha256 mismatch`);
  }
}
for (const ref of fragment.generatorBatchRefs) {
  const batchDir = path.join(buildRoot, ...ref.split("/"));
  const manifest = JSON.parse(await readFile(path.join(batchDir, "manifest.json"), "utf8"));
  const draft = JSON.parse(await readFile(path.join(batchDir, "draft.json"), "utf8"));
  const count = Array.isArray(draft.pairs) ? draft.pairs.length : draft.cases.length;
  if (manifest.generator_model !== "gpt-5.6-luna" || manifest.reasoning_effort !== "high") errors.push(`${ref}: wrong generator model or effort`);
  if (manifest.actual_count !== count) errors.push(`${ref}: manifest count mismatch`);
}
const input = JSON.parse(await readFile(path.join(here, "input-pack.json"), "utf8"));
if (input.project_streams.length < 3 || input.project_streams.length > 6 || fragment.tasks.length !== input.project_streams.length) errors.push("project stream count or task coverage is outside 3..6");
const usedTaskIds = new Set(fragment.publicCases.map((item: any) => item.identity.taskId));
for (const task of fragment.tasks) if (!usedTaskIds.has(task.taskId)) errors.push(`${task.taskId}: project stream has no cases`);
for (const imported of fragment.externalImports) {
  const bytes = await readFile(path.join(datasetRoot, ...imported.storedPath.split("/")));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== imported.storedFileSha256) errors.push(`${imported.sourceId}: stored Skill hash mismatch`);
  const licenseBytes = await readFile(path.join(datasetRoot, ...imported.storedLicensePath.split("/")));
  const actualLicense = createHash("sha256").update(licenseBytes).digest("hex");
  if (actualLicense !== imported.licenseFileSha256) errors.push(`${imported.sourceId}: stored license hash mismatch`);
  const frozen = input.skill_sources.find((source: any) => `source-${source.source_id}` === imported.sourceId);
  if (!frozen || frozen.raw_sha256 !== imported.rawFileSha256 || frozen.revision !== imported.revision || frozen.license !== imported.license) errors.push(`${imported.sourceId}: frozen source metadata mismatch`);
  const skill = skills.skills.find((item: any) => item.sourceEvidenceIds.includes(imported.sourceId));
  if (!skill || skill.manifest[0]?.sha256 !== actual) errors.push(`${imported.sourceId}: formal Skill manifest hash mismatch`);
}
const gate = {
  schema_version: "task1.team_gate.v1", team_id: "T11", build_id: "build-06", status: errors.length ? "failed" : "passed",
  checked_at: new Date().toISOString(), counts, discovery_positive_count: discovery, schema_validation: schema, provider_leakage_count: leakage.length,
  duplicate_query_count_from_pairs: duplicateQueries, duplicate_provider_payload_count: duplicateProviderPayloads, project_stream_count: input.project_streams.length, external_skill_source_count: fragment.externalImports.length,
  checks: ["formal schema", "recursive content hashes", "fixed counts", "3..6 project streams and task coverage", "pair single-variable and controlled hash", "provider payload uniqueness", "complete minimal chain", "target visibility", "Skill listing visibility", "provider leakage", "discovery pressure", "accepted Luna manifests", "external skill provenance, stored Skill hashes, and license hashes"], errors,
};
await writeFile(path.join(staging, "gate.json"), JSON.stringify(gate, null, 2) + "\n");
console.log(JSON.stringify(gate, null, 2));
if (errors.length) process.exitCode = 1;
