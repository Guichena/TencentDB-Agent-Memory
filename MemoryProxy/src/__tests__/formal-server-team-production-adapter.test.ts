import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  executeServerTeamProductionRestore,
  ServerTeamProductionAdapterConfigError,
} from "../../eval/tool-prompt-bench/formal-assets/server-team-production-adapter.js";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/formal-runtime/canonical.js";
import type {
  FormalAssetRestorePlan,
  RestorePlanRequirement,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function requirementId(prefix: string, logicalId: string): string {
  return `${prefix}-${canonicalSha256({ prefix, logicalId }).slice(0, 20)}`;
}

function mappingRequirement(
  prefix: string,
  logicalId: string,
  kind: RestorePlanRequirement["kind"],
): RestorePlanRequirement {
  return {
    requirementId: requirementId(prefix, logicalId),
    kind,
    blocking: true,
    reason: "mapping",
  };
}

function plan(): FormalAssetRestorePlan {
  return {
    schemaVersion: "task1.formal-asset-restore-plan.v1",
    split: "dev",
    planSha256: "a".repeat(64),
    requirements: [
      mappingRequirement("require-space-service", "SPACE-01", "space_service_mapping"),
      mappingRequirement("require-auth-user", "USER-01", "auth_user_mapping"),
    ],
    actions: [],
    identityMappings: {
      space: {
        datasetSpaceId: "SPACE-01",
        runtimeServiceId: { state: "unresolved", requiredGate: "space-service-mapping" },
      },
      users: [{
        datasetUserId: "USER-01",
        resolvedAuthUserId: { state: "unresolved", requiredGate: "auth-user-mapping" },
      }],
      teams: [],
      agents: [],
      tasks: [],
    },
  } as unknown as FormalAssetRestorePlan;
}

async function frozenDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "task1-frozen-data-"));
  tempRoots.push(root);
  await mkdir(join(
    root,
    "MemoryProxy",
    "eval",
    "tool-prompt-bench",
    "formal-dataset",
    "source-material",
  ), { recursive: true });
  return root;
}

describe("server_team production adapter", () => {
  it("composes mappings, frozen Skill roots, transport, Memory hooks, and executor from env", async () => {
    const dataRoot = await frozenDataRoot();
    const secret = "runtime-user-key-secret";
    const receipt = await executeServerTeamProductionRestore(plan(), {
      env: {
        TDAI_FORMAL_MEMORY_CORE_URL: "http://127.0.0.1:8789",
        TDAI_FORMAL_MEMORY_KNOWLEDGE_URL: "http://127.0.0.1:8790",
        TDAI_EVAL_USER_KEY: secret,
        TDAI_FORMAL_RUNTIME_SERVICE_ID: "service-runtime",
        TDAI_FORMAL_RUNTIME_AUTH_USER_ID: "user-runtime",
        TDAI_FORMAL_DATA_ROOT: dataRoot,
      },
      fetchImpl: async () => {
        throw new Error("no action should fetch in this fixture");
      },
    });

    expect(receipt).toEqual(expect.objectContaining({
      schemaVersion: "task1.production-asset-restore-receipt.v1",
      complete: true,
      actionCount: 0,
      requirementCount: 2,
    }));
    expect(receipt.requirements).toEqual([
      expect.objectContaining({
        kind: "space_service_mapping",
        evidence: { mapping: "space_service", datasetId: "SPACE-01", verified: true },
      }),
      expect.objectContaining({
        kind: "auth_user_mapping",
        evidence: { mapping: "auth_user", datasetId: "USER-01", verified: true },
      }),
    ]);
    expect(JSON.stringify(receipt)).not.toContain(secret);
    expect(JSON.stringify(receipt)).not.toContain("service-runtime");
    expect(JSON.stringify(receipt)).not.toContain("user-runtime");
  });

  it("fails before discovery or network when a required runtime env value is missing", async () => {
    await expect(executeServerTeamProductionRestore(plan(), {
      env: {},
      fetchImpl: async () => new Response(),
    })).rejects.toBeInstanceOf(ServerTeamProductionAdapterConfigError);
  });
});
