import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  importFormalBenchmarkMemory,
} from "../../../MemoryCore/src/gateway/formal-benchmark-memory-import.js";
import { StorageAdapter } from "../../../MemoryCore/src/core/storage/adapter.js";
import { LocalStorageBackend } from "../../../MemoryCore/src/core/storage/local-backend.js";
import { buildProfileIsolationScope } from "../../../MemoryCore/src/core/profile/profile-sync.js";
import type { IMemoryStore } from "../../../MemoryCore/src/core/store/types.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const isolation = {
  teamId: "team-runtime",
  userId: "user-runtime",
  agentId: "agent-runtime",
  sessionId: "formal-restore",
} as const;

function l1Body() {
  return {
    kind: "l1",
    formal_asset_id: "MEM-L1",
    expected_asset_content_hash: "1".repeat(64),
    team_id: isolation.teamId,
    user_id: isolation.userId,
    agent_id: isolation.agentId,
    payload: {
      id: "MEM-L1",
      formalType: "decision",
      content: "Keep the migration behind the compatibility flag.",
      observedAt: "2026-08-29T10:00:00+08:00",
      validFrom: "2026-08-28T10:00:00+08:00",
    },
  };
}

describe("Formal benchmark MemoryCore import seam", () => {
  it("is unavailable unless the explicit experiment flag is enabled", async () => {
    const upsertL1 = vi.fn();
    const result = await importFormalBenchmarkMemory(l1Body(), {
      enabled: false,
      store: { upsertL1 } as unknown as IMemoryStore,
      storage: undefined,
      isolation,
    });

    expect(result).toEqual({
      ok: false,
      httpStatus: 404,
      code: 404,
      message: "Formal benchmark import is disabled",
    });
    expect(upsertL1).not.toHaveBeenCalled();
  });

  it("upserts an exact isolated L1 record and verifies it through the same store", async () => {
    let stored: Record<string, unknown> | undefined;
    const store = {
      upsertL1: vi.fn(async (record: Record<string, unknown>) => {
        stored = record;
        return true;
      }),
      queryL1Records: vi.fn(async () => stored ? [{
        record_id: stored.id,
        content: stored.content,
        type: stored.type,
        team_id: stored.teamId,
        user_id: stored.userId,
        agent_id: stored.agentId,
      }] : []),
    } as unknown as IMemoryStore;

    const result = await importFormalBenchmarkMemory(l1Body(), {
      enabled: true,
      store,
      storage: undefined,
      isolation,
    });

    expect(store.upsertL1).toHaveBeenCalledWith(expect.objectContaining({
      id: "MEM-L1",
      type: "work_method",
      content: "Keep the migration behind the compatibility flag.",
      teamId: "team-runtime",
      userId: "user-runtime",
      agentId: "agent-runtime",
      version: 1,
    }), undefined);
    expect(store.queryL1Records).toHaveBeenCalledWith({
      recordIds: ["MEM-L1"],
      teamId: "team-runtime",
      userId: "user-runtime",
      agentId: "agent-runtime",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        kind: "l1",
        formal_asset_id: "MEM-L1",
        runtime_locator: { kind: "asset-id", assetId: "MEM-L1" },
        content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        expected_asset_content_hash: "1".repeat(64),
      },
    });
  });

  it("creates an isolated L2 file with metadata and verifies stored bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "task1-memory-import-"));
    tempRoots.push(root);
    const storage = new StorageAdapter(new LocalStorageBackend(root));
    const body = {
      kind: "l2",
      formal_asset_id: "MEM-L2",
      expected_asset_content_hash: "2".repeat(64),
      team_id: isolation.teamId,
      user_id: isolation.userId,
      agent_id: isolation.agentId,
      payload: {
        path: "team/project/decision.md",
        content: "Use the compatibility flag until all clients migrate.",
        summary: "Migration compatibility decision",
        observedAt: "2026-08-29T10:00:00+08:00",
        formalInjected: true,
      },
    };

    const result = await importFormalBenchmarkMemory(body, {
      enabled: true,
      store: undefined,
      storage,
      isolation,
    });
    const scope = encodeURIComponent(buildProfileIsolationScope(isolation));
    const stored = await storage.readFile(
      `profiles/${scope}/scene_blocks/team/project/decision.md`,
    );

    expect(stored).toContain("-----META-START-----");
    expect(stored).toContain("summary: Migration compatibility decision");
    expect(stored).toContain("Use the compatibility flag until all clients migrate.");
    expect(result).toEqual({
      ok: true,
      data: {
        kind: "l2",
        formal_asset_id: "MEM-L2",
        runtime_locator: { kind: "scenario-path", path: "team/project/decision.md" },
        content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        expected_asset_content_hash: "2".repeat(64),
      },
    });
  });

  it("rejects malformed bodies, isolation drift, and unavailable stores", async () => {
    await expect(importFormalBenchmarkMemory({ ...l1Body(), team_id: "wrong" }, {
      enabled: true,
      store: {} as IMemoryStore,
      storage: undefined,
      isolation,
    })).resolves.toMatchObject({ ok: false, code: 403 });

    await expect(importFormalBenchmarkMemory({ ...l1Body(), payload: { id: "MEM-L1" } }, {
      enabled: true,
      store: {} as IMemoryStore,
      storage: undefined,
      isolation,
    })).resolves.toMatchObject({ ok: false, code: 400 });

    await expect(importFormalBenchmarkMemory(l1Body(), {
      enabled: true,
      store: undefined,
      storage: undefined,
      isolation,
    })).resolves.toMatchObject({ ok: false, code: 503 });
  });

  it("is wired only through the explicit v3 route and disabled-by-default server flag", () => {
    const router = readFileSync(join(
      process.cwd(),
      "..",
      "MemoryCore",
      "src",
      "gateway",
      "v2-router.ts",
    ), "utf8");
    const server = readFileSync(join(
      process.cwd(),
      "..",
      "MemoryCore",
      "src",
      "gateway",
      "server.ts",
    ), "utf8");

    expect(router).toContain('"/v3/formal-bench/import-memory": handleFormalBenchmarkMemoryImport');
    expect(router).not.toContain('"/v2/formal-bench/import-memory"');
    expect(server).toContain(
      'formalAssetImportEnabled: process.env.TDAI_FORMAL_ASSET_IMPORT_ENABLED === "1"',
    );
  });
});
