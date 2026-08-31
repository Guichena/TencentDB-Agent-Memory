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
  it("freezes 24 positives and 16 paired/natural no-tool cases across eight Teams", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const built = buildFormalSmokePreregistration({ freeze });

    expect(built.caseIds).toEqual([
      "T01-MEMORY-006-P",
      "T01-SKILL-010-P",
      "T01-KNOWLEDGE-DECODER-005-P",
      "T01-MEMORY-006-N",
      "T01-NATURAL-004",
      "T02-MEMORY-001-P",
      "T02-SKILL-007-P",
      "T02-KNOWLEDGE-013-P",
      "T02-SKILL-007-N",
      "T02-NATURAL-009",
      "T03-MEM-001-P",
      "T03-SKILL-001-P",
      "T03-KNOW-001-P",
      "T03-KNOW-001-N",
      "T03-NAT-002",
      "T04-MEM-001-P",
      "T04-SKILL-001-P",
      "T04-KNOW-001-P",
      "T04-MEM-001-N",
      "T04-NAT-006",
      "T11-MEMORY-003-P",
      "T11-SKILL-007-P",
      "T11-KNOWLEDGE-013-P",
      "T11-SKILL-007-N",
      "T11-NATURAL-001-N",
      "T12-MEMORY-006-P",
      "T12-SKILL-007-P",
      "T12-KNOWLEDGE-014-P",
      "T12-KNOWLEDGE-014-N",
      "T12-NATURAL-006-N",
      "T17-MEM-01-P",
      "T17-SKL-01-P",
      "T17-KNW-01-P",
      "T17-MEM-01-N",
      "T17-NAT-02",
      "T18-MEM-05-P",
      "T18-SKL-06-P",
      "T18-KNW-01-P",
      "T18-SKL-06-N",
      "T18-NAT-10",
    ]);
    expect(new Set(built.caseIds).size).toBe(40);
    expect(built.selectionContract.schemaVersion).toBe("task1.formal-dev-smoke-preregistration.v2");
    expect(built.selectionContract.teamRules.map((rule) => rule.pairedNegativeFamily)).toEqual([
      "memory", "skill", "knowledge", "memory", "skill", "knowledge", "memory", "skill",
    ]);
    expect(built.selectionContract.coverage).toMatchObject({
      counterfactualKind: "answer_in_current_context",
      pairedNegative: "three_memory_three_skill_two_knowledge_frozen_counterparts",
    });
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
