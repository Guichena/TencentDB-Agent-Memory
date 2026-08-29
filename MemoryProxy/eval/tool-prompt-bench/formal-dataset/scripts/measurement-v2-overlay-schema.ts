import { isDeepStrictEqual } from "node:util";
import { canonicalSha256 } from "../../worlds/formal-snapshot.js";

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
  comparisonDocument: OverlayJsonValue;
}

const MISSING = Symbol("missing");
type PresentOrMissing = OverlayJsonValue | typeof MISSING;
const ALLOWED_DELTA = "__PAIR_ALLOWED_DELTA__";

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
