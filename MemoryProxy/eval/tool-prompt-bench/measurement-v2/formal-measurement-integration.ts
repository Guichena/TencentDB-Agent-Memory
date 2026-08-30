import type { FormalExecutionReceipt } from "../formal-execution-runner.js";
import type { PrivateMeasurementSplitData } from "../formal-runtime/private-loader.js";
import { aggregateCaseChainFacts } from "./aggregate.js";
import {
  projectObservedBridgeTrace,
  type ObservedBridgeTraceEvidence,
} from "./observed-bridge-trace-projector.js";
import type {
  CollectedObservedCampaign,
  CollectedObservedRun,
} from "./observed-event-collector.js";
import type {
  CollectedProviderCampaign,
  CollectedProviderRun,
} from "./provider-evidence-collector.js";
import { scoreCaseChain } from "./scorer.js";
import type {
  CaseChainAggregateV2,
  CaseChainScoreV2,
  PrivateChainGoldV2,
  RatioV2,
  RuntimeToolContractV2,
} from "./types.js";

export const FORMAL_MEASUREMENT_INTEGRATION_SCHEMA =
  "task1.formal-measurement-integration.v1" as const;

export interface IntegrateFormalMeasurementInput {
  readonly campaignId: string;
  readonly executions: readonly FormalExecutionReceipt[];
  readonly toolCampaign: CollectedObservedCampaign;
  readonly providerCampaign: CollectedProviderCampaign;
  readonly privateMeasurement: PrivateMeasurementSplitData;
}

export interface IntegratedFormalRun {
  readonly runId: string;
  readonly caseId: string;
  readonly variantId: string;
  readonly repeat: number;
  readonly sessionId: string;
  readonly formalMetricEligible: boolean;
  readonly exclusionReasons: readonly string[];
  readonly score: CaseChainScoreV2 | null;
  readonly rawToolEvidence: ObservedBridgeTraceEvidence | null;
  readonly injectionTokens: number | null;
  readonly providerUsage: CollectedProviderRun["providerUsage"];
}

export interface FormalPairAggregate {
  readonly contractCount: number;
  readonly pairInstanceCount: number;
  readonly eligiblePairCount: number;
  readonly excludedPairCount: number;
  readonly pairedDecisionSuccessRate: RatioV2;
}

export interface FormalTokenAggregate {
  readonly runCount: number;
  readonly staticInjectionTokens: {
    readonly sum: number;
    readonly min: number | null;
    readonly max: number | null;
    readonly mean: number | null;
  };
  readonly providerUsage: {
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
    readonly reasoningOutputTokens: number;
    readonly totalTokens: number;
  };
}

export interface FormalMeasurementIntegrationResult {
  readonly schemaVersion: typeof FORMAL_MEASUREMENT_INTEGRATION_SCHEMA;
  readonly campaignId: string;
  readonly split: "dev" | "hidden_test";
  readonly variantId: string;
  readonly formalCampaignEligible: boolean;
  readonly eligibleRunCount: number;
  readonly excludedRunCount: number;
  readonly runs: readonly IntegratedFormalRun[];
  readonly aggregate: CaseChainAggregateV2;
  readonly paired: FormalPairAggregate;
  readonly tokens: FormalTokenAggregate;
  readonly privateMeasurementHashes: PrivateMeasurementSplitData["hashes"];
}

/**
 * Private, post-seal integration. Eligibility is decided before M0 sees Gold;
 * excluded traces never enter metric numerators or denominators.
 */
export function integrateFormalMeasurement(
  input: IntegrateFormalMeasurementInput,
): FormalMeasurementIntegrationResult {
  const campaignId = nonBlank("campaignId", input.campaignId);
  if (input.toolCampaign.campaignId !== campaignId) {
    throw new Error("tool campaign id does not match integration campaign");
  }
  if (input.providerCampaign.campaignId !== campaignId) {
    throw new Error("provider campaign id does not match integration campaign");
  }
  if (input.executions.length === 0) throw new Error("formal integration requires executions");
  const variantIds = new Set(input.executions.map((run) => run.variantId));
  if (variantIds.size !== 1) throw new Error("one formal integration campaign must contain one variant");
  const variantId = [...variantIds][0];
  const executions = uniqueBy(input.executions, (run) => run.runId, "execution runId");
  const toolRuns = uniqueBy(input.toolCampaign.runs, (run) => run.runId, "tool runId");
  const providerRuns = uniqueBy(input.providerCampaign.runs, (run) => run.runId, "provider runId");
  const goldByCaseId = uniqueBy(
    input.privateMeasurement.gold,
    (gold) => gold.caseId,
    "private Gold caseId",
  );

  const integratedRuns = [...executions.values()].map((execution): IntegratedFormalRun => {
    const toolRun = toolRuns.get(execution.runId);
    const providerRun = providerRuns.get(execution.runId);
    const gold = goldByCaseId.get(execution.caseId);
    const reasons = eligibilityReasons(
      execution,
      toolRun,
      providerRun,
      gold,
      input.toolCampaign,
      input.providerCampaign,
    );
    if (reasons.length > 0 || !toolRun || !providerRun || !gold) {
      return {
        runId: execution.runId,
        caseId: execution.caseId,
        variantId: execution.variantId,
        repeat: execution.repeat,
        sessionId: execution.sessionId,
        formalMetricEligible: false,
        exclusionReasons: reasons,
        score: null,
        rawToolEvidence: null,
        injectionTokens: providerRun?.injection?.tokens ?? null,
        providerUsage: providerRun?.providerUsage ?? null,
      };
    }

    const projected = projectObservedBridgeTrace({
      runId: execution.runId,
      caseId: execution.caseId,
      variantId: execution.variantId,
      activeSessionId: execution.sessionId,
      turnCompletion: { outcome: "completed" },
      entries: toolRun.entries,
      completions: toolRun.completions,
    });
    const score = scoreCaseChain({
      observation: projected.observation,
      gold: gold as unknown as PrivateChainGoldV2,
      runtimeContracts: input.privateMeasurement.runtimeContracts as unknown as readonly RuntimeToolContractV2[],
    });
    return {
      runId: execution.runId,
      caseId: execution.caseId,
      variantId: execution.variantId,
      repeat: execution.repeat,
      sessionId: execution.sessionId,
      formalMetricEligible: true,
      exclusionReasons: [],
      score,
      rawToolEvidence: projected.rawEvidence,
      injectionTokens: providerRun.injection!.tokens,
      providerUsage: providerRun.providerUsage,
    };
  });

  const eligibleScores = integratedRuns.flatMap((run) => run.score ? [run.score] : []);
  const aggregate = aggregateCaseChainFacts(eligibleScores);
  const paired = aggregatePairs(integratedRuns, input.privateMeasurement);
  const tokens = aggregateTokens(integratedRuns);
  const excludedRunCount = integratedRuns.filter((run) => !run.formalMetricEligible).length;
  return deepFreeze({
    schemaVersion: FORMAL_MEASUREMENT_INTEGRATION_SCHEMA,
    campaignId,
    split: input.privateMeasurement.split,
    variantId,
    formalCampaignEligible: excludedRunCount === 0
      && input.toolCampaign.formalCampaignEligible
      && input.providerCampaign.formalCampaignEligible,
    eligibleRunCount: integratedRuns.length - excludedRunCount,
    excludedRunCount,
    runs: integratedRuns,
    aggregate,
    paired,
    tokens,
    privateMeasurementHashes: input.privateMeasurement.hashes,
  });
}

function eligibilityReasons(
  execution: FormalExecutionReceipt,
  toolRun: CollectedObservedRun | undefined,
  providerRun: CollectedProviderRun | undefined,
  gold: PrivateMeasurementSplitData["gold"][number] | undefined,
  toolCampaign: CollectedObservedCampaign,
  providerCampaign: CollectedProviderCampaign,
): string[] {
  const reasons: string[] = [];
  if (!toolCampaign.formalCampaignEligible) reasons.push("tool_campaign_ineligible");
  if (!providerCampaign.formalCampaignEligible) reasons.push("provider_campaign_ineligible");
  if (execution.schemaVersion !== "task1.formal-execution-receipt.v1") {
    reasons.push("execution_receipt_schema_mismatch");
  }
  if (execution.process.infrastructureError !== null
    || execution.process.exitCode !== 0
    || execution.process.timedOut) {
    reasons.push("execution_process_ineligible");
  }
  if (execution.proxyInstanceId !== toolCampaign.proxyProcessInstanceId
    || execution.proxyInstanceId !== providerCampaign.proxyProcessInstanceId) {
    reasons.push("proxy_instance_mismatch");
  }
  if (execution.knowledgeInstanceId !== toolCampaign.knowledgeProcessInstanceId) {
    reasons.push("knowledge_instance_mismatch");
  }
  if (!toolRun) reasons.push("tool_run_missing");
  else {
    if (!sameRunIdentity(execution, toolRun)) reasons.push("tool_run_identity_mismatch");
    if (!toolRun.formalTraceEligible) reasons.push("tool_trace_ineligible");
  }
  if (!providerRun) reasons.push("provider_run_missing");
  else {
    if (!sameRunIdentity(execution, providerRun)) reasons.push("provider_run_identity_mismatch");
    if (!providerRun.formalProviderEvidenceEligible) reasons.push("provider_evidence_ineligible");
    if (!providerRun.injection) reasons.push("provider_injection_missing");
    if (!providerRun.providerUsage) reasons.push("provider_usage_missing");
  }
  if (!gold) reasons.push("private_gold_missing");
  return [...new Set(reasons)];
}

function sameRunIdentity(
  execution: FormalExecutionReceipt,
  observed: Readonly<{
    runId: string;
    caseId: string;
    variantId: string;
    sessionId: string;
  }>,
): boolean {
  return observed.runId === execution.runId
    && observed.caseId === execution.caseId
    && observed.variantId === execution.variantId
    && observed.sessionId === execution.sessionId;
}

function aggregatePairs(
  runs: readonly IntegratedFormalRun[],
  privateMeasurement: PrivateMeasurementSplitData,
): FormalPairAggregate {
  const byCaseRepeat = new Map(runs.map((run) => [`${run.caseId}\u0000${run.repeat}`, run]));
  const observedCaseIds = new Set(runs.map((run) => run.caseId));
  const applicable = privateMeasurement.pairs.filter((pair) => (
    observedCaseIds.has(pair.positiveCaseId) || observedCaseIds.has(pair.negativeCaseId)
  ));
  let pairInstanceCount = 0;
  let eligiblePairCount = 0;
  let pairedDecisionSuccess = 0;
  for (const pair of applicable) {
    const repeats = new Set(runs.filter((run) => (
      run.caseId === pair.positiveCaseId || run.caseId === pair.negativeCaseId
    )).map((run) => run.repeat));
    for (const repeat of repeats) {
      pairInstanceCount += 1;
      const positive = byCaseRepeat.get(`${pair.positiveCaseId}\u0000${repeat}`);
      const negative = byCaseRepeat.get(`${pair.negativeCaseId}\u0000${repeat}`);
      if (!positive?.formalMetricEligible || !negative?.formalMetricEligible) continue;
      eligiblePairCount += 1;
      if (positive.score?.shortestExact === true
        && negative.score?.falseCallAttempt === false) {
        pairedDecisionSuccess += 1;
      }
    }
  }
  return {
    contractCount: applicable.length,
    pairInstanceCount,
    eligiblePairCount,
    excludedPairCount: pairInstanceCount - eligiblePairCount,
    pairedDecisionSuccessRate: ratio(pairedDecisionSuccess, eligiblePairCount),
  };
}

function aggregateTokens(runs: readonly IntegratedFormalRun[]): FormalTokenAggregate {
  const eligible = runs.filter((run) => run.formalMetricEligible);
  const injectionTokens = eligible.flatMap((run) => (
    run.injectionTokens === null ? [] : [run.injectionTokens]
  ));
  const usages = eligible.flatMap((run) => run.providerUsage ? [run.providerUsage] : []);
  const sum = injectionTokens.reduce((total, value) => total + value, 0);
  return {
    runCount: eligible.length,
    staticInjectionTokens: {
      sum,
      min: injectionTokens.length === 0 ? null : Math.min(...injectionTokens),
      max: injectionTokens.length === 0 ? null : Math.max(...injectionTokens),
      mean: injectionTokens.length === 0 ? null : sum / injectionTokens.length,
    },
    providerUsage: {
      inputTokens: sumField(usages, "inputTokens"),
      cachedInputTokens: sumField(usages, "cachedInputTokens"),
      outputTokens: sumField(usages, "outputTokens"),
      reasoningOutputTokens: sumField(usages, "reasoningOutputTokens"),
      totalTokens: sumField(usages, "totalTokens"),
    },
  };
}

function sumField(
  usages: readonly NonNullable<CollectedProviderRun["providerUsage"]>[],
  field: "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningOutputTokens" | "totalTokens",
): number {
  return usages.reduce((total, usage) => total + usage[field], 0);
}

function ratio(numerator: number, denominator: number): RatioV2 {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = nonBlank(label, key(value));
    if (result.has(id)) throw new Error(`duplicate ${label}: ${id}`);
    result.set(id, value);
  }
  return result;
}

function nonBlank(label: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-blank`);
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
