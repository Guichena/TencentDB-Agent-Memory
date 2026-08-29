import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertFormalWorldContract,
  type FormalSplit,
  type FormalWorldContract,
  type RuntimeIdentity,
} from "../../worlds/formal-schema.js";
import { canonicalSha256 } from "../../worlds/formal-snapshot.js";
import { resolveVisibleSnapshot } from "../../worlds/formal-visibility.js";

export interface InspectFormalSnapshotAdapter {
  inspectFormalSnapshot(input: {
    contract: FormalWorldContract;
    split: FormalSplit;
    expectedByAgent: Record<string, string[]>;
  }): Promise<Record<string, unknown>>;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error("usage: tsx inspect-formal-snapshot.ts --contract <formal-world.json> --split <dev|hidden_test> --adapter <production-adapter.mjs>");
  process.exit(2);
}

async function main(): Promise<void> {
  const contractPath = option("--contract");
  const split = option("--split") as FormalSplit | undefined;
  const adapterPath = option("--adapter");
  if (!contractPath || !adapterPath || (split !== "dev" && split !== "hidden_test")) usage();
  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8")) as FormalWorldContract;
  assertFormalWorldContract(contract);
  const teamIds = new Set(contract.teams.filter((team) => team.split === split).map((team) => team.teamId));
  const expectedByAgent: Record<string, string[]> = {};
  for (const agent of contract.businessAgents.filter((candidate) => teamIds.has(candidate.teamId))) {
    const task = contract.tasks.find((candidate) => candidate.teamId === agent.teamId && candidate.eligibleAgentIds.includes(agent.agentId));
    if (!task) continue;
    const identity: Pick<RuntimeIdentity, "spaceId" | "teamId" | "userId" | "agentId" | "taskId"> = {
      spaceId: contract.world.spaceId,
      teamId: agent.teamId,
      userId: `inspect-${agent.agentId}`,
      agentId: agent.agentId,
      taskId: task.taskId,
    };
    const visible = resolveVisibleSnapshot(contract, identity);
    expectedByAgent[agent.agentId] = [...new Set([
      ...visible.memories.map((asset) => asset.assetId),
      ...visible.skills.map((asset) => asset.assetId),
      ...visible.knowledge.map((asset) => asset.assetId),
    ])].sort();
  }
  const adapter = await import(pathToFileURL(resolve(adapterPath)).href) as InspectFormalSnapshotAdapter;
  if (typeof adapter.inspectFormalSnapshot !== "function") throw new Error("adapter must export inspectFormalSnapshot(input)");
  const inspection = await adapter.inspectFormalSnapshot({ contract, split, expectedByAgent });
  console.log(JSON.stringify({
    split,
    expected_visible_assets_sha256: canonicalSha256(expectedByAgent),
    expectedByAgent,
    inspection,
  }, null, 2));
}

await main();
