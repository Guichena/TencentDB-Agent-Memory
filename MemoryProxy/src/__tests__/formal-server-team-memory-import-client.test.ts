import { describe, expect, it, vi } from "vitest";

import {
  createServerTeamMemoryImportHooks,
  ServerTeamMemoryImportClientError,
} from "../../eval/tool-prompt-bench/formal-assets/server-team-memory-import-client.js";
import type { ProductionRestoreTransport } from "../../eval/tool-prompt-bench/formal-assets/production-restore-executor.js";

const input = {
  requirementId: "req-l1",
  formalAssetId: "MEM-L1",
  expectedAssetContentHash: "a".repeat(64),
  isolation: {
    team_id: "team-runtime",
    user_id: "user-runtime",
    agent_id: "agent-runtime",
  },
  payload: { id: "MEM-L1", content: "memory content" },
} as const;

describe("server_team Memory import client", () => {
  it("calls the disabled-by-default MemoryCore seam through the production transport", async () => {
    const transport = vi.fn(async () => ({
      status: 200,
      body: {
        code: 0,
        data: {
          kind: "l1",
          formal_asset_id: "MEM-L1",
          runtime_locator: { kind: "asset-id", assetId: "MEM-L1" },
          content_sha256: "b".repeat(64),
          expected_asset_content_hash: "a".repeat(64),
        },
      },
    })) as unknown as ProductionRestoreTransport;
    const hooks = createServerTeamMemoryImportHooks({
      transport,
      datasetSpaceId: "SPACE-01",
      datasetUserId: "USER-01",
    });

    const evidence = await hooks.importMemoryL1(input);

    expect(transport).toHaveBeenCalledWith({
      actionId: "req-l1",
      serviceBoundary: "memory_core",
      method: "POST",
      endpoint: "/v3/formal-bench/import-memory",
      executionIdentity: {
        datasetSpaceId: "SPACE-01",
        datasetUserId: "USER-01",
      },
      headers: {},
      body: {
        kind: "l1",
        formal_asset_id: "MEM-L1",
        expected_asset_content_hash: "a".repeat(64),
        team_id: "team-runtime",
        user_id: "user-runtime",
        agent_id: "agent-runtime",
        payload: { id: "MEM-L1", content: "memory content" },
      },
    });
    expect(evidence).toEqual({
      kind: "l1",
      formalAssetId: "MEM-L1",
      runtimeLocator: { kind: "asset-id", assetId: "MEM-L1" },
      contentSha256: "b".repeat(64),
      expectedAssetContentHash: "a".repeat(64),
    });
    expect(JSON.stringify(evidence)).not.toContain("memory content");
  });

  it("uses the same client for L2 and rejects status, envelope, and identity drift", async () => {
    const goodTransport = vi.fn(async () => ({
      status: 200,
      body: {
        code: 0,
        data: {
          kind: "l2",
          formal_asset_id: "MEM-L2",
          runtime_locator: { kind: "scenario-path", path: "scene/a.md" },
          content_sha256: "c".repeat(64),
          expected_asset_content_hash: "d".repeat(64),
        },
      },
    })) as unknown as ProductionRestoreTransport;
    const l2Input = {
      ...input,
      requirementId: "req-l2",
      formalAssetId: "MEM-L2",
      expectedAssetContentHash: "d".repeat(64),
      payload: { path: "scene/a.md", content: "scene" },
    };
    const good = createServerTeamMemoryImportHooks({
      transport: goodTransport,
      datasetSpaceId: "SPACE-01",
      datasetUserId: "USER-01",
    });
    await expect(good.importMemoryL2(l2Input)).resolves.toEqual(expect.objectContaining({
      kind: "l2",
      formalAssetId: "MEM-L2",
    }));

    for (const response of [
      { status: 404, body: { code: 404, message: "disabled" } },
      { status: 200, body: { code: 500, message: "failed" } },
      {
        status: 200,
        body: {
          code: 0,
          data: {
            kind: "l1",
            formal_asset_id: "OTHER",
            runtime_locator: { kind: "asset-id", assetId: "OTHER" },
            content_sha256: "e".repeat(64),
            expected_asset_content_hash: "d".repeat(64),
          },
        },
      },
    ]) {
      const hooks = createServerTeamMemoryImportHooks({
        transport: async () => response,
        datasetSpaceId: "SPACE-01",
        datasetUserId: "USER-01",
      });
      await expect(hooks.importMemoryL2(l2Input)).rejects.toBeInstanceOf(
        ServerTeamMemoryImportClientError,
      );
    }
  });
});
