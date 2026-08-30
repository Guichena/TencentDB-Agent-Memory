import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildFrozenFormalAssetRestorePlan } from "../../formal-assets/build-frozen-restore-plan.js";
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
    "usage: tsx build-formal-restore-plan.ts --repo-root <repository> "
      + "--split <dev|hidden_test> --output <restore-plan.json> [--allow-hidden-test]",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const repositoryRoot = option("--repo-root");
  const split = option("--split") as FormalAssetRestoreSplit | undefined;
  const output = option("--output");
  const allowHiddenTest = flag("--allow-hidden-test");
  if (!repositoryRoot || !output || (split !== "dev" && split !== "hidden_test")) usage();
  if (split === "hidden_test" && !allowHiddenTest) {
    throw new Error("hidden_test restore-plan construction requires --allow-hidden-test");
  }
  const plan = buildFrozenFormalAssetRestorePlan({
    repositoryRoot: resolve(repositoryRoot),
    split,
    ...(allowHiddenTest ? { allowHiddenTest: true as const } : {}),
  });
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath,
    split: plan.split,
    planSha256: plan.planSha256,
    actionCount: plan.actions.length,
    requirementCount: plan.requirements.length,
    assetCount: plan.assets.length,
  }, null, 2)}\n`);
}

await main();
