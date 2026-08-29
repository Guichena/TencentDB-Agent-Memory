import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";
import { AnthropicAdapter } from "../../../src/injection/adapters/anthropic.js";
import { ClaudeCodeProfile } from "../../../src/injection/agents/claude-code/index.js";
import { InjectionPipeline } from "../../../src/injection/pipeline.js";
import { HookRegistryImpl } from "../../../src/injection/registry.js";
import type { NormalizeProviderUsageInput } from "./provider-usage.js";
import {
  buildM2EligibilityEvidence,
  buildRunIsolationEvidence,
  buildTokenLedger,
  normalizeProviderUsage,
} from "./index.js";

const ARTIFACT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "artifacts");
const SHA = {
  caseInput: "1".repeat(64),
  comparisonGroup: "2".repeat(64),
  providerRequest: "3".repeat(64),
  snapshot: "4".repeat(64),
  visibleAssets: "5".repeat(64),
} as const;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeArtifact(name: string, value: unknown): { file: string; sha256: string } {
  const content = json(value);
  writeFileSync(resolve(ARTIFACT_DIR, name), content, "utf8");
  return { file: name, sha256: sha256(content) };
}

const providerFixtureInputs: Array<{ fixtureId: string; input: NormalizeProviderUsageInput }> = [
  {
    fixtureId: "openai-responses-cache-write-unsupported",
    input: {
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
    },
  },
  {
    fixtureId: "openai-responses-cache-write-reported",
    input: {
      provider: "openai",
      schema: "openai.responses",
      apiVersion: "2026-08-01",
      adapterVersion: "responses-v2-cache-write",
      requiredFields: [
        "providerTotalInputTokens",
        "ordinaryInputTokens",
        "cacheReadInputTokens",
        "cacheWriteInputTokens",
        "outputTokens",
      ],
      unsupportedFields: [],
      rawUsage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 40, cache_write_tokens: 10 },
        output_tokens: 12,
      },
    },
  },
  {
    fixtureId: "openai-chat-cache-write-unsupported",
    input: {
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
    },
  },
  {
    fixtureId: "openai-codex-jsonl-complete",
    input: {
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
    },
  },
  {
    fixtureId: "anthropic-messages-complete",
    input: {
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
    },
  },
];

interface MetadataParityCase {
  caseId: string;
  outcome: "injected_with_parity" | "hook_failed_closed";
  markerCount: number;
  markerOrderSha256: string;
  expectedMarkerOrderSha256: string;
  modelVisibleTextSha256: string;
  expectedModelVisibleTextSha256: string;
  status: "pass";
}

function modelVisibleSystem(body: Record<string, unknown>): string {
  if (typeof body.system === "string") return body.system;
  if (!Array.isArray(body.system)) throw new Error("synthetic Anthropic system field is missing");
  return (body.system as Array<Record<string, unknown>>)
    .map((block) => String(block.text ?? ""))
    .join("\n");
}

function systemMarkers(body: Record<string, unknown>): unknown[] {
  if (!Array.isArray(body.system)) return [];
  return (body.system as Array<Record<string, unknown>>)
    .filter((block) => block.cache_control !== undefined)
    .map((block) => block.cache_control);
}

async function captureMetadataCase(input: {
  caseId: string;
  system: Array<Record<string, unknown>>;
  expectedText: string;
  expectedOutcome?: MetadataParityCase["outcome"];
  hook?: {
    id: string;
    content: string;
    relation?: "before" | "inside_append";
  };
}): Promise<MetadataParityCase> {
  const registry = new HookRegistryImpl();
  if (input.hook) {
    registry.register({
      id: input.hook.id,
      point: "system.suffix",
      priority: 1,
      anchor: { slot: "memory", relation: input.hook.relation ?? "before" },
      description: "M2 synthetic cache metadata evidence",
      execute: () => [{ type: "text", content: input.hook!.content }],
    });
  }
  const pipeline = new InjectionPipeline(
    registry,
    new Map([["anthropic", new AnthropicAdapter()]]),
    { agentProfiles: new Map([["claude-code", new ClaudeCodeProfile()]]) },
  );
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;
  let result: Record<string, unknown>;
  try {
    result = await pipeline.process({
      model: "synthetic-model",
      system: input.system,
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    }, {
      protocol: "anthropic",
      traceId: input.caseId,
      keyId: "synthetic",
      modelId: "synthetic-model",
      stream: false,
      agentSource: "claude-code",
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const expectedMarkers = input.system.map((block) => block.cache_control);
  const actualMarkers = systemMarkers(result);
  const actualText = modelVisibleSystem(result);
  if (JSON.stringify(actualMarkers) !== JSON.stringify(expectedMarkers) || actualText !== input.expectedText) {
    throw new Error(`metadata parity failed for ${input.caseId}`);
  }
  return {
    caseId: input.caseId,
    outcome: input.expectedOutcome ?? "injected_with_parity",
    markerCount: actualMarkers.length,
    markerOrderSha256: sha256(JSON.stringify(actualMarkers)),
    expectedMarkerOrderSha256: sha256(JSON.stringify(expectedMarkers)),
    modelVisibleTextSha256: sha256(actualText),
    expectedModelVisibleTextSha256: sha256(input.expectedText),
    status: "pass",
  };
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifacts: Array<{ file: string; sha256: string }> = [];
  const providerFixtures = providerFixtureInputs.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    provenance: "synthetic",
    input: fixture.input,
    result: normalizeProviderUsage(fixture.input),
  }));
  artifacts.push(writeArtifact("PROVIDER-USAGE-SYNTHETIC.json", {
    schemaVersion: 2,
    measurementModuleId: "M2",
    formalDataState: "blocked",
    fixtures: providerFixtures,
  }));

  const encoding = get_encoding("o200k_base");
  const segments = [
    { component: "staticTemplate" as const, text: "<tool name=\"skill_search\">query</tool>" },
    { component: "executionContract" as const, text: "\nCall only when a reusable team procedure is needed." },
    { component: "runtimeBinding" as const, text: "\nsession_id=synthetic-session" },
    { component: "dynamicAsset" as const, text: "\n<available_skills>typescript-testing</available_skills>" },
  ];
  const providerVisibleInjection = segments.map((segment) => segment.text).join("");
  const tokenLedger = buildTokenLedger({
    variantId: "V0",
    runId: "synthetic-m2-evidence",
    providerVisibleInjection,
    segments,
    tokenizer: {
      id: "o200k_base",
      version: "tiktoken-1.0.22",
      count: (text) => encoding.encode(text).length,
    },
  });
  encoding.free();
  artifacts.push(writeArtifact("TOKEN-LEDGER-SYNTHETIC.json", {
    formalDataState: "blocked",
    ledger: tokenLedger,
  }));

  const usage = providerFixtures[1].result;
  const runIsolation = buildRunIsolationEvidence({
    runId: tokenLedger.runId,
    runNamespace: "task1/synthetic-m2-evidence",
    caseId: "synthetic-case",
    variantId: tokenLedger.variantId,
    repeatIndex: 0,
    caseInputControlSha256: SHA.caseInput,
    comparisonGroupSha256: SHA.comparisonGroup,
    providerRequestSha256: SHA.providerRequest,
    counterfactualRole: null,
    session: { id: "synthetic-session", fresh: true },
    memoryProxyContext: { id: "synthetic-proxy-context", fresh: true },
    snapshot: {
      id: "synthetic-snapshot",
      expectedSha256: SHA.snapshot,
      restoredSha256: SHA.snapshot,
      restoreSucceeded: true,
    },
    visibleAssetsSha256: SHA.visibleAssets,
    localState: {
      pathId: "synthetic-local-state",
      fresh: true,
      inheritedHistory: false,
    },
    usage,
  });
  const eligibility = buildM2EligibilityEvidence({
    formalDataState: "blocked",
    evaluationLayer: "mock-contract",
    usage,
    tokenLedger,
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
  artifacts.push(writeArtifact("ISOLATION-ELIGIBILITY-SYNTHETIC.json", {
    formalDataState: "blocked",
    runIsolation,
    eligibility,
  }));

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
  const injectedSystem = originalSystem.replace(
    "# Memory",
    "<synthetic_memory_tools />\n# Memory",
  );
  const firstText = [
    "Claude Code",
    "# Harness",
    "rules",
    "# Session-specific guidance",
    "skills",
  ].join("\n");
  const secondText = ["# Memory", "memory", "# Environment", "env"].join("\n");
  const metadataParity = {
    schemaVersion: 2,
    measurementModuleId: "M2",
    supportedScope:
      "Single text blocks and multi-text-block insertion-only rebuilds whose original blocks remain exact ordered substrings. Unsupported rewrites fail the hook closed.",
    cases: [
      await captureMetadataCase({
        caseId: "no-hook-single-marker",
        system: [{
          type: "text",
          text: "Stable system prefix",
          cache_control: { type: "ephemeral", marker: "single" },
        }],
        expectedText: "Stable system prefix",
      }),
      await captureMetadataCase({
        caseId: "anchor-single-marker",
        system: [{
          type: "text",
          text: originalSystem,
          cache_control: { type: "ephemeral", marker: "single" },
        }],
        expectedText: injectedSystem,
        hook: { id: "synthetic-single-marker", content: "<synthetic_memory_tools />" },
      }),
      await captureMetadataCase({
        caseId: "anchor-two-markers",
        system: [
          {
            type: "text",
            text: firstText,
            cache_control: { type: "ephemeral", marker: "first" },
          },
          {
            type: "text",
            text: secondText,
            cache_control: { type: "ephemeral", marker: "second" },
          },
        ],
        expectedText: [firstText, "<synthetic_memory_tools />", secondText].join("\n"),
        hook: { id: "synthetic-two-markers", content: "<synthetic_memory_tools />" },
      }),
      await captureMetadataCase({
        caseId: "anchor-two-markers-in-block-fail-closed",
        system: [
          {
            type: "text",
            text: firstText,
            cache_control: { type: "ephemeral", marker: "first" },
          },
          {
            type: "text",
            text: secondText,
            cache_control: { type: "ephemeral", marker: "second" },
          },
        ],
        expectedText: [firstText, secondText].join("\n"),
        expectedOutcome: "hook_failed_closed",
        hook: {
          id: "synthetic-two-markers-unsupported",
          content: "<synthetic_memory_tools />",
          relation: "inside_append",
        },
      }),
    ],
  };
  artifacts.push(writeArtifact("METADATA-PARITY.json", metadataParity));

  artifacts.push(writeArtifact("INTERFACE-MANIFEST.json", {
    schemaVersion: 2,
    measurementModuleId: "M2",
    formalDataState: "blocked",
    formalMetricEligibleOwner: "Integration",
    providerContracts: providerFixtureInputs.map((fixture) => ({
      fixtureId: fixture.fixtureId,
      provider: fixture.input.provider,
      schema: fixture.input.schema,
      apiVersion: fixture.input.apiVersion,
      adapterVersion: fixture.input.adapterVersion,
      requiredFields: fixture.input.requiredFields,
      unsupportedFields: fixture.input.unsupportedFields,
    })),
    tokenAccounting: {
      authoritative: ["totalInjectionTokens", "toolDescriptionStaticTokens"],
      diagnostics: [
        "staticTemplateTokens",
        "executionContractTokens",
        "runtimeBindingTokens",
        "dynamicAssetTokens",
      ],
      componentRule: "independently_encoded_non_additive",
      providerUsageRule: "never add local token estimates to provider totals",
    },
    hashSemantics: {
      caseInputControlSha256: "Frozen case/query/context control; excludes Variant prompt text.",
      comparisonGroupSha256: "Binds planned variant, counterfactual, or repeat comparison members.",
      providerRequestSha256: "Complete provider request; diagnostic and only equality-gated for repeat comparisons.",
      snapshotSha256: "Expected and restored MemoryProxy asset snapshot identity.",
      visibleAssetsSha256: "Exact provider-visible asset-set identity.",
    },
    comparisonPurposes: {
      variant: "Same case input and repeat; Prompt Variant and full provider request may differ.",
      counterfactual: "Same comparison group and repeat; positive/negative case inputs and requests must differ.",
      repeat: "Same case, Variant, input, and complete provider request; repeat index and run state differ.",
      none: "Ordinary run; paired evidence is not required.",
    },
    m0Integration: {
      requiredInterface: "M0_EVALUATION_PREFIX",
      terminalCosts: [
        "providerInputToEvaluationHorizon",
        "providerInputToTerminalGivenSuccess",
        "modelRoundsToTerminal",
        "tdaiCallCount",
        "timeToTerminalMs",
      ],
    },
    metadataParityScope: metadataParity.supportedScope,
  }));

  artifacts.push(writeArtifact("NO-MODEL-GATE.json", {
    schemaVersion: 2,
    measurementModuleId: "M2",
    status: "FORMAL_DATA_BLOCKED",
    modelRuns: 0,
    codexProcessesStarted: 0,
    providerRequestsIssued: 0,
    servicesStarted: false,
    authFilesRead: false,
    authFilesCopied: false,
    providerFixtures: "synthetic_only",
    finalEligibilityFieldPresent: false,
    finalEligibilityOwner: "Integration",
    m2EvidenceStatus: eligibility.m2EvidenceStatus,
    blockers: eligibility.blockers,
    tokenLedgerCanonicalSha256: tokenLedger.canonicalSha256,
  }));

  writeArtifact("ARTIFACT-SHA256.json", {
    schemaVersion: 2,
    measurementModuleId: "M2",
    artifacts,
  });
}

await main();
