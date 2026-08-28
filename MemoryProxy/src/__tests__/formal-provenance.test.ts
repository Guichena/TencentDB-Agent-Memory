import { describe, expect, it } from "vitest";
import {
  assertFormalProvenanceSplit,
  validateFormalProvenanceSplit,
  type FormalCaseProvenance,
  type ProvenanceConflictKeys,
} from "../../eval/tool-prompt-bench/worlds/formal-provenance.js";

function keys(overrides: Partial<ProvenanceConflictKeys> = {}): ProvenanceConflictKeys {
  return {
    repoForkFamily: [], sourceTask: [], trajectory: [], patchHash: [], skillBodyFamily: [], skillBodyHash: [],
    wikiDocument: [], codegraphCommit: [], nearDuplicateQueryGroup: [], ...overrides,
  };
}

function item(
  caseId: string,
  split: "dev" | "hidden_test",
  conflictKeys: Partial<ProvenanceConflictKeys>,
): FormalCaseProvenance {
  return { worldId: `world-${split}`, caseId, split, conflictKeys: keys(conflictKeys) };
}

describe("Formal provenance split gate", () => {
  it("is deterministic and accepts disconnected dev and hidden-test provenance", () => {
    const inputs = [
      item("hidden-1", "hidden_test", { sourceTask: ["task-hidden"], repoForkFamily: ["repo-hidden"] }),
      item("dev-1", "dev", { sourceTask: ["task-dev"], repoForkFamily: ["repo-dev"] }),
    ];
    const first = validateFormalProvenanceSplit(inputs);
    const second = validateFormalProvenanceSplit([...inputs].reverse());

    expect(first).toMatchObject({ valid: true, errors: [] });
    expect(first.components).toEqual(second.components);
    expect(first.graphSha256).toBe(second.graphSha256);
    expect(() => assertFormalProvenanceSplit(inputs)).not.toThrow();
  });

  it("rejects a transitive cross-split component induced by any shared key", () => {
    const result = validateFormalProvenanceSplit([
      item("dev-1", "dev", { sourceTask: ["task-dev"], repoForkFamily: ["fork-family-a"] }),
      item("bridge-1", "dev", { sourceTask: ["task-bridge"], repoForkFamily: ["fork-family-a"], patchHash: ["patch-7"] }),
      item("hidden-1", "hidden_test", { sourceTask: ["task-hidden"], patchHash: ["patch-7"] }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/split leakage/);
    expect(result.errors.join("\n")).toMatch(/repoForkFamily:fork-family-a/);
    expect(result.errors.join("\n")).toMatch(/patchHash:patch-7/);
    expect(result.components).toHaveLength(1);
  });

  it("treats an upstream near-duplicate query group as a normal leakage edge", () => {
    const result = validateFormalProvenanceSplit([
      item("dev-1", "dev", { sourceTask: ["task-dev"], nearDuplicateQueryGroup: ["query-group-9"] }),
      item("hidden-1", "hidden_test", { trajectory: ["traj-hidden"], nearDuplicateQueryGroup: ["query-group-9"] }),
    ]);

    expect(result.errors.join("\n")).toMatch(/nearDuplicateQueryGroup:query-group-9/);
  });

  it("rejects duplicate case ids and records with no source task or trajectory", () => {
    const result = validateFormalProvenanceSplit([
      item("duplicate", "dev", { sourceTask: ["task-1"] }),
      item("duplicate", "hidden_test", { sourceTask: ["task-2"] }),
      item("missing-source", "dev", { repoForkFamily: ["repo-a"] }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/duplicate caseId duplicate/);
    expect(result.errors.join("\n")).toMatch(/source keys are missing/);
  });
});
