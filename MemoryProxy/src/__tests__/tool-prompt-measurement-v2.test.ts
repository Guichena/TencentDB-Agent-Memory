import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AnthropicAdapter } from "../injection/adapters/anthropic.js";
import { ClaudeCodeProfile } from "../injection/agents/claude-code/index.js";
import { InjectionPipeline } from "../injection/pipeline.js";
import { ProductionPromptSourceError } from "../injection/production-source.js";
import { HookRegistryImpl } from "../injection/registry.js";
import { renderSkillToolsBlock } from "../injection/injectors/skill-tools-injector.js";
import { renderTdaiMemoryToolsBlock } from "../injection/injectors/tdai-tools-injector.js";
import {
  buildCapabilitySignature,
  compileToolPrompt,
} from "../injection/tool-prompt/index.js";
import {
  assessM0EvaluationBoundaryFacts,
  assessM2EvaluationHorizonUsageEvidence,
  assessPairedIsolationEvidence,
  accumulateRequestUsageToM0Horizon,
  buildM2EligibilityEvidence,
  buildRequestUsageLedger,
  buildFrozenCaptureSourceManifest,
  buildRunIsolationEvidence,
  buildTokenLedger,
  buildTrustedTokenSourceManifest,
  canonicalJsonClone,
  canonicalSha256,
  normalizeProviderUsage,
  TOKEN_CLASSIFICATION_CONTRACT,
} from "../../eval/tool-prompt-bench/measurement-v2/index.js";

const TOKEN_CLASSIFICATION_INPUT = {
  contractVersion: TOKEN_CLASSIFICATION_CONTRACT.contractVersion,
  contractSha256: TOKEN_CLASSIFICATION_CONTRACT.contractSha256,
  compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
  segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
};

function tokenSourceSegment(
  order: number,
  sourceId: string,
  sourceKind:
    | "legacy-body"
    | "policy"
    | "execution-grammar"
    | "tool-card"
    | "dynamic-assets"
    | "runtime-binding",
  text: string,
) {
  return {
    order,
    sourceId,
    sourceKind,
    sourceSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    text,
  };
}

function trustedTokenSources(
  sources: readonly ReturnType<typeof tokenSourceSegment>[],
) {
  const compiledBlockId = "synthetic-compiled-block";
  const captureBlockId = "synthetic-capture-block";
  const compiledUnits = sources
    .filter((source) => source.sourceKind !== "runtime-binding" && source.sourceKind !== "dynamic-assets")
    .map((source) => ({
      id: source.sourceId,
      family: "memory" as const,
      kind: source.sourceKind as "legacy-body" | "policy" | "execution-grammar" | "tool-card",
      content: source.text,
      sourceSpecIds: [] as const,
    }));
  const compiledContent = compiledUnits.map((unit) => unit.content).join("");
  const captureManifest = buildFrozenCaptureSourceManifest({
    segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
    sources: sources
      .filter((source) => (
        source.sourceKind === "dynamic-assets" || source.sourceKind === "runtime-binding"
      ))
      .map((source) => ({
        provenance: source.sourceKind === "dynamic-assets"
          ? "frozen-capture-dynamic-asset" as const
          : "frozen-capture-runtime-binding" as const,
      injectionBlockId: captureBlockId,
      sourceId: source.sourceId,
      sourceSha256: source.sourceSha256,
      })),
  });
  const providerOrder = sources.map((source) => {
    if (source.sourceKind === "runtime-binding") {
      return {
        provenance: "frozen-capture-runtime-binding" as const,
        injectionBlockId: captureBlockId,
        sourceId: source.sourceId,
      };
    }
    if (source.sourceKind === "dynamic-assets") {
      return {
        provenance: "frozen-capture-dynamic-asset" as const,
        injectionBlockId: captureBlockId,
        sourceId: source.sourceId,
      };
    }
    return {
      provenance: "compiled-tool-prompt-unit" as const,
      injectionBlockId: compiledBlockId,
      unitId: source.sourceId,
    };
  });
  const sourceManifest = buildTrustedTokenSourceManifest({
    compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
    segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
    compiledPromptBundles: compiledUnits.length === 0 ? [] : [{
      injectionBlockId: compiledBlockId,
      compiledPrompt: {
        compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
        profile: "protocol-compact",
        profileLineage: ["legacy", "contract-corrected", "protocol-compact"],
        family: "memory",
        surface: "memory-tools",
        capabilitySignature: "synthetic",
        content: compiledContent,
        contentSha256: createHash("sha256").update(compiledContent).digest("hex"),
        units: compiledUnits,
        contractIds: [],
        specIds: [],
      },
    }],
    captureManifest,
    providerOrder,
  });
  return {
    sourceManifest,
    expectedSourceAttestation: {
      authority: "synthetic-self-built" as const,
      sourceManifestSha256: sourceManifest.canonicalSha256,
    },
    segments: sources.map((source, index) => ({
      order: source.order,
      sourceId: sourceManifest.orderedSources[index].sourceId,
      sourceSha256: source.sourceSha256,
      text: source.text,
    })),
  };
}

const EVIDENCE_SHA = {
  caseInput: "1".repeat(64),
  caseInputB: "8".repeat(64),
  comparisonGroup: "2".repeat(64),
  providerRequestA: "3".repeat(64),
  providerRequestB: "4".repeat(64),
  snapshot: "5".repeat(64),
  visibleAssets: "6".repeat(64),
  staticPromptA: "7".repeat(64),
  staticPromptB: "9".repeat(64),
} as const;

describe("Task 1 measurement v2 canonical JSON", () => {
  it("rejects non-JSON runtime shapes instead of hashing collisions", () => {
    class RuntimeShape {
      value = 1;
    }
    const invalidValues: unknown[] = [
      Array(1),
      new Date("2026-08-30T00:00:00.000Z"),
      new Map([["value", 1]]),
      new Set([1]),
      new RuntimeShape(),
      undefined,
      () => 1,
      Symbol("value"),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      { nested: undefined },
    ];

    for (const value of invalidValues) {
      expect(() => canonicalSha256(value)).toThrowError(/canonical JSON/i);
    }
    expect(canonicalSha256([])).not.toBe(canonicalSha256([null]));
    expect(canonicalSha256({})).not.toBe(canonicalSha256({ value: null }));
  });

  it("preserves reserved own record keys without prototype setter collisions", () => {
    const reserved = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of [
      ["__proto__", { marker: "proto-value" }],
      ["constructor", { marker: "constructor-value" }],
      ["prototype", { marker: "prototype-value" }],
    ] as const) {
      Object.defineProperty(reserved, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      });
    }

    const clone = canonicalJsonClone(reserved) as Record<string, unknown>;
    expect(Object.getPrototypeOf(clone)).toBeNull();
    expect(Object.keys(clone)).toEqual(["__proto__", "constructor", "prototype"]);
    expect(clone.__proto__).toEqual({ marker: "proto-value" });
    expect(clone.constructor).toEqual({ marker: "constructor-value" });
    expect(clone.prototype).toEqual({ marker: "prototype-value" });
    expect(canonicalSha256(reserved)).not.toBe(canonicalSha256({
      constructor: { marker: "constructor-value" },
      prototype: { marker: "prototype-value" },
    }));
  });
});

describe("Task 1 measurement v2 provider usage", () => {
  it("normalizes OpenAI Responses usage without adding cached input twice", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: [
        "providerTotalInputTokens",
        "ordinaryInputTokens",
        "cacheReadInputTokens",
        "outputTokens",
      ],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens: 12,
        output_tokens_details: { reasoning_tokens: 3 },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      usage: {
        providerTotalInputTokens: 100,
        ordinaryInputTokens: 60,
        cacheReadInputTokens: 40,
        cacheWriteInputTokens: null,
        outputTokens: 12,
        reasoningOrThinkingTokens: 3,
        usageCompleteForRequiredFields: true,
        unsupportedOptionalFields: ["cacheWriteInputTokens"],
      },
    });
  });

  it("normalizes an explicitly reported OpenAI Responses cache-write bucket", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v2-cache-write",
      requiredFields: [
        "providerTotalInputTokens",
        "ordinaryInputTokens",
        "cacheReadInputTokens",
        "cacheWriteInputTokens",
      ],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: 100,
        input_tokens_details: {
          cached_tokens: 40,
          cache_write_tokens: 10,
        },
        output_tokens: 12,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      fieldStates: { cacheWriteInputTokens: "reported" },
      usage: {
        providerTotalInputTokens: 100,
        ordinaryInputTokens: 50,
        cacheReadInputTokens: 40,
        cacheWriteInputTokens: 10,
      },
    });
  });

  it("marks an absent Responses cache-write field missing when the frozen adapter supports it", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v2-cache-write",
      requiredFields: ["outputTokens"],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      fieldStates: { cacheWriteInputTokens: "missing" },
      usage: {
        cacheWriteInputTokens: null,
        unsupportedOptionalFields: [],
      },
    });
  });

  it("fails closed when raw usage reports a field frozen as unsupported", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["outputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 2 },
        output_tokens: 2,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      usage: null,
      fieldStates: { cacheWriteInputTokens: "invalid" },
      errors: [expect.objectContaining({
        code: "UNSUPPORTED_USAGE_FIELD_REPORTED",
        field: "cacheWriteInputTokens",
      })],
    });
  });

  it("binds normalized usage evidence to the frozen adapter contract, not only raw usage", () => {
    const base = {
      provider: "openai" as const,
      schema: "openai.responses" as const,
      apiVersion: "2026-08-01",
      requiredFields: ["outputTokens"] as const,
      unsupportedFields: ["cacheWriteInputTokens"] as const,
      rawUsage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    };
    const first = normalizeProviderUsage({ ...base, adapterVersion: "responses-v1" });
    const second = normalizeProviderUsage({ ...base, adapterVersion: "responses-v1.1" });

    expect(first.rawUsageSha256).toBe(second.rawUsageSha256);
    expect(first.canonicalSha256).not.toBe(second.canonicalSha256);
  });

  it("retains a detached canonical raw-usage clone without polluting normalized usage", () => {
    const rawUsage = {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 4 },
      output_tokens: 2,
    };
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["providerTotalInputTokens", "cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage,
    });

    rawUsage.input_tokens = 999;
    rawUsage.input_tokens_details.cached_tokens = 999;

    expect(result.rawUsageCanonicalClone).toEqual({
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 4 },
      output_tokens: 2,
    });
    expect(Object.isFrozen(result.rawUsageCanonicalClone)).toBe(true);
    expect(Object.isFrozen(
      (result.rawUsageCanonicalClone as Record<string, unknown>).input_tokens_details,
    )).toBe(true);
    expect(result.rawUsageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.usage).not.toHaveProperty("input_tokens");
    expect(result.usage).not.toHaveProperty("rawUsage");
  });

  it("normalizes Anthropic Messages usage where input_tokens excludes cache buckets", () => {
    const result = normalizeProviderUsage({
      provider: "anthropic",
      schema: "anthropic.messages",
      apiVersion: "2023-06-01",
      adapterVersion: "messages-v1",
      requiredFields: [
        "providerTotalInputTokens",
        "ordinaryInputTokens",
        "cacheReadInputTokens",
        "cacheWriteInputTokens",
        "outputTokens",
      ],
      unsupportedFields: ["reasoningOrThinkingTokens"],
      rawUsage: {
        input_tokens: 60,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 10,
        output_tokens: 8,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      usage: {
        providerTotalInputTokens: 100,
        ordinaryInputTokens: 60,
        cacheReadInputTokens: 30,
        cacheWriteInputTokens: 10,
        outputTokens: 8,
        reasoningOrThinkingTokens: null,
        unsupportedOptionalFields: ["reasoningOrThinkingTokens"],
      },
    });
  });

  it("normalizes OpenAI Chat Completions usage with explicit unsupported cache writes", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.chat-completions",
      apiVersion: "2026-08-01",
      adapterVersion: "chat-v1",
      requiredFields: [
        "providerTotalInputTokens",
        "ordinaryInputTokens",
        "cacheReadInputTokens",
        "outputTokens",
      ],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        prompt_tokens: 90,
        prompt_tokens_details: { cached_tokens: 20 },
        completion_tokens: 11,
        completion_tokens_details: { reasoning_tokens: 4 },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      usage: {
        providerTotalInputTokens: 90,
        ordinaryInputTokens: 70,
        cacheReadInputTokens: 20,
        cacheWriteInputTokens: null,
        outputTokens: 11,
        reasoningOrThinkingTokens: 4,
        unsupportedOptionalFields: ["cacheWriteInputTokens"],
      },
    });
  });

  it("normalizes Codex JSONL cache read/write buckets without double counting", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.codex-jsonl",
      apiVersion: "codex-jsonl-v1",
      adapterVersion: "codex-runner-v1",
      requiredFields: [
        "providerTotalInputTokens",
        "ordinaryInputTokens",
        "cacheReadInputTokens",
        "cacheWriteInputTokens",
        "outputTokens",
        "reasoningOrThinkingTokens",
      ],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: 120,
        cached_input_tokens: 50,
        cache_write_input_tokens: 10,
        output_tokens: 20,
        reasoning_output_tokens: 7,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      usage: {
        providerTotalInputTokens: 120,
        ordinaryInputTokens: 60,
        cacheReadInputTokens: 50,
        cacheWriteInputTokens: 10,
        outputTokens: 20,
        reasoningOrThinkingTokens: 7,
      },
    });
  });

  it("fails closed when cache buckets or reasoning tokens violate provider identities", () => {
    const cacheMismatch = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.codex-jsonl",
      apiVersion: "codex-jsonl-v1",
      adapterVersion: "codex-runner-v1",
      requiredFields: ["providerTotalInputTokens"],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: 20,
        cached_input_tokens: 15,
        cache_write_input_tokens: 8,
        output_tokens: 5,
        reasoning_output_tokens: 2,
      },
    });
    const reasoningMismatch = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["outputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 3,
        output_tokens_details: { reasoning_tokens: 4 },
      },
    });

    for (const result of [cacheMismatch, reasoningMismatch]) {
      expect(result.ok).toBe(false);
      expect(result.usage).toBeNull();
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "USAGE_IDENTITY_MISMATCH" }),
      ]));
    }
  });

  it("keeps missing and unsupported distinct from zero and fails required fields closed", () => {
    const base = {
      provider: "openai" as const,
      schema: "openai.responses" as const,
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      unsupportedFields: ["cacheWriteInputTokens"] as const,
      rawUsage: { input_tokens: 10, output_tokens: 2 },
    };
    const missingRequired = normalizeProviderUsage({
      ...base,
      requiredFields: ["cacheReadInputTokens"],
    });
    const unsupportedRequired = normalizeProviderUsage({
      ...base,
      requiredFields: ["cacheWriteInputTokens"],
    });
    const optionalOnly = normalizeProviderUsage({
      ...base,
      requiredFields: ["outputTokens"],
    });

    expect(missingRequired).toMatchObject({
      ok: false,
      usage: null,
      fieldStates: { cacheReadInputTokens: "missing" },
      errors: [expect.objectContaining({
        code: "REQUIRED_USAGE_MISSING",
        field: "cacheReadInputTokens",
      })],
    });
    expect(unsupportedRequired).toMatchObject({
      ok: false,
      usage: null,
      fieldStates: { cacheWriteInputTokens: "unsupported" },
      errors: [expect.objectContaining({
        code: "REQUIRED_USAGE_MISSING",
        field: "cacheWriteInputTokens",
      })],
    });
    expect(optionalOnly).toMatchObject({
      ok: true,
      fieldStates: {
        cacheReadInputTokens: "missing",
        cacheWriteInputTokens: "unsupported",
      },
      usage: {
        cacheReadInputTokens: null,
        cacheWriteInputTokens: null,
        ordinaryInputTokens: null,
        unsupportedOptionalFields: ["cacheWriteInputTokens"],
      },
    });
  });

  it("fails closed instead of throwing when the provider usage payload is absent", () => {
    const result = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["providerTotalInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.usage).toBeNull();
    expect(result.fieldStates.providerTotalInputTokens).toBe("missing");
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "REQUIRED_USAGE_MISSING",
      field: "providerTotalInputTokens",
    }));
    expect(result).toMatchObject({
      rawUsageCanonicalizationStatus: "blocked",
      rawUsageCanonicalClone: null,
      rawUsageSha256: null,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "RAW_USAGE_NOT_CANONICAL_JSON" }),
      ]),
    });
  });

  it("rejects invalid numeric values and provider/schema mismatches", () => {
    const invalid = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.codex-jsonl",
      apiVersion: "codex-jsonl-v1",
      adapterVersion: "codex-runner-v1",
      requiredFields: ["providerTotalInputTokens", "outputTokens"],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: -1,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: Number.NaN,
        reasoning_output_tokens: 0,
      },
    });
    const mismatch = normalizeProviderUsage({
      provider: "anthropic",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "wrong-provider",
      requiredFields: [],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {},
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.usage).toBeNull();
    expect(invalid.errors.filter((error) => error.code === "INVALID_USAGE_VALUE")).toHaveLength(2);
    expect(invalid.fieldStates).toMatchObject({
      providerTotalInputTokens: "invalid",
      outputTokens: "invalid",
    });
    expect(invalid).toMatchObject({
      rawUsageCanonicalizationStatus: "blocked",
      rawUsageCanonicalClone: null,
      rawUsageSha256: null,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "RAW_USAGE_NOT_CANONICAL_JSON" }),
      ]),
    });
    expect(mismatch).toMatchObject({
      ok: false,
      usage: null,
      errors: [expect.objectContaining({ code: "PROVIDER_SCHEMA_MISMATCH" })],
    });
  });
});

describe("Task 1 measurement v2 token ledger", () => {
  it("encodes the complete injection and each diagnostic component independently", () => {
    const text = "STATIC\nCONTRACT\nsession-1\nASSET";
    const ledger = buildTokenLedger({
      variantId: "V0",
      runId: "synthetic-run-1",
      providerVisibleInjection: text,
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trustedTokenSources([
        tokenSourceSegment(0, "memory-guide.policy", "policy", "STATIC\n"),
        tokenSourceSegment(1, "shared.execution-grammar", "execution-grammar", "CONTRACT\n"),
        tokenSourceSegment(2, "memory-tools.legacy-body#binding-0", "runtime-binding", "session-1\n"),
        tokenSourceSegment(3, "skill-listing.dynamic-assets", "dynamic-assets", "ASSET"),
      ]),
      tokenizer: {
        id: "synthetic-single-span",
        version: "1",
        count: (value) => value.length === 0 ? 0 : 1,
      },
    });

    expect(ledger).toMatchObject({
      schemaVersion: 2,
      measurementModuleId: "M2",
      variantId: "V0",
      runId: "synthetic-run-1",
      tokenizer: { id: "synthetic-single-span", version: "1" },
      classification: {
        compilerVersion: "c05.1",
        sourceKindToComponent: {
          "legacy-body": "staticTemplate",
          policy: "staticTemplate",
          "execution-grammar": "executionContract",
          "tool-card": "staticTemplate",
          "dynamic-assets": "dynamicAsset",
          "runtime-binding": "runtimeBinding",
        },
        orderedSources: [
          { order: 0, sourceLocalId: "memory-guide.policy", sourceKind: "policy" },
          { order: 1, sourceLocalId: "shared.execution-grammar", sourceKind: "execution-grammar" },
          { order: 2, sourceLocalId: "memory-tools.legacy-body#binding-0", sourceKind: "runtime-binding" },
          { order: 3, sourceLocalId: "skill-listing.dynamic-assets", sourceKind: "dynamic-assets" },
        ],
        formalCompilerClosure: {
          status: "blocked",
          blocker: "SELF_BUILT_SOURCE_ATTESTATION_NOT_FORMAL",
          owner: "Integration",
        },
      },
      componentTokenAccounting: "independently_encoded_non_additive",
      totalInjectionTokens: 1,
      toolDescriptionStaticTokens: 1,
      staticTemplateTokens: 1,
      executionContractTokens: 1,
      runtimeBindingTokens: 1,
      dynamicAssetTokens: 1,
      totalInjectionUtf8Bytes: Buffer.byteLength(text, "utf8"),
    });
    expect(ledger.totalInjectionTokens).not.toBe(
      ledger.staticTemplateTokens
        + ledger.executionContractTokens
        + ledger.runtimeBindingTokens
        + ledger.dynamicAssetTokens,
    );
  });

  it("keeps the static description stable when only runtime assets change and hashes deterministically", () => {
    const tokenizer = {
      id: "synthetic-utf8-bytes",
      version: "1",
      count: (value: string) => Buffer.byteLength(value, "utf8"),
    };
    const build = (asset: string) => {
      const sources = [
        tokenSourceSegment(0, "skill-tools.legacy-body#static-0", "legacy-body", "RULE\n"),
        tokenSourceSegment(1, "skill-tools.legacy-body#binding-0", "runtime-binding", "session-1\n"),
        tokenSourceSegment(2, "skill-listing.dynamic-assets", "dynamic-assets", asset),
      ];
      return buildTokenLedger({
        variantId: "V1",
        runId: "synthetic-run-2",
        providerVisibleInjection: `RULE\nsession-1\n${asset}`,
        classification: TOKEN_CLASSIFICATION_INPUT,
        ...trustedTokenSources(sources),
        tokenizer,
      });
    };

    const first = build("ASSET-A");
    const repeated = build("ASSET-A");
    const changedAsset = build("ASSET-B-LONGER");

    expect(repeated).toEqual(first);
    expect(repeated.canonicalSha256).toBe(first.canonicalSha256);
    expect(changedAsset.totalInjectionSha256).not.toBe(first.totalInjectionSha256);
    expect(changedAsset.dynamicAssetTokens).not.toBe(first.dynamicAssetTokens);
    expect(changedAsset.toolDescriptionStaticTokens).toBe(first.toolDescriptionStaticTokens);
    expect(changedAsset.toolDescriptionStaticSha256).toBe(first.toolDescriptionStaticSha256);
  });

  it("fails closed when segments do not cover the injection or the tokenizer is invalid", () => {
    const sources = [tokenSourceSegment(0, "memory-tools.legacy-body", "legacy-body", "A")];
    const input = {
      variantId: "V2",
      runId: "synthetic-invalid",
      providerVisibleInjection: "AB",
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trustedTokenSources(sources),
      tokenizer: { id: "synthetic", version: "1", count: () => 1 },
    };

    expect(() => buildTokenLedger(input)).toThrowError(expect.objectContaining({
      code: "SEGMENT_COVERAGE_MISMATCH",
    }));
    expect(() => buildTokenLedger({
      ...input,
      providerVisibleInjection: "A",
      tokenizer: { id: "broken", version: "1", count: () => Number.NaN },
    })).toThrowError(expect.objectContaining({ code: "INVALID_TOKENIZER" }));
  });

  it("rejects untrusted, incomplete, duplicate, reordered, or rehashed classification sources", () => {
    const tokenizer = { id: "synthetic", version: "1", count: (text: string) => text.length };
    const sources = [
      tokenSourceSegment(0, "memory-guide.policy", "policy", "A"),
      tokenSourceSegment(1, "shared.execution-grammar", "execution-grammar", "B"),
    ];
    const trusted = trustedTokenSources(sources);
    const build = (overrides: Record<string, unknown>) => buildTokenLedger({
      variantId: "V2",
      runId: "classification-invalid",
      providerVisibleInjection: "AB",
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trusted,
      tokenizer,
      ...overrides,
    });

    expect(() => build({
      classification: { ...TOKEN_CLASSIFICATION_INPUT, contractSha256: "0".repeat(64) },
    })).toThrowError(expect.objectContaining({ code: "CLASSIFICATION_CONTRACT_MISMATCH" }));
    expect(() => build({
      segments: trusted.segments.slice(0, 1),
    })).toThrowError(expect.objectContaining({ code: "CLASSIFICATION_SEGMENT_MISSING" }));
    expect(() => build({
      segments: [trusted.segments[1], trusted.segments[0]],
    })).toThrowError(expect.objectContaining({ code: "CLASSIFICATION_SOURCE_REORDERED" }));
    expect(() => build({
      segments: [
        trusted.segments[0],
        { ...trusted.segments[1], text: "C" },
      ],
    })).toThrowError(expect.objectContaining({ code: "CLASSIFICATION_SOURCE_HASH_MISMATCH" }));
    expect(() => build({ providerVisibleInjection: "ABC" })).toThrowError(expect.objectContaining({
      code: "SEGMENT_COVERAGE_MISMATCH",
    }));

    const compiledPrompt = (units: Array<{
      id: string;
      family: "memory";
      kind: "policy" | "tool-card";
      content: string;
      sourceSpecIds: never[];
    }>) => {
      const content = units.map((unit) => unit.content).join("");
      return {
        compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
        profile: "protocol-compact" as const,
        profileLineage: ["legacy", "contract-corrected", "protocol-compact"] as const,
        family: "memory" as const,
        surface: "memory-tools" as const,
        capabilitySignature: "synthetic",
        content,
        contentSha256: createHash("sha256").update(content).digest("hex"),
        units,
        contractIds: [] as const,
        specIds: [] as const,
      };
    };
    const unknownPrompt = compiledPrompt([{
      id: "unknown",
      family: "memory",
      kind: "policy",
      content: "A",
      sourceSpecIds: [],
    }]);
    unknownPrompt.units[0].kind = "caller-component" as never;
    expect(() => buildTrustedTokenSourceManifest({
      compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      compiledPromptBundles: [{ injectionBlockId: "unknown-block", compiledPrompt: unknownPrompt }],
      captureManifest: buildFrozenCaptureSourceManifest({
        segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
        sources: [],
      }),
      providerOrder: [{
        provenance: "compiled-tool-prompt-unit",
        injectionBlockId: "unknown-block",
        unitId: "unknown",
      }],
    })).toThrowError(expect.objectContaining({ code: "CLASSIFICATION_SOURCE_UNKNOWN" }));
    const duplicatePrompt = compiledPrompt([
      { id: "duplicate", family: "memory", kind: "policy", content: "A", sourceSpecIds: [] },
      { id: "duplicate", family: "memory", kind: "tool-card", content: "B", sourceSpecIds: [] },
    ]);
    expect(() => buildTrustedTokenSourceManifest({
      compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      compiledPromptBundles: [{ injectionBlockId: "duplicate-block", compiledPrompt: duplicatePrompt }],
      captureManifest: buildFrozenCaptureSourceManifest({
        segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
        sources: [],
      }),
      providerOrder: [
        {
          provenance: "compiled-tool-prompt-unit",
          injectionBlockId: "duplicate-block",
          unitId: "duplicate",
        },
        {
          provenance: "compiled-tool-prompt-unit",
          injectionBlockId: "duplicate-block",
          unitId: "duplicate",
        },
      ],
    })).toThrowError(expect.objectContaining({ code: "CLASSIFICATION_SOURCE_DUPLICATE" }));
  });

  it("binds kind and bytes to a trusted ordered source manifest", () => {
    const shared = tokenSourceSegment(0, "memory-guide.policy", "policy", "STATIC");
    const trusted = trustedTokenSources([shared]);
    const build = (overrides: Record<string, unknown> = {}) => buildTokenLedger({
      variantId: "V0",
      runId: "classification-relabel",
      providerVisibleInjection: "STATIC",
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trusted,
      tokenizer: { id: "synthetic", version: "1", count: (text: string) => text.length },
      ...overrides,
    });

    expect(build().staticTemplateTokens).toBe(6);
    expect(() => build({
      segments: [{ ...trusted.segments[0], sourceKind: "dynamic-assets" }],
    })).toThrowError(expect.objectContaining({
      code: "CLASSIFICATION_SOURCE_MANIFEST_MISMATCH",
    }));
    expect(() => build({
      sourceManifest: {
        ...trusted.sourceManifest,
        orderedSources: [{
          ...trusted.sourceManifest.orderedSources[0],
          sourceKind: "dynamic-assets",
        }],
      },
    })).toThrowError(expect.objectContaining({
      code: "CLASSIFICATION_MANIFEST_HASH_MISMATCH",
    }));
    expect(() => build({
      segments: [{ ...trusted.segments[0], text: "TAMPER" }],
    })).toThrowError(expect.objectContaining({
      code: "CLASSIFICATION_SOURCE_HASH_MISMATCH",
    }));
  });

  it("requires a campaign-owned expected source attestation", () => {
    const trusted = trustedTokenSources([
      tokenSourceSegment(0, "memory-guide.policy", "policy", "STATIC"),
    ]);
    expect(() => buildTokenLedger({
      variantId: "V0",
      runId: "missing-source-attestation",
      providerVisibleInjection: "STATIC",
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trusted,
      expectedSourceAttestation: undefined,
      tokenizer: { id: "synthetic", version: "1", count: (text: string) => text.length },
    } as never)).toThrowError(expect.objectContaining({
      code: "EXPECTED_SOURCE_ATTESTATION_MISSING",
    }));
  });

  it("binds capture provenance to one frozen source-manifest identity", () => {
    const text = "ASSET";
    const sourceSha256 = createHash("sha256").update(text).digest("hex");
    const captureManifest = buildFrozenCaptureSourceManifest({
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      sources: [{
        provenance: "frozen-capture-dynamic-asset",
        injectionBlockId: "skill-listing-block",
        sourceId: "skill-listing.dynamic-assets",
        sourceSha256,
      }],
    });
    const buildManifest = (
      frozenCaptureManifest: typeof captureManifest,
      provenance: "frozen-capture-dynamic-asset" | "frozen-capture-runtime-binding",
    ) => buildTrustedTokenSourceManifest({
      compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      compiledPromptBundles: [],
      captureManifest: frozenCaptureManifest,
      providerOrder: [{
        provenance,
        injectionBlockId: "skill-listing-block",
        sourceId: "skill-listing.dynamic-assets",
      }],
    });
    const sourceManifest = buildManifest(captureManifest, "frozen-capture-dynamic-asset");
    const expectedSourceAttestation = {
      authority: "campaign-integration" as const,
      sourceManifestSha256: sourceManifest.canonicalSha256,
    };
    const buildLedger = (
      manifest: typeof sourceManifest,
      expected = expectedSourceAttestation,
      segmentText = text,
    ) => buildTokenLedger({
      variantId: "V0",
      runId: "capture-provenance-root",
      providerVisibleInjection: segmentText,
      classification: TOKEN_CLASSIFICATION_INPUT,
      sourceManifest: manifest,
      expectedSourceAttestation: expected,
      segments: [{
        order: 0,
        sourceId: manifest.orderedSources[0].sourceId,
        sourceSha256: createHash("sha256").update(segmentText).digest("hex"),
        text: segmentText,
      }],
      tokenizer: { id: "synthetic", version: "1", count: (value) => value.length },
    });

    expect(buildLedger(sourceManifest).dynamicAssetTokens).toBe(text.length);
    expect(() => buildLedger(sourceManifest, {
      ...expectedSourceAttestation,
      sourceManifestSha256: "f".repeat(64),
    })).toThrowError(expect.objectContaining({ code: "EXPECTED_SOURCE_MANIFEST_MISMATCH" }));

    const relabeledCaptureManifest = buildFrozenCaptureSourceManifest({
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      sources: [{
        provenance: "frozen-capture-runtime-binding",
        injectionBlockId: "skill-listing-block",
        sourceId: "skill-listing.dynamic-assets",
        sourceSha256,
      }],
    });
    const relabeledSourceManifest = buildManifest(
      relabeledCaptureManifest,
      "frozen-capture-runtime-binding",
    );
    expect(() => buildLedger(relabeledSourceManifest)).toThrowError(expect.objectContaining({
      code: "EXPECTED_SOURCE_MANIFEST_MISMATCH",
    }));

    const changedText = "ASSET-CHANGED";
    const recomputedCaptureManifest = buildFrozenCaptureSourceManifest({
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      sources: [{
        provenance: "frozen-capture-dynamic-asset",
        injectionBlockId: "skill-listing-block",
        sourceId: "skill-listing.dynamic-assets",
        sourceSha256: createHash("sha256").update(changedText).digest("hex"),
      }],
    });
    const recomputedSourceManifest = buildManifest(
      recomputedCaptureManifest,
      "frozen-capture-dynamic-asset",
    );
    expect(() => buildLedger(
      recomputedSourceManifest,
      expectedSourceAttestation,
      changedText,
    )).toThrowError(expect.objectContaining({ code: "EXPECTED_SOURCE_MANIFEST_MISMATCH" }));
  });

  it("qualifies repeated compiler unit ids across real prompt surfaces", () => {
    const signature = (memory: boolean, skill: boolean) => buildCapabilitySignature({
      memory,
      skill,
      knowledge: false,
      wiki: false,
      codeGraph: false,
      skillWrite: false,
      skillExtract: false,
    });
    const memory = compileToolPrompt({
      profile: "protocol-compact",
      family: "memory",
      surface: "memory-tools",
      legacyUnits: [{
        id: "memory-tools.legacy-body",
        kind: "legacy-body",
        content: renderTdaiMemoryToolsBlock(
          "http://127.0.0.1:8096",
          "session-parity",
          "space-parity",
        ),
      }],
      capabilitySignature: signature(true, false),
    });
    const skill = compileToolPrompt({
      profile: "protocol-compact",
      family: "skill",
      surface: "skill-tools",
      legacyUnits: [{
        id: "skill-tools.legacy-body",
        kind: "legacy-body",
        content: renderSkillToolsBlock(
          "http://127.0.0.1:8096",
          false,
          "session-parity",
          "space-parity",
        ),
      }],
      capabilitySignature: signature(false, true),
    });
    expect(memory.units.find((unit) => unit.id === "shared.execution-grammar"))
      .toMatchObject({ family: "memory", kind: "execution-grammar" });
    expect(skill.units.find((unit) => unit.id === "shared.execution-grammar"))
      .toMatchObject({ family: "skill", kind: "execution-grammar" });
    const compiledPromptBundles = [
      { injectionBlockId: "memory-block", compiledPrompt: memory },
      { injectionBlockId: "skill-block", compiledPrompt: skill },
    ] as const;
    const providerOrder = compiledPromptBundles.flatMap((bundle) => (
      bundle.compiledPrompt.units.map((unit) => ({
        provenance: "compiled-tool-prompt-unit" as const,
        injectionBlockId: bundle.injectionBlockId,
        unitId: unit.id,
      }))
    ));
    const manifest = buildTrustedTokenSourceManifest({
      compilerVersion: TOKEN_CLASSIFICATION_CONTRACT.compilerVersion,
      segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
      compiledPromptBundles,
      captureManifest: buildFrozenCaptureSourceManifest({
        segmenterVersion: TOKEN_CLASSIFICATION_CONTRACT.segmenterVersion,
        sources: [],
      }),
      providerOrder,
    });
    expect(manifest.orderedSources.filter((source) => (
      source.sourceLocalId === "shared.execution-grammar"
    ))).toMatchObject([
      {
        injectionBlockId: "memory-block",
        compilerFamily: "memory",
        compilerSurface: "memory-tools",
        sourceKind: "execution-grammar",
      },
      {
        injectionBlockId: "skill-block",
        compilerFamily: "skill",
        compilerSurface: "skill-tools",
        sourceKind: "execution-grammar",
      },
    ]);
  });
});

describe("Task 1 measurement v2 request and phase usage ledger", () => {
  const usage = (inputTokens: number, cachedTokens = 0) => normalizeProviderUsage({
    provider: "openai",
    schema: "openai.responses",
    apiVersion: "2026-08-01",
    adapterVersion: "responses-v1",
    requiredFields: [
      "providerTotalInputTokens",
      "ordinaryInputTokens",
      "cacheReadInputTokens",
      "outputTokens",
    ],
    unsupportedFields: ["cacheWriteInputTokens"],
    rawUsage: {
      input_tokens: inputTokens,
      input_tokens_details: { cached_tokens: cachedTokens },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 2 },
    },
  });
  const request = (
    ordinal: number,
    requestId: string,
    phaseId: string,
    requestUsage = usage(10),
  ) => ({
    runId: "ledger-run",
    traceId: "ledger-trace",
    requestId,
    observedAttemptIds: [`attempt-${ordinal}`],
    requestOrdinal: ordinal,
    phaseId,
    component: "task_model" as const,
    phaseType: ordinal === 0 ? "initial" as const : "followup" as const,
    promptSha256: String(ordinal + 1).repeat(64),
    providerToolDefinitionCount: 3,
    injectionTokensO200k: 7,
    discoveryResultTokens: null,
    toolResultContextTokens: null,
    latencyMs: 25,
    usage: requestUsage,
  });
  const boundary = (
    requestId: string,
    attemptId: string,
    phaseId: string,
  ) => ({
    traceId: "ledger-trace",
    requestId,
    attemptId,
    phaseId,
  });

  it("accepts a real provider request with no observed TDAI attempts", () => {
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [{
        ...request(0, "request-direct", "initial", usage(17)),
        observedAttemptIds: [],
      }],
    });

    expect(built.status).toBe("ready");
    if (built.status !== "ready") throw new Error("expected zero-attempt provider request ledger");
    const attemptPrefix: readonly never[] = [];
    const m0 = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(attemptPrefix),
      evaluationAttemptPrefix: attemptPrefix,
      evaluationHorizonRequestId: "request-direct",
      evaluationHorizonPhaseId: "initial",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: null,
      tdaiCallCount: 0,
      timeToTerminalMs: null,
      terminalReached: false,
    } as const;

    expect(assessM0EvaluationBoundaryFacts(m0)).toEqual({ status: "ready", blockers: [] });
    expect(accumulateRequestUsageToM0Horizon(built.ledger, m0)).toMatchObject({
      status: "ready",
      evaluationAttemptCount: 0,
      accumulatedRequestCount: 1,
      providerInputToEvaluationHorizon: 17,
      providerInputToTerminalGivenSuccess: null,
    });
  });

  it("records multiple ordered attempts on one provider request without charging it twice", () => {
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [{
        ...request(0, "request-multi", "executor", usage(61)),
        observedAttemptIds: ["attempt-a", "attempt-b"],
      }],
    });
    expect(built.status).toBe("ready");
    if (built.status !== "ready") throw new Error("expected multi-attempt provider request ledger");
    const evaluationAttemptPrefix = [
      boundary("request-multi", "attempt-a", "executor"),
      boundary("request-multi", "attempt-b", "executor"),
    ];
    const m0 = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "request-multi",
      evaluationHorizonPhaseId: "executor",
      terminalBoundaryGivenSuccess: {
        traceId: "ledger-trace",
        requestId: "request-multi",
        phaseId: "executor",
        terminalAttemptId: "attempt-b",
      },
      modelRoundsToTerminal: 1,
      tdaiCallCount: 2,
      timeToTerminalMs: 80,
      terminalReached: true,
    } as const;

    const accumulated = accumulateRequestUsageToM0Horizon(built.ledger, m0);
    expect(accumulated).toMatchObject({
      status: "ready",
      evaluationAttemptCount: 2,
      accumulatedRequestCount: 1,
      providerInputToEvaluationHorizon: 61,
      providerInputToTerminalGivenSuccess: 61,
    });
  });

  it("requires the successful M0 attempt prefix to be exact through the terminal attempt", () => {
    const twoRequests = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [
        request(0, "request-0", "initial", usage(10)),
        request(1, "request-1", "followup", usage(20)),
      ],
    });
    const oneRequest = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [{
        ...request(0, "request-multi", "executor", usage(30)),
        observedAttemptIds: ["attempt-a", "attempt-b"],
      }],
    });
    if (twoRequests.status !== "ready" || oneRequest.status !== "ready") {
      throw new Error("expected ready request ledgers");
    }

    const cases = [
      {
        name: "missing first request attempt",
        ledger: twoRequests.ledger,
        prefix: [boundary("request-1", "attempt-1", "followup")],
        horizonRequestId: "request-1",
        horizonPhaseId: "followup",
        terminalAttemptId: "attempt-1",
        terminalRequestId: "request-1",
      },
      {
        name: "missing middle request attempt",
        ledger: buildRequestUsageLedger({
          runId: "ledger-run",
          traceId: "ledger-trace",
          requests: [
            request(0, "request-0", "initial", usage(10)),
            request(1, "request-1", "executor", usage(20)),
            request(2, "request-2", "followup", usage(30)),
          ],
        }),
        prefix: [
          boundary("request-0", "attempt-0", "initial"),
          boundary("request-2", "attempt-2", "followup"),
        ],
        horizonRequestId: "request-2",
        horizonPhaseId: "followup",
        terminalAttemptId: "attempt-2",
        terminalRequestId: "request-2",
      },
      {
        name: "missing earlier attempt from the terminal request",
        ledger: oneRequest.ledger,
        prefix: [boundary("request-multi", "attempt-b", "executor")],
        horizonRequestId: "request-multi",
        horizonPhaseId: "executor",
        terminalAttemptId: "attempt-b",
        terminalRequestId: "request-multi",
      },
    ] as const;

    for (const testCase of cases) {
      const ledger = "status" in testCase.ledger
        ? testCase.ledger.status === "ready" ? testCase.ledger.ledger : null
        : testCase.ledger;
      if (ledger === null) throw new Error(`expected ready ledger for ${testCase.name}`);
      const result = accumulateRequestUsageToM0Horizon(ledger, {
        status: "observed",
        runId: "ledger-run",
        traceId: "ledger-trace",
        evaluationPrefixSha256: canonicalSha256(testCase.prefix),
        evaluationAttemptPrefix: testCase.prefix,
        evaluationHorizonRequestId: testCase.horizonRequestId,
        evaluationHorizonPhaseId: testCase.horizonPhaseId,
        terminalBoundaryGivenSuccess: {
          traceId: "ledger-trace",
          requestId: testCase.terminalRequestId,
          phaseId: testCase.horizonPhaseId,
          terminalAttemptId: testCase.terminalAttemptId,
        },
        modelRoundsToTerminal: 2,
        tdaiCallCount: testCase.prefix.length,
        timeToTerminalMs: 50,
        terminalReached: true,
      });
      expect(result.blockers, testCase.name).toContain("HORIZON_ATTEMPT_PREFIX_MISMATCH");
      expect(result.status, testCase.name).toBe("blocked");
    }
  });

  it("uses the horizon request identity when non-task phases are interleaved", () => {
    const requests = [
      { ...request(0, "router-request", "router", usage(3)), component: "router" as const, observedAttemptIds: [] },
      { ...request(1, "task-request", "executor", usage(10)), observedAttemptIds: ["attempt-a"] },
      { ...request(2, "verifier-request", "verify", usage(5)), component: "verifier" as const, observedAttemptIds: [] },
      { ...request(3, "terminal-request", "followup", usage(20)), observedAttemptIds: ["attempt-b"] },
    ];
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests,
    });
    expect(built.status).toBe("ready");
    if (built.status !== "ready") throw new Error("expected interleaved request ledger");
    const evaluationAttemptPrefix = [
      boundary("task-request", "attempt-a", "executor"),
      boundary("terminal-request", "attempt-b", "followup"),
    ];
    const m0 = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "terminal-request",
      evaluationHorizonPhaseId: "followup",
      terminalBoundaryGivenSuccess: {
        traceId: "ledger-trace",
        requestId: "terminal-request",
        phaseId: "followup",
        terminalAttemptId: "attempt-b",
      },
      modelRoundsToTerminal: 2,
      tdaiCallCount: 2,
      timeToTerminalMs: 100,
      terminalReached: true,
    } as const;

    expect(accumulateRequestUsageToM0Horizon(built.ledger, m0)).toMatchObject({
      status: "ready",
      accumulatedRequestCount: 4,
      providerInputToEvaluationHorizon: 38,
      providerInputToTerminalGivenSuccess: 38,
    });
  });

  it("accumulates multi-round usage only through an early successful terminal", () => {
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [
        request(0, "request-0", "initial", usage(100, 40)),
        request(1, "request-1", "executor", usage(50, 0)),
        request(2, "request-after-terminal", "post-terminal", usage(999, 0)),
      ],
    });
    expect(built.status).toBe("ready");
    if (built.status !== "ready") throw new Error("expected ready request ledger");

    const evaluationAttemptPrefix = [
      boundary("request-0", "attempt-0", "initial"),
      boundary("request-1", "attempt-1", "executor"),
    ];
    const m0 = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "request-1",
      evaluationHorizonPhaseId: "executor",
      terminalBoundaryGivenSuccess: {
        traceId: "ledger-trace",
        requestId: "request-1",
        phaseId: "executor",
        terminalAttemptId: "attempt-1",
      },
      modelRoundsToTerminal: 2,
      tdaiCallCount: 2,
      timeToTerminalMs: 450,
      terminalReached: true,
    };
    expect(assessM0EvaluationBoundaryFacts(m0)).toEqual({ status: "ready", blockers: [] });

    const accumulated = accumulateRequestUsageToM0Horizon(built.ledger, m0);
    expect(accumulated).toMatchObject({
      status: "ready",
      blockers: [],
      evaluationAttemptCount: 2,
      evaluationHorizonRequestOrdinal: 1,
      accumulatedRequestCount: 2,
      providerInputToEvaluationHorizon: 150,
      providerInputToTerminalGivenSuccess: 150,
      aggregatesToEvaluationHorizon: {
        providerTotalInputTokens: 150,
        ordinaryInputTokens: 110,
        cacheReadInputTokens: 40,
        cacheWriteInputTokens: null,
        outputTokens: 10,
        reasoningOrThinkingTokens: 4,
      },
    });
    expect(accumulated.providerInputToEvaluationHorizon).not.toBe(1149);
    expect(built.ledger.requests).toHaveLength(3);
    expect(built.ledger.aggregateProviderUsage.providerTotalInputTokens).toBe(1149);
    expect(built.ledger.requests[2].requestId).toBe("request-after-terminal");
    expect(assessM2EvaluationHorizonUsageEvidence(accumulated)).toEqual({
      status: "ready",
      blockers: [],
    });
    expect(assessM2EvaluationHorizonUsageEvidence({
      ...accumulated,
      providerInputToEvaluationHorizon: 100,
      providerInputToTerminalGivenSuccess: 999,
    })).toEqual({
      status: "blocked",
      blockers: expect.arrayContaining([
        "TERMINAL_COST_IDENTITY_INVALID",
        "HORIZON_EVIDENCE_CANONICAL_SHA256_MISMATCH",
      ]),
    });
  });

  it("accumulates a failed chain to its horizon and keeps terminal cost null", () => {
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [
        request(0, "request-0", "initial", usage(10)),
        request(1, "request-1", "followup", usage(20)),
      ],
    });
    if (built.status !== "ready") throw new Error("expected ready request ledger");
    const evaluationAttemptPrefix = [
      boundary("request-0", "attempt-0", "initial"),
      boundary("request-1", "attempt-1", "followup"),
    ];
    const m0 = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "request-1",
      evaluationHorizonPhaseId: "followup",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: null,
      tdaiCallCount: 2,
      timeToTerminalMs: null,
      terminalReached: false,
    };

    expect(accumulateRequestUsageToM0Horizon(built.ledger, m0)).toMatchObject({
      status: "ready",
      providerInputToEvaluationHorizon: 30,
      providerInputToTerminalGivenSuccess: null,
    });
  });

  it("requires a failed M0 attempt prefix to cover the complete horizon request", () => {
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [
        {
          ...request(0, "request-0", "initial", usage(10)),
          observedAttemptIds: ["attempt-a", "attempt-b"],
        },
        {
          ...request(1, "request-1", "followup", usage(20)),
          observedAttemptIds: ["attempt-c"],
        },
      ],
    });
    if (built.status !== "ready") throw new Error("expected ready request ledger");
    const incompletePrefix = [
      boundary("request-0", "attempt-a", "initial"),
      boundary("request-1", "attempt-c", "followup"),
    ];
    const result = accumulateRequestUsageToM0Horizon(built.ledger, {
      status: "observed",
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(incompletePrefix),
      evaluationAttemptPrefix: incompletePrefix,
      evaluationHorizonRequestId: "request-1",
      evaluationHorizonPhaseId: "followup",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: null,
      tdaiCallCount: incompletePrefix.length,
      timeToTerminalMs: null,
      terminalReached: false,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("HORIZON_ATTEMPT_PREFIX_MISMATCH");
  });

  it("fails closed for missing, duplicate, wrong-run, wrong-trace, and wrong-phase records", () => {
    const duplicate = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [
        request(0, "same-request", "initial"),
        { ...request(1, "same-request", "followup"), observedAttemptIds: ["attempt-0"] },
      ],
    });
    expect(duplicate).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining(["REQUEST_ID_DUPLICATE", "ATTEMPT_ID_DUPLICATE"]),
    });

    const wrongIdentity = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [{
        ...request(0, "request-0", "initial"),
        runId: "other-run",
        traceId: "other-trace",
      }],
    });
    expect(wrongIdentity).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining(["REQUEST_RUN_MISMATCH", "REQUEST_TRACE_MISMATCH"]),
    });

    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [request(0, "request-0", "initial")],
    });
    if (built.status !== "ready") throw new Error("expected ready request ledger");
    const evaluationAttemptPrefix = [boundary("missing-request", "attempt-0", "wrong-phase")];
    const facts = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "missing-request",
      evaluationHorizonPhaseId: "wrong-phase",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: null,
      tdaiCallCount: 1,
      timeToTerminalMs: null,
      terminalReached: false,
    };
    const missing = accumulateRequestUsageToM0Horizon(built.ledger, facts);
    expect(missing.status).toBe("blocked");
    expect(missing.blockers).toContain("HORIZON_REQUEST_MISSING");

    const wrongPhase = accumulateRequestUsageToM0Horizon(built.ledger, {
      ...facts,
      evaluationPrefixSha256: canonicalSha256([boundary("request-0", "attempt-0", "wrong-phase")]),
      evaluationAttemptPrefix: [boundary("request-0", "attempt-0", "wrong-phase")],
      evaluationHorizonRequestId: "request-0",
    });
    expect(wrongPhase.blockers).toContain("HORIZON_PHASE_MISMATCH");

    const wrongRunTrace = accumulateRequestUsageToM0Horizon(built.ledger, {
      ...facts,
      runId: "other-run",
      traceId: "other-trace",
      evaluationPrefixSha256: canonicalSha256([{
        ...boundary("request-0", "attempt-0", "initial"),
        traceId: "other-trace",
      }]),
      evaluationAttemptPrefix: [{
        ...boundary("request-0", "attempt-0", "initial"),
        traceId: "other-trace",
      }],
      evaluationHorizonRequestId: "request-0",
      evaluationHorizonPhaseId: "initial",
    });
    expect(wrongRunTrace.blockers).toEqual(expect.arrayContaining([
      "HORIZON_RUN_MISMATCH",
      "HORIZON_TRACE_MISMATCH",
    ]));

    const twoRequests = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [
        request(0, "request-0", "initial"),
        request(1, "request-1", "followup"),
      ],
    });
    if (twoRequests.status !== "ready") throw new Error("expected two-request ledger");
    const reversedPrefix = [
      boundary("request-1", "attempt-1", "followup"),
      boundary("request-0", "attempt-0", "initial"),
    ];
    const reversed = accumulateRequestUsageToM0Horizon(twoRequests.ledger, {
      status: "observed",
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(reversedPrefix),
      evaluationAttemptPrefix: reversedPrefix,
      evaluationHorizonRequestId: "request-1",
      evaluationHorizonPhaseId: "followup",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: null,
      tdaiCallCount: 2,
      timeToTerminalMs: null,
      terminalReached: false,
    });
    expect(reversed.blockers).toContain("HORIZON_ATTEMPT_ORDER_INVALID");

    const remappedPrefix = [boundary("request-1", "attempt-0", "followup")];
    const remapped = accumulateRequestUsageToM0Horizon(twoRequests.ledger, {
      status: "observed",
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(remappedPrefix),
      evaluationAttemptPrefix: remappedPrefix,
      evaluationHorizonRequestId: "request-1",
      evaluationHorizonPhaseId: "followup",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: null,
      tdaiCallCount: 1,
      timeToTerminalMs: null,
      terminalReached: false,
    });
    expect(remapped.blockers).toEqual(expect.arrayContaining([
      "HORIZON_ATTEMPT_MISMATCH",
      "HORIZON_PHASE_MISMATCH",
    ]));
  });

  it("detects persisted cumulative-total tampering independently of the artifact hash", () => {
    const built = buildRequestUsageLedger({
      runId: "ledger-run",
      traceId: "ledger-trace",
      requests: [request(0, "request-0", "initial", usage(100))],
    });
    if (built.status !== "ready") throw new Error("expected ready request ledger");
    const tampered = {
      ...built.ledger,
      aggregateProviderUsage: {
        ...built.ledger.aggregateProviderUsage,
        providerTotalInputTokens: 999,
      },
    };
    const evaluationAttemptPrefix = [boundary("request-0", "attempt-0", "initial")];
    const facts = {
      status: "observed" as const,
      runId: "ledger-run",
      traceId: "ledger-trace",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "request-0",
      evaluationHorizonPhaseId: "initial",
      terminalBoundaryGivenSuccess: {
        traceId: "ledger-trace",
        requestId: "request-0",
        phaseId: "initial",
        terminalAttemptId: "attempt-0",
      },
      modelRoundsToTerminal: 1,
      tdaiCallCount: 1,
      timeToTerminalMs: 20,
      terminalReached: true,
    };

    const result = accumulateRequestUsageToM0Horizon(tampered, facts);
    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "LEDGER_AGGREGATE_USAGE_MISMATCH",
      "LEDGER_CANONICAL_SHA256_MISMATCH",
    ]));

    const tamperedCumulative = {
      ...built.ledger,
      requests: [{
        ...built.ledger.requests[0],
        cumulativeProviderUsage: {
          ...built.ledger.requests[0].cumulativeProviderUsage,
          providerTotalInputTokens: 999,
        },
      }],
    };
    const cumulativeResult = accumulateRequestUsageToM0Horizon(tamperedCumulative, facts);
    expect(cumulativeResult.status).toBe("blocked");
    expect(cumulativeResult.blockers).toEqual(expect.arrayContaining([
      "LEDGER_CUMULATIVE_USAGE_MISMATCH",
      "LEDGER_CANONICAL_SHA256_MISMATCH",
    ]));
  });
});

describe("Task 1 measurement v2 isolation evidence", () => {
  it("keeps fresh MemoryProxy state separate from a warm provider-cache lane", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens: 5,
      },
    });
    const evidence = buildRunIsolationEvidence({
      runId: "run-a",
      runNamespace: "task1/run-a",
      caseId: "case-1",
      variantId: "V0",
      repeatIndex: 0,
      caseInputControlSha256: EVIDENCE_SHA.caseInput,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: EVIDENCE_SHA.providerRequestA,
      staticPromptSha256: EVIDENCE_SHA.staticPromptA,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: null,
      session: { id: "session-a", fresh: true },
      memoryProxyContext: { id: "proxy-context-a", fresh: true },
      snapshot: {
        id: "snapshot-1",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: {
        pathId: "local-state-a",
        fresh: true,
        inheritedHistory: false,
      },
      usage,
    });

    expect(evidence).toMatchObject({
      isolationStatus: "ready",
      blockers: [],
      session: { fresh: true },
      memoryProxyContext: { fresh: true },
      providerCache: {
        cacheLane: "warm",
        cacheReadInputTokens: 40,
        cacheWriteInputTokens: null,
        cacheReadState: "reported",
        cacheWriteState: "unsupported",
      },
    });
  });

  it("does not let fresh flags substitute for non-empty identities and SHA-256 evidence", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
      },
    });
    const evidence = buildRunIsolationEvidence({
      runId: "",
      runNamespace: "",
      caseId: "",
      variantId: "",
      repeatIndex: -1,
      caseInputControlSha256: "",
      comparisonGroupSha256: "not-a-sha",
      providerRequestSha256: "",
      staticPromptSha256: EVIDENCE_SHA.staticPromptA,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: null,
      session: { id: "", fresh: true },
      memoryProxyContext: { id: "", fresh: true },
      snapshot: {
        id: "",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: "",
      localState: { pathId: "", fresh: true, inheritedHistory: false },
      usage,
    });

    expect(evidence.isolationStatus).toBe("blocked");
    expect(evidence.blockers).toEqual(expect.arrayContaining([
      "RUN_ID_INVALID",
      "RUN_NAMESPACE_INVALID",
      "CASE_ID_INVALID",
      "VARIANT_ID_INVALID",
      "REPEAT_INDEX_INVALID",
      "CASE_INPUT_CONTROL_SHA256_INVALID",
      "COMPARISON_GROUP_SHA256_INVALID",
      "PROVIDER_REQUEST_SHA256_INVALID",
      "SESSION_ID_INVALID",
      "MEMORY_PROXY_CONTEXT_ID_INVALID",
      "SNAPSHOT_ID_INVALID",
      "VISIBLE_ASSETS_SHA256_INVALID",
      "LOCAL_STATE_ID_INVALID",
    ]));
  });

  it("freezes a non-empty model and provider usage contract into the run execution identity", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
      },
    });
    const baseInput = {
      runId: "identity-run",
      runNamespace: "task1/identity-run",
      caseId: "identity-case",
      variantId: "V0",
      repeatIndex: 0,
      caseInputControlSha256: EVIDENCE_SHA.caseInput,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: EVIDENCE_SHA.providerRequestA,
      staticPromptSha256: EVIDENCE_SHA.staticPromptA,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: null,
      session: { id: "identity-session", fresh: true },
      memoryProxyContext: { id: "identity-context", fresh: true },
      snapshot: {
        id: "identity-snapshot",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: "identity-local", fresh: true, inheritedHistory: false },
      usage,
    };

    const ready = buildRunIsolationEvidence(baseInput);
    const invalid = buildRunIsolationEvidence({
      ...baseInput,
      runId: "invalid-identity-run",
      runNamespace: "task1/invalid-identity-run",
      staticPromptSha256: "",
      execution: {
        modelId: "",
        reasoningEffort: "",
        verbosity: "",
        codexCliVersion: "",
      },
      usage: {
        ...usage,
        apiVersion: "",
        adapterVersion: "",
      },
    });
    const missing = buildRunIsolationEvidence({
      ...baseInput,
      runId: "missing-identity-run",
      runNamespace: "task1/missing-identity-run",
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
      } as unknown as typeof baseInput.execution,
    });
    const missingRequiredUsage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: { input_tokens: 1, output_tokens: 1 },
    });
    const usageBlocked = buildRunIsolationEvidence({
      ...baseInput,
      runId: "missing-usage-run",
      runNamespace: "task1/missing-usage-run",
      usage: missingRequiredUsage,
    });

    expect(ready.executionIdentity).toMatchObject({
      modelId: "gpt-5.6-luna",
      reasoningEffort: "high",
      verbosity: "medium",
      codexCliVersion: "codex-cli 1.2.3",
      provider: "openai",
      usageSchema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredUsageFields: ["cacheReadInputTokens"],
      unsupportedUsageFields: ["cacheWriteInputTokens"],
    });
    if (ready.executionIdentity === null) throw new Error("expected ready execution identity");
    expect(ready.executionIdentity.canonicalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(missing.executionIdentity).toBeNull();
    expect(invalid.isolationStatus).toBe("blocked");
    expect(invalid.blockers).toEqual(expect.arrayContaining([
      "STATIC_PROMPT_SHA256_INVALID",
      "MODEL_ID_INVALID",
      "REASONING_EFFORT_INVALID",
      "VERBOSITY_INVALID",
      "CODEX_CLI_VERSION_INVALID",
      "USAGE_API_VERSION_INVALID",
      "USAGE_ADAPTER_VERSION_INVALID",
    ]));
    expect(missing.isolationStatus).toBe("blocked");
    expect(missing.blockers).toEqual(expect.arrayContaining([
      "VERBOSITY_INVALID",
      "CODEX_CLI_VERSION_INVALID",
    ]));
    expect(usageBlocked.isolationStatus).toBe("blocked");
    expect(usageBlocked.blockers).toContain("USAGE_NORMALIZATION_BLOCKED");
  });

  it("requires paired variants to share frozen inputs but use isolated run state", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });
    const makeRun = (
      suffix: string,
      variantId: string,
      execution = {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      usageOverride = usage,
    ) => buildRunIsolationEvidence({
      runId: `run-${suffix}`,
      runNamespace: `task1/run-${suffix}`,
      caseId: "case-paired",
      variantId,
      repeatIndex: 1,
      caseInputControlSha256: EVIDENCE_SHA.caseInput,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: suffix === "a"
        ? EVIDENCE_SHA.providerRequestA
        : EVIDENCE_SHA.providerRequestB,
      staticPromptSha256: variantId === "V0"
        ? EVIDENCE_SHA.staticPromptA
        : EVIDENCE_SHA.staticPromptB,
      execution,
      counterfactualRole: null,
      session: { id: `session-${suffix}`, fresh: true },
      memoryProxyContext: { id: `proxy-${suffix}`, fresh: true },
      snapshot: {
        id: "snapshot-paired",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: {
        pathId: `local-${suffix}`,
        fresh: true,
        inheritedHistory: false,
      },
      usage: usageOverride,
    });

    const pair = assessPairedIsolationEvidence(
      makeRun("a", "V0"),
      makeRun("b", "V1"),
      { purpose: "variant" },
    );
    expect(pair).toMatchObject({
      pairStatus: "ready",
      blockers: [],
      controls: {
        sameCase: true,
        sameRepeat: true,
        sameCaseInputControl: true,
        sameProviderRequest: false,
        sameComparisonGroup: true,
        sameSnapshot: true,
        sameVisibleAssets: true,
        distinctRunNamespace: true,
        distinctSession: true,
        distinctMemoryProxyContext: true,
        distinctLocalState: true,
      },
    });

    const usageWithContract = (apiVersion: string, adapterVersion: string) => normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion,
      adapterVersion,
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });
    const anthropicUsage = normalizeProviderUsage({
      provider: "anthropic",
      schema: "anthropic.messages",
      apiVersion: "2026-08-01",
      adapterVersion: "messages-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: 20,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 2,
      },
    });
    const mismatchedRuns = [
      makeRun("model", "V1", {
        modelId: "gpt-5.6-sol",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      }),
      makeRun("reasoning", "V1", {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "medium",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      }),
      makeRun("verbosity", "V1", {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "low",
        codexCliVersion: "codex-cli 1.2.3",
      }),
      makeRun("codex-version", "V1", {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.4",
      }),
      makeRun(
        "api-version",
        "V1",
        {
          modelId: "gpt-5.6-luna",
          reasoningEffort: "high",
          verbosity: "medium",
          codexCliVersion: "codex-cli 1.2.3",
        },
        usageWithContract("2026-09-01", "responses-v1"),
      ),
      makeRun(
        "adapter-version",
        "V1",
        {
          modelId: "gpt-5.6-luna",
          reasoningEffort: "high",
          verbosity: "medium",
          codexCliVersion: "codex-cli 1.2.3",
        },
        usageWithContract("2026-08-01", "responses-v2"),
      ),
      makeRun(
        "provider",
        "V1",
        {
          modelId: "gpt-5.6-luna",
          reasoningEffort: "high",
          verbosity: "medium",
          codexCliVersion: "codex-cli 1.2.3",
        },
        anthropicUsage,
      ),
    ];
    for (const right of mismatchedRuns) {
      const mismatched = assessPairedIsolationEvidence(makeRun("a", "V0"), right, {
        purpose: "variant",
      });
      expect(mismatched.pairStatus).toBe("blocked");
      expect(mismatched.blockers).toContain("PAIR_EXECUTION_IDENTITY_MISMATCH");
      expect(mismatched.controls.sameExecutionIdentity).toBe(false);
    }

    const sameStaticPrompt = assessPairedIsolationEvidence(
      makeRun("a", "V0"),
      {
        ...makeRun("same-static", "V1"),
        staticPromptSha256: EVIDENCE_SHA.staticPromptA,
      },
      { purpose: "variant" },
    );
    expect(sameStaticPrompt).toMatchObject({
      pairStatus: "blocked",
      blockers: expect.arrayContaining(["PAIR_STATIC_PROMPT_NOT_DISTINCT"]),
      controls: { distinctStaticPrompt: false },
    });
  });

  it("allows counterfactual queries and full provider requests to differ under an explicit group control", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });
    const makeRun = (
      role: "positive" | "negative",
      variantId = "V1",
      staticPromptSha256 = EVIDENCE_SHA.staticPromptA,
    ) => buildRunIsolationEvidence({
      runId: `counterfactual-${role}`,
      runNamespace: `task1/counterfactual-${role}`,
      caseId: `case-${role}`,
      variantId,
      repeatIndex: 0,
      caseInputControlSha256: role === "positive"
        ? EVIDENCE_SHA.caseInput
        : EVIDENCE_SHA.caseInputB,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: role === "positive"
        ? EVIDENCE_SHA.providerRequestA
        : EVIDENCE_SHA.providerRequestB,
      staticPromptSha256,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: role,
      session: { id: `session-${role}`, fresh: true },
      memoryProxyContext: { id: `context-${role}`, fresh: true },
      snapshot: {
        id: "counterfactual-snapshot",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: `local-${role}`, fresh: true, inheritedHistory: false },
      usage,
    });

    const pair = assessPairedIsolationEvidence(
      makeRun("positive"),
      makeRun("negative"),
      { purpose: "counterfactual" },
    );
    expect(pair).toMatchObject({
      pairStatus: "ready",
      blockers: [],
      comparisonPurpose: "counterfactual",
      controls: {
        sameCase: false,
        sameVariant: true,
        sameCaseInputControl: false,
        sameProviderRequest: false,
        sameComparisonGroup: true,
        distinctCounterfactualRole: true,
      },
    });

    const wrongVariant = assessPairedIsolationEvidence(
      makeRun("positive"),
      makeRun("negative", "V2"),
      { purpose: "counterfactual" },
    );
    expect(wrongVariant.blockers).toContain("PAIR_VARIANT_MISMATCH");

    const wrongStaticPrompt = assessPairedIsolationEvidence(
      makeRun("positive"),
      makeRun("negative", "V1", EVIDENCE_SHA.staticPromptB),
      { purpose: "counterfactual" },
    );
    expect(wrongStaticPrompt.blockers).toContain("PAIR_STATIC_PROMPT_MISMATCH");
  });

  it("compares repeat controls without requiring fresh full provider requests to be byte-identical", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheReadInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });
    const makeRun = (
      suffix: string,
      repeatIndex: number,
      staticPromptSha256 = EVIDENCE_SHA.staticPromptA,
    ) => buildRunIsolationEvidence({
      runId: `repeat-${suffix}`,
      runNamespace: `task1/repeat-${suffix}`,
      caseId: "repeat-case",
      variantId: "V1",
      repeatIndex,
      caseInputControlSha256: EVIDENCE_SHA.caseInput,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: suffix === "a"
        ? EVIDENCE_SHA.providerRequestA
        : EVIDENCE_SHA.providerRequestB,
      staticPromptSha256,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: null,
      session: { id: `repeat-session-${suffix}`, fresh: true },
      memoryProxyContext: { id: `repeat-context-${suffix}`, fresh: true },
      snapshot: {
        id: "repeat-snapshot",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: `repeat-local-${suffix}`, fresh: true, inheritedHistory: false },
      usage,
    });

    const pair = assessPairedIsolationEvidence(
      makeRun("a", 0),
      makeRun("b", 1),
      { purpose: "repeat" },
    );

    expect(pair).toMatchObject({
      pairStatus: "ready",
      blockers: [],
      controls: {
        sameCase: true,
        sameVariant: true,
        sameCaseInputControl: true,
        sameProviderRequest: false,
        sameStaticPrompt: true,
        sameExecutionIdentity: true,
        sameSnapshot: true,
        sameVisibleAssets: true,
      },
    });

    const wrongStaticPrompt = assessPairedIsolationEvidence(
      makeRun("a", 0),
      makeRun("b", 1, EVIDENCE_SHA.staticPromptB),
      { purpose: "repeat" },
    );
    expect(wrongStaticPrompt.pairStatus).toBe("blocked");
    expect(wrongStaticPrompt.blockers).toContain("PAIR_STATIC_PROMPT_MISMATCH");
  });
});

describe("Task 1 measurement v2 final-eligibility evidence", () => {
  const oneRequestLedger = (
    runId: string,
    traceId: string,
    usage: ReturnType<typeof normalizeProviderUsage>,
  ) => buildRequestUsageLedger({
    runId,
    traceId,
    requests: [{
      runId,
      traceId,
      requestId: `${runId}-request-0`,
      observedAttemptIds: [`${runId}-attempt-0`],
      requestOrdinal: 0,
      phaseId: "initial",
      component: "task_model",
      phaseType: "initial",
      promptSha256: "a".repeat(64),
      providerToolDefinitionCount: 3,
      injectionTokensO200k: 7,
      discoveryResultTokens: null,
      toolResultContextTokens: null,
      latencyMs: 25,
      usage,
    }],
  });

  it("fails formal eligibility closed for synthetic mock data without emitting the final field", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["providerTotalInputTokens", "cacheReadInputTokens", "outputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });
    const tokenSources = [tokenSourceSegment(0, "memory-tools.legacy-body", "legacy-body", "STATIC")];
    const ledger = buildTokenLedger({
      variantId: "V0",
      runId: "mock-a",
      providerVisibleInjection: "STATIC",
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trustedTokenSources(tokenSources),
      tokenizer: { id: "synthetic", version: "1", count: (text) => text.length },
    });
    const makeRun = (suffix: string, variantId: string) => buildRunIsolationEvidence({
      runId: `mock-${suffix}`,
      runNamespace: `task1/mock-${suffix}`,
      caseId: "mock-case",
      variantId,
      repeatIndex: 0,
      caseInputControlSha256: EVIDENCE_SHA.caseInput,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: suffix === "a"
        ? EVIDENCE_SHA.providerRequestA
        : EVIDENCE_SHA.providerRequestB,
      staticPromptSha256: variantId === "V0"
        ? EVIDENCE_SHA.staticPromptA
        : EVIDENCE_SHA.staticPromptB,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: null,
      session: { id: `session-${suffix}`, fresh: true },
      memoryProxyContext: { id: `context-${suffix}`, fresh: true },
      snapshot: {
        id: "mock-snapshot",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: `local-${suffix}`, fresh: true, inheritedHistory: false },
      usage,
    });
    const left = makeRun("a", "V0");
    const right = makeRun("b", "V1");
    const requestUsageLedger = oneRequestLedger("mock-a", "mock-trace", usage);
    if (requestUsageLedger.status !== "ready") throw new Error("expected ready request ledger");
    const m0EvaluationBoundary = { status: "pending" as const };
    const usageHorizon = accumulateRequestUsageToM0Horizon(
      requestUsageLedger.ledger,
      m0EvaluationBoundary,
    );
    const evidence = buildM2EligibilityEvidence({
      formalDataState: "blocked",
      evaluationLayer: "mock-contract",
      requestUsageLedger,
      usageHorizon,
      tokenLedger: ledger,
      runIsolation: left,
      comparison: {
        purpose: "variant",
        evidence: assessPairedIsolationEvidence(left, right, { purpose: "variant" }),
      },
      prepareOnly: {
        enabled: true,
        servicesStarted: false,
        codexProcessesStarted: 0,
        providerRequestsIssued: 0,
        authFilesRead: false,
        authFilesCopied: false,
      },
      m0EvaluationBoundary,
    });

    expect(evidence).toMatchObject({
      schemaVersion: 2,
      measurementModuleId: "M2",
      runId: "mock-a",
      variantId: "V0",
      m2EvidenceStatus: "blocked",
      blockers: expect.arrayContaining([
        "FORMAL_DATA_BLOCKED",
        "MOCK_LAYER_NOT_FORMAL",
        "TOKEN_CLASSIFICATION_INTEGRATION_BLOCKED",
        "M0_EVALUATION_BOUNDARY_PENDING",
      ]),
      noModelGate: { status: "ready", modelRuns: 0 },
      finalEligibilityOwner: "Integration",
      integrationRequirements: [
        "M0_EVALUATION_BOUNDARY",
        "FORMAL_COMPILER_CAPTURE_CONTRACT",
        "INTEGRATION_OWNS_FINAL_ELIGIBILITY",
      ],
    });
    expect(evidence).not.toHaveProperty("formalMetricEligible");
  });

  it("keeps M0 limited to trace and horizon boundary facts", () => {
    const terminalAttempt = {
      traceId: "trace-terminal",
      requestId: "request-1",
      attemptId: "attempt-1",
      phaseId: "executor",
    };
    const terminal = {
      traceId: "trace-terminal",
      requestId: "request-1",
      phaseId: "executor",
      terminalAttemptId: "attempt-1",
    };
    const evaluationAttemptPrefix = [terminalAttempt];
    const observed = {
      status: "observed",
      runId: "run-terminal",
      traceId: "trace-terminal",
      evaluationPrefixSha256: canonicalSha256(evaluationAttemptPrefix),
      evaluationAttemptPrefix,
      evaluationHorizonRequestId: "request-1",
      evaluationHorizonPhaseId: "executor",
      terminalBoundaryGivenSuccess: terminal,
      modelRoundsToTerminal: 2,
      tdaiCallCount: 1,
      timeToTerminalMs: 450,
      terminalReached: true,
    } as const;
    const wrongTerminal = {
      ...observed,
      terminalBoundaryGivenSuccess: { ...terminal, terminalAttemptId: "attempt-999" },
    };
    const invalid = {
      status: "observed",
      runId: "",
      traceId: "",
      evaluationPrefixSha256: "not-a-sha",
      evaluationAttemptPrefix: [],
      evaluationHorizonRequestId: "",
      evaluationHorizonPhaseId: "",
      terminalBoundaryGivenSuccess: null,
      modelRoundsToTerminal: 0,
      tdaiCallCount: -1,
      timeToTerminalMs: -1,
      terminalReached: true,
    } as const;

    expect(assessM0EvaluationBoundaryFacts(observed)).toEqual({ status: "ready", blockers: [] });
    expect(assessM0EvaluationBoundaryFacts(wrongTerminal)).toMatchObject({
      status: "blocked",
      blockers: ["M0_TERMINAL_BOUNDARY_IDENTITY_INVALID"],
    });
    const invalidGate = assessM0EvaluationBoundaryFacts(invalid);
    expect(invalidGate.status).toBe("blocked");
    expect(invalidGate.blockers).toEqual(expect.arrayContaining([
      "M0_RUN_ID_INVALID",
      "M0_TRACE_ID_INVALID",
      "M0_EVALUATION_PREFIX_SHA256_INVALID",
      "M0_HORIZON_REQUEST_ID_INVALID",
      "M0_HORIZON_PHASE_ID_INVALID",
      "M0_TERMINAL_BOUNDARY_IDENTITY_INVALID",
      "M0_MODEL_ROUNDS_INVALID",
      "M0_TDAI_CALL_COUNT_INVALID",
      "M0_TIME_TO_TERMINAL_INVALID",
    ]));
    expect(observed).not.toHaveProperty("formalMetricEligible");
    expect(observed).not.toHaveProperty("providerInputToEvaluationHorizon");
    expect(observed).not.toHaveProperty("providerInputToTerminalGivenSuccess");
  });

  it("blocks incomplete usage and ledger identity mismatches without requiring an unrelated pair", () => {
    const usage = normalizeProviderUsage({
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredFields: ["cacheWriteInputTokens"],
      unsupportedFields: ["cacheWriteInputTokens"],
      rawUsage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
      },
    });
    const runIsolation = buildRunIsolationEvidence({
      runId: "ordinary-run",
      runNamespace: "task1/ordinary-run",
      caseId: "ordinary-case",
      variantId: "V0",
      repeatIndex: 0,
      caseInputControlSha256: EVIDENCE_SHA.caseInput,
      comparisonGroupSha256: EVIDENCE_SHA.comparisonGroup,
      providerRequestSha256: EVIDENCE_SHA.providerRequestA,
      staticPromptSha256: EVIDENCE_SHA.staticPromptA,
      execution: {
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        codexCliVersion: "codex-cli 1.2.3",
      },
      counterfactualRole: null,
      session: { id: "ordinary-session", fresh: true },
      memoryProxyContext: { id: "ordinary-context", fresh: true },
      snapshot: {
        id: "ordinary-snapshot",
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: "ordinary-local", fresh: true, inheritedHistory: false },
      usage,
    });
    const tokenSources = [tokenSourceSegment(0, "memory-tools.legacy-body", "legacy-body", "STATIC")];
    const mismatchedLedger = buildTokenLedger({
      variantId: "V9",
      runId: "different-run",
      providerVisibleInjection: "STATIC",
      classification: TOKEN_CLASSIFICATION_INPUT,
      ...trustedTokenSources(tokenSources),
      tokenizer: { id: "synthetic", version: "1", count: (text) => text.length },
    });
    const requestUsageLedger = oneRequestLedger("ordinary-run", "ordinary-trace", usage);
    const evidence = buildM2EligibilityEvidence({
      formalDataState: "blocked",
      evaluationLayer: "mock-contract",
      requestUsageLedger,
      usageHorizon: null,
      tokenLedger: mismatchedLedger,
      runIsolation,
      comparison: { purpose: "none" },
      prepareOnly: {
        enabled: true,
        servicesStarted: false,
        codexProcessesStarted: 0,
        providerRequestsIssued: 0,
        authFilesRead: false,
        authFilesCopied: false,
      },
      m0EvaluationBoundary: { status: "pending" },
    });

    expect(evidence.comparisonPurpose).toBe("none");
    expect(evidence.blockers).toEqual(expect.arrayContaining([
      "REQUEST_USAGE_LEDGER_BLOCKED",
      "TOKEN_LEDGER_RUN_MISMATCH",
      "TOKEN_LEDGER_VARIANT_MISMATCH",
    ]));
    expect(evidence.blockers).not.toContain("PAIRED_ISOLATION_BLOCKED");
    expect(evidence).not.toHaveProperty("formalMetricEligible");
  });
});

describe("Task 1 measurement v2 cache metadata parity", () => {
  it("fails closed on Hook provenance errors only for formal production capture", async () => {
    const registry = new HookRegistryImpl();
    registry.register({
      id: "synthetic-provenance-failure",
      point: "system.suffix",
      priority: 1,
      description: "synthetic production provenance failure",
      execute: () => {
        throw new ProductionPromptSourceError(
          "SOURCE_DUPLICATE",
          "synthetic duplicate production source",
        );
      },
    });
    const pipeline = new InjectionPipeline(
      registry,
      new Map([["anthropic", new AnthropicAdapter()]]),
    );
    const body = {
      model: "synthetic-model",
      system: "Stable system prefix",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    };
    const metadata = {
      protocol: "anthropic" as const,
      traceId: "synthetic-provenance-failure",
      keyId: "synthetic",
      modelId: "synthetic-model",
      stream: false,
      agentSource: "claude-code",
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(pipeline.process(body, metadata)).resolves.toMatchObject(body);
      await expect(pipeline.processWithProductionSources(body, metadata)).rejects.toMatchObject({
        name: "InjectionInfrastructureError",
        code: "INJECTION_METADATA_PARITY_FAILURE",
        message: expect.stringContaining("SOURCE_DUPLICATE"),
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("round-trips a single Anthropic system cache breakpoint when no hook runs", async () => {
    const pipeline = new InjectionPipeline(
      new HookRegistryImpl(),
      new Map([["anthropic", new AnthropicAdapter()]]),
    );
    const body = {
      model: "synthetic-model",
      system: [{
        type: "text",
        text: "Stable system prefix",
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    };

    const result = await pipeline.process(body, {
      protocol: "anthropic",
      traceId: "synthetic-cache-roundtrip",
      keyId: "synthetic",
      modelId: "synthetic-model",
      stream: false,
      agentSource: "claude-code",
    });

    expect(result.system).toEqual(body.system);
    expect(result.messages).toEqual(body.messages);
  });

  it("preserves the terminal Anthropic cache breakpoint through a real anchor rebuild", async () => {
    const registry = new HookRegistryImpl();
    registry.register({
      id: "synthetic-memory-injector",
      point: "system.suffix",
      priority: 1,
      anchor: { slot: "memory", relation: "before" },
      description: "synthetic metadata parity hook",
      execute: () => [{ type: "text", content: "<synthetic_memory_tools />" }],
    });
    const pipeline = new InjectionPipeline(
      registry,
      new Map([["anthropic", new AnthropicAdapter()]]),
      { agentProfiles: new Map([["claude-code", new ClaudeCodeProfile()]]) },
    );
    const originalSystem = [
      "Claude Code",
      "# Harness",
      "rules",
      "# Session-specific guidance",
      "skills",
      "# Memory",
      "memory",
      "# Environment",
      "env",
    ].join("\n");
    const expectedSystem = [
      "Claude Code",
      "# Harness",
      "rules",
      "# Session-specific guidance",
      "skills",
      "<synthetic_memory_tools />",
      "# Memory",
      "memory",
      "# Environment",
      "env",
    ].join("\n");
    const body = {
      model: "synthetic-model",
      system: [{
        type: "text",
        text: originalSystem,
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    };

    const result = await pipeline.process(body, {
      protocol: "anthropic",
      traceId: "synthetic-cache-anchor",
      keyId: "synthetic",
      modelId: "synthetic-model",
      stream: false,
      agentSource: "claude-code",
    });

    expect(result.system).toEqual([{
      type: "text",
      text: expectedSystem,
      cache_control: { type: "ephemeral" },
    }]);
    expect(result.messages).toEqual(body.messages);
  });

  it("preserves two Anthropic system metadata markers in order through an anchor rebuild", async () => {
    const registry = new HookRegistryImpl();
    registry.register({
      id: "synthetic-multi-marker-injector",
      point: "system.suffix",
      priority: 1,
      anchor: { slot: "memory", relation: "before" },
      description: "synthetic multi-marker parity hook",
      execute: () => [{ type: "text", content: "<synthetic_memory_tools />" }],
    });
    const pipeline = new InjectionPipeline(
      registry,
      new Map([["anthropic", new AnthropicAdapter()]]),
      { agentProfiles: new Map([["claude-code", new ClaudeCodeProfile()]]) },
    );
    const firstText = [
      "Claude Code",
      "# Harness",
      "rules",
      "# Session-specific guidance",
      "skills",
    ].join("\n");
    const secondText = ["# Memory", "memory", "# Environment", "env"].join("\n");
    const firstMarker = { type: "ephemeral", marker: "first" };
    const secondMarker = { type: "ephemeral", marker: "second" };
    const body = {
      model: "synthetic-model",
      system: [
        { type: "text", text: firstText, cache_control: firstMarker },
        { type: "text", text: secondText, cache_control: secondMarker },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    };

    const result = await pipeline.process(body, {
      protocol: "anthropic",
      traceId: "synthetic-cache-multi-anchor",
      keyId: "synthetic",
      modelId: "synthetic-model",
      stream: false,
      agentSource: "claude-code",
    });
    const system = result.system as Array<Record<string, unknown>>;

    expect(system.map((block) => block.cache_control)).toEqual([firstMarker, secondMarker]);
    expect(system.map((block) => block.text).join("\n")).toBe([
      firstText,
      "<synthetic_memory_tools />",
      secondText,
    ].join("\n"));
  });

  it("raises an infrastructure failure instead of producing a request with a missing injection", async () => {
    const registry = new HookRegistryImpl();
    registry.register({
      id: "synthetic-unsupported-marker-rewrite",
      point: "system.suffix",
      priority: 1,
      anchor: { slot: "memory", relation: "inside_append" },
      description: "synthetic unsupported metadata rewrite",
      execute: () => [{ type: "text", content: "<synthetic_memory_tools />" }],
    });
    const pipeline = new InjectionPipeline(
      registry,
      new Map([["anthropic", new AnthropicAdapter()]]),
      { agentProfiles: new Map([["claude-code", new ClaudeCodeProfile()]]) },
    );
    const body = {
      model: "synthetic-model",
      system: [
        {
          type: "text",
          text: "Claude Code\n# Harness\nrules\n# Session-specific guidance\nskills",
          cache_control: { type: "ephemeral", marker: "first" },
        },
        {
          type: "text",
          text: "# Memory\nmemory\n# Environment\nenv",
          cache_control: { type: "ephemeral", marker: "second" },
        },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    };
    const originalLog = console.log;
    const originalError = console.error;
    console.log = () => undefined;
    console.error = () => undefined;
    let failure: unknown;
    try {
      try {
        await pipeline.process(body, {
          protocol: "anthropic",
          traceId: "synthetic-cache-unsupported-anchor",
          keyId: "synthetic",
          modelId: "synthetic-model",
          stream: false,
          agentSource: "claude-code",
        });
      } catch (error) {
        failure = error;
      }
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(failure).toMatchObject({
      name: "InjectionInfrastructureError",
      code: "INJECTION_METADATA_PARITY_FAILURE",
    });
  });
});
