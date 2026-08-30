import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../config.js";
import { createApp } from "../server.js";
import {
  runFormalBenchmarkPreflightSession,
  type FormalPreflightSessionDependencies,
} from "../routes/formal-benchmark-preflight-session.js";
import { SessionStore } from "../session/store.js";
import type { BindingRepo } from "../db/binding-repo.js";
import type { SessionRepo } from "../db/sessionRepo.js";
import type { ProxyConfig } from "../types.js";

const request = {
  service_id: "runtime-space",
  session_id: "formal-session-opaque",
  team_id: "runtime-team",
  agent_id: "runtime-agent",
  task_id: "runtime-task",
  agent_source: "codex",
} as const;

function config(): ProxyConfig {
  const value = structuredClone(DEFAULT_CONFIG);
  value.sessionInit.enabled = true;
  value.sessionInit.headerAutoSelect = {
    enabled: true,
    teamHeader: "x-team-id",
    agentHeader: "x-agent-id",
    taskHeader: "x-task-id",
    onMismatch: "form",
  };
  value.extraction = { enabled: false, extractors: [] };
  value.tdai.memory.writeL0 = false;
  value.skillRuntime.allowLlmWrite = false;
  value.injection.assetReflection = { markerOptIn: false };
  return value;
}

function deps(store: SessionStore, enabled = true): FormalPreflightSessionDependencies {
  return {
    enabled,
    verify: vi.fn(async () => ({ userId: "runtime-user", rejected: false })),
    getStore: () => store,
    getMetadata: vi.fn(() => ({} as never)),
    initialize: vi.fn(async () => ({
      intercepted: false,
      sessionInfo: {
        session_id: request.session_id,
        space_id: request.service_id,
        team_id: request.team_id,
        user_id: "runtime-user",
        agent_id: request.agent_id,
        task_id: request.task_id,
      },
    })) as FormalPreflightSessionDependencies["initialize"],
  };
}

describe("Formal benchmark no-model Session Init preflight", () => {
  it("is wired ahead of catch-all routes and returns 404 while the flag is absent", async () => {
    const response = await createApp(config()).request(
      `http://memory-proxy.test${"/v3/formal-bench/preflight-session"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-tdai-user-key": "unused" },
        body: JSON.stringify(request),
      },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 404 });
  });

  it("is unavailable by default and never initializes a session", async () => {
    const dependencies = deps(new SessionStore(), false);
    const result = await runFormalBenchmarkPreflightSession(
      request,
      "secret-user-key",
      config(),
      dependencies,
    );

    expect(result).toMatchObject({ httpStatus: 404, body: { code: 404 } });
    expect(dependencies.verify).not.toHaveBeenCalled();
    expect(dependencies.initialize).not.toHaveBeenCalled();
  });

  it("probes every namespace layer and refuses to overwrite existing state", async () => {
    const repo = {
      getBySessionId: vi.fn(async () => ({ status: "initialized" })),
    } as unknown as SessionRepo;
    const binding = {
      getBinding: vi.fn(async () => ({ outcome: "initialized" })),
    } as unknown as BindingRepo;
    const store = new SessionStore(30_000, repo, binding);
    const dependencies = deps(store);
    const result = await runFormalBenchmarkPreflightSession(
      request,
      "secret-user-key",
      config(),
      dependencies,
    );

    expect(result).toMatchObject({
      httpStatus: 409,
      body: {
        code: 40902,
        data: {
          sessionNamespace: {
            sessionId: request.session_id,
            preRegistrationLookups: [
              { layer: "l1", matchedSessionIds: [] },
              { layer: "l2a", matchedSessionIds: [request.session_id] },
              { layer: "l2b", matchedSessionIds: [request.session_id] },
              { layer: "history-scan", matchedSessionIds: [] },
            ],
          },
        },
      },
    });
    expect(dependencies.initialize).not.toHaveBeenCalled();
  });

  it("binds the prepared identity through production Session Init without a model call", async () => {
    const store = new SessionStore();
    const dependencies = deps(store);
    const result = await runFormalBenchmarkPreflightSession(
      request,
      "secret-user-key",
      config(),
      dependencies,
    );

    expect(dependencies.initialize).toHaveBeenCalledWith(
      request.session_id,
      "runtime-user",
      [],
      expect.any(Object),
      store,
      expect.objectContaining({ protocol: "responses" }),
      "codex",
      expect.anything(),
      "secret-user-key",
      request.service_id,
      { teamId: request.team_id, agentId: request.agent_id, taskId: request.task_id },
    );
    expect(result).toMatchObject({
      httpStatus: 200,
      body: {
        code: 0,
        data: {
          session: {
            request: {
              sessionId: request.session_id,
              userId: "runtime-user",
              teamId: request.team_id,
              agentId: request.agent_id,
              taskId: request.task_id,
            },
            response: {
              httpStatus: 200,
              envelopeCode: 0,
            },
          },
          effectiveWriteConfig: {
            extractionEnabled: false,
            extractionExtractorIds: [],
            tdaiL0WriteEnabled: false,
            skillLlmWriteEnabled: false,
            analyseMarkerEnabled: false,
            assetReflectionEnabled: false,
            archiveWriteBackEnabled: false,
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret-user-key");
  });
});
