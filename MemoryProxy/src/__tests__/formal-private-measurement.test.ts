import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadPrivateMeasurementSplit,
} from "../../eval/tool-prompt-bench/formal-runtime/private-loader.js";
import {
  resolveFormalDataFreeze,
} from "../../eval/tool-prompt-bench/formal-runtime/index.js";

describe("Task 1 private Measurement boundary", () => {
  it("loads only Measurement-v2 Gold, Pair, and the 21 runtime contracts", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const data = loadPrivateMeasurementSplit({ freeze, split: "dev" });

    expect(data).toMatchObject({
      split: "dev",
      goldCount: 240,
      pairCount: 90,
      runtimeContractCount: 21,
      hashes: {
        manifestCanonicalSha256: "ff5384e0386079a1e16464063247520eae7ea4964b43c6b7a9972e38b2ba7da9",
        goldCanonicalSha256: "8cfffec5c06b37b92b41cf95ee0d70333e9a2a7f6063145100b20ce753fe58c5",
        pairCanonicalSha256: "72def9ee92733ad5b2bc33f40ff500a75abf748ccdf4703f6b8464678e508c31",
        runtimeContractsCanonicalSha256: "42c1f5847fe88ed70ec9ce35217dcd8cfdc90fa8a7dd9a53e45b50481204b96e",
      },
      formalMetricEligible: false,
    });
    expect(Object.keys(data).sort()).toEqual([
      "formalMetricEligible",
      "gold",
      "goldCount",
      "hashes",
      "pairCount",
      "pairs",
      "runtimeContractCount",
      "runtimeContracts",
      "split",
    ]);
    expect(Object.isFrozen(data.gold)).toBe(true);
    expect(Object.isFrozen(data.pairs)).toBe(true);
    expect(Object.isFrozen(data.runtimeContracts)).toBe(true);
  });

  it("rejects hidden before reading even the private manifest", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    expect(() => loadPrivateMeasurementSplit({
      freeze,
      split: "hidden_test",
      readText: (path) => {
        reads.push(path);
        return "";
      },
    })).toThrow(/hidden_test private Measurement access is not authorized/);
    expect(reads).toEqual([]);
  });

  it("keeps provider and runner dependency graphs physically free of the private loader", () => {
    const benchRoot = resolve(process.cwd(), "eval", "tool-prompt-bench");
    const publicFiles = [
      resolve(benchRoot, "formal-runtime", "index.ts"),
      resolve(benchRoot, "formal-runtime", "provider-loader.ts"),
      resolve(benchRoot, "formal-runtime", "case-bindings.ts"),
      resolve(benchRoot, "codex-runner.ts"),
      resolve(benchRoot, "formal-prepare-runner.ts"),
    ].filter((path) => existsSync(path));

    for (const path of publicFiles) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/private-loader|measurement-v2[\\/]private/u);
    }
  });
});
