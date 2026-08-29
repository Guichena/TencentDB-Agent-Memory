import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const benchRoot = resolve("MemoryProxy/eval/tool-prompt-bench");
const generatorRoot = resolve(benchRoot, "formal-dataset/generators/parallel/build-04/T07");
const stagingRoot = resolve(benchRoot, "formal-dataset/staging/teams/T07");
const contractPath = resolve(benchRoot, "formal-dataset/registry/contracts/formal-v1.json");
const outputPath = resolve(generatorRoot, "gate-contract.json");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value)), "utf8").digest("hex");
}

function withoutContentHash(value) {
  const { contentHash: _ignored, ...rest } = value;
  return rest;
}

function replaceTeamItems(current, additions, idOf, teamOf) {
  const additionIds = new Set(additions.map(idOf));
  return [...current.filter((item) => teamOf(item) !== "T07" && !additionIds.has(idOf(item))), ...additions];
}

const contract = JSON.parse(await readFile(contractPath, "utf8"));
const fragment = JSON.parse(await readFile(resolve(stagingRoot, "team-fragment.json"), "utf8"));
const memory = JSON.parse(await readFile(resolve(stagingRoot, "assets/memory.json"), "utf8"));
const skill = JSON.parse(await readFile(resolve(stagingRoot, "assets/skills.json"), "utf8"));
const knowledge = JSON.parse(await readFile(resolve(stagingRoot, "assets/knowledge.json"), "utf8"));

contract.sourceEvidence = replaceTeamItems(
  contract.sourceEvidence,
  fragment.sourceEvidence,
  (item) => item.sourceId,
  (item) => item.sourceId.startsWith("source-t07-") ? "T07" : undefined,
);
contract.teams = replaceTeamItems(contract.teams, fragment.teams, (item) => item.teamId, (item) => item.teamId);
contract.businessAgents = replaceTeamItems(contract.businessAgents, fragment.businessAgents, (item) => item.agentId, (item) => item.teamId);
contract.tasks = replaceTeamItems(contract.tasks, fragment.tasks, (item) => item.taskId, (item) => item.teamId);
contract.publicCases = replaceTeamItems(contract.publicCases, fragment.publicCases, (item) => item.caseId, (item) => item.identity.teamId);

const t07CaseIds = new Set(fragment.publicCases.map((item) => item.caseId));
contract.privateAnnotations = [
  ...contract.privateAnnotations.filter((item) => !t07CaseIds.has(item.caseId)),
  ...fragment.privateAnnotations,
];
const t07PairIds = new Set(fragment.pairs.map((item) => item.pairId));
contract.pairs = [...contract.pairs.filter((item) => !t07PairIds.has(item.pairId)), ...fragment.pairs];

for (const [key, additions] of Object.entries({
  l0Conversations: memory.l0Conversations,
  l1Memories: memory.l1Memories,
  l2Scenes: memory.l2Scenes,
  l3Profiles: memory.l3Profiles,
  skills: skill.skills,
  knowledge: knowledge.knowledge,
})) {
  const additionIds = new Set(additions.map((item) => item.assetId));
  contract.assets[key] = [...contract.assets[key].filter((item) => !additionIds.has(item.assetId)), ...additions];
}

const hiddenSnapshot = contract.snapshots.find((item) => item.split === "hidden_test");
if (!hiddenSnapshot) throw new Error("missing hidden_test snapshot");
const activeAgent = fragment.businessAgents.find((item) => item.agentId === "agent-task1-t07-general");
if (!activeAgent) throw new Error("missing T07 active agent");
const teamAgents = new Map(fragment.businessAgents.map((item) => [item.agentId, item]));
const t07Skills = skill.skills.filter((item) => teamAgents.has(item.ownerAgentId));
const t07Memory = [...memory.l0Conversations, ...memory.l1Memories, ...memory.l2Scenes, ...memory.l3Profiles];

function visibleAssets(agent) {
  const memoryOwners = new Set([agent.agentId, ...agent.importedMemoryAgentIds]);
  const visibleMemory = t07Memory.filter((item) => memoryOwners.has(item.ownerAgentId));
  const visibleSkills = t07Skills.filter((item) => item.ownerAgentId === agent.agentId || item.visibility === "team");
  const fixed = new Set(agent.fixedKnowledgeIds);
  const visibleKnowledge = knowledge.knowledge.filter((item) => fixed.has(item.assetId)
    && item.bindings.some((binding) => binding.agentId === agent.agentId && binding.visibility === "fixed"));
  return [...visibleMemory, ...visibleSkills, ...visibleKnowledge]
    .map((item) => item.assetId)
    .sort((left, right) => left.localeCompare(right));
}

const t07VisibleSets = fragment.businessAgents.map((agent) => {
  const assetIds = visibleAssets(agent);
  const value = { teamId: "T07", userId: "user-task1-t07-eval", agentId: agent.agentId, assetIds };
  return { ...value, sha256: hash(value) };
});
const activeVisibleSet = t07VisibleSets.find((item) => item.agentId === activeAgent.agentId);
if (!activeVisibleSet) throw new Error("missing active visible set");
if (JSON.stringify(activeVisibleSet.assetIds) !== JSON.stringify(
  [...fragment.snapshotAssetIds].sort((left, right) => left.localeCompare(right)),
)) {
  throw new Error("fragment snapshot assets do not match visibility resolver inputs");
}
for (const publicCase of fragment.publicCases) {
  if (publicCase.visibleAssetSetSha256 !== activeVisibleSet.sha256) {
    throw new Error(`public case ${publicCase.caseId} has a stale visible asset hash`);
  }
}
hiddenSnapshot.visibleAssetSets = [
  ...hiddenSnapshot.visibleAssetSets.filter((item) => item.teamId !== "T07"),
  ...t07VisibleSets,
];

contract.world.sourceEvidenceIds = contract.sourceEvidence.map((item) => item.sourceId);
contract.world.contentHash = hash(withoutContentHash(contract.world));
hiddenSnapshot.sourcePackSha256 = hash(contract.sourceEvidence);
hiddenSnapshot.workspaceManifestSha256 = hash(contract.tasks
  .filter((item) => item.teamId === "T07")
  .map((item) => ({ taskId: item.taskId, workspace: item.workspace })));
hiddenSnapshot.contentHash = hash(withoutContentHash(hiddenSnapshot));

await writeFile(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: "built",
  output: outputPath,
  t07Cases: fragment.publicCases.length,
  t07Pairs: fragment.pairs.length,
  t07Assets: fragment.snapshotAssetIds.length,
  visibleSets: t07VisibleSets.map((item) => ({ agentId: item.agentId, assets: item.assetIds.length })),
  sourcePackSha256: hiddenSnapshot.sourcePackSha256,
}, null, 2));
