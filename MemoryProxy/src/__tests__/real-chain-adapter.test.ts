import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RealChainAdapter,
  auditCapturedRealChainRequest,
  type RealChainTransport,
} from "../../eval/tool-prompt-bench/real-chain-adapter.js";
import { initAuth } from "../auth.js";
import { DEFAULT_CONFIG } from "../config.js";
import { __resetHookCacheRepoForTests } from "../db/hookCacheRepo.js";
import { __resetSessionRepoForTests } from "../db/sessionRepo.js";
import { __resetInjectionPipelineForTests } from "../injection/index.js";
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

interface CapturedUpstreamRequest {
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface RunningCaptureBackend {
  baseUrl: string;
  metadataPaths: string[];
  upstreamRequests: CapturedUpstreamRequest[];
  close(): Promise<void>;
}

async function startCaptureBackend(): Promise<RunningCaptureBackend> {
  const app = new Hono();
  const metadataPaths: string[] = [];
  const upstreamRequests: CapturedUpstreamRequest[] = [];

  app.post("*", async (c) => {
    const path = c.req.path;
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    if (path === "/responses") {
      upstreamRequests.push({
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        body,
      });
      return new Response(null, { status: 204 });
    }

    metadataPaths.push(path);
    if (path === "/v3/meta/auth/verify") {
      return c.json({ code: 0, data: { valid: true, user: { user_id: "user-real-chain" } } });
    }
    if (path === "/v3/meta/team/list") {
      return c.json({
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
      return c.json({
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
      return c.json({
        code: 0,
        data: {
          items: [{
            task_id: "task-prompt-eval",
            team_id: "team-alpha",
            title: "Prompt evaluation",
            description: "Measure correct first tool selection without runner injection",
            status: "running",
          }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      });
    }
    if (path === "/v3/meta/agent/get") {
      return c.json({
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
      return c.json({
        code: 0,
        data: {
          task_id: "task-prompt-eval",
          team_id: "team-alpha",
          title: "Prompt evaluation",
          description: "Measure correct first tool selection without runner injection",
        },
      });
    }
    if (path === "/v3/meta/participation-log/append") {
      return c.json({ code: 0, data: { id: "participation-1", ...body } });
    }
    if (path === "/v3/meta/config/user/get") {
      return c.json({ code: 0, data: { items: [] } });
    }
    if (path === "/v3/meta/agent-fixed-asset/list-with-detail") {
      return c.json({
        code: 0,
        data: {
          items: [
            { asset_id: "knowledge-proxy-graph", asset_type: "code_graph", status: "active" },
            { asset_id: "knowledge-proxy-wiki", asset_type: "llm_wiki", status: "active" },
          ],
          total: 2,
        },
      });
    }
    if (path === "/v3/skill/listing") {
      return c.json({
        code: 0,
        data: {
          mode: "full",
          listing: [
            "<available_skills>",
            "- proxy-release-check: Verify the proxy release and evaluation gates.",
            "</available_skills>",
          ].join("\n"),
          hits: [{ skill_id: "skill-release-check", version: 3, name: "proxy-release-check" }],
        },
      });
    }
    if (path === "/v3/knowledge/list") {
      return c.json({
        code: 0,
        data: {
          items: [
            {
              knowledge_id: "knowledge-proxy-graph",
              type: "code-graph",
              service_url: "http://knowledge.test/v3",
              name: "TencentDB Agent Memory graph",
              summary: "Production source graph",
              team_id: "team-alpha",
              user_id: null,
              repo_url: "https://github.com/tencent/TencentDB-Agent-Memory.git",
              branch: "main",
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-01T00:00:00.000Z",
            },
            {
              knowledge_id: "knowledge-proxy-wiki",
              type: "wiki",
              service_url: "http://knowledge.test/v3",
              name: "Proxy release decisions",
              summary: "Why the proxy release workflow uses staged gates",
              team_id: "team-alpha",
              user_id: null,
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          total: 2,
        },
      });
    }
    return c.json({ code: 404, message: `unhandled test path ${path}` }, 404);
  });

  let server: ServerType | undefined;
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => resolve(info.port));
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    metadataPaths,
    upstreamRequests,
    close: () => new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error?: Error) => error ? reject(error) : resolve());
    }),
  };
}

function realChainConfig(baseUrl: string): ProxyConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.server = { host: "127.0.0.1", port: 8096, forwardTimeoutMs: 5_000 };
  config.upstream = {
    url: baseUrl,
    apiKey: "",
    agents: { codex: { url: baseUrl } },
  };
  config.storage = {
    ...config.storage,
    enabled: true,
    backend: "memory",
  };
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

describe("Task 1 real-chain Adapter", () => {
  it("prepares Codex for normal Session Init without runner-owned TDAI instructions", () => {
    const prepared = new RealChainAdapter().prepareCodexRun({
      proxyBaseUrl: "http://127.0.0.1:8096/",
      identity: {
        spaceId: "space-eval",
        sessionId: "session-case-001-r1",
        teamId: "team-alpha",
        agentId: "agent-general",
        taskId: "task-prompt-eval",
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
      query: "Apply the established proxy release workflow.",
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
    });
    expect(prepared.providerEnvHeaders).toEqual({ "x-tdai-user-key": "TDAI_EVAL_USER_KEY" });
    expect(prepared.environment).toMatchObject({
      PATH: "test-path",
      CODEX_HOME: "C:/Users/example/.codex",
      CODEX_SQLITE_HOME: join("D:/eval/runs/case-001/isolated-home", "sqlite"),
      HOME: "D:/eval/runs/case-001/isolated-home",
      USERPROFILE: "D:/eval/runs/case-001/isolated-home",
      TDAI_EVAL_USER_KEY: "tdai-secret-value",
    });
    expect(prepared.environment.CODEX_THREAD_ID).toBeUndefined();
    expect(prepared.stdin).toBe("Apply the established proxy release workflow.");
    expect(prepared.invocation.args).toContain("gpt-5.6-luna");
    expect(prepared.invocation.args.join("\n")).toContain("model_reasoning_effort=\"high\"");
    expect(prepared.invocation.args.join("\n")).not.toMatch(/developer_instructions|mock-contract|x-tdai-eval-mode/i);
    expect(prepared.manifest).toMatchObject({
      evaluationLayer: "memory-proxy-real-chain",
      formalMetricEligible: false,
      readiness: "adapter-only",
      injectionOwner: "memory-proxy-production-pipeline",
      sessionInitMode: "validated-header-auto-select",
      authenticationMode: "shared-codex-home-no-copy",
      isolatedUserHome: "D:/eval/runs/case-001/isolated-home",
      developerInstructionsInjectedByRunner: false,
      mockContractBypassEnabled: false,
    });
    expect(JSON.stringify(prepared.manifest)).not.toContain("tdai-secret-value");
    expect(prepared.invocation.args.join("\n")).not.toContain("tdai-secret-value");
  });

  it("reaches production Session Init, InjectionPipeline, and upstream exactly once without a model", async () => {
    const backend = await startCaptureBackend();
    try {
      const config = realChainConfig(backend.baseUrl);
      await initProxyStorage(config.storage);
      initAuth(config.auth);
      const app = createApp(config);
      const transport: RealChainTransport = {
        request: (path, init) => Promise.resolve(
          app.request(`http://memory-proxy.test${path}`, init),
        ),
      };
      const adapter = new RealChainAdapter(transport);

      const result = await adapter.probeProductionChain({
        identity: {
          spaceId: "space-eval",
          sessionId: "session-real-chain-probe",
          teamId: "team-alpha",
          agentId: "agent-general",
          taskId: "task-prompt-eval",
        },
        query: "Use the team proxy release workflow.",
        model: "gpt-5.6-luna",
        providerAuthorization: "Bearer provider-probe-token",
        tdaiUserKey: "tdai-probe-user-key",
      });

      expect(result.status).toBe(204);
      expect(backend.upstreamRequests).toHaveLength(1);
      expect(backend.metadataPaths).toEqual(expect.arrayContaining([
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

      const captured = backend.upstreamRequests[0];
      expect(captured.headers.authorization).toBe("Bearer provider-probe-token");
      expect(captured.headers["x-tdai-user-key"]).toBeUndefined();
      expect(captured.headers["x-tdai-eval-mode"]).toBeUndefined();
      const audit = auditCapturedRealChainRequest(captured.body);
      expect(audit).toMatchObject({
        wrapperCount: 1,
        injectionTokenEncoding: "o200k_base",
        hasSessionContext: true,
        toolFamilies: ["memory", "skill", "knowledge"],
      });
      expect(audit.injectionSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(audit.injectionTokenCount).toBeGreaterThan(0);
      expect(audit.injectionCharacterCount).toBeGreaterThan(0);
      expect(audit.injectionUtf8ByteCount).toBeGreaterThanOrEqual(audit.injectionCharacterCount);
    } finally {
      await backend.close();
    }
  });

  it("rejects duplicate or absent production wrappers in captured requests", () => {
    const part = { type: "input_text", text: "<tdai_injections>one</tdai_injections>" };
    expect(() => auditCapturedRealChainRequest({
      input: [{ type: "message", role: "developer", content: [] }],
    })).toThrow(/exactly one TDAI wrapper; got 0/);
    expect(() => auditCapturedRealChainRequest({
      input: [{ type: "message", role: "developer", content: [part, part] }],
    })).toThrow(/exactly one TDAI wrapper; got 2/);
    expect(() => auditCapturedRealChainRequest({
      input: [{
        type: "message",
        role: "developer",
        content: [
          { type: "input_text", text: "<skill_tools>runner copy</skill_tools>" },
          part,
        ],
      }],
    })).toThrow(/TDAI prompt text outside the production wrapper/);
  });
});
