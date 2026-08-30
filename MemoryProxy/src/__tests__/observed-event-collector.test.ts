import { describe, expect, it } from "vitest";

import {
  collectObservedToolEvents as collectObservedToolEventsRaw,
} from "../../eval/tool-prompt-bench/measurement-v2/observed-event-collector.js";
import { projectObservedBridgeTrace } from "../../eval/tool-prompt-bench/measurement-v2/observed-bridge-trace-projector.js";

interface EventOptions {
  source: "memory-proxy" | "memory-knowledge";
  processInstanceId: string;
  sequence: number;
  micros: string;
  kind: "ready" | "begin" | "completion" | "seal";
  event?: Record<string, unknown>;
}

type ObserverSource = EventOptions["source"];

function collectObservedToolEvents(
  input: Omit<Parameters<typeof collectObservedToolEventsRaw>[0], "expectedKnowledgeInstanceId">
    & { readonly expectedKnowledgeInstanceId?: string },
) {
  return collectObservedToolEventsRaw({
    expectedKnowledgeInstanceId: "knowledge-instance-a",
    ...input,
  });
}

function line(options: EventOptions): string {
  return JSON.stringify({
    schemaVersion: "task1.tool-observer-event.v1",
    campaignId: "campaign-r04",
    observedAt: "2026-08-30T03:00:00.000Z",
    wallTimeUnixMicros: options.micros,
    ...options,
  });
}

function jsonl(...lines: string[]): string {
  const last = JSON.parse(lines.at(-1)!) as {
    source: ObserverSource;
    processInstanceId: string;
    sequence: number;
    wallTimeUnixMicros: string;
  };
  const seal = line({
    source: last.source,
    processInstanceId: last.processInstanceId,
    sequence: last.sequence + 1,
    micros: String(BigInt(last.wallTimeUnixMicros) + 1_000_000n),
    kind: "seal",
    event: { lastDataSequence: last.sequence },
  });
  return `${[...lines, seal].join("\n")}\n`;
}

function ready(
  source: "memory-proxy" | "memory-knowledge",
  processInstanceId: string,
): string {
  return line({ source, processInstanceId, sequence: 0, micros: "90", kind: "ready" });
}

function memoryBegin(
  sequence: number,
  micros: string,
  sessionId?: string,
): string {
  return line({
    source: "memory-proxy",
    processInstanceId: "proxy-instance-a",
    sequence,
    micros,
    kind: "begin",
    event: {
      correlationId: `memory-${sequence}`,
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      requestBody: { query: "release gate" },
      requestBodyCapture: { outcome: "captured", rawBodySha256: "a".repeat(64) },
      correlationHeaders: sessionId === undefined
        ? {}
        : { "x-conversation-id": sessionId },
    },
  });
}

function memoryCompletion(sequence: number, micros: string): string {
  return line({
    source: "memory-proxy",
    processInstanceId: "proxy-instance-a",
    sequence,
    micros,
    kind: "completion",
    event: {
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: `memory-${sequence - 1}`,
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      outcome: "response",
      status: 200,
      responseBody: { records: [] },
      responseBodySha256: "b".repeat(64),
      durationMs: 2,
    },
  });
}

const runA = {
  runId: "run-a",
  caseId: "case-a",
  variantId: "V0",
  sessionId: "session-a",
  startedAtUnixMicros: "100",
  finishedAtUnixMicros: "200",
};

describe("collectObservedToolEvents", () => {
  it("rejects a continuous prefix that has no final sink seal", () => {
    expect(() => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: `${ready("memory-proxy", "proxy-instance-a")}\n`,
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    })).toThrow(/end with seal/i);
  });

  it("validates both ready receipts and associates a complete exact-session trace", () => {
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", "session-a"),
        memoryCompletion(2, "130"),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.issues).toEqual([]);
    expect(result.formalCampaignEligible).toBe(true);
    expect(result.unassignedEvents).toEqual([]);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      runId: "run-a",
      caseId: "case-a",
      variantId: "V0",
      sessionId: "session-a",
      entries: [{ correlationId: "memory-1" }],
      completions: [{ correlationId: "memory-1", status: 200 }],
      formalTraceEligible: true,
      issues: [],
    });
  });

  it("rejects a Knowledge observer file from a different runtime instance", () => {
    expect(() => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      expectedKnowledgeInstanceId: "knowledge-instance-b",
      runs: [runA],
      memoryProxyJsonl: jsonl(ready("memory-proxy", "proxy-instance-a")),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    })).toThrow(/Knowledge.*instance mismatch/i);
  });

  it("marks a run ineligible when either observer seals before the run finishes", () => {
    const earlyProxySeal = line({
      source: "memory-proxy",
      processInstanceId: "proxy-instance-a",
      sequence: 1,
      micros: "150",
      kind: "seal",
      event: { lastDataSequence: 0 },
    });
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: `${ready("memory-proxy", "proxy-instance-a")}\n${earlyProxySeal}\n`,
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.runs[0].formalTraceEligible).toBe(false);
    expect(result.runs[0].issues).toEqual([
      expect.objectContaining({
        code: "observer_lifecycle_does_not_cover_run",
        source: "memory-proxy",
      }),
    ]);
  });

  it("keeps a missing or wrong session event inside its unique active run", () => {
    const forSession = (sessionId: string | undefined) => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", sessionId),
        memoryCompletion(2, "130"),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(forSession(undefined).runs[0].entries).toHaveLength(1);
    expect(forSession("wrong-session").runs[0].entries).toHaveLength(1);
    expect(forSession("wrong-session").runs[0].entries[0]).toMatchObject({
      correlationHeaders: { "x-conversation-id": "wrong-session" },
    });
  });

  it("does not assign a wrong session to an inactive run with that session id", () => {
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA, {
        runId: "run-b",
        caseId: "case-b",
        variantId: "V0",
        sessionId: "session-b",
        startedAtUnixMicros: "300",
        finishedAtUnixMicros: "400",
      }],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", "session-b"),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.runs[0].entries).toHaveLength(1);
    expect(result.runs[1].entries).toHaveLength(0);
  });

  it("refuses to guess when an event falls inside overlapping run windows", () => {
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [
        { ...runA, finishedAtUnixMicros: "250" },
        {
          runId: "run-b",
          caseId: "case-b",
          variantId: "V0",
          sessionId: "session-b",
          startedAtUnixMicros: "200",
          finishedAtUnixMicros: "350",
        },
      ],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "220", undefined),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.runs.every((run) => run.entries.length === 0)).toBe(true);
    expect(result.unassignedEvents).toHaveLength(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "overlapping_run_windows" }),
      expect.objectContaining({ code: "ambiguous_event_run" }),
    ]));
  });

  it("accepts the production Knowledge composite session only with agent source codex", () => {
    const knowledgeBegin = (agentSource?: string) => line({
      source: "memory-knowledge",
      processInstanceId: "knowledge-instance-a",
      sequence: 1,
      micros: "120",
      kind: "begin",
      event: {
        correlationId: "knowledge-1",
        family: "knowledge",
        endpoint: "/v3/tools/list",
        method: "POST",
        requestBody: { knowledge_id: "wiki-a" },
        requestBodyCapture: { outcome: "captured", rawBodySha256: "c".repeat(64) },
        correlationHeaders: {
          "x-conversation-id": "codex:session-a",
          ...(agentSource === undefined ? {} : { "x-tdai-agent-source": agentSource }),
        },
      },
    });
    const collect = (agentSource?: string) => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(ready("memory-proxy", "proxy-instance-a")),
      memoryKnowledgeJsonl: jsonl(
        ready("memory-knowledge", "knowledge-instance-a"),
        knowledgeBegin(agentSource),
      ),
    });

    expect(collect("codex").runs[0].entries).toHaveLength(1);
    // Without agent source it is still preserved by the unique time window,
    // but the raw mismatched header remains for the projector to mark malformed.
    expect(collect(undefined).runs[0].entries[0]).toMatchObject({
      correlationHeaders: { "x-conversation-id": "codex:session-a" },
    });
  });

  it("preserves a secret-safe failure hash through collection and projection", () => {
    const messageSha256 = "e".repeat(64);
    const failureCompletion = line({
      source: "memory-proxy",
      processInstanceId: "proxy-instance-a",
      sequence: 2,
      micros: "130",
      kind: "completion",
      event: {
        schemaVersion: "task1.tool-execution-completion.v1",
        correlationId: "memory-1",
        family: "memory",
        endpoint: "/memory-bridge/v3/atomic/search",
        method: "POST",
        outcome: "failure",
        status: null,
        durationMs: 2,
        failure: { name: "TypeError", messageSha256 },
      },
    });
    const collected = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", "session-a"),
        failureCompletion,
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });
    const projected = projectObservedBridgeTrace({
      runId: runA.runId,
      caseId: runA.caseId,
      variantId: runA.variantId,
      activeSessionId: runA.sessionId,
      turnCompletion: { outcome: "completed" },
      entries: collected.runs[0].entries,
      completions: collected.runs[0].completions,
    });

    expect(projected.rawEvidence.completions[0]).toMatchObject({
      failure: { name: "TypeError", messageSha256 },
    });
    expect(projected.observation.rawTraceStatus).toBe("partial");
  });

  it("does not attach a completion at the half-open run boundary", () => {
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", "session-a"),
        memoryCompletion(2, "200"),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.runs[0].entries).toHaveLength(1);
    expect(result.runs[0].completions).toHaveLength(0);
    expect(result.unassignedEvents).toEqual([
      expect.objectContaining({ kind: "completion", correlationId: "memory-1" }),
    ]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unassigned_event_run" }),
    ]));
    expect(result.formalCampaignEligible).toBe(false);
  });

  it("uses half-open windows so touching serial runs are not ambiguous", () => {
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA, {
        runId: "run-b",
        caseId: "case-b",
        variantId: "V0",
        sessionId: "session-b",
        startedAtUnixMicros: "200",
        finishedAtUnixMicros: "300",
      }],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "200", "session-b"),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.issues).toEqual([]);
    expect(result.runs[0].entries).toHaveLength(0);
    expect(result.runs[1].entries).toHaveLength(1);
  });

  it("marks one run ineligible instead of inventing cross-service tie order", () => {
    const knowledgeBegin = line({
      source: "memory-knowledge",
      processInstanceId: "knowledge-instance-a",
      sequence: 1,
      micros: "120",
      kind: "begin",
      event: {
        correlationId: "knowledge-tie",
        family: "knowledge",
        endpoint: "/v3/tools/list",
        method: "POST",
        requestBody: { knowledge_id: "wiki-a" },
        requestBodyCapture: { outcome: "captured", rawBodySha256: "f".repeat(64) },
        correlationHeaders: {
          "x-conversation-id": "codex:session-a",
          "x-tdai-agent-source": "codex",
        },
      },
    });
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", "session-a"),
      ),
      memoryKnowledgeJsonl: jsonl(
        ready("memory-knowledge", "knowledge-instance-a"),
        knowledgeBegin,
      ),
    });

    expect(result.runs[0].formalTraceEligible).toBe(false);
    expect(result.runs[0].issues).toEqual([
      expect.objectContaining({ code: "cross_source_timestamp_tie" }),
    ]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "cross_source_timestamp_tie",
        runIds: ["run-a"],
      }),
    ]));
  });

  it("rejects a tool family written by the wrong service on begin or completion", () => {
    const proxyKnowledgeBegin = line({
      source: "memory-proxy",
      processInstanceId: "proxy-instance-a",
      sequence: 1,
      micros: "120",
      kind: "begin",
      event: {
        correlationId: "wrong-source-begin",
        family: "knowledge",
        endpoint: "/v3/tools/list",
        method: "POST",
        requestBodyCapture: { outcome: "empty" },
        correlationHeaders: {},
      },
    });
    const knowledgeMemoryCompletion = line({
      source: "memory-knowledge",
      processInstanceId: "knowledge-instance-a",
      sequence: 1,
      micros: "120",
      kind: "completion",
      event: {
        schemaVersion: "task1.tool-execution-completion.v1",
        correlationId: "wrong-source-completion",
        family: "memory",
        endpoint: "/memory-bridge/v3/atomic/search",
        method: "POST",
        outcome: "response",
        status: 200,
        responseBody: { records: [] },
        responseBodySha256: "9".repeat(64),
        durationMs: 1,
      },
    });

    expect(() => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        proxyKnowledgeBegin,
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    })).toThrow(/source.*family/i);
    expect(() => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(ready("memory-proxy", "proxy-instance-a")),
      memoryKnowledgeJsonl: jsonl(
        ready("memory-knowledge", "knowledge-instance-a"),
        knowledgeMemoryCompletion,
      ),
    })).toThrow(/source.*family/i);
  });

  it("preserves source sequence and fails closed when one process wall clock regresses", () => {
    const result = collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [{ ...runA, finishedAtUnixMicros: "300" }],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "180", "session-a"),
        memoryBegin(2, "150", "session-a"),
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    });

    expect(result.runs[0].entries.map((entry) => entry.correlationId)).toEqual([
      "memory-1",
      "memory-2",
    ]);
    expect(result.runs[0].formalTraceEligible).toBe(false);
    expect(result.formalCampaignEligible).toBe(false);
    expect(result.runs[0].issues).toEqual([
      expect.objectContaining({ code: "source_wall_time_regression" }),
    ]);
  });

  it("rejects a damaged response completion with no HTTP status", () => {
    const invalidCompletion = line({
      source: "memory-proxy",
      processInstanceId: "proxy-instance-a",
      sequence: 2,
      micros: "130",
      kind: "completion",
      event: {
        schemaVersion: "task1.tool-execution-completion.v1",
        correlationId: "memory-1",
        family: "memory",
        endpoint: "/memory-bridge/v3/atomic/search",
        method: "POST",
        outcome: "response",
        status: null,
        responseBodySha256: "a".repeat(64),
        durationMs: 1,
      },
    });

    expect(() => collectObservedToolEvents({
      campaignId: "campaign-r04",
      expectedProxyInstanceId: "proxy-instance-a",
      runs: [runA],
      memoryProxyJsonl: jsonl(
        ready("memory-proxy", "proxy-instance-a"),
        memoryBegin(1, "120", "session-a"),
        invalidCompletion,
      ),
      memoryKnowledgeJsonl: jsonl(ready("memory-knowledge", "knowledge-instance-a")),
    })).toThrow(/response.*status/i);
  });
});
