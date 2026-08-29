import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = join(scriptDir, "..", "..", "..", "..");
const stagingDir = join(formalDir, "staging", "teams", "T02");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

const preview = readJson(join(scriptDir, "..", "T01", "validation-preview.json"));
const fragment = readJson(join(stagingDir, "team-fragment.json"));
const memory = readJson(join(stagingDir, "assets", "memory.json"));
const skills = readJson(join(stagingDir, "assets", "skills.json"));
const knowledge = readJson(join(stagingDir, "assets", "knowledge.json"));
const summary = readJson(join(scriptDir, "build-summary.json"));
const agentId = "agent-task1-t02-general";
const replacementSourceIds = new Set(fragment.sourceEvidence.map((source) => source.sourceId));

preview.sourceEvidence = [...preview.sourceEvidence.filter((source) => !replacementSourceIds.has(source.sourceId)), ...fragment.sourceEvidence];
preview.teams = [...preview.teams.filter((team) => team.teamId !== "T02"), ...fragment.teams];
preview.businessAgents = [...preview.businessAgents.filter((agent) => agent.teamId !== "T02"), ...fragment.businessAgents];
preview.tasks = [...preview.tasks.filter((task) => task.teamId !== "T02"), ...fragment.tasks];
preview.publicCases = [...preview.publicCases.filter((item) => item.identity.teamId !== "T02"), ...fragment.publicCases];
const replacementCaseIds = new Set(fragment.publicCases.map((item) => item.caseId));
preview.privateAnnotations = [...preview.privateAnnotations.filter((item) => !item.caseId.startsWith("T02-") && !replacementCaseIds.has(item.caseId)), ...fragment.privateAnnotations];
preview.pairs = [...preview.pairs.filter((pair) => !pair.pairId.startsWith("T02-")), ...fragment.pairs];
preview.assets = {
  l0Conversations: [...preview.assets.l0Conversations.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l0Conversations],
  l1Memories: [...preview.assets.l1Memories.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l1Memories],
  l2Scenes: [...preview.assets.l2Scenes.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l2Scenes],
  l3Profiles: [...preview.assets.l3Profiles.filter((asset) => asset.ownerAgentId !== agentId), ...memory.l3Profiles],
  skills: [...preview.assets.skills.filter((asset) => asset.ownerAgentId !== agentId), ...skills.skills],
  knowledge: [...preview.assets.knowledge.filter((asset) => asset.ownerAgentId !== agentId), ...knowledge.knowledge],
};

const assetIds = [...memory.l0Conversations, ...memory.l1Memories, ...memory.l2Scenes, ...memory.l3Profiles, ...skills.skills, ...knowledge.knowledge]
  .map((asset) => asset.assetId).sort((left, right) => left.localeCompare(right));
const devSnapshot = preview.snapshots.find((snapshot) => snapshot.snapshotId === "snapshot-task1-dev-v1");
const visible = devSnapshot.visibleAssetSets.find((set) => set.agentId === agentId);
if (!visible) throw new Error(`missing visible set for ${agentId}`);
visible.assetIds = assetIds;
visible.sha256 = summary.visible_asset_set_sha256;
devSnapshot.sourcePackSha256 = hash({ teams: ["T01", "T02"], sourceEvidence: preview.sourceEvidence.map((source) => source.sourceId).sort(), assets: preview.assets });
devSnapshot.contentHash = hash({ ...devSnapshot, contentHash: null });
preview.world.sourceEvidenceIds = preview.sourceEvidence.map((source) => source.sourceId).sort();
preview.world.contentHash = hash({ ...preview.world, contentHash: null });

writeFileSync(join(scriptDir, "validation-preview.json"), `${JSON.stringify(preview, null, 2)}\n`);
console.log(JSON.stringify({ path: join(scriptDir, "validation-preview.json"), cases: preview.publicCases.length, pairs: preview.pairs.length, t02_assets: assetIds.length }, null, 2));
