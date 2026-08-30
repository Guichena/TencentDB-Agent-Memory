import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  inspectFormalCodeFreeze,
  parseFormalExecutionCliArguments,
} from "../../eval/tool-prompt-bench/formal-execution-cli.js";
import type { PreparedFormalRun } from "../../eval/tool-prompt-bench/formal-prepare-runner.js";

const run = {
  manifest: {
    code_commit: "1".repeat(40),
    prompt_freeze_commit: "2".repeat(40),
  },
} as PreparedFormalRun;

describe("formal execution CLI", () => {
  it("accepts only execution paths and service identity, never caller-provided commits", () => {
    const parsed = parseFormalExecutionCliArguments([
      "--run-dir", "D:/runs/one",
      "--preflight-receipt", "D:/runs/preflight.json",
      "--knowledge-health-url", "http://127.0.0.1:8790/health",
      "--knowledge-instance-id", "knowledge-a",
      "--repo-root", "D:/repo",
      "--timeout-ms", "120000",
    ]);
    expect(parsed).toMatchObject({
      knowledgeHealthUrl: "http://127.0.0.1:8790/health",
      expectedKnowledgeInstanceId: "knowledge-a",
      timeoutMs: 120000,
    });
    expect(() => parseFormalExecutionCliArguments([
      "--code-commit", "1".repeat(40),
    ])).toThrow(/unsupported formal execution argument/i);
  });

  it("derives code identity, clean state, and ancestry from Git", async () => {
    const calls: string[][] = [];
    const receipt = await inspectFormalCodeFreeze("D:/repo", run, async (args) => {
      calls.push([...args]);
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: `${"1".repeat(40)}\n`, stderr: "" };
      if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    expect(receipt).toEqual({
      executionCodeCommit: "1".repeat(40),
      promptFreezeCommit: "2".repeat(40),
      promptFreezeIsAncestor: true,
      workingTreeClean: true,
    });
    expect(calls).toEqual([
      ["rev-parse", "HEAD"],
      ["status", "--porcelain=v1"],
      ["merge-base", "--is-ancestor", "2".repeat(40), "1".repeat(40)],
    ]);
  });

  it("refuses a dirty execution worktree", async () => {
    await expect(inspectFormalCodeFreeze("D:/repo", run, async (args) => {
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: `${"1".repeat(40)}\n`, stderr: "" };
      return { exitCode: 0, stdout: " M MemoryProxy/src/injection/pipeline.ts\n", stderr: "" };
    })).rejects.toThrow(/worktree is not clean/i);
  });

  it("keeps the PowerShell wrapper manual and free of service/config mutation", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "task1-formal-cli-test-"));
    expect(root).toBeTruthy();
    const source = await readFile(resolve(
      process.cwd(),
      "eval",
      "tool-prompt-bench",
      "run-formal-execute.ps1",
    ), "utf8");
    expect(source).toContain("formal-execution-cli.ts");
    expect(source).not.toMatch(/docker|compose|Start-Process|config\.ya?ml|npm install|npm ci/i);
  });
});
