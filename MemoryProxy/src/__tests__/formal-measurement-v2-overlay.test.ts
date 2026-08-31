import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";
import {
  buildPairInvariantSha256,
  validateOverlayBindingObservation,
  validatePairApprovalCoverage,
  validatePairOverlay,
  type PairApprovalLedger,
  type OverlayBindingPredicate,
  type OverlayJsonValue,
  type OverlayPairCaseProjection,
  type OverlayPairContractV2,
} from "../../eval/tool-prompt-bench/formal-dataset/scripts/measurement-v2-overlay-schema.js";

const root = resolve(
  import.meta.dirname,
  "../../eval/tool-prompt-bench/formal-dataset",
);

const conversationTerminalDowngradeCases = [
  "T03-MEM-003-P",
  "T04-MEM-003-P",
  "T05-DS05-MEM-PAIR-02-POS",
  "T06-MEM-BP-02-POS",
  "T09-MEM-003-P",
  "T10-MEM-001-P",
  "T10-MEM-004-P",
  "T13-MEM-003-P",
  "T14-MEM-003-P",
];

const scenarioBindingCases: Record<string, string> = {
  "T07-PAIR-M04-P": "scenes/qdrant-ingestion/cutover-chronology",
  "T08-PAIR-M03-P": "scenes/playwright/locator-migration-chronology",
  "T11-MEMORY-003-P": "mobile/nimbus/restoration-timeline",
  "T11-MEMORY-004-P": "mobile/pulse/cold-start-jank",
  "T12-MEMORY-003-P": "database/harbor/resumable-backfill",
  "T12-MEMORY-005-P": "database/archive/index-lifecycle",
};

async function jsonl(path: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(resolve(root, path), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("Task 1 Measurement-v2 private overlay", () => {
  it("binds all Gold and Pair records to the frozen data core", async () => {
    const manifest = JSON.parse(await readFile(
      resolve(root, "measurement-v2/private/manifest.private.json"),
      "utf8",
    )) as Record<string, any>;
    const gold = [
      ...await jsonl("measurement-v2/private/gold/dev.private.jsonl"),
      ...await jsonl("measurement-v2/private/gold/hidden.private.jsonl"),
    ].sort((left, right) => String(left.caseId).localeCompare(String(right.caseId)));
    const pairs = [
      ...await jsonl("measurement-v2/private/pairs/dev.private.jsonl"),
      ...await jsonl("measurement-v2/private/pairs/hidden.private.jsonl"),
    ].sort((left, right) => String(left.pairId).localeCompare(String(right.pairId)));

    expect(manifest.visibility).toBe("private_never_provider_visible");
    expect(manifest.dataFreeze.tag).toBe("task1-data-formal-v2.1");
    expect(manifest.dataFreeze.commit).toBe("a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6");
    expect(manifest.counts.goldV2).toBe(800);
    expect(manifest.counts.pairV2).toBe(300);
    expect(manifest.canonicalContract).toMatchObject({
      canonicalContractId: "task1.measurement-v2.canonical-json.v2.1",
      sourceBlob: "a9fe41894fab2d5cb997a703ff11af5d99181655",
      sharedTestBlob: "6d10c5476956a310b6e800c6f2549dac477d4a8e",
    });
    expect(manifest.dataFreeze.canonicalContract.canonicalContractId).toBe(
      "task1.formal-snapshot.canonical-json.v1",
    );
    expect(manifest.dataContractReady).toBe(true);
    expect(manifest.realChainR01R04Status).toBe("pending");
    expect(manifest.measurementIntegrationReady).toBe(false);
    expect(manifest.formalCampaignReady).toBe(false);
    expect(manifest.formalMetricEligible).toBe(false);
    expect(manifest.frozenM0GoldValidation).toMatchObject({
      scorerTag: "task1-candidate-base-v1",
      validatedGoldCount: 800,
      negativeBindingTestCount: 8,
      errors: [],
    });
    expect(manifest.pairMinimalityApprovalContract).toMatchObject({
      approvedTeamCount: 20,
      approvedPairCount: 300,
      evidenceFileCount: 20,
      errors: [],
    });
    const { strictCanonicalSha256, ...memoryAudit } = manifest.memoryFollowupContract;
    expect(canonicalSha256(memoryAudit)).toBe(strictCanonicalSha256);
    expect(canonicalSha256(gold)).toBe("0f57a9b87d6c6a044fcb627e75c701fb63e90d1fce47a22be011b200b54635fe");
    expect(canonicalSha256(pairs)).toBe("b99596e3f60da8dc2b9080c7b218ca48829347ed13f73a25a7a853147a4ac85d");
    expect(gold.filter((item) => item.expectation === "no-tool")
      .every((item) => Array.isArray(item.allowedSequences) && item.allowedSequences.length === 0)).toBe(true);
    const clusters = new Map<string, number>();
    for (const pair of pairs) {
      const key = String(pair.independenceKey);
      clusters.set(key, (clusters.get(key) ?? 0) + 1);
    }
    expect(clusters.size).toBe(20);
    expect([...clusters.keys()].filter((key) => key.startsWith("dev:")).length).toBe(8);
    expect([...clusters.keys()].filter((key) => key.startsWith("hidden:")).length).toBe(12);
    expect([...clusters.values()].every((count) => count === 15)).toBe(true);
  });

  it("downgrades all 9 unsupported conversation/query terminals to search-only", async () => {
    const gold = [
      ...await jsonl("measurement-v2/private/gold/dev.private.jsonl"),
      ...await jsonl("measurement-v2/private/gold/hidden.private.jsonl"),
    ];
    const byId = new Map(gold.map((item) => [String(item.caseId), item]));
    for (const caseId of conversationTerminalDowngradeCases) {
      const item = byId.get(caseId) as any;
      expect(item.attemptBudget, caseId).toBe(1);
      expect(item.allowedSequences, caseId).toHaveLength(1);
      expect(item.allowedSequences[0].steps, caseId).toHaveLength(1);
      expect(item.allowedSequences[0].steps[0], caseId).toMatchObject({
        tool: "tdai_conversation_search",
        terminal: true,
        bindings: [],
      });
      expect(JSON.stringify(item)).not.toContain("tdai_conversation_query");
      expect(JSON.stringify(item)).not.toContain("session_id");
    }
  });

  it("binds all 6 scenario paths to data.entries.0.path and rejects wrong paths", async () => {
    const gold = [
      ...await jsonl("measurement-v2/private/gold/dev.private.jsonl"),
      ...await jsonl("measurement-v2/private/gold/hidden.private.jsonl"),
    ];
    const byId = new Map(gold.map((item) => [String(item.caseId), item]));
    for (const [caseId, targetPath] of Object.entries(scenarioBindingCases)) {
      const item = byId.get(caseId) as any;
      const terminal = item.allowedSequences[0].steps[1];
      const binding = terminal.bindings[0] as OverlayBindingPredicate;
      expect(terminal, caseId).toMatchObject({
        tool: "tdai_read_scene",
        terminal: true,
      });
      expect(binding, caseId).toEqual({
        argumentPath: "path",
        priorStepId: "step-1",
        responsePath: "data.entries.0.path",
        comparison: "exact",
      });
      expect(terminal.arguments.exact, caseId).toContainEqual({ path: "path", value: targetPath });
      const response = { data: { entries: [{ path: targetPath }], total: 1 } } as OverlayJsonValue;
      expect(validateOverlayBindingObservation(binding, response, targetPath), caseId).toEqual([]);
      expect(validateOverlayBindingObservation(binding, response, "wrong/path"), caseId).not.toEqual([]);
    }
  });

  it("rejects Pair independence keys that are not the shared split/Team cluster", () => {
    const positive: OverlayPairCaseProjection = {
      caseId: "positive",
      split: "dev",
      teamId: "T01",
      comparisonDocument: { stable: 1, context: "positive" },
    };
    const negative: OverlayPairCaseProjection = {
      caseId: "negative",
      split: "dev",
      teamId: "T01",
      comparisonDocument: { stable: 1, context: "negative" },
    };
    const invariant = buildPairInvariantSha256(
      positive.comparisonDocument,
      negative.comparisonDocument,
      ["/context"],
    );
    const pair: OverlayPairContractV2 = {
      schemaVersion: "2",
      pairId: "pair",
      positiveCaseId: "positive",
      negativeCaseId: "negative",
      causalFactorId: "factor",
      allowedChangedPointers: ["/context"],
      invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
      invariantFieldsSha256: invariant.sha256,
      changedPointerCount: 1,
      minimalityReviewStatus: "approved",
      independenceKey: "dev:pair",
      split: "dev",
    };
    expect(validatePairOverlay(pair, positive, negative)).toContain(
      "pair: independenceKey dev:pair != dev:T01",
    );
    expect(validatePairOverlay(
      { ...pair, independenceKey: "dev:T01" },
      positive,
      { ...negative, teamId: "T02" },
    )).toContain("pair: pair cases must belong to the same Team cluster");
  });

  it("fails closed when Pair approval evidence is missing or assigned across Teams", () => {
    const team = {
      teamId: "T01",
      pairIds: ["pair-1"],
      pairIdsCanonicalSha256: canonicalSha256(["pair-1"]),
      reviewStatus: "approved" as const,
      reviewer: "reviewer",
      evidencePath: "staging/teams/T01/gate.json",
      evidenceFileSha256: "a".repeat(64),
      evidenceSourceCommit: "b".repeat(40),
    };
    const ledger: PairApprovalLedger = {
      schemaVersion: "task1.pair-minimality-approval-ledger.v1",
      reviewCriterion: "one contextMessages pointer",
      teams: [team],
    };
    const expected = [
      { pairId: "pair-1", teamId: "T01" },
      { pairId: "pair-2", teamId: "T02" },
    ];
    expect(validatePairApprovalCoverage(ledger, expected)).toEqual(expect.arrayContaining([
      "pair-2: missing approval evidence",
      "T02: missing approval Team",
    ]));
    const crossTeam: PairApprovalLedger = {
      ...ledger,
      teams: [{
        ...team,
        pairIds: ["pair-1", "pair-2"],
        pairIdsCanonicalSha256: canonicalSha256(["pair-1", "pair-2"]),
      }],
    };
    expect(validatePairApprovalCoverage(crossTeam, expected)).toContain(
      "pair-2: approval Team T01 != frozen Team T02",
    );
  });

  it("keeps private overlay fields out of provider-visible rows", async () => {
    const provider = `${await readFile(resolve(root, "provider/dev.jsonl"), "utf8")}\n${
      await readFile(resolve(root, "provider/hidden.sealed.jsonl"), "utf8")
    }`;
    for (const marker of ["evaluationSchemaVersion", "invariantFieldsSha256", "minimalityReviewStatus"]) {
      expect(provider).not.toContain(marker);
    }
  });
});
