import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import interfaceManifest from "../../eval/tool-prompt-bench/measurement-v2/M1-SCHEMA-INTERFACE-MANIFEST.json";
import syntheticFixture from "../../eval/tool-prompt-bench/measurement-v2/fixtures/m1-pair-v2.synthetic.json";
import {
  validatePairContractV2,
  type PairCaseProjectionV2,
  type PairContractV2,
} from "../../eval/tool-prompt-bench/measurement-v2/pair-contract.js";
import {
  computeExpectedPairMembershipSha256V2,
  computePairScoringPolicySha256V2,
  scorePairV2,
  summarizePairScoresV2,
  validatePairCaseOutcomeV2,
  type IntegratedCaseOutcomeForPairV2,
  type PairSummaryCampaignV2,
} from "../../eval/tool-prompt-bench/measurement-v2/pair-scorer.js";

const POSITIVE_CASE: PairCaseProjectionV2 = {
  caseId: "pair-skill-positive",
  split: "dev",
  comparisonDocument: {
    query: "Use the saved team formatter for this log output.",
    context: { team: "payments", language: "ts" },
    capabilities: { memory: true, skill: true },
    gold: { needTdaiTool: true },
  },
};

const NEGATIVE_CASE: PairCaseProjectionV2 = {
  caseId: "pair-skill-negative",
  split: "dev",
  comparisonDocument: {
    query: "Use the formatter already shown above for this log output.",
    context: { team: "payments", language: "ts" },
    capabilities: { memory: true, skill: true },
    gold: { needTdaiTool: false },
  },
};

const CONTRACT: PairContractV2 = {
  schemaVersion: "2",
  pairId: "pair-skill-boundary-001",
  positiveCaseId: POSITIVE_CASE.caseId,
  negativeCaseId: NEGATIVE_CASE.caseId,
  causalFactorId: "answer-source-saved-vs-present",
  allowedChangedPointers: ["/gold/needTdaiTool", "/query"],
  invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
  invariantFieldsSha256: "bea7821895ab65d5ca0c55ad67980d9fe3eb1c16247ec90a59d016e99c789d40",
  changedPointerCount: 2,
  minimalityReviewStatus: "approved",
  independenceKey: "team-payments-source-formatter",
  split: "dev",
};

const POSITIVE_OUTCOME: IntegratedCaseOutcomeForPairV2 = {
  caseId: POSITIVE_CASE.caseId,
  repeatId: "repeat-01",
  variantId: "V3",
  model: "gpt-5.6-luna",
  reasoningEffort: "high",
  provider: "openai",
  apiProtocol: "responses-v1",
  adapterVersion: "memory-proxy-openai-v1",
  executionIdentitySha256: "e".repeat(64),
  assetSnapshotSha256: "a".repeat(64),
  runId: "positive-run-01",
  sessionId: "positive-session-01",
  localStateId: "positive-state-01",
  integrationEligible: true,
  traceComplete: true,
  completeChainSuccess: true,
  strictChainExact: true,
  executorBoundAttempt: true,
  malformedTdaiDispatchIntent: false,
};

const NEGATIVE_OUTCOME: IntegratedCaseOutcomeForPairV2 = {
  caseId: NEGATIVE_CASE.caseId,
  repeatId: "repeat-01",
  variantId: "V3",
  model: "gpt-5.6-luna",
  reasoningEffort: "high",
  provider: "openai",
  apiProtocol: "responses-v1",
  adapterVersion: "memory-proxy-openai-v1",
  executionIdentitySha256: "e".repeat(64),
  assetSnapshotSha256: "a".repeat(64),
  runId: "negative-run-01",
  sessionId: "negative-session-01",
  localStateId: "negative-state-01",
  integrationEligible: true,
  traceComplete: true,
  completeChainSuccess: false,
  executorBoundAttempt: false,
  malformedTdaiDispatchIntent: false,
};

function validatedContract() {
  const validation = validatePairContractV2(CONTRACT, POSITIVE_CASE, NEGATIVE_CASE);
  if (!validation.ok) throw new Error("test Pair Contract must be valid");
  return validation.value;
}

function summaryCampaign(
  expectedPairIds: readonly string[] = [CONTRACT.pairId],
  expectedRepeatIds: readonly string[] = [POSITIVE_OUTCOME.repeatId],
  strictPairExactEnabled = false,
): PairSummaryCampaignV2 {
  const campaign = {
    schemaVersion: "pair-summary-campaign-v2" as const,
    split: CONTRACT.split,
    variantId: POSITIVE_OUTCOME.variantId,
    model: POSITIVE_OUTCOME.model,
    reasoningEffort: POSITIVE_OUTCOME.reasoningEffort,
    provider: POSITIVE_OUTCOME.provider,
    apiProtocol: POSITIVE_OUTCOME.apiProtocol,
    adapterVersion: POSITIVE_OUTCOME.adapterVersion,
    executionIdentitySha256: POSITIVE_OUTCOME.executionIdentitySha256,
    assetSnapshotSha256: POSITIVE_OUTCOME.assetSnapshotSha256,
    expectedPairIds,
    expectedRepeatIds,
    frozenPairSetRevision: "synthetic-pair-set-v2",
    frozenPairSetSha256: "d".repeat(64),
    strictPairExactEnabled,
    scoringPolicySha256: computePairScoringPolicySha256V2(strictPairExactEnabled),
  };
  return {
    ...campaign,
    expectedPairIdsSha256: computeExpectedPairMembershipSha256V2(campaign),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

describe("Pair Contract v2", () => {
  it("accepts an approved minimal counterfactual pair with a frozen invariant hash", () => {
    expect(validatePairContractV2(CONTRACT, POSITIVE_CASE, NEGATIVE_CASE)).toEqual({
      ok: true,
      value: {
        contract: CONTRACT,
        changedPointers: ["/gold/needTdaiTool", "/query"],
        computedInvariantFieldsSha256: CONTRACT.invariantFieldsSha256,
      },
    });
  });

  it("rejects a contract whose case identities do not match the compared cases", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, positiveCaseId: "some-other-positive" },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("CASE_ID_MISMATCH");
  });

  it("rejects a pair that has not passed minimality review", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, minimalityReviewStatus: "pending" },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("MINIMALITY_NOT_APPROVED");
  });

  it("rejects a pair whose cases cross evaluation splits", () => {
    const result = validatePairContractV2(
      CONTRACT,
      POSITIVE_CASE,
      { ...NEGATIVE_CASE, split: "hidden" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("SPLIT_MISMATCH");
  });

  it("rejects a stale changed-pointer count", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, changedPointerCount: 1 },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("CHANGED_POINTER_COUNT_MISMATCH");
  });

  it("rejects an allowed pointer that does not cover a real change", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, allowedChangedPointers: [...CONTRACT.allowedChangedPointers, "/context"] },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("UNUSED_ALLOWED_POINTER");
  });

  it("rejects a change outside the frozen allowlist", () => {
    const result = validatePairContractV2(
      CONTRACT,
      POSITIVE_CASE,
      {
        ...NEGATIVE_CASE,
        comparisonDocument: {
          ...(NEGATIVE_CASE.comparisonDocument as Record<string, PairCaseProjectionV2["comparisonDocument"]>),
          capabilities: { memory: false, skill: true },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("CHANGE_OUTSIDE_ALLOWLIST");
  });

  it("rejects a tampered invariant projection hash", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, invariantFieldsSha256: "0".repeat(64) },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("INVARIANT_HASH_MISMATCH");
  });

  it("fails closed when a required Pair Contract v2 field is blank", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, causalFactorId: "" },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("MISSING_REQUIRED_FIELD");
  });

  it("rejects an unsupported schema version at the untrusted runtime boundary", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, schemaVersion: "1" } as unknown as PairContractV2,
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("UNSUPPORTED_SCHEMA_VERSION");
  });

  it.each([
    [["query"], "INVALID_JSON_POINTER"],
    [["/query~2bad"], "INVALID_JSON_POINTER"],
    [["/"], "ROOT_POINTER_NOT_ALLOWED"],
  ] as const)("rejects an invalid changed-pointer allowlist %j", (allowedChangedPointers, expectedCode) => {
    const result = validatePairContractV2(
      { ...CONTRACT, allowedChangedPointers },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain(expectedCode);
  });

  it("rejects duplicate allowlist pointers", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, allowedChangedPointers: ["/query", "/query"] },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("DUPLICATE_ALLOWED_POINTER");
  });

  it("rejects overlapping parent and child allowlist pointers", () => {
    const result = validatePairContractV2(
      { ...CONTRACT, allowedChangedPointers: ["/gold", "/gold/needTdaiTool", "/query"] },
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("OVERLAPPING_ALLOWED_POINTERS");
  });

  it.each([
    [{ allowedChangedPointers: [] }, "EMPTY_ALLOWED_POINTERS"],
    [{ invariantFieldsSha256: "not-a-sha" }, "INVALID_SHA256"],
    [{ changedPointerCount: -1 }, "INVALID_CHANGED_POINTER_COUNT"],
    [{ invariantProjectionSchemaVersion: "unknown-projection" }, "UNSUPPORTED_INVARIANT_PROJECTION_SCHEMA"],
    [{ split: "test" }, "INVALID_SPLIT"],
  ] as const)("fails closed on malformed runtime contract field %j", (change, expectedCode) => {
    const result = validatePairContractV2(
      { ...CONTRACT, ...change } as unknown as PairContractV2,
      POSITIVE_CASE,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain(expectedCode);
  });

  it("returns validation errors instead of throwing for structurally invalid input", () => {
    const result = validatePairContractV2(
      { schemaVersion: "2" } as unknown as PairContractV2,
      null as unknown as PairCaseProjectionV2,
      NEGATIVE_CASE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("INVALID_CONTRACT_SHAPE");
  });
});

describe("Pair scorer v2", () => {
  it("validates the integrated pair outcome at the untrusted runtime boundary", () => {
    expect(validatePairCaseOutcomeV2(POSITIVE_OUTCOME)).toEqual({
      ok: true,
      value: POSITIVE_OUTCOME,
    });

    const malformed = {
      ...NEGATIVE_OUTCOME,
      executorBoundAttempt: undefined,
      malformedTdaiDispatchIntent: undefined,
    };
    const validation = validatePairCaseOutcomeV2(malformed);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors.map((error) => error.pointer)).toEqual(expect.arrayContaining([
        "/executorBoundAttempt",
        "/malformedTdaiDispatchIntent",
      ]));
    }
  });

  it("never turns missing negative intent booleans into a clean no-call", () => {
    const malformedNegative = { ...NEGATIVE_OUTCOME } as Record<string, unknown>;
    delete malformedNegative.executorBoundAttempt;
    delete malformedNegative.malformedTdaiDispatchIntent;

    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [malformedNegative as unknown as IntegratedCaseOutcomeForPairV2],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.negativePass).toBeNull();
    expect(result.pairExact).toBeNull();
    expect(result.incompleteReasons).toContain("NEGATIVE_OUTCOME_INVALID");
  });

  it("fails closed on blank runtime identity instead of comparing equal blanks", () => {
    const blankIdentity = {
      repeatId: "",
      variantId: "",
      model: "",
      reasoningEffort: "",
      provider: "",
      apiProtocol: "",
      adapterVersion: "",
      executionIdentitySha256: "",
      assetSnapshotSha256: "",
    };
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [{
          ...POSITIVE_OUTCOME,
          ...blankIdentity,
          runId: "",
          sessionId: " ",
          localStateId: "  ",
        }],
        negative: [{
          ...NEGATIVE_OUTCOME,
          ...blankIdentity,
          runId: "   ",
          sessionId: "    ",
          localStateId: "     ",
        }],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toEqual(expect.arrayContaining([
      "POSITIVE_OUTCOME_INVALID",
      "NEGATIVE_OUTCOME_INVALID",
    ]));
  });

  it.each([
    ["provider", "anthropic", "PROVIDER_MISMATCH"],
    ["apiProtocol", "messages-v1", "API_PROTOCOL_MISMATCH"],
    ["adapterVersion", "memory-proxy-anthropic-v1", "ADAPTER_VERSION_MISMATCH"],
    ["executionIdentitySha256", "f".repeat(64), "EXECUTION_IDENTITY_MISMATCH"],
  ] as const)("fails closed when paired outcomes differ by %s", (field, value, expectedReason) => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, [field]: value }],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain(expectedReason);
  });

  it("scores a correct positive chain and a clean negative as an exact boundary switch", () => {
    expect(scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    )).toMatchObject({
      pairId: CONTRACT.pairId,
      independenceKey: CONTRACT.independenceKey,
      split: CONTRACT.split,
      eligibility: "eligible",
      incompleteReasons: [],
      repeatAggregationPolicyId: "all-repeats-pass-v1",
      repeatCount: 1,
      repeatResults: [{
        repeatId: "repeat-01",
        pairExact: true,
        boundarySwitchCorrect: true,
      }],
      positivePass: true,
      negativePass: true,
      pairExact: true,
      boundarySwitchCorrect: true,
      strictPairExact: null,
      negativeFalseIntentTypes: [],
      positiveFailureLayers: [],
      cohort: {
        variantId: POSITIVE_OUTCOME.variantId,
        model: POSITIVE_OUTCOME.model,
        reasoningEffort: POSITIVE_OUTCOME.reasoningEffort,
        provider: POSITIVE_OUTCOME.provider,
        apiProtocol: POSITIVE_OUTCOME.apiProtocol,
        adapterVersion: POSITIVE_OUTCOME.adapterVersion,
        executionIdentitySha256: POSITIVE_OUTCOME.executionIdentitySha256,
        assetSnapshotSha256: POSITIVE_OUTCOME.assetSnapshotSha256,
      },
      repeatIds: [POSITIVE_OUTCOME.repeatId],
    });
  });

  it("marks a pair incomplete when either side fails integration eligibility", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, integrationEligible: false }],
      },
    );

    expect(result).toMatchObject({
      eligibility: "incomplete",
      pairExact: null,
      boundarySwitchCorrect: null,
      positivePass: null,
      negativePass: null,
    });
    expect(result.incompleteReasons).toContain("NEGATIVE_NOT_INTEGRATION_ELIGIBLE");
  });

  it("keeps an incomplete trace out of the behavior denominator", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, traceComplete: false }],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.pairExact).toBeNull();
    expect(result.incompleteReasons).toContain("NEGATIVE_TRACE_INCOMPLETE");
  });

  it("fails closed when the two sides share a session", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, sessionId: POSITIVE_OUTCOME.sessionId }],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("SESSION_NOT_ISOLATED");
  });

  it.each([
    ["variantId", "V2", "VARIANT_MISMATCH"],
    ["model", "another-model", "MODEL_MISMATCH"],
    ["reasoningEffort", "medium", "REASONING_MISMATCH"],
    ["assetSnapshotSha256", "b".repeat(64), "ASSET_SNAPSHOT_MISMATCH"],
  ] as const)("fails closed when paired outcomes differ by %s", (field, value, expectedReason) => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, [field]: value }],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain(expectedReason);
  });

  it("requires matched repeat ids instead of treating repeats as new pairs", () => {
    const outcomes = {
      positive: [POSITIVE_OUTCOME],
      negative: [{ ...NEGATIVE_OUTCOME, repeatId: "repeat-02" }],
    };
    const result = scorePairV2(
      validatedContract(),
      outcomes,
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("REPEAT_SET_MISMATCH");
    expect(result.repeatInputs).toEqual(outcomes);
  });

  it("keeps BoundarySwitch true when the negative has only an unbound malformed intent", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, malformedTdaiDispatchIntent: true }],
      },
    );

    expect(result).toMatchObject({
      eligibility: "eligible",
      negativePass: false,
      pairExact: false,
      boundarySwitchCorrect: true,
      negativeFalseIntentTypes: ["malformed_unbound"],
    });
  });

  it("fails closed when an outcome case id does not match its pair side", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [{ ...POSITIVE_OUTCOME, caseId: NEGATIVE_CASE.caseId }],
        negative: [NEGATIVE_OUTCOME],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("OUTCOME_CASE_ID_MISMATCH");
  });

  it("aggregates matched repeats inside one pair with an explicit all-repeats policy", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [
          POSITIVE_OUTCOME,
          {
            ...POSITIVE_OUTCOME,
            repeatId: "repeat-02",
            runId: "positive-run-02",
            sessionId: "positive-session-02",
            localStateId: "positive-state-02",
            completeChainSuccess: false,
            strictChainExact: false,
            failureLayer: "terminal_selection",
          },
        ],
        negative: [
          NEGATIVE_OUTCOME,
          {
            ...NEGATIVE_OUTCOME,
            repeatId: "repeat-02",
            runId: "negative-run-02",
            sessionId: "negative-session-02",
            localStateId: "negative-state-02",
          },
        ],
      },
    );

    expect(result).toMatchObject({
      eligibility: "eligible",
      repeatAggregationPolicyId: "all-repeats-pass-v1",
      repeatCount: 2,
      pairExact: false,
      boundarySwitchCorrect: true,
      positiveFailureLayers: ["terminal_selection"],
      repeatResults: [
        { repeatId: "repeat-01", pairExact: true, boundarySwitchCorrect: true },
        { repeatId: "repeat-02", pairExact: false, boundarySwitchCorrect: true },
      ],
    });
  });

  it.each([
    ["positive", { positive: [], negative: [NEGATIVE_OUTCOME] }],
    ["negative", { positive: [POSITIVE_OUTCOME], negative: [] }],
    ["both", { positive: [], negative: [] }],
  ] as const)("fails closed when the %s repeat side is empty", (_side, outcomes) => {
    const result = scorePairV2(validatedContract(), outcomes);

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("REPEAT_SET_EMPTY");
  });

  it("fails closed when a side repeats the same repeatId", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [
          POSITIVE_OUTCOME,
          {
            ...POSITIVE_OUTCOME,
            runId: "positive-run-duplicate-repeat",
            sessionId: "positive-session-duplicate-repeat",
            localStateId: "positive-state-duplicate-repeat",
          },
        ],
        negative: [NEGATIVE_OUTCOME],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("REPEAT_ID_DUPLICATE");
  });

  it("fails closed when repeat counts and id sets differ", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [
          POSITIVE_OUTCOME,
          {
            ...POSITIVE_OUTCOME,
            repeatId: "repeat-02",
            runId: "positive-run-02",
            sessionId: "positive-session-02",
            localStateId: "positive-state-02",
          },
        ],
        negative: [NEGATIVE_OUTCOME],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("REPEAT_SET_MISMATCH");
  });

  it.each([
    ["runId", POSITIVE_OUTCOME.runId, "RUN_NOT_ISOLATED"],
    ["localStateId", POSITIVE_OUTCOME.localStateId, "LOCAL_STATE_NOT_ISOLATED"],
  ] as const)("fails closed when paired outcomes share %s", (field, value, expectedReason) => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, [field]: value }],
      },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain(expectedReason);
  });

  it("makes always-call fail PairExact and BoundarySwitch", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [POSITIVE_OUTCOME],
        negative: [{ ...NEGATIVE_OUTCOME, executorBoundAttempt: true }],
      },
    );

    expect(result).toMatchObject({
      eligibility: "eligible",
      positivePass: true,
      negativePass: false,
      pairExact: false,
      boundarySwitchCorrect: false,
      negativeFalseIntentTypes: ["executor_bound"],
    });
  });

  it("makes never-call fail PairExact and BoundarySwitch", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [{
          ...POSITIVE_OUTCOME,
          completeChainSuccess: false,
          executorBoundAttempt: false,
          failureLayer: "invocation",
        }],
        negative: [NEGATIVE_OUTCOME],
      },
    );

    expect(result).toMatchObject({
      eligibility: "eligible",
      positivePass: false,
      negativePass: true,
      pairExact: false,
      boundarySwitchCorrect: false,
      positiveFailureLayers: ["invocation"],
    });
  });

  it("keeps BoundarySwitch diagnostic true when positive called but did not reach the terminal", () => {
    const result = scorePairV2(
      validatedContract(),
      {
        positive: [{
          ...POSITIVE_OUTCOME,
          completeChainSuccess: false,
          failureLayer: "terminal_selection",
        }],
        negative: [NEGATIVE_OUTCOME],
      },
    );

    expect(result).toMatchObject({
      pairExact: false,
      boundarySwitchCorrect: true,
      positiveFailureLayers: ["terminal_selection"],
    });
  });

  it("only enables StrictPairExact when preregistered and M0 supplied strict outcomes", () => {
    const ordinary = scorePairV2(
      validatedContract(),
      {
        positive: [{ ...POSITIVE_OUTCOME, strictChainExact: false }],
        negative: [NEGATIVE_OUTCOME],
      },
    );
    const strict = scorePairV2(
      validatedContract(),
      {
        positive: [{ ...POSITIVE_OUTCOME, strictChainExact: false }],
        negative: [NEGATIVE_OUTCOME],
      },
      { includeStrictPairExact: true },
    );

    expect(ordinary).toMatchObject({ pairExact: true, strictPairExact: null });
    expect(strict).toMatchObject({ pairExact: true, strictPairExact: false });
  });

  it("fails closed when StrictPairExact was preregistered but M0 omitted its strict decision", () => {
    const { strictChainExact: _omitted, ...positiveWithoutStrict } = POSITIVE_OUTCOME;
    const result = scorePairV2(
      validatedContract(),
      { positive: [positiveWithoutStrict], negative: [NEGATIVE_OUTCOME] },
      { includeStrictPairExact: true },
    );

    expect(result.eligibility).toBe("incomplete");
    expect(result.incompleteReasons).toContain("STRICT_OUTCOME_MISSING");
    expect(result.strictPairExact).toBeNull();
  });
});

describe("Pair score summary v2", () => {
  it("counts frozen, eligible, and incomplete pairs without promoting repeats to pairs", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const failed = {
      ...scorePairV2(
        validatedContract(),
        {
          positive: [{
            ...POSITIVE_OUTCOME,
            completeChainSuccess: false,
            failureLayer: "terminal_selection",
          }],
          negative: [NEGATIVE_OUTCOME],
        },
      ),
      pairId: "pair-skill-boundary-002",
    };
    const incomplete = {
      ...exact,
      pairId: "pair-skill-boundary-003",
      eligibility: "incomplete" as const,
      incompleteReasons: ["NEGATIVE_TRACE_INCOMPLETE"],
      pairExact: null,
      positivePass: null,
      negativePass: null,
      boundarySwitchCorrect: null,
      strictPairExact: null,
    };

    const campaign = summaryCampaign([
      CONTRACT.pairId,
      "pair-skill-boundary-002",
      "pair-skill-boundary-003",
    ]);
    expect(summarizePairScoresV2([exact, failed, incomplete], { campaign })).toEqual({
      schemaVersion: "pair-score-summary-v2",
      campaignEligibility: "eligible",
      campaignIncompleteReasons: [],
      cohort: {
        split: CONTRACT.split,
        variantId: POSITIVE_OUTCOME.variantId,
        model: POSITIVE_OUTCOME.model,
        reasoningEffort: POSITIVE_OUTCOME.reasoningEffort,
        provider: POSITIVE_OUTCOME.provider,
        apiProtocol: POSITIVE_OUTCOME.apiProtocol,
        adapterVersion: POSITIVE_OUTCOME.adapterVersion,
        executionIdentitySha256: POSITIVE_OUTCOME.executionIdentitySha256,
        assetSnapshotSha256: POSITIVE_OUTCOME.assetSnapshotSha256,
      },
      frozenPairSetSha256: campaign.frozenPairSetSha256,
      frozenPairSetRevision: campaign.frozenPairSetRevision,
      expectedPairIdsSha256: campaign.expectedPairIdsSha256,
      expectedPairIds: campaign.expectedPairIds,
      observedPairIds: campaign.expectedPairIds,
      missingPairIds: [],
      unexpectedPairIds: [],
      expectedRepeatIds: campaign.expectedRepeatIds,
      repeatAggregationPolicyId: "all-repeats-pass-v1",
      scoringPolicySha256: campaign.scoringPolicySha256,
      strictPairExactEnabled: false,
      jFrozen: 3,
      jObserved: 3,
      jEligible: 2,
      jIncomplete: 1,
      pairExact: { numerator: 1, denominator: 2, value: 0.5 },
      boundarySwitchAccuracy: { numerator: 2, denominator: 2, value: 1 },
      strictPairExact: null,
      independenceClusterCount: 1,
      clusterBootstrapReady: false,
      independenceClusters: [{
        independenceKey: CONTRACT.independenceKey,
        pairIds: [CONTRACT.pairId, "pair-skill-boundary-002"],
      }],
      incompletePairIds: ["pair-skill-boundary-003"],
      incompleteReasonCounts: { NEGATIVE_TRACE_INCOMPLETE: 1 },
    });
  });

  it("rejects duplicate pair ids so repeats cannot inflate J_frozen", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );

    expect(() => summarizePairScoresV2(
      [exact, exact],
      { campaign: summaryCampaign() },
    )).toThrow(/duplicate pairId/i);
  });

  it("reports cluster bootstrap readiness only with at least two independent blocks", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const otherCluster = {
      ...exact,
      pairId: "pair-skill-boundary-004",
      independenceKey: "team-ledger-source-formatter",
    };

    const summary = summarizePairScoresV2(
      [exact, otherCluster],
      { campaign: summaryCampaign([CONTRACT.pairId, "pair-skill-boundary-004"]) },
    );
    expect(summary.clusterBootstrapReady).toBe(true);
    expect(summary.independenceClusters).toEqual([
      { independenceKey: "team-ledger-source-formatter", pairIds: ["pair-skill-boundary-004"] },
      { independenceKey: CONTRACT.independenceKey, pairIds: [CONTRACT.pairId] },
    ]);
  });

  it("summarizes preregistered StrictPairExact with the same eligible-pair denominator", () => {
    const strictPass = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
      { includeStrictPairExact: true },
    );
    const strictFail = {
      ...scorePairV2(
        validatedContract(),
        {
          positive: [{ ...POSITIVE_OUTCOME, strictChainExact: false }],
          negative: [NEGATIVE_OUTCOME],
        },
        { includeStrictPairExact: true },
      ),
      pairId: "pair-skill-boundary-005",
    };

    expect(summarizePairScoresV2(
      [strictPass, strictFail],
      {
        campaign: summaryCampaign([CONTRACT.pairId, "pair-skill-boundary-005"], ["repeat-01"], true),
        includeStrictPairExact: true,
      },
    ).strictPairExact).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("marks a campaign incomplete instead of mixing Variant, model, or split cohorts", () => {
    const v3Dev = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const v2Hidden = {
      ...v3Dev,
      pairId: "pair-skill-boundary-hidden",
      split: "hidden" as const,
      cohort: v3Dev.cohort && {
        ...v3Dev.cohort,
        split: "hidden" as const,
        variantId: "V2",
        model: "another-model",
      },
    };
    const campaign = summaryCampaign([CONTRACT.pairId, v2Hidden.pairId]);
    const summary = summarizePairScoresV2([v3Dev, v2Hidden], { campaign });

    expect(summary.campaignEligibility).toBe("incomplete");
    expect(summary.campaignIncompleteReasons).toEqual(expect.arrayContaining([
      "SCORE_COHORT_MISMATCH",
    ]));
    expect(summary.jFrozen).toBe(2);
    expect(summary.jEligible).toBe(1);
    expect(summary.pairExact).toEqual({ numerator: 1, denominator: 1, value: 1 });
  });

  it("keeps the frozen denominator when an entire pair is missing", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const missingPairId = "pair-skill-boundary-missing";
    const summary = summarizePairScoresV2(
      [exact],
      { campaign: summaryCampaign([CONTRACT.pairId, missingPairId]) },
    );

    expect(summary).toMatchObject({
      campaignEligibility: "incomplete",
      campaignIncompleteReasons: ["FROZEN_PAIR_SET_INCOMPLETE"],
      jFrozen: 2,
      jObserved: 1,
      jEligible: 1,
      jIncomplete: 1,
      missingPairIds: [missingPairId],
      incompleteReasonCounts: { MISSING_FROZEN_PAIR: 1 },
    });
  });

  it("detects when both sides silently omit the same expected repeat", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const summary = summarizePairScoresV2(
      [exact],
      { campaign: summaryCampaign([CONTRACT.pairId], ["repeat-01", "repeat-02"]) },
    );

    expect(summary.campaignEligibility).toBe("incomplete");
    expect(summary.campaignIncompleteReasons).toContain("EXPECTED_REPEAT_SET_MISMATCH");
    expect(summary.incompleteReasonCounts).toMatchObject({ EXPECTED_REPEAT_SET_MISMATCH: 1 });
  });

  it("excludes an internally inconsistent serialized PairScore from behavior metrics", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const forged = {
      ...exact,
      repeatCount: 0,
      repeatInputs: { positive: [], negative: [] },
      repeatResults: [],
      positivePass: false,
      negativePass: false,
      pairExact: true,
    };
    const summary = summarizePairScoresV2(
      [forged],
      { campaign: summaryCampaign() },
    );

    expect(summary).toMatchObject({
      campaignEligibility: "incomplete",
      campaignIncompleteReasons: ["PAIR_SCORE_INCONSISTENT"],
      jFrozen: 1,
      jEligible: 0,
      jIncomplete: 1,
      pairExact: { numerator: 0, denominator: 0, value: null },
      boundarySwitchAccuracy: { numerator: 0, denominator: 0, value: null },
      incompletePairIds: [CONTRACT.pairId],
      incompleteReasonCounts: { PAIR_SCORE_INCONSISTENT: 1 },
    });
  });

  it("rejects a tampered expected-pair membership hash before computing a formal summary", () => {
    const exact = scorePairV2(
      validatedContract(),
      { positive: [POSITIVE_OUTCOME], negative: [NEGATIVE_OUTCOME] },
    );
    const campaign = { ...summaryCampaign(), expectedPairIdsSha256: "0".repeat(64) };

    expect(() => summarizePairScoresV2([exact], { campaign })).toThrow(/membership hash/i);
  });

  it("keeps frozen pair membership identity independent from Variant and execution cohort", () => {
    const campaign = summaryCampaign([CONTRACT.pairId, "pair-skill-boundary-002"]);
    expect(computeExpectedPairMembershipSha256V2({
      ...campaign,
      variantId: "V0",
      model: "another-model",
      reasoningEffort: "medium",
      provider: "anthropic",
      apiProtocol: "messages-v1",
      adapterVersion: "another-adapter",
      executionIdentitySha256: "f".repeat(64),
      assetSnapshotSha256: "b".repeat(64),
    })).toBe(campaign.expectedPairIdsSha256);
  });
});

describe("M1 frozen interface artifacts", () => {
  it("pins the synthetic fixture canonical SHA and explicit formal-data block", () => {
    const canonicalSha256 = createHash("sha256")
      .update(canonicalJson(syntheticFixture))
      .digest("hex");

    expect(syntheticFixture.contract).toEqual(CONTRACT);
    expect(syntheticFixture.positiveCase).toEqual(POSITIVE_CASE);
    expect(syntheticFixture.negativeCase).toEqual(NEGATIVE_CASE);
    expect(interfaceManifest.syntheticFixture.canonicalSha256).toBe(canonicalSha256);
    expect(interfaceManifest.formalDataStatus).toBe("FORMAL_DATA_BLOCKED");
    expect(interfaceManifest.repeatAggregation.policyId).toBe("all-repeats-pass-v1");
    expect(interfaceManifest.integratedOutcomeSeam.recomputesEcr).toBe(false);
    const fixtureCampaign = syntheticFixture.summaryCampaign as PairSummaryCampaignV2;
    expect(fixtureCampaign.expectedPairIdsSha256).toBe(
      computeExpectedPairMembershipSha256V2(fixtureCampaign),
    );
    expect(fixtureCampaign.scoringPolicySha256).toBe(
      computePairScoringPolicySha256V2(fixtureCampaign.strictPairExactEnabled),
    );
  });
});
