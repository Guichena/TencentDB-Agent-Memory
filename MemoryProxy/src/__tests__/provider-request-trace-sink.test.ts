import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sealProductionPromptSourceManifest } from "../injection/production-source.js";

import {
  createProviderRequestTraceSinkFromEnv,
  extractCompletedResponseUsage,
  PROVIDER_REQUEST_EVENT_SCHEMA,
} from "../provider-request-trace-sink.js";

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("MemoryProxy provider request trace sink", () => {
  it("is disabled outside an explicit formal campaign", async () => {
    const sink = createProviderRequestTraceSinkFromEnv({
      TDAI_EVAL_TRACE_DIR: mkdtempSync(join(tmpdir(), "task1-provider-disabled-")),
    }, { processInstanceId: "proxy-a" });

    expect(sink.enabled).toBe(false);
    expect(sink.filePath).toBeUndefined();
    expect(() => sink.observeRequest({
      correlationId: "request-a",
      method: "POST",
      path: "/codex/space-a/v1/responses",
      rawBody: "{}",
      body: {},
      correlationHeaders: {},
    })).not.toThrow();
    await expect(sink.markFinished()).resolves.toBeUndefined();
  });

  it("records exact request evidence and per-request usage without credentials", async () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-provider-trace-"));
    const instants = [
      new Date("2026-08-30T02:00:00.000Z"),
      new Date("2026-08-30T02:00:00.001Z"),
      new Date("2026-08-30T02:00:00.002Z"),
      new Date("2026-08-30T02:00:00.003Z"),
    ];
    const sink = createProviderRequestTraceSinkFromEnv({
      TDAI_EVAL_TRACE_DIR: traceRoot,
      TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-provider",
    }, {
      processInstanceId: "proxy-instance-a",
      now: () => instants.shift() ?? new Date("2026-08-30T02:00:00.003Z"),
      wallTimeUnixMicros: (() => {
        const values = ["2000000", "2001000", "2002000", "2003000"];
        return () => values.shift() ?? "2003000";
      })(),
    });

    expect(sink.filePath).toBe(join(
      traceRoot,
      "campaign-r04-provider",
      "memory-proxy.provider-requests.jsonl",
    ));
    sink.markReady();
    const rawBody = JSON.stringify({
      model: "gpt-5.6-luna",
      instructions: "<tdai_memory_tools>search when needed</tdai_memory_tools>",
      input: [{ role: "user", content: "find the release decision" }],
      metadata: { authorization: "Bearer body-secret" },
    });
    const providerVisibleInjection = "<tdai_memory_tools>search when needed</tdai_memory_tools>";
    const productionSourceManifest = sealProductionPromptSourceManifest(
      providerVisibleInjection,
      [{
        sourceId: "test-memory-tools",
        sourceKind: "static-tool",
        injectionBlockId: "tdai-memory-tools",
        text: providerVisibleInjection,
      }],
    );
    sink.observeRequest({
      correlationId: "request-a",
      method: "POST",
      path: "/codex/space-a/v1/responses",
      rawBody,
      body: JSON.parse(rawBody) as Record<string, unknown>,
      productionSourceManifest,
      correlationHeaders: {
        "x-conversation-id": "session-a",
        authorization: "Bearer header-secret",
        "x-tdai-user-key": "user-secret",
      },
    });
    sink.observeCompletion({
      correlationId: "request-a",
      status: 200,
      responseHeaders: {
        "x-request-id": "upstream-request-a",
        authorization: "Bearer response-secret",
      },
      usage: {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 80 },
        output_tokens: 14,
        total_tokens: 134,
      },
    });
    await sink.markFinished();

    const raw = readFileSync(sink.filePath!, "utf8");
    const events = readJsonl(sink.filePath!);
    expect(events.map((event) => ({
      schemaVersion: event.schemaVersion,
      kind: event.kind,
      source: event.source,
      processInstanceId: event.processInstanceId,
      sequence: event.sequence,
    }))).toEqual([
      {
        schemaVersion: PROVIDER_REQUEST_EVENT_SCHEMA,
        kind: "ready",
        source: "memory-proxy-provider",
        processInstanceId: "proxy-instance-a",
        sequence: 0,
      },
      {
        schemaVersion: PROVIDER_REQUEST_EVENT_SCHEMA,
        kind: "request",
        source: "memory-proxy-provider",
        processInstanceId: "proxy-instance-a",
        sequence: 1,
      },
      {
        schemaVersion: PROVIDER_REQUEST_EVENT_SCHEMA,
        kind: "completion",
        source: "memory-proxy-provider",
        processInstanceId: "proxy-instance-a",
        sequence: 2,
      },
      {
        schemaVersion: PROVIDER_REQUEST_EVENT_SCHEMA,
        kind: "seal",
        source: "memory-proxy-provider",
        processInstanceId: "proxy-instance-a",
        sequence: 3,
      },
    ]);
    expect(events[1]?.event).toMatchObject({
      correlationId: "request-a",
      rawBodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      body: {
        model: "gpt-5.6-luna",
        instructions: "<tdai_memory_tools>search when needed</tdai_memory_tools>",
        metadata: { authorization: "[REDACTED]" },
      },
      correlationHeaders: { "x-conversation-id": "session-a" },
      productionSourceEvidence: {
        correlationId: "request-a",
        rawBodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceManifestSha256: productionSourceManifest.canonicalSha256,
        providerVisibleTextSha256: productionSourceManifest.providerVisibleTextSha256,
        bindingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    const requestEvent = events[1]?.event as Record<string, unknown>;
    const sourceEvidence = requestEvent.productionSourceEvidence as Record<string, unknown>;
    expect(sourceEvidence.rawBodySha256).toBe(requestEvent.rawBodySha256);
    expect(events[2]?.event).toMatchObject({
      status: 200,
      responseHeaders: { "x-request-id": "upstream-request-a" },
      usage: {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 80 },
      },
    });
    expect(raw).not.toContain("body-secret");
    expect(raw).not.toContain("header-secret");
    expect(raw).not.toContain("user-secret");
    expect(raw).not.toContain("response-secret");
  });

  it("waits for tracked response readers before sealing", async () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-provider-drain-"));
    const sink = createProviderRequestTraceSinkFromEnv({
      TDAI_EVAL_TRACE_DIR: traceRoot,
      TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-drain",
    }, { processInstanceId: "proxy-drain" });
    sink.markReady();

    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = () => {
        sink.observeCompletion({
          correlationId: "late-response",
          status: 200,
          responseHeaders: {},
          usage: { input_tokens: 7 },
        });
        resolve();
      };
    });
    sink.track(pending);
    let sealed = false;
    const finishing = sink.markFinished().then(() => { sealed = true; });
    await Promise.resolve();
    expect(sealed).toBe(false);
    release();
    await finishing;

    expect(readJsonl(sink.filePath!).map((event) => event.kind)).toEqual([
      "ready",
      "completion",
      "seal",
    ]);
  });

  it("extracts usage only from a valid response.completed SSE event", () => {
    const valid = [
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}",
      "",
      "event: response.completed",
      "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":42,\"output_tokens\":3}}}",
      "",
    ].join("\n");
    expect(extractCompletedResponseUsage(valid)).toEqual({
      input_tokens: 42,
      output_tokens: 3,
    });
    expect(extractCompletedResponseUsage("data: [DONE]\n\n")).toBeNull();
    expect(extractCompletedResponseUsage("data: {broken}\n\n")).toBeNull();
  });
});
