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
      count: 480,
      snapshotCanonicalSha256: "93d18538660330603f082a396791712e9b0cdba6647ea819fa3ca6e456085fbb",
      measurementV2GoldCanonicalSha256: "2e5c5bf72c2fa162944ddf7fdc788b9cc2d9cbb2bbce42e27b9d98773e69565f",
      measurementV2PairCanonicalSha256: "76ee4c151313fb731dc83f51301eee666e105db08b1d08351c6ef87e5727ac3d",
      formalMetricEligible: false,
    });
    expect(hidden.cases.every((item) => item.provider.caseId === item.binding.caseId)).toBe(true);
    expect(new Set(hidden.cases.map((item) => item.provider.caseId)).size).toBe(480);
    expect(reads.map((path) => basename(path)).sort()).toEqual([
      "DATASET-BUILD-STATUS.json",
      "case-bindings.jsonl",
      "formal-runtime-freeze.json",
      "hidden.sealed.jsonl",
    ]);
    expect(reads.some((path) => /measurement-v2[\\/]private/u.test(path))).toBe(false);

    const dev = openFormalProviderSplit({ freeze, split: "dev" });
    expect(dev).toMatchObject({
      count: 320,
      snapshotCanonicalSha256: "addd9c6311d4bd44478ea9438f50816d59eb2c8adfb9c4d9f53fd3fc152e0b7e",
      measurementV2GoldCanonicalSha256: "720d5ee06bebb6edb5b15698d605590bf917998eedf6f448692b1fdf16bb3657",
      formalMetricEligible: false,
    });
  });
});
