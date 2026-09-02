import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RealChainAdapter,
  auditCapturedRealChainRequest,
  userPlaneHistoryEnvelopeV1,
  type NormalizedRealChainInput,
} from "../../eval/tool-prompt-bench/real-chain-adapter.js";
import {
  RealChainLedger,
  RealChainReplayTimeoutError,
  buildEvaluationPrefix,
  buildNoToolEvaluationPrefix,
  replayRealChainEntry,
} from "../../eval/tool-prompt-bench/real-chain-trace.js";
import { parseCodexJsonlEvents } from "../../eval/tool-prompt-bench/codex-runner.js";
import {
  USER_PLANE_HISTORY_TRANSPORT_V1,
  expandCodexHistoryTransport,
} from "../common/codex-history-transport.js";
import { initAuth } from "../auth.js";
import type { ObservedBridgeEntry } from "../bridge-entry-observer.js";
import { handleCodexEndpoint } from "../codexHandler.js";
import { DEFAULT_CONFIG } from "../config.js";
import type {
  ProviderCompletionEvidence,
  ProviderRequestEvidence,
} from "../provider-request-trace-sink.js";
import { __resetHookCacheRepoForTests } from "../db/hookCacheRepo.js";
import { __resetSessionRepoForTests } from "../db/sessionRepo.js";
import {
  __resetInjectionPipelineForTests,
  getInjectionPipeline,
} from "../injection/index.js";
import { InjectionInfrastructureError } from "../injection/errors.js";
import { sealProductionPromptSourceManifest } from "../injection/production-source.js";
import { setCoreKnowledgeClient } from "../knowledge/core-client.js";
import { setMetadataClient } from "../meta/client.js";
import { createApp } from "../server.js";
import { __resetSessionStoreForTests } from "../session/store.js";
import { setCoreSkillClient } from "../skill/core-client.js";
import {
  __resetProxyStorageForTests,
  initProxyStorage,
} from "../storage/factory.js";
import type { ProxyConfig } from "../types.js";

const REAL_CHAIN_KNOWLEDGE_ID = "wiki-abc12345";

interface CapturedRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface InMemoryCaptureBoundary {
  baseUrl: string;
  metadataPaths: string[];
  metadataRequests: CapturedRequest[];
  upstreamRequests: CapturedRequest[];
  bridgeRequests: CapturedRequest[];
  fetcher: typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createInMemoryCaptureBoundary(): InMemoryCaptureBoundary {
  const baseUrl = "http://r01-capture.test";
  const metadataPaths: string[] = [];
  const metadataRequests: CapturedRequest[] = [];
  const upstreamRequests: CapturedRequest[] = [];
  const bridgeRequests: CapturedRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === "string" || input instanceof URL
      ? new URL(input)
      : new URL(input.url);
    const path = url.pathname;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const rawBody = typeof init?.body === "string" ? init.body : "";
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    if (path === "/responses") {
      upstreamRequests.push({ path, method, headers, body });
      return new Response([
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":321,\"input_tokens_details\":{\"cached_tokens\":123},\"output_tokens\":9,\"total_tokens\":330}}}",
        "",
      ].join("\n"), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-request-id": `provider-${upstreamRequests.length}`,
        },
      });
    }
    if (path === "/v3/atomic/search" || path === "/v3/skill/search") {
      bridgeRequests.push({ path, method, headers, body });
      return jsonResponse({ code: 0, data: path.includes("atomic") ? { items: [] } : { items: [] } });
    }

    metadataPaths.push(path);
    metadataRequests.push({ path, method, headers, body });
    if (path === "/v3/meta/auth/verify") {
      return jsonResponse({ code: 0, data: { valid: true, user: { user_id: "user-real-chain" } } });
    }
    if (path === "/v3/meta/team/list") {
      return jsonResponse({
        code: 0,
        data: {
          items: [{ team_id: "team-alpha", name: "Team Alpha", status: "active" }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (path === "/v3/meta/agent/list") {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            agent_id: "agent-general",
            team_id: "team-alpha",
            owner_user_id: "user-real-chain",
            name: "General Coding Agent",
            description: "Owns proxy evaluation and TypeScript integration work",
            prompt: "Use verified team workflows when they are relevant",
            status: "active",
          }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (path === "/v3/meta/task/list") {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            task_id: "task-prompt-eval",
            team_id: "team-alpha",
            title: "Prompt evaluation",
            description: "Measure correct tool decisions",
            status: "running",
          }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (path === "/v3/meta/agent/get") {
      return jsonResponse({
        code: 0,
        data: {
          agent_id: "agent-general",
          team_id: "team-alpha",
          name: "General Coding Agent",
          description: "Owns proxy evaluation and TypeScript integration work",
          prompt: "Use verified team workflows when they are relevant",
        },
      });
    }
    if (path === "/v3/meta/task/get") {
      return jsonResponse({
        code: 0,
        data: {
          task_id: "task-prompt-eval",
          team_id: "team-alpha",
          title: "Prompt evaluation",
          description: "Measure correct tool decisions",
        },
      });
    }
    if (path === "/v3/meta/participation-log/append") {
      return jsonResponse({ code: 0, data: { id: "participation-1" } });
    }
    if (path === "/v3/meta/config/user/get") {
      return jsonResponse({ code: 0, data: { items: [] } });
    }
    if (path === "/v3/meta/agent-fixed-asset/list-with-detail") {
      return jsonResponse({
        code: 0,
        data: {
          items: [
            { asset_id: "knowledge-proxy-graph", asset_type: "code_graph", status: "active" },
            { asset_id: REAL_CHAIN_KNOWLEDGE_ID, asset_type: "llm_wiki", status: "active" },
          ],
          total: 2,
        },
      });
    }
    if (path === "/v3/meta/asset/list-accessible") {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            asset_id: "skill-release-check",
            team_id: "team-alpha",
            asset_type: "skill",
            name: "proxy-release-check",
            visibility: "team",
            status: "active",
          }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (path === "/v3/skill/list") {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            skill_id: "skill-release-check",
            name: "proxy-release-check",
            description: "Verify the proxy release gates.",
            version: 3,
            status: "active",
            owner_agent_id: "agent-general",
            team_id: "team-alpha",
          }],
          total: 1,
        },
      });
    }
    if (path === "/v3/skill/listing") {
      return jsonResponse({
        code: 0,
        data: {
          mode: "full",
          listing: [
            "<available_skills>",
            "- proxy-release-check: Verify the proxy release gates.",
            "</available_skills>",
          ].join("\n"),
          hits: [{ skill_id: "skill-release-check", version: 3, name: "proxy-release-check" }],
        },
      });
    }
    if (path === "/v3/knowledge/list") {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            knowledge_id: REAL_CHAIN_KNOWLEDGE_ID,
            type: "wiki",
            service_url: "http://knowledge.test/v3",
            name: "Proxy release decisions",
            summary: "Why the proxy release workflow uses staged gates",
            team_id: "team-alpha",
            user_id: null,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          }],
          total: 1,
        },
      });
    }
    return jsonResponse({ code: 404, message: `unhandled test path ${path}` }, 404);
  };
  return { baseUrl, metadataPaths, metadataRequests, upstreamRequests, bridgeRequests, fetcher };
}

function realChainConfig(baseUrl: string): ProxyConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.server = { host: "127.0.0.1", port: 8096, forwardTimeoutMs: 5_000 };
  config.upstream = { url: baseUrl, apiKey: "", agents: { codex: { url: baseUrl } } };
  config.storage = { ...config.storage, enabled: true, backend: "memory" };
  config.sessionInit = {
    ...config.sessionInit,
    enabled: true,
    headerAutoSelect: {
      enabled: true,
      teamHeader: "x-team-id",
      agentHeader: "x-agent-id",
      taskHeader: "x-task-id",
      onMismatch: "form",
    },
  };
  config.injection = {
    enabled: true,
    injectors: ["skill", "knowledge", "tdai-memory"],
    toolPromptProfile: "legacy",
    externalGatewayUrl: "http://127.0.0.1:8096",
    assetReflection: { markerOptIn: false },
  };
  config.extraction = { enabled: false, extractors: [] };
  config.coreSkill = {
    endpoint: baseUrl,
    serviceToken: "test-service-token",
    serviceId: "unused-static-service-id",
    timeoutMs: 2_000,
  };
  config.tdai = {
    ...config.tdai,
    enabled: true,
    endpoint: baseUrl,
    serviceId: "unused-static-service-id",
    memory: {
      ...config.tdai.memory,
      enabled: true,
      inject: true,
      writeL0: false,
      recallL1: false,
      injectL2L3: false,
      timeoutMs: 2_000,
    },
  };
  config.knowledge = {
    enabled: true,
    endpoint: baseUrl,
    serviceToken: "test-service-token",
    serviceId: "unused-static-service-id",
    timeoutMs: 2_000,
  };
  config.auth = { enabled: true, url: baseUrl, timeoutMs: 2_000 };
  config.langfuse = { ...config.langfuse, enabled: false };
  return config;
}

beforeEach(() => {
  initAuth({ enabled: false, url: "", timeoutMs: 0 });
  setMetadataClient(null);
  setCoreSkillClient(null);
  setCoreKnowledgeClient(null);
  __resetInjectionPipelineForTests();
  __resetSessionStoreForTests();
  __resetHookCacheRepoForTests();
  __resetSessionRepoForTests();
  __resetProxyStorageForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  initAuth({ enabled: false, url: "", timeoutMs: 0 });
  setMetadataClient(null);
  setCoreSkillClient(null);
  setCoreKnowledgeClient(null);
  __resetInjectionPipelineForTests();
  __resetSessionStoreForTests();
  __resetHookCacheRepoForTests();
  __resetSessionRepoForTests();
  __resetProxyStorageForTests();
});

describe("Task 1 R01 real-chain Adapter", () => {
  it("keeps identity, ordered history, and secrets on their intended boundaries", () => {
    const prepared = new RealChainAdapter().prepareCodexRun({
      proxyBaseUrl: "http://127.0.0.1:8096/",
      input: {
        identity: {
          spaceId: "space-eval",
          sessionId: "session-case-001-r1",
          teamId: "team-alpha",
          agentId: "agent-general",
          taskId: "task-prompt-eval",
        },
        history: [
          { role: "user", content: "The release failed on the \"cache\" gate.\nRetry it." },
          { role: "assistant", content: "I will use <team> workflow next." },
        ],
        finalQuery: "Apply the established proxy release workflow.",
      },
      workspaceDir: "D:/eval/workspaces/case-001",
      authenticatedCodexHome: "C:/Users/example/.codex",
      isolatedHome: "D:/eval/runs/case-001/isolated-home",
      environmentSource: {
        PATH: "test-path",
        CODEX_HOME: "C:/old-home",
        CODEX_THREAD_ID: "must-not-leak",
        TDAI_EVAL_USER_KEY: "tdai-secret-value",
      },
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      verbosity: "medium",
    });

    expect(prepared.providerBaseUrl).toBe("http://127.0.0.1:8096/codex/space-eval/v1");
    expect(prepared.providerHeaders).toEqual({
      "session-id": "session-case-001-r1",
      "x-team-id": "team-alpha",
      "x-agent-id": "agent-general",
      "x-task-id": "task-prompt-eval",
      "x-tdai-history-transport": "user-plane-envelope-v1",
    });
    const expectedUserPrompt = "{\"type\":\"task1_user_history_envelope\",\"version\":1,"
      + "\"history\":[{\"role\":\"user\",\"content\":\"The release failed on the \\\"cache\\\" gate.\\nRetry it.\"},"
      + "{\"role\":\"assistant\",\"content\":\"I will use <team> workflow next.\"}],"
      + "\"finalQuery\":\"Apply the established proxy release workflow.\"}";
    expect(prepared.stdin).toBe(expectedUserPrompt);
    expect(prepared.providerInput).toEqual([{
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: expectedUserPrompt }],
    }]);
    expect(JSON.parse(prepared.stdin)).toEqual({
      type: "task1_user_history_envelope",
      version: 1,
      history: [
        { role: "user", content: "The release failed on the \"cache\" gate.\nRetry it." },
        { role: "assistant", content: "I will use <team> workflow next." },
      ],
      finalQuery: "Apply the established proxy release workflow.",
    });
    expect(prepared.environment).toMatchObject({
      PATH: "test-path",
      CODEX_HOME: "C:/Users/example/.codex",
      CODEX_SQLITE_HOME: join("D:/eval/runs/case-001/isolated-home", "sqlite"),
      HOME: "D:/eval/runs/case-001/isolated-home",
      USERPROFILE: "D:/eval/runs/case-001/isolated-home",
      TDAI_EVAL_USER_KEY: "tdai-secret-value",
    });
    expect(prepared.environment.CODEX_THREAD_ID).toBeUndefined();
    expect(prepared.invocation.args.join("\n")).not.toMatch(/developer_instructions|mock-contract|x-tdai-eval-mode/i);
    expect(prepared.invocation.args.join("\n")).not.toContain("tdai-secret-value");
    expect(prepared.manifest).toMatchObject({
      evaluationLayer: "memory-proxy-real-chain",
      formalMetricEligible: false,
      readiness: "adapter-only",
      historyMessageCount: 2,
      historyTransport: "user-plane-envelope-v1",
      developerInstructionsInjectedByRunner: false,
      mockContractBypassEnabled: false,
    });
    expect(prepared.manifest.userPromptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(prepared.manifest)).not.toContain("tdai-secret-value");
  });

  it("retains the raw multi-step ledger while truncating only the evaluation prefix", () => {
    let tick = 0;
    const ledger = new RealChainLedger("run-001", "case-001", "session-001", () => `2026-08-30T00:00:0${tick++}.000Z`);
    ledger.append({
      kind: "tdai_attempt",
      attemptId: "attempt-search",
      disposition: "dispatchable",
      family: "skill",
      tool: "skill_search",
      endpoint: "/skill-bridge/v3/skill/search",
      raw: { command: "curl search" },
    });
    ledger.append({
      kind: "tdai_entry",
      entryId: "entry-search",
      attemptId: "attempt-search",
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/search",
      method: "POST",
    });
    ledger.append({
      kind: "tdai_accepted",
      entryId: "entry-search",
      family: "skill",
      tool: "skill_search",
      endpoint: "/skill-bridge/v3/skill/search",
      status: 200,
    });
    ledger.append({
      kind: "tdai_attempt",
      attemptId: "attempt-view",
      disposition: "dispatchable",
      family: "skill",
      tool: "skill_view",
      endpoint: "/skill-bridge/v3/skill/get-by-name",
      raw: { command: "curl view" },
    });
    ledger.append({
      kind: "tdai_entry",
      entryId: "entry-view",
      attemptId: "attempt-view",
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/get-by-name",
      method: "POST",
    });
    ledger.append({
      kind: "tdai_accepted",
      entryId: "entry-view",
      family: "skill",
      tool: "skill_view",
      endpoint: "/skill-bridge/v3/skill/get-by-name",
      status: 200,
    });
    ledger.append({ kind: "non_tdai_response", text: "I continued after the terminal call." });
    ledger.append({
      kind: "usage",
      inputTokens: 120,
      cachedInputTokens: 80,
      cacheWriteInputTokens: 0,
      outputTokens: 25,
      reasoningOutputTokens: 7,
    });

    const raw = ledger.snapshot();
    const prefix = buildEvaluationPrefix(
      raw.events,
      (event) => event.kind === "tdai_accepted" && event.tool === "skill_view",
    );

    expect(raw.events).toHaveLength(8);
    expect(raw.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(prefix.terminalMatched).toBe(true);
    expect(prefix.events).toHaveLength(6);
    expect(prefix.events.at(-1)).toMatchObject({ kind: "tdai_accepted", tool: "skill_view" });
    expect(raw.events.at(-1)).toMatchObject({ kind: "usage", inputTokens: 120 });
    expect(buildEvaluationPrefix(raw.events, () => false)).toMatchObject({
      terminalMatched: false,
      events: raw.events,
    });
  });

  it("preserves user-plane bytes and validates malformed standard input explicitly", () => {
    const serialized = userPlaneHistoryEnvelopeV1.serialize({
      history: [{ role: "user", content: "  keep boundary whitespace  " }],
      finalQuery: "\nkeep final newline\n",
    });
    expect(serialized).toBe(
      "{\"type\":\"task1_user_history_envelope\",\"version\":1,"
      + "\"history\":[{\"role\":\"user\",\"content\":\"  keep boundary whitespace  \"}],"
      + "\"finalQuery\":\"\\nkeep final newline\\n\"}",
    );

    const adapter = new RealChainAdapter();
    const base = {
      proxyBaseUrl: "http://127.0.0.1:8096",
      workspaceDir: "D:/eval/workspace",
      authenticatedCodexHome: "C:/Users/example/.codex",
      isolatedHome: "D:/eval/isolated",
      model: "gpt-5.6-luna",
      reasoningEffort: "high" as const,
      verbosity: "medium" as const,
    };
    const identity = {
      spaceId: "space-eval",
      sessionId: "session-eval",
      teamId: "team-eval",
      agentId: "agent-eval",
    };
    expect(() => adapter.prepareCodexRun({
      ...base,
      input: { identity, history: [null] as unknown as NormalizedRealChainInput["history"], finalQuery: "query" },
    })).toThrow(/history\[0\] must be an object/);
    expect(() => adapter.prepareCodexRun({
      ...base,
      input: { identity, history: ["bad"] as unknown as NormalizedRealChainInput["history"], finalQuery: "query" },
    })).toThrow(/history\[0\] must be an object/);
    expect(() => adapter.prepareCodexRun({
      ...base,
      input: { identity: { ...identity, taskId: "   " }, history: [], finalQuery: "query" },
    })).toThrow(/taskId is required/);
  });

  it("requires explicit, well-formed opt-in before expanding Codex history", () => {
    const ordinaryBody = {
      input: [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "ordinary JSON: {\"history\":[]}" }],
      }],
    };
    expect(expandCodexHistoryTransport(ordinaryBody, undefined)).toBe(ordinaryBody);
    expect(() => expandCodexHistoryTransport(
      ordinaryBody,
      USER_PLANE_HISTORY_TRANSPORT_V1,
    )).toThrow(/exactly one history envelope/);
    expect(() => expandCodexHistoryTransport(ordinaryBody, "unknown-v9"))
      .toThrow(/unsupported Codex history transport/);
  });

  it("checks runner-owned prompt text only on the developer plane", () => {
    const userPrompt = userPlaneHistoryEnvelopeV1.serialize({
      history: [{ role: "user", content: "The user literally mentioned <skill_tools>." }],
      finalQuery: "Explain the text without invoking anything.",
    });
    const body = {
      input: [
        {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "<tdai_injections><skill_tools>production</skill_tools></tdai_injections>" }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "The user literally mentioned <skill_tools>." }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Explain the text without invoking anything." }],
        },
      ],
    };
    expect(auditCapturedRealChainRequest(body, userPrompt)).toMatchObject({
      wrapperCount: 1,
      userPromptCount: 1,
      toolFamilies: ["skill"],
    });
  });

  it("parses Codex JSONL losslessly without turning malformed lines into model events", () => {
    const records = parseCodexJsonlEvents([
      "{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\"}}",
      "not-json",
      "42",
      "",
    ].join("\n"));
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ lineNumber: 1, event: { type: "item.completed" } });
    expect(records[1]).toMatchObject({ lineNumber: 2, raw: "not-json", event: null });
    expect(records[1].parseError).toBeTruthy();
    expect(records[2]).toMatchObject({
      lineNumber: 3,
      raw: "42",
      event: null,
      parseError: "Codex JSONL event must be an object",
    });
  });

  it("detaches evidence, enforces accepted/rejected status classes, and keeps case identity", () => {
    const ledger = new RealChainLedger("run-immutability", "case-immutability", "session-immutability");
    const mutableRaw = { command: "curl original", nested: { query: "original" } };
    const event = ledger.append({
      kind: "tdai_attempt",
      attemptId: "attempt-immutability",
      disposition: "dispatchable",
      family: "memory",
      raw: mutableRaw,
    });
    mutableRaw.command = "curl changed";
    mutableRaw.nested.query = "changed";

    expect(event.raw).toEqual({ command: "curl original", nested: { query: "original" } });
    expect(Object.isFrozen(event.raw)).toBe(true);
    expect(Object.isFrozen((event.raw as { nested: object }).nested)).toBe(true);
    expect(ledger.snapshot()).toMatchObject({
      runId: "run-immutability",
      caseId: "case-immutability",
      sessionId: "session-immutability",
      formalMetricEligible: false,
    });
    expect(() => ledger.append({
      kind: "tdai_attempt",
      attemptId: "attempt-uncloneable",
      disposition: "dispatchable",
      raw: { fn: () => undefined },
    })).toThrow(/could not be detached/);
    expect(() => ledger.append({
      kind: "tdai_accepted",
      entryId: "entry-400",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      status: 400,
    })).toThrow(/accepted status must be 2xx/);
    expect(() => ledger.append({
      kind: "tdai_accepted",
      entryId: "entry-500",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      status: 500,
    })).toThrow(/accepted status must be 2xx/);
    expect(() => ledger.append({
      kind: "tdai_rejected",
      entryId: "entry-rejected-500",
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      status: 500,
      reason: "upstream failed",
    })).toThrow(/rejected status must be 4xx/);
  });

  it("stops no-tool behavior at the first response or attempt without treating infrastructure as behavior", () => {
    const ledger = new RealChainLedger("run-no-tool", "case-no-tool", "session-no-tool");
    ledger.append({ kind: "infrastructure_error", stage: "trace-read", message: "temporary gap", retryable: true });
    ledger.append({ kind: "timeout", stage: "observer-wait", budgetMs: 100 });
    ledger.append({ kind: "non_tdai_response", text: "Completed with local code only." });
    ledger.append({
      kind: "tdai_attempt",
      attemptId: "late-attempt",
      disposition: "malformed",
      malformedReason: "invalid JSON",
      raw: "curl ...",
    });
    const firstResponsePrefix = buildNoToolEvaluationPrefix(ledger.snapshot().events);
    expect(firstResponsePrefix.events.map((event) => event.kind)).toEqual([
      "infrastructure_error",
      "timeout",
      "non_tdai_response",
    ]);

    const attemptLedger = new RealChainLedger("run-no-tool-attempt", "case-no-tool-attempt", "session-no-tool-attempt");
    attemptLedger.append({ kind: "infrastructure_error", stage: "provider", message: "retrying", retryable: true });
    attemptLedger.append({
      kind: "tdai_attempt",
      attemptId: "first-attempt",
      disposition: "malformed",
      malformedReason: "missing header",
      raw: "curl ...",
    });
    attemptLedger.append({ kind: "non_tdai_response", text: "late response" });
    expect(buildNoToolEvaluationPrefix(attemptLedger.snapshot().events).events.map((event) => event.kind)).toEqual([
      "infrastructure_error",
      "tdai_attempt",
    ]);
  });

  it("captures the real Knowledge tools/list and tools/call contract at its separate service boundary", async () => {
    const { createToolsRoutes } = await vi.importActual<{
      createToolsRoutes: (deps: unknown) => Hono;
    }>("../../../MemoryKnowledge/src/routes/tools.ts");
    const knowledgeId = REAL_CHAIN_KNOWLEDGE_ID;
    const wikiRow = {
      wiki_id: knowledgeId,
      team_id: "team-alpha",
      status: "ready",
      name: "Proxy release decisions",
      summary: "Release gates and cache rules",
    };
    const routeDeps = {
      wikiService: {
        getById: () => wikiRow,
        get: () => ({ ...wikiRow, page_count: 3 }),
      } as never,
      wikiMgr: {} as never,
      cgService: {} as never,
      instancePool: {} as never,
    };
    type KnowledgeEntryReceipt = {
      correlationId: string;
      family: "knowledge";
      endpoint: string;
      method: string;
      requestBody?: unknown;
      correlationHeaders: Readonly<Record<string, string>>;
    };
    const observedEntries: KnowledgeEntryReceipt[] = [];
    const knowledgeApp = new Hono();
    knowledgeApp.route("/v3/tools", createToolsRoutes({
      ...routeDeps,
      toolsEntryObserver: (entry: KnowledgeEntryReceipt) => observedEntries.push(entry),
    }));
    const ledger = new RealChainLedger("run-knowledge", "case-knowledge", "session-real-chain-probe");
    const execute = async (request: {
      endpoint: string;
      method: string;
      requestBody?: unknown;
    }) => {
      const observationIndex = observedEntries.length;
      const response = await knowledgeApp.request(`http://knowledge.test${request.endpoint}`, {
        method: request.method,
        headers: {
          "content-type": "application/json",
          "x-tdai-service-id": "space-eval",
          authorization: "Bearer knowledge-observer-must-not-see",
          "x-tdai-user-key": "knowledge-observer-must-not-see",
        },
        body: JSON.stringify(request.requestBody),
      });
      return {
        status: response.status,
        responseBody: await response.json(),
        receipt: observedEntries[observationIndex],
      };
    };

    await replayRealChainEntry(ledger, {
      entryId: "knowledge-list",
      family: "knowledge",
      tool: "caller_wrong_tool",
      endpoint: "/v3/tools/list",
      method: "POST",
      requestBody: { knowledge_id: knowledgeId },
    }, execute);
    await replayRealChainEntry(ledger, {
      entryId: "knowledge-call",
      family: "knowledge",
      tool: "caller_wrong_tool",
      endpoint: "/v3/tools/call",
      method: "POST",
      requestBody: { knowledge_id: knowledgeId, tool_name: "get_info", params: {} },
    }, execute);

    expect(observedEntries).toEqual([
      expect.objectContaining({
        family: "knowledge",
        endpoint: "/v3/tools/list",
        method: "POST",
        requestBody: { knowledge_id: knowledgeId },
        correlationHeaders: { "x-tdai-service-id": "space-eval" },
      }),
      expect.objectContaining({
        family: "knowledge",
        endpoint: "/v3/tools/call",
        method: "POST",
        requestBody: { knowledge_id: knowledgeId, tool_name: "get_info", params: {} },
        correlationHeaders: { "x-tdai-service-id": "space-eval" },
      }),
    ]);
    expect(observedEntries.filter((entry) => entry.endpoint === "/v3/tools/list")).toHaveLength(1);
    expect(observedEntries.filter((entry) => entry.endpoint === "/v3/tools/call")).toHaveLength(1);
    expect(Object.isFrozen(observedEntries[0])).toBe(true);
    expect(Object.isFrozen(observedEntries[0].requestBody)).toBe(true);
    expect(JSON.stringify(observedEntries)).not.toContain("knowledge-observer-must-not-see");
    expect(ledger.snapshot().events.map((event) => ({ kind: event.kind, tool: "tool" in event ? event.tool : undefined }))).toEqual([
      { kind: "tdai_entry", tool: "knowledge_tools_list" },
      { kind: "tdai_accepted", tool: "knowledge_tools_list" },
      { kind: "tdai_entry", tool: "knowledge_tools_call" },
      { kind: "tdai_accepted", tool: "knowledge_tools_call" },
    ]);

    const rejectedEntries: KnowledgeEntryReceipt[] = [];
    const rejectedApp = new Hono();
    rejectedApp.route("/v3/tools", createToolsRoutes({
      ...routeDeps,
      toolsEntryObserver: (entry: KnowledgeEntryReceipt) => {
        rejectedEntries.push(entry);
        throw new Error("evaluation observer unavailable");
      },
    }));
    const rejectedLedger = new RealChainLedger("run-knowledge-400", "case-knowledge-400", "session-real-chain-probe");
    const rejectedOutcome = await replayRealChainEntry(rejectedLedger, {
      entryId: "knowledge-list-missing-service",
      family: "knowledge",
      endpoint: "/v3/tools/list",
      method: "POST",
      requestBody: { knowledge_id: knowledgeId },
    }, async (request) => {
      const observationIndex = rejectedEntries.length;
      const response = await rejectedApp.request(`http://knowledge.test${request.endpoint}`, {
        method: request.method,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer rejected-observer-must-not-see",
          "x-tdai-user-key": "rejected-observer-must-not-see",
        },
        body: JSON.stringify(request.requestBody),
      });
      return {
        status: response.status,
        responseBody: await response.json(),
        receipt: rejectedEntries[observationIndex],
      };
    });
    expect(rejectedOutcome).toMatchObject({ kind: "tdai_rejected", status: 400, tool: "knowledge_tools_list" });
    expect(rejectedEntries).toEqual([
      expect.objectContaining({
        family: "knowledge",
        endpoint: "/v3/tools/list",
        method: "POST",
        requestBody: { knowledge_id: knowledgeId },
        correlationHeaders: {},
      }),
    ]);
    expect(JSON.stringify(rejectedEntries)).not.toContain("rejected-observer-must-not-see");

    const unobservedApp = new Hono();
    unobservedApp.route("/v3/tools", createToolsRoutes(routeDeps));
    const unobservedLedger = new RealChainLedger("run-knowledge-unobserved", "case-knowledge-unobserved", "session-real-chain-probe");
    let unobservedRouteStatus: number | undefined;
    const unobservedOutcome = await replayRealChainEntry(unobservedLedger, {
      entryId: "knowledge-list-without-observer",
      family: "knowledge",
      endpoint: "/v3/tools/list",
      method: "POST",
      requestBody: { knowledge_id: knowledgeId },
    }, async (request) => {
      const response = await unobservedApp.request(`http://knowledge.test${request.endpoint}`, {
        method: request.method,
        headers: { "content-type": "application/json", "x-tdai-service-id": "space-eval" },
        body: JSON.stringify(request.requestBody),
      });
      unobservedRouteStatus = response.status;
      return { status: response.status, responseBody: await response.json() };
    });
    expect(unobservedRouteStatus).toBe(200);
    expect(unobservedOutcome).toMatchObject({ kind: "infrastructure_error" });
    expect(unobservedLedger.snapshot().events.some((event) => (
      event.kind === "tdai_entry" || event.kind === "tdai_accepted"
    ))).toBe(false);
  });

  it("classifies 4xx, 5xx, network failures, and explicit timeouts without scoring them", async () => {
    const ledger = new RealChainLedger("run-outcomes", "case-outcomes", "session-outcomes");
    const request = {
      entryId: "entry-400",
      family: "memory" as const,
      tool: "caller_wrong_tool",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
    };

    expect((await replayRealChainEntry(ledger, request, async () => ({
      status: 400,
      responseBody: { code: 400 },
      receipt: {
        correlationId: "observed-entry-400",
        family: "memory",
        tool: "tdai_memory_search",
        endpoint: "/memory-bridge/v3/atomic/search",
        method: "POST",
      },
    }))).kind)
      .toBe("tdai_rejected");
    expect((await replayRealChainEntry(ledger, {
      ...request,
      entryId: "entry-503",
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/search",
    }, async () => ({
      status: 503,
      responseBody: { code: 503 },
      receipt: {
        correlationId: "observed-entry-503",
        family: "skill",
        endpoint: "/v3/skill/search",
        method: "POST",
      },
    }))).kind).toBe("infrastructure_error");
    expect((await replayRealChainEntry(ledger, {
      ...request,
      entryId: "entry-502-no-receipt",
    }, async () => ({ status: 502, responseBody: { code: 502 } }))).kind).toBe("infrastructure_error");
    expect((await replayRealChainEntry(ledger, {
      ...request,
      entryId: "entry-network",
      family: "knowledge",
      endpoint: "/v3/tools/list",
    }, async () => {
      throw new TypeError("network socket closed");
    })).kind).toBe("infrastructure_error");
    expect((await replayRealChainEntry(ledger, {
      ...request,
      entryId: "entry-timeout",
      family: "knowledge",
      endpoint: "/v3/tools/call",
    }, async () => {
      throw new RealChainReplayTimeoutError("knowledge-tools-call", 250);
    })).kind).toBe("timeout");
    const unsafeSecret = "Bearer must-not-enter-ledger";
    expect((await replayRealChainEntry(ledger, {
      ...request,
      entryId: "entry-unsafe-receipt",
    }, async () => ({
      status: 200,
      receipt: {
        correlationId: "unsafe-receipt",
        family: "memory",
        endpoint: "/memory-bridge/v3/atomic/search",
        method: "POST",
        correlationHeaders: { authorization: unsafeSecret },
      },
    }))).kind).toBe("infrastructure_error");

    expect(ledger.snapshot().events.map((event) => event.kind)).toEqual([
      "tdai_entry",
      "tdai_rejected",
      "tdai_entry",
      "infrastructure_error",
      "infrastructure_error",
      "infrastructure_error",
      "timeout",
      "infrastructure_error",
    ]);
    expect(JSON.stringify(ledger.snapshot())).not.toContain(unsafeSecret);
    expect(ledger.snapshot().events.slice(0, 2)).toEqual([
      expect.objectContaining({ kind: "tdai_entry", tool: "tdai_memory_search" }),
      expect.objectContaining({ kind: "tdai_rejected", tool: "tdai_memory_search" }),
    ]);
  });

  it("keeps bridge behavior fail-open when its sanitized outer-entry observer throws", async () => {
    const capture = createInMemoryCaptureBoundary();
    vi.stubGlobal("fetch", capture.fetcher);
    const observedEntries: ObservedBridgeEntry[] = [];
    const app = createApp(realChainConfig(capture.baseUrl), {
      bridgeEntryObserver: (entry) => {
        observedEntries.push(entry);
        throw new Error("evaluation collector unavailable");
      },
    });

    const response = await app.request("http://memory-proxy.test/memory-bridge/v3/atomic/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tdai-service-id": "space-eval",
        "x-tdai-agent-id": "agent-general",
        authorization: "Bearer observer-must-not-see-this",
        "x-tdai-user-key": "observer-must-not-see-this",
      },
      body: JSON.stringify({ query: "missing session", nested: { limit: 3 } }),
    });

    expect(response.status).toBe(401);
    expect(observedEntries).toHaveLength(1);
    expect(observedEntries[0]).toMatchObject({
      family: "memory",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      requestBody: { query: "missing session", nested: { limit: 3 } },
      correlationHeaders: {
        "x-tdai-service-id": "space-eval",
        "x-tdai-agent-id": "agent-general",
      },
    });
    expect(observedEntries[0].correlationId).toMatch(/^memory-bridge:/);
    expect(Object.isFrozen(observedEntries[0])).toBe(true);
    expect(Object.isFrozen(observedEntries[0].requestBody)).toBe(true);
    expect(Object.isFrozen((observedEntries[0].requestBody as { nested: object }).nested)).toBe(true);
    expect(JSON.stringify(observedEntries)).not.toContain("observer-must-not-see-this");
    expect(capture.bridgeRequests).toHaveLength(0);
  });

  it("rejects a typed injection infrastructure failure before calling the Codex upstream", async () => {
    const capture = createInMemoryCaptureBoundary();
    vi.stubGlobal("fetch", capture.fetcher);
    const config = realChainConfig(capture.baseUrl);
    await initProxyStorage(config.storage);
    initAuth(config.auth);
    const failure = new InjectionInfrastructureError(
      "INJECTION_METADATA_PARITY_FAILURE",
      "synthetic handler boundary failure",
    );
    const pipeline = getInjectionPipeline(config);
    const formalCaptureSpy = vi.spyOn(pipeline, "processWithProductionSources");
    const processSpy = vi.spyOn(pipeline, "process")
      .mockRejectedValue(failure);
    let handlerPromise: ReturnType<typeof handleCodexEndpoint> | undefined;
    const app = new Hono();
    app.post("/*", (context) => {
      handlerPromise = handleCodexEndpoint(context, config);
      return handlerPromise;
    });
    app.onError(() => new Response("handler rejected", { status: 500 }));
    const adapter = new RealChainAdapter({
      request: (path, init) => Promise.resolve(app.request(`http://memory-proxy.test${path}`, init)),
    });
    const input: NormalizedRealChainInput = {
      identity: {
        spaceId: "space-eval",
        sessionId: "session-injection-failure",
        teamId: "team-alpha",
        agentId: "agent-general",
        taskId: "task-prompt-eval",
      },
      history: [],
      finalQuery: "Use the team proxy release workflow.",
    };

    const result = await adapter.probeProductionChain({
      input,
      model: "gpt-5.6-luna",
      providerAuthorization: "Bearer provider-probe-token",
      tdaiUserKey: "tdai-probe-user-key",
    });

    expect(result.status).toBe(500);
    expect(handlerPromise).toBeDefined();
    await expect(handlerPromise!).rejects.toBe(failure);
    expect(processSpy).toHaveBeenCalledOnce();
    expect(formalCaptureSpy).not.toHaveBeenCalled();
    expect(capture.upstreamRequests).toHaveLength(0);
  });

  it("converts a Codex wrapper provenance mismatch and blocks the upstream", async () => {
    const capture = createInMemoryCaptureBoundary();
    vi.stubGlobal("fetch", capture.fetcher);
    const config = realChainConfig(capture.baseUrl);
    await initProxyStorage(config.storage);
    initAuth(config.auth);
    const pipeline = getInjectionPipeline(config);
    const declaredText = "<declared_production_source />";
    const declaredManifest = sealProductionPromptSourceManifest(declaredText, [{
      sourceId: "synthetic-declared-source",
      sourceKind: "static-tool",
      injectionBlockId: "synthetic-declared-block",
      text: declaredText,
    }]);
    const formalCaptureSpy = vi.spyOn(pipeline, "processWithProductionSources")
      .mockImplementation(async (syntheticBody) => {
        const messages = syntheticBody.messages as Array<Record<string, unknown>>;
        return {
          body: {
            ...syntheticBody,
            messages: [
              { ...messages[0], content: "<different_provider_injection />" },
              ...messages.slice(1),
            ],
          },
          productionSourceManifest: declaredManifest,
        };
      });
    const providerRequestObserver = {
      observeRequest: vi.fn(),
      observeCompletion: vi.fn(),
      track: vi.fn(),
    };
    let handlerPromise: ReturnType<typeof handleCodexEndpoint> | undefined;
    const app = new Hono();
    app.post("/*", (context) => {
      handlerPromise = handleCodexEndpoint(context, config, { providerRequestObserver });
      return handlerPromise;
    });
    app.onError(() => new Response("handler rejected", { status: 500 }));
    const adapter = new RealChainAdapter({
      request: (path, init) => Promise.resolve(app.request(`http://memory-proxy.test${path}`, init)),
    });
    const input: NormalizedRealChainInput = {
      identity: {
        spaceId: "space-eval",
        sessionId: "session-wrapper-provenance-failure",
        teamId: "team-alpha",
        agentId: "agent-general",
        taskId: "task-prompt-eval",
      },
      history: [],
      finalQuery: "Use the team proxy release workflow.",
    };

    const result = await adapter.probeProductionChain({
      input,
      model: "gpt-5.6-luna",
      providerAuthorization: "Bearer provider-probe-token",
      tdaiUserKey: "tdai-probe-user-key",
    });

    expect(result.status).toBe(500);
    expect(handlerPromise).toBeDefined();
    await expect(handlerPromise!).rejects.toMatchObject({
      name: "InjectionInfrastructureError",
      code: "INJECTION_METADATA_PARITY_FAILURE",
      message: expect.stringContaining("SOURCE_COVERAGE_MISMATCH"),
    });
    expect(formalCaptureSpy).toHaveBeenCalledOnce();
    expect(providerRequestObserver.observeRequest).not.toHaveBeenCalled();
    expect(capture.upstreamRequests).toHaveLength(0);
  });

  it("traverses createApp Session Init and InjectionPipeline before replaying real bridge entries", async () => {
    const capture = createInMemoryCaptureBoundary();
    vi.stubGlobal("fetch", capture.fetcher);
    const config = realChainConfig(capture.baseUrl);
    await initProxyStorage(config.storage);
    initAuth(config.auth);
    const observedBridgeEntries: ObservedBridgeEntry[] = [];
    const observedProviderRequests: ProviderRequestEvidence[] = [];
    const observedProviderCompletions: ProviderCompletionEvidence[] = [];
    const providerEvidenceTasks: Promise<unknown>[] = [];
    const app = createApp(config, {
      bridgeEntryObserver: (entry) => {
        observedBridgeEntries.push(entry);
      },
      providerRequestObserver: {
        observeRequest: (request) => observedProviderRequests.push(request),
        observeCompletion: (completion) => observedProviderCompletions.push(completion),
        track: (task) => { providerEvidenceTasks.push(task); },
      },
    });
    const adapter = new RealChainAdapter({
      request: (path, init) => Promise.resolve(app.request(`http://memory-proxy.test${path}`, init)),
    });
    const input: NormalizedRealChainInput = {
      identity: {
        spaceId: "space-eval",
        sessionId: "session-real-chain-probe",
        teamId: "team-alpha",
        agentId: "agent-general",
        taskId: "task-prompt-eval",
      },
      history: [
        { role: "user", content: "The user mentioned <skill_tools> as plain text." },
        { role: "assistant", content: "The previous turn did not call a tool." },
      ],
      finalQuery: "Use the team proxy release workflow.",
    };
    const expectedUserPrompt = userPlaneHistoryEnvelopeV1.serialize(input);

    const result = await adapter.probeProductionChain({
      input,
      model: "gpt-5.6-luna",
      providerAuthorization: "Bearer provider-probe-token",
      tdaiUserKey: "tdai-probe-user-key",
    });
    const prewarmAssetPaths = new Set([
      "/v3/meta/agent-fixed-asset/list-with-detail",
      "/v3/skill/listing",
      "/v3/knowledge/list",
    ]);
    const prewarmAssetRequestsAfterFirstRun = capture.metadataPaths.filter((path) => prewarmAssetPaths.has(path));
    const repeatedResult = await adapter.probeProductionChain({
      input,
      model: "gpt-5.6-luna",
      providerAuthorization: "Bearer provider-probe-token",
      tdaiUserKey: "tdai-probe-user-key",
    });
    await Promise.all(providerEvidenceTasks);

    expect(result.status).toBe(200);
    expect(repeatedResult.status).toBe(200);
    expect(capture.upstreamRequests).toHaveLength(2);
    expect(observedProviderRequests).toHaveLength(2);
    expect(observedProviderCompletions).toEqual([
      expect.objectContaining({
        correlationId: expect.any(String),
        status: 200,
        usage: expect.objectContaining({
          input_tokens: 321,
          input_tokens_details: { cached_tokens: 123 },
          output_tokens: 9,
        }),
      }),
      expect.objectContaining({
        correlationId: expect.any(String),
        status: 200,
        usage: expect.objectContaining({ input_tokens: 321 }),
      }),
    ]);
    expect(observedProviderRequests[0]).toMatchObject({
      method: "POST",
      path: "/codex/space-eval/v1/responses",
      body: capture.upstreamRequests[0]?.body,
      correlationHeaders: { "session-id": input.identity.sessionId },
      productionSourceManifest: {
        providerVisibleTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
    expect(observedProviderRequests[0]?.productionSourceManifest?.sources.some((source) => (
      source.injectionBlockId === "session-context"
      && source.sourceKind === "dynamic-asset"
    ))).toBe(true);
    expect(observedProviderRequests[0]?.rawBody).toBe(JSON.stringify(capture.upstreamRequests[0]?.body));
    expect(capture.metadataPaths.filter((path) => prewarmAssetPaths.has(path)))
      .toEqual(prewarmAssetRequestsAfterFirstRun);
    for (const path of prewarmAssetPaths) {
      expect(capture.metadataPaths.filter((candidate) => candidate === path)).toHaveLength(1);
    }
    expect(capture.metadataPaths).toEqual(expect.arrayContaining([
      "/v3/meta/auth/verify",
      "/v3/meta/team/list",
      "/v3/meta/agent/list",
      "/v3/meta/task/list",
      "/v3/meta/agent/get",
      "/v3/meta/task/get",
      "/v3/meta/config/user/get",
      "/v3/meta/agent-fixed-asset/list-with-detail",
      "/v3/skill/listing",
      "/v3/knowledge/list",
    ]));
    const prewarmSkillListing = capture.metadataRequests.find((request) => request.path === "/v3/skill/listing");
    expect(prewarmSkillListing?.body.query).toEqual(expect.stringContaining("proxy evaluation"));
    const providerRequest = capture.upstreamRequests[0];
    const repeatedProviderRequest = capture.upstreamRequests[1];
    expect(providerRequest.headers.authorization).toBe("Bearer provider-probe-token");
    expect(providerRequest.headers["x-tdai-user-key"]).toBeUndefined();
    expect(providerRequest.headers["x-tdai-eval-mode"]).toBeUndefined();
    expect(providerRequest.headers["x-tdai-history-transport"]).toBeUndefined();
    expect(providerRequest.headers).toMatchObject({
      "session-id": input.identity.sessionId,
      "x-team-id": input.identity.teamId,
      "x-agent-id": input.identity.agentId,
      "x-task-id": input.identity.taskId,
    });
    const firstAudit = auditCapturedRealChainRequest(providerRequest.body, expectedUserPrompt);
    const repeatedAudit = auditCapturedRealChainRequest(repeatedProviderRequest.body, expectedUserPrompt);
    expect(firstAudit).toMatchObject({
      wrapperCount: 1,
      hasSessionContext: true,
      toolFamilies: ["memory", "skill", "knowledge"],
      userPromptSha256: result.userPromptSha256,
    });
    expect({
      sha256: repeatedAudit.injectionSha256,
      tokens: repeatedAudit.injectionTokenCount,
      characters: repeatedAudit.injectionCharacterCount,
      bytes: repeatedAudit.injectionUtf8ByteCount,
    }).toEqual({
      sha256: firstAudit.injectionSha256,
      tokens: firstAudit.injectionTokenCount,
      characters: firstAudit.injectionCharacterCount,
      bytes: firstAudit.injectionUtf8ByteCount,
    });
    const providerInput = providerRequest.body.input as Array<{
      role?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    expect(providerInput
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content })))
      .toEqual([
        {
          role: "user",
          content: [{ type: "input_text", text: input.history[0]!.content }],
        },
        {
          role: "assistant",
          content: [{ type: "input_text", text: input.history[1]!.content }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: input.finalQuery }],
        },
      ]);
    expect(JSON.stringify(providerRequest.body)).not.toContain("task1_user_history_envelope");
    const productionWrapper = providerInput
      .flatMap((message) => message.content ?? [])
      .map((part) => part.text ?? "")
      .find((text) => text.startsWith("<tdai_injections>"));
    expect(productionWrapper).toContain(`id="${REAL_CHAIN_KNOWLEDGE_ID}"\n  url="http://knowledge.test/v3"`);
    expect(productionWrapper).toContain("x-tdai-service-id: space-eval");
    expect(productionWrapper).toContain(input.identity.sessionId);
    expect(productionWrapper).toContain(input.identity.teamId);
    expect(productionWrapper).toContain(input.identity.agentId);

    const bridgeHeaders = {
      "content-type": "application/json",
      "x-conversation-id": input.identity.sessionId,
      "x-tdai-service-id": input.identity.spaceId,
    };
    const replayLedger = new RealChainLedger("run-proxy-entries", "case-proxy-entries", input.identity.sessionId);
    const executeProxyEntryWithHeaders = (actualHeaders: Record<string, string>) => async (request: {
      endpoint: string;
      requestBody?: unknown;
    }) => {
      const captureIndex = capture.bridgeRequests.length;
      const observationIndex = observedBridgeEntries.length;
      const observedRequest = new Request(`http://memory-proxy.test${request.endpoint}`, {
        method: "POST",
        headers: actualHeaders,
        body: JSON.stringify(request.requestBody),
      });
      const response = await app.request(observedRequest);
      const observedEntry = observedBridgeEntries[observationIndex];
      const forwardedRequest = capture.bridgeRequests[captureIndex];
      return {
        status: response.status,
        responseBody: await response.json(),
        receipt: observedEntry ? {
          ...observedEntry,
          forwardedEvidence: forwardedRequest ? {
            endpoint: forwardedRequest.path,
            method: forwardedRequest.method,
            requestBody: forwardedRequest.body,
          } : undefined,
        } : undefined,
      };
    };
    const executeProxyEntry = executeProxyEntryWithHeaders(bridgeHeaders);
    await replayRealChainEntry(replayLedger, {
      entryId: "memory-search",
      family: "memory",
      tool: "tdai_memory_search",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      requestBody: { query: "release cache gate", limit: 3 },
    }, executeProxyEntry);
    await replayRealChainEntry(replayLedger, {
      entryId: "skill-search",
      family: "skill",
      tool: "caller_wrong_tool",
      endpoint: "/skill-bridge/v3/skill/search",
      method: "POST",
      requestBody: { query: "proxy release workflow" },
    }, executeProxyEntry);

    expect(replayLedger.snapshot().events.map((event) => event.kind)).toEqual([
      "tdai_entry",
      "tdai_accepted",
      "tdai_entry",
      "tdai_accepted",
    ]);
    expect(replayLedger.snapshot().events.find((event) => (
      event.kind === "tdai_accepted" && event.endpoint === "/skill-bridge/v3/skill/search"
    ))).toMatchObject({ tool: "skill_search" });
    expect(replayLedger.snapshot().events.filter((event) => event.kind === "tdai_entry"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          endpoint: "/memory-bridge/v3/atomic/search",
          tool: "tdai_memory_search",
          method: "POST",
          requestBody: { query: "release cache gate", limit: 3 },
          correlationHeaders: expect.objectContaining({
            "x-conversation-id": input.identity.sessionId,
            "x-tdai-service-id": input.identity.spaceId,
          }),
          forwardedEvidence: expect.objectContaining({
            endpoint: "/v3/atomic/search",
            requestBody: expect.objectContaining({ user_id: "user-real-chain", team_id: "team-alpha" }),
          }),
        }),
        expect.objectContaining({
          endpoint: "/skill-bridge/v3/skill/search",
          tool: "skill_search",
          method: "POST",
          requestBody: { query: "proxy release workflow" },
          forwardedEvidence: expect.objectContaining({
            endpoint: "/v3/skill/search",
            requestBody: expect.objectContaining({ user_id: "user-real-chain", team_id: "team-alpha" }),
          }),
        }),
      ]));
    const missingSessionOutcome = await replayRealChainEntry(replayLedger, {
      entryId: "memory-search-missing-session",
      family: "memory",
      tool: "caller_wrong_tool",
      endpoint: "/memory-bridge/v3/atomic/search",
      method: "POST",
      requestBody: { query: "missing session must reject" },
    }, executeProxyEntryWithHeaders({
      "content-type": "application/json",
      "x-tdai-service-id": input.identity.spaceId,
      authorization: "Bearer must-not-enter-observer",
      "x-tdai-user-key": "must-not-enter-observer",
    }));
    expect(missingSessionOutcome).toMatchObject({
      kind: "tdai_rejected",
      status: 401,
      tool: "tdai_memory_search",
    });
    expect(observedBridgeEntries).toHaveLength(3);
    expect(observedBridgeEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: "memory",
        endpoint: "/memory-bridge/v3/atomic/search",
        method: "POST",
        requestBody: { query: "release cache gate", limit: 3 },
        correlationHeaders: {
          "x-conversation-id": input.identity.sessionId,
          "x-tdai-service-id": input.identity.spaceId,
        },
      }),
      expect.objectContaining({
        family: "skill",
        endpoint: "/skill-bridge/v3/skill/search",
        method: "POST",
        requestBody: { query: "proxy release workflow" },
      }),
      expect.objectContaining({
        family: "memory",
        endpoint: "/memory-bridge/v3/atomic/search",
        requestBody: { query: "missing session must reject" },
        correlationHeaders: { "x-tdai-service-id": input.identity.spaceId },
      }),
    ]));
    expect(JSON.stringify(observedBridgeEntries)).not.toContain("must-not-enter-observer");
    expect(JSON.stringify(replayLedger.snapshot())).not.toContain("must-not-enter-observer");
    expect(capture.bridgeRequests).toHaveLength(2);
    expect(capture.bridgeRequests.map((request) => request.path)).toEqual([
      "/v3/atomic/search",
      "/v3/skill/search",
    ]);
    for (const request of capture.bridgeRequests) {
      expect(request.body).toMatchObject({
        user_id: "user-real-chain",
        team_id: "team-alpha",
        agent_id: "agent-general",
      });
      expect(request.headers.authorization).toBe(
        request.path === "/v3/skill/search"
          ? "Bearer test-service-token"
          : "Bearer local-proxy",
      );
      expect(request.headers["x-tdai-service-id"]).toBe("space-eval");
    }
  });
});
