import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const R05_FROZEN_RESTORE_PLAN = Object.freeze({
  planSha256: "49f9ad8549e293395671af8d17cc8604dcfbe741536855f7773155d8e5c1c3be",
  actionCount: 318,
  requirementCount: 209,
  assetCount: 284,
} as const);

export const R05_FROZEN_DEV_SMOKE = Object.freeze({
  selectionSha256: "f300079fc408878cf2bf5921a9e6b3004ce9e5fa3034857221554c00a9a101ec",
  caseIds: Object.freeze([
    "T01-MEMORY-006-P",
    "T01-MEMORY-006-N",
    "T02-MEMORY-001-P",
    "T02-NATURAL-001",
    "T03-SKILL-001-P",
    "T03-SKILL-001-N",
    "T04-SKILL-001-P",
    "T04-NAT-001",
    "T11-KNOWLEDGE-013-P",
    "T11-KNOWLEDGE-013-N",
    "T12-KNOWLEDGE-013-P",
    "T12-NATURAL-001-N",
  ] as const),
} as const);

export interface R05RestorePlanSummary {
  readonly planSha256: typeof R05_FROZEN_RESTORE_PLAN.planSha256;
  readonly actionCount: typeof R05_FROZEN_RESTORE_PLAN.actionCount;
  readonly requirementCount: typeof R05_FROZEN_RESTORE_PLAN.requirementCount;
  readonly assetCount: typeof R05_FROZEN_RESTORE_PLAN.assetCount;
}

export interface R05RestoreObservationSummary extends R05RestorePlanSummary {
  readonly operation: "restore";
  readonly verification: "unverified";
  readonly formalMetricEligible: false;
  readonly readyForFormalMeasurement: false;
  readonly complete: true;
}

export interface R05PreparedSmokeSummary {
  readonly selectionSha256: typeof R05_FROZEN_DEV_SMOKE.selectionSha256;
  readonly caseIds: readonly string[];
  readonly runIds: readonly string[];
  readonly sessionIds: readonly string[];
}

type JsonRecord = Record<string, unknown>;

function invalid(message: string): never {
  throw new Error(`R05 runtime preflight contract: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) return invalid(`${label} must be an array`);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function requireLiteral(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) invalid(`${label} must be ${JSON.stringify(expected)}`);
}

function requireCount(value: unknown, expected: number, label: string): readonly unknown[] {
  const items = array(value, label);
  if (items.length !== expected) invalid(`${label} must contain exactly ${expected} items`);
  return items;
}

/** Pin the generated plan before any production restore request is allowed. */
export function validateR05RestorePlan(raw: unknown): R05RestorePlanSummary {
  const plan = record(raw, "restore plan");
  requireLiteral(plan.split, "dev", "restore plan split");
  requireLiteral(
    plan.planSha256,
    R05_FROZEN_RESTORE_PLAN.planSha256,
    "restore plan planSha256",
  );
  requireCount(
    plan.actions,
    R05_FROZEN_RESTORE_PLAN.actionCount,
    `restore plan ${R05_FROZEN_RESTORE_PLAN.actionCount} actions`,
  );
  requireCount(
    plan.requirements,
    R05_FROZEN_RESTORE_PLAN.requirementCount,
    `restore plan ${R05_FROZEN_RESTORE_PLAN.requirementCount} requirements`,
  );
  requireCount(
    plan.assets,
    R05_FROZEN_RESTORE_PLAN.assetCount,
    `restore plan ${R05_FROZEN_RESTORE_PLAN.assetCount} assets`,
  );
  return R05_FROZEN_RESTORE_PLAN;
}

/**
 * Verify both the outer untrusted envelope and the inner production receipt.
 * An adapter can report observations, but it must never grant eligibility.
 */
export function validateR05RestoreObservations(raw: unknown): R05RestoreObservationSummary {
  const outer = record(raw, "restore observations");
  requireLiteral(outer.operation, "restore", "restore observations operation");
  requireLiteral(outer.split, "dev", "restore observations split");
  requireLiteral(
    outer.planSha256,
    R05_FROZEN_RESTORE_PLAN.planSha256,
    "restore observations planSha256",
  );
  requireLiteral(outer.verification, "unverified", "restore observations verification");
  requireLiteral(
    outer.formalMetricEligible,
    false,
    "restore observations formalMetricEligible",
  );
  requireLiteral(
    outer.readyForFormalMeasurement,
    false,
    "restore observations readyForFormalMeasurement",
  );

  const receipt = record(outer.unverifiedObservations, "production restore receipt");
  requireLiteral(receipt.split, "dev", "production restore receipt split");
  requireLiteral(
    receipt.planSha256,
    R05_FROZEN_RESTORE_PLAN.planSha256,
    "production restore receipt planSha256",
  );
  requireLiteral(receipt.complete, true, "production restore receipt complete");
  requireLiteral(
    receipt.actionCount,
    R05_FROZEN_RESTORE_PLAN.actionCount,
    "production restore receipt actionCount",
  );
  requireLiteral(
    receipt.requirementCount,
    R05_FROZEN_RESTORE_PLAN.requirementCount,
    "production restore receipt requirementCount",
  );
  requireCount(
    receipt.actions,
    R05_FROZEN_RESTORE_PLAN.actionCount,
    "production restore receipt actions",
  );
  requireCount(
    receipt.requirements,
    R05_FROZEN_RESTORE_PLAN.requirementCount,
    "production restore receipt requirements",
  );

  return Object.freeze({
    ...R05_FROZEN_RESTORE_PLAN,
    operation: "restore" as const,
    verification: "unverified" as const,
    formalMetricEligible: false as const,
    readyForFormalMeasurement: false as const,
    complete: true as const,
  });
}

/** Validate exact preregistered membership before any Session Init is consumed. */
export function validateR05PreparedSmoke(
  rawPreregistration: unknown,
  rawManifests: readonly unknown[],
): R05PreparedSmokeSummary {
  const preregistration = record(rawPreregistration, "Dev Smoke preregistration");
  const caseIds = requireCount(
    preregistration.caseIds,
    12,
    "Dev Smoke preregistration caseIds",
  ).map((value, index) => nonBlank(value, `Dev Smoke caseIds[${index}]`));
  if (new Set(caseIds).size !== caseIds.length) {
    invalid("Dev Smoke preregistration caseIds must be unique");
  }
  const selection = record(
    preregistration.selectionContract,
    "Dev Smoke preregistration selectionContract",
  );
  requireLiteral(selection.split, "dev", "Dev Smoke preregistration split");
  requireLiteral(selection.totalCases, 12, "Dev Smoke preregistration totalCases");
  requireLiteral(
    preregistration.sha256,
    R05_FROZEN_DEV_SMOKE.selectionSha256,
    "Dev Smoke preregistration sha256",
  );
  if (caseIds.some((caseId, index) => caseId !== R05_FROZEN_DEV_SMOKE.caseIds[index])) {
    invalid("Dev Smoke preregistration must equal the exact frozen 12-case ordered set");
  }

  const manifests = requireCount(rawManifests, 12, "prepared Smoke manifests")
    .map((value, index) => record(value, `prepared Smoke manifest[${index}]`));
  const byCaseId = new Map<string, { runId: string; sessionId: string }>();
  const runIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const [index, manifest] of manifests.entries()) {
    const caseId = nonBlank(manifest.case_id, `prepared Smoke manifest[${index}].case_id`);
    const runId = nonBlank(manifest.run_id, `prepared Smoke manifest[${index}].run_id`);
    const sessionId = nonBlank(manifest.session_id, `prepared Smoke manifest[${index}].session_id`);
    requireLiteral(manifest.repeat, 1, `prepared Smoke manifest[${index}] repeat`);
    if (byCaseId.has(caseId)) invalid("prepared Smoke must use the exact preregistered case set");
    if (runIds.has(runId)) invalid("prepared Smoke manifests require unique run_id values");
    if (sessionIds.has(sessionId)) invalid("prepared Smoke manifests require unique session_id values");
    byCaseId.set(caseId, { runId, sessionId });
    runIds.add(runId);
    sessionIds.add(sessionId);
  }
  if (caseIds.some((caseId) => !byCaseId.has(caseId))
    || [...byCaseId.keys()].some((caseId) => !caseIds.includes(caseId))) {
    invalid("prepared Smoke manifests must equal the exact preregistered case set");
  }
  return Object.freeze({
    selectionSha256: R05_FROZEN_DEV_SMOKE.selectionSha256,
    caseIds: Object.freeze([...caseIds]),
    runIds: Object.freeze(caseIds.map((caseId) => byCaseId.get(caseId)!.runId)),
    sessionIds: Object.freeze(caseIds.map((caseId) => byCaseId.get(caseId)!.sessionId)),
  });
}

function values(argv: readonly string[], name: string): readonly string[] {
  const found: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) invalid(`${name} requires a value`);
    found.push(value);
    index += 1;
  }
  return found;
}

function required(argv: readonly string[], name: string): string {
  const found = values(argv, name);
  if (found.length !== 1) invalid(`${name} must occur exactly once`);
  return found[0]!;
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  } catch (cause) {
    throw new Error(`R05 runtime preflight contract: ${label} is not valid JSON: ${path}`, { cause });
  }
}

export async function runR05RuntimePreflightContractCli(argv: readonly string[]): Promise<void> {
  const mode = required(argv, "--mode");
  let summary: R05RestorePlanSummary | R05RestoreObservationSummary | R05PreparedSmokeSummary;
  if (mode === "plan") {
    summary = validateR05RestorePlan(await readJson(required(argv, "--input"), "restore plan"));
  } else if (mode === "restore") {
    summary = validateR05RestoreObservations(
      await readJson(required(argv, "--input"), "restore observations"),
    );
  } else if (mode === "prepared") {
    const preregistration = await readJson(
      required(argv, "--preregistration"),
      "Dev Smoke preregistration",
    );
    const manifestPaths = values(argv, "--manifest");
    summary = validateR05PreparedSmoke(
      preregistration,
      await Promise.all(manifestPaths.map((path) => readJson(path, "prepared run manifest"))),
    );
  } else {
    invalid(`unsupported --mode ${JSON.stringify(mode)}`);
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runR05RuntimePreflightContractCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
