import { createHash } from "node:crypto";

export class CanonicalJsonValidationError extends TypeError {
  readonly code = "INVALID_CANONICAL_JSON_VALUE" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonValidationError";
  }
}

function invalidCanonicalJson(message: string): never {
  throw new CanonicalJsonValidationError(message);
}

function canonicalJsonValueV2(
  value: unknown,
  ancestors: WeakSet<object>,
): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      return invalidCanonicalJson("canonical JSON numbers must be finite and must not be negative zero");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    return invalidCanonicalJson("canonical JSON accepts only JSON scalar, array, and record values");
  }
  if (ancestors.has(value)) return invalidCanonicalJson("canonical JSON must not contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return invalidCanonicalJson("canonical JSON arrays must use Array.prototype");
      }
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1) {
        return invalidCanonicalJson("canonical JSON arrays must be dense and undecorated");
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor)) {
          return invalidCanonicalJson("canonical JSON arrays must contain dense data properties");
        }
        items.push(canonicalJsonValueV2(descriptor.value, ancestors));
      }
      if (ownKeys.some((key) => typeof key !== "string"
        || (key !== "length" && !/^0$|^[1-9][0-9]*$/.test(key)))) {
        return invalidCanonicalJson("canonical JSON arrays must not have decorated properties");
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidCanonicalJson("canonical JSON records must use Object.prototype or a null prototype");
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      return invalidCanonicalJson("canonical JSON records must not contain symbol keys");
    }
    const entries = (ownKeys as string[]).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return invalidCanonicalJson("canonical JSON records require enumerable data properties");
      }
      return `${JSON.stringify(key)}:${canonicalJsonValueV2(descriptor.value, ancestors)}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Canonical JSON used by measurement-v2 identities and persisted evidence.
 * Object keys are lexical, array order is retained, and non-JSON values fail
 * closed instead of acquiring JavaScript-specific string representations.
 */
export function canonicalJsonV2(value: unknown): string {
  try {
    return canonicalJsonValueV2(value, new WeakSet());
  } catch (error) {
    if (error instanceof CanonicalJsonValidationError) throw error;
    throw new CanonicalJsonValidationError("canonical JSON validation could not inspect the runtime value");
  }
}

export function sha256CanonicalJsonV2(value: unknown): string {
  return createHash("sha256").update(canonicalJsonV2(value)).digest("hex");
}
