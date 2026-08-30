/**
 * Disabled-by-default deterministic L0/L1/L2 seed seam for Task 1 evaluation.
 *
 * The normal public APIs remain authoritative for read-back. This seam avoids
 * L0 extraction side effects; MemoryCore also has no L1 create API and
 * scenario/write is update-only.
 */
import { createHash } from "node:crypto";

import type { MemoryType, MemoryRecord } from "../core/record/l1-writer.js";
import { buildProfileIsolationScope } from "../core/profile/profile-sync.js";
import { syncSceneIndex } from "../core/scene/scene-index.js";
import { createScopedStorageAdapter, type StorageAdapter } from "../core/storage/adapter.js";
import { StoragePaths } from "../core/storage/types.js";
import type { IMemoryStore, L0Record } from "../core/store/types.js";

export interface FormalBenchmarkImportIsolation {
  readonly teamId: string;
  readonly userId: string;
  readonly agentId: string;
  readonly sessionId: string;
}

export interface FormalBenchmarkMemoryImportDeps {
  readonly enabled: boolean;
  readonly store: IMemoryStore | undefined;
  readonly storage: StorageAdapter | undefined;
  readonly isolation: FormalBenchmarkImportIsolation | undefined;
}

export type FormalBenchmarkMemoryImportResult =
  | Readonly<{
    ok: true;
    data: Readonly<{
      kind: "l0" | "l1" | "l2";
      formal_asset_id: string;
      runtime_locator:
        | Readonly<{ kind: "conversation-message"; sessionId: string; messageIds: readonly string[] }>
        | Readonly<{ kind: "asset-id"; assetId: string }>
        | Readonly<{ kind: "scenario-path"; path: string }>;
      accepted_ids?: readonly string[];
      content_sha256: string;
      expected_asset_content_hash: string;
    }>;
  }>
  | Readonly<{
    ok: false;
    httpStatus: number;
    code: number;
    message: string;
  }>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(httpStatus: number, code: number, message: string): FormalBenchmarkMemoryImportResult {
  return { ok: false, httpStatus, code, message };
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function formalType(value: string): MemoryType | undefined {
  const mapping: Readonly<Record<string, MemoryType>> = {
    decision: "work_method",
    event: "episodic",
    fact: "work_fact",
    persona: "persona",
    preference: "instruction",
  };
  return mapping[value];
}

function safeScenarioPath(value: unknown): string | undefined {
  if (!nonBlank(value) || value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return undefined;
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === ".." || part === ".")) return undefined;
  return value;
}

function validateEnvelope(body: unknown): Readonly<{
  record: JsonRecord;
  kind: "l0" | "l1" | "l2";
  formalAssetId: string;
  expectedAssetContentHash: string;
}> | undefined {
  if (!isRecord(body) || (body.kind !== "l0" && body.kind !== "l1" && body.kind !== "l2")
    || !nonBlank(body.formal_asset_id) || !validSha256(body.expected_asset_content_hash)
    || !nonBlank(body.team_id) || !nonBlank(body.user_id) || !nonBlank(body.agent_id)
    || !isRecord(body.payload)) {
    return undefined;
  }
  return {
    record: body,
    kind: body.kind,
    formalAssetId: body.formal_asset_id,
    expectedAssetContentHash: body.expected_asset_content_hash,
  };
}

async function importL0(
  body: JsonRecord,
  formalAssetId: string,
  expectedAssetContentHash: string,
  deps: FormalBenchmarkMemoryImportDeps & { isolation: FormalBenchmarkImportIsolation },
): Promise<FormalBenchmarkMemoryImportResult> {
  if (!deps.store) return fail(503, 503, "Memory store is unavailable");
  const payload = body.payload as JsonRecord;
  if (!nonBlank(payload.sessionId) || !Array.isArray(payload.messages)
    || payload.messages.length === 0 || payload.messages.length > 100) {
    return fail(400, 400, "Invalid Formal L0 import payload");
  }

  const records: L0Record[] = [];
  for (const raw of payload.messages) {
    if (!isRecord(raw) || !nonBlank(raw.id)
      || (raw.role !== "user" && raw.role !== "assistant")
      || !nonBlank(raw.content) || !nonBlank(raw.recordedAt)) {
      return fail(400, 400, "Invalid Formal L0 message");
    }
    const recordedAtMs = Date.parse(raw.recordedAt);
    if (!Number.isFinite(recordedAtMs)) {
      return fail(400, 400, "Formal L0 timestamps must be ISO-8601 values");
    }
    records.push({
      id: raw.id,
      sessionKey: payload.sessionId,
      sessionId: payload.sessionId,
      teamId: deps.isolation.teamId,
      userId: deps.isolation.userId,
      agentId: deps.isolation.agentId,
      role: raw.role,
      messageText: raw.content,
      recordedAt: new Date(recordedAtMs).toISOString(),
      timestamp: recordedAtMs,
    });
  }

  for (const record of records) {
    const written = await deps.store.upsertL0(record, undefined);
    if (!written) return fail(500, 500, "Formal L0 store upsert failed");
  }
  const rows = deps.store.queryL0Paginated
    ? (await deps.store.queryL0Paginated({
      sessionId: payload.sessionId,
      teamId: deps.isolation.teamId,
      userId: deps.isolation.userId,
      agentId: deps.isolation.agentId,
      limit: 100,
      offset: 0,
    })).rows
    : await deps.store.queryL0ForL1(payload.sessionId, undefined, 100);
  const observed = new Map(rows.map((row) => [row.record_id, row]));
  if (!records.every((record) => {
    const row = observed.get(record.id);
    return row?.session_id === record.sessionId
      && row.team_id === record.teamId
      && row.user_id === record.userId
      && row.agent_id === record.agentId
      && row.role === record.role
      && row.message_text === record.messageText;
  })) {
    return fail(500, 500, "Formal L0 read-back mismatch");
  }
  const messageIds = records.map((record) => record.id);
  return {
    ok: true,
    data: {
      kind: "l0",
      formal_asset_id: formalAssetId,
      runtime_locator: {
        kind: "conversation-message",
        sessionId: payload.sessionId,
        messageIds,
      },
      accepted_ids: messageIds,
      content_sha256: sha256(JSON.stringify(records.map((record) => ({
        id: record.id,
        role: record.role,
        content: record.messageText,
        recordedAt: record.recordedAt,
      })))),
      expected_asset_content_hash: expectedAssetContentHash,
    },
  };
}

function isolationMatches(record: JsonRecord, isolation: FormalBenchmarkImportIsolation): boolean {
  return record.team_id === isolation.teamId
    && record.user_id === isolation.userId
    && record.agent_id === isolation.agentId;
}

async function importL1(
  body: JsonRecord,
  formalAssetId: string,
  expectedAssetContentHash: string,
  deps: FormalBenchmarkMemoryImportDeps & { isolation: FormalBenchmarkImportIsolation },
): Promise<FormalBenchmarkMemoryImportResult> {
  if (!deps.store) return fail(503, 503, "Memory store is unavailable");
  const payload = body.payload as JsonRecord;
  const mappedType = nonBlank(payload.formalType) ? formalType(payload.formalType) : undefined;
  if (payload.id !== formalAssetId || !mappedType || !nonBlank(payload.content)
    || !nonBlank(payload.observedAt) || !nonBlank(payload.validFrom)) {
    return fail(400, 400, "Invalid Formal L1 import payload");
  }
  if (!Number.isFinite(Date.parse(payload.observedAt)) || !Number.isFinite(Date.parse(payload.validFrom))) {
    return fail(400, 400, "Formal L1 timestamps must be ISO-8601 values");
  }

  const record: MemoryRecord = {
    id: formalAssetId,
    content: payload.content,
    type: mappedType,
    priority: 50,
    scene_name: `formal:${payload.formalType}`,
    source_message_ids: [],
    metadata: {},
    timestamps: [payload.validFrom, payload.observedAt],
    createdAt: payload.validFrom,
    updatedAt: payload.observedAt,
    version: 1,
    sessionKey: `formal-restore:${deps.isolation.agentId}`,
    sessionId: `formal-restore:${formalAssetId}`,
    teamId: deps.isolation.teamId,
    userId: deps.isolation.userId,
    agentId: deps.isolation.agentId,
  };
  const written = await deps.store.upsertL1(record, undefined);
  if (!written) return fail(500, 500, "Formal L1 store upsert failed");
  const rows = await deps.store.queryL1Records({
    recordIds: [formalAssetId],
    teamId: deps.isolation.teamId,
    userId: deps.isolation.userId,
    agentId: deps.isolation.agentId,
  });
  const readBack = rows.find((row) => row.record_id === formalAssetId);
  if (!readBack || readBack.content !== payload.content) {
    return fail(500, 500, "Formal L1 read-back mismatch");
  }
  return {
    ok: true,
    data: {
      kind: "l1",
      formal_asset_id: formalAssetId,
      runtime_locator: { kind: "asset-id", assetId: formalAssetId },
      content_sha256: sha256(readBack.content),
      expected_asset_content_hash: expectedAssetContentHash,
    },
  };
}

async function importL2(
  body: JsonRecord,
  formalAssetId: string,
  expectedAssetContentHash: string,
  deps: FormalBenchmarkMemoryImportDeps & { isolation: FormalBenchmarkImportIsolation },
): Promise<FormalBenchmarkMemoryImportResult> {
  if (!deps.storage) return fail(503, 503, "Profile storage is unavailable");
  const payload = body.payload as JsonRecord;
  const path = safeScenarioPath(payload.path);
  if (!path || !nonBlank(payload.content) || !nonBlank(payload.summary)
    || !nonBlank(payload.observedAt) || !Number.isFinite(Date.parse(payload.observedAt))) {
    return fail(400, 400, "Invalid Formal L2 import payload");
  }
  const scope = encodeURIComponent(buildProfileIsolationScope(deps.isolation));
  const storage = createScopedStorageAdapter(deps.storage, `profiles/${scope}/`);
  const storedContent = [
    "-----META-START-----",
    `created: ${payload.observedAt}`,
    `updated: ${payload.observedAt}`,
    `summary: ${payload.summary}`,
    "heat: 0",
    "-----META-END-----",
    "",
    payload.content,
  ].join("\n");
  const key = `${StoragePaths.sceneBlocksDir}${path}`;
  await storage.writeFile(key, storedContent);
  await syncSceneIndex("", storage);
  const readBack = await storage.readFile(key);
  if (readBack !== storedContent) return fail(500, 500, "Formal L2 read-back mismatch");
  return {
    ok: true,
    data: {
      kind: "l2",
      formal_asset_id: formalAssetId,
      runtime_locator: { kind: "scenario-path", path },
      content_sha256: sha256(readBack),
      expected_asset_content_hash: expectedAssetContentHash,
    },
  };
}

/** Import one frozen L0/L1/L2 asset without starting extraction or background derivation. */
export async function importFormalBenchmarkMemory(
  body: unknown,
  deps: FormalBenchmarkMemoryImportDeps,
): Promise<FormalBenchmarkMemoryImportResult> {
  if (!deps.enabled) return fail(404, 404, "Formal benchmark import is disabled");
  const parsed = validateEnvelope(body);
  if (!parsed) return fail(400, 400, "Invalid Formal benchmark import request");
  if (!deps.isolation || !isolationMatches(parsed.record, deps.isolation)) {
    return fail(403, 403, "Formal benchmark import isolation mismatch");
  }
  return parsed.kind === "l0"
    ? importL0(parsed.record, parsed.formalAssetId, parsed.expectedAssetContentHash, {
      ...deps,
      isolation: deps.isolation,
    })
    : parsed.kind === "l1"
    ? importL1(parsed.record, parsed.formalAssetId, parsed.expectedAssetContentHash, {
      ...deps,
      isolation: deps.isolation,
    })
    : importL2(parsed.record, parsed.formalAssetId, parsed.expectedAssetContentHash, {
      ...deps,
      isolation: deps.isolation,
    });
}
