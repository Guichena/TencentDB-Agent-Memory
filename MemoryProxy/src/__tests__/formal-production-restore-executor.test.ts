import { describe, expect, it, vi } from "vitest";

import {
  executeProductionRestorePlan,
  FormalProductionRestoreError,
  type ProductionRestoreRuntimeBindings,
} from "../../eval/tool-prompt-bench/formal-assets/production-restore-executor.js";
import type {
  FormalAssetRestorePlan,
  RestorePlanAction,
  RestorePlanRequirement,
  RuntimeValueRef,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";

const runtimeRef = (
  $runtimeRef: string,
  logicalId?: string,
  actionId?: string,
): RuntimeValueRef => ({
  $runtimeRef,
  ...(logicalId === undefined ? {} : { logicalId }),
  ...(actionId === undefined ? {} : { actionId }),
});

function action(
  order: number,
  actionId: string,
  input: Partial<RestorePlanAction> = {},
): RestorePlanAction {
  return {
    order,
    actionId,
    phase: "identity",
    serviceBoundary: "memory_core",
    service: "metadata",
    method: "POST",
    endpoint: "/v3/test",
    dependsOn: [],
    executionIdentity: {
      datasetSpaceId: "SPACE-01",
      datasetUserId: "USER-01",
    },
    body: {},
    captures: {},
    ...input,
  };
}

function requirement(
  requirementId: string,
  kind: RestorePlanRequirement["kind"],
  input: Partial<RestorePlanRequirement> = {},
): RestorePlanRequirement {
  return {
    requirementId,
    kind,
    blocking: true,
    reason: "test requirement",
    ...input,
  };
}

function plan(
  actions: readonly RestorePlanAction[],
  requirements: readonly RestorePlanRequirement[] = [],
): FormalAssetRestorePlan {
  return {
    schemaVersion: "task1.formal-asset-restore-plan.v1",
    split: "dev",
    planSha256: "a".repeat(64),
    actions,
    requirements,
  } as unknown as FormalAssetRestorePlan;
}

const bindings: ProductionRestoreRuntimeBindings = {
  serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
  authUserIdsByDatasetUserId: { "USER-01": "runtime-user" },
  chatMemoryAssetIdsByDatasetAgentId: { "AGENT-01": "runtime-chat-memory" },
};

describe("formal production restore executor", () => {
  it("resolves external bindings, prior captures, nested values, and requirement values", async () => {
    const skillRequirement = requirement("req-skill", "skill_package_bytes");
    const actions = [
      action(1, "team-create", {
        body: {
          owner_user_id: runtimeRef("resolved_auth_user_id", "USER-01"),
        },
        captures: { runtimeTeamId: "response.data.team_id" },
      }),
      action(2, "skill-create", {
        phase: "skill",
        service: "skill-data",
        dependsOn: ["team-create"],
        blockedByRequirements: ["req-skill"],
        correlationHeaders: {
          "x-tdai-service-id": runtimeRef("runtime_service_id", "SPACE-01"),
        },
        body: {
          team_id: runtimeRef("runtime_team_id", "TEAM-01", "team-create"),
          content: runtimeRef("verified_skill_entry_content", "SKILL-01", "req-skill"),
          resources: [runtimeRef("verified_skill_resources", "SKILL-01", "req-skill")],
        },
        captures: { runtimeAssetId: "response.data.skill_id" },
      }),
      action(3, "binding-set", {
        phase: "binding",
        dependsOn: ["skill-create"],
        body: {
          bindings: [
            { asset_id: runtimeRef("runtime_asset_id", "SKILL-01", "skill-create") },
            { asset_id: runtimeRef("derived_chat_memory_asset_id", "AGENT-01") },
          ],
        },
      }),
    ];
    const requests: unknown[] = [];
    const resolveRequirement = vi.fn(async () => ({
      values: {
        verified_skill_entry_content: "# Skill\n",
        verified_skill_resources: [{ path: "references/a.md", content: "A" }],
      },
      evidence: { verifiedFiles: 2 },
    }));

    const receipt = await executeProductionRestorePlan({
      plan: plan(actions, [skillRequirement]),
      bindings,
      resolveRequirement,
      transport: async (request) => {
        requests.push(request);
        if (request.actionId === "team-create") {
          return { status: 200, body: { code: 0, data: { team_id: "team-runtime" } } };
        }
        if (request.actionId === "skill-create") {
          return { status: 200, body: { code: 0, data: { skill_id: "skill-runtime" } } };
        }
        return { status: 200, body: { code: 0, data: {} } };
      },
    });

    expect(resolveRequirement).toHaveBeenCalledOnce();
    expect(requests).toEqual([
      expect.objectContaining({
        actionId: "team-create",
        body: { owner_user_id: "runtime-user" },
      }),
      expect.objectContaining({
        actionId: "skill-create",
        headers: { "x-tdai-service-id": "runtime-service" },
        body: {
          team_id: "team-runtime",
          content: "# Skill\n",
          resources: [[{ path: "references/a.md", content: "A" }]],
        },
      }),
      expect.objectContaining({
        actionId: "binding-set",
        body: {
          bindings: [
            { asset_id: "skill-runtime" },
            { asset_id: "runtime-chat-memory" },
          ],
        },
      }),
    ]);
    expect(receipt).toEqual(expect.objectContaining({
      schemaVersion: "task1.production-asset-restore-receipt.v1",
      planSha256: "a".repeat(64),
      complete: true,
      actionCount: 3,
      requirementCount: 1,
    }));
    expect(receipt.actions[1]).toEqual(expect.objectContaining({
      actionId: "skill-create",
      captures: { runtimeAssetId: "skill-runtime" },
    }));
    expect(receipt.requirements[0]).toEqual({
      requirementId: "req-skill",
      kind: "skill_package_bytes",
      evidence: { verifiedFiles: 2 },
    });
  });

  it("runs a requirement only after all declared prerequisite actions complete", async () => {
    const events: string[] = [];
    await executeProductionRestorePlan({
      plan: plan(
        [
          action(1, "team-create"),
          action(2, "agent-create", { dependsOn: ["team-create"] }),
        ],
        [requirement("req-l1", "memory_l1_import", {
          dependsOnActions: ["team-create", "agent-create"],
        })],
      ),
      bindings,
      resolveRequirement: async (value) => {
        events.push(`requirement:${value.requirementId}`);
        return { values: {}, evidence: { imported: 1 } };
      },
      transport: async ({ actionId }) => {
        events.push(`action:${actionId}`);
        return { status: 200, body: { code: 0, data: {} } };
      },
    });

    expect(events).toEqual([
      "action:team-create",
      "action:agent-create",
      "requirement:req-l1",
    ]);
  });

  it("derives production chat-memory ids from captured Team and Agent ids", async () => {
    const requests: Array<{ actionId: string; body: Readonly<Record<string, unknown>> }> = [];
    await executeProductionRestorePlan({
      plan: plan([
        action(1, "team-create", {
          executionIdentity: {
            datasetSpaceId: "SPACE-01",
            datasetUserId: "USER-01",
            datasetTeamId: "TEAM-01",
          },
          captures: { runtimeTeamId: "response.data.team_id" },
        }),
        action(2, "agent-create", {
          dependsOn: ["team-create"],
          executionIdentity: {
            datasetSpaceId: "SPACE-01",
            datasetUserId: "USER-01",
            datasetTeamId: "TEAM-01",
            datasetAgentId: "AGENT-01",
          },
          captures: { runtimeAgentId: "response.data.agent_id" },
        }),
        action(3, "binding-set", {
          dependsOn: ["agent-create"],
          body: {
            asset_id: runtimeRef(
              "derived_chat_memory_asset_id",
              "AGENT-01",
              "agent-create",
            ),
          },
        }),
      ]),
      bindings: {
        ...bindings,
        chatMemoryAssetIdsByDatasetAgentId: {},
      },
      resolveRequirement: async () => ({ values: {}, evidence: {} }),
      transport: async (request) => {
        requests.push({ actionId: request.actionId, body: request.body });
        if (request.actionId === "team-create") {
          return { status: 200, body: { code: 0, data: { team_id: "team-runtime" } } };
        }
        if (request.actionId === "agent-create") {
          return { status: 200, body: { code: 0, data: { agent_id: "agent-runtime" } } };
        }
        return { status: 200, body: { code: 0, data: {} } };
      },
    });

    expect(requests[2]?.body).toEqual({
      asset_id: "chat_memory-team-runtime-agent-runtime",
    });
  });

  it("stops before transport when a blocking requirement cannot be resolved", async () => {
    const transport = vi.fn();

    await expect(executeProductionRestorePlan({
      plan: plan(
        [action(1, "skill-create", { blockedByRequirements: ["req-skill"] })],
        [requirement("req-skill", "skill_package_bytes")],
      ),
      bindings,
      resolveRequirement: async () => {
        throw new Error("package bytes missing");
      },
      transport,
    })).rejects.toMatchObject({
      name: "FormalProductionRestoreError",
      code: "REQUIREMENT_FAILED",
      subjectId: "req-skill",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects dependency drift, missing runtime refs, non-2xx responses, and non-zero envelopes", async () => {
    const baseInput = {
      bindings,
      resolveRequirement: async () => ({ values: {}, evidence: {} }),
      transport: async () => ({ status: 200, body: { code: 0, data: {} } }),
    };

    await expect(executeProductionRestorePlan({
      ...baseInput,
      plan: plan([action(1, "late", { dependsOn: ["missing"] })]),
    })).rejects.toMatchObject({ code: "ACTION_DEPENDENCY_UNMET", subjectId: "late" });

    await expect(executeProductionRestorePlan({
      ...baseInput,
      plan: plan([action(1, "missing-ref", {
        body: { team_id: runtimeRef("runtime_team_id", "TEAM-01", "unknown") },
      })]),
    })).rejects.toMatchObject({ code: "RUNTIME_REF_UNRESOLVED", subjectId: "missing-ref" });

    await expect(executeProductionRestorePlan({
      ...baseInput,
      plan: plan([action(1, "http-failure")]),
      transport: async () => ({ status: 503, body: { code: 0, data: {} } }),
    })).rejects.toMatchObject({ code: "ACTION_HTTP_FAILED", subjectId: "http-failure" });

    await expect(executeProductionRestorePlan({
      ...baseInput,
      plan: plan([action(1, "api-failure")]),
      transport: async () => ({ status: 200, body: { code: 50001, message: "failed" } }),
    })).rejects.toMatchObject({ code: "ACTION_API_FAILED", subjectId: "api-failure" });
  });

  it("does not serialize request bodies, headers, runtime bindings, or requirement values", async () => {
    const secret = "must-not-appear";
    const receipt = await executeProductionRestorePlan({
      plan: plan([action(1, "create", {
        body: { content: secret },
        captures: { runtimeId: "response.data.id" },
      })]),
      bindings: {
        ...bindings,
        authUserIdsByDatasetUserId: { "USER-01": secret },
      },
      resolveRequirement: async () => ({ values: { secret }, evidence: { ok: true } }),
      transport: async () => ({ status: 200, body: { code: 0, data: { id: "safe-id" } } }),
    });

    expect(JSON.stringify(receipt)).not.toContain(secret);
    expect(receipt.actions[0]?.captures).toEqual({ runtimeId: "safe-id" });
  });

  it("exposes a stable typed error for caller-side Gate reporting", () => {
    const error = new FormalProductionRestoreError(
      "RUNTIME_REF_UNRESOLVED",
      "action-1",
      "missing value",
    );
    expect(error).toMatchObject({
      name: "FormalProductionRestoreError",
      code: "RUNTIME_REF_UNRESOLVED",
      subjectId: "action-1",
    });
  });
});
