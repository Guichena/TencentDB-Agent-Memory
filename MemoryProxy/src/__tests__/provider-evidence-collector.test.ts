import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  collectProviderEvidence,
} from "../../eval/tool-prompt-bench/measurement-v2/provider-evidence-collector.js";
import {
  freezeProviderPromptSourceEvidence,
  sealProductionPromptSourceManifest,
} from "../injection/production-source.js";

const wrapper = [
  "<tdai_injections>",
  "<skill_tools>search then view</skill_tools>",
  "<tdai_memory_tools>search relevant memory</tdai_memory_tools>",
  "<knowledge_tools>list then call</knowledge_tools>",
  "</tdai_injections>",
].join("\n");

const providerBody = {
  model: "gpt-5.6-luna",
  input: [
    {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: wrapper }],
    },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "find the release decision" }],
    },
  ],
};

function line(
  sequence: number,
  micros: string,
  kind: "ready" | "request" | "completion" | "seal",
  event?: Record<string, unknown>,
): string {
  return JSON.stringify({
    schemaVersion: "task1.provider-request-event.v1",
    campaignId: "campaign-r04-provider",
    source: "memory-proxy-provider",
    processInstanceId: "proxy-instance-a",
    sequence,
    observedAt: "2026-08-30T04:00:00.000Z",
    wallTimeUnixMicros: micros,
    ...(event ? { event } : {}),
    kind,
  });
}

function sealedJsonl(
  data: Array<{
    micros: string;
    kind: "request" | "completion";
    event: Record<string, unknown>;
  }>,
): string {
  const lines = [line(0, "90", "ready")];
  for (const [index, item] of data.entries()) {
    lines.push(line(index + 1, item.micros, item.kind, item.event));
  }
  lines.push(line(
    lines.length,
    "210",
    "seal",
    { lastDataSequence: lines.length - 1 },
  ));
  return `${lines.join("\n")}\n`;
}

function requestEvent(sessionId = "session-a"): Record<string, unknown> {
  const correlationId = "provider-request-a";
  const rawBodySha256 = "a".repeat(64);
  return {
    correlationId,
    method: "POST",
    path: "/codex/space-a/v1/responses",
    rawBodySha256,
    body: providerBody,
    correlationHeaders: { "session-id": sessionId },
    productionSourceEvidence: productionSourceEvidence(correlationId, rawBodySha256),
  };
}

function completionEvent(): Record<string, unknown> {
  return {
    correlationId: "provider-request-a",
    status: 200,
    responseHeaders: { "x-request-id": "official-request-a" },
    responseBodySha256: "b".repeat(64),
    usage: {
      input_tokens: 600,
      input_tokens_details: { cached_tokens: 400 },
      output_tokens: 50,
      output_tokens_details: { reasoning_tokens: 12 },
      total_tokens: 650,
    },
  };
}

const runA = {
  runId: "run-a",
  caseId: "case-a",
  variantId: "V0",
  sessionId: "session-a",
  startedAtUnixMicros: "100",
  finishedAtUnixMicros: "200",
};

function productionSourceEvidence(correlationId: string, rawBodySha256: string) {
  const open = "<tdai_injections>\n";
  const close = "\n</tdai_injections>";
  return freezeProviderPromptSourceEvidence({
    correlationId,
    rawBodySha256,
    sourceManifest: sealProductionPromptSourceManifest(wrapper, [
      {
        sourceId: "test-wrapper:open",
        sourceKind: "static-tool",
        injectionBlockId: "tdai-injections-wrapper",
        text: open,
      },
      {
        sourceId: "test-tool-guidance",
        sourceKind: "static-tool",
        injectionBlockId: "test-tools",
        text: wrapper.slice(open.length, -close.length),
      },
      {
        sourceId: "test-wrapper:close",
        sourceKind: "static-tool",
        injectionBlockId: "tdai-injections-wrapper",
        text: close,
      },
    ]),
  });
}

const expectedPrompt = "find the release decision";
const expectedPromptsByRunId = new Map([[runA.runId, {
  userPrompt: expectedPrompt,
  userPromptSha256: createHash("sha256").update(expectedPrompt, "utf8").digest("hex"),
}]]);

describe("collectProviderEvidence", () => {
  it("joins sealed provider requests and preserves prompt/token/cache facts", () => {
    const result = collectProviderEvidence({
      campaignId: "campaign-r04-provider",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      expectedPromptsByRunId,
      providerJsonl: sealedJsonl([
        { micros: "110", kind: "request", event: requestEvent() },
        { micros: "120", kind: "completion", event: completionEvent() },
      ]),
    });

    expect(result.formalCampaignEligible).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.runs[0]).toMatchObject({
      runId: "run-a",
      formalProviderEvidenceEligible: true,
      injection: {
        encoding: "o200k_base",
        tokens: expect.any(Number),
        characters: wrapper.length,
        utf8Bytes: Buffer.byteLength(wrapper, "utf8"),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      providerUsage: {
        requestCount: 1,
        inputTokens: 600,
        cachedInputTokens: 400,
        outputTokens: 50,
        reasoningOutputTokens: 12,
        totalTokens: 650,
      },
      requests: [{
        correlationId: "provider-request-a",
        requestSequence: 1,
        requestWallTimeUnixMicros: "110",
        completionSequence: 2,
        completionWallTimeUnixMicros: "120",
        latencyMs: 1,
        providerToolDefinitionCount: 0,
        upstreamRequestId: "official-request-a",
        status: 200,
        providerVisibleInjection: wrapper,
        productionSourceEvidence: {
          correlationId: "provider-request-a",
          rawBodySha256: "a".repeat(64),
          sourceManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
          bindingSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
        providerUsageNormalization: {
          ok: true,
          provider: "openai",
          schema: "openai.responses",
          apiVersion: "v1",
          adapterVersion: "memory-proxy-provider-observer-v1",
          rawUsageCanonicalizationStatus: "ready",
          rawUsageSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
          rawUsageCanonicalClone: completionEvent().usage,
        },
        usage: {
          inputTokens: 600,
          cachedInputTokens: 400,
          outputTokens: 50,
          reasoningOutputTokens: 12,
          totalTokens: 650,
        },
      }],
    });
    expect(result.runs[0]?.injection?.tokens).toBeGreaterThan(0);
  });

  it("marks a uniquely timed request with the wrong session ineligible", () => {
    const result = collectProviderEvidence({
      campaignId: "campaign-r04-provider",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      expectedPromptsByRunId,
      providerJsonl: sealedJsonl([
        { micros: "110", kind: "request", event: requestEvent("wrong-session") },
        { micros: "120", kind: "completion", event: completionEvent() },
      ]),
    });

    expect(result.runs[0]?.formalProviderEvidenceEligible).toBe(false);
    expect(result.runs[0]?.issues).toEqual([
      expect.objectContaining({ code: "provider_session_mismatch" }),
    ]);
  });

  it("keeps a correlation-bound provider completion at the closed run boundary", () => {
    const result = collectProviderEvidence({
      campaignId: "campaign-r04-provider",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      expectedPromptsByRunId,
      providerJsonl: sealedJsonl([
        { micros: "110", kind: "request", event: requestEvent() },
        { micros: "200", kind: "completion", event: completionEvent() },
      ]),
    });

    expect(result.runs[0]?.formalProviderEvidenceEligible).toBe(true);
    expect(result.runs[0]?.issues).toEqual([]);
  });

  it("rejects an unsealed provider prefix", () => {
    expect(() => collectProviderEvidence({
      campaignId: "campaign-r04-provider",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      expectedPromptsByRunId,
      providerJsonl: `${line(0, "90", "ready")}\n`,
    })).toThrow(/end with seal/i);
  });

  it("rejects a one-character drift from the frozen provider user prompt", () => {
    const changedBody = structuredClone(providerBody);
    changedBody.input[1]!.content[0]!.text = "find the release decisioN";
    const result = collectProviderEvidence({
      campaignId: "campaign-r04-provider",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      expectedPromptsByRunId,
      providerJsonl: sealedJsonl([
        {
          micros: "110",
          kind: "request",
          event: { ...requestEvent(), body: changedBody },
        },
        { micros: "120", kind: "completion", event: completionEvent() },
      ]),
    });

    expect(result.runs[0]?.formalProviderEvidenceEligible).toBe(false);
    expect(result.runs[0]?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provider_prompt_audit_failed" }),
    ]));
  });
});
