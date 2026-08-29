import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileFormalSplitInputs } from "../../worlds/formal-compile.js";
import {
  validateFormalWorldContract,
  type FormalSplit,
  type FormalWorldContract,
} from "../../worlds/formal-schema.js";
import { canonicalSha256 } from "../../worlds/formal-snapshot.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error("usage: tsx validate-formal-dataset.ts --contract <formal-world.json> [--split dev|hidden_test] [--report report.json]");
  process.exit(2);
}

async function main(): Promise<void> {
  const contractPath = option("--contract");
  const requestedSplit = option("--split") as FormalSplit | undefined;
  if (!contractPath || (requestedSplit && requestedSplit !== "dev" && requestedSplit !== "hidden_test")) usage();
  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8")) as FormalWorldContract;
  const validation = validateFormalWorldContract(contract);
  const splits: FormalSplit[] = requestedSplit ? [requestedSplit] : ["dev", "hidden_test"];
  const compiled = validation.valid
    ? splits.flatMap((split) => compileFormalSplitInputs(contract, split))
    : [];
  const providerText = compiled.map((item) => JSON.stringify(item.provider)).join("\n");
  const privateMarkers = [
    "allowedFirstActions", "expectedFollowupActions", "expectedKnowledgeCalls",
    "allowedSequences", "targetAssetIds", "informationGap", "annotationReason",
  ];
  const leakedMarkers = privateMarkers.filter((marker) => providerText.includes(marker));
  const teamCounts = Object.fromEntries(contract.teams.map((team) => [
    team.teamId,
    compiled.filter((item) => item.sessionInit.registration.team_id === team.teamId).length,
  ]));
  const errors = [...validation.errors];
  if (leakedMarkers.length > 0) errors.push(`provider leakage markers: ${leakedMarkers.join(", ")}`);
  const report = {
    schema_version: "task1.formal_dataset_validation.v1",
    valid: errors.length === 0,
    errors,
    splits,
    case_count: compiled.length,
    team_case_counts: teamCounts,
    provider_leakage_count: leakedMarkers.length,
    provider_sha256: canonicalSha256(compiled.map((item) => item.provider)),
    snapshot_sha256: Object.fromEntries(contract.snapshots.map((snapshot) => [snapshot.split, canonicalSha256(snapshot)])),
  };
  const reportPath = option("--report");
  if (reportPath) await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

await main();
