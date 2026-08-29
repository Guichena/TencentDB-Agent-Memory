import { randomUUID } from "node:crypto";

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

  const entry: Readonly<ObservedKnowledgeToolsEntry> = deepFreeze({
    correlationId: `knowledge-tools:${randomUUID()}`,
    family: "knowledge",
    endpoint: new URL(request.url).pathname,
    method: request.method,
    ...(requestBody !== undefined ? { requestBody } : {}),
    correlationHeaders,
  });

  try {
    observer(entry);
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
