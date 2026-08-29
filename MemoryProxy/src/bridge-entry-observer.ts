import { randomUUID } from "node:crypto";

export type BridgeEntryFamily = "memory" | "skill";

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
  correlationHeaders: Readonly<Record<string, string>>;
}

export type BridgeEntryObserver = (entry: Readonly<ObservedBridgeEntry>) => void;

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

  const correlationHeaders: Record<string, string> = {};
  for (const name of BRIDGE_CORRELATION_HEADER_NAMES) {
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

  const entry: Readonly<ObservedBridgeEntry> = deepFreeze({
    correlationId: `${family}-bridge:${randomUUID()}`,
    family,
    endpoint: new URL(request.url).pathname,
    method: request.method,
    ...(requestBody !== undefined ? { requestBody } : {}),
    correlationHeaders,
  });

  try {
    observer(entry);
  } catch {
    // The evaluation observer is never allowed to alter bridge behavior.
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
