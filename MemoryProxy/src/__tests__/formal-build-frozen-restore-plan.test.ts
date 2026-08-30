import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFrozenFormalAssetRestorePlan } from "../../eval/tool-prompt-bench/formal-assets/build-frozen-restore-plan.js";
import {
  FORMAL_DATA_COMMIT,
  FORMAL_DATA_TAG,
  FORMAL_DATA_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-runtime/freeze.js";

const repositoryRoot = resolve(process.cwd(), "..");

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

describe("frozen formal asset restore plan builder", () => {
  it("rejects hidden_test before resolving the freeze or reading any file", () => {
    let resolveCalls = 0;
    let readCalls = 0;

    expect(() => buildFrozenFormalAssetRestorePlan({
      repositoryRoot: "must-not-be-read",
      split: "hidden_test",
      resolveFreeze: () => {
        resolveCalls += 1;
        throw new Error("freeze resolution must not run");
      },
      readText: () => {
        readCalls += 1;
        throw new Error("file read must not run");
      },
    })).toThrow(/hidden_test.*authorized/u);

    expect(resolveCalls).toBe(0);
    expect(readCalls).toBe(0);
  });

  it("builds the complete Dev restore plan from the frozen public bindings", () => {
    const readPaths: string[] = [];
    const plan = buildFrozenFormalAssetRestorePlan({
      repositoryRoot,
      split: "dev",
      readText: (path) => {
        readPaths.push(path.replaceAll("\\", "/"));
        return readFileSync(path, "utf8");
      },
      // Unknown JavaScript properties must not become a self-reported revision.
      revision: { tag: "caller-tag", commit: "0".repeat(40) },
    } as Parameters<typeof buildFrozenFormalAssetRestorePlan>[0]);

    expect(plan).toEqual(expect.objectContaining({
      schemaVersion: "task1.formal-asset-restore-plan.v1",
      split: "dev",
      revision: {
        tag: FORMAL_DATA_TAG,
        tagObject: FORMAL_DATA_TAG_OBJECT,
        commit: FORMAL_DATA_COMMIT,
        contractCanonicalSha256: "4fc62c1829301fe9f2410f6be40698d7b3d09ec90dde3bfe294452f7ef152d41",
        snapshotCanonicalSha256: "3a82d0ad8241ff3e2173555efbdb65dfb367a0a38c9998203c5b4754611a4783",
      },
      executable: false,
      formalMetricEligible: false,
    }));
    expect(plan.selectedVisibleAssetSets).toHaveLength(6);
    expect(plan.identityMappings.teams).toHaveLength(6);
    expect(plan.identityMappings.tasks).toHaveLength(24);
    expect(plan.assets).toHaveLength(284);
    expect(plan.actions).toHaveLength(318);
    for (const suffix of [
      "formal-dataset/DATASET-BUILD-STATUS.json",
      "formal-runtime/frozen/formal-runtime-freeze.json",
      "formal-runtime/frozen/case-bindings.jsonl",
      "formal-dataset/registry/contracts/formal-v1.json",
    ]) {
      expect(readPaths.some((path) => path.endsWith(suffix)), suffix).toBe(true);
    }

    const keys = allKeys(plan);
    for (const forbidden of [
      "publicCases", "privateAnnotations", "pairs", "runRecords", "gold",
      "query", "contextMessages", "allowedSequences", "evidenceRefs", "caseId",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });

  it("rejects a worktree contract whose frozen file bytes drift", () => {
    expect(() => buildFrozenFormalAssetRestorePlan({
      repositoryRoot,
      split: "dev",
      readText: (path) => {
        const text = readFileSync(path, "utf8");
        return path.endsWith("formal-v1.json") ? `${text}\n` : text;
      },
    })).toThrow(/contract file hash/u);
  });
});
