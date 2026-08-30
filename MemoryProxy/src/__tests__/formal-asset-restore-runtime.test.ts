import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFrozenFormalAssetRestorePlan } from "../../eval/tool-prompt-bench/formal-assets/build-frozen-restore-plan.js";
import {
  executeFormalAssetRestorePlanWithLoader,
  inspectFormalAssetRestorePlanWithLoader,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-runtime.js";
import type { FormalAssetRestorePlan } from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";

const repositoryRoot = resolve(process.cwd(), "..");
const benchRoot = resolve(process.cwd(), "eval", "tool-prompt-bench");

function validPlan(): FormalAssetRestorePlan {
  return buildFrozenFormalAssetRestorePlan({
    repositoryRoot,
    split: "dev",
  }) as FormalAssetRestorePlan;
}

function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((child) => allKeys(child, keys));
  } else if (value !== null && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      keys.add(key);
      allKeys(child, keys);
    });
  }
  return keys;
}

describe("formal asset restore runtime boundary", () => {
  it("does not load an adapter when the plan is invalid", async () => {
    const plan = structuredClone(validPlan()) as unknown as Record<string, unknown>;
    plan.planSha256 = "0".repeat(64);
    let adapterLoads = 0;

    await expect(executeFormalAssetRestorePlanWithLoader({
      rawPlan: plan,
      expectedSplit: "dev",
      loadAdapter: async () => {
        adapterLoads += 1;
        return { executeFormalAssetRestorePlan: async () => ({}) };
      },
    })).rejects.toThrow(/planSha256/iu);

    expect(adapterLoads).toBe(0);
  });

  it("passes only a detached deep-frozen safe plan and keeps adapter claims unverified", async () => {
    const rawPlan = validPlan();
    let received: FormalAssetRestorePlan | undefined;
    const result = await executeFormalAssetRestorePlanWithLoader({
      rawPlan,
      expectedSplit: "dev",
      loadAdapter: async () => ({
        executeFormalAssetRestorePlan: async (plan: FormalAssetRestorePlan) => {
          received = plan;
          return { ready: true, formalMetricEligible: true, restored: 17 };
        },
      }),
    });

    expect(received).toBeDefined();
    expect(received).not.toBe(rawPlan);
    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(received!.actions)).toBe(true);
    expect(Object.isFrozen(received!.actions[0]!.body)).toBe(true);
    const keys = allKeys(received);
    for (const forbidden of [
      "publicCases", "privateAnnotations", "pairs", "runRecords", "gold",
      "query", "contextMessages", "allowedSequences", "evidenceRefs", "caseId",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
    expect(result).toEqual(expect.objectContaining({
      operation: "restore",
      verification: "unverified",
      formalMetricEligible: false,
      readyForFormalMeasurement: false,
      unverifiedObservations: {
        ready: true,
        formalMetricEligible: true,
        restored: 17,
      },
    }));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.unverifiedObservations)).toBe(true);
  });

  it("validates plan and restore observations before loading the inspector", async () => {
    const plan = validPlan();
    const restore = await executeFormalAssetRestorePlanWithLoader({
      rawPlan: plan,
      expectedSplit: "dev",
      loadAdapter: async () => ({
        executeFormalAssetRestorePlan: async () => ({ restored: 17 }),
      }),
    });
    let receivedPlan: FormalAssetRestorePlan | undefined;
    const expectedBinding = {
      datasetUserId: "user-t01",
      spaceId: "space-task1",
      teamId: "team-t01",
      agentId: "agent-t01",
      taskId: "task-t01",
      sessionId: "formal-session-t01",
      agentSource: "codex",
      visibleAssetSetSha256: "a".repeat(64),
    } as const;
    const inspected = await inspectFormalAssetRestorePlanWithLoader({
      rawPlan: plan,
      rawRestoreObservations: restore,
      expectedBinding,
      expectedSplit: "dev",
      loadAdapter: async () => ({
        inspectFormalAssetRestorePlan: async (
          safePlan: FormalAssetRestorePlan,
          safeRestore: unknown,
          safeContext: { expectedBinding: typeof expectedBinding },
        ) => {
          receivedPlan = safePlan;
          expect(Object.isFrozen(safeRestore)).toBe(true);
          expect(safeContext).toEqual({ expectedBinding });
          expect(safeContext.expectedBinding).not.toBe(expectedBinding);
          expect(Object.isFrozen(safeContext)).toBe(true);
          expect(Object.isFrozen(safeContext.expectedBinding)).toBe(true);
          return { ready: true, inspected: 17 };
        },
      }),
    });

    expect(Object.isFrozen(receivedPlan)).toBe(true);
    expect(inspected).toEqual(expect.objectContaining({
      operation: "inspect",
      verification: "unverified",
      formalMetricEligible: false,
      readyForFormalMeasurement: false,
    }));
  });

  it("rejects an invalid prepared-run binding before loading the inspector", async () => {
    const plan = validPlan();
    const restore = await executeFormalAssetRestorePlanWithLoader({
      rawPlan: plan,
      expectedSplit: "dev",
      loadAdapter: async () => ({
        executeFormalAssetRestorePlan: async () => ({ restored: 17 }),
      }),
    });
    let loaded = false;

    await expect(inspectFormalAssetRestorePlanWithLoader({
      rawPlan: plan,
      rawRestoreObservations: restore,
      expectedSplit: "dev",
      expectedBinding: {
        datasetUserId: "user-t01",
        spaceId: "space-task1",
        teamId: "team-t01",
        agentId: "agent-t01",
        taskId: "task-t01",
        sessionId: "formal-session-t01",
        agentSource: "codex",
        visibleAssetSetSha256: "not-a-sha",
      },
      loadAdapter: async () => {
        loaded = true;
        return { inspectFormalAssetRestorePlan: async () => ({}) };
      },
    })).rejects.toThrow(/visibleAssetSetSha256/u);
    expect(loaded).toBe(false);
  });

  it("keeps runtime and legacy CLI sources clear of private authoring inputs", () => {
    const runtimeSource = readFileSync(resolve(
      benchRoot,
      "formal-assets",
      "restore-plan-runtime.ts",
    ), "utf8");
    const scripts = [
      "restore-formal-snapshot.ts",
      "inspect-formal-snapshot.ts",
    ].map((name) => readFileSync(resolve(
      benchRoot,
      "formal-dataset",
      "scripts",
      name,
    ), "utf8"));

    expect(runtimeSource).not.toMatch(/from\s+["'][^"']*(formal-schema|private-loader|formal-dataset)/u);
    for (const source of scripts) {
      expect(source).not.toMatch(
        /FormalWorldContract|formal-schema|private-loader|--contract|privateAnnotations|gold|pairs/iu,
      );
      expect(source).toContain("--plan");
      expect(source).toContain("--adapter");
    }
    expect(scripts[1]).toContain("--restore-observations");
  });
});
