import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "../injection/adapters/anthropic.js";
import { ClaudeCodeProfile } from "../injection/agents/claude-code/index.js";
import { InjectionPipeline } from "../injection/pipeline.js";
import { HookRegistryImpl } from "../injection/registry.js";
import {
  assessM0EvaluationPrefixEvidence,
  assessPairedIsolationEvidence,
  buildM2EligibilityEvidence,
  buildRunIsolationEvidence,
  buildTokenLedger,
  normalizeProviderUsage,
} from "../../eval/tool-prompt-bench/measurement-v2/index.js";

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
    expect(result.rawUsageSha256).toMatch(/^[0-9a-f]{64}$/);
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
      segments: [
        { component: "staticTemplate", text: "STATIC\n" },
        { component: "executionContract", text: "CONTRACT\n" },
        { component: "runtimeBinding", text: "session-1\n" },
        { component: "dynamicAsset", text: "ASSET" },
      ],
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
    const build = (asset: string) => buildTokenLedger({
      variantId: "V1",
      runId: "synthetic-run-2",
      providerVisibleInjection: `RULE\nsession-1\n${asset}`,
      segments: [
        { component: "staticTemplate", text: "RULE\n" },
        { component: "runtimeBinding", text: "session-1\n" },
        { component: "dynamicAsset", text: asset },
      ],
      tokenizer,
    });

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
    const input = {
      variantId: "V2",
      runId: "synthetic-invalid",
      providerVisibleInjection: "AB",
      segments: [{ component: "staticTemplate" as const, text: "A" }],
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: null,
      session: { id: "session-a", fresh: true },
      memoryProxyContext: { id: "proxy-context-a", fresh: true },
      snapshot: {
        id: "snapshot-1",
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: null,
      session: { id: "", fresh: true },
      memoryProxyContext: { id: "", fresh: true },
      snapshot: {
        id: "",
        expectedSha256: "",
        restoredSha256: "",
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
      "SNAPSHOT_EXPECTED_SHA256_INVALID",
      "SNAPSHOT_RESTORED_SHA256_INVALID",
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: null,
      session: { id: "identity-session", fresh: true },
      memoryProxyContext: { id: "identity-context", fresh: true },
      snapshot: {
        id: "identity-snapshot",
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
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
      execution: { modelId: "", reasoningEffort: "" },
      usage: {
        ...usage,
        apiVersion: "",
        adapterVersion: "",
      },
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
      provider: "openai",
      usageSchema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v1",
      requiredUsageFields: ["cacheReadInputTokens"],
      unsupportedUsageFields: ["cacheWriteInputTokens"],
    });
    expect(ready.executionIdentity.canonicalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(invalid.isolationStatus).toBe("blocked");
    expect(invalid.blockers).toEqual(expect.arrayContaining([
      "STATIC_PROMPT_SHA256_INVALID",
      "MODEL_ID_INVALID",
      "REASONING_EFFORT_INVALID",
      "USAGE_API_VERSION_INVALID",
      "USAGE_ADAPTER_VERSION_INVALID",
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
      execution = { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
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
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
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
      makeRun("model", "V1", { modelId: "gpt-5.6-sol", reasoningEffort: "high" }),
      makeRun("reasoning", "V1", { modelId: "gpt-5.6-luna", reasoningEffort: "medium" }),
      makeRun(
        "api-version",
        "V1",
        { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
        usageWithContract("2026-09-01", "responses-v1"),
      ),
      makeRun(
        "adapter-version",
        "V1",
        { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
        usageWithContract("2026-08-01", "responses-v2"),
      ),
      makeRun(
        "provider",
        "V1",
        { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: role,
      session: { id: `session-${role}`, fresh: true },
      memoryProxyContext: { id: `context-${role}`, fresh: true },
      snapshot: {
        id: "counterfactual-snapshot",
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: null,
      session: { id: `repeat-session-${suffix}`, fresh: true },
      memoryProxyContext: { id: `repeat-context-${suffix}`, fresh: true },
      snapshot: {
        id: "repeat-snapshot",
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
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
    const ledger = buildTokenLedger({
      variantId: "V0",
      runId: "mock-a",
      providerVisibleInjection: "STATIC",
      segments: [{ component: "staticTemplate", text: "STATIC" }],
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: null,
      session: { id: `session-${suffix}`, fresh: true },
      memoryProxyContext: { id: `context-${suffix}`, fresh: true },
      snapshot: {
        id: "mock-snapshot",
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: `local-${suffix}`, fresh: true, inheritedHistory: false },
      usage,
    });
    const left = makeRun("a", "V0");
    const right = makeRun("b", "V1");
    const evidence = buildM2EligibilityEvidence({
      formalDataState: "blocked",
      evaluationLayer: "mock-contract",
      usage,
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
      m0EvaluationPrefix: { status: "pending" },
    });

    expect(evidence).toMatchObject({
      schemaVersion: 2,
      measurementModuleId: "M2",
      runId: "mock-a",
      variantId: "V0",
      m2EvidenceStatus: "blocked",
      blockers: expect.arrayContaining(["FORMAL_DATA_BLOCKED", "MOCK_LAYER_NOT_FORMAL"]),
      noModelGate: { status: "ready", modelRuns: 0 },
      integrationRequirements: [
        "M0_EVALUATION_PREFIX",
        "INTEGRATION_OWNS_FORMAL_METRIC_ELIGIBLE",
      ],
    });
    expect(evidence).not.toHaveProperty("formalMetricEligible");
  });

  it("validates the frozen M0 evaluation-prefix cost interface without deciding final eligibility", () => {
    const observed = assessM0EvaluationPrefixEvidence({
      status: "observed",
      traceId: "trace-terminal",
      evaluationPrefixSha256: "7".repeat(64),
      providerInputToEvaluationHorizon: 100,
      providerInputToTerminalGivenSuccess: 120,
      modelRoundsToTerminal: 2,
      tdaiCallCount: 2,
      timeToTerminalMs: 450,
      terminalReached: true,
    });
    const invalid = assessM0EvaluationPrefixEvidence({
      status: "observed",
      traceId: "",
      evaluationPrefixSha256: "not-a-sha",
      providerInputToEvaluationHorizon: -1,
      providerInputToTerminalGivenSuccess: 1,
      modelRoundsToTerminal: 0,
      tdaiCallCount: -1,
      timeToTerminalMs: -1,
      terminalReached: true,
    });

    expect(observed).toEqual({ status: "ready", blockers: [] });
    expect(invalid.status).toBe("blocked");
    expect(invalid.blockers).toEqual(expect.arrayContaining([
      "M0_TRACE_ID_INVALID",
      "M0_EVALUATION_PREFIX_SHA256_INVALID",
      "M0_EVALUATION_HORIZON_COST_INVALID",
      "M0_TERMINAL_COST_IDENTITY_INVALID",
      "M0_MODEL_ROUNDS_INVALID",
      "M0_TDAI_CALL_COUNT_INVALID",
      "M0_TIME_TO_TERMINAL_INVALID",
    ]));
    expect(observed).not.toHaveProperty("formalMetricEligible");
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
      execution: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      counterfactualRole: null,
      session: { id: "ordinary-session", fresh: true },
      memoryProxyContext: { id: "ordinary-context", fresh: true },
      snapshot: {
        id: "ordinary-snapshot",
        expectedSha256: EVIDENCE_SHA.snapshot,
        restoredSha256: EVIDENCE_SHA.snapshot,
        restoreSucceeded: true,
      },
      visibleAssetsSha256: EVIDENCE_SHA.visibleAssets,
      localState: { pathId: "ordinary-local", fresh: true, inheritedHistory: false },
      usage,
    });
    const mismatchedLedger = buildTokenLedger({
      variantId: "V9",
      runId: "different-run",
      providerVisibleInjection: "STATIC",
      segments: [{ component: "staticTemplate", text: "STATIC" }],
      tokenizer: { id: "synthetic", version: "1", count: (text) => text.length },
    });
    const evidence = buildM2EligibilityEvidence({
      formalDataState: "blocked",
      evaluationLayer: "mock-contract",
      usage,
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
      m0EvaluationPrefix: { status: "pending" },
    });

    expect(evidence.comparisonPurpose).toBe("none");
    expect(evidence.blockers).toEqual(expect.arrayContaining([
      "USAGE_NOT_COMPLETE",
      "TOKEN_LEDGER_RUN_MISMATCH",
      "TOKEN_LEDGER_VARIANT_MISMATCH",
    ]));
    expect(evidence.blockers).not.toContain("PAIRED_ISOLATION_BLOCKED");
    expect(evidence).not.toHaveProperty("formalMetricEligible");
  });
});

describe("Task 1 measurement v2 cache metadata parity", () => {
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
