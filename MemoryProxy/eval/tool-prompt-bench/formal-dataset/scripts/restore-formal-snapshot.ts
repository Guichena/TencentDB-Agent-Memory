import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertFormalWorldContract,
  type FormalSplit,
  type FormalWorldContract,
  type WorldSnapshot,
} from "../../worlds/formal-schema.js";
import {
  assertFormalReadOnlyRuntimePolicy,
  canonicalSha256,
  type FormalRuntimePolicy,
} from "../../worlds/formal-snapshot.js";

export interface RestoreFormalSnapshotInput {
  contract: FormalWorldContract;
  split: FormalSplit;
  snapshot: WorldSnapshot;
}

export interface RestoreFormalSnapshotAdapter {
  restoreFormalSnapshot(input: RestoreFormalSnapshotInput): Promise<Record<string, unknown>>;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error("usage: tsx restore-formal-snapshot.ts --contract <formal-world.json> --split <dev|hidden_test> --adapter <production-adapter.mjs>");
  process.exit(2);
}

async function main(): Promise<void> {
  const contractPath = option("--contract");
  const split = option("--split") as FormalSplit | undefined;
  const adapterPath = option("--adapter");
  if (!contractPath || !adapterPath || (split !== "dev" && split !== "hidden_test")) usage();
  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8")) as FormalWorldContract;
  assertFormalWorldContract(contract);
  assertFormalReadOnlyRuntimePolicy({
    ...contract.world.runtimePolicy,
    freshSessionPerCase: true,
    resetSnapshotBeforeCase: true,
  } as FormalRuntimePolicy);
  const snapshot = contract.snapshots.find((candidate) => candidate.snapshotId === contract.world.snapshotIds[split]);
  if (!snapshot) throw new Error(`missing ${split} snapshot`);
  const adapter = await import(pathToFileURL(resolve(adapterPath)).href) as RestoreFormalSnapshotAdapter;
  if (typeof adapter.restoreFormalSnapshot !== "function") throw new Error("adapter must export restoreFormalSnapshot(input)");
  const receipt = await adapter.restoreFormalSnapshot({ contract, split, snapshot });
  console.log(JSON.stringify({
    snapshot_id: snapshot.snapshotId,
    split,
    snapshot_sha256: canonicalSha256(snapshot),
    receipt,
  }, null, 2));
}

await main();
