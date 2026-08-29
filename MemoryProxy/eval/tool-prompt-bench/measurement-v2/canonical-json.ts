import { createHash } from "node:crypto";

/**
 * Canonical JSON used by measurement-v2 identities and persisted evidence.
 * Object keys are lexical, array order is retained, and non-JSON values fail
 * closed instead of acquiring JavaScript-specific string representations.
 */
export function canonicalJsonV2(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("canonical JSON requires finite numbers");
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("canonical JSON requires JSON values");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonV2).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonV2(record[key])}`)
    .join(",")}}`;
}

export function sha256CanonicalJsonV2(value: unknown): string {
  return createHash("sha256").update(canonicalJsonV2(value)).digest("hex");
}
