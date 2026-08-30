import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  assertFormalWorldContract,
  type BusinessAgent,
  type FormalAssets,
  type FormalSplit,
  type FormalWorldContract,
  type PublicCaseInput,
  type SourceEvidence,
  type WorldSnapshot,
} from "../../worlds/formal-schema.js";
import { hashVisibleAssetSet } from "../../worlds/formal-compile.js";
import { canonicalJson, canonicalSha256 } from "../../worlds/formal-snapshot.js";

interface AdditionFragment {
  schema_version: "task1.team_fragment.v1" | "task1.team_fragment.v2";
  team_id?: string;
  sourceEvidence: SourceEvidence[];
  teams: FormalWorldContract["teams"];
  businessAgents: FormalWorldContract["businessAgents"];
  tasks: FormalWorldContract["tasks"];
  assets?: FormalAssets;
  publicCases: FormalWorldContract["publicCases"];
  privateAnnotations: FormalWorldContract["privateAnnotations"];
  pairs: FormalWorldContract["pairs"];
}

interface MemoryAssetFile {
  l0Conversations?: FormalAssets["l0Conversations"];
  l1Memories?: FormalAssets["l1Memories"];
  l2Scenes?: FormalAssets["l2Scenes"];
  l3Profiles?: FormalAssets["l3Profiles"];
  l0_conversations?: FormalAssets["l0Conversations"];
  l1_memories?: FormalAssets["l1Memories"];
  l2_scenes?: FormalAssets["l2Scenes"];
  l3_profiles?: FormalAssets["l3Profiles"];
}

interface AdditionInput {
  teamId: string;
  fragment: AdditionFragment;
  assets: FormalAssets;
}

const WORLD_ID = "world-task1-formal-v2";
const SPACE_ID = "space-task1-engineering";
const WORLD_AS_OF = "2026-08-31T23:59:59+08:00";
const SNAPSHOT_IDS: Readonly<Record<FormalSplit, string>> = {
  dev: "snapshot-task1-dev-v2",
  hidden_test: "snapshot-task1-hidden-v2",
};
const RUNTIME_POLICY = {
  allowLlmWrite: false as const,
  extraction: { enabled: false as const, extractors: [] as readonly [] },
  assetReflection: false as const,
  writeL0: false as const,
  archiveWriteBack: false as const,
};
const RESET_RECIPE = {
  version: "task1.formal-v2.reset.v1",
  resetSnapshotBeforeCase: true,
  freshSessionPerCase: true,
  preservePromptCachePrefix: true,
};

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error(
    "usage: tsx integrate-formal-v2.ts --base-contract registry/contracts/formal-v1.json "
    + "--teams T17,T18,T19,T20 --contract registry/contracts/formal-v2.json [--status draft|frozen]",
  );
  process.exit(2);
}

function byId<T>(key: keyof T): (left: T, right: T) => number {
  return (left, right) => String(left[key]).localeCompare(String(right[key]));
}

function assertUnique<T>(items: readonly T[], key: keyof T, label: string): void {
  const ids = items.map((item) => String(item[key]));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} ids are not globally unique`);
}

function rehash<T extends { contentHash: string }>(value: T): T {
  const { contentHash: _contentHash, ...core } = value;
  void _contentHash;
  return { ...core, contentHash: canonicalSha256(core) } as T;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function countTeamCases(teamId: string, fragment: AdditionFragment): void {
  const positives = fragment.privateAnnotations.filter((item) => item.gold.needTdaiTool);
  const discoveryTools = new Set([
    "knowledge_tools_list", "skill_search", "tdai_conversation_search",
    "tdai_memory_search", "tdai_scenario_ls",
  ]);
  const actual = {
    cases: fragment.publicCases.length,
    annotations: fragment.privateAnnotations.length,
    pairs: fragment.pairs.length,
    memory: positives.filter((item) => item.gold.family === "memory").length,
    skill: positives.filter((item) => item.gold.family === "skill").length,
    knowledge: positives.filter((item) => item.gold.family === "knowledge").length,
    pairedNegatives: fragment.privateAnnotations.filter((item) => item.pairRole === "negative").length,
    naturalNegatives: fragment.privateAnnotations.filter((item) => !item.pairId).length,
    discovery: positives.filter((item) =>
      item.gold.allowedFirstActions.some((action) => discoveryTools.has(action.tool))).length,
    direct: positives.filter((item) =>
      !item.gold.allowedFirstActions.some((action) => discoveryTools.has(action.tool))).length,
  };
  const expected = {
    cases: 40, annotations: 40, pairs: 15,
    memory: 6, skill: 6, knowledge: 3,
    pairedNegatives: 15, naturalNegatives: 10,
    discovery: 10, direct: 5,
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${teamId} count contract mismatch: ${JSON.stringify(actual)}`);
  }
}

async function readAddition(datasetRoot: string, teamId: string): Promise<AdditionInput> {
  const teamRoot = resolve(datasetRoot, "staging", "teams", teamId);
  const fragment = await readJson<AdditionFragment>(resolve(teamRoot, "team-fragment.json"));
  if (!fragment.schema_version.startsWith("task1.team_fragment.v")) {
    throw new Error(`${teamId} has unsupported fragment schema ${fragment.schema_version}`);
  }
  if (fragment.teams.length !== 1 || fragment.teams[0].teamId !== teamId) {
    throw new Error(`${teamId} must contain exactly one matching Team`);
  }
  if (fragment.team_id && fragment.team_id !== teamId) throw new Error(`${teamId} fragment identity mismatch`);
  countTeamCases(teamId, fragment);

  let assets = fragment.assets;
  if (!assets) {
    const memory = await readJson<MemoryAssetFile>(resolve(teamRoot, "assets", "memory.json"));
    const skill = await readJson<{ skills: FormalAssets["skills"] }>(resolve(teamRoot, "assets", "skills.json"));
    const knowledge = await readJson<{ knowledge: FormalAssets["knowledge"] }>(resolve(teamRoot, "assets", "knowledge.json"));
    assets = {
      l0Conversations: memory.l0Conversations ?? memory.l0_conversations ?? [],
      l1Memories: memory.l1Memories ?? memory.l1_memories ?? [],
      l2Scenes: memory.l2Scenes ?? memory.l2_scenes ?? [],
      l3Profiles: memory.l3Profiles ?? memory.l3_profiles ?? [],
      skills: skill.skills,
      knowledge: knowledge.knowledge,
    };
  }
  assertUnique([
    ...assets.l0Conversations,
    ...assets.l1Memories,
    ...assets.l2Scenes,
    ...assets.l3Profiles,
    ...assets.skills,
    ...assets.knowledge,
  ], "assetId", `${teamId} Asset`);
  return { teamId, fragment, assets };
}

function mergeUnique<T>(base: readonly T[], additions: readonly T[], key: keyof T, label: string): T[] {
  const values = [...base, ...additions].sort(byId<T>(key));
  assertUnique(values, key, label);
  return values;
}

function visibleAssetIds(
  agent: BusinessAgent,
  agents: readonly BusinessAgent[],
  assets: FormalAssets,
): string[] {
  const agentsById = new Map(agents.map((item) => [item.agentId, item]));
  const memoryOwners = new Set([agent.agentId, ...agent.importedMemoryAgentIds]);
  const memories = [
    ...assets.l0Conversations,
    ...assets.l1Memories,
    ...assets.l2Scenes,
    ...assets.l3Profiles,
  ].filter((asset) => memoryOwners.has(asset.ownerAgentId));
  const skills = assets.skills.filter((skill) => {
    const owner = agentsById.get(skill.ownerAgentId);
    return skill.ownerAgentId === agent.agentId
      || (skill.visibility === "team" && owner?.teamId === agent.teamId);
  });
  const knowledge = assets.knowledge.filter((asset) =>
    asset.bindings.some((binding) => binding.agentId === agent.agentId && binding.visibility === "fixed"),
  );
  return [...new Set([...memories, ...skills, ...knowledge].map((asset) => asset.assetId))]
    .sort((left, right) => left.localeCompare(right));
}

function buildSnapshot(
  split: FormalSplit,
  contract: Pick<FormalWorldContract, "sourceEvidence" | "teams" | "businessAgents" | "tasks" | "assets" | "publicCases">,
): WorldSnapshot {
  const splitTeams = contract.teams.filter((team) => team.split === split);
  const splitTeamIds = new Set(splitTeams.map((team) => team.teamId));
  const splitCases = contract.publicCases.filter((item) => splitTeamIds.has(item.identity.teamId));
  const splitAgents = contract.businessAgents.filter((agent) => splitTeamIds.has(agent.teamId));
  const visibleAssetSets = splitAgents.map((agent) => {
    const teamCases = splitCases.filter((item) => item.identity.teamId === agent.teamId);
    const userIds = [...new Set(teamCases.map((item) => item.identity.userId))];
    if (userIds.length !== 1) throw new Error(`${agent.teamId} must use one frozen evaluation user`);
    const assetIds = visibleAssetIds(agent, contract.businessAgents, contract.assets);
    return {
      teamId: agent.teamId,
      userId: userIds[0],
      agentId: agent.agentId,
      assetIds,
      sha256: hashVisibleAssetSet({ teamId: agent.teamId, userId: userIds[0], agentId: agent.agentId, assetIds }),
    };
  }).sort((left, right) => left.agentId.localeCompare(right.agentId));
  const snapshotCore = {
    snapshotId: SNAPSHOT_IDS[split],
    worldId: WORLD_ID,
    split,
    sourcePackSha256: canonicalSha256({
      split,
      teamIds: [...splitTeamIds].sort(),
      sourceEvidence: [...contract.sourceEvidence].sort(byId("sourceId")),
    }),
    visibleAssetSets,
    workspaceManifestSha256: canonicalSha256(contract.tasks
      .filter((task) => splitTeamIds.has(task.teamId))
      .map((task) => task.workspace)
      .sort(byId("workspaceId"))),
    runtimePolicySha256: canonicalSha256(RUNTIME_POLICY),
    cacheResetRecipeSha256: canonicalSha256(RESET_RECIPE),
  };
  return { ...snapshotCore, contentHash: canonicalSha256(snapshotCore) };
}

function normalizePublicCases(
  publicCases: readonly PublicCaseInput[],
  teams: FormalWorldContract["teams"],
  snapshots: readonly WorldSnapshot[],
): PublicCaseInput[] {
  const splitByTeam = new Map(teams.map((team) => [team.teamId, team.split]));
  const visible = new Map(snapshots.flatMap((snapshot) => snapshot.visibleAssetSets.map((set) => [
    `${snapshot.split}\0${set.userId}\0${set.agentId}`,
    set,
  ] as const)));
  return publicCases.map((item) => {
    const split = splitByTeam.get(item.identity.teamId);
    if (!split) throw new Error(`${item.caseId} references an unknown Team`);
    const set = visible.get(`${split}\0${item.identity.userId}\0${item.identity.agentId}`);
    if (!set || set.teamId !== item.identity.teamId) {
      throw new Error(`${item.caseId} has no rebuilt visible asset set`);
    }
    return rehash({
      ...item,
      snapshotId: SNAPSHOT_IDS[split],
      visibleAssetSetSha256: set.sha256,
    });
  }).sort(byId("caseId"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const baseOption = option("--base-contract");
  const contractOption = option("--contract");
  const teamOption = option("--teams");
  const status = option("--status") ?? "draft";
  if (!baseOption || !contractOption || !teamOption || (status !== "draft" && status !== "frozen")) usage();
  const teamIds = [...new Set(teamOption.split(",").map((item) => item.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  if (canonicalJson(teamIds) !== canonicalJson(["T17", "T18", "T19", "T20"])) usage();

  const datasetRoot = resolve(import.meta.dirname, "..");
  const base = await readJson<FormalWorldContract>(resolve(datasetRoot, baseOption));
  assertFormalWorldContract(base);
  const additions = await Promise.all(teamIds.map((teamId) => readAddition(datasetRoot, teamId)));

  const sourceEvidence = mergeUnique(
    base.sourceEvidence,
    additions.flatMap((input) => input.fragment.sourceEvidence),
    "sourceId",
    "Source",
  ).map((source) => rehash({ ...source, worldAsOf: WORLD_AS_OF }));
  const teams = mergeUnique(
    base.teams,
    additions.flatMap((input) => input.fragment.teams),
    "teamId",
    "Team",
  ).map((team) => rehash({ ...team, worldId: WORLD_ID }));
  const businessAgents = mergeUnique(
    base.businessAgents,
    additions.flatMap((input) => input.fragment.businessAgents),
    "agentId",
    "Business Agent",
  );
  const tasks = mergeUnique(base.tasks, additions.flatMap((input) => input.fragment.tasks), "taskId", "Task");
  const assets: FormalAssets = {
    l0Conversations: mergeUnique(base.assets.l0Conversations, additions.flatMap((input) => input.assets.l0Conversations), "assetId", "L0 Asset"),
    l1Memories: mergeUnique(base.assets.l1Memories, additions.flatMap((input) => input.assets.l1Memories), "assetId", "L1 Asset"),
    l2Scenes: mergeUnique(base.assets.l2Scenes, additions.flatMap((input) => input.assets.l2Scenes), "assetId", "L2 Asset"),
    l3Profiles: mergeUnique(base.assets.l3Profiles, additions.flatMap((input) => input.assets.l3Profiles), "assetId", "L3 Asset"),
    skills: mergeUnique(base.assets.skills, additions.flatMap((input) => input.assets.skills), "assetId", "Skill Asset"),
    knowledge: mergeUnique(base.assets.knowledge, additions.flatMap((input) => input.assets.knowledge), "assetId", "Knowledge Asset"),
  };
  const rawPublicCases = mergeUnique(
    base.publicCases,
    additions.flatMap((input) => input.fragment.publicCases),
    "caseId",
    "Case",
  );
  const privateAnnotations = mergeUnique(
    base.privateAnnotations,
    additions.flatMap((input) => input.fragment.privateAnnotations),
    "caseId",
    "private annotation",
  );
  const pairs = mergeUnique(base.pairs, additions.flatMap((input) => input.fragment.pairs), "pairId", "Pair");

  const snapshotInput = { sourceEvidence, teams, businessAgents, tasks, assets, publicCases: rawPublicCases };
  const snapshots = (["dev", "hidden_test"] as const).map((split) => buildSnapshot(split, snapshotInput));
  const publicCases = normalizePublicCases(rawPublicCases, teams, snapshots);
  const worldCore = {
    worldId: WORLD_ID,
    spaceId: SPACE_ID,
    status: status as "draft" | "frozen",
    worldAsOf: WORLD_AS_OF,
    teamIds: teams.map((team) => team.teamId),
    sourceEvidenceIds: sourceEvidence.map((source) => source.sourceId),
    snapshotIds: SNAPSHOT_IDS,
    leakageGroup: "task1-formal-v2",
    runtimePolicy: RUNTIME_POLICY,
  };
  const contract: FormalWorldContract = {
    world: { ...worldCore, contentHash: canonicalSha256(worldCore) },
    sourceEvidence,
    teams,
    businessAgents,
    tasks,
    assets,
    publicCases,
    privateAnnotations,
    pairs,
    snapshots,
  };
  assertFormalWorldContract(contract);
  const contractPath = resolve(datasetRoot, contractOption);
  await writeJson(contractPath, contract);
  console.log(JSON.stringify({
    contractPath,
    baseContract: resolve(datasetRoot, baseOption),
    status,
    addedTeams: teamIds,
    counts: {
      teams: teams.length,
      cases: publicCases.length,
      pairs: pairs.length,
      devCases: publicCases.filter((item) =>
        teams.find((team) => team.teamId === item.identity.teamId)?.split === "dev").length,
      hiddenCases: publicCases.filter((item) =>
        teams.find((team) => team.teamId === item.identity.teamId)?.split === "hidden_test").length,
    },
    contractCanonicalSha256: canonicalSha256(contract),
  }, null, 2));
}

await main();
