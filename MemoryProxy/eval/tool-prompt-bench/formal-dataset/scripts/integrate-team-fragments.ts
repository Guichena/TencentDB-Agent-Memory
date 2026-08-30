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

interface TeamFragment {
  schema_version: "task1.team_fragment.v1";
  build_id: string;
  team_id: string;
  split: FormalSplit;
  sourceEvidence: SourceEvidence[];
  teams: FormalWorldContract["teams"];
  businessAgents: FormalWorldContract["businessAgents"];
  tasks: FormalWorldContract["tasks"];
  publicCases: FormalWorldContract["publicCases"];
  privateAnnotations: FormalWorldContract["privateAnnotations"];
  pairs: FormalWorldContract["pairs"];
  snapshotAssetIds: string[];
  generatorBatchRefs: string[];
  externalImports: unknown[];
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

interface TeamInput {
  fragment: TeamFragment;
  assets: FormalAssets;
}

const WORLD_ID = "world-task1-engineering";
const SPACE_ID = "space-task1-engineering";
const WORLD_AS_OF = "2026-08-30T23:59:59+08:00";
const SNAPSHOT_IDS: Readonly<Record<FormalSplit, string>> = {
  dev: "snapshot-task1-dev-v1",
  hidden_test: "snapshot-task1-hidden-v1",
};
const RUNTIME_POLICY = {
  allowLlmWrite: false as const,
  extraction: { enabled: false as const, extractors: [] as readonly [] },
  assetReflection: false as const,
  writeL0: false as const,
  archiveWriteBack: false as const,
};
const RESET_RECIPE = {
  version: "task1.formal-v1.reset.v1",
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
    "usage: tsx integrate-team-fragments.ts --teams T01,T02,... "
    + "[--contract registry/contracts/formal-v1.json] [--status draft|frozen]",
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

function countTeamCases(fragment: TeamFragment): void {
  const annotations = fragment.privateAnnotations;
  const positiveByFamily = (family: "memory" | "skill" | "knowledge") => annotations.filter(
    (item) => item.gold.needTdaiTool && item.gold.family === family,
  ).length;
  const pairedNegatives = annotations.filter((item) => item.pairRole === "negative").length;
  const naturalNegatives = annotations.filter((item) => !item.pairId).length;
  const discoveryTools = new Set([
    "knowledge_tools_list",
    "skill_search",
    "tdai_conversation_search",
    "tdai_memory_search",
    "tdai_scenario_ls",
  ]);
  const positiveAnnotations = annotations.filter((item) => item.gold.needTdaiTool);
  const discovery = positiveAnnotations.filter((item) =>
    item.gold.allowedFirstActions.some((action) => discoveryTools.has(action.tool)),
  ).length;
  const direct = positiveAnnotations.length - discovery;
  const actual = {
    cases: fragment.publicCases.length,
    annotations: annotations.length,
    pairs: fragment.pairs.length,
    memory: positiveByFamily("memory"),
    skill: positiveByFamily("skill"),
    knowledge: positiveByFamily("knowledge"),
    pairedNegatives,
    naturalNegatives,
    discovery,
    direct,
  };
  const expected = {
    cases: 40, annotations: 40, pairs: 15,
    memory: 6, skill: 6, knowledge: 3,
    pairedNegatives: 15, naturalNegatives: 10,
    discovery: 10, direct: 5,
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${fragment.team_id} count contract mismatch: ${JSON.stringify(actual)}`);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readTeamInput(root: string, teamId: string): Promise<TeamInput> {
  const teamRoot = resolve(root, "staging", "teams", teamId);
  const fragment = await readJson<TeamFragment>(resolve(teamRoot, "team-fragment.json"));
  if (fragment.schema_version !== "task1.team_fragment.v1") {
    throw new Error(`${teamId} has unsupported fragment schema ${fragment.schema_version}`);
  }
  if (fragment.team_id !== teamId) throw new Error(`${teamId} fragment identity mismatch`);
  if (fragment.teams.length !== 1 || fragment.teams[0].teamId !== teamId) {
    throw new Error(`${teamId} must contain exactly one matching Team`);
  }
  if (fragment.teams[0].split !== fragment.split) throw new Error(`${teamId} split mismatch`);
  countTeamCases(fragment);

  const memory = await readJson<MemoryAssetFile>(resolve(teamRoot, "assets", "memory.json"));
  const skill = await readJson<{ skills: FormalAssets["skills"] }>(resolve(teamRoot, "assets", "skills.json"));
  const knowledge = await readJson<{ knowledge: FormalAssets["knowledge"] }>(resolve(teamRoot, "assets", "knowledge.json"));
  const assets: FormalAssets = {
    l0Conversations: memory.l0Conversations ?? memory.l0_conversations ?? [],
    l1Memories: memory.l1Memories ?? memory.l1_memories ?? [],
    l2Scenes: memory.l2Scenes ?? memory.l2_scenes ?? [],
    l3Profiles: memory.l3Profiles ?? memory.l3_profiles ?? [],
    skills: skill.skills,
    knowledge: knowledge.knowledge,
  };
  const actualAssetIds = [
    ...assets.l0Conversations,
    ...assets.l1Memories,
    ...assets.l2Scenes,
    ...assets.l3Profiles,
    ...assets.skills,
    ...assets.knowledge,
  ].map((asset) => asset.assetId).sort();
  if (new Set(actualAssetIds).size !== actualAssetIds.length) {
    throw new Error(`${teamId} repeats an asset id`);
  }
  if (canonicalJson(actualAssetIds) !== canonicalJson([...fragment.snapshotAssetIds].sort())) {
    throw new Error(`${teamId} snapshotAssetIds do not match staged assets`);
  }
  return { fragment, assets };
}

function mergeSources(inputs: readonly TeamInput[]): SourceEvidence[] {
  const bySourceId = new Map<string, SourceEvidence>();
  for (const source of inputs.flatMap((input) => input.fragment.sourceEvidence)) {
    const prior = bySourceId.get(source.sourceId);
    if (prior && canonicalJson(prior) !== canonicalJson(source)) {
      throw new Error(`conflicting duplicate source ${source.sourceId}`);
    }
    bySourceId.set(source.sourceId, source);
  }
  return [...bySourceId.values()].map((source) => {
    const { contentHash: _contentHash, ...sourceCore } = source;
    void _contentHash;
    const normalized = { ...sourceCore, worldAsOf: WORLD_AS_OF };
    return { ...normalized, contentHash: canonicalSha256(normalized) } as SourceEvidence;
  }).sort(byId<SourceEvidence>("sourceId"));
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
  inputs: readonly TeamInput[],
  contractCore: Pick<FormalWorldContract, "businessAgents" | "tasks" | "assets" | "publicCases">,
): WorldSnapshot {
  const splitInputs = inputs.filter((input) => input.fragment.split === split);
  const splitTeamIds = new Set(splitInputs.map((input) => input.fragment.team_id));
  const splitAgents = contractCore.businessAgents.filter((agent) => splitTeamIds.has(agent.teamId));
  const casesByTeam = new Map<string, PublicCaseInput[]>();
  for (const item of contractCore.publicCases.filter((item) => splitTeamIds.has(item.identity.teamId))) {
    const group = casesByTeam.get(item.identity.teamId) ?? [];
    group.push(item);
    casesByTeam.set(item.identity.teamId, group);
  }
  const visibleAssetSets = splitAgents.map((agent) => {
    const teamCases = casesByTeam.get(agent.teamId) ?? [];
    if (teamCases.length === 0) throw new Error(`${agent.teamId} has no Case identity for snapshot construction`);
    const userIds = [...new Set(teamCases.map((item) => item.identity.userId))];
    if (userIds.length !== 1) throw new Error(`${agent.teamId} must use one frozen evaluation user`);
    const assetIds = visibleAssetIds(agent, contractCore.businessAgents, contractCore.assets);
    return {
      teamId: agent.teamId,
      userId: userIds[0],
      agentId: agent.agentId,
      assetIds,
      sha256: hashVisibleAssetSet({ teamId: agent.teamId, userId: userIds[0], agentId: agent.agentId, assetIds }),
    };
  }).sort((left, right) => left.agentId.localeCompare(right.agentId));

  for (const item of contractCore.publicCases.filter((candidate) => splitTeamIds.has(candidate.identity.teamId))) {
    const visible = visibleAssetSets.find((set) =>
      set.teamId === item.identity.teamId
      && set.userId === item.identity.userId
      && set.agentId === item.identity.agentId,
    );
    if (!visible || item.visibleAssetSetSha256 !== visible.sha256) {
      throw new Error(`${item.caseId} visible asset hash differs from rebuilt production visibility`);
    }
  }

  const splitTasks = contractCore.tasks.filter((task) => splitTeamIds.has(task.teamId));
  const sourcePackSha256 = canonicalSha256(splitInputs.map((input) => ({
    teamId: input.fragment.team_id,
    sourceEvidence: input.fragment.sourceEvidence,
    snapshotAssetIds: [...input.fragment.snapshotAssetIds].sort(),
  })));
  const snapshotCore = {
    snapshotId: SNAPSHOT_IDS[split],
    worldId: WORLD_ID,
    split,
    sourcePackSha256,
    visibleAssetSets,
    workspaceManifestSha256: canonicalSha256(splitTasks.map((task) => task.workspace).sort(byId("workspaceId"))),
    runtimePolicySha256: canonicalSha256(RUNTIME_POLICY),
    cacheResetRecipeSha256: canonicalSha256(RESET_RECIPE),
  };
  return { ...snapshotCore, contentHash: canonicalSha256(snapshotCore) };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const teamOption = option("--teams");
  const status = option("--status") ?? "draft";
  if (!teamOption || (status !== "draft" && status !== "frozen")) usage();
  const teamIds = [...new Set(teamOption.split(",").map((item) => item.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  if (teamIds.length === 0 || teamIds.some((teamId) => !/^T(?:0[1-9]|1[0-6])$/.test(teamId))) usage();

  const datasetRoot = resolve(import.meta.dirname, "..");
  const contractPath = resolve(datasetRoot, option("--contract") ?? "registry/contracts/formal-v1.json");
  const inputs = await Promise.all(teamIds.map((teamId) => readTeamInput(datasetRoot, teamId)));
  const sourceEvidence = mergeSources(inputs);
  const teams = inputs.flatMap((input) => input.fragment.teams).sort(byId("teamId"));
  const businessAgents = inputs.flatMap((input) => input.fragment.businessAgents).sort(byId("agentId"));
  const tasks = inputs.flatMap((input) => input.fragment.tasks).sort(byId("taskId"));
  const assets: FormalAssets = {
    l0Conversations: inputs.flatMap((input) => input.assets.l0Conversations).sort(byId("assetId")),
    l1Memories: inputs.flatMap((input) => input.assets.l1Memories).sort(byId("assetId")),
    l2Scenes: inputs.flatMap((input) => input.assets.l2Scenes).sort(byId("assetId")),
    l3Profiles: inputs.flatMap((input) => input.assets.l3Profiles).sort(byId("assetId")),
    skills: inputs.flatMap((input) => input.assets.skills).sort(byId("assetId")),
    knowledge: inputs.flatMap((input) => input.assets.knowledge).sort(byId("assetId")),
  };
  const publicCases = inputs.flatMap((input) => input.fragment.publicCases).sort(byId("caseId"));
  const privateAnnotations = inputs.flatMap((input) => input.fragment.privateAnnotations).sort(byId("caseId"));
  const pairs = inputs.flatMap((input) => input.fragment.pairs).sort(byId("pairId"));

  assertUnique(teams, "teamId", "Team");
  assertUnique(businessAgents, "agentId", "Business Agent");
  assertUnique(tasks, "taskId", "Task");
  assertUnique(publicCases, "caseId", "Case");
  assertUnique(privateAnnotations, "caseId", "private annotation");
  assertUnique(pairs, "pairId", "Pair");
  assertUnique([
    ...assets.l0Conversations,
    ...assets.l1Memories,
    ...assets.l2Scenes,
    ...assets.l3Profiles,
    ...assets.skills,
    ...assets.knowledge,
  ], "assetId", "Asset");

  const worldCore = {
    worldId: WORLD_ID,
    spaceId: SPACE_ID,
    status: status as "draft" | "frozen",
    worldAsOf: WORLD_AS_OF,
    teamIds: teams.map((team) => team.teamId),
    sourceEvidenceIds: sourceEvidence.map((source) => source.sourceId),
    snapshotIds: SNAPSHOT_IDS,
    leakageGroup: "task1-formal-v1",
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
    snapshots: [],
  };
  contract.snapshots = (["dev", "hidden_test"] as const).map((split) =>
    buildSnapshot(split, inputs, contract));
  assertFormalWorldContract(contract);
  await writeJson(contractPath, contract);
  console.log(JSON.stringify({
    contractPath,
    status,
    teams: teams.map((team) => team.teamId),
    counts: {
      teams: teams.length,
      cases: publicCases.length,
      pairs: pairs.length,
      devCases: publicCases.filter((item) => teams.find((team) => team.teamId === item.identity.teamId)?.split === "dev").length,
      hiddenCases: publicCases.filter((item) => teams.find((team) => team.teamId === item.identity.teamId)?.split === "hidden_test").length,
    },
    contractCanonicalSha256: canonicalSha256(contract),
  }, null, 2));
}

await main();
