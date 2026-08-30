import { ProductionPromptSourceError } from "./production-source.js";

export type InjectionInfrastructureErrorCode =
  | "INJECTION_METADATA_PARITY_FAILURE";

/**
 * A pipeline invariant failure for which forwarding the original request would
 * silently change the model-visible tool contract. Callers must abort the
 * provider request instead of applying the ordinary best-effort hook policy.
 */
export class InjectionInfrastructureError extends Error {
  readonly name = "InjectionInfrastructureError";

  constructor(
    readonly code: InjectionInfrastructureErrorCode,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isInjectionInfrastructureError(
  error: unknown,
): error is InjectionInfrastructureError {
  return error instanceof InjectionInfrastructureError;
}

/** Convert formal production-provenance failures into the pipeline's fail-closed type. */
export function injectionInfrastructureErrorFromProductionSource(
  error: unknown,
): InjectionInfrastructureError | null {
  if (!(error instanceof ProductionPromptSourceError)) return null;
  return new InjectionInfrastructureError(
    "INJECTION_METADATA_PARITY_FAILURE",
    `production prompt provenance failed (${error.code}): ${error.message}`,
  );
}
