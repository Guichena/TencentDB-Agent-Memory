import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createToolExecutionTraceSinkFromEnv,
  TOOL_OBSERVER_EVENT_SCHEMA,
} from "../tool-execution-trace-sink.js";

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("MemoryProxy tool execution trace sink", () => {
  it("is completely disabled unless both formal trace variables are present", () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-proxy-trace-disabled-"));
    const sink = createToolExecutionTraceSinkFromEnv({
      TDAI_EVAL_TRACE_DIR: traceRoot,
    });

    expect(sink.enabled).toBe(false);
    expect(sink.entryObserver).toBeUndefined();
    expect(sink.completionObserver).toBeUndefined();
    expect(sink.filePath).toBeUndefined();
    expect(() => sink.markReady()).not.toThrow();
  });

  it("writes ready, begin, and completion in process order without secrets", () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-proxy-trace-"));
    const instants = [
      new Date("2026-08-30T01:00:00.000Z"),
      new Date("2026-08-30T01:00:00.001Z"),
      new Date("2026-08-30T01:00:00.002Z"),
    ];
    const micros = ["1000000", "1001000", "1002000"];
    const sink = createToolExecutionTraceSinkFromEnv(
      {
        TDAI_EVAL_TRACE_DIR: traceRoot,
        TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-a",
      },
      {
        randomId: () => "proxy-instance-a",
        now: () => instants.shift() ?? new Date("2026-08-30T01:00:00.002Z"),
        wallTimeUnixMicros: () => micros.shift() ?? "1002000",
      },
    );

    expect(sink.enabled).toBe(true);
    expect(sink.filePath).toBe(join(
      traceRoot,
      "campaign-r04-a",
      "memory-proxy.events.jsonl",
    ));
    expect(readFileSync(sink.filePath!, "utf8")).toBe("");

    sink.markReady();
    sink.markReady();
    sink.entryObserver?.({
      correlationId: "memory-bridge:1",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      requestBody: {
        query: "release gate",
        authorization: "Bearer body-secret",
        nested: { "x-tdai-user-key": "body-user-secret" },
      },
      requestBodyCapture: { outcome: "captured", rawBodySha256: "a".repeat(64) },
      correlationHeaders: {
        "x-conversation-id": "session-a",
        authorization: "Bearer header-secret",
        "x-tdai-user-key": "header-user-secret",
      },
    });
    sink.completionObserver?.({
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: "memory-bridge:1",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      outcome: "failure",
      status: null,
      durationMs: 3,
      failure: { name: "TypeError", message: "upstream Bearer completion-secret" },
    });

    const raw = readFileSync(sink.filePath!, "utf8");
    const events = readJsonl(sink.filePath!);
    expect(events.map((event) => ({
      schemaVersion: event.schemaVersion,
      kind: event.kind,
      source: event.source,
      processInstanceId: event.processInstanceId,
      sequence: event.sequence,
      observedAt: event.observedAt,
      wallTimeUnixMicros: event.wallTimeUnixMicros,
    }))).toEqual([
      {
        schemaVersion: TOOL_OBSERVER_EVENT_SCHEMA,
        kind: "ready",
        source: "memory-proxy",
        processInstanceId: "proxy-instance-a",
        sequence: 0,
        observedAt: "2026-08-30T01:00:00.000Z",
        wallTimeUnixMicros: "1000000",
      },
      {
        schemaVersion: TOOL_OBSERVER_EVENT_SCHEMA,
        kind: "begin",
        source: "memory-proxy",
        processInstanceId: "proxy-instance-a",
        sequence: 1,
        observedAt: "2026-08-30T01:00:00.001Z",
        wallTimeUnixMicros: "1001000",
      },
      {
        schemaVersion: TOOL_OBSERVER_EVENT_SCHEMA,
        kind: "completion",
        source: "memory-proxy",
        processInstanceId: "proxy-instance-a",
        sequence: 2,
        observedAt: "2026-08-30T01:00:00.002Z",
        wallTimeUnixMicros: "1002000",
      },
    ]);
    expect(events[1]?.event).toMatchObject({
      correlationHeaders: { "x-conversation-id": "session-a" },
      requestBody: {
        query: "release gate",
        authorization: "[REDACTED]",
        nested: { "x-tdai-user-key": "[REDACTED]" },
      },
    });
    expect(events[2]?.event).toMatchObject({
      failure: {
        name: "TypeError",
        messageSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(raw).not.toContain("body-secret");
    expect(raw).not.toContain("header-secret");
    expect(raw).not.toContain("completion-secret");
  });

  it("refuses to append to an existing campaign file", () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-proxy-trace-stale-"));
    const env = {
      TDAI_EVAL_TRACE_DIR: traceRoot,
      TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-stale",
    };
    const first = createToolExecutionTraceSinkFromEnv(env, {
      randomId: () => "first-instance",
    });
    first.markReady();
    const before = readFileSync(first.filePath!, "utf8");

    const second = createToolExecutionTraceSinkFromEnv(env, {
      randomId: () => "second-instance",
    });
    second.markReady();

    expect(second.enabled).toBe(false);
    expect(second.filePath).toBeUndefined();
    expect(readFileSync(first.filePath!, "utf8")).toBe(before);
  });

  it("switches to no-op when a writer fails", () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-proxy-trace-fail-open-"));
    let writes = 0;
    const sink = createToolExecutionTraceSinkFromEnv(
      {
        TDAI_EVAL_TRACE_DIR: traceRoot,
        TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-fail-open",
      },
      {
        appendLine: () => {
          writes += 1;
          throw new Error("disk unavailable");
        },
      },
    );

    expect(() => sink.markReady()).not.toThrow();
    expect(() => sink.entryObserver?.({
      correlationId: "skill-bridge:1",
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/search",
      method: "POST",
      requestBodyCapture: { outcome: "empty" },
      correlationHeaders: {},
    })).not.toThrow();
    expect(writes).toBe(1);
  });
});
