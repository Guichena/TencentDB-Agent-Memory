/**
 * Disabled-by-default, no-model Session Init seam for Task 1 Formal runs.
 *
 * The route exists only to prove that the exact runtime identity can pass the
 * production auth/metadata/session state machine before any provider request is
 * sent. It never forwards upstream and never returns credentials or asset data.
 */
import type { Context } from "hono";

import { verifyUserKey } from "../auth.js";
import { fingerprintProxyConfigForExperiment } from "../experiment-config-fingerprint.js";
import { getMetadataClient, type MetadataClient } from "../meta/client.js";
import { handleSessionInit } from "../session/index.js";
import {
  getSessionStore,
  type SessionIdentity,
  type SessionNamespacePresence,
  type SessionStore,
} from "../session/store.js";
import type { ProxyConfig } from "../types.js";

export const FORMAL_PREFLIGHT_SESSION_PATH = "/v3/formal-bench/preflight-session" as const;

type JsonRecord = Record<string, unknown>;

interface FormalPreflightSessionRequest {
  readonly service_id: string;
  readonly session_id: string;
  readonly team_id: string;
  readonly agent_id: string;
  readonly task_id: string;
  readonly agent_source: "codex";
}

export interface FormalPreflightSessionDependencies {
  readonly enabled: boolean;
  readonly verify: typeof verifyUserKey;
  readonly getStore: () => SessionStore;
  readonly getMetadata: (config: ProxyConfig, serviceId: string, userKey: string) => MetadataClient;
  readonly initialize: typeof handleSessionInit;
}

export interface FormalPreflightSessionResult {
  readonly httpStatus: number;
  readonly body: Readonly<JsonRecord>;
}

const DEFAULT_DEPS: FormalPreflightSessionDependencies = {
  enabled: process.env.TDAI_FORMAL_PREFLIGHT_ENABLED === "1",
  verify: verifyUserKey,
  getStore: getSessionStore,
  getMetadata: (config, serviceId, userKey) => getMetadataClient(config.coreSkill, serviceId, userKey),
  initialize: handleSessionInit,
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseRequest(raw: unknown): FormalPreflightSessionRequest | null {
  const body = record(raw);
  if (!body) return null;
  const allowed = new Set([
    "service_id", "session_id", "team_id", "agent_id", "task_id", "agent_source",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  if (!nonBlank(body.service_id) || !nonBlank(body.session_id)
    || !nonBlank(body.team_id) || !nonBlank(body.agent_id)
    || !nonBlank(body.task_id) || body.agent_source !== "codex") return null;
  return body as unknown as FormalPreflightSessionRequest;
}

function response(status: number, code: number, message: string, data?: unknown): FormalPreflightSessionResult {
  return {
    httpStatus: status,
    body: Object.freeze({ code, message, ...(data === undefined ? {} : { data }) }),
  };
}

function effectiveWriteConfig(config: ProxyConfig): Readonly<JsonRecord> {
  return Object.freeze({
    configFingerprintSha256: fingerprintProxyConfigForExperiment(config).effectiveSha256,
    extractionEnabled: config.extraction.enabled,
    extractionExtractorIds: Object.freeze([...config.extraction.extractors]),
    tdaiL0WriteEnabled: config.tdai.memory.writeL0,
    skillLlmWriteEnabled: config.skillRuntime.allowLlmWrite,
    analyseMarkerEnabled: config.injection.assetReflection?.markerOptIn === true,
    assetReflectionEnabled: config.injection.assetReflection?.markerOptIn === true,
    // Every automatic archive path is gated by the same formal extraction
    // override. Keep the raw value here; the independent R04 evaluator decides.
    archiveWriteBackEnabled: config.extraction.enabled,
  });
}

function namespaceData(sessionId: string, lookups: readonly SessionNamespacePresence[]): Readonly<JsonRecord> {
  return Object.freeze({
    sessionId,
    preRegistrationLookups: Object.freeze(lookups.map((lookup) => Object.freeze({
      layer: lookup.layer,
      matchedSessionIds: Object.freeze([...lookup.matchedSessionIds]),
    }))),
  });
}

/** Run real Session Init up to registration, with no provider/model request. */
export async function runFormalBenchmarkPreflightSession(
  rawBody: unknown,
  userKey: string,
  config: ProxyConfig,
  deps: FormalPreflightSessionDependencies = DEFAULT_DEPS,
): Promise<FormalPreflightSessionResult> {
  if (!deps.enabled) return response(404, 404, "Formal benchmark preflight is disabled");
  const request = parseRequest(rawBody);
  if (!request || !nonBlank(userKey)) {
    return response(400, 40001, "Invalid Formal benchmark preflight request");
  }
  if (!config.sessionInit.enabled || !config.sessionInit.headerAutoSelect?.enabled) {
    return response(409, 40901, "Production Session Init preset selection is not enabled");
  }

  const verified = await deps.verify(userKey, request.service_id);
  if (verified.rejected || !verified.userId) {
    return response(401, 40101, "Formal benchmark preflight auth failed");
  }

  const identity: SessionIdentity = {
    userId: verified.userId,
    agentSource: request.agent_source,
    sessionId: request.session_id,
    spaceId: request.service_id,
  };
  const store = deps.getStore();
  const lookups = await store.inspectNamespacePresence(identity);
  const namespace = namespaceData(request.session_id, lookups);
  const writeConfig = effectiveWriteConfig(config);
  if (lookups.some((lookup) => lookup.matchedSessionIds.length > 0)) {
    return response(409, 40902, "Formal session namespace is not fresh", {
      sessionNamespace: namespace,
      effectiveWriteConfig: writeConfig,
    });
  }

  const compositeKey = `${request.agent_source}:${request.session_id}`;
  store.bind(compositeKey, identity);
  const metadata = deps.getMetadata(config, request.service_id, userKey);
  const result = await deps.initialize(
    request.session_id,
    verified.userId,
    [],
    config.sessionInit,
    store,
    {
      stream: false,
      modelId: "formal-preflight",
      // The shared CB request-context type predates Codex Responses; the real
      // codexHandler uses the same compatibility cast at this boundary.
      protocol: "responses" as any,
      codexAnswerInput: [],
    },
    request.agent_source,
    metadata,
    userKey,
    request.service_id,
    { teamId: request.team_id, agentId: request.agent_id, taskId: request.task_id },
  );
  const session = result.sessionInfo;
  if (result.intercepted || result.bypassed || !session
    || session.task_id !== request.task_id || session.space_id !== request.service_id) {
    return response(409, 40903, "Production Session Init did not bind the requested identity", {
      sessionNamespace: namespace,
      effectiveWriteConfig: writeConfig,
    });
  }

  const requestIdentity = Object.freeze({
    sessionId: request.session_id,
    spaceId: request.service_id,
    teamId: request.team_id,
    userId: verified.userId,
    agentId: request.agent_id,
    taskId: request.task_id,
    agentSource: request.agent_source,
  });
  return response(200, 0, "ok", {
    session: Object.freeze({
      request: requestIdentity,
      response: Object.freeze({
        sessionId: session.session_id,
        spaceId: session.space_id,
        teamId: session.team_id,
        userId: session.user_id,
        agentId: session.agent_id,
        taskId: session.task_id,
        agentSource: request.agent_source,
        httpStatus: 200,
        envelopeCode: 0,
      }),
    }),
    sessionNamespace: namespace,
    effectiveWriteConfig: writeConfig,
  });
}

export function createFormalBenchmarkPreflightSessionHandler(
  config: ProxyConfig,
  deps: FormalPreflightSessionDependencies = DEFAULT_DEPS,
): (context: Context) => Promise<Response> {
  return async (context) => {
    let raw: unknown;
    try {
      raw = await context.req.json();
    } catch {
      raw = null;
    }
    const result = await runFormalBenchmarkPreflightSession(
      raw,
      context.req.header("x-tdai-user-key") ?? "",
      config,
      deps,
    );
    return context.json(result.body, result.httpStatus as 200);
  };
}
