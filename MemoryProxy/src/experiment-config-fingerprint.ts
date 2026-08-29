import { createHash } from "node:crypto";

import type { ProxyConfig } from "./types.js";

export const EXPERIMENT_CONFIG_FINGERPRINT_SCHEMA =
  "task1.proxy-config-fingerprint.v1" as const;

export interface ExperimentConfigFingerprint {
  readonly schemaVersion: typeof EXPERIMENT_CONFIG_FINGERPRINT_SCHEMA;
  /** Effective config with toolPromptProfile removed and secrets reduced to presence. */
  readonly baseSha256: string;
  /** The same projection plus the effective production toolPromptProfile. */
  readonly effectiveSha256: string;
}

const SECRET_KEY = /(?:api[_-]?key|password|secret|service[_-]?token|access[_-]?token|refresh[_-]?token|authorization)/iu;

type JsonProjection = null | boolean | number | string | JsonProjection[] | {
  readonly [key: string]: JsonProjection;
};

function secretPresence(value: unknown): "present" | "absent" {
  if (typeof value === "string") return value.trim().length > 0 ? "present" : "absent";
  return value === undefined || value === null || value === false ? "absent" : "present";
}

function projectConfig(value: unknown, key?: string): JsonProjection | undefined {
  if (key !== undefined && SECRET_KEY.test(key)) return secretPresence(value);
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Proxy config fingerprint cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => projectConfig(item) ?? null);
  }
  if (typeof value !== "object") return String(value);

  const output: Record<string, JsonProjection> = {};
  for (const childKey of Object.keys(value as Record<string, unknown>).sort()) {
    const projected = projectConfig((value as Record<string, unknown>)[childKey], childKey);
    if (projected !== undefined) output[childKey] = projected;
  }
  return output;
}

function digest(value: JsonProjection): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/**
 * Produce comparison-only fingerprints for the formal Task 1 runner.
 * Secret values never enter either projection; only present/absent survives.
 */
export function fingerprintProxyConfigForExperiment(
  config: ProxyConfig,
): ExperimentConfigFingerprint {
  const effective = projectConfig(config);
  if (!effective || Array.isArray(effective) || typeof effective !== "object") {
    throw new Error("Proxy config fingerprint projection must be an object");
  }
  const injection = effective.injection;
  if (!injection || Array.isArray(injection) || typeof injection !== "object") {
    throw new Error("Proxy config fingerprint is missing injection config");
  }
  const profile = injection.toolPromptProfile;
  if (typeof profile !== "string" || profile.length === 0) {
    throw new Error("Proxy config fingerprint is missing toolPromptProfile");
  }
  const baseInjection = { ...injection };
  delete baseInjection.toolPromptProfile;
  const base = {
    ...effective,
    injection: baseInjection,
  };
  return Object.freeze({
    schemaVersion: EXPERIMENT_CONFIG_FINGERPRINT_SCHEMA,
    baseSha256: digest(base),
    effectiveSha256: digest({ baseSha256: digest(base), toolPromptProfile: profile }),
  });
}
