import { isDeepStrictEqual } from "node:util";
import { canonicalSha256 } from "../../measurement-v2/canonical-json.js";

export type OverlayToolFamily = "memory" | "skill" | "knowledge";
export type OverlaySplit = "dev" | "hidden";
export type OverlayJsonValue = null | boolean | number | string | OverlayJsonValue[] | {
  [key: string]: OverlayJsonValue;
};

export interface OverlayArgumentPredicate {
  required?: string[];
  forbidden?: string[];
  exact?: Array<{ path: string; value: OverlayJsonValue }>;
  stringContainsAny?: Array<{ path: string; values: string[] }>;
}

export interface OverlayBindingPredicate {
  argumentPath: string;
  priorStepId: string;
  responsePath: string;
  comparison: "exact";
}

export interface OverlayGoldStep {
  stepId: string;
  family: OverlayToolFamily;
  tool: string;
  endpoint: string;
  method: string;
  operation: { kind: "none" } | { kind: "exact"; value: string };
  arguments?: OverlayArgumentPredicate;
  bindings: OverlayBindingPredicate[];
  runtimeContractId: string;
  terminal: boolean;
}

export interface OverlayPrivateGoldV2 {
  evaluationSchemaVersion: 2;
  caseId: string;
  expectation: "tool" | "no-tool";
  attemptBudget: number;
  allowedSequences: Array<{ sequenceId: string; steps: OverlayGoldStep[] }>;
}

export interface OverlayPairContractV2 {
  schemaVersion: "2";
  pairId: string;
  positiveCaseId: string;
  negativeCaseId: string;
  causalFactorId: string;
  allowedChangedPointers: string[];
  invariantProjectionSchemaVersion: "pair-invariant-projection-v2";
  invariantFieldsSha256: string;
  changedPointerCount: number;
  minimalityReviewStatus: "approved";
  independenceKey: string;
  split: OverlaySplit;
}

export interface OverlayPairCaseProjection {
  caseId: string;
  split: OverlaySplit;
  teamId: string;
  comparisonDocument: OverlayJsonValue;
}

export interface PairApprovalLedgerTeam {
  teamId: string;
  pairIds: string[];
  pairIdsCanonicalSha256: string;
  reviewStatus: "approved";
  reviewer: string;
  evidencePath: string;
  evidenceFileSha256: string;
  evidenceSourceCommit: string;
}

export interface PairApprovalLedger {
  schemaVersion: "task1.pair-minimality-approval-ledger.v1";
  reviewCriterion: string;
  teams: PairApprovalLedgerTeam[];
}

export interface PairApprovalExpectedPair {
  pairId: string;
  teamId: string;
}

const MISSING = Symbol("missing");
type PresentOrMissing = OverlayJsonValue | typeof MISSING;
const ALLOWED_DELTA = "__PAIR_ALLOWED_DELTA__";

function valueAtPath(value: OverlayJsonValue, path: string): OverlayJsonValue | undefined {
  let current: OverlayJsonValue | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else {
      current = Object.prototype.hasOwnProperty.call(current, segment)
        ? current[segment]
        : undefined;
    }
  }
  return current;
}

export function resolveOverlayBindingValue(
  binding: OverlayBindingPredicate,
  priorStepResponse: OverlayJsonValue,
): OverlayJsonValue | undefined {
  return valueAtPath(priorStepResponse, binding.responsePath);
}

export function validateOverlayBindingObservation(
  binding: OverlayBindingPredicate,
  priorStepResponse: OverlayJsonValue,
  argumentValue: OverlayJsonValue,
): string[] {
  const resolved = resolveOverlayBindingValue(binding, priorStepResponse);
  if (resolved === undefined) return [`${binding.priorStepId}: binding source did not resolve`];
  return isDeepStrictEqual(resolved, argumentValue)
    ? []
    : [`${binding.priorStepId}: ${binding.argumentPath} does not equal the bound response value`];
}

function pointerJoin(parent: string, key: string): string {
  return `${parent}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

function isRecord(value: PresentOrMissing): value is Record<string, OverlayJsonValue> {
  return value !== MISSING && value !== null && typeof value === "object" && !Array.isArray(value);
}

export function changedPairPointers(
  positive: PresentOrMissing,
  negative: PresentOrMissing,
  pointer = "",
): string[] {
  if (positive !== MISSING && negative !== MISSING && isDeepStrictEqual(positive, negative)) return [];
  if (positive === MISSING || negative === MISSING) return [pointer || "/"];
  if (Array.isArray(positive) && Array.isArray(negative)) {
    const result: string[] = [];
    for (let index = 0; index < Math.max(positive.length, negative.length); index += 1) {
      result.push(...changedPairPointers(
        index < positive.length ? positive[index] : MISSING,
        index < negative.length ? negative[index] : MISSING,
        pointerJoin(pointer, String(index)),
      ));
    }
    return result;
  }
  if (isRecord(positive) && isRecord(negative)) {
    const result: string[] = [];
    const keys = [...new Set([...Object.keys(positive), ...Object.keys(negative)])].sort();
    for (const key of keys) {
      result.push(...changedPairPointers(
        Object.prototype.hasOwnProperty.call(positive, key) ? positive[key] : MISSING,
        Object.prototype.hasOwnProperty.call(negative, key) ? negative[key] : MISSING,
        pointerJoin(pointer, key),
      ));
    }
    return result;
  }
  return [pointer || "/"];
}

function pointerCovers(allowed: string, actual: string): boolean {
  return actual === allowed || actual.startsWith(`${allowed}/`);
}

function maskAllowed(
  positive: PresentOrMissing,
  negative: PresentOrMissing,
  allowedPointers: readonly string[],
  pointer = "",
): readonly [OverlayJsonValue, OverlayJsonValue] {
  if (allowedPointers.some((allowed) => pointerCovers(allowed, pointer))) {
    return [ALLOWED_DELTA, ALLOWED_DELTA];
  }
  if (Array.isArray(positive) && Array.isArray(negative)) {
    const left: OverlayJsonValue[] = [];
    const right: OverlayJsonValue[] = [];
    for (let index = 0; index < Math.max(positive.length, negative.length); index += 1) {
      const masked = maskAllowed(
        index < positive.length ? positive[index] : MISSING,
        index < negative.length ? negative[index] : MISSING,
        allowedPointers,
        pointerJoin(pointer, String(index)),
      );
      left.push(masked[0]);
      right.push(masked[1]);
    }
    return [left, right];
  }
  if (isRecord(positive) && isRecord(negative)) {
    const left: Record<string, OverlayJsonValue> = Object.create(null);
    const right: Record<string, OverlayJsonValue> = Object.create(null);
    for (const key of [...new Set([...Object.keys(positive), ...Object.keys(negative)])].sort()) {
      const masked = maskAllowed(
        Object.prototype.hasOwnProperty.call(positive, key) ? positive[key] : MISSING,
        Object.prototype.hasOwnProperty.call(negative, key) ? negative[key] : MISSING,
        allowedPointers,
        pointerJoin(pointer, key),
      );
      left[key] = masked[0];
      right[key] = masked[1];
    }
    return [left, right];
  }
  if (positive === MISSING || negative === MISSING) {
    const marker = "__PAIR_INVARIANT_MISSING__";
    return [positive === MISSING ? marker : positive, negative === MISSING ? marker : negative];
  }
  return [positive, negative];
}

export function buildPairInvariantSha256(
  positive: OverlayJsonValue,
  negative: OverlayJsonValue,
  allowedPointers: readonly string[],
): { positive: OverlayJsonValue; negative: OverlayJsonValue; sha256: string } {
  const [positiveInvariant, negativeInvariant] = maskAllowed(
    positive,
    negative,
    allowedPointers,
  );
  return {
    positive: positiveInvariant,
    negative: negativeInvariant,
    sha256: canonicalSha256({
      invariantFields: positiveInvariant,
      invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
    }),
  };
}

export function validatePairApprovalCoverage(
  ledger: PairApprovalLedger,
  expectedPairs: readonly PairApprovalExpectedPair[],
): string[] {
  const errors: string[] = [];
  if (ledger.schemaVersion !== "task1.pair-minimality-approval-ledger.v1") {
    errors.push("Pair approval ledger schemaVersion mismatch");
  }
  if (ledger.reviewCriterion.trim().length === 0) errors.push("Pair approval reviewCriterion is empty");

  const expectedById = new Map(expectedPairs.map((pair) => [pair.pairId, pair.teamId]));
  if (expectedById.size !== expectedPairs.length) errors.push("Expected Pair approval input has duplicate pairIds");
  const seenTeams = new Set<string>();
  const seenPairs = new Set<string>();
  for (const team of ledger.teams) {
    if (seenTeams.has(team.teamId)) errors.push(`${team.teamId}: duplicate approval Team`);
    seenTeams.add(team.teamId);
    if (team.reviewStatus !== "approved") errors.push(`${team.teamId}: approval status is not approved`);
    if (team.reviewer.trim().length === 0) errors.push(`${team.teamId}: approval reviewer is empty`);
    if (!/^staging\/teams\/T[0-9]{2}\/gate\.json$/.test(team.evidencePath)) {
      errors.push(`${team.teamId}: invalid approval evidence path`);
    }
    if (!/^[a-f0-9]{64}$/.test(team.evidenceFileSha256)) {
      errors.push(`${team.teamId}: invalid approval evidence file SHA`);
    }
    if (!/^[a-f0-9]{40}$/.test(team.evidenceSourceCommit)) {
      errors.push(`${team.teamId}: invalid approval evidence source commit`);
    }
    if (canonicalSha256(team.pairIds) !== team.pairIdsCanonicalSha256) {
      errors.push(`${team.teamId}: pairIds canonical SHA mismatch`);
    }
    if (new Set(team.pairIds).size !== team.pairIds.length) {
      errors.push(`${team.teamId}: duplicate pairId within approval Team`);
    }
    for (const pairId of team.pairIds) {
      if (seenPairs.has(pairId)) errors.push(`${pairId}: approval appears more than once`);
      seenPairs.add(pairId);
      const expectedTeam = expectedById.get(pairId);
      if (expectedTeam === undefined) errors.push(`${pairId}: approval is not in the frozen Pair set`);
      else if (expectedTeam !== team.teamId) {
        errors.push(`${pairId}: approval Team ${team.teamId} != frozen Team ${expectedTeam}`);
      }
    }
  }
  for (const pair of expectedPairs) {
    if (!seenPairs.has(pair.pairId)) errors.push(`${pair.pairId}: missing approval evidence`);
  }
  const expectedTeams = new Set(expectedPairs.map((pair) => pair.teamId));
  for (const teamId of expectedTeams) {
    if (!seenTeams.has(teamId)) errors.push(`${teamId}: missing approval Team`);
  }
  for (const teamId of seenTeams) {
    if (!expectedTeams.has(teamId)) errors.push(`${teamId}: extra approval Team`);
  }
  return errors;
}

export function validatePairOverlay(
  pair: OverlayPairContractV2,
  positive: OverlayPairCaseProjection,
  negative: OverlayPairCaseProjection,
): string[] {
  const errors: string[] = [];
  if (pair.schemaVersion !== "2") errors.push(`${pair.pairId}: schemaVersion must be 2`);
  if (pair.invariantProjectionSchemaVersion !== "pair-invariant-projection-v2") {
    errors.push(`${pair.pairId}: unsupported invariant projection`);
  }
  if (pair.positiveCaseId !== positive.caseId || pair.negativeCaseId !== negative.caseId) {
    errors.push(`${pair.pairId}: case binding mismatch`);
  }
  if (pair.split !== positive.split || pair.split !== negative.split) {
    errors.push(`${pair.pairId}: split binding mismatch`);
  }
  if (positive.teamId !== negative.teamId) {
    errors.push(`${pair.pairId}: pair cases must belong to the same Team cluster`);
  }
  const expectedIndependenceKey = `${pair.split}:${positive.teamId}`;
  if (pair.independenceKey !== expectedIndependenceKey) {
    errors.push(`${pair.pairId}: independenceKey ${pair.independenceKey} != ${expectedIndependenceKey}`);
  }
  if (pair.minimalityReviewStatus !== "approved") errors.push(`${pair.pairId}: minimality not approved`);
  if (pair.allowedChangedPointers.length === 0) errors.push(`${pair.pairId}: no allowed changed pointer`);
  const changed = changedPairPointers(positive.comparisonDocument, negative.comparisonDocument).sort();
  if (changed.length !== pair.changedPointerCount) {
    errors.push(`${pair.pairId}: changedPointerCount ${pair.changedPointerCount} != ${changed.length}`);
  }
  const outside = changed.filter((actual) => !pair.allowedChangedPointers.some((allowed) => pointerCovers(allowed, actual)));
  if (outside.length > 0) errors.push(`${pair.pairId}: changes outside allowlist: ${outside.join(",")}`);
  for (const allowed of pair.allowedChangedPointers) {
    if (!changed.some((actual) => pointerCovers(allowed, actual))) {
      errors.push(`${pair.pairId}: unused allowed pointer ${allowed}`);
    }
  }
  const invariant = buildPairInvariantSha256(
    positive.comparisonDocument,
    negative.comparisonDocument,
    pair.allowedChangedPointers,
  );
  if (!isDeepStrictEqual(invariant.positive, invariant.negative)) {
    errors.push(`${pair.pairId}: invariant projections differ`);
  }
  if (invariant.sha256 !== pair.invariantFieldsSha256) {
    errors.push(`${pair.pairId}: invariant hash mismatch`);
  }
  return errors;
}
