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
    const plan = { planSha256: "a".repeat(64) } as FormalAssetRestorePlan;
    const preflightInput = { expected: { sessionId: "session-a" } } as FormalExecutionPreflightInput;
    const inspected = {
      operation: "inspect",
      unverifiedObservations: preflightInput,
    } as FormalAssetRuntimeObservations;
    const receipt = { ready: true } as FormalExecutionPreflightReceipt;
    const parsePlan = vi.fn(() => plan);
    const parseObservations = vi.fn(() => inspected);
    const evaluate = vi.fn(() => receipt);

    expect(createFormalExecutionPreflightReceipt({
      rawPlan: { unsafe: "caller input" },
      rawInspectObservations: { ready: true },
      split: "dev",
    }, { parsePlan, parseObservations, evaluate })).toBe(receipt);
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
