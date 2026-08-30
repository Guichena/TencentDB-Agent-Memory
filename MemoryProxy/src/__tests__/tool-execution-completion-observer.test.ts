import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  observeBridgeExecution,
  type ObservedBridgeCompletion,
  type ObservedBridgeEntry,
} from "../bridge-entry-observer.js";
import { DEFAULT_CONFIG } from "../config.js";
import { createMemoryBridgeHandler } from "../memory/memory-bridge.js";
import { createSkillBridgeHandler } from "../skill/skill-bridge.js";
import type { ProxyConfig } from "../types.js";
import {
  observeKnowledgeToolsExecution,
  type ObservedKnowledgeToolsCompletion,
  type ObservedKnowledgeToolsEntry,
} from "../../../MemoryKnowledge/src/tools-entry-observer.js";
import { createToolsRoutes } from "../../../MemoryKnowledge/src/routes/tools.js";

function bridgeConfig(): ProxyConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.tdai = {
    ...config.tdai,
    enabled: true,
    endpoint: "http://core.test",
  };
  config.coreSkill = {
    ...config.coreSkill,
    endpoint: "http://core.test",
  };
  return config;
}

describe("tool execution completion observation", () => {
  it("records one immutable 2xx completion without consuming the real response", async () => {
    const entries: ObservedBridgeEntry[] = [];
    const completions: ObservedBridgeCompletion[] = [];
    const ticks = [100, 107];
    const response = await observeBridgeExecution(
      new Request("http://proxy.test/memory-bridge/v3/atomic/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-conversation-id": "session-a",
          authorization: "Bearer must-not-be-observed",
          "x-tdai-user-key": "must-not-be-observed",
        },
        body: JSON.stringify({ query: "release gate" }),
      }),
      "memory",
      () => Promise.resolve(new Response('{"code":0,"data":{"ok":true}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
      {
        entryObserver: (entry) => entries.push(entry),
        completionObserver: (completion) => completions.push(completion),
        now: () => ticks.shift() ?? 107,
      },
    );

    expect(await response.json()).toEqual({ code: 0, data: { ok: true } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestBodyCapture: {
        outcome: "captured",
        rawBodySha256: "63a882b91f9854c062af93f587a30ae6bbc67ad44ffd4448e170a808e8c0fdd0",
      },
    });
    expect(Object.isFrozen(entries[0].requestBodyCapture)).toBe(true);
    expect(completions).toEqual([{
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: entries[0].correlationId,
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      outcome: "response",
      status: 200,
      responseBody: { code: 0, data: { ok: true } },
      responseBodySha256: "a83d5cef32724b027df56066bf355fd451b2fd2b498388d836fde234c7d83cb2",
      durationMs: 7,
    }]);
    expect(Object.isFrozen(completions[0])).toBe(true);
    expect(Object.isFrozen(completions[0].responseBody)).toBe(true);
    expect(Object.isFrozen((completions[0].responseBody as { data: object }).data)).toBe(true);
    expect(JSON.stringify({ entries, completions })).not.toContain("must-not-be-observed");
  });

  it("records a frozen failure completion and rethrows the original handler error", async () => {
    const entries: ObservedBridgeEntry[] = [];
    const completions: ObservedBridgeCompletion[] = [];
    const expectedError = new TypeError("upstream bridge exploded");
    const ticks = [10, 14];

    await expect(observeBridgeExecution(
      new Request("http://proxy.test/skill-bridge/v3/skill/search", { method: "POST" }),
      "skill",
      () => Promise.reject(expectedError),
      {
        entryObserver: (entry) => {
          entries.push(entry);
          throw new Error("entry observer unavailable");
        },
        completionObserver: (completion) => {
          completions.push(completion);
          throw new Error("completion observer unavailable");
        },
        now: () => ticks.shift() ?? 14,
      },
    )).rejects.toBe(expectedError);

    expect(entries).toHaveLength(1);
    expect(entries[0].requestBodyCapture).toEqual({ outcome: "empty" });
    expect(Object.isFrozen(entries[0].requestBodyCapture)).toBe(true);
    expect(completions).toEqual([{
      schemaVersion: "task1.tool-execution-completion.v1",
      correlationId: entries[0].correlationId,
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/search",
      method: "POST",
      outcome: "failure",
      status: null,
      durationMs: 4,
      failure: { name: "TypeError", message: "upstream bridge exploded" },
    }]);
    expect(Object.isFrozen(completions[0])).toBe(true);
    expect(Object.isFrozen(completions[0].failure)).toBe(true);
  });

  it("keeps production behavior when request or response cloning fails", async () => {
    const entries: ObservedBridgeEntry[] = [];
    const completions: ObservedBridgeCompletion[] = [];
    const request = new Request("http://proxy.test/memory-bridge/v3/atomic/search", {
      method: "POST",
      body: JSON.stringify({ query: "clone failure" }),
    });
    const requestCloneError = new Error("request clone unavailable Bearer request-clone-secret");
    requestCloneError.name = "BearerRequestCloneNameSecret";
    Object.defineProperty(request, "clone", {
      value: () => { throw requestCloneError; },
    });
    const originalResponse = new Response("production-response", { status: 202 });
    Object.defineProperty(originalResponse, "clone", {
      value: () => { throw new Error("response clone unavailable"); },
    });

    const returned = await observeBridgeExecution(
      request,
      "memory",
      () => Promise.resolve(originalResponse),
      {
        entryObserver: (entry) => entries.push(entry),
        completionObserver: (completion) => completions.push(completion),
      },
    );

    expect(returned).toBe(originalResponse);
    expect(returned.status).toBe(202);
    expect(await returned.text()).toBe("production-response");
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty("requestBody");
    expect(entries[0].requestBodyCapture).toEqual({
      outcome: "failed",
      failure: { stage: "request_body_clone", name: "Error" },
    });
    expect(Object.isFrozen(entries[0].requestBodyCapture)).toBe(true);
    expect(Object.isFrozen(
      entries[0].requestBodyCapture.outcome === "failed"
        ? entries[0].requestBodyCapture.failure
        : undefined,
    )).toBe(true);
    expect(completions).toEqual([expect.objectContaining({
      correlationId: entries[0].correlationId,
      outcome: "failure",
      status: 202,
      failure: { name: "Error", message: "response clone unavailable" },
    })]);
    expect(JSON.stringify({ entries, completions })).not.toContain("request-clone-secret");
    expect(JSON.stringify({ entries, completions })).not.toContain("RequestCloneNameSecret");
  });

  it("records a normally returned 5xx response as a response completion", async () => {
    const entries: ObservedBridgeEntry[] = [];
    const completions: ObservedBridgeCompletion[] = [];
    const response = await observeBridgeExecution(
      new Request("http://proxy.test/skill-bridge/v3/skill/search", { method: "POST" }),
      "skill",
      () => Promise.resolve(Response.json({ code: 50301, message: "upstream unavailable" }, { status: 502 })),
      {
        entryObserver: (entry) => entries.push(entry),
        completionObserver: (completion) => completions.push(completion),
      },
    );

    expect(response.status).toBe(502);
    expect(completions).toEqual([expect.objectContaining({
      correlationId: entries[0].correlationId,
      outcome: "response",
      status: 502,
      responseBody: { code: 50301, message: "upstream unavailable" },
      responseBodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })]);
  });

  it("distinguishes captured, empty, and failed Knowledge request-body observation", async () => {
    const entries: ObservedKnowledgeToolsEntry[] = [];
    const observe = (request: Request) => observeKnowledgeToolsExecution(
      request,
      () => Promise.resolve(new Response(null, { status: 204 })),
      { entryObserver: (entry) => entries.push(entry) },
    );

    const failedRequest = new Request("http://knowledge.test/v3/tools/list", { method: "POST" });
    Object.defineProperty(failedRequest, "clone", {
      value: () => { throw new TypeError("Bearer knowledge-request-clone-secret"); },
    });

    await observe(new Request("http://knowledge.test/v3/tools/list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ knowledge_id: "wiki-abc12345" }),
    }));
    await observe(new Request("http://knowledge.test/v3/tools/list", { method: "POST" }));
    await observe(failedRequest);

    expect(entries.map((entry) => entry.requestBodyCapture)).toEqual([
      {
        outcome: "captured",
        rawBodySha256: "f7fb02819499f1eaf8768a7ad0178187abbe1e9059d1321fdd12f1be81fd928e",
      },
      { outcome: "empty" },
      {
        outcome: "failed",
        failure: { stage: "request_body_clone", name: "TypeError" },
      },
    ]);
    expect(entries.every((entry) => Object.isFrozen(entry.requestBodyCapture))).toBe(true);
    expect(Object.isFrozen(
      entries[2].requestBodyCapture.outcome === "failed"
        ? entries[2].requestBodyCapture.failure
        : undefined,
    )).toBe(true);
    expect(JSON.stringify(entries)).not.toContain("knowledge-request-clone-secret");
  });

  it("wraps Memory and Skill outer handlers so early 4xx returns complete exactly once", async () => {
    const config = bridgeConfig();
    const memoryEntries: ObservedBridgeEntry[] = [];
    const memoryCompletions: ObservedBridgeCompletion[] = [];
    const skillEntries: ObservedBridgeEntry[] = [];
    const skillCompletions: ObservedBridgeCompletion[] = [];
    const app = new Hono();
    const memoryHandler = createMemoryBridgeHandler(config, {
      bridgeEntryObserver: (entry) => memoryEntries.push(entry),
      bridgeCompletionObserver: (completion) => memoryCompletions.push(completion),
    });
    const skillHandler = createSkillBridgeHandler(config, {
      bridgeEntryObserver: (entry) => skillEntries.push(entry),
      bridgeCompletionObserver: (completion) => skillCompletions.push(completion),
    });
    app.post("/memory-bridge/*", (context) => memoryHandler(context));
    app.post("/skill-bridge/*", (context) => skillHandler(context));

    const headers = {
      "content-type": "application/json",
      "x-conversation-id": "session-outer",
      authorization: "Bearer outer-secret",
      "x-tdai-user-key": "outer-secret",
    };
    const memoryResponse = await app.request("http://proxy.test/memory-bridge/v3/not-allowed", {
      method: "POST",
      headers,
      body: "{}",
    });
    const skillResponse = await app.request("http://proxy.test/skill-bridge/v3/skill/not-allowed", {
      method: "POST",
      headers,
      body: "{}",
    });

    expect(memoryResponse.status).toBe(403);
    expect(skillResponse.status).toBe(403);
    expect(memoryEntries).toHaveLength(1);
    expect(memoryCompletions).toHaveLength(1);
    expect(skillEntries).toHaveLength(1);
    expect(skillCompletions).toHaveLength(1);
    expect(memoryEntries[0].requestBodyCapture).toEqual({
      outcome: "captured",
      rawBodySha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    });
    expect(skillEntries[0].requestBodyCapture).toEqual({
      outcome: "captured",
      rawBodySha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    });
    expect(memoryCompletions[0]).toMatchObject({
      correlationId: memoryEntries[0].correlationId,
      family: "memory",
      status: 403,
      outcome: "response",
    });
    expect(skillCompletions[0]).toMatchObject({
      correlationId: skillEntries[0].correlationId,
      family: "skill",
      status: 403,
      outcome: "response",
    });
    expect(JSON.stringify({
      memoryEntries,
      memoryCompletions,
      skillEntries,
      skillCompletions,
    })).not.toContain("outer-secret");
  });

  it("wraps Knowledge list/call responses and failures with exactly one matching completion", async () => {
    const knowledgeId = "wiki-abc12345";
    const entries: ObservedKnowledgeToolsEntry[] = [];
    const completions: ObservedKnowledgeToolsCompletion[] = [];
    const routeDeps = {
      wikiService: {
        getById: () => ({
          wiki_id: knowledgeId,
          team_id: "team-a",
          status: "ready",
          name: "Release guide",
          summary: "Stable deployment rules",
        }),
      } as never,
      wikiMgr: {} as never,
      cgService: {} as never,
      instancePool: {} as never,
      toolsEntryObserver: (entry: ObservedKnowledgeToolsEntry) => {
        entries.push(entry);
        throw new Error("entry collector unavailable");
      },
      toolsCompletionObserver: (completion: ObservedKnowledgeToolsCompletion) => {
        completions.push(completion);
        throw new Error("completion collector unavailable");
      },
    };
    const app = new Hono();
    app.route("/v3/tools", createToolsRoutes(routeDeps));

    const success = await app.request("http://knowledge.test/v3/tools/list", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tdai-service-id": "space-a",
        "x-conversation-id": "session-knowledge",
        authorization: "Bearer knowledge-secret",
        "x-tdai-user-key": "knowledge-secret",
      },
      body: JSON.stringify({ knowledge_id: knowledgeId }),
    });
    const rejected = await app.request("http://knowledge.test/v3/tools/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer knowledge-secret",
        "x-tdai-user-key": "knowledge-secret",
      },
      body: JSON.stringify({ knowledge_id: knowledgeId, tool_name: "get_info", params: {} }),
    });

    expect(success.status).toBe(200);
    expect(rejected.status).toBe(400);
    expect(entries).toHaveLength(2);
    expect(completions).toHaveLength(2);
    expect(entries[0].requestBodyCapture).toEqual({
      outcome: "captured",
      rawBodySha256: "f7fb02819499f1eaf8768a7ad0178187abbe1e9059d1321fdd12f1be81fd928e",
    });
    expect(entries[1].requestBodyCapture).toEqual({
      outcome: "captured",
      rawBodySha256: "64a76967b016825a49c2814bb80c5d78a85e53eb28aa948d8f2906b25a80860f",
    });
    expect(completions.map((completion) => ({
      correlationId: completion.correlationId,
      endpoint: completion.endpoint,
      status: completion.status,
      outcome: completion.outcome,
    }))).toEqual([
      {
        correlationId: entries[0].correlationId,
        endpoint: "/v3/tools/list",
        status: 200,
        outcome: "response",
      },
      {
        correlationId: entries[1].correlationId,
        endpoint: "/v3/tools/call",
        status: 400,
        outcome: "response",
      },
    ]);
    expect(Object.isFrozen(completions[0])).toBe(true);
    expect(Object.isFrozen(completions[0].responseBody)).toBe(true);
    expect(JSON.stringify({ entries, completions })).not.toContain("knowledge-secret");

    const failureEntries: ObservedKnowledgeToolsEntry[] = [];
    const failureCompletions: ObservedKnowledgeToolsCompletion[] = [];
    const failingApp = new Hono();
    failingApp.onError((_error, context) => context.json({ code: 500, message: "handled" }, 500));
    failingApp.route("/v3/tools", createToolsRoutes({
      ...routeDeps,
      wikiService: {
        getById: () => { throw new TypeError("knowledge store exploded"); },
      } as never,
      toolsEntryObserver: (entry) => failureEntries.push(entry),
      toolsCompletionObserver: (completion) => failureCompletions.push(completion),
    }));
    const failed = await failingApp.request("http://knowledge.test/v3/tools/list", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tdai-service-id": "space-a" },
      body: JSON.stringify({ knowledge_id: knowledgeId }),
    });

    expect(failed.status).toBe(500);
    expect(failureEntries).toHaveLength(1);
    expect(failureCompletions).toEqual([expect.objectContaining({
      correlationId: failureEntries[0].correlationId,
      family: "knowledge",
      endpoint: "/v3/tools/list",
      outcome: "failure",
      status: null,
      failure: { name: "TypeError", message: "knowledge store exploded" },
    })]);
  });
});
