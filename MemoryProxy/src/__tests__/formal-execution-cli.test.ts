import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  inspectFormalCodeFreeze,
  parseFormalExecutionCliArguments,
} from "../../eval/tool-prompt-bench/formal-execution-cli.js";
import {
  FORMAL_PROMPT_FREEZE_COMMIT,
  FORMAL_PROMPT_FREEZE_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-cache-structure-gate.js";
import type { PreparedFormalRun } from "../../eval/tool-prompt-bench/formal-prepare-runner.js";

const run = {
  manifest: {
    code_commit: "1".repeat(40),
    prompt_freeze_commit: FORMAL_PROMPT_FREEZE_COMMIT,
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
      if (args.join(" ") === "rev-parse HEAD") {
        return { exitCode: 0, stdout: `${"1".repeat(40)}\n`, stderr: "" };
      }
      if (args.join(" ") === "cat-file -t refs/tags/task1-code-freeze") {
        return { exitCode: 0, stdout: "tag\n", stderr: "" };
      }
      if (args.join(" ") === "rev-parse refs/tags/task1-code-freeze") {
        return { exitCode: 0, stdout: `${FORMAL_PROMPT_FREEZE_TAG_OBJECT}\n`, stderr: "" };
      }
      if (args.join(" ") === "rev-parse task1-code-freeze^{commit}") {
        return { exitCode: 0, stdout: `${FORMAL_PROMPT_FREEZE_COMMIT}\n`, stderr: "" };
      }
      if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    expect(receipt).toEqual({
      executionCodeCommit: "1".repeat(40),
      promptFreezeTagObject: FORMAL_PROMPT_FREEZE_TAG_OBJECT,
      promptFreezeCommit: FORMAL_PROMPT_FREEZE_COMMIT,
      promptFreezeIsAncestor: true,
      workingTreeClean: true,
    });
    expect(calls).toEqual([
      ["rev-parse", "HEAD"],
      ["status", "--porcelain=v1"],
      ["cat-file", "-t", "refs/tags/task1-code-freeze"],
      ["rev-parse", "refs/tags/task1-code-freeze"],
      ["rev-parse", "task1-code-freeze^{commit}"],
      ["merge-base", "--is-ancestor", FORMAL_PROMPT_FREEZE_COMMIT, "1".repeat(40)],
    ]);
  });

  it("refuses a dirty execution worktree", async () => {
    await expect(inspectFormalCodeFreeze("D:/repo", run, async (args) => {
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: `${"1".repeat(40)}\n`, stderr: "" };
      return { exitCode: 0, stdout: " M MemoryProxy/src/injection/pipeline.ts\n", stderr: "" };
    })).rejects.toThrow(/worktree is not clean/i);
  });

  it("refuses a moved Prompt tag even when its replacement is annotated", async () => {
    await expect(inspectFormalCodeFreeze("D:/repo", run, async (args) => {
      if (args.join(" ") === "rev-parse HEAD") {
        return { exitCode: 0, stdout: `${"1".repeat(40)}\n`, stderr: "" };
      }
      if (args.join(" ") === "cat-file -t refs/tags/task1-code-freeze") {
        return { exitCode: 0, stdout: "tag\n", stderr: "" };
      }
      if (args.join(" ") === "rev-parse refs/tags/task1-code-freeze") {
        return { exitCode: 0, stdout: `${"3".repeat(40)}\n`, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    })).rejects.toThrow(/Prompt freeze tag object drift/i);
  });

  it("refuses a lightweight Prompt freeze tag", async () => {
    await expect(inspectFormalCodeFreeze("D:/repo", run, async (args) => {
      if (args.join(" ") === "rev-parse HEAD") {
        return { exitCode: 0, stdout: `${"1".repeat(40)}\n`, stderr: "" };
      }
      if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" };
      if (args.join(" ") === "cat-file -t refs/tags/task1-code-freeze") {
        return { exitCode: 0, stdout: "commit\n", stderr: "" };
      }
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    })).rejects.toThrow(/expected annotated tag object/i);
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
