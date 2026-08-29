import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export type PairSplitV2 = "dev" | "hidden";

export const PAIR_CONTRACT_SCHEMA_VERSION = "2" as const;
export const PAIR_INVARIANT_PROJECTION_SCHEMA_VERSION = "pair-invariant-projection-v2" as const;

export type PairJsonValue =
  | null
  | boolean
  | number
  | string
  | PairJsonValue[]
  | { [key: string]: PairJsonValue };

export interface PairCaseProjectionV2 {
  readonly caseId: string;
  readonly split: PairSplitV2;
  readonly comparisonDocument: PairJsonValue;
}

export interface PairContractV2 {
  readonly schemaVersion: "2";
  readonly pairId: string;
  readonly positiveCaseId: string;
  readonly negativeCaseId: string;
  readonly causalFactorId: string;
  readonly allowedChangedPointers: readonly string[];
  readonly invariantProjectionSchemaVersion: string;
  readonly invariantFieldsSha256: string;
  readonly changedPointerCount: number;
  readonly minimalityReviewStatus: "approved" | "pending" | "rejected";
  readonly independenceKey: string;
  readonly split: PairSplitV2;
}

export interface ValidatedPairContractV2 {
  readonly contract: PairContractV2;
  readonly changedPointers: readonly string[];
  readonly computedInvariantFieldsSha256: string;
}

export interface PairContractValidationErrorV2 {
  readonly code: string;
  readonly message: string;
  readonly pointer?: string;
}

export type PairContractValidationResultV2 =
  | { readonly ok: true; readonly value: ValidatedPairContractV2 }
  | { readonly ok: false; readonly errors: readonly PairContractValidationErrorV2[] };

const ALLOWED_DELTA = "__PAIR_ALLOWED_DELTA__";
const MISSING = Symbol("pair-contract-missing");
type PresentOrMissing = PairJsonValue | typeof MISSING;

function pointerJoin(parent: string, key: string): string {
  const escaped = key.replace(/~/g, "~0").replace(/\//g, "~1");
  return `${parent}/${escaped}`;
}

function isRecord(value: PresentOrMissing): value is Record<string, PairJsonValue> {
  return value !== MISSING && value !== null && typeof value === "object" && !Array.isArray(value);
}

function changedPointers(
  positive: PresentOrMissing,
  negative: PresentOrMissing,
  pointer = "",
): string[] {
  if (positive !== MISSING && negative !== MISSING && isDeepStrictEqual(positive, negative)) return [];
  if (positive === MISSING || negative === MISSING) return [pointer || "/"];

  if (Array.isArray(positive) && Array.isArray(negative)) {
    const pointers: string[] = [];
    const length = Math.max(positive.length, negative.length);
    for (let index = 0; index < length; index += 1) {
      pointers.push(...changedPointers(
        index < positive.length ? positive[index] : MISSING,
        index < negative.length ? negative[index] : MISSING,
        pointerJoin(pointer, String(index)),
      ));
    }
    return pointers;
  }

  if (isRecord(positive) && isRecord(negative)) {
    const pointers: string[] = [];
    const keys = [...new Set([...Object.keys(positive), ...Object.keys(negative)])].sort();
    for (const key of keys) {
      pointers.push(...changedPointers(
        Object.prototype.hasOwnProperty.call(positive, key) ? positive[key] : MISSING,
        Object.prototype.hasOwnProperty.call(negative, key) ? negative[key] : MISSING,
        pointerJoin(pointer, key),
      ));
    }
    return pointers;
  }

  return [pointer || "/"];
}

function pointerCovers(allowed: string, actual: string): boolean {
  return actual === allowed || actual.startsWith(`${allowed}/`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is PairJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isPlainRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isPairSplit(value: unknown): value is PairSplitV2 {
  return value === "dev" || value === "hidden";
}

function isJsonPointer(pointer: string): boolean {
  return /^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/.test(pointer);
}

function structuralErrors(
  contract: unknown,
  positiveCase: unknown,
  negativeCase: unknown,
): PairContractValidationErrorV2[] {
  const errors: PairContractValidationErrorV2[] = [];
  if (!isPlainRecord(contract)) {
    errors.push({ code: "INVALID_CONTRACT_SHAPE", message: "contract must be an object" });
  } else if (
    !Array.isArray(contract.allowedChangedPointers)
    || !contract.allowedChangedPointers.every((pointer) => typeof pointer === "string")
  ) {
    errors.push({
      code: "INVALID_CONTRACT_SHAPE",
      message: "allowedChangedPointers must be a string array",
      pointer: "/allowedChangedPointers",
    });
  }

  for (const [side, pairCase] of [
    ["positive", positiveCase],
    ["negative", negativeCase],
  ] as const) {
    if (
      !isPlainRecord(pairCase)
      || typeof pairCase.caseId !== "string"
      || pairCase.caseId.trim().length === 0
      || !isPairSplit(pairCase.split)
      || !Object.prototype.hasOwnProperty.call(pairCase, "comparisonDocument")
      || !isJsonValue(pairCase.comparisonDocument)
    ) {
      errors.push({
        code: "INVALID_CONTRACT_SHAPE",
        message: `${side} case must contain caseId, split, and a JSON comparisonDocument`,
      });
    }
  }
  return errors;
}

function maskAllowed(
  positive: PresentOrMissing,
  negative: PresentOrMissing,
  allowedPointers: readonly string[],
  pointer = "",
): readonly [PairJsonValue, PairJsonValue] {
  if (allowedPointers.some((allowed) => pointerCovers(allowed, pointer))) {
    return [ALLOWED_DELTA, ALLOWED_DELTA];
  }

  if (Array.isArray(positive) && Array.isArray(negative)) {
    const positiveMasked: PairJsonValue[] = [];
    const negativeMasked: PairJsonValue[] = [];
    const length = Math.max(positive.length, negative.length);
    for (let index = 0; index < length; index += 1) {
      const [maskedPositive, maskedNegative] = maskAllowed(
        index < positive.length ? positive[index] : MISSING,
        index < negative.length ? negative[index] : MISSING,
        allowedPointers,
        pointerJoin(pointer, String(index)),
      );
      positiveMasked.push(maskedPositive);
      negativeMasked.push(maskedNegative);
    }
    return [positiveMasked, negativeMasked];
  }

  if (isRecord(positive) && isRecord(negative)) {
    const positiveMasked: Record<string, PairJsonValue> = {};
    const negativeMasked: Record<string, PairJsonValue> = {};
    const keys = [...new Set([...Object.keys(positive), ...Object.keys(negative)])].sort();
    for (const key of keys) {
      const [maskedPositive, maskedNegative] = maskAllowed(
        Object.prototype.hasOwnProperty.call(positive, key) ? positive[key] : MISSING,
        Object.prototype.hasOwnProperty.call(negative, key) ? negative[key] : MISSING,
        allowedPointers,
        pointerJoin(pointer, key),
      );
      positiveMasked[key] = maskedPositive;
      negativeMasked[key] = maskedNegative;
    }
    return [positiveMasked, negativeMasked];
  }

  if (positive === MISSING || negative === MISSING) {
    const missingMarker = "__PAIR_INVARIANT_MISSING__";
    return [positive === MISSING ? missingMarker : positive, negative === MISSING ? missingMarker : negative];
  }

  return [positive, negative];
}

function canonicalJson(value: PairJsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function invariantHash(schemaVersion: string, invariantFields: PairJsonValue): string {
  return createHash("sha256")
    .update(canonicalJson({ invariantFields, invariantProjectionSchemaVersion: schemaVersion }))
    .digest("hex");
}

export function validatePairContractV2(
  contractInput: unknown,
  positiveCaseInput: unknown,
  negativeCaseInput: unknown,
): PairContractValidationResultV2 {
  const shapeErrors = structuralErrors(contractInput, positiveCaseInput, negativeCaseInput);
  if (shapeErrors.length > 0) return { ok: false, errors: shapeErrors };

  const contract = contractInput as PairContractV2;
  const positiveCase = positiveCaseInput as PairCaseProjectionV2;
  const negativeCase = negativeCaseInput as PairCaseProjectionV2;
  const errors: PairContractValidationErrorV2[] = [];
  const requiredStrings: ReadonlyArray<readonly [string, unknown]> = [
    ["pairId", contract.pairId],
    ["positiveCaseId", contract.positiveCaseId],
    ["negativeCaseId", contract.negativeCaseId],
    ["causalFactorId", contract.causalFactorId],
    ["invariantProjectionSchemaVersion", contract.invariantProjectionSchemaVersion],
    ["invariantFieldsSha256", contract.invariantFieldsSha256],
    ["independenceKey", contract.independenceKey],
  ];
  for (const [field, value] of requiredStrings) {
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({
        code: "MISSING_REQUIRED_FIELD",
        message: `${field} must be a non-empty string`,
        pointer: `/${field}`,
      });
    }
  }
  if (contract.schemaVersion !== PAIR_CONTRACT_SCHEMA_VERSION) {
    errors.push({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      message: `schemaVersion must be ${PAIR_CONTRACT_SCHEMA_VERSION}`,
      pointer: "/schemaVersion",
    });
  }
  if (contract.invariantProjectionSchemaVersion !== PAIR_INVARIANT_PROJECTION_SCHEMA_VERSION) {
    errors.push({
      code: "UNSUPPORTED_INVARIANT_PROJECTION_SCHEMA",
      message: `invariantProjectionSchemaVersion must be ${PAIR_INVARIANT_PROJECTION_SCHEMA_VERSION}`,
      pointer: "/invariantProjectionSchemaVersion",
    });
  }
  if (!isPairSplit(contract.split)) {
    errors.push({ code: "INVALID_SPLIT", message: "split must be dev or hidden", pointer: "/split" });
  }
  if (!Number.isInteger(contract.changedPointerCount) || contract.changedPointerCount < 0) {
    errors.push({
      code: "INVALID_CHANGED_POINTER_COUNT",
      message: "changedPointerCount must be a non-negative integer",
      pointer: "/changedPointerCount",
    });
  }
  if (typeof contract.invariantFieldsSha256 !== "string" || !/^[a-f0-9]{64}$/.test(contract.invariantFieldsSha256)) {
    errors.push({
      code: "INVALID_SHA256",
      message: "invariantFieldsSha256 must be a lowercase SHA-256 hex digest",
      pointer: "/invariantFieldsSha256",
    });
  }
  if (contract.allowedChangedPointers.length === 0) {
    errors.push({
      code: "EMPTY_ALLOWED_POINTERS",
      message: "allowedChangedPointers must contain the pre-registered causal delta",
      pointer: "/allowedChangedPointers",
    });
  }
  for (const pointer of contract.allowedChangedPointers) {
    if (pointer === "/") {
      errors.push({
        code: "ROOT_POINTER_NOT_ALLOWED",
        message: "the document root cannot be an allowed causal delta",
        pointer,
      });
    } else if (!isJsonPointer(pointer)) {
      errors.push({ code: "INVALID_JSON_POINTER", message: `${pointer} is not a valid JSON Pointer`, pointer });
    }
  }
  if (new Set(contract.allowedChangedPointers).size !== contract.allowedChangedPointers.length) {
    errors.push({
      code: "DUPLICATE_ALLOWED_POINTER",
      message: "allowedChangedPointers must not contain duplicates",
      pointer: "/allowedChangedPointers",
    });
  }
  for (let left = 0; left < contract.allowedChangedPointers.length; left += 1) {
    for (let right = left + 1; right < contract.allowedChangedPointers.length; right += 1) {
      const a = contract.allowedChangedPointers[left];
      const b = contract.allowedChangedPointers[right];
      if (a !== b && (pointerCovers(a, b) || pointerCovers(b, a))) {
        errors.push({
          code: "OVERLAPPING_ALLOWED_POINTERS",
          message: `${a} and ${b} overlap; freeze only the minimal pointer set`,
          pointer: "/allowedChangedPointers",
        });
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const actualChangedPointers = changedPointers(
    positiveCase.comparisonDocument,
    negativeCase.comparisonDocument,
  ).sort();
  const outsideAllowlist = actualChangedPointers.filter((pointer) => (
    !contract.allowedChangedPointers.some((allowed) => pointerCovers(allowed, pointer))
  ));
  const [positiveInvariant, negativeInvariant] = maskAllowed(
    positiveCase.comparisonDocument,
    negativeCase.comparisonDocument,
    contract.allowedChangedPointers,
  );
  const computedInvariantFieldsSha256 = invariantHash(
    contract.invariantProjectionSchemaVersion,
    positiveInvariant,
  );

  if (
    contract.positiveCaseId !== positiveCase.caseId
    || contract.negativeCaseId !== negativeCase.caseId
    || positiveCase.caseId === negativeCase.caseId
  ) {
    errors.push({
      code: "CASE_ID_MISMATCH",
      message: "pair case identities must be distinct and match the compared cases",
    });
  }
  if (contract.minimalityReviewStatus !== "approved") {
    errors.push({
      code: "MINIMALITY_NOT_APPROVED",
      message: "minimalityReviewStatus must be approved",
    });
  }
  if (
    positiveCase.split !== negativeCase.split
    || contract.split !== positiveCase.split
    || contract.split !== negativeCase.split
  ) {
    errors.push({
      code: "SPLIT_MISMATCH",
      message: "both pair cases and the contract must use the same split",
    });
  }
  if (contract.changedPointerCount !== actualChangedPointers.length) {
    errors.push({
      code: "CHANGED_POINTER_COUNT_MISMATCH",
      message: `changedPointerCount=${contract.changedPointerCount} but observed ${actualChangedPointers.length}`,
    });
  }
  for (const allowed of contract.allowedChangedPointers) {
    if (!actualChangedPointers.some((actual) => pointerCovers(allowed, actual))) {
      errors.push({
        code: "UNUSED_ALLOWED_POINTER",
        message: `allowed pointer ${allowed} does not cover an observed change`,
        pointer: allowed,
      });
    }
  }
  if (outsideAllowlist.length > 0) {
    errors.push(...outsideAllowlist.map((pointer) => ({
      code: "CHANGE_OUTSIDE_ALLOWLIST",
      message: `changed pointer ${pointer} is outside allowedChangedPointers`,
      pointer,
    })));
  }
  if (!isDeepStrictEqual(positiveInvariant, negativeInvariant)) {
    errors.push({
      code: "INVARIANT_PROJECTION_MISMATCH",
      message: "positive and negative invariant projections differ",
    });
  }
  if (computedInvariantFieldsSha256 !== contract.invariantFieldsSha256) {
    errors.push({
      code: "INVARIANT_HASH_MISMATCH",
      message: "invariantFieldsSha256 does not match the computed invariant projection",
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      contract,
      changedPointers: actualChangedPointers,
      computedInvariantFieldsSha256,
    },
  };
}
