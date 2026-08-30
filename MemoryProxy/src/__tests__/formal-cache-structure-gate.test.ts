import { describe, expect, it } from "vitest";

import {
  inspectFormalCacheStructureFreeze,
  type FormalCacheGitRunner,
} from "../../eval/tool-prompt-bench/formal-cache-structure-gate.js";
import type { FormalExecutionReceipt } from "../../eval/tool-prompt-bench/formal-execution-runner.js";

const freezeCommit = "a".repeat(40);
const executionCommit = "b".repeat(40);
const tagObject = "c".repeat(40);
const sha = (character: string) => character.repeat(64);
const variants = [
  ["V0", "legacy"],
  ["V0-C", "contract-corrected"],
  ["V1a", "protocol-compact"],
  ["V1", "compact"],
  ["V2", "selection-calibrated"],
  ["V3", "capability-pruned"],
] as const;

function manifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    stage: "C06",
    profileInventory: variants.map(([variant, profile], index) => ({
      variant,
      profile,
      totalInjectionTokensO200k: 1000 - index,
      totalInjectionSha256: sha(String(index + 1)),
      effectiveSystemSha256: sha(String(index + 2)),
      stablePrefixBytesFromParent: index === 0 ? 1000 : 100 + index,
      firstChangedByteFromParent: index === 0 ? null : 100 + index,
      blocks: [{
        blockId: "skill_tools",
        staticTemplateSha256: sha(String(index + 3)),
      }],
    })),
    cacheNamespaces: variants.map(([variant, profile], index) => ({
      variant,
      profile,
      hookCacheIdentity: `cache-${index}`,
    })),
    runnerProfileSmoke: variants.map(([variant, profile], index) => ({
      variant,
      profile,
      promptSha256: sha(String(index + 4)),
    })),
  });
}

function receipt(promptFreezeCommit = freezeCommit): FormalExecutionReceipt {
  return {
    codeFreeze: {
      executionCodeCommit: executionCommit,
      promptFreezeCommit,
      promptFreezeIsAncestor: true,
      workingTreeClean: true,
    },
  } as FormalExecutionReceipt;
}

function gitRunner(overrides: Partial<Record<string, { exitCode: number; stdout?: string }>> = {}): FormalCacheGitRunner {
  return async (args) => {
    const key = args.join(" ");
    const override = overrides[key];
    if (override) return { exitCode: override.exitCode, stdout: override.stdout ?? "", stderr: "" };
    if (key === "rev-parse refs/tags/task1-code-freeze") {
      return { exitCode: 0, stdout: `${tagObject}\n`, stderr: "" };
    }
    if (key === "rev-parse task1-code-freeze^{}") {
      return { exitCode: 0, stdout: `${freezeCommit}\n`, stderr: "" };
    }
    if (key.startsWith("show ")) return { exitCode: 0, stdout: manifest(), stderr: "" };
    if (key.startsWith("diff --quiet ")) return { exitCode: 0, stdout: "", stderr: "" };
    throw new Error(`unexpected Git call: ${key}`);
  };
}

describe("formal cache structure gate", () => {
  it("binds every run to the immutable Prompt freeze and unchanged Prompt ownership paths", async () => {
    const gate = await inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt(), receipt()],
      runGit: gitRunner(),
    });
    expect(gate).toMatchObject({
      schemaVersion: "task1.formal-cache-structure-gate.v1",
      passed: true,
      promptFreezeTag: "task1-code-freeze",
      promptFreezeTagObject: tagObject,
      promptFreezeCommit: freezeCommit,
    });
    expect(gate.variants).toHaveLength(6);
    expect(gate.variants[5]).toMatchObject({
      variantId: "V3",
      profileId: "capability-pruned",
      totalInjectionTokensO200k: 995,
    });
  });

  it("rejects a caller-selected Prompt freeze even when it is an ancestor", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt("d".repeat(40))],
      runGit: gitRunner(),
    })).rejects.toThrow(/does not use task1-code-freeze/i);
  });

  it("rejects any post-freeze change to a Prompt ownership path", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      runGit: gitRunner({
        [`diff --quiet ${freezeCommit}..${executionCommit} -- MemoryProxy/src/injection MemoryProxy/src/session/context-injector.ts MemoryProxy/eval/tool-prompt-bench/variant-profiles.ts`]: {
          exitCode: 1,
        },
      }),
    })).rejects.toThrow(/Prompt ownership paths changed/i);
  });
});
