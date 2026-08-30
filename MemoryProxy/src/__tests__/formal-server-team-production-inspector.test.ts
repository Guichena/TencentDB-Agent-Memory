import { describe, expect, it, vi } from "vitest";

import {
  assertServerTeamKnowledgeStable,
  inspectServerTeamProductionAssets,
} from "../../eval/tool-prompt-bench/formal-assets/server-team-production-inspector.js";
import type {
  FormalAssetRuntimeObservations,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-runtime.js";
import type {
  FormalAssetRestorePlan,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";
import {
  evaluateFormalExecutionPreflight,
  type FormalExpectedExecutionBinding,
} from "../../eval/tool-prompt-bench/formal-execution-preflight.js";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/formal-runtime/canonical.js";

const DATASET = {
  space: "dataset-space",
  user: "dataset-user",
  team: "dataset-team",
  agent: "dataset-agent",
  task: "dataset-task",
} as const;
const RUNTIME = {
  space: "runtime-space",
  user: "runtime-user",
  team: "runtime-team",
  agent: "runtime-agent",
  task: "runtime-task",
  importedAgent: "runtime-agent-imported",
} as const;
const DATASET_IMPORTED_AGENT = "dataset-agent-imported";
const ASSET_IDS = ["mem-l0", "mem-l1", "mem-l2", "mem-l3", "skill-a", "knowledge-a"] as const;
const PLAN_SHA = "1".repeat(64);

const expected: FormalExpectedExecutionBinding = {
  datasetUserId: DATASET.user,
  spaceId: DATASET.space,
  teamId: DATASET.team,
  agentId: DATASET.agent,
  taskId: DATASET.task,
  sessionId: "formal-session-opaque",
  agentSource: "codex",
  visibleAssetSetSha256: canonicalSha256({
    teamId: DATASET.team,
    userId: DATASET.user,
    agentId: DATASET.agent,
    assetIds: [...ASSET_IDS].sort(),
  }),
};

function plan(): FormalAssetRestorePlan {
  return {
    planSha256: PLAN_SHA,
    identityMappings: {
      space: { datasetSpaceId: DATASET.space },
      users: [{ datasetUserId: DATASET.user }],
      teams: [{ datasetTeamId: DATASET.team, runtimeTeamId: { actionId: "team-create" } }],
      agents: [
        { datasetAgentId: DATASET.agent, runtimeAgentId: { actionId: "agent-create" } },
        { datasetAgentId: DATASET_IMPORTED_AGENT, runtimeAgentId: { actionId: "agent-imported-create" } },
      ],
      tasks: [{ datasetTaskId: DATASET.task, runtimeTaskId: { actionId: "task-create" } }],
    },
    selectedVisibleAssetSets: [{
      teamId: DATASET.team,
      userId: DATASET.user,
      agentId: DATASET.agent,
      assetIds: ASSET_IDS,
      sha256: expected.visibleAssetSetSha256,
    }],
    assets: [
      {
        formalAssetId: "mem-l0", family: "memory", subtype: "l0", ownerAgentId: DATASET.agent,
        contentHash: "2".repeat(64),
        receipt: {
          kind: "conversation", actionId: "l0-add", requestedSessionId: "history-session",
          formalMessageIds: ["formal-message"], runtimeMessageIdsPath: "response.data.accepted_ids",
          mapping: "ordered-response",
        },
      },
      {
        formalAssetId: "mem-l1", family: "memory", subtype: "l1", ownerAgentId: DATASET_IMPORTED_AGENT,
        contentHash: "3".repeat(64), receipt: { kind: "unresolved-import", requirementId: "l1-import" },
      },
      {
        formalAssetId: "mem-l2", family: "memory", subtype: "l2", ownerAgentId: DATASET.agent,
        contentHash: "4".repeat(64), receipt: { kind: "unresolved-import", requirementId: "l2-import" },
      },
      {
        formalAssetId: "mem-l3", family: "memory", subtype: "l3", ownerAgentId: DATASET.agent,
        contentHash: "5".repeat(64), receipt: { kind: "core-scope", actionId: "l3-write", contentHash: "5".repeat(64) },
      },
      {
        formalAssetId: "skill-a", family: "skill", subtype: "skill", ownerAgentId: DATASET.agent,
        contentHash: "6".repeat(64), receipt: { kind: "runtime-asset-id", actionId: "skill-create" },
      },
      {
        formalAssetId: "knowledge-a", family: "knowledge", subtype: "wiki", ownerAgentId: DATASET.agent,
        contentHash: "7".repeat(64), receipt: { kind: "runtime-asset-id", actionId: "knowledge-create" },
      },
    ],
    actions: [{ actionId: "skill-create", body: { name: "shared-skill" } }],
  } as unknown as FormalAssetRestorePlan;
}

function restoreObservations(): FormalAssetRuntimeObservations {
  return {
    schemaVersion: "task1.formal-asset-runtime-observations.v1",
    operation: "restore",
    split: "dev",
    planSha256: PLAN_SHA,
    verification: "unverified",
    formalMetricEligible: false,
    readyForFormalMeasurement: false,
    unverifiedObservations: {
      schemaVersion: "task1.production-asset-restore-receipt.v1",
      split: "dev",
      planSha256: PLAN_SHA,
      complete: true,
      actionCount: 8,
      requirementCount: 2,
      actions: [
        { actionId: "team-create", serviceBoundary: "memory_core", endpoint: "/team", httpStatus: 200, captures: { runtimeTeamId: RUNTIME.team } },
        { actionId: "agent-create", serviceBoundary: "memory_core", endpoint: "/agent", httpStatus: 200, captures: { runtimeAgentId: RUNTIME.agent } },
        { actionId: "agent-imported-create", serviceBoundary: "memory_core", endpoint: "/agent", httpStatus: 200, captures: { runtimeAgentId: RUNTIME.importedAgent } },
        { actionId: "task-create", serviceBoundary: "memory_core", endpoint: "/task", httpStatus: 200, captures: { runtimeTaskId: RUNTIME.task } },
        { actionId: "l0-add", serviceBoundary: "memory_core", endpoint: "/l0", httpStatus: 200, captures: { runtimeMessageIds: ["runtime-message"] } },
        { actionId: "l3-write", serviceBoundary: "memory_core", endpoint: "/l3", httpStatus: 200, captures: {} },
        { actionId: "skill-create", serviceBoundary: "memory_core", endpoint: "/skill", httpStatus: 200, captures: { runtimeAssetId: "runtime-skill" } },
        { actionId: "knowledge-create", serviceBoundary: "memory_knowledge", endpoint: "/knowledge", httpStatus: 200, captures: { runtimeAssetId: "runtime-knowledge" } },
      ],
      requirements: [
        { requirementId: "l1-import", kind: "memory_l1_import", evidence: { runtimeLocator: { kind: "asset-id", assetId: "mem-l1" } } },
        { requirementId: "l2-import", kind: "memory_l2_import", evidence: { runtimeLocator: { kind: "scenario-path", path: "project/decision.md" } } },
      ],
    },
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("server_team production asset inspector", () => {
  it("read-backs all Task 1 asset families and satisfies the independent preflight scorer", async () => {
    const seen: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const body = init.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : {};
      seen.push({ url, headers: new Headers(init.headers), body });
      if (path === "/v3/meta/auth/verify") {
        return json({ code: 0, data: { valid: true, user: { user_id: RUNTIME.user } } });
      }
      if (path === "/v3/auto-sync/status") {
        expect(init.method).toBe("GET");
        return json({
          code: 0,
          data: {
            running: false,
            activeSyncs: 0,
            scanning: false,
            config: { enabled: false },
          },
        });
      }
      if (path === "/v3/meta/team/list") {
        return json({ code: 0, data: { items: [{ team_id: RUNTIME.team }], total: 1 } });
      }
      if (path === "/v3/meta/agent/list") {
        return json({ code: 0, data: { items: [
          { team_id: RUNTIME.team, agent_id: RUNTIME.agent },
          { team_id: RUNTIME.team, agent_id: RUNTIME.importedAgent },
        ], total: 2 } });
      }
      if (path === "/v3/meta/task/list") {
        return json({ code: 0, data: { items: [{ team_id: RUNTIME.team, task_id: RUNTIME.task }], total: 1 } });
      }
      if (path === "/v3/formal-bench/preflight-session") {
        const identity = {
          sessionId: expected.sessionId,
          spaceId: RUNTIME.space,
          teamId: RUNTIME.team,
          userId: RUNTIME.user,
          agentId: RUNTIME.agent,
          taskId: RUNTIME.task,
          agentSource: "codex",
        };
        return json({
          code: 0,
          data: {
            session: { request: identity, response: { ...identity, httpStatus: 200, envelopeCode: 0 } },
            effectiveWriteConfig: {
              configFingerprintSha256: "b".repeat(64),
              extractionEnabled: false,
              extractionExtractorIds: [],
              tdaiL0WriteEnabled: false,
              skillLlmWriteEnabled: false,
              analyseMarkerEnabled: false,
              assetReflectionEnabled: false,
              archiveWriteBackEnabled: false,
            },
            sessionNamespace: {
              sessionId: expected.sessionId,
              preRegistrationLookups: ["l1", "l2a", "l2b", "history-scan"].map((layer) => ({
                layer, matchedSessionIds: [],
              })),
            },
          },
        });
      }
      if (path === "/v3/conversation/query") return json({ code: 0, data: { messages: [{ id: "runtime-message" }] } });
      if (path === "/v3/atomic/query") return json({ code: 0, data: { items: [{ id: "mem-l1" }] } });
      if (path === "/v3/scenario/read") return json({ code: 0, data: { path: "project/decision.md", content: "decision" } });
      if (path === "/v3/core/read") return json({ code: 0, data: { content: "persona" } });
      if (path === "/v3/skill/search") return json({ code: 0, data: { items: [{ skill_id: "runtime-skill" }] } });
      if (path === "/v3/meta/agent-fixed-asset/list-with-detail") {
        return json({ code: 0, data: { items: [{ asset_id: "runtime-knowledge" }], total: 1 } });
      }
      return json({ code: 404 }, 404);
    });

    const observations = await inspectServerTeamProductionAssets(
      plan(),
      restoreObservations(),
      { expectedBinding: expected },
      {
        env: {
          TDAI_FORMAL_MEMORY_CORE_URL: "http://memory-core.test",
          TDAI_FORMAL_MEMORY_KNOWLEDGE_URL: "http://memory-knowledge.test",
          TDAI_FORMAL_MEMORY_PROXY_URL: "http://memory-proxy.test",
          TDAI_FORMAL_MEMORY_CORE_API_KEY: "secret-core-api-key",
          TDAI_EVAL_USER_KEY: "secret-user-key",
          TDAI_FORMAL_RUNTIME_SERVICE_ID: RUNTIME.space,
        },
        fetchImpl,
      },
    );
    const receipt = evaluateFormalExecutionPreflight(observations);

    expect(receipt.ready).toBe(true);
    expect(receipt.visibleAssetCount).toBe(ASSET_IDS.length);
    expect(receipt.checks.every((check) => check.status === "pass")).toBe(true);
    expect(observations.assetInventory.sources.map((source) => source.requestPath).sort()).toEqual([
      "/v3/conversation/query",
      "/v3/atomic/query",
      "/v3/scenario/read",
      "/v3/core/read",
      "/v3/skill/search",
      "/v3/meta/agent-fixed-asset/list-with-detail",
    ].sort());
    expect(JSON.stringify(observations)).not.toContain("secret-user-key");
    expect(JSON.stringify(observations)).not.toContain("secret-core-api-key");
    expect(seen.some((entry) => new URL(entry.url).pathname.includes("responses"))).toBe(false);
    expect(seen.filter((entry) => new URL(entry.url).host === "memory-core.test")
      .every((entry) => entry.headers.get("x-tdai-service-id") === RUNTIME.space)).toBe(true);
    expect(seen.filter((entry) => new URL(entry.url).host === "memory-core.test")
      .every((entry) => entry.headers.get("authorization") === "Bearer secret-core-api-key"))
      .toBe(true);
    expect(seen.filter((entry) => new URL(entry.url).host !== "memory-core.test")
      .every((entry) => entry.headers.get("authorization") === null)).toBe(true);
    expect(seen.find((entry) => new URL(entry.url).pathname === "/v3/atomic/query")?.body)
      .toMatchObject({ agent_id: RUNTIME.importedAgent });
    expect(seen.find((entry) => new URL(entry.url).pathname === "/v3/skill/search")?.body)
      .toMatchObject({ agent_id: RUNTIME.agent, query: "shared-skill", scope: "team" });
    expect(new URL(seen.at(-1)!.url).pathname).toBe("/v3/formal-bench/preflight-session");
  });

  it("requires disabled auto-sync and terminal Code Graph states before a campaign", async () => {
    const stableFetch = vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/v3/auto-sync/status") {
        expect(init.method).toBe("GET");
        return json({
          code: 0,
          data: {
            running: false,
            activeSyncs: 0,
            scanning: false,
            config: { enabled: false },
          },
        });
      }
      expect(path).toBe("/v3/code-graph/get");
      expect(new Headers(init.headers).get("x-tdai-service-id")).toBe(RUNTIME.space);
      return json({ code: 0, data: { code_graph_id: "cg-runtime", status: "ready" } });
    });
    await expect(assertServerTeamKnowledgeStable({
      memoryKnowledgeBaseUrl: "http://memory-knowledge.test",
      runtimeServiceId: RUNTIME.space,
      codeGraphIds: ["cg-runtime"],
      fetchImpl: stableFetch,
    })).resolves.toBeUndefined();

    for (const response of [
      { code: 0, data: { running: true, activeSyncs: 0, scanning: false, config: { enabled: true } } },
      { code: 0, data: { code_graph_id: "cg-runtime", status: "processing" } },
      { code: 0, data: { code_graph_id: "cg-runtime", status: "failed" } },
    ]) {
      let request = 0;
      await expect(assertServerTeamKnowledgeStable({
        memoryKnowledgeBaseUrl: "http://memory-knowledge.test",
        runtimeServiceId: RUNTIME.space,
        codeGraphIds: ["cg-runtime"],
        fetchImpl: async () => {
          request += 1;
          if (request === 1 && "status" in response.data) {
            return json({
              code: 0,
              data: {
                running: false,
                activeSyncs: 0,
                scanning: false,
                config: { enabled: false },
              },
            });
          }
          return json(response);
        },
      })).rejects.toThrow(/auto-sync must be disabled|formal preflight requires ready/u);
    }
  });
});
