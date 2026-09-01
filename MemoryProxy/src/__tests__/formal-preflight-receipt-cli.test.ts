import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createFormalExecutionPreflightReceipt,
  parseFormalPreflightReceiptCliArguments,
} from "../../eval/tool-prompt-bench/formal-preflight-receipt-cli.js";
import type { FormalAssetRestorePlan } from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";
import type { FormalAssetRuntimeObservations } from "../../eval/tool-prompt-bench/formal-assets/restore-plan-runtime.js";
import type {
  FormalExecutionPreflightInput,
  FormalExecutionPreflightReceipt,
} from "../../eval/tool-prompt-bench/formal-execution-preflight.js";

describe("formal preflight receipt CLI", () => {
  it("requires explicit hidden-test authorization", () => {
    const common = [
      "--run-dir", "D:/runs/case-a/V0/1",
      "--plan", "D:/runs/restore-plan.json",
      "--inspect-observations", "D:/runs/inspect.json",
      "--split", "hidden_test",
      "--output", "D:/runs/preflight.json",
    ];
    expect(() => parseFormalPreflightReceiptCliArguments(common))
      .toThrow(/requires --allow-hidden-test/i);
    expect(parseFormalPreflightReceiptCliArguments([...common, "--allow-hidden-test"]))
      .toMatchObject({ split: "hidden_test", allowHiddenTest: true });
  });

  it("validates the pinned plan and inspection envelope before evaluating adapter observations", () => {
    const plan = {
      planSha256: "a".repeat(64),
      snapshot: { snapshotId: "snapshot-a" },
      revision: { snapshotCanonicalSha256: "c".repeat(64) },
    } as FormalAssetRestorePlan;
    const expected = {
      datasetUserId: "user-a",
      spaceId: "space-a",
      teamId: "team-a",
      agentId: "agent-a",
      taskId: "task-a",
      sessionId: "session-a",
      agentSource: "codex",
      visibleAssetSetSha256: "b".repeat(64),
    } as const;
    const preflightInput = { expected } as FormalExecutionPreflightInput;
    const inspected = {
      operation: "inspect",
      unverifiedObservations: preflightInput,
    } as FormalAssetRuntimeObservations;
    const receipt = { ready: true } as FormalExecutionPreflightReceipt;
    const parsePlan = vi.fn(() => plan);
    const parseObservations = vi.fn(() => inspected);
    const evaluate = vi.fn(() => receipt);

    const result = createFormalExecutionPreflightReceipt({
      rawPlan: { unsafe: "caller input" },
      rawInspectObservations: { ready: true },
      expected,
      split: "dev",
    }, { parsePlan, parseObservations, evaluate });
    expect(result).toMatchObject({
      ready: true,
      provenance: {
        snapshotId: "snapshot-a",
      },
    });
    expect(parseObservations).toHaveBeenCalledWith(
      { ready: true },
      expect.objectContaining({
        expectedOperation: "inspect",
        expectedSplit: "dev",
        expectedPlanSha256: "a".repeat(64),
      }),
    );
    expect(evaluate).toHaveBeenCalledWith(preflightInput);
  });

  it("rejects an inspector-provided expected binding that differs from the prepared run", () => {
    const expected = {
      datasetUserId: "user-a", spaceId: "space-a", teamId: "team-a",
      agentId: "agent-a", taskId: "task-a", sessionId: "session-a",
      agentSource: "codex", visibleAssetSetSha256: "b".repeat(64),
    } as const;
    expect(() => createFormalExecutionPreflightReceipt({
      rawPlan: {},
      rawInspectObservations: {},
      expected,
      split: "dev",
    }, {
      parsePlan: () => ({ planSha256: "a".repeat(64) }) as FormalAssetRestorePlan,
      parseObservations: () => ({
        unverifiedObservations: { expected: { ...expected, sessionId: "wrong-session" } },
      }) as FormalAssetRuntimeObservations,
      evaluate: () => ({ ready: true }) as FormalExecutionPreflightReceipt,
    })).toThrow(/does not match the prepared run/i);
  });

  it("keeps the wrapper manual and free of service or config mutation", async () => {
    expect(await mkdtemp(resolve(tmpdir(), "task1-preflight-cli-test-"))).toBeTruthy();
    const source = await readFile(resolve(
      process.cwd(),
      "eval",
      "tool-prompt-bench",
      "create-formal-preflight-receipt.ps1",
    ), "utf8");
    expect(source).toContain("formal-preflight-receipt-cli.ts");
    expect(source).not.toMatch(/docker|compose|Start-Process|config\.ya?ml|npm install|npm ci/i);
  });
});
