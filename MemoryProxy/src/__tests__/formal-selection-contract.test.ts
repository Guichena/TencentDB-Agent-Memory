import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";
import { computePairScoringPolicySha256V2 } from "../../eval/tool-prompt-bench/measurement-v2/pair-scorer.js";

const benchRoot = resolve(import.meta.dirname, "../../eval/tool-prompt-bench");
const contractPath = resolve(benchRoot, "measurement-v2/SELECTION-CONTRACT.json");
const privateRoot = resolve(benchRoot, "formal-dataset/measurement-v2/private");

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, any>);
}

describe("Task 1 frozen Selection Contract", () => {
  it("uses one fixed behavior reference, one M1 PairExact policy, and no weighted score", async () => {
    const source = await readFile(contractPath, "utf8");
    const contract = JSON.parse(source) as Record<string, any>;

    expect(source).not.toMatch(/\b(?:TBD|TODO|FIXME)\b/u);
    expect(contract).toMatchObject({
      schemaVersion: "task1.selection-contract.v1",
      contractId: "task1.static-prompt-selection.v1",
      evaluationSchemaVersion: 2,
      references: {
        historical: { variantId: "V0", role: "always_report" },
        behavior: { variantId: "V0-C", role: "fixed_noninferiority_reference" },
        directParent: {
          role: "single_factor_attribution_only",
          mustNotReplaceBehaviorReference: true,
        },
      },
      pairPolicy: {
        repeatAggregationPolicyId: "all-repeats-pass-v1",
        strictPairExactEnabled: false,
        positiveRule: "M0.completeChainSuccess",
        negativeRule: "no executor-bound TDAI attempt and no malformed unbound TDAI dispatch intent",
        formalObservableNegativeRule: "no executor-bound TDAI attempt",
        malformedUnboundRole:
          "synthetic_diagnostic_only_not_observable_from_formal_bridge_trace",
        repeatRowsAreIndependentPairs: false,
      },
      noWeightedCompositeScore: true,
      noTaskAnswerQualityJudge: true,
      modelRunsAtFreeze: 0,
    });
    expect(contract.pairPolicy.scoringPolicySha256).toBe(
      computePairScoringPolicySha256V2(false),
    );
    expect(contract.metricBindings.pairExact).toBe("PairScoreSummaryV2.pairExact");
    expect(contract.metricBindings.effectiveCallRate).toBe(
      "CaseChainAggregateV2.completeChainSuccessRate",
    );
    expect(contract.metricBindings.conditionalTerminalAccuracy).toBe(
      "CaseChainAggregateV2.conditionalTerminalAccuracy",
    );
    expect(contract.metricBindings.shortestExactRate).toBe(
      "CaseChainAggregateV2.shortestExactRate",
    );
    expect(contract.metricRoles).toMatchObject({
      conditionalTerminalAccuracy: {
        reportingRole: "required_tool_selection_companion",
        selectionRole: "descriptive_only",
        mustReportNumeratorAndDenominator: true,
        zeroDenominatorValue: null,
      },
      shortestExactRate: {
        reportingRole: "chain_efficiency_diagnostic",
        selectionRole: "descriptive_only",
      },
      runtimeAcceptedChainRate: {
        reportingRole: "runtime_http_diagnostic",
        selectionRole: "descriptive_only",
        denominator: "behavior-valid complete chains only",
      },
    });
    expect(contract.behaviorBoundary).toMatchObject({
      completeChainSuccess: expect.stringContaining("independent of HTTP status"),
      runtimeAcceptedChain: expect.stringContaining("never changes completeChainSuccess"),
      runtimeInfrastructure: expect.stringContaining("within the evaluation horizon excludes the run"),
      wrongArgumentsRemainBehaviorFailure: true,
    });
    expect(contract).not.toHaveProperty("uncertaintyReporting");
    expect(contract.metricBindings.otherDescriptiveMetrics).not.toContain(
      "conditionalTerminalAccuracy_with_numerator_and_denominator",
    );
    expect(contract.reusePolicy).toMatchObject({
      ordinaryPromptMethodRebuildsPublicPreparation: false,
    });
    expect(contract.reusePolicy.ordinaryPromptMethodMustCreateFresh).toEqual(
      expect.arrayContaining([
        "campaign",
        "run, session, and local-state namespaces",
        "usage, trace, score, and result artifacts",
      ]),
    );
    expect(canonicalSha256(contract)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("binds integer margins and family floors to the exact frozen Dev membership", async () => {
    const contract = JSON.parse(await readFile(contractPath, "utf8")) as Record<string, any>;
    const gold = await readJsonl(resolve(privateRoot, "gold/dev.private.jsonl"));
    const pairs = await readJsonl(resolve(privateRoot, "pairs/dev.private.jsonl"));
    const positives = gold.filter((item) => item.expectation === "tool");
    const noTool = gold.filter((item) => item.expectation === "no-tool");
    const familyCounts: Record<string, number> = {};
    for (const item of positives) {
      const steps = item.allowedSequences[0]?.steps ?? [];
      const family = String(steps.at(-1)?.family ?? "unknown");
      familyCounts[family] = (familyCounts[family] ?? 0) + 1;
    }

    expect(contract.formalData.dev).toEqual({
      caseCount: gold.length,
      toolPositiveCount: positives.length,
      noToolCount: noTool.length,
      pairCount: pairs.length,
      naturalCodingNegativeCount: noTool.length - pairs.length,
      familyPositiveCounts: familyCounts,
      independenceKey: "split:teamId",
      independenceClusterCount: new Set(pairs.map((pair) => pair.independenceKey)).size,
    });
    expect(contract.hardBehaviorGates.completeChainSuccessRate).toMatchObject({
      reference: "V0-C",
      maxCorrectCaseRegressionPerRepeat: 1,
    });
    expect(contract.hardBehaviorGates.falseCallAttemptRate).toMatchObject({
      reference: "V0-C",
      maxFalseCallIncreasePerRepeat: 1,
    });
    expect(contract.hardBehaviorGates.terminalSelectionRate.maxCorrectCaseRegressionPerRepeat).toBe(1);
    expect(contract.hardBehaviorGates.pairExact.maxPassingPairRegression).toBe(1);
    expect(contract.hardBehaviorGates.positiveOvercallRate.maxOvercallIncreasePerRepeat).toBe(1);
    expect(Object.keys(contract.hardBehaviorGates).sort()).toEqual([
      "completeChainSuccessRate",
      "falseCallAttemptRate",
      "pairExact",
      "positiveOvercallRate",
      "terminalSelectionRate",
    ]);
    expect(contract.hardBehaviorGates).not.toHaveProperty("conditionalTerminalAccuracy");
    expect(contract.hardBehaviorGates).not.toHaveProperty("shortestExactRate");
    expect(contract.familyFloors).toMatchObject({
      reference: "V0-C",
      maxCorrectCaseRegressionPerFamilyPerRepeat: 1,
      families: {
        memory: { devDenominatorPerRepeat: familyCounts.memory },
        skill: { devDenominatorPerRepeat: familyCounts.skill },
        knowledge: { devDenominatorPerRepeat: familyCounts.knowledge },
      },
    });
    expect(contract.naturalCodingNegativeGate).toMatchObject({
      devDenominatorPerRepeat: noTool.length - pairs.length,
      maxFalseCallIncreasePerRepeat: 0,
    });
  });

  it("keeps token minimization behind behavior eligibility and Hidden sealed", async () => {
    const contract = JSON.parse(await readFile(contractPath, "utf8")) as Record<string, any>;

    expect(contract.tokenSelection).toMatchObject({
      tokenizer: "o200k_base",
      eligibilityFirst: true,
      aspirationalStaticReductionVersusV0C: 0.25,
      aspirationalTargetIsHardGate: false,
      componentTokensMustNotReplaceWholePromptTokens: true,
    });
    expect(contract.repeatPolicy.hidden).toMatchObject({
      variants: ["V0", "V0-C", "DEV_FROZEN_FINAL"],
      openOnce: true,
      reselectionForbidden: true,
    });
    expect(contract.executionCohort).toMatchObject({
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      verbosity: "medium",
      provider: "openai",
      usageSchema: "openai.responses",
      apiVersion: "v1",
      adapterVersion: "memory-proxy-provider-observer-v1",
      providerObserverUsageAuthority: "response.completed.response.usage",
      codexStdoutUsageRole: "diagnostic_only",
      nodeMajor: 22,
      officialAuthenticationReuseOnly: true,
      mustNotCopyOrModifyCodexAuthentication: true,
    });
  });
});
