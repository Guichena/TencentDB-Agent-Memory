import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = join(scriptDir, "..", "..", "..", "..");
const stagingDir = join(formalDir, "staging", "teams", "T01");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

const baseline = readJson(join(formalDir, "registry", "contracts", "formal-v1.json"));
const fragment = readJson(join(stagingDir, "team-fragment.json"));
const memory = readJson(join(stagingDir, "assets", "memory.json"));
const skills = readJson(join(stagingDir, "assets", "skills.json"));
const knowledge = readJson(join(stagingDir, "assets", "knowledge.json"));
const summary = readJson(join(scriptDir, "build-summary.json"));
const agentId = "agent-task1-t01-general";
const fragmentSourceIds = new Set(fragment.sourceEvidence.map((source) => source.sourceId));

const preview = structuredClone(baseline);
preview.sourceEvidence = [
  ...baseline.sourceEvidence.filter((source) => !fragmentSourceIds.has(source.sourceId)),
  ...fragment.sourceEvidence,
];
preview.teams = [...baseline.teams.filter((team) => team.teamId !== "T01"), ...fragment.teams];
preview.businessAgents = [...baseline.businessAgents.filter((agent) => agent.teamId !== "T01"), ...fragment.businessAgents];
preview.tasks = [...baseline.tasks.filter((task) => task.teamId !== "T01"), ...fragment.tasks];
preview.publicCases = [...baseline.publicCases.filter((item) => item.identity.teamId !== "T01"), ...fragment.publicCases];
const replacementCaseIds = new Set(fragment.publicCases.map((item) => item.caseId));
preview.privateAnnotations = [
  ...baseline.privateAnnotations.filter((item) => !item.caseId.startsWith("T01-") && !replacementCaseIds.has(item.caseId)),
  ...fragment.privateAnnotations,
];
preview.pairs = [...baseline.pairs.filter((pair) => !pair.pairId.startsWith("T01-")), ...fragment.pairs];
preview.assets = {
  l0Conversations: [...baseline.assets.l0Conversations.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l0Conversations],
  l1Memories: [...baseline.assets.l1Memories.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l1Memories],
  l2Scenes: [...baseline.assets.l2Scenes.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l2Scenes],
  l3Profiles: [...baseline.assets.l3Profiles.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l3Profiles],
  skills: [...baseline.assets.skills.filter((asset) => asset.ownerAgentId !== agentId), ...skills.skills],
  knowledge: [...baseline.assets.knowledge.filter((asset) => asset.ownerAgentId !== agentId), ...knowledge.knowledge],
};

const assetIds = [
  ...memory.l0Conversations,
  ...memory.l1Memories,
  ...memory.l2Scenes,
  ...memory.l3Profiles,
  ...skills.skills,
  ...knowledge.knowledge,
].map((asset) => asset.assetId).sort();
const devSnapshot = preview.snapshots.find((snapshot) => snapshot.snapshotId === "snapshot-task1-dev-v1");
const visible = devSnapshot.visibleAssetSets.find((set) => set.agentId === agentId);
visible.assetIds = assetIds;
visible.sha256 = summary.visible_asset_set_sha256;
devSnapshot.sourcePackSha256 = hash({ team: "T01", sources: fragment.sourceEvidence, assets: assetIds });
devSnapshot.contentHash = hash({ ...devSnapshot, contentHash: null });
preview.world.sourceEvidenceIds = preview.sourceEvidence.map((source) => source.sourceId).sort();
preview.world.contentHash = hash({ ...preview.world, contentHash: null });

writeFileSync(join(scriptDir, "validation-preview.json"), `${JSON.stringify(preview, null, 2)}\n`);
console.log(JSON.stringify({
  path: join(scriptDir, "validation-preview.json"),
  cases: preview.publicCases.length,
  pairs: preview.pairs.length,
  t01_assets: assetIds.length,
}, null, 2));
