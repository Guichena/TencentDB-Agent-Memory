import type { PairedIsolationEvidence, RunIsolationEvidence } from "./isolation-evidence.js";
import type { ProviderUsageNormalizationResult } from "./provider-usage.js";
import type { TokenLedger } from "./token-ledger.js";

export interface PrepareOnlyEvidence {
  enabled: boolean;
  servicesStarted: boolean;
  codexProcessesStarted: number;
  providerRequestsIssued: number;
  authFilesRead: boolean;
  authFilesCopied: boolean;
}

export type M0EvaluationPrefixEvidence =
  | { status: "pending" }
  | {
      status: "observed";
      traceId: string;
      evaluationPrefixSha256: string;
      providerInputToEvaluationHorizon: number;
      providerInputToTerminalGivenSuccess: number | null;
      modelRoundsToTerminal: number | null;
      tdaiCallCount: number;
      timeToTerminalMs: number | null;
      terminalReached: boolean;
    };

export type M0EvaluationPrefixBlockerCode =
  | "M0_TRACE_ID_INVALID"
  | "M0_EVALUATION_PREFIX_SHA256_INVALID"
  | "M0_EVALUATION_HORIZON_COST_INVALID"
  | "M0_TERMINAL_COST_IDENTITY_INVALID"
  | "M0_MODEL_ROUNDS_INVALID"
  | "M0_TDAI_CALL_COUNT_INVALID"
  | "M0_TIME_TO_TERMINAL_INVALID";

export interface M0EvaluationPrefixGate {
  status: "pending" | "ready" | "blocked";
  blockers: M0EvaluationPrefixBlockerCode[];
}

export type M2EligibilityBlockerCode =
  | "FORMAL_DATA_BLOCKED"
  | "MOCK_LAYER_NOT_FORMAL"
  | "USAGE_NOT_COMPLETE"
  | "TOKEN_LEDGER_MODULE_MISMATCH"
  | "TOKEN_LEDGER_RUN_MISMATCH"
  | "TOKEN_LEDGER_VARIANT_MISMATCH"
  | "RUN_ISOLATION_BLOCKED"
  | "PAIRED_ISOLATION_BLOCKED"
  | "COMPARISON_PURPOSE_MISMATCH"
  | "M0_EVALUATION_PREFIX_INVALID"
  | "PREPARE_ONLY_SIDE_EFFECT";

export type M2ComparisonEvidence =
  | { purpose: "none" }
  | {
      purpose: "variant" | "counterfactual" | "repeat";
      evidence: PairedIsolationEvidence;
    };

export interface BuildM2EligibilityEvidenceInput {
  formalDataState: "blocked" | "frozen";
  evaluationLayer: "mock-contract" | "real-chain";
  usage: ProviderUsageNormalizationResult;
  tokenLedger: TokenLedger;
  runIsolation: RunIsolationEvidence;
  comparison: M2ComparisonEvidence;
  prepareOnly: PrepareOnlyEvidence;
  m0EvaluationPrefix: M0EvaluationPrefixEvidence;
}

export interface M2EligibilityEvidence {
  schemaVersion: 2;
  measurementModuleId: "M2";
  runId: string;
  variantId: string;
  formalDataState: BuildM2EligibilityEvidenceInput["formalDataState"];
  evaluationLayer: BuildM2EligibilityEvidenceInput["evaluationLayer"];
  m2EvidenceStatus: "ready_for_integration" | "blocked";
  blockers: M2EligibilityBlockerCode[];
  noModelGate: {
    status: "ready" | "blocked" | "not_applicable";
    modelRuns: number;
    codexProcessesStarted: number;
    servicesStarted: boolean;
    authFilesRead: boolean;
    authFilesCopied: boolean;
  };
  usageEvidenceSha256: string;
  tokenLedgerCanonicalSha256: string;
  comparisonPurpose: M2ComparisonEvidence["purpose"];
  m0EvaluationPrefix: M0EvaluationPrefixEvidence;
  m0EvaluationPrefixGate: M0EvaluationPrefixGate;
  integrationRequirements: [
    "M0_EVALUATION_PREFIX",
    "INTEGRATION_OWNS_FORMAL_METRIC_ELIGIBLE",
  ];
}

export function buildM2EligibilityEvidence(
  input: BuildM2EligibilityEvidenceInput,
): M2EligibilityEvidence {
  const blockers: M2EligibilityBlockerCode[] = [];
  if (input.formalDataState !== "frozen") blockers.push("FORMAL_DATA_BLOCKED");
  if (input.evaluationLayer !== "real-chain") blockers.push("MOCK_LAYER_NOT_FORMAL");
  if (!input.usage.ok || input.usage.usage?.usageCompleteForRequiredFields !== true) {
    blockers.push("USAGE_NOT_COMPLETE");
  }
  if (input.tokenLedger.measurementModuleId !== "M2") blockers.push("TOKEN_LEDGER_MODULE_MISMATCH");
  if (input.tokenLedger.runId !== input.runIsolation.runId) blockers.push("TOKEN_LEDGER_RUN_MISMATCH");
  if (input.tokenLedger.variantId !== input.runIsolation.variantId) blockers.push("TOKEN_LEDGER_VARIANT_MISMATCH");
  if (input.runIsolation.isolationStatus !== "ready") blockers.push("RUN_ISOLATION_BLOCKED");
  if (input.comparison.purpose !== "none") {
    if (input.comparison.evidence.comparisonPurpose !== input.comparison.purpose) {
      blockers.push("COMPARISON_PURPOSE_MISMATCH");
    }
    if (input.comparison.evidence.pairStatus !== "ready") blockers.push("PAIRED_ISOLATION_BLOCKED");
  }
  const m0EvaluationPrefixGate = assessM0EvaluationPrefixEvidence(input.m0EvaluationPrefix);
  if (m0EvaluationPrefixGate.status === "blocked") blockers.push("M0_EVALUATION_PREFIX_INVALID");

  const prepareOnlySideEffect = input.prepareOnly.enabled && (
    input.prepareOnly.servicesStarted
    || input.prepareOnly.codexProcessesStarted !== 0
    || input.prepareOnly.providerRequestsIssued !== 0
    || input.prepareOnly.authFilesRead
    || input.prepareOnly.authFilesCopied
  );
  if (prepareOnlySideEffect) blockers.push("PREPARE_ONLY_SIDE_EFFECT");

  return {
    schemaVersion: 2,
    measurementModuleId: "M2",
    runId: input.runIsolation.runId,
    variantId: input.runIsolation.variantId,
    formalDataState: input.formalDataState,
    evaluationLayer: input.evaluationLayer,
    m2EvidenceStatus: blockers.length === 0 ? "ready_for_integration" : "blocked",
    blockers,
    noModelGate: {
      status: input.prepareOnly.enabled
        ? (prepareOnlySideEffect ? "blocked" : "ready")
        : "not_applicable",
      modelRuns: input.prepareOnly.providerRequestsIssued,
      codexProcessesStarted: input.prepareOnly.codexProcessesStarted,
      servicesStarted: input.prepareOnly.servicesStarted,
      authFilesRead: input.prepareOnly.authFilesRead,
      authFilesCopied: input.prepareOnly.authFilesCopied,
    },
    usageEvidenceSha256: input.usage.canonicalSha256,
    tokenLedgerCanonicalSha256: input.tokenLedger.canonicalSha256,
    comparisonPurpose: input.comparison.purpose,
    m0EvaluationPrefix: input.m0EvaluationPrefix,
    m0EvaluationPrefixGate,
    integrationRequirements: [
      "M0_EVALUATION_PREFIX",
      "INTEGRATION_OWNS_FORMAL_METRIC_ELIGIBLE",
    ],
  };
}

export function assessM0EvaluationPrefixEvidence(
  evidence: M0EvaluationPrefixEvidence,
): M0EvaluationPrefixGate {
  if (evidence.status === "pending") return { status: "pending", blockers: [] };

  const blockers: M0EvaluationPrefixBlockerCode[] = [];
  const isNonNegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
  const horizonValid = isNonNegativeInteger(evidence.providerInputToEvaluationHorizon);
  if (evidence.traceId.trim().length === 0) blockers.push("M0_TRACE_ID_INVALID");
  if (!/^[0-9a-f]{64}$/.test(evidence.evaluationPrefixSha256)) {
    blockers.push("M0_EVALUATION_PREFIX_SHA256_INVALID");
  }
  if (!horizonValid) blockers.push("M0_EVALUATION_HORIZON_COST_INVALID");
  if (!isNonNegativeInteger(evidence.tdaiCallCount)) blockers.push("M0_TDAI_CALL_COUNT_INVALID");

  if (evidence.terminalReached) {
    const terminalCostValid = evidence.providerInputToTerminalGivenSuccess !== null
      && isNonNegativeInteger(evidence.providerInputToTerminalGivenSuccess)
      && horizonValid
      && evidence.providerInputToTerminalGivenSuccess >= evidence.providerInputToEvaluationHorizon;
    if (!terminalCostValid) blockers.push("M0_TERMINAL_COST_IDENTITY_INVALID");
    if (
      evidence.modelRoundsToTerminal === null
      || !Number.isSafeInteger(evidence.modelRoundsToTerminal)
      || evidence.modelRoundsToTerminal <= 0
    ) {
      blockers.push("M0_MODEL_ROUNDS_INVALID");
    }
    if (evidence.timeToTerminalMs === null || !isNonNegativeInteger(evidence.timeToTerminalMs)) {
      blockers.push("M0_TIME_TO_TERMINAL_INVALID");
    }
  } else {
    if (evidence.providerInputToTerminalGivenSuccess !== null) {
      blockers.push("M0_TERMINAL_COST_IDENTITY_INVALID");
    }
    if (evidence.modelRoundsToTerminal !== null) blockers.push("M0_MODEL_ROUNDS_INVALID");
    if (evidence.timeToTerminalMs !== null) blockers.push("M0_TIME_TO_TERMINAL_INVALID");
  }

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
  };
}
