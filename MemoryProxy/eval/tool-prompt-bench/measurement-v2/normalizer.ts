import type {
  JsonValueV2,
  NormalizedTdaiAttemptV2,
  NormalizedTraceV2,
  RawTdaiTraceAttemptV2,
  RawTraceObservationV2,
  RuntimeToolContractV2,
} from "./types.js";

function isJsonArray(value: JsonValueV2 | undefined): value is readonly JsonValueV2[] {
  return Array.isArray(value);
}

function readJsonPath(root: JsonValueV2 | undefined, path: string): JsonValueV2 | undefined {
  let current = root;
  for (const segment of path.split(".")) {
    if (isJsonArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (current && typeof current === "object") {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function matchesBaseIdentity(
  attempt: RawTdaiTraceAttemptV2,
  contract: RuntimeToolContractV2,
): boolean {
  return attempt.family === contract.family
    && attempt.tool === contract.tool
    && attempt.endpoint === contract.endpoint
    && attempt.method?.toUpperCase() === contract.method.toUpperCase();
}

function observedOperation(
  attempt: RawTdaiTraceAttemptV2,
  runtimeContracts: readonly RuntimeToolContractV2[],
): string | null {
  const operationContracts = runtimeContracts.filter((contract) => (
    matchesBaseIdentity(attempt, contract) && contract.operation.kind === "argument"
  ));
  if (attempt.operation !== undefined) {
    if (operationContracts.length === 0) return attempt.operation;
    return operationContracts.some((contract) => (
      contract.operation.kind === "argument"
      && contract.operation.value === attempt.operation
      && readJsonPath(attempt.arguments, contract.operation.path) === attempt.operation
    )) ? attempt.operation : null;
  }
  const matchingValues = operationContracts.flatMap((contract) => (
    contract.operation.kind === "argument"
    && readJsonPath(attempt.arguments, contract.operation.path) === contract.operation.value
      ? [contract.operation.value]
      : []
  ));
  const distinctValues = [...new Set(matchingValues)];
  return distinctValues.length === 1 ? distinctValues[0] : null;
}

function matchesRuntimeIdentity(
  attempt: RawTdaiTraceAttemptV2,
  contract: RuntimeToolContractV2,
): boolean {
  return matchesBaseIdentity(attempt, contract)
    && (contract.operation.kind === "none"
      ? attempt.operation === undefined
      : readJsonPath(attempt.arguments, contract.operation.path) === contract.operation.value
        && (attempt.operation === undefined || attempt.operation === contract.operation.value));
}

export function normalizeTrace(
  observation: RawTraceObservationV2,
  runtimeContracts: readonly RuntimeToolContractV2[],
): NormalizedTraceV2 {
  const executorBoundAttempts = observation.attempts
    .filter((attempt) => attempt.executorBound)
    .map((attempt, observedAttemptIndex): NormalizedTdaiAttemptV2 => {
      const operation = observedOperation(attempt, runtimeContracts);
      const matchingContracts = runtimeContracts.filter((contract) => (
        matchesRuntimeIdentity(attempt, contract)
      ));
      const acceptedContracts = matchingContracts.filter((contract) => (
        attempt.status !== undefined && contract.acceptedStatusCodes.includes(attempt.status)
      ));
      return {
        ...attempt,
        observedAttemptIndex,
        observedOperation: operation,
        matchedRuntimeContractIds: matchingContracts.map((contract) => contract.contractId),
        acceptedRuntimeContractIds: acceptedContracts.map((contract) => contract.contractId),
        runtimeAccepted: acceptedContracts.length > 0,
      };
    });

  return { observation, executorBoundAttempts };
}
