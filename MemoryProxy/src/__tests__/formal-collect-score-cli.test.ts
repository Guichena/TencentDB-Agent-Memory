import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  discoverExecutionReceipts,
  parseFormalCollectScoreCliArguments,
} from "../../eval/tool-prompt-bench/formal-collect-score-cli.js";

describe("formal collect/score CLI", () => {
  it("requires an explicit held-out authorization flag", () => {
    const common = [
      "--campaign-id", "campaign-a",
      "--campaign-root", "D:/runs/campaign-a",
      "--trace-campaign-dir", "D:/traces/campaign-a",
      "--repo-root", "D:/repo",
      "--split", "hidden_test",
      "--output", "D:/results/campaign-a.json",
    ];
    expect(() => parseFormalCollectScoreCliArguments(common))
      .toThrow(/requires --allow-hidden-test/i);
    expect(parseFormalCollectScoreCliArguments([...common, "--allow-hidden-test"]))
      .toMatchObject({ split: "hidden_test", allowHiddenTest: true });
  });

  it("discovers only completed execution receipts in deterministic order", async () => {
    const root = await mkdtemp(join(tmpdir(), "task1-collect-receipts-"));
    const make = async (caseId: string, repeat: number) => {
      const directory = join(root, caseId, "V0", String(repeat));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "formal-execution-receipt.json"), JSON.stringify({
        schemaVersion: "task1.formal-execution-receipt.v1",
        variantId: "V0",
        caseId,
        repeat,
      }), "utf8");
    };
    await make("case-b", 1);
    await make("case-a", 2);
    await make("case-a", 1);
    await mkdir(join(root, "prepared-only"));

    const receipts = await discoverExecutionReceipts(root);
    expect(receipts.map((receipt) => `${receipt.caseId}:${receipt.repeat}`))
      .toEqual(["case-a:1", "case-a:2", "case-b:1"]);
  });
});
