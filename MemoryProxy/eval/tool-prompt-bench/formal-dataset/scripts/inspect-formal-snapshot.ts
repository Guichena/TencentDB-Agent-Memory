import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  inspectFormalAssetRestorePlanWithLoader,
} from "../../formal-assets/restore-plan-runtime.js";
import type { FormalAssetRestoreSplit } from "../../formal-assets/restore-plan-contract.js";
import { loadPreparedFormalRunDirectory } from "../../formal-execution-cli.js";
import { expectedBindingFromPreparedRun } from "../../formal-preflight-receipt-cli.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function usage(): never {
  console.error(
    "usage: tsx inspect-formal-snapshot.ts --plan <restore-plan.json> "
      + "--restore-observations <restore-observations.json> --split <dev|hidden_test> "
      + "--run-dir <prepared-run-directory> --adapter <production-inspector.mjs> "
      + "[--allow-hidden-test]",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const planPath = option("--plan");
  const observationsPath = option("--restore-observations");
  const split = option("--split") as FormalAssetRestoreSplit | undefined;
  const runDirectory = option("--run-dir");
  const adapterPath = option("--adapter");
  const allowHiddenTest = flag("--allow-hidden-test");
  if (!planPath || !observationsPath || !runDirectory || !adapterPath
    || (split !== "dev" && split !== "hidden_test")) usage();
  if (split === "hidden_test" && !allowHiddenTest) {
    throw new Error("hidden_test access must be explicitly authorized before runtime files are read");
  }

  const [rawPlan, rawRestoreObservations, preparedRun] = await Promise.all([
    readFile(resolve(planPath), "utf8").then((text) => JSON.parse(text) as unknown),
    readFile(resolve(observationsPath), "utf8").then((text) => JSON.parse(text) as unknown),
    loadPreparedFormalRunDirectory(resolve(runDirectory)),
  ]);
  const observations = await inspectFormalAssetRestorePlanWithLoader({
    rawPlan,
    rawRestoreObservations,
    expectedBinding: expectedBindingFromPreparedRun(preparedRun),
    expectedSplit: split,
    ...(allowHiddenTest ? { allowHiddenTest: true as const } : {}),
    loadAdapter: () => import(pathToFileURL(resolve(adapterPath)).href),
  });
  console.log(JSON.stringify(observations, null, 2));
}

await main();
