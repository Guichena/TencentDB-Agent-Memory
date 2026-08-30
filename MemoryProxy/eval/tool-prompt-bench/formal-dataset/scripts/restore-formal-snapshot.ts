import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  executeFormalAssetRestorePlanWithLoader,
} from "../../formal-assets/restore-plan-runtime.js";
import type { FormalAssetRestoreSplit } from "../../formal-assets/restore-plan-contract.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function usage(): never {
  console.error(
    "usage: tsx restore-formal-snapshot.ts --plan <restore-plan.json> "
      + "--split <dev|hidden_test> --adapter <production-adapter.mjs> "
      + "--output <restore-observations.json> [--allow-hidden-test]",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const planPath = option("--plan");
  const split = option("--split") as FormalAssetRestoreSplit | undefined;
  const adapterPath = option("--adapter");
  const outputPath = option("--output");
  const allowHiddenTest = flag("--allow-hidden-test");
  if (!planPath || !adapterPath || !outputPath
    || (split !== "dev" && split !== "hidden_test")) usage();
  if (split === "hidden_test" && !allowHiddenTest) {
    throw new Error("hidden_test access must be explicitly authorized before the plan file is read");
  }

  const rawPlan = JSON.parse(await readFile(resolve(planPath), "utf8")) as unknown;
  const observations = await executeFormalAssetRestorePlanWithLoader({
    rawPlan,
    expectedSplit: split,
    ...(allowHiddenTest ? { allowHiddenTest: true as const } : {}),
    loadAdapter: () => import(pathToFileURL(resolve(adapterPath)).href),
  });
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(observations, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(JSON.stringify({
    outputPath: resolvedOutput,
    operation: observations.operation,
    planSha256: observations.planSha256,
    verification: observations.verification,
  }, null, 2));
}

await main();
