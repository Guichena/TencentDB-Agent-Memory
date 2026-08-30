import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  codexProcessInfrastructureError,
  executeCodexProcess,
  extractCodexUsage,
  type CodexProcessExecutionInput,
  type CodexProcessExecutionResult,
  type CodexUsage,
} from "./codex-runner.js";
import type {
  FormalExecutionPreflightReceipt,
  FormalPreflightCheckId,
} from "./formal-execution-preflight.js";
import {
  materializePreparedRunExecutionContext,
  type PreparedFormalRun,
} from "./formal-prepare-runner.js";
import { canonicalSha256 } from "./formal-runtime/canonical.js";

export const FORMAL_EXECUTION_RECEIPT_SCHEMA =
  "task1.formal-execution-receipt.v1" as const;

const DEFAULT_TIMEOUT_MS = 180_000;
export interface FormalCodeFreezeReceipt {
  readonly executionCodeCommit: string;
  readonly promptFreezeCommit: string;
  readonly promptFreezeIsAncestor: boolean;
}

export interface ExecutePreparedFormalRunInput {
  readonly run: PreparedFormalRun;
  readonly environmentSource: NodeJS.ProcessEnv;
  readonly preflightReceipt: FormalExecutionPreflightReceipt;
  readonly knowledgeHealthUrl: string;
  readonly expectedKnowledgeInstanceId: string;
  readonly codeFreeze: FormalCodeFreezeReceipt;
  readonly timeoutMs?: number;
}

export interface FormalExecutionRunnerDependencies {
  readonly fetchJson?: (url: string) => Promise<unknown>;
  readonly executeProcess?: (
    input: CodexProcessExecutionInput,
  ) => Promise<CodexProcessExecutionResult>;
  readonly nowIso?: () => string;
  readonly wallTimeUnixMicros?: () => string;
}

export interface FormalExecutionReceipt {
  readonly schemaVersion: typeof FORMAL_EXECUTION_RECEIPT_SCHEMA;
  readonly formalMetricEligible: false;
  readonly runId: string;
  readonly caseId: string;
  readonly variantId: string;
  readonly repeat: number;
  readonly sessionId: string;
  readonly proxyInstanceId: string;
  readonly knowledgeInstanceId: string;
  readonly providerPromptSha256: string;
  readonly preflightReceiptSha256: string;
  readonly codeFreeze: FormalCodeFreezeReceipt;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly startedWallTimeUnixMicros: string;
  readonly finishedWallTimeUnixMicros: string;
  readonly process: {
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly infrastructureError: string | null;
    readonly stdoutSha256: string;
    readonly stderrSha256: string;
  };
  readonly clientUsage: CodexUsage | null;
  readonly promptEvidenceState: "captured-by-provider-observer-pending-seal";
  readonly providerUsageState: "captured-by-provider-observer-pending-seal";
  readonly traceCollectionState: "pending-campaign-seal";
}

/**
 * Gold-blind online execution. The runner validates only public preparation,
 * runtime identities, and service health; private Gold and scoring stay in the
 * offline integration stage after all production observers are sealed.
 */
export async function executePreparedFormalRun(
  input: ExecutePreparedFormalRunInput,
  dependencies: FormalExecutionRunnerDependencies = {},
): Promise<FormalExecutionReceipt> {
  const { run } = input;
  validateCodeFreeze(run, input.codeFreeze);
  validatePreflightReceipt(run, input.preflightReceipt);
  const timeoutMs = validateTimeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const expectedKnowledgeInstanceId = nonBlank(
    "expectedKnowledgeInstanceId",
    input.expectedKnowledgeInstanceId,
  );
  const fetchJson = dependencies.fetchJson ?? fetchJsonDefault;

  const [proxyHealth, knowledgeHealth] = await Promise.all([
    fetchJson(run.command.preflight.healthUrl),
    fetchJson(nonBlank("knowledgeHealthUrl", input.knowledgeHealthUrl)),
  ]);
  assertExpectedSubset(
    "MemoryProxy health",
    run.command.preflight.expected,
    proxyHealth,
  );
  assertExpectedSubset("MemoryKnowledge health", {
    status: "ok",
    serverInstanceId: expectedKnowledgeInstanceId,
  }, knowledgeHealth);

  const stdin = await readPreparedProviderStdin(run);
  const executionContext = await materializePreparedRunExecutionContext(
    run,
    input.environmentSource,
  );
  const nowIso = dependencies.nowIso ?? (() => new Date().toISOString());
  const wallTimeUnixMicros = dependencies.wallTimeUnixMicros
    ?? (() => String(Date.now() * 1_000));
  const startedAt = validIso("startedAt", nowIso());
  const startedWallTimeUnixMicros = validMicros(
    "startedWallTimeUnixMicros",
    wallTimeUnixMicros(),
  );

  const executeProcess = dependencies.executeProcess ?? executeCodexProcess;
  const result = await executeProcess({
    executable: run.command.executable,
    args: [...run.command.args],
    cwd: executionContext.cwd,
    environment: executionContext.environment,
    stdin,
    timeoutMs,
  });
  const finishedAt = validIso("finishedAt", nowIso());
  const finishedWallTimeUnixMicros = validMicros(
    "finishedWallTimeUnixMicros",
    wallTimeUnixMicros(),
  );
  if (BigInt(finishedWallTimeUnixMicros) <= BigInt(startedWallTimeUnixMicros)) {
    throw new Error("formal execution finish time must be after start time");
  }

  const clientUsage = extractCodexUsage(result.stdout);
  // Provider-bound usage is the formal source and arrives after campaign seal;
  // missing client summary usage is diagnostic, not an online infrastructure
  // failure by itself.
  const infrastructureError = codexProcessInfrastructureError(result) ?? null;
  const receipt: FormalExecutionReceipt = Object.freeze({
    schemaVersion: FORMAL_EXECUTION_RECEIPT_SCHEMA,
    formalMetricEligible: false,
    runId: run.manifest.run_id,
    caseId: run.manifest.case_id,
    variantId: run.manifest.variant_id,
    repeat: run.manifest.repeat,
    sessionId: run.manifest.session_id,
    proxyInstanceId: run.manifest.proxy_instance_id,
    knowledgeInstanceId: expectedKnowledgeInstanceId,
    providerPromptSha256: run.manifest.provider_input_sha256,
    preflightReceiptSha256: canonicalSha256(input.preflightReceipt),
    codeFreeze: Object.freeze({ ...input.codeFreeze }),
    startedAt,
    finishedAt,
    startedWallTimeUnixMicros,
    finishedWallTimeUnixMicros,
    process: Object.freeze({
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      infrastructureError,
      stdoutSha256: sha256(result.stdout),
      stderrSha256: sha256(result.stderr),
    }),
    clientUsage: clientUsage ? Object.freeze({ ...clientUsage }) : null,
    promptEvidenceState: "captured-by-provider-observer-pending-seal",
    providerUsageState: "captured-by-provider-observer-pending-seal",
    traceCollectionState: "pending-campaign-seal",
  });

  await writeExecutionArtifacts(run, result, receipt);
  return receipt;
}

async function readPreparedProviderStdin(run: PreparedFormalRun): Promise<string> {
  const path = join(run.directory, "provider-prompt.json");
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("provider-prompt.json is not valid JSON", { cause: error });
  }
  const root = record("provider-prompt.json", parsed);
  if (root.schemaVersion !== "task1.formal-provider-prompt.v1") {
    throw new Error("provider-prompt.json schemaVersion mismatch");
  }
  const messages = root.messages;
  if (!Array.isArray(messages) || messages.length !== 1) {
    throw new Error("provider-prompt.json must contain exactly one message");
  }
  const message = record("provider-prompt.json.messages[0]", messages[0]);
  const content = message.content;
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error("provider-prompt.json message must contain exactly one content part");
  }
  const part = record("provider-prompt.json.messages[0].content[0]", content[0]);
  const stdin = nonBlank("provider prompt stdin", part.text);
  if (sha256(stdin) !== run.manifest.provider_input_sha256) {
    throw new Error("provider-prompt.json stdin hash does not match prepared manifest");
  }
  return stdin;
}

function validateCodeFreeze(
  run: PreparedFormalRun,
  receipt: FormalCodeFreezeReceipt,
): void {
  if (!/^[a-f0-9]{40}$/iu.test(receipt.executionCodeCommit)
    || receipt.executionCodeCommit.toLowerCase() !== run.manifest.code_commit) {
    throw new Error("execution code commit does not match prepared manifest");
  }
  if (!/^[a-f0-9]{40}$/iu.test(receipt.promptFreezeCommit)
    || receipt.promptFreezeCommit.toLowerCase() !== run.manifest.prompt_freeze_commit) {
    throw new Error("prompt freeze commit does not match prepared manifest");
  }
  if (receipt.promptFreezeIsAncestor !== true) {
    throw new Error("prompt freeze commit must be an ancestor of the execution code commit");
  }
}

function validatePreflightReceipt(
  run: PreparedFormalRun,
  receipt: FormalExecutionPreflightReceipt,
): void {
  if (receipt.schemaVersion !== "task1.formal-execution-preflight-receipt.v1") {
    throw new Error("formal preflight receipt schemaVersion mismatch");
  }
  if (receipt.ready !== true || receipt.checks.some((check) => check.status !== "pass")) {
    throw new Error("formal preflight receipt is not ready");
  }
  const requiredChecks: ReadonlySet<FormalPreflightCheckId> = new Set([
    "auth-user-mapping",
    "metadata-identity",
    "session-identity",
    "visible-assets",
    "write-side-disabled",
    "fresh-session-namespace",
  ]);
  const observedChecks = new Set(receipt.checks.map((check) => check.id));
  if (observedChecks.size !== requiredChecks.size
    || [...requiredChecks].some((id) => !observedChecks.has(id))) {
    throw new Error("formal preflight receipt does not contain the complete check set");
  }
  const expected = run.command.executionRequiredGates.identityBinding.expected;
  assertExpectedSubset("formal preflight logical identity", {
    datasetUserId: expected.datasetUserId,
    spaceId: expected.spaceId,
    teamId: expected.teamId,
    agentId: expected.agentId,
    ...(expected.taskId ? { taskId: expected.taskId } : {}),
  }, receipt.logicalIdentity);
  assertExpectedSubset("formal preflight runtime identity", {
    spaceId: expected.spaceId,
    teamId: expected.teamId,
    agentId: expected.agentId,
    ...(expected.taskId ? { taskId: expected.taskId } : {}),
  }, receipt.runtimeIdentity);
  assertExpectedSubset("formal preflight run binding", {
    sessionId: run.manifest.session_id,
    agentSource: "codex",
    visibleAssetSetSha256: run.manifest.visible_asset_set_sha256,
    effectiveConfigSha256: run.manifest.proxy_config_sha256,
  }, receipt);
}

async function writeExecutionArtifacts(
  run: PreparedFormalRun,
  result: CodexProcessExecutionResult,
  receipt: FormalExecutionReceipt,
): Promise<void> {
  const usage = {
    schemaVersion: "task1.formal-client-usage.v1",
    formalMetricEligible: false,
    source: "codex-turn-completed-diagnostic",
    providerUsageState: receipt.providerUsageState,
    usage: receipt.clientUsage,
  } as const;
  await Promise.all([
    writeNew(join(run.directory, "codex-events.jsonl"), result.stdout),
    writeNew(join(run.directory, "codex-stderr.log"), result.stderr),
    writeNew(join(run.directory, "client-usage.json"), json(usage)),
    writeNew(join(run.directory, "formal-execution-receipt.json"), json(receipt)),
  ]);
}

async function writeNew(path: string, value: string): Promise<void> {
  await writeFile(path, value, { encoding: "utf8", flag: "wx" });
}

async function fetchJsonDefault(url: string): Promise<unknown> {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`health request failed with status ${response.status}`);
  return response.json();
}

function assertExpectedSubset(label: string, expected: unknown, actual: unknown): void {
  const mismatch = firstSubsetMismatch(expected, actual, "");
  if (mismatch) throw new Error(`${label} mismatch at ${mismatch}`);
}

function firstSubsetMismatch(expected: unknown, actual: unknown, path: string): string | null {
  if (expected === null || typeof expected !== "object") {
    return Object.is(expected, actual) ? null : path || "<root>";
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return path || "<root>";
    for (let index = 0; index < expected.length; index += 1) {
      const mismatch = firstSubsetMismatch(expected[index], actual[index], `${path}[${index}]`);
      if (mismatch) return mismatch;
    }
    return null;
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return path || "<root>";
  for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!Object.hasOwn(actual, key)) return nextPath;
    const mismatch = firstSubsetMismatch(
      value,
      (actual as Record<string, unknown>)[key],
      nextPath,
    );
    if (mismatch) return mismatch;
  }
  return null;
}

function record(label: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonBlank(label: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function validIso(label: string, value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO date-time`);
  return value;
}

function validMicros(label: string, value: string): string {
  if (!/^[0-9]+$/u.test(value)) throw new Error(`${label} must be unsigned integer microseconds`);
  return value;
}

function validateTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("timeoutMs must be a positive integer");
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
