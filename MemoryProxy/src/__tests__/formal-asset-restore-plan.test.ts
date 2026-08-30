import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  authorizeFormalAssetRestoreSelection,
  compileFormalAssetRestorePlan,
  projectFormalAssetRestoreSource,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan.js";
import {
  FORMAL_DATA_COMMIT,
  FORMAL_DATA_TAG,
  FORMAL_DATA_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-runtime/freeze.js";
import type { FormalCaseBinding } from "../../eval/tool-prompt-bench/formal-runtime/build-case-bindings.js";
import type { FormalWorldContract } from "../../eval/tool-prompt-bench/worlds/formal-schema.js";

const benchRoot = resolve(process.cwd(), "eval", "tool-prompt-bench");

function loadContract(): FormalWorldContract {
  return JSON.parse(readFileSync(resolve(
    benchRoot,
    "formal-dataset",
    "registry",
    "contracts",
    "formal-v1.json",
  ), "utf8")) as FormalWorldContract;
}

function loadBindings(): FormalCaseBinding[] {
  return readFileSync(resolve(benchRoot, "formal-runtime", "frozen", "case-bindings.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as FormalCaseBinding);
}

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

const revision = {
  tag: FORMAL_DATA_TAG,
  tagObject: FORMAL_DATA_TAG_OBJECT,
  commit: FORMAL_DATA_COMMIT,
  contractCanonicalSha256: "4fc62c1829301fe9f2410f6be40698d7b3d09ec90dde3bfe294452f7ef152d41",
  snapshotCanonicalSha256: "3a82d0ad8241ff3e2173555efbdb65dfb367a0a38c9998203c5b4754611a4783",
} as const;

describe("formal asset restore plan", () => {
  it("projects the frozen World into an asset-only, Gold-blind source", () => {
    const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
    const source = projectFormalAssetRestoreSource({
      selection,
      revision,
      contract: loadContract(),
    });

    expect(source.split).toBe("dev");
    expect(source.snapshot.snapshotId).toBe("snapshot-task1-dev-v1");
    expect(source.assets.knowledge.some((asset) => asset.type === "wiki")).toBe(true);
    expect(source.assets.knowledge.some((asset) => asset.type === "code_graph")).toBe(true);
    expect(source.teams.every((team) => team.split === "dev")).toBe(true);

    const keys = allKeys(source);
    for (const forbidden of [
      "publicCases", "privateAnnotations", "pairs", "runRecords", "gold",
      "allowedSequences", "query", "contextMessages", "sourceEvidence",
      "sourceEvidenceIds", "evidenceRefs", "pairId", "caseId",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });

  it("compiles one binding into deterministic real-API actions and exact visible assets", () => {
    const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
    const source = projectFormalAssetRestoreSource({ selection, revision, contract: loadContract() });
    const binding = loadBindings().find((row) =>
      row.split === "dev" && row.identity.teamId === "T01" && row.identity.agentId === "agent-task1-t01-general"
    );
    expect(binding).toBeDefined();

    const first = compileFormalAssetRestorePlan({ selection, source, bindings: [binding!] });
    const second = compileFormalAssetRestorePlan({ selection, source, bindings: [binding!] });
    expect(first).toEqual(second);
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.executable).toBe(false);
    expect(first.formalMetricEligible).toBe(false);
    expect(first.selectedVisibleAssetSets).toHaveLength(1);

    const visibleIds = new Set(first.selectedVisibleAssetSets[0]!.assetIds);
    expect(first.assets.every((asset) => visibleIds.has(asset.formalAssetId))).toBe(true);
    expect(first.assets.some((asset) => asset.family === "knowledge" && asset.subtype === "wiki")).toBe(true);
    expect(first.assets.some((asset) => asset.family === "knowledge" && asset.subtype === "code_graph")).toBe(true);

    const endpoints = new Set(first.actions.map((action) => action.endpoint));
    for (const endpoint of [
      "/v3/meta/team/create",
      "/v3/meta/agent/create",
      "/v3/meta/task/create",
      "/v3/formal-bench/import-memory",
      "/v3/core/write",
      "/v3/skill/create",
      "/v3/wiki/create",
      "/v3/code-graph/create",
      "/v3/knowledge/create",
      "/v3/meta/agent-fixed-asset/set",
    ]) {
      expect(endpoints.has(endpoint), endpoint).toBe(true);
    }
    expect(endpoints.has("/v3/atomic/update")).toBe(false);
    expect(endpoints.has("/v3/scenario/write")).toBe(false);
    expect(endpoints.has("/v3/meta/team-member/add")).toBe(false);
    expect(endpoints.has("/v3/meta/team-member/get")).toBe(true);

    const codeGraphCreates = first.actions.filter((action) => action.endpoint === "/v3/code-graph/create");
    expect(codeGraphCreates.length).toBeGreaterThan(0);
    expect(codeGraphCreates.every((action) => action.body.formal_ready === true)).toBe(true);
    expect(codeGraphCreates.map((action) => action.body.formal_asset_id)).toEqual(
      expect.arrayContaining(
        first.assets
          .filter((asset) => asset.family === "knowledge" && asset.subtype === "code_graph")
          .map((asset) => asset.formalAssetId),
      ),
    );

    expect(first.requirements.some((requirement) => requirement.kind === "space_service_mapping")).toBe(true);
    expect(first.requirements.some((requirement) => requirement.kind === "memory_l1_import")).toBe(true);
    expect(first.requirements.some((requirement) => requirement.kind === "memory_l2_import")).toBe(true);
    for (const requirement of first.requirements.filter((item) =>
      item.kind === "memory_l1_import" || item.kind === "memory_l2_import"
    )) {
      expect(requirement.runtimeIsolation).toEqual({
        team_id: expect.objectContaining({ $runtimeRef: "runtime_team_id" }),
        user_id: expect.objectContaining({ $runtimeRef: "resolved_auth_user_id" }),
        agent_id: expect.objectContaining({ $runtimeRef: "runtime_agent_id" }),
      });
      expect(requirement.dependsOnActions).toEqual(expect.arrayContaining([
        expect.stringMatching(/^team-create-/u),
        expect.stringMatching(/^agent-create-/u),
      ]));
      expect(requirement.importPayload).toEqual(expect.objectContaining({
        content: expect.any(String),
      }));
    }
    for (const action of first.actions.filter((item) =>
      item.endpoint === "/v3/formal-bench/import-memory" || item.endpoint === "/v3/core/write"
    )) {
      expect(action.body).toEqual(expect.objectContaining({
        team_id: expect.objectContaining({ $runtimeRef: "runtime_team_id" }),
        user_id: expect.objectContaining({ $runtimeRef: "resolved_auth_user_id" }),
        agent_id: expect.objectContaining({ $runtimeRef: "runtime_agent_id" }),
      }));
    }
    for (const action of first.actions.filter((item) =>
      item.endpoint === "/v3/formal-bench/import-memory"
    )) {
      expect(action.body).toEqual(expect.objectContaining({
        kind: "l0",
        formal_asset_id: expect.any(String),
        expected_asset_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        payload: expect.objectContaining({
          sessionId: expect.any(String),
          messages: expect.arrayContaining([expect.objectContaining({
            id: expect.any(String),
            recordedAt: expect.any(String),
          })]),
        }),
      }));
    }
    expect(first.requirements.some((requirement) => requirement.kind === "skill_package_bytes")).toBe(true);
    expect(first.requirements.some((requirement) => requirement.kind === "knowledge_snapshot_import")).toBe(false);
    for (const action of first.actions.filter((item) => item.endpoint === "/v3/knowledge/create")) {
      expect(action.blockedByRequirements).toBeUndefined();
    }
    for (const action of first.actions.filter((item) => item.actionId.startsWith("knowledge-asset-register-"))) {
      expect(action.body).not.toHaveProperty("content_ref");
    }
    expect(first.identityMappings.users).toEqual([{
      datasetUserId: "user-task1-t01-eval",
      resolvedAuthUserId: { state: "unresolved", requiredGate: "auth-user-mapping" },
    }]);

    const actionIds = new Set(first.actions.map((action) => action.actionId));
    const requirementIds = new Set(first.requirements.map((requirement) => requirement.requirementId));
    for (const action of first.actions) {
      expect(action.dependsOn.every((id) => actionIds.has(id)), action.actionId).toBe(true);
      expect((action.blockedByRequirements ?? []).every((id) => requirementIds.has(id)), action.actionId).toBe(true);
    }
    for (const requirement of first.requirements) {
      expect((requirement.dependsOnActions ?? []).every((id) => actionIds.has(id)), requirement.requirementId).toBe(true);
    }

    const keys = allKeys(first);
    for (const forbidden of [
      "publicCases", "privateAnnotations", "pairs", "gold", "allowedSequences",
      "query", "contextMessages", "sourceEvidence", "sourceEvidenceIds", "caseId",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });

  it("preserves self/imported chat memory and binds Skill/Knowledge without mixing service boundaries", () => {
    const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
    const source = projectFormalAssetRestoreSource({ selection, revision, contract: loadContract() });
    const binding = loadBindings().find((row) =>
      row.split === "dev" && row.identity.agentId === "agent-task1-t03-general"
    )!;
    const plan = compileFormalAssetRestorePlan({ selection, source, bindings: [binding] });

    const fixed = plan.actions.find((action) =>
      action.endpoint === "/v3/meta/agent-fixed-asset/set"
      && action.executionIdentity.datasetAgentId === "agent-task1-t03-general"
    )!;
    const bindings = fixed.body.bindings as Array<{
      asset_id: { logicalId?: string };
      asset_type: string;
    }>;
    expect(bindings.filter((item) => item.asset_type === "chat_memory").map((item) => item.asset_id.logicalId))
      .toEqual([
        "agent-task1-t03-general",
        "agent-task1-t03-assets-a",
        "agent-task1-t03-assets-b",
      ]);
    expect(bindings.some((item) => item.asset_type === "skill")).toBe(true);
    expect(bindings.some((item) => item.asset_type === "code_graph" || item.asset_type === "llm_wiki")).toBe(true);

    for (const action of plan.actions.filter((item) => item.endpoint.startsWith("/v3/wiki/")
      || item.endpoint.startsWith("/v3/code-graph/"))) {
      expect(action.serviceBoundary).toBe("memory_knowledge");
    }
    expect(plan.actions.find((action) => action.endpoint === "/v3/knowledge/create")?.serviceBoundary)
      .toBe("memory_core");
    expect(plan.requirements.some((item) => item.kind === "knowledge_snapshot_import")).toBe(false);
  });

  it("deduplicates the whole public Dev split into the exact snapshot identities", () => {
    const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
    const source = projectFormalAssetRestoreSource({ selection, revision, contract: loadContract() });
    const bindings = loadBindings().filter((binding) => binding.split === "dev");
    const plan = compileFormalAssetRestorePlan({ selection, source, bindings });

    expect(bindings).toHaveLength(240);
    expect(plan.selectedVisibleAssetSets).toHaveLength(new Set(
      bindings.map((binding) => binding.visibleAssetSetSha256),
    ).size);
    expect(plan.identityMappings.teams.every((mapping) =>
      source.teams.some((team) => team.teamId === mapping.datasetTeamId)
    )).toBe(true);
    expect(new Set(plan.assets.map((asset) => asset.formalAssetId)).size).toBe(plan.assets.length);
  });

  it("requires held-out authorization before a hidden selection can exist", () => {
    expect(() => authorizeFormalAssetRestoreSelection({ split: "hidden_test" })).toThrow(/authorized/u);
    const selection = authorizeFormalAssetRestoreSelection({ split: "hidden_test", allowHiddenTest: true });
    expect(selection.split).toBe("hidden_test");
  });

  it("fails closed on a binding whose visible set hash is not frozen", () => {
    const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
    const source = projectFormalAssetRestoreSource({ selection, revision, contract: loadContract() });
    const binding = loadBindings().find((row) => row.split === "dev")!;
    expect(() => compileFormalAssetRestorePlan({
      selection,
      source,
      bindings: [{ ...binding, visibleAssetSetSha256: "0".repeat(64) }],
    })).toThrow(/visible asset set/u);
  });

  it("fails closed when the frozen no-write runtime policy hash drifts", () => {
    const selection = authorizeFormalAssetRestoreSelection({ split: "dev" });
    const source = projectFormalAssetRestoreSource({ selection, revision, contract: loadContract() });
    const binding = loadBindings().find((row) => row.split === "dev")!;
    const drifted = structuredClone(source);
    drifted.snapshot.runtimePolicySha256 = "0".repeat(64);
    expect(() => compileFormalAssetRestorePlan({ selection, source: drifted, bindings: [binding] }))
      .toThrow(/runtime write policy hash/u);
  });
});
