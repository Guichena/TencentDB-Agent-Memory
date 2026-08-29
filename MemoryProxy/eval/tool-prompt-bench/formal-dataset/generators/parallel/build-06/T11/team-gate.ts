import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFormalWorldContract } from "../../../../../worlds/formal-schema.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
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
const expected = { cases: 40, pairs: 15, memoryPositive: 6, skillPositive: 6, knowledgePositive: 3, pairedNegative: 15, naturalNegative: 10 };
const errors = [...schema.errors];
for (const [key, value] of Object.entries(expected)) if ((counts as any)[key] !== value) errors.push(`${key}: expected ${value}, got ${(counts as any)[key]}`);
if (discovery !== 10) errors.push(`discovery positives: expected 10, got ${discovery}`);
if (leakage.length) errors.push(...leakage.map((item) => `provider leakage ${item}`));
if (duplicateQueries !== 15) errors.push(`pair query reuse count: expected 15 pair duplicates, got ${duplicateQueries}`);
for (const item of positives) {
  if (item.gold.allowedSequences.length !== 1 || item.gold.allowedSequences[0].length !== item.gold.maxTdaiCalls) errors.push(`${item.caseId}: incomplete or overlong sequence`);
  if (!fragment.snapshotAssetIds.includes(item.gold.targetAssetIds[0])) errors.push(`${item.caseId}: target not in visible assets`);
}
const gate = {
  schema_version: "task1.team_gate.v1", team_id: "T11", build_id: "build-06", status: errors.length ? "failed" : "passed",
  checked_at: new Date().toISOString(), counts, discovery_positive_count: discovery, schema_validation: schema, provider_leakage_count: leakage.length,
  duplicate_query_count_from_pairs: duplicateQueries, external_skill_source_count: fragment.externalImports.length,
  checks: ["formal schema", "fixed counts", "pair linkage", "complete minimal chain", "target visibility", "provider leakage", "discovery pressure", "external skill provenance"], errors,
};
await writeFile(path.join(staging, "gate.json"), JSON.stringify(gate, null, 2) + "\n");
console.log(JSON.stringify(gate, null, 2));
if (errors.length) process.exitCode = 1;
