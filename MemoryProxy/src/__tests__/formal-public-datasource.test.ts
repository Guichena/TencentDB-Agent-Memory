import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import {
  openFormalProviderSplit,
  resolveFormalDataFreeze,
} from "../../eval/tool-prompt-bench/formal-runtime/index.js";

describe("Task 1 formal public datasource", () => {
  it("rejects hidden before status, provider, bindings, or manifest are read", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    expect(() => openFormalProviderSplit({
      freeze,
      split: "hidden_test",
      readText: (path) => {
        reads.push(path);
        return "";
      },
    })).toThrow(/hidden_test public datasource access is not authorized/);
    expect(reads).toEqual([]);
  });

  it("joins authorized provider and bindings by caseId and verifies frozen hashes", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    const hidden = openFormalProviderSplit({
      freeze,
      split: "hidden_test",
      allowHiddenTest: true,
      readText: (path) => {
        reads.push(path);
        return readFileSync(path, "utf8");
      },
    });

    expect(hidden).toMatchObject({
      split: "hidden_test",
      count: 400,
      snapshotCanonicalSha256: "23fe7b47d13c950765fa9557da918e1d102b7ab4558171cb15a8444d1cbd9c9e",
      measurementV2GoldCanonicalSha256: "fdcbfbce3ada6b274cdfb6a9444c3f151af004b6186ca5e0186fe7e16d3c883f",
      measurementV2PairCanonicalSha256: "9195cf6dc6fbec5dca2f1824c93763f50d42cb3f00f06339f7431dde239b42b8",
      formalMetricEligible: false,
    });
    expect(hidden.cases.every((item) => item.provider.caseId === item.binding.caseId)).toBe(true);
    expect(new Set(hidden.cases.map((item) => item.provider.caseId)).size).toBe(400);
    expect(reads.map((path) => basename(path)).sort()).toEqual([
      "DATASET-BUILD-STATUS.json",
      "case-bindings.jsonl",
      "formal-runtime-freeze.json",
      "hidden.sealed.jsonl",
    ]);
    expect(reads.some((path) => /measurement-v2[\\/]private/u.test(path))).toBe(false);

    const dev = openFormalProviderSplit({ freeze, split: "dev" });
    expect(dev).toMatchObject({
      count: 240,
      snapshotCanonicalSha256: "3a82d0ad8241ff3e2173555efbdb65dfb367a0a38c9998203c5b4754611a4783",
      measurementV2GoldCanonicalSha256: "8cfffec5c06b37b92b41cf95ee0d70333e9a2a7f6063145100b20ce753fe58c5",
      formalMetricEligible: false,
    });
  });
});
