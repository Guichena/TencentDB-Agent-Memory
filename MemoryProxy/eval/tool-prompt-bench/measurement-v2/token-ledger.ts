import { createHash } from "node:crypto";

export const TOKEN_LEDGER_COMPONENTS = [
  "staticTemplate",
  "executionContract",
  "runtimeBinding",
  "dynamicAsset",
] as const;

export type TokenLedgerComponent = (typeof TOKEN_LEDGER_COMPONENTS)[number];

export interface TokenizerSeam {
  id: string;
  version: string;
  count(text: string): number;
}

export interface TokenLedgerSegment {
  component: TokenLedgerComponent;
  text: string;
}

export interface BuildTokenLedgerInput {
  variantId: string;
  runId: string;
  providerVisibleInjection: string;
  segments: readonly TokenLedgerSegment[];
  tokenizer: TokenizerSeam;
}

export interface TokenTextMeasurement {
  tokens: number;
  utf8Bytes: number;
  sha256: string;
}

export interface TokenLedger {
  schemaVersion: 2;
  measurementModuleId: "M2";
  variantId: string;
  runId: string;
  tokenizer: { id: string; version: string };
  componentTokenAccounting: "independently_encoded_non_additive";
  totalInjectionTokens: number;
  toolDescriptionStaticTokens: number;
  staticTemplateTokens: number;
  executionContractTokens: number;
  runtimeBindingTokens: number;
  dynamicAssetTokens: number;
  totalInjectionUtf8Bytes: number;
  toolDescriptionStaticUtf8Bytes: number;
  totalInjectionSha256: string;
  toolDescriptionStaticSha256: string;
  componentMeasurements: Record<TokenLedgerComponent, TokenTextMeasurement>;
  canonicalSha256: string;
}

export class TokenLedgerInfrastructureError extends Error {
  constructor(
    readonly code: "IDENTITY_INVALID" | "INVALID_TOKENIZER" | "SEGMENT_COVERAGE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "TokenLedgerInfrastructureError";
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TokenLedgerInfrastructureError("INVALID_TOKENIZER", "canonical ledger values must be finite");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TokenLedgerInfrastructureError("INVALID_TOKENIZER", `unsupported canonical ledger value: ${typeof value}`);
}

function measure(text: string, tokenizer: TokenizerSeam): TokenTextMeasurement {
  const tokens = tokenizer.count(text);
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new TokenLedgerInfrastructureError(
      "INVALID_TOKENIZER",
      `tokenizer ${tokenizer.id}@${tokenizer.version} returned an invalid token count`,
    );
  }
  return {
    tokens,
    utf8Bytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256(text),
  };
}

export function buildTokenLedger(input: BuildTokenLedgerInput): TokenLedger {
  if (
    input.runId.trim().length === 0
    || input.variantId.trim().length === 0
    || input.tokenizer.id.trim().length === 0
    || input.tokenizer.version.trim().length === 0
  ) {
    throw new TokenLedgerInfrastructureError(
      "IDENTITY_INVALID",
      "runId, variantId, tokenizer id, and tokenizer version must be non-empty",
    );
  }
  const reconstructed = input.segments.map((segment) => segment.text).join("");
  if (reconstructed !== input.providerVisibleInjection) {
    throw new TokenLedgerInfrastructureError(
      "SEGMENT_COVERAGE_MISMATCH",
      "ordered ledger segments must cover the provider-visible injection byte-for-byte",
    );
  }

  const componentText = Object.fromEntries(
    TOKEN_LEDGER_COMPONENTS.map((component) => [
      component,
      input.segments
        .filter((segment) => segment.component === component)
        .map((segment) => segment.text)
        .join(""),
    ]),
  ) as Record<TokenLedgerComponent, string>;
  const toolDescriptionStatic = input.segments
    .filter((segment) => segment.component === "staticTemplate" || segment.component === "executionContract")
    .map((segment) => segment.text)
    .join("");
  const total = measure(input.providerVisibleInjection, input.tokenizer);
  const staticDescription = measure(toolDescriptionStatic, input.tokenizer);
  const componentMeasurements = Object.fromEntries(
    TOKEN_LEDGER_COMPONENTS.map((component) => [component, measure(componentText[component], input.tokenizer)]),
  ) as Record<TokenLedgerComponent, TokenTextMeasurement>;

  const withoutCanonicalSha = {
    schemaVersion: 2 as const,
    measurementModuleId: "M2" as const,
    variantId: input.variantId,
    runId: input.runId,
    tokenizer: { id: input.tokenizer.id, version: input.tokenizer.version },
    componentTokenAccounting: "independently_encoded_non_additive" as const,
    totalInjectionTokens: total.tokens,
    toolDescriptionStaticTokens: staticDescription.tokens,
    staticTemplateTokens: componentMeasurements.staticTemplate.tokens,
    executionContractTokens: componentMeasurements.executionContract.tokens,
    runtimeBindingTokens: componentMeasurements.runtimeBinding.tokens,
    dynamicAssetTokens: componentMeasurements.dynamicAsset.tokens,
    totalInjectionUtf8Bytes: total.utf8Bytes,
    toolDescriptionStaticUtf8Bytes: staticDescription.utf8Bytes,
    totalInjectionSha256: total.sha256,
    toolDescriptionStaticSha256: staticDescription.sha256,
    componentMeasurements,
  };

  return {
    ...withoutCanonicalSha,
    canonicalSha256: sha256(canonicalJson(withoutCanonicalSha)),
  };
}
