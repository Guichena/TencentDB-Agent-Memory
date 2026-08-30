import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  closeServerAndSealTrace,
  createToolExecutionTraceSinkFromEnv,
} from "./tool-execution-trace-sink.js";

describe("MemoryKnowledge tool execution trace sink", () => {
  it("does not seal until the Knowledge HTTP server has drained", async () => {
    const order: string[] = [];
    let finishClose: ((error?: Error) => void) | undefined;
    const closing = closeServerAndSealTrace({
      close: (callback) => {
        order.push("close-started");
        finishClose = callback;
      },
    }, {
      markFinished: () => order.push("sealed"),
    });

    expect(order).toEqual(["close-started"]);
    finishClose?.();
    await closing;
    expect(order).toEqual(["close-started", "sealed"]);
  });

  it("uses its own file and the same ready/begin/completion contract", () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-knowledge-trace-"));
    const sink = createToolExecutionTraceSinkFromEnv(
      {
        TDAI_EVAL_TRACE_DIR: traceRoot,
        TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-knowledge",
      },
      {
        randomId: () => "knowledge-instance-a",
        now: () => new Date("2026-08-30T02:00:00.000Z"),
        wallTimeUnixMicros: () => "2000000",
      },
    );

    expect(sink.enabled).toBe(true);
    expect(sink.filePath).toBe(join(
      traceRoot,
      "campaign-r04-knowledge",
      "memory-knowledge.events.jsonl",
    ));
    sink.markReady();
    sink.entryObserver?.({
      correlationId: "knowledge-tools:1",
      family: "knowledge",
      endpoint: "/v3/tools/list",
      method: "POST",
      requestBody: { knowledge_id: "wiki-a" },
      requestBodyCapture: { outcome: "captured", rawBodySha256: "b".repeat(64) },
      correlationHeaders: {
        "x-conversation-id": "codex:session-a",
        "x-tdai-agent-source": "codex",
      },
    });
    sink.completionObserver?.({
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: "knowledge-tools:1",
      family: "knowledge",
      endpoint: "/v3/tools/list",
      method: "POST",
      outcome: "response",
      status: 200,
      responseBody: { tools: [{ name: "wiki_search" }] },
      responseBodySha256: "c".repeat(64),
      durationMs: 2,
    });
    sink.markFinished();

    const events = readFileSync(sink.filePath!, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => [event.kind, event.source, event.sequence])).toEqual([
      ["ready", "memory-knowledge", 0],
      ["begin", "memory-knowledge", 1],
      ["completion", "memory-knowledge", 2],
      ["seal", "memory-knowledge", 3],
    ]);
    expect(events[1]?.event).toMatchObject({
      correlationHeaders: {
        "x-conversation-id": "codex:session-a",
        "x-tdai-agent-source": "codex",
      },
    });
  });

  it("drops raw 5xx response bodies but keeps their hash", () => {
    const traceRoot = mkdtempSync(join(tmpdir(), "task1-knowledge-trace-5xx-"));
    const sink = createToolExecutionTraceSinkFromEnv({
      TDAI_EVAL_TRACE_DIR: traceRoot,
      TDAI_EVAL_CAMPAIGN_ID: "campaign-r04-knowledge-5xx",
    });
    sink.markReady();
    sink.completionObserver?.({
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: "knowledge-tools:failure",
      family: "knowledge",
      endpoint: "/v3/tools/call",
      method: "POST",
      outcome: "response",
      status: 500,
      responseBody: { message: "Bearer server-side-secret" },
      responseBodySha256: "d".repeat(64),
      durationMs: 2,
    });
    sink.markFinished();

    const raw = readFileSync(sink.filePath!, "utf8");
    const events = raw.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events[1]?.event).toMatchObject({
      status: 500,
      responseBodySha256: "d".repeat(64),
    });
    expect(events[1]?.event).not.toHaveProperty("responseBody");
    expect(raw).not.toContain("server-side-secret");
  });
});
