import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  BRIDGE_CORRELATION_HEADER_NAMES,
  type BridgeCompletionObserver,
  type BridgeEntryObserver,
  type ObservedBridgeCompletion,
  type ObservedBridgeEntry,
} from "./bridge-entry-observer.js";

export const TOOL_OBSERVER_EVENT_SCHEMA = "task1.tool-observer-event.v1" as const;

const SOURCE = "memory-proxy" as const;
const FILE_NAME = "memory-proxy.events.jsonl";
const SAFE_CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "AbortError",
  "DataCloneError",
]);
const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxy-authorization",
  "x-tdai-user-key",
]);
const CORRELATION_HEADERS = new Set<string>(BRIDGE_CORRELATION_HEADER_NAMES);

export interface ToolExecutionTraceEnvironment {
  TDAI_EVAL_TRACE_DIR?: string;
  TDAI_EVAL_CAMPAIGN_ID?: string;
}

export interface ToolExecutionTraceSink {
  readonly enabled: boolean;
  readonly processInstanceId?: string;
  readonly filePath?: string;
  readonly entryObserver?: BridgeEntryObserver;
  readonly completionObserver?: BridgeCompletionObserver;
  markReady(): void;
  markFinished(): void;
}

export interface ToolExecutionTraceSinkDependencies {
  randomId?: () => string;
  now?: () => Date;
  wallTimeUnixMicros?: () => string;
  appendLine?: (filePath: string, line: string) => void;
}

export interface DrainingHttpServer {
  close(callback: (error?: Error) => void): unknown;
}

/** Stop new HTTP work and wait for in-flight observers before sealing JSONL. */
export async function closeServerAndSealTrace(
  server: DrainingHttpServer,
  sink: Pick<ToolExecutionTraceSink, "markFinished">,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    try {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
  sink.markFinished();
}

/**
 * Optional formal-evaluation evidence sink. Production stays untouched unless
 * both environment variables are set. Every failure is fail-open and leaves a
 * missing or partial trace for the offline eligibility gate to reject.
 */
export function createToolExecutionTraceSinkFromEnv(
  env: ToolExecutionTraceEnvironment,
  dependencies: ToolExecutionTraceSinkDependencies = {},
): ToolExecutionTraceSink {
  const traceRoot = env.TDAI_EVAL_TRACE_DIR?.trim();
  const campaignId = env.TDAI_EVAL_CAMPAIGN_ID?.trim();
  if (
    !traceRoot
    || !campaignId
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

  const processInstanceId = safeRandomId(dependencies.randomId ?? randomUUID);
  const now = dependencies.now ?? (() => new Date());
  const wallTimeUnixMicros = dependencies.wallTimeUnixMicros
    ?? (() => String(Date.now() * 1_000));
  const appendLine = dependencies.appendLine
    ?? ((target, line) => appendFileSync(target, `${line}\n`, "utf8"));
  let sequence = 0;
  let active = true;
  let ready = false;
  let sealed = false;

  const writeEvent = (
    kind: "ready" | "begin" | "completion" | "seal",
    event?: unknown,
  ): boolean => {
    if (!active) return false;
    const envelope = {
      schemaVersion: TOOL_OBSERVER_EVENT_SCHEMA,
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

  return Object.freeze({
    enabled: true,
    processInstanceId,
    filePath,
    entryObserver: ((entry) => {
      if (!ready) return;
      writeEvent("begin", sanitizeEntry(entry));
    }) satisfies BridgeEntryObserver,
    completionObserver: ((completion) => {
      if (!ready) return;
      writeEvent("completion", sanitizeCompletion(completion));
    }) satisfies BridgeCompletionObserver,
    markReady: () => {
      if (ready || sealed || !active) return;
      ready = writeEvent("ready");
    },
    markFinished: () => {
      if (!ready || sealed || !active) return;
      sealed = writeEvent("seal", { lastDataSequence: sequence - 1 });
      if (sealed) active = false;
    },
  });
}

function disabledSink(): ToolExecutionTraceSink {
  return Object.freeze({
    enabled: false,
    markReady: () => undefined,
    markFinished: () => undefined,
  });
}

function sanitizeEntry(entry: Readonly<ObservedBridgeEntry>): Record<string, unknown> {
  return {
    correlationId: entry.correlationId,
    family: entry.family,
    endpoint: entry.endpoint,
    method: entry.method,
    ...(entry.requestBody === undefined
      ? {}
      : { requestBody: redactSensitiveFields(entry.requestBody) }),
    requestBodyCapture: entry.requestBodyCapture,
    correlationHeaders: sanitizeCorrelationHeaders(entry.correlationHeaders),
  };
}

function sanitizeCompletion(
  completion: Readonly<ObservedBridgeCompletion>,
): Record<string, unknown> {
  const keepResponseBody = completion.outcome === "response"
    && completion.status !== null
    && completion.status < 500
    && completion.responseBody !== undefined;
  return {
    schemaVersion: completion.schemaVersion,
    correlationId: completion.correlationId,
    family: completion.family,
    endpoint: completion.endpoint,
    method: completion.method,
    outcome: completion.outcome,
    status: completion.status,
    ...(keepResponseBody
      ? { responseBody: redactSensitiveFields(completion.responseBody) }
      : {}),
    ...(completion.responseBodySha256 === undefined
      ? {}
      : { responseBodySha256: completion.responseBodySha256 }),
    durationMs: completion.durationMs,
    ...(completion.failure === undefined
      ? {}
      : {
        failure: {
          name: SAFE_ERROR_NAMES.has(completion.failure.name)
            ? completion.failure.name
            : "Error",
          messageSha256: sha256(completion.failure.message),
        },
      }),
  };
}

function sanitizeCorrelationHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (CORRELATION_HEADERS.has(name) && value.trim()) sanitized[name] = value;
  }
  return sanitized;
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

function safeRandomId(randomId: () => string): string {
  try {
    const value = randomId();
    return value.trim() || randomUUID();
  } catch {
    return randomUUID();
  }
}

function safeIsoNow(now: () => Date): string {
  try {
    const value = now();
    if (!Number.isNaN(value.getTime())) return value.toISOString();
  } catch {
    // Use the production clock below.
  }
  return new Date().toISOString();
}

function safeWallTimeUnixMicros(wallTimeUnixMicros: () => string): string {
  try {
    const value = wallTimeUnixMicros();
    if (/^\d+$/.test(value)) return value;
  } catch {
    // Use the production clock below.
  }
  return String(Date.now() * 1_000);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
