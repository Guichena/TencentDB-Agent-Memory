import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FormalExecutionReceipt } from "./formal-execution-runner.js";
import { inspectFormalCacheStructureFreeze } from "./formal-cache-structure-gate.js";
import { resolveFormalDataFreeze } from "./formal-runtime/index.js";
import { loadPrivateMeasurementSplit } from "./formal-runtime/private-loader.js";
import {
  integrateFormalMeasurement,
} from "./measurement-v2/formal-measurement-integration.js";
import {
  collectObservedToolEvents,
  type ObservedRunWindow,
} from "./measurement-v2/observed-event-collector.js";
import { collectProviderEvidence } from "./measurement-v2/provider-evidence-collector.js";

export interface FormalCollectScoreCliOptions {
  readonly campaignId: string;
  readonly campaignRoot: string;
  readonly traceCampaignDirectory: string;
  readonly repositoryRoot: string;
  readonly split: "dev" | "hidden_test";
  readonly allowHiddenTest: boolean;
  readonly outputPath: string;
}

export function parseFormalCollectScoreCliArguments(
  argv: readonly string[],
): FormalCollectScoreCliOptions {
  const booleanFlags = new Set(["--allow-hidden-test"]);
  const valueFlags = new Set([
    "--campaign-id",
    "--campaign-root",
    "--trace-campaign-dir",
    "--repo-root",
    "--split",
    "--output",
  ]);
  const values = new Map<string, string>();
  let allowHiddenTest = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (booleanFlags.has(flag)) {
      if (allowHiddenTest) throw new Error(`duplicate formal collection argument: ${flag}`);
      allowHiddenTest = true;
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error(`unsupported formal collection argument: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    if (values.has(flag)) throw new Error(`duplicate formal collection argument: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const split = required(values, "--split");
  if (split !== "dev" && split !== "hidden_test") {
    throw new Error("--split must be dev or hidden_test");
  }
  if (split === "hidden_test" && !allowHiddenTest) {
    throw new Error("hidden_test collection requires --allow-hidden-test");
  }
  return {
    campaignId: required(values, "--campaign-id"),
    campaignRoot: resolve(required(values, "--campaign-root")),
    traceCampaignDirectory: resolve(required(values, "--trace-campaign-dir")),
    repositoryRoot: resolve(required(values, "--repo-root")),
    split,
    allowHiddenTest,
    outputPath: resolve(required(values, "--output")),
  };
}

export async function runFormalCollectScoreCli(
  options: FormalCollectScoreCliOptions,
): Promise<void> {
  const executions = await discoverExecutionReceipts(options.campaignRoot);
  if (executions.length === 0) throw new Error("campaign contains no formal execution receipts");
  const proxyIds = new Set(executions.map((receipt) => receipt.proxyInstanceId));
  const knowledgeIds = new Set(executions.map((receipt) => receipt.knowledgeInstanceId));
  if (proxyIds.size !== 1 || knowledgeIds.size !== 1) {
    throw new Error("one campaign must use one Proxy and one Knowledge process instance");
  }
  const windows: ObservedRunWindow[] = executions.map((receipt) => ({
    runId: receipt.runId,
    caseId: receipt.caseId,
    variantId: receipt.variantId,
    sessionId: receipt.sessionId,
    startedAtUnixMicros: receipt.startedWallTimeUnixMicros,
    finishedAtUnixMicros: receipt.finishedWallTimeUnixMicros,
  }));
  const [memoryProxyJsonl, memoryKnowledgeJsonl, providerJsonl] = await Promise.all([
    readFile(join(options.traceCampaignDirectory, "memory-proxy.events.jsonl"), "utf8"),
    readFile(join(options.traceCampaignDirectory, "memory-knowledge.events.jsonl"), "utf8"),
    readFile(join(options.traceCampaignDirectory, "memory-proxy.provider-requests.jsonl"), "utf8"),
  ]);
  const expectedProxyInstanceId = [...proxyIds][0];
  const expectedKnowledgeInstanceId = [...knowledgeIds][0];
  const toolCampaign = collectObservedToolEvents({
    campaignId: options.campaignId,
    expectedProxyInstanceId,
    expectedKnowledgeInstanceId,
    runs: windows,
    memoryProxyJsonl,
    memoryKnowledgeJsonl,
  });
  const providerCampaign = collectProviderEvidence({
    campaignId: options.campaignId,
    expectedProxyInstanceId,
    runs: windows,
    providerJsonl,
  });
  const cacheStructureGate = await inspectFormalCacheStructureFreeze({
    repositoryRoot: options.repositoryRoot,
    executions,
  });
  const freeze = resolveFormalDataFreeze({ repositoryRoot: options.repositoryRoot });
  const privateMeasurement = loadPrivateMeasurementSplit({
    freeze,
    split: options.split,
    ...(options.allowHiddenTest ? { allowHiddenTest: true as const } : {}),
  });
  const measurement = integrateFormalMeasurement({
    campaignId: options.campaignId,
    executions,
    toolCampaign,
    providerCampaign,
    privateMeasurement,
  });
  const bundle = {
    schemaVersion: "task1.formal-measurement-bundle.v1",
    createdAt: new Date().toISOString(),
    rawEvidenceFiles: {
      memoryProxy: join(options.traceCampaignDirectory, "memory-proxy.events.jsonl"),
      memoryKnowledge: join(options.traceCampaignDirectory, "memory-knowledge.events.jsonl"),
      provider: join(options.traceCampaignDirectory, "memory-proxy.provider-requests.jsonl"),
    },
    toolCollection: toolCampaign,
    providerCollection: providerCampaign,
    cacheStructureGate,
    measurement,
  } as const;
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(bundle, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(`${JSON.stringify({
    outputPath: options.outputPath,
    formalCampaignEligible: measurement.formalCampaignEligible,
    eligibleRunCount: measurement.eligibleRunCount,
    excludedRunCount: measurement.excludedRunCount,
  }, null, 2)}\n`);
}

export async function discoverExecutionReceipts(
  campaignRoot: string,
): Promise<FormalExecutionReceipt[]> {
  const found: FormalExecutionReceipt[] = [];
  const pending = [resolve(campaignRoot)];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name === "formal-execution-receipt.json") {
        const value = JSON.parse(await readFile(path, "utf8")) as unknown;
        const receipt = record(value, path) as unknown as FormalExecutionReceipt;
        if (receipt.schemaVersion !== "task1.formal-execution-receipt.v1") {
          throw new Error(`${path}: execution receipt schemaVersion mismatch`);
        }
        found.push(receipt);
      }
    }
  }
  found.sort((left, right) => (
    left.variantId.localeCompare(right.variantId)
    || left.caseId.localeCompare(right.caseId)
    || left.repeat - right.repeat
  ));
  return found;
}

function required(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag)?.trim();
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runFormalCollectScoreCli(parseFormalCollectScoreCliArguments(process.argv.slice(2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
