import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildFormalSmokePreregistration,
  serializeFormalSmokePreregistration,
} from "../../eval/tool-prompt-bench/formal-runtime/build-smoke-preregistration.js";
import {
  loadFormalSmokePreregistration,
  resolveFormalDataFreeze,
} from "../../eval/tool-prompt-bench/formal-runtime/index.js";

describe("Task 1 formal Dev smoke preregistration", () => {
  it("freezes 6 balanced positives and 6 paired/natural no-tool cases across six Teams", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const built = buildFormalSmokePreregistration({ freeze });

    expect(built.caseIds).toEqual([
      "T01-MEMORY-006-P",
      "T01-MEMORY-006-N",
      "T02-MEMORY-001-P",
      "T02-NATURAL-001",
      "T03-SKILL-001-P",
      "T03-SKILL-001-N",
      "T04-SKILL-001-P",
      "T04-NAT-001",
      "T11-KNOWLEDGE-013-P",
      "T11-KNOWLEDGE-013-N",
      "T12-KNOWLEDGE-013-P",
      "T12-NATURAL-001-N",
    ]);
    expect(new Set(built.caseIds).size).toBe(12);
    expect(built.selectionContract.teamRules.map((rule) => rule.positiveFamily)).toEqual([
      "memory", "memory", "skill", "skill", "knowledge", "knowledge",
    ]);
    expect(built.selectionContract.teamRules.map((rule) => rule.noToolKind)).toEqual([
      "paired_counterpart", "natural", "paired_counterpart", "natural", "paired_counterpart", "natural",
    ]);
    expect(built.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(built.formalMetricEligible).toBe(false);

    const persisted = JSON.parse(serializeFormalSmokePreregistration(built)) as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual(["caseIds", "selectionContract", "sha256"]);
  });

  it("loads the public preregistration without importing private Measurement data", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const built = buildFormalSmokePreregistration({ freeze });
    const reads: string[] = [];
    const loaded = loadFormalSmokePreregistration({
      freeze,
      readText: (path) => {
        reads.push(path);
        return readFileSync(path, "utf8");
      },
    });

    expect(loaded).toMatchObject({
      caseIds: built.caseIds,
      selectionContract: built.selectionContract,
      sha256: built.sha256,
      formalMetricEligible: false,
    });
    expect(reads).toEqual([
      expect.stringMatching(/[\\/]formal-runtime[\\/]frozen[\\/]formal-runtime-freeze\.json$/),
      expect.stringMatching(/[\\/]formal-runtime[\\/]frozen[\\/]dev-smoke-preregistration\.json$/),
    ]);
    expect(Object.isFrozen(loaded.caseIds)).toBe(true);
    expect(Object.isFrozen(loaded.selectionContract)).toBe(true);
  });
});
