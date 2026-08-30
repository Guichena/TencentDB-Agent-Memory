import { describe, expect, it } from "vitest";

import type { FormalExecutionReceipt } from "../../formal-execution-runner.js";
import type { PrivateMeasurementSplitData } from "../../formal-runtime/private-loader.js";
import type { CollectedObservedCampaign } from "../observed-event-collector.js";
import type { CollectedProviderCampaign } from "../provider-evidence-collector.js";
import {
  integrateFormalMeasurement,
} from "../formal-measurement-integration.js";
import {
  MEMORY_SEARCH_GOLD,
  NO_TOOL_GOLD,
  SYNTHETIC_RUNTIME_CONTRACTS,
} from "../synthetic-fixtures.js";

function execution(
  runId: string,
  caseId: string,
  sessionId: string,
): FormalExecutionReceipt {
  return {
    schemaVersion: "task1.formal-execution-receipt.v1",
    formalMetricEligible: false,
    runId,
    caseId,
    variantId: "V0",
    repeat: 1,
    sessionId,
    proxyInstanceId: "proxy-a",
    knowledgeInstanceId: "knowledge-a",
    providerPromptSha256: "a".repeat(64),
    preflightReceiptSha256: "b".repeat(64),
    codeFreeze: {
      executionCodeCommit: "1".repeat(40),
      promptFreezeCommit: "2".repeat(40),
      promptFreezeIsAncestor: true,
    },
    startedAt: "2026-08-30T05:00:00.000Z",
    finishedAt: "2026-08-30T05:00:01.000Z",
    startedWallTimeUnixMicros: "100",
    finishedWallTimeUnixMicros: "200",
    process: {
      exitCode: 0,
      timedOut: false,
      infrastructureError: null,
      stdoutSha256: "c".repeat(64),
      stderrSha256: "d".repeat(64),
    },
    clientUsage: null,
    promptEvidenceState: "captured-by-provider-observer-pending-seal",
    providerUsageState: "captured-by-provider-observer-pending-seal",
    traceCollectionState: "pending-campaign-seal",
  };
}

const positiveExecution = execution(
  "run-positive",
  MEMORY_SEARCH_GOLD.caseId,
  "session-positive",
);
const negativeExecution = execution(
  "run-negative",
  NO_TOOL_GOLD.caseId,
  "session-negative",
);

const toolCampaign: CollectedObservedCampaign = {
  schemaVersion: "task1.observed-event-collection.v1",
  campaignId: "campaign-integration",
  proxyProcessInstanceId: "proxy-a",
  knowledgeProcessInstanceId: "knowledge-a",
  formalCampaignEligible: true,
  issues: [],
  unassignedEvents: [],
  runs: [{
    runId: positiveExecution.runId,
    caseId: positiveExecution.caseId,
    variantId: "V0",
    sessionId: positiveExecution.sessionId,
    entries: [{
      correlationId: "memory-search-a",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      requestBody: { query: "Which database did we choose?" },
      requestBodyCapture: { outcome: "captured", rawBodySha256: "e".repeat(64) },
      correlationHeaders: { "x-conversation-id": positiveExecution.sessionId },
    }],
    completions: [{
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: "memory-search-a",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      outcome: "response",
      status: 200,
      responseBody: { answer: "TencentDB" },
      responseBodySha256: "f".repeat(64),
      durationMs: 2,
    }],
    formalTraceEligible: true,
    issues: [],
  }, {
    runId: negativeExecution.runId,
    caseId: negativeExecution.caseId,
    variantId: "V0",
    sessionId: negativeExecution.sessionId,
    entries: [],
    completions: [],
    formalTraceEligible: true,
    issues: [],
  }],
};

function providerCampaign(
  negativeEligible = true,
): CollectedProviderCampaign {
  const run = (
    receipt: FormalExecutionReceipt,
    eligible: boolean,
  ): CollectedProviderCampaign["runs"][number] => ({
    runId: receipt.runId,
    caseId: receipt.caseId,
    variantId: "V0",
    sessionId: receipt.sessionId,
    requests: [{
      correlationId: `${receipt.runId}-provider`,
      sequence: 1,
      wallTimeUnixMicros: "120",
      path: "/codex/space-a/v1/responses",
      method: "POST",
      rawBodySha256: "a".repeat(64),
      status: 200,
      upstreamRequestId: `${receipt.runId}-official`,
      responseBodySha256: "b".repeat(64),
      usage: {
        inputTokens: 100,
        cachedInputTokens: 60,
        outputTokens: 10,
        reasoningOutputTokens: 2,
        totalTokens: 110,
      },
      injectionAudit: null,
    }],
    injection: {
      encoding: "o200k_base",
      tokens: 20,
      characters: 80,
      utf8Bytes: 80,
      sha256: "c".repeat(64),
      toolFamilies: ["memory", "skill", "knowledge"],
    },
    providerUsage: {
      requestCount: 1,
      inputTokens: 100,
      cachedInputTokens: 60,
      outputTokens: 10,
      reasoningOutputTokens: 2,
      totalTokens: 110,
    },
    formalProviderEvidenceEligible: eligible,
    issues: eligible ? [] : [{ code: "provider_usage_missing_or_invalid", message: "missing" }],
  });
  return {
    schemaVersion: "task1.provider-evidence-collection.v1",
    campaignId: "campaign-integration",
    proxyProcessInstanceId: "proxy-a",
    formalCampaignEligible: negativeEligible,
    issues: negativeEligible ? [] : [{ code: "provider_usage_missing_or_invalid", message: "missing" }],
    unassignedSequences: [],
    runs: [run(positiveExecution, true), run(negativeExecution, negativeEligible)],
  };
}

const privateMeasurement = {
  split: "dev",
  goldCount: 2,
  pairCount: 1,
  runtimeContractCount: 21,
  gold: [MEMORY_SEARCH_GOLD, NO_TOOL_GOLD],
  pairs: [{
    schemaVersion: "2",
    pairId: "pair-memory-positive-negative",
    positiveCaseId: MEMORY_SEARCH_GOLD.caseId,
    negativeCaseId: NO_TOOL_GOLD.caseId,
    causalFactorId: "memory-relevance",
    allowedChangedPointers: ["/query"],
    invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
    invariantFieldsSha256: "f".repeat(64),
    changedPointerCount: 1,
    minimalityReviewStatus: "approved",
    independenceKey: "memory-relevance-a",
    split: "dev",
  }],
  runtimeContracts: SYNTHETIC_RUNTIME_CONTRACTS,
  hashes: {
    manifestCanonicalSha256: "a".repeat(64),
    goldCanonicalSha256: "b".repeat(64),
    pairCanonicalSha256: "c".repeat(64),
    runtimeContractsCanonicalSha256: "d".repeat(64),
  },
  formalMetricEligible: false,
} as unknown as PrivateMeasurementSplitData;

describe("integrateFormalMeasurement", () => {
  it("scores only fully eligible runs and reports paired behavior plus token facts", () => {
    const result = integrateFormalMeasurement({
      campaignId: "campaign-integration",
      executions: [positiveExecution, negativeExecution],
      toolCampaign,
      providerCampaign: providerCampaign(),
      privateMeasurement,
    });

    expect(result).toMatchObject({
      schemaVersion: "task1.formal-measurement-integration.v1",
      campaignId: "campaign-integration",
      variantId: "V0",
      eligibleRunCount: 2,
      excludedRunCount: 0,
      aggregate: {
        shortestExactRate: { numerator: 1, denominator: 1, value: 1 },
        falseCallAttemptRate: { numerator: 0, denominator: 1, value: 0 },
        conditionalTerminalAccuracy: { numerator: 1, denominator: 1, value: 1 },
      },
      paired: {
        contractCount: 1,
        eligiblePairCount: 1,
        excludedPairCount: 0,
        pairedDecisionSuccessRate: { numerator: 1, denominator: 1, value: 1 },
      },
      tokens: {
        runCount: 2,
        staticInjectionTokens: { sum: 40, min: 20, max: 20, mean: 20 },
        providerUsage: {
          inputTokens: 200,
          cachedInputTokens: 120,
          outputTokens: 20,
          reasoningOutputTokens: 4,
          totalTokens: 220,
        },
      },
    });
    expect(result.runs.every((run) => run.formalMetricEligible)).toBe(true);
  });

  it("excludes the whole structurally damaged campaign and its Pair denominator", () => {
    const result = integrateFormalMeasurement({
      campaignId: "campaign-integration",
      executions: [positiveExecution, negativeExecution],
      toolCampaign,
      providerCampaign: providerCampaign(false),
      privateMeasurement,
    });

    expect(result.eligibleRunCount).toBe(0);
    expect(result.excludedRunCount).toBe(2);
    expect(result.aggregate.caseCount).toBe(0);
    expect(result.paired).toMatchObject({
      eligiblePairCount: 0,
      excludedPairCount: 1,
      pairedDecisionSuccessRate: { numerator: 0, denominator: 0, value: null },
    });
    expect(result.runs.every((run) => (
      run.exclusionReasons.includes("provider_campaign_ineligible")
    ))).toBe(true);
  });
});
