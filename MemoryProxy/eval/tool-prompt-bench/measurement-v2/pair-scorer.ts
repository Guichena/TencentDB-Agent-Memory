import type { PairSplitV2, ValidatedPairContractV2 } from "./pair-contract.js";

/**
 * Minimal read-only integration seam for M0. M1 consumes these decisions and
 * must not derive completeChainSuccess or strictChainExact from raw traces.
 */
export interface M0CaseOutcomeForPairV2 {
  readonly caseId: string;
  readonly repeatId: string;
  readonly variantId: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly assetSnapshotSha256: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly localStateId: string;
  readonly integrationEligible: boolean;
  readonly traceComplete: boolean;
  readonly completeChainSuccess: boolean;
  readonly strictChainExact?: boolean;
  readonly executorBoundAttempt: boolean;
  readonly malformedTdaiDispatchIntent: boolean;
  readonly failureLayer?: string;
}

export interface PairOutcomeRepeatsV2 {
  readonly positive: readonly M0CaseOutcomeForPairV2[];
  readonly negative: readonly M0CaseOutcomeForPairV2[];
}

export type NegativeFalseIntentTypeV2 = "executor_bound" | "malformed_unbound";

export const PAIR_REPEAT_AGGREGATION_POLICY_ID = "all-repeats-pass-v1" as const;

export interface PairRepeatScoreV2 {
  readonly repeatId: string;
  readonly positiveRunId: string;
  readonly negativeRunId: string;
  readonly positiveSessionId: string;
  readonly negativeSessionId: string;
  readonly positiveLocalStateId: string;
  readonly negativeLocalStateId: string;
  readonly positivePass: boolean;
  readonly negativePass: boolean;
  readonly pairExact: boolean;
  readonly boundarySwitchCorrect: boolean;
  readonly strictPairExact: boolean | null;
  readonly negativeFalseIntentTypes: readonly NegativeFalseIntentTypeV2[];
  readonly positiveFailureLayer: string | null;
}

export interface PairScoreV2 {
  readonly pairId: string;
  readonly independenceKey: string;
  readonly split: PairSplitV2;
  readonly eligibility: "eligible" | "incomplete";
  readonly incompleteReasons: readonly string[];
  readonly repeatAggregationPolicyId: typeof PAIR_REPEAT_AGGREGATION_POLICY_ID;
  readonly repeatCount: number;
  readonly repeatInputs: PairOutcomeRepeatsV2;
  readonly repeatResults: readonly PairRepeatScoreV2[];
  readonly positivePass: boolean | null;
  readonly negativePass: boolean | null;
  readonly pairExact: boolean | null;
  readonly boundarySwitchCorrect: boolean | null;
  readonly strictPairExact: boolean | null;
  readonly negativeFalseIntentTypes: readonly NegativeFalseIntentTypeV2[];
  readonly positiveFailureLayers: readonly string[];
}

export interface ScorePairV2Options {
  readonly includeStrictPairExact?: boolean;
}

export interface PairMetricRatioV2 {
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
}

export interface PairIndependenceClusterV2 {
  readonly independenceKey: string;
  readonly pairIds: readonly string[];
}

export interface PairScoreSummaryV2 {
  readonly schemaVersion: "pair-score-summary-v2";
  readonly repeatAggregationPolicyId: typeof PAIR_REPEAT_AGGREGATION_POLICY_ID;
  readonly jFrozen: number;
  readonly jEligible: number;
  readonly jIncomplete: number;
  readonly pairExact: PairMetricRatioV2;
  readonly boundarySwitchAccuracy: PairMetricRatioV2;
  readonly strictPairExact: PairMetricRatioV2 | null;
  readonly independenceClusterCount: number;
  readonly clusterBootstrapReady: boolean;
  readonly independenceClusters: readonly PairIndependenceClusterV2[];
  readonly incompletePairIds: readonly string[];
}

export interface SummarizePairScoresV2Options {
  readonly includeStrictPairExact?: boolean;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function hasMultipleValues(values: readonly string[]): boolean {
  return new Set(values).size > 1;
}

export function scorePairV2(
  validated: ValidatedPairContractV2,
  outcomes: PairOutcomeRepeatsV2,
  options: ScorePairV2Options = {},
): PairScoreV2 {
  const allOutcomes = [...outcomes.positive, ...outcomes.negative];
  const repeatInputs: PairOutcomeRepeatsV2 = {
    positive: [...outcomes.positive],
    negative: [...outcomes.negative],
  };
  const positiveRepeatIds = outcomes.positive.map((outcome) => outcome.repeatId);
  const negativeRepeatIds = outcomes.negative.map((outcome) => outcome.repeatId);
  const repeatSetsMatch = JSON.stringify([...new Set(positiveRepeatIds)].sort())
    === JSON.stringify([...new Set(negativeRepeatIds)].sort());
  const incompleteReasons = uniqueSorted([
    ...(outcomes.positive.some((outcome) => !outcome.integrationEligible)
      ? ["POSITIVE_NOT_INTEGRATION_ELIGIBLE"]
      : []),
    ...(outcomes.negative.some((outcome) => !outcome.integrationEligible)
      ? ["NEGATIVE_NOT_INTEGRATION_ELIGIBLE"]
      : []),
    ...(outcomes.positive.some((outcome) => !outcome.traceComplete)
      ? ["POSITIVE_TRACE_INCOMPLETE"]
      : []),
    ...(outcomes.negative.some((outcome) => !outcome.traceComplete)
      ? ["NEGATIVE_TRACE_INCOMPLETE"]
      : []),
    ...(hasDuplicate(allOutcomes.map((outcome) => outcome.runId))
      ? ["RUN_NOT_ISOLATED"]
      : []),
    ...(hasDuplicate(allOutcomes.map((outcome) => outcome.sessionId))
      ? ["SESSION_NOT_ISOLATED"]
      : []),
    ...(hasDuplicate(allOutcomes.map((outcome) => outcome.localStateId))
      ? ["LOCAL_STATE_NOT_ISOLATED"]
      : []),
    ...(hasMultipleValues(allOutcomes.map((outcome) => outcome.variantId))
      ? ["VARIANT_MISMATCH"]
      : []),
    ...(hasMultipleValues(allOutcomes.map((outcome) => outcome.model))
      ? ["MODEL_MISMATCH"]
      : []),
    ...(hasMultipleValues(allOutcomes.map((outcome) => outcome.reasoningEffort))
      ? ["REASONING_MISMATCH"]
      : []),
    ...(hasMultipleValues(allOutcomes.map((outcome) => outcome.assetSnapshotSha256))
      ? ["ASSET_SNAPSHOT_MISMATCH"]
      : []),
    ...(positiveRepeatIds.length === 0 || negativeRepeatIds.length === 0
      ? ["REPEAT_SET_EMPTY"]
      : []),
    ...(hasDuplicate(positiveRepeatIds) || hasDuplicate(negativeRepeatIds)
      ? ["REPEAT_ID_DUPLICATE"]
      : []),
    ...(!repeatSetsMatch ? ["REPEAT_SET_MISMATCH"] : []),
    ...(outcomes.positive.some((outcome) => outcome.caseId !== validated.contract.positiveCaseId)
      || outcomes.negative.some((outcome) => outcome.caseId !== validated.contract.negativeCaseId)
      ? ["OUTCOME_CASE_ID_MISMATCH"]
      : []),
    ...(options.includeStrictPairExact === true
      && outcomes.positive.some((outcome) => typeof outcome.strictChainExact !== "boolean")
      ? ["STRICT_OUTCOME_MISSING"]
      : []),
  ]);
  if (incompleteReasons.length > 0) {
    return {
      pairId: validated.contract.pairId,
      independenceKey: validated.contract.independenceKey,
      split: validated.contract.split,
      eligibility: "incomplete",
      incompleteReasons,
      repeatAggregationPolicyId: PAIR_REPEAT_AGGREGATION_POLICY_ID,
      repeatCount: Math.max(outcomes.positive.length, outcomes.negative.length),
      repeatInputs,
      repeatResults: [],
      positivePass: null,
      negativePass: null,
      pairExact: null,
      boundarySwitchCorrect: null,
      strictPairExact: null,
      negativeFalseIntentTypes: [],
      positiveFailureLayers: [],
    };
  }
  const positiveByRepeat = new Map(outcomes.positive.map((outcome) => [outcome.repeatId, outcome]));
  const negativeByRepeat = new Map(outcomes.negative.map((outcome) => [outcome.repeatId, outcome]));
  const repeatResults = [...positiveByRepeat.keys()].sort().map((repeatId): PairRepeatScoreV2 => {
    const positive = positiveByRepeat.get(repeatId) as M0CaseOutcomeForPairV2;
    const negative = negativeByRepeat.get(repeatId) as M0CaseOutcomeForPairV2;
    const negativeFalseIntentTypes = uniqueSorted([
      ...(negative.executorBoundAttempt ? ["executor_bound" as const] : []),
      ...(!negative.executorBoundAttempt && negative.malformedTdaiDispatchIntent
        ? ["malformed_unbound" as const]
        : []),
    ]) as NegativeFalseIntentTypeV2[];
    const positivePass = positive.completeChainSuccess;
    const negativePass = !negative.executorBoundAttempt && !negative.malformedTdaiDispatchIntent;
    const boundarySwitchCorrect = positive.executorBoundAttempt && !negative.executorBoundAttempt;
    return {
      repeatId,
      positiveRunId: positive.runId,
      negativeRunId: negative.runId,
      positiveSessionId: positive.sessionId,
      negativeSessionId: negative.sessionId,
      positiveLocalStateId: positive.localStateId,
      negativeLocalStateId: negative.localStateId,
      positivePass,
      negativePass,
      pairExact: positivePass && negativePass,
      boundarySwitchCorrect,
      strictPairExact: options.includeStrictPairExact === true
        ? positive.strictChainExact === true && negativePass
        : null,
      negativeFalseIntentTypes,
      positiveFailureLayer: positivePass ? null : positive.failureLayer ?? null,
    };
  });
  const positivePass = repeatResults.every((repeat) => repeat.positivePass);
  const negativePass = repeatResults.every((repeat) => repeat.negativePass);
  const boundarySwitchCorrect = repeatResults.every((repeat) => repeat.boundarySwitchCorrect);
  const strictPairExact = options.includeStrictPairExact === true
    ? repeatResults.every((repeat) => repeat.strictPairExact === true)
    : null;
  const negativeFalseIntentTypes = uniqueSorted(
    repeatResults.flatMap((repeat) => repeat.negativeFalseIntentTypes),
  ) as NegativeFalseIntentTypeV2[];
  const positiveFailureLayers = uniqueSorted(repeatResults
    .map((repeat) => repeat.positiveFailureLayer)
    .filter((layer): layer is string => layer !== null));

  return {
    pairId: validated.contract.pairId,
    independenceKey: validated.contract.independenceKey,
    split: validated.contract.split,
    eligibility: "eligible",
    incompleteReasons: [],
    repeatAggregationPolicyId: PAIR_REPEAT_AGGREGATION_POLICY_ID,
    repeatCount: repeatResults.length,
    repeatInputs,
    repeatResults,
    positivePass,
    negativePass,
    pairExact: positivePass && negativePass,
    boundarySwitchCorrect,
    strictPairExact,
    negativeFalseIntentTypes,
    positiveFailureLayers,
  };
}

function ratio(values: readonly boolean[]): PairMetricRatioV2 {
  const numerator = values.filter(Boolean).length;
  const denominator = values.length;
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

/**
 * Aggregates already pair-level scores. Repeat rows remain nested in each
 * PairScoreV2 and therefore cannot inflate J_frozen, J_eligible, or clusters.
 * Clusters are emitted as indivisible inputs for later matched resampling.
 */
export function summarizePairScoresV2(
  scores: readonly PairScoreV2[],
  options: SummarizePairScoresV2Options = {},
): PairScoreSummaryV2 {
  const pairIds = scores.map((score) => score.pairId);
  if (hasDuplicate(pairIds)) {
    throw new Error("duplicate pairId in PairScoreSummaryV2 input");
  }
  if (scores.some((score) => score.repeatAggregationPolicyId !== PAIR_REPEAT_AGGREGATION_POLICY_ID)) {
    throw new Error(`unsupported repeat aggregation policy; expected ${PAIR_REPEAT_AGGREGATION_POLICY_ID}`);
  }

  const eligible = scores.filter((score) => score.eligibility === "eligible");
  for (const score of eligible) {
    if (score.pairExact === null || score.boundarySwitchCorrect === null) {
      throw new Error(`eligible pair ${score.pairId} is missing required pair metrics`);
    }
    if (options.includeStrictPairExact === true && score.strictPairExact === null) {
      throw new Error(`eligible pair ${score.pairId} is missing preregistered StrictPairExact`);
    }
  }

  const clusterMap = new Map<string, string[]>();
  for (const score of eligible) {
    const pairIdsInCluster = clusterMap.get(score.independenceKey) ?? [];
    pairIdsInCluster.push(score.pairId);
    clusterMap.set(score.independenceKey, pairIdsInCluster);
  }
  const independenceClusters = [...clusterMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([independenceKey, ids]): PairIndependenceClusterV2 => ({
      independenceKey,
      pairIds: [...ids].sort(),
    }));

  return {
    schemaVersion: "pair-score-summary-v2",
    repeatAggregationPolicyId: PAIR_REPEAT_AGGREGATION_POLICY_ID,
    jFrozen: scores.length,
    jEligible: eligible.length,
    jIncomplete: scores.length - eligible.length,
    pairExact: ratio(eligible.map((score) => score.pairExact as boolean)),
    boundarySwitchAccuracy: ratio(
      eligible.map((score) => score.boundarySwitchCorrect as boolean),
    ),
    strictPairExact: options.includeStrictPairExact === true
      ? ratio(eligible.map((score) => score.strictPairExact as boolean))
      : null,
    independenceClusterCount: independenceClusters.length,
    clusterBootstrapReady: independenceClusters.length >= 2,
    independenceClusters,
    incompletePairIds: scores
      .filter((score) => score.eligibility === "incomplete")
      .map((score) => score.pairId)
      .sort(),
  };
}
