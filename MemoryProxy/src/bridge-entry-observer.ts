import { createHash, randomUUID } from "node:crypto";

export type BridgeEntryFamily = "memory" | "skill";

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

export type RequestBodyCapture =
  | Readonly<{ outcome: "captured"; rawBodySha256: string }>
  | Readonly<{ outcome: "empty" }>
  | Readonly<{
    outcome: "failed";
    failure: Readonly<{ stage: "request_body_clone"; name: string }>;
  }>;

/** Non-secret request headers that may be copied into evaluation evidence. */
export const BRIDGE_CORRELATION_HEADER_NAMES = [
  "x-conversation-id",
  "x-session-id",
  "x-chat-id",
  "x-thread-id",
  "x-tdai-service-id",
  "x-tdai-user-id",
  "x-tdai-team-id",
  "x-tdai-agent-id",
  "x-tdai-agent-source",
  "x-tdai-space-id",
] as const;

export interface ObservedBridgeEntry {
  correlationId: string;
  family: BridgeEntryFamily;
  endpoint: string;
  method: string;
  requestBody?: unknown;
  requestBodyCapture: RequestBodyCapture;
  correlationHeaders: Readonly<Record<string, string>>;
}

export type BridgeEntryObserver = (entry: Readonly<ObservedBridgeEntry>) => void;

export const TOOL_EXECUTION_COMPLETION_SCHEMA = "task1.tool-execution-completion.v1" as const;

export interface ObservedBridgeCompletion {
  schemaVersion: typeof TOOL_EXECUTION_COMPLETION_SCHEMA;
  correlationId: string;
  family: BridgeEntryFamily;
  endpoint: string;
  method: string;
  outcome: "response" | "failure";
  status: number | null;
  responseBody?: unknown;
  responseBodySha256?: string;
  durationMs: number;
  failure?: Readonly<{
    name: string;
    message: string;
  }>;
}

export type BridgeCompletionObserver = (
  completion: Readonly<ObservedBridgeCompletion>,
) => void;

export interface ObserveBridgeExecutionOptions {
  entryObserver?: BridgeEntryObserver;
  completionObserver?: BridgeCompletionObserver;
  now?: () => number;
}

/**
 * Evaluation-only observation seam at the outer MemoryProxy bridge entry.
 * No observer means no request cloning. Observation and callback failures are
 * fail-open and cannot consume or reject the production request.
 */
export async function observeBridgeEntry(
  request: Request,
  family: BridgeEntryFamily,
  observer?: BridgeEntryObserver,
): Promise<void> {
  if (!observer) return;
  try {
    const entry = await captureBridgeEntry(request, family);
    notifyObserver(observer, entry);
  } catch {
    // Entry capture is observation only and must remain fail-open.
  }
}

/**
 * Observe one complete outer bridge execution without consuming its request or
 * response. Observation remains fail-open: callback and clone failures never
 * change the production response, while handler failures are recorded and then
 * rethrown unchanged.
 */
export async function observeBridgeExecution(
  request: Request,
  family: BridgeEntryFamily,
  execute: () => Promise<Response>,
  options: ObserveBridgeExecutionOptions = {},
): Promise<Response> {
  if (!options.entryObserver && !options.completionObserver) return execute();

  const now = options.now ?? Date.now;
  const startedAt = safeNow(now);
  let entry: Readonly<ObservedBridgeEntry>;
  try {
    entry = await captureBridgeEntry(request, family);
  } catch {
    return execute();
  }
  notifyObserver(options.entryObserver, entry);

  try {
    const response = await execute();
    if (!options.completionObserver) return response;
    let completion: Readonly<ObservedBridgeCompletion>;
    try {
      completion = await captureResponseCompletion(entry, response, elapsed(startedAt, safeNow(now)));
    } catch (error) {
      completion = failureCompletion(entry, error, elapsed(startedAt, safeNow(now)), response.status);
    }
    notifyObserver(options.completionObserver, completion);
    return response;
  } catch (error) {
    notifyObserver(
      options.completionObserver,
      failureCompletion(entry, error, elapsed(startedAt, safeNow(now)), null),
    );
    throw error;
  }
}

async function captureBridgeEntry(
  request: Request,
  family: BridgeEntryFamily,
): Promise<Readonly<ObservedBridgeEntry>> {
  const correlationHeaders: Record<string, string> = {};
  for (const name of BRIDGE_CORRELATION_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value !== null && value.trim()) correlationHeaders[name] = value;
  }

  let requestBody: unknown;
  let requestBodyCapture: RequestBodyCapture;
  try {
    const rawBody = await request.clone().text();
    if (rawBody) {
      try {
        requestBody = JSON.parse(rawBody) as unknown;
      } catch {
        requestBody = rawBody;
      }
      requestBodyCapture = {
        outcome: "captured",
        rawBodySha256: createHash("sha256").update(rawBody, "utf8").digest("hex"),
      };
    } else {
      requestBodyCapture = { outcome: "empty" };
    }
  } catch (error) {
    requestBodyCapture = {
      outcome: "failed",
      failure: {
        stage: "request_body_clone",
        name: safeErrorName(error),
      },
    };
  }

  return deepFreeze({
    correlationId: `${family}-bridge:${randomUUID()}`,
    family,
    endpoint: new URL(request.url).pathname,
    method: request.method,
    ...(requestBody !== undefined ? { requestBody } : {}),
    requestBodyCapture,
    correlationHeaders,
  });
}

function safeErrorName(error: unknown): string {
  return error instanceof Error && SAFE_ERROR_NAMES.has(error.name)
    ? error.name
    : "Error";
}

async function captureResponseCompletion(
  entry: Readonly<ObservedBridgeEntry>,
  response: Response,
  durationMs: number,
): Promise<Readonly<ObservedBridgeCompletion>> {
  const rawBody = await response.clone().text();
  return deepFreeze({
    schemaVersion: TOOL_EXECUTION_COMPLETION_SCHEMA,
    correlationId: entry.correlationId,
    family: entry.family,
    endpoint: entry.endpoint,
    method: entry.method,
    outcome: "response" as const,
    status: response.status,
    responseBody: parseBody(rawBody),
    responseBodySha256: createHash("sha256").update(rawBody, "utf8").digest("hex"),
    durationMs,
  });
}

function failureCompletion(
  entry: Readonly<ObservedBridgeEntry>,
  error: unknown,
  durationMs: number,
  status: number | null,
): Readonly<ObservedBridgeCompletion> {
  return deepFreeze({
    schemaVersion: TOOL_EXECUTION_COMPLETION_SCHEMA,
    correlationId: entry.correlationId,
    family: entry.family,
    endpoint: entry.endpoint,
    method: entry.method,
    outcome: "failure" as const,
    status,
    durationMs,
    failure: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

function parseBody(rawBody: string): unknown {
  if (rawBody === "") return "";
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function elapsed(startedAt: number, completedAt: number): number {
  return Math.max(0, completedAt - startedAt);
}

function safeNow(now: () => number): number {
  try {
    const value = now();
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function notifyObserver<T>(observer: ((value: T) => void) | undefined, value: T): void {
  if (!observer) return;
  try {
    observer(value);
  } catch {
    // Evaluation observation is never allowed to alter bridge behavior.
  }
}

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (!value || typeof value !== "object") return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
