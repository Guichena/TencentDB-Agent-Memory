import { describe, expect, it, vi } from "vitest";

import {
  createServerTeamProductionTransport,
  ServerTeamProductionTransportError,
} from "../../eval/tool-prompt-bench/formal-assets/server-team-production-transport.js";
import type { ProductionRestoreTransportRequest } from "../../eval/tool-prompt-bench/formal-assets/production-restore-executor.js";

function request(
  input: Partial<ProductionRestoreTransportRequest> = {},
): ProductionRestoreTransportRequest {
  return {
    actionId: "action-1",
    serviceBoundary: "memory_core",
    method: "POST",
    endpoint: "/v3/meta/team/create",
    executionIdentity: {
      datasetSpaceId: "SPACE-01",
      datasetUserId: "USER-01",
    },
    headers: {},
    body: { name: "Team A" },
    ...input,
  };
}

describe("server_team production transport", () => {
  it("routes MemoryCore actions with the runtime service id and in-memory user key", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ code: 0, data: { team_id: "team-runtime" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const transport = createServerTeamProductionTransport({
      memoryCoreBaseUrl: "http://127.0.0.1:8789/",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790",
      memoryCoreApiKey: "secret-core-api-key",
      userKey: "secret-user-key",
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      fetchImpl,
    });

    const response = await transport(request());

    expect(response).toEqual({
      status: 200,
      body: { code: 0, data: { team_id: "team-runtime" } },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8789/v3/meta/team/create",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret-core-api-key",
          "x-tdai-service-id": "runtime-service",
          "x-tdai-user-key": "secret-user-key",
        },
        body: JSON.stringify({ name: "Team A" }),
      }),
    );
  });

  it("routes MemoryKnowledge actions without forwarding the MemoryCore user key", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(
      JSON.stringify({ code: 0, data: { wiki_id: "wiki-runtime" } }),
      { status: 201, headers: { "content-type": "application/json" } },
    ));
    const transport = createServerTeamProductionTransport({
      memoryCoreBaseUrl: "http://127.0.0.1:8789",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790/api/",
      memoryCoreApiKey: "must-not-leak-core-key",
      userKey: "must-not-leak",
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      fetchImpl,
    });

    await transport(request({
      serviceBoundary: "memory_knowledge",
      endpoint: "/v3/wiki/create",
      headers: { "x-tdai-service-id": "runtime-service" },
    }));

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8790/api/v3/wiki/create",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          "x-tdai-service-id": "runtime-service",
        },
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty("x-tdai-user-key");
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it("rejects missing mappings and a plan/runtime service-id mismatch before fetch", async () => {
    const fetchImpl = vi.fn();
    const transport = createServerTeamProductionTransport({
      memoryCoreBaseUrl: "http://127.0.0.1:8789",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790",
      memoryCoreApiKey: "core-secret",
      userKey: "secret",
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      fetchImpl,
    });

    await expect(transport(request({
      executionIdentity: {
        datasetSpaceId: "SPACE-MISSING",
        datasetUserId: "USER-01",
      },
    }))).rejects.toMatchObject({
      code: "SERVICE_MAPPING_MISSING",
      actionId: "action-1",
    });
    await expect(transport(request({
      headers: { "x-tdai-service-id": "different-service" },
    }))).rejects.toMatchObject({
      code: "SERVICE_MAPPING_MISMATCH",
      actionId: "action-1",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses non-2xx envelopes for the executor without treating HTTP status as fetch failure", async () => {
    const transport = createServerTeamProductionTransport({
      memoryCoreBaseUrl: "http://127.0.0.1:8789",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790",
      memoryCoreApiKey: "core-secret",
      userKey: "secret",
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      fetchImpl: async () => new Response(
        JSON.stringify({ code: 40401, message: "not found" }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    });

    await expect(transport(request())).resolves.toEqual({
      status: 404,
      body: { code: 40401, message: "not found" },
    });
  });

  it("fails on invalid configuration, transport errors, and non-JSON responses without leaking secrets", async () => {
    expect(() => createServerTeamProductionTransport({
      memoryCoreBaseUrl: "file:///tmp/core",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790",
      memoryCoreApiKey: "core-secret",
      userKey: "secret",
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
    })).toThrow(/http.*https/iu);

    const networkSecret = "network-secret";
    const networkCoreSecret = "network-core-secret";
    const networkTransport = createServerTeamProductionTransport({
      memoryCoreBaseUrl: "http://127.0.0.1:8789",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790",
      memoryCoreApiKey: networkCoreSecret,
      userKey: networkSecret,
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      fetchImpl: async () => {
        throw new Error(`connect failed with ${networkSecret}`);
      },
    });
    let networkError: unknown;
    try {
      await networkTransport(request());
    } catch (error) {
      networkError = error;
    }
    expect(networkError).toBeInstanceOf(ServerTeamProductionTransportError);
    expect(networkError).toMatchObject({ code: "FETCH_FAILED", actionId: "action-1" });
    expect(String(networkError)).not.toContain(networkSecret);
    expect(String(networkError)).not.toContain(networkCoreSecret);

    const jsonTransport = createServerTeamProductionTransport({
      memoryCoreBaseUrl: "http://127.0.0.1:8789",
      memoryKnowledgeBaseUrl: "http://127.0.0.1:8790",
      memoryCoreApiKey: "core-secret",
      userKey: "secret",
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      fetchImpl: async () => new Response("not-json", { status: 502 }),
    });
    await expect(jsonTransport(request())).rejects.toMatchObject({
      code: "INVALID_JSON_RESPONSE",
      actionId: "action-1",
    });
  });
});
