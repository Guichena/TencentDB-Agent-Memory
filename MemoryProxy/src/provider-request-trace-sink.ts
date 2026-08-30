import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  freezeProviderPromptSourceEvidence,
  type ProductionPromptSourceManifest,
} from "./injection/production-source.js";

export const PROVIDER_REQUEST_EVENT_SCHEMA = "task1.provider-request-event.v1" as const;

const SOURCE = "memory-proxy-provider" as const;
const FILE_NAME = "memory-proxy.provider-requests.jsonl";
const SAFE_CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_CORRELATION_HEADERS = new Set([
  "session-id",
  "x-agent-id",
  "x-conversation-id",
  "x-task-id",
  "x-team-id",
]);
const SAFE_RESPONSE_HEADERS = new Set([
  "openai-processing-ms",
  "x-request-id",
]);
const SENSITIVE_KEYS = new Set([
  "api-key",
  "api_key",
  "apikey",
  "authorization",
  "password",
  "proxy-authorization",
  "secret",
  "token",
  "x-api-key",
  "x-tdai-user-key",
]);

export interface ProviderRequestTraceEnvironment {
  TDAI_EVAL_TRACE_DIR?: string;
  TDAI_EVAL_CAMPAIGN_ID?: string;
}

export interface ProviderRequestEvidence {
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly rawBody: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly correlationHeaders: Readonly<Record<string, string>>;
  /** Exact production ContextBlock/PromptUnit provenance for this request. */
  readonly productionSourceManifest?: ProductionPromptSourceManifest;
}

export interface ProviderCompletionEvidence {
  readonly correlationId: string;
  readonly status: number | null;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly usage?: Readonly<Record<string, unknown>> | null;
  readonly responseBodySha256?: string;
  readonly failureMessage?: string;
}

export interface ProviderRequestObserver {
  observeRequest(evidence: ProviderRequestEvidence): void;
  observeCompletion(evidence: ProviderCompletionEvidence): void;
  track(task: Promise<unknown>): void;
}

export interface ProviderRequestTraceSink extends ProviderRequestObserver {
  readonly enabled: boolean;
  readonly processInstanceId?: string;
  readonly filePath?: string;
  markReady(): void;
  markFinished(): Promise<void>;
}

export interface ProviderRequestTraceSinkDependencies {
  readonly processInstanceId: string;
  readonly now?: () => Date;
  readonly wallTimeUnixMicros?: () => string;
  readonly appendLine?: (filePath: string, line: string) => void;
}

/**
 * Formal-only observer for the exact request after production injection and
 * immediately before the official provider boundary. It is inert unless both
 * campaign variables are present.
 */
export function createProviderRequestTraceSinkFromEnv(
  env: ProviderRequestTraceEnvironment,
  dependencies: ProviderRequestTraceSinkDependencies,
): ProviderRequestTraceSink {
  const traceRoot = env.TDAI_EVAL_TRACE_DIR?.trim();
  const campaignId = env.TDAI_EVAL_CAMPAIGN_ID?.trim();
  const processInstanceId = dependencies.processInstanceId.trim();
  if (
    !traceRoot
    || !campaignId
    || !processInstanceId
    || !isAbsolute(traceRoot)
    || !SAFE_CAMPAIGN_ID.test(campaignId)
  ) {
    return disabledSink();
  }

  const filePath = join(traceRoot, campaignId, FILE_NAME);
  try {
    mkdirSync(join(traceRoot, campaignId), { recursive: true });
    closeSync(openSync(filePath, "wx"));
  } catch {
    return disabledSink();
  }

  const now = dependencies.now ?? (() => new Date());
  const wallTimeUnixMicros = dependencies.wallTimeUnixMicros
    ?? (() => String(Date.now() * 1_000));
  const appendLine = dependencies.appendLine
    ?? ((target, line) => appendFileSync(target, `${line}\n`, "utf8"));
  const pending = new Set<Promise<unknown>>();
  let sequence = 0;
  let active = true;
  let ready = false;
  let finishing = false;
  let sealed = false;

  const writeEvent = (
    kind: "ready" | "request" | "completion" | "seal",
    event?: unknown,
  ): boolean => {
    if (!active) return false;
    const envelope = {
      schemaVersion: PROVIDER_REQUEST_EVENT_SCHEMA,
      kind,
      campaignId,
      source: SOURCE,
      processInstanceId,
      sequence,
      observedAt: safeIsoNow(now),
      wallTimeUnixMicros: safeWallTimeUnixMicros(wallTimeUnixMicros),
      ...(event === undefined ? {} : { event }),
    };
    try {
      appendLine(filePath, JSON.stringify(envelope));
      sequence += 1;
      return true;
    } catch {
      active = false;
      return false;
    }
  };

  return {
    enabled: true,
    processInstanceId,
    filePath,
    markReady: () => {
      if (ready || finishing || sealed || !active) return;
      ready = writeEvent("ready");
    },
    observeRequest: (evidence) => {
      if (!ready || finishing || sealed || !active) return;
      const rawBodySha256 = sha256(evidence.rawBody);
      const productionSourceEvidence = evidence.productionSourceManifest
        ? freezeProviderPromptSourceEvidence({
            correlationId: evidence.correlationId,
            rawBodySha256,
            sourceManifest: evidence.productionSourceManifest,
          })
        : undefined;
      writeEvent("request", {
        correlationId: evidence.correlationId,
        method: evidence.method,
        path: evidence.path,
        rawBodySha256,
        body: redactSensitiveFields(evidence.body),
        correlationHeaders: keepHeaders(
          evidence.correlationHeaders,
          SAFE_CORRELATION_HEADERS,
        ),
        ...(productionSourceEvidence ? { productionSourceEvidence } : {}),
      });
    },
    observeCompletion: (evidence) => {
      // Completions from response readers already registered in `pending` are
      // still authoritative while shutdown is waiting for them.
      if (!ready || sealed || !active) return;
      writeEvent("completion", {
        correlationId: evidence.correlationId,
        status: evidence.status,
        responseHeaders: keepHeaders(
          evidence.responseHeaders,
          SAFE_RESPONSE_HEADERS,
        ),
        ...(evidence.usage && typeof evidence.usage === "object"
          ? { usage: redactSensitiveFields(evidence.usage) }
          : {}),
        ...(evidence.responseBodySha256
          ? { responseBodySha256: evidence.responseBodySha256 }
          : {}),
        ...(evidence.failureMessage
          ? { failureMessageSha256: sha256(evidence.failureMessage) }
          : {}),
      });
    },
    track: (task) => {
      if (finishing || sealed || !active) return;
      const tracked = Promise.resolve(task).catch(() => undefined);
      pending.add(tracked);
      void tracked.finally(() => pending.delete(tracked));
    },
    markFinished: async () => {
      if (!ready || finishing || sealed || !active) return;
      finishing = true;
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
      sealed = writeEvent("seal", { lastDataSequence: sequence - 1 });
      if (sealed) active = false;
    },
  };
}

/** Extract the last provider-authoritative usage object from Responses SSE. */
export function extractCompletedResponseUsage(
  sseText: string,
): Record<string, unknown> | null {
  let usage: Record<string, unknown> | null = null;
  for (const line of sseText.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      if (event.type !== "response.completed") continue;
      const response = event.response;
      if (!response || typeof response !== "object" || Array.isArray(response)) continue;
      const candidate = (response as Record<string, unknown>).usage;
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        usage = candidate as Record<string, unknown>;
      }
    } catch {
      // Malformed provider evidence is represented by missing usage offline.
    }
  }
  return usage;
}

function disabledSink(): ProviderRequestTraceSink {
  return Object.freeze({
    enabled: false,
    observeRequest: () => undefined,
    observeCompletion: () => undefined,
    track: () => undefined,
    markReady: () => undefined,
    markFinished: async () => undefined,
  });
}

function keepHeaders(
  headers: Readonly<Record<string, string>>,
  allowlist: ReadonlySet<string>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    const value = rawValue.trim();
    if (allowlist.has(name) && value) kept[name] = value;
  }
  return kept;
}

function redactSensitiveFields(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, seen));
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? "[REDACTED]"
      : redactSensitiveFields(child, seen);
  }
  return sanitized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeIsoNow(now: () => Date): string {
  try {
    const value = now();
    if (!Number.isNaN(value.getTime())) return value.toISOString();
  } catch {
    // Fall back to the production clock.
  }
  return new Date().toISOString();
}

function safeWallTimeUnixMicros(wallTimeUnixMicros: () => string): string {
  try {
    const value = wallTimeUnixMicros();
    if (/^[0-9]+$/.test(value)) return value;
  } catch {
    // Fall back to the production clock.
  }
  return String(Date.now() * 1_000);
}
