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
  it("loads only Measurement-v2 Gold, Pair, and the 22 runtime contracts", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const data = loadPrivateMeasurementSplit({ freeze, split: "dev" });

    expect(data).toMatchObject({
      split: "dev",
      goldCount: 320,
      pairCount: 120,
      runtimeContractCount: 22,
      hashes: {
        manifestCanonicalSha256: "a9756066d59ea2a972fb48910bf8099fd218a4541bf8451393114cd5feeb13bc",
        goldCanonicalSha256: "720d5ee06bebb6edb5b15698d605590bf917998eedf6f448692b1fdf16bb3657",
        pairCanonicalSha256: "a5a5e1e8b2db77c309110cca514024a67cbbf66f15d9744002fc2e5886dc5e9d",
        runtimeContractsCanonicalSha256: "3bd16cf3563711ce08df9da9d71d52db8dffdc200715265b6812961d63dc73d1",
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
      resolve(benchRoot, "formal-execution-runner.ts"),
    ].filter((path) => existsSync(path));

    for (const path of publicFiles) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/private-loader|measurement-v2[\\/]private/u);
    }
  });
});
