import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseFormalAssetRestorePlan,
  type FormalAssetRestorePlan,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";
import {
  authorizeFormalAssetRestoreSelection,
  compileFormalAssetRestorePlan,
  projectFormalAssetRestoreSource,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan.js";
import type { FormalCaseBinding } from "../../eval/tool-prompt-bench/formal-runtime/build-case-bindings.js";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/formal-runtime/canonical.js";
import {
  FORMAL_DATA_COMMIT,
  FORMAL_DATA_TAG,
  FORMAL_DATA_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-runtime/freeze.js";
import type { FormalWorldContract } from "../../eval/tool-prompt-bench/worlds/formal-schema.js";

const benchRoot = resolve(process.cwd(), "eval", "tool-prompt-bench");

const revision = {
  tag: FORMAL_DATA_TAG,
  tagObject: FORMAL_DATA_TAG_OBJECT,
  commit: FORMAL_DATA_COMMIT,
  contractCanonicalSha256: "eb04b26cfe03810030f6b7d0a06f82dfedf7c8011ce11bb181db8af0b94b58b7",
  snapshotCanonicalSha256: "addd9c6311d4bd44478ea9438f50816d59eb2c8adfb9c4d9f53fd3fc152e0b7e",
} as const;

function loadContract(): FormalWorldContract {
  return JSON.parse(readFileSync(resolve(
    benchRoot,
    "formal-dataset",
    "registry",
    "contracts",
    "formal-v2.json",
  ), "utf8")) as FormalWorldContract;
}

function loadBinding(): FormalCaseBinding {
  const rows = readFileSync(
    resolve(benchRoot, "formal-runtime", "frozen", "case-bindings.jsonl"),
    "utf8",
  ).trim().split("\n").map((line) => JSON.parse(line) as FormalCaseBinding);
  const row = rows.find((candidate) => candidate.split === "dev"
    && candidate.identity.teamId === "T01"
    && candidate.identity.agentId === "agent-task1-t01-general");
  if (!row) throw new Error("test fixture binding is missing");
  return row;
}

function buildPlan(): FormalAssetRestorePlan {
  const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
  const source = projectFormalAssetRestoreSource({
    selection,
    revision,
    contract: loadContract(),
  });
  return compileFormalAssetRestorePlan({ selection, source, bindings: [loadBinding()] });
}

function mutablePlan(): Record<string, unknown> {
  return structuredClone(buildPlan()) as unknown as Record<string, unknown>;
}

function rehash(plan: Record<string, unknown>): void {
  const { planSha256: _old, ...core } = plan;
  plan.planSha256 = canonicalSha256(core);
}

describe("formal asset restore plan runtime contract", () => {
  it("keeps the runtime module independent from authoring and private contracts", () => {
    const source = readFileSync(resolve(
      benchRoot,
      "formal-assets",
      "restore-plan-contract.ts",
    ), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(formal-schema|private-loader|formal-dataset)/u);
  });

  it("parses a detached plan and recursively freezes runtime evidence", () => {
    const raw = mutablePlan();
    const parsed = parseFormalAssetRestorePlan(raw, {
      expectedSplit: "dev",
      expectedRevision: revision,
    });

    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.runtimePolicy)).toBe(true);
    expect(Object.isFrozen(parsed.runtimePolicy.policy.extraction.extractors)).toBe(true);
    expect(Object.isFrozen(parsed.actions[0]?.body)).toBe(true);

    const rawSnapshot = raw.snapshot as Record<string, unknown>;
    rawSnapshot.snapshotId = "mutated-after-parse";
    expect(parsed.snapshot.snapshotId).not.toBe("mutated-after-parse");
  });

  it("checks hidden authorization before inspecting the supplied value", () => {
    let reads = 0;
    const unreadable = new Proxy({}, {
      get() {
        reads += 1;
        throw new Error("raw value was read");
      },
      ownKeys() {
        reads += 1;
        throw new Error("raw value was enumerated");
      },
      getOwnPropertyDescriptor() {
        reads += 1;
        throw new Error("raw descriptor was read");
      },
    });

    expect(() => parseFormalAssetRestorePlan(unreadable, {
      expectedSplit: "hidden_test",
    })).toThrow(/hidden_test.*authorized/iu);
    expect(reads).toBe(0);
  });

  it("rejects exact-plan hash drift", () => {
    const raw = mutablePlan();
    (raw.snapshot as Record<string, unknown>).snapshotId = "drifted-snapshot";

    expect(() => parseFormalAssetRestorePlan(raw, { expectedSplit: "dev" }))
      .toThrow(/planSha256/iu);
  });

  it("rejects a runtime-policy hash drift even when the outer plan hash is renewed", () => {
    const raw = mutablePlan();
    (raw.runtimePolicy as Record<string, unknown>).sha256 = "0".repeat(64);
    rehash(raw);

    expect(() => parseFormalAssetRestorePlan(raw, { expectedSplit: "dev" }))
      .toThrow(/runtimePolicy.*sha256/iu);
  });

  it("binds the plan to the caller's expected frozen revision", () => {
    const raw = mutablePlan();
    const wrongRevision = { ...revision, tag: `${revision.tag}-other` };

    expect(() => parseFormalAssetRestorePlan(raw, {
      expectedSplit: "dev",
      expectedRevision: wrongRevision,
    })).toThrow(/revision.*expected/iu);
  });

  it.each(["executable", "formalMetricEligible"])("requires %s=false", (field) => {
    const raw = mutablePlan();
    raw[field] = true;
    rehash(raw);

    expect(() => parseFormalAssetRestorePlan(raw, { expectedSplit: "dev" }))
      .toThrow(new RegExp(`${field}.*false`, "iu"));
  });

  it.each([
    ["Gold key", "gold"],
    ["Case key", "caseId"],
    ["secret-like key", "authorization"],
  ])("rejects a recursively nested %s even with a renewed plan hash", (_label, key) => {
    const raw = mutablePlan();
    const firstAction = (raw.actions as Array<Record<string, unknown>>)[0]!;
    (firstAction.body as Record<string, unknown>)[key] = "must-not-cross-runtime-boundary";
    rehash(raw);

    expect(() => parseFormalAssetRestorePlan(raw, { expectedSplit: "dev" }))
      .toThrow(/forbidden|secret/iu);
  });

  it("rejects an unknown top-level field rather than silently dropping it", () => {
    const raw = mutablePlan();
    raw.debugNote = "not part of the persisted contract";
    rehash(raw);

    expect(() => parseFormalAssetRestorePlan(raw, { expectedSplit: "dev" }))
      .toThrow(/unexpected.*debugNote/iu);
  });

  it("rejects action dependencies that cannot be satisfied", () => {
    const raw = mutablePlan();
    const actions = raw.actions as Array<Record<string, unknown>>;
    actions[0]!.dependsOn = ["action-does-not-exist"];
    rehash(raw);

    expect(() => parseFormalAssetRestorePlan(raw, { expectedSplit: "dev" }))
      .toThrow(/unknown action dependency/iu);
  });
});
