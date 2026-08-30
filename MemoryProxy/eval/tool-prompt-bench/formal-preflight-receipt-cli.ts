import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePinnedFormalAssetRestorePlan,
  parseFormalAssetRuntimeObservations,
  type FormalAssetRuntimeObservations,
} from "./formal-assets/restore-plan-runtime.js";
import type {
  FormalAssetRestorePlan,
  FormalAssetRestoreSplit,
} from "./formal-assets/restore-plan-contract.js";
import {
  evaluateFormalExecutionPreflight,
  type FormalExecutionPreflightInput,
  type FormalExecutionPreflightReceipt,
} from "./formal-execution-preflight.js";

export interface FormalPreflightReceiptCliOptions {
  readonly planPath: string;
  readonly inspectObservationsPath: string;
  readonly split: FormalAssetRestoreSplit;
  readonly allowHiddenTest: boolean;
  readonly outputPath: string;
}

export interface CreateFormalExecutionPreflightReceiptInput {
  readonly rawPlan: unknown;
  readonly rawInspectObservations: unknown;
  readonly split: FormalAssetRestoreSplit;
  readonly allowHiddenTest?: true;
}

export interface FormalPreflightReceiptDependencies {
  readonly parsePlan?: typeof parsePinnedFormalAssetRestorePlan;
  readonly parseObservations?: typeof parseFormalAssetRuntimeObservations;
  readonly evaluate?: typeof evaluateFormalExecutionPreflight;
}

export function parseFormalPreflightReceiptCliArguments(
  argv: readonly string[],
): FormalPreflightReceiptCliOptions {
  const booleanFlags = new Set(["--allow-hidden-test"]);
  const valueFlags = new Set([
    "--plan",
    "--inspect-observations",
    "--split",
    "--output",
  ]);
  const values = new Map<string, string>();
  let allowHiddenTest = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (booleanFlags.has(flag)) {
      if (allowHiddenTest) throw new Error(`duplicate formal preflight argument: ${flag}`);
      allowHiddenTest = true;
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error(`unsupported formal preflight argument: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    if (values.has(flag)) throw new Error(`duplicate formal preflight argument: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const split = required(values, "--split");
  if (split !== "dev" && split !== "hidden_test") {
    throw new Error("--split must be dev or hidden_test");
  }
  if (split === "hidden_test" && !allowHiddenTest) {
    throw new Error("hidden_test preflight requires --allow-hidden-test");
  }
  return {
    planPath: resolve(required(values, "--plan")),
    inspectObservationsPath: resolve(required(values, "--inspect-observations")),
    split,
    allowHiddenTest,
    outputPath: resolve(required(values, "--output")),
  };
}

/**
 * Promote neither restore nor inspector claims directly. Both envelopes are
 * parsed against the pinned formal data revision, then the independent R04
 * evaluator recomputes all six readiness checks from raw observations.
 */
export function createFormalExecutionPreflightReceipt(
  input: CreateFormalExecutionPreflightReceiptInput,
  dependencies: FormalPreflightReceiptDependencies = {},
): FormalExecutionPreflightReceipt {
  const parsePlan = dependencies.parsePlan ?? parsePinnedFormalAssetRestorePlan;
  const parseObservations = dependencies.parseObservations ?? parseFormalAssetRuntimeObservations;
  const evaluate = dependencies.evaluate ?? evaluateFormalExecutionPreflight;
  const authorization = input.allowHiddenTest === true
    ? { allowHiddenTest: true as const }
    : {};
  const plan = parsePlan(input.rawPlan, {
    expectedSplit: input.split,
    ...authorization,
  }) as FormalAssetRestorePlan;
  const inspected = parseObservations(input.rawInspectObservations, {
    expectedOperation: "inspect",
    expectedSplit: input.split,
    expectedPlanSha256: plan.planSha256,
    ...authorization,
  }) as FormalAssetRuntimeObservations;
  return evaluate(inspected.unverifiedObservations as FormalExecutionPreflightInput);
}

export async function runFormalPreflightReceiptCli(
  options: FormalPreflightReceiptCliOptions,
): Promise<void> {
  // Hidden authorization is checked by argument parsing before either runtime
  // file is opened. Keep the same invariant for programmatic callers.
  if (options.split === "hidden_test" && options.allowHiddenTest !== true) {
    throw new Error("hidden_test preflight requires --allow-hidden-test");
  }
  const [rawPlan, rawInspectObservations] = await Promise.all([
    readJson(options.planPath, "formal restore plan"),
    readJson(options.inspectObservationsPath, "formal inspect observations"),
  ]);
  const receipt = createFormalExecutionPreflightReceipt({
    rawPlan,
    rawInspectObservations,
    split: options.split,
    ...(options.allowHiddenTest ? { allowHiddenTest: true as const } : {}),
  });
  if (receipt.ready !== true) {
    throw new Error("formal execution preflight failed; no ready receipt was written");
  }
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(`${JSON.stringify({
    outputPath: options.outputPath,
    ready: receipt.ready,
    checks: receipt.checks,
  }, null, 2)}\n`);
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is not readable valid JSON: ${path}`, { cause: error });
  }
}

function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag)?.trim();
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runFormalPreflightReceiptCli(parseFormalPreflightReceiptCliArguments(process.argv.slice(2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
