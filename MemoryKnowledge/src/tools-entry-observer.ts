import { createHash, randomUUID } from "node:crypto";

const KNOWLEDGE_CORRELATION_HEADER_NAMES = [
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

export interface ObservedKnowledgeToolsEntry {
  correlationId: string;
  family: "knowledge";
  endpoint: string;
  method: string;
  requestBody?: unknown;
  correlationHeaders: Readonly<Record<string, string>>;
}

export type KnowledgeToolsEntryObserver = (
  entry: Readonly<ObservedKnowledgeToolsEntry>,
) => void;

export const TOOL_EXECUTION_COMPLETION_SCHEMA = "task1.tool-execution-completion.v1" as const;

export interface ObservedKnowledgeToolsCompletion {
  schemaVersion: typeof TOOL_EXECUTION_COMPLETION_SCHEMA;
  correlationId: string;
  family: "knowledge";
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

export type KnowledgeToolsCompletionObserver = (
  completion: Readonly<ObservedKnowledgeToolsCompletion>,
) => void;

export interface ObserveKnowledgeToolsExecutionOptions {
  entryObserver?: KnowledgeToolsEntryObserver;
  completionObserver?: KnowledgeToolsCompletionObserver;
  now?: () => number;
}

/**
 * Optional evaluation seam at the real Knowledge tools HTTP entry.
 * Without an observer it does not clone/read the body. All observation and
 * callback failures are fail-open and cannot change the route response.
 */
export async function observeKnowledgeToolsEntry(
  request: Request,
  observer?: KnowledgeToolsEntryObserver,
): Promise<void> {
  if (!observer) return;
  try {
    const entry = await captureKnowledgeToolsEntry(request);
    notifyObserver(observer, entry);
  } catch {
    // Entry capture is observation only and must remain fail-open.
  }
}

/** Observe one complete /tools/list or /tools/call execution fail-open. */
export async function observeKnowledgeToolsExecution(
  request: Request,
  execute: () => Promise<Response>,
  options: ObserveKnowledgeToolsExecutionOptions = {},
): Promise<Response> {
  if (!options.entryObserver && !options.completionObserver) return execute();

  const now = options.now ?? Date.now;
  const startedAt = safeNow(now);
  let entry: Readonly<ObservedKnowledgeToolsEntry>;
  try {
    entry = await captureKnowledgeToolsEntry(request);
  } catch {
    return execute();
  }
  notifyObserver(options.entryObserver, entry);

  try {
    const response = await execute();
    if (!options.completionObserver) return response;
    let completion: Readonly<ObservedKnowledgeToolsCompletion>;
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

async function captureKnowledgeToolsEntry(
  request: Request,
): Promise<Readonly<ObservedKnowledgeToolsEntry>> {
  const correlationHeaders: Record<string, string> = {};
  for (const name of KNOWLEDGE_CORRELATION_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value !== null && value.trim()) correlationHeaders[name] = value;
  }

  let requestBody: unknown;
  try {
    const rawBody = await request.clone().text();
    if (rawBody) {
      try {
        requestBody = JSON.parse(rawBody) as unknown;
      } catch {
        requestBody = rawBody;
      }
    }
  } catch {
    // Observation must never consume or fail the production request.
  }

  return deepFreeze({
    correlationId: `knowledge-tools:${randomUUID()}`,
    family: "knowledge",
    endpoint: new URL(request.url).pathname,
    method: request.method,
    ...(requestBody !== undefined ? { requestBody } : {}),
    correlationHeaders,
  });
}

async function captureResponseCompletion(
  entry: Readonly<ObservedKnowledgeToolsEntry>,
  response: Response,
  durationMs: number,
): Promise<Readonly<ObservedKnowledgeToolsCompletion>> {
  const rawBody = await response.clone().text();
  return deepFreeze({
    schemaVersion: TOOL_EXECUTION_COMPLETION_SCHEMA,
    correlationId: entry.correlationId,
    family: "knowledge" as const,
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
  entry: Readonly<ObservedKnowledgeToolsEntry>,
  error: unknown,
  durationMs: number,
  status: number | null,
): Readonly<ObservedKnowledgeToolsCompletion> {
  return deepFreeze({
    schemaVersion: TOOL_EXECUTION_COMPLETION_SCHEMA,
    correlationId: entry.correlationId,
    family: "knowledge" as const,
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
    // Evaluation observation is never allowed to alter Knowledge behavior.
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
