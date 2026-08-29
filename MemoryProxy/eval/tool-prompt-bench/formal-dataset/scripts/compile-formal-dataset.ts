import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  compileFormalProvenanceSummary,
  compileFormalSplitInputs,
} from "../../worlds/formal-compile.js";
import {
  assertFormalWorldContract,
  type FormalSplit,
  type FormalWorldContract,
} from "../../worlds/formal-schema.js";
import { canonicalSha256 } from "../../worlds/formal-snapshot.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error("usage: tsx compile-formal-dataset.ts --contract <formal-world.json> --split <dev|hidden_test> --out <formal-dataset-dir>");
  process.exit(2);
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const text = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
  await writeFile(path, text, "utf8");
}

async function main(): Promise<void> {
  const contractPath = option("--contract");
  const split = option("--split") as FormalSplit | undefined;
  const outputRoot = option("--out");
  if (!contractPath || !outputRoot || (split !== "dev" && split !== "hidden_test")) usage();

  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8")) as FormalWorldContract;
  assertFormalWorldContract(contract);
  const compiled = compileFormalSplitInputs(contract, split);
  const provenance = compileFormalProvenanceSummary(contract);
  const caseIds = new Set(compiled.map((item) => item.caseId));
  const annotations = contract.privateAnnotations
    .filter((annotation) => caseIds.has(annotation.caseId))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const snapshot = contract.snapshots.find((candidate) => candidate.snapshotId === contract.world.snapshotIds[split]);
  if (!snapshot) throw new Error(`missing ${split} snapshot`);

  const providerPath = resolve(outputRoot, "provider", split === "dev" ? "dev.jsonl" : "hidden.sealed.jsonl");
  const snapshotDir = resolve(outputRoot, "snapshots", split === "dev" ? "dev" : "hidden");
  const privateGoldPath = resolve(snapshotDir, "scorer-gold.private.jsonl");
  const snapshotInputPath = resolve(snapshotDir, "snapshot-input.json");
  await writeJsonl(providerPath, compiled.map((item) => item.provider));
  await writeJsonl(privateGoldPath, annotations.map((annotation) => ({ caseId: annotation.caseId, gold: annotation.gold })));
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(snapshotInputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    split,
    cases: compiled.length,
    providerPath,
    privateGoldPath,
    snapshotInputPath,
    provenance,
    providerSha256: canonicalSha256(compiled.map((item) => item.provider)),
    privateGoldSha256: canonicalSha256(annotations.map((annotation) => ({ caseId: annotation.caseId, gold: annotation.gold }))),
    snapshotSha256: canonicalSha256(snapshot),
  }, null, 2));
}

await main();
