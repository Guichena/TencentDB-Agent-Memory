import { createHash } from "node:crypto";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

function canonicalNumber(value: number): number {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    throw new CanonicalJsonError("canonical JSON requires finite numbers and rejects negative zero");
  }
  return value;
}

function unsupported(value: unknown): never {
  throw new CanonicalJsonError(
    `canonical JSON does not support runtime value type ${typeof value}`,
  );
}

function cloneCanonical(value: unknown, ancestors: Set<object>): CanonicalJsonValue {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalNumber(value);
  if (typeof value !== "object") return unsupported(value);
  if (ancestors.has(value)) {
    throw new CanonicalJsonError("canonical JSON does not support cyclic values");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new CanonicalJsonError("canonical JSON accepts only plain arrays");
      }
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1) {
        throw new CanonicalJsonError("canonical JSON rejects sparse or decorated arrays");
      }
      const result: CanonicalJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new CanonicalJsonError("canonical JSON rejects sparse arrays");
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          throw new CanonicalJsonError("canonical JSON accepts only enumerable array values");
        }
        result.push(cloneCanonical(descriptor.value, ancestors));
      }
      return result;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError("canonical JSON accepts only plain records");
    }
    const record = value as Record<string, unknown>;
    const result: { [key: string]: CanonicalJsonValue } = {};
    const ownKeys = Reflect.ownKeys(record);
    if (ownKeys.some((key) => typeof key === "symbol")) {
      throw new CanonicalJsonError("canonical JSON rejects symbol record keys");
    }
    for (const key of (ownKeys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new CanonicalJsonError("canonical JSON accepts only enumerable record values");
      }
      result[key] = cloneCanonical(descriptor.value, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function freezeCanonical(value: CanonicalJsonValue): CanonicalJsonValue {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeCanonical(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Produce a detached, recursively frozen JSON clone. Runtime-only values and
 * lossy JSON shapes are rejected so distinct inputs cannot share an artifact hash.
 */
export function canonicalJsonClone(value: unknown): CanonicalJsonValue {
  return freezeCanonical(cloneCanonical(value, new Set<object>()));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalJsonClone(value));
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function utf8Sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
