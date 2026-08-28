import { createHash } from "node:crypto";
import {
  buildCodexConfigArgs,
  buildCodexInvocation,
  countInjectionTokens,
  isolateCodexEnvironment,
  type CodexInvocation,
  type CodexReasoningEffort,
  type CodexVerbosity,
} from "./codex-runner.js";

export const REAL_CHAIN_RUN_MODE = "memory-proxy-real-chain" as const;
export const REAL_CHAIN_TDAI_USER_KEY_ENV = "TDAI_EVAL_USER_KEY" as const;

export interface RealChainIdentity {
  spaceId: string;
  sessionId: string;
  teamId: string;
  agentId: string;
  taskId?: string;
}

export interface PrepareRealChainRunInput {
  proxyBaseUrl: string;
  identity: RealChainIdentity;
  workspaceDir: string;
  authenticatedCodexHome: string;
  isolatedHome: string;
  /** Injectable for tests; production callers normally leave this undefined. */
  environmentSource?: NodeJS.ProcessEnv;
  query: string;
  model: string;
  reasoningEffort: CodexReasoningEffort;
  verbosity: CodexVerbosity;
  tdaiUserKeyEnv?: string;
}

export interface PreparedRealChainRun {
  invocation: CodexInvocation;
  /** Subprocess-only environment. Do not serialize it into run artifacts. */
  environment: NodeJS.ProcessEnv;
  stdin: string;
  providerBaseUrl: string;
  providerHeaders: Record<string, string>;
  providerEnvHeaders: Record<string, string>;
  manifest: {
    schemaVersion: "1.0";
    evaluationLayer: typeof REAL_CHAIN_RUN_MODE;
    formalMetricEligible: false;
    readiness: "adapter-only";
    injectionOwner: "memory-proxy-production-pipeline";
    sessionInitMode: "validated-header-auto-select";
    model: string;
    reasoningEffort: CodexReasoningEffort;
    verbosity: CodexVerbosity;
    identity: RealChainIdentity;
    providerBaseUrl: string;
    tdaiUserKeyEnvironment: string;
    authenticationMode: "shared-codex-home-no-copy";
    isolatedUserHome: string;
    developerInstructionsInjectedByRunner: false;
    mockContractBypassEnabled: false;
  };
}

/**
 * The Adapter owns only the MemoryProxy request boundary. World loading,
 * scoring, and model execution remain separate modules.
 */
export interface RealChainTransport {
  request(path: string, init: RequestInit): Promise<Response>;
}

/** Production transport used when the Adapter targets a running MemoryProxy. */
export class HttpRealChainTransport implements RealChainTransport {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  request(path: string, init: RequestInit): Promise<Response> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return this.fetcher(`${this.baseUrl}${normalizedPath}`, init);
  }
}

export interface RealChainProbeInput {
  identity: RealChainIdentity;
  query: string;
  model: string;
  /** Provider credential forwarded to the capture upstream. Never persisted. */
  providerAuthorization: string;
  /** TDAI credential consumed by MemoryProxy. Never persisted. */
  tdaiUserKey: string;
}

export interface RealChainProbeResult {
  status: number;
  contentType: string | null;
}

export interface CapturedRealChainAudit {
  wrapperCount: 1;
  injectionSha256: string;
  injectionTokenEncoding: "o200k_base";
  injectionTokenCount: number;
  injectionCharacterCount: number;
  injectionUtf8ByteCount: number;
  hasSessionContext: boolean;
  toolFamilies: Array<"memory" | "skill" | "knowledge">;
}

/**
 * Deep evaluation boundary for the real production path:
 * Codex provider config -> normal Session Init headers -> MemoryProxy.
 */
export class RealChainAdapter {
  constructor(private readonly transport?: RealChainTransport) {}

  prepareCodexRun(input: PrepareRealChainRunInput): PreparedRealChainRun {
    const identity = validateIdentity(input.identity);
    const query = requireText("query", input.query);
    const model = requireText("model", input.model);
    const workspaceDir = requireText("workspaceDir", input.workspaceDir);
    const authenticatedCodexHome = requireText("authenticatedCodexHome", input.authenticatedCodexHome);
    const isolatedHome = requireText("isolatedHome", input.isolatedHome);
    const tdaiUserKeyEnvironment = validateEnvironmentName(
      input.tdaiUserKeyEnv ?? REAL_CHAIN_TDAI_USER_KEY_ENV,
    );
    const providerBaseUrl = buildMemoryProxyCodexBaseUrl(input.proxyBaseUrl, identity.spaceId);
    const providerHeaders = buildRealChainIdentityHeaders(identity);
    const providerEnvHeaders = { "x-tdai-user-key": tdaiUserKeyEnvironment };
    const configArgs = buildCodexConfigArgs({
      providerBaseUrl,
      providerHeaders,
      providerEnvHeaders,
      reasoningEffort: input.reasoningEffort,
      verbosity: input.verbosity,
    });

    const serializedArgs = configArgs.join("\n");
    if (/developer_instructions=|x-tdai-eval-mode|mock-contract/i.test(serializedArgs)) {
      throw new Error("real-chain Codex config contains a runner-owned injection or Mock bypass");
    }

    return {
      invocation: buildCodexInvocation({ workspaceDir, model, configArgs }),
      environment: isolateCodexEnvironment(
        input.environmentSource ?? process.env,
        authenticatedCodexHome,
        isolatedHome,
      ),
      stdin: query,
      providerBaseUrl,
      providerHeaders,
      providerEnvHeaders,
      manifest: {
        schemaVersion: "1.0",
        evaluationLayer: REAL_CHAIN_RUN_MODE,
        // World Loader and first-entry Observer are separate gates. Until they
        // pass, Adapter output must not be mistaken for a formal metric run.
        formalMetricEligible: false,
        readiness: "adapter-only",
        injectionOwner: "memory-proxy-production-pipeline",
        sessionInitMode: "validated-header-auto-select",
        model,
        reasoningEffort: input.reasoningEffort,
        verbosity: input.verbosity,
        identity,
        providerBaseUrl,
        tdaiUserKeyEnvironment,
        authenticationMode: "shared-codex-home-no-copy",
        isolatedUserHome: isolatedHome,
        developerInstructionsInjectedByRunner: false,
        mockContractBypassEnabled: false,
      },
    };
  }

  /**
   * No-model preflight. The transport must terminate at a capture upstream;
   * this method intentionally does not parse or simulate injection itself.
   */
  async probeProductionChain(input: RealChainProbeInput): Promise<RealChainProbeResult> {
    if (!this.transport) throw new Error("real-chain probe requires a transport");
    const identity = validateIdentity(input.identity);
    const query = requireText("query", input.query);
    const model = requireText("model", input.model);
    const providerAuthorization = requireText("providerAuthorization", input.providerAuthorization);
    const tdaiUserKey = requireText("tdaiUserKey", input.tdaiUserKey);
    const path = `/codex/${encodeURIComponent(identity.spaceId)}/v1/responses`;
    const headers = {
      ...buildRealChainIdentityHeaders(identity),
      authorization: providerAuthorization,
      "x-tdai-user-key": tdaiUserKey,
      "content-type": "application/json",
    };
    const body = {
      model,
      stream: false,
      store: false,
      input: [
        {
          type: "message",
          role: "developer",
          // A real Codex request has a developer message at input[0]. Keep it
          // empty here so every TDAI byte captured upstream must come from Proxy.
          content: [],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: query }],
        },
      ],
      client_metadata: { session_id: identity.sessionId },
    };

    const response = await this.transport.request(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
    };
  }
}

export function buildMemoryProxyCodexBaseUrl(proxyBaseUrl: string, spaceId: string): string {
  const base = normalizeBaseUrl(proxyBaseUrl);
  return `${base}/codex/${encodeURIComponent(validateIdentifier("spaceId", spaceId))}/v1`;
}

export function buildRealChainIdentityHeaders(identityInput: RealChainIdentity): Record<string, string> {
  const identity = validateIdentity(identityInput);
  return {
    "session-id": identity.sessionId,
    "x-team-id": identity.teamId,
    "x-agent-id": identity.agentId,
    ...(identity.taskId ? { "x-task-id": identity.taskId } : {}),
  };
}

/** Audit the provider-visible request captured after production injection. */
export function auditCapturedRealChainRequest(body: unknown): CapturedRealChainAudit {
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new Error("captured real-chain body must be a JSON object");
  }
  const input = (body as Record<string, unknown>).input;
  if (!Array.isArray(input)) throw new Error("captured real-chain body is missing input[]");
  const textParts = input.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => (
      part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
        ? [(part as Record<string, unknown>).text as string]
        : []
    ));
  });
  const injections = textParts.filter((text) => text.startsWith("<tdai_injections>"));
  if (injections.length !== 1) {
    throw new Error(`captured real-chain request must contain exactly one TDAI wrapper; got ${injections.length}`);
  }
  const runnerOwnedTdaiText = textParts
    .filter((text) => !text.startsWith("<tdai_injections>"))
    .find((text) => /<tdai_memory_tools>|<memory-tools-guide>|<tdai_profile_memory>|<skill_tools>|<available_skills>|<knowledge_tools>/.test(text));
  if (runnerOwnedTdaiText) {
    throw new Error("captured real-chain request contains TDAI prompt text outside the production wrapper");
  }
  const injection = injections[0];
  const toolFamilies: CapturedRealChainAudit["toolFamilies"] = [];
  if (/<tdai_memory_tools>|<memory-tools-guide>|<tdai_profile_memory>/.test(injection)) toolFamilies.push("memory");
  if (/<skill_tools>|<available_skills>/.test(injection)) toolFamilies.push("skill");
  if (/<knowledge_tools>/.test(injection)) toolFamilies.push("knowledge");
  return {
    wrapperCount: 1,
    injectionSha256: createHash("sha256").update(injection).digest("hex"),
    injectionTokenEncoding: "o200k_base",
    injectionTokenCount: countInjectionTokens(injection),
    injectionCharacterCount: injection.length,
    injectionUtf8ByteCount: Buffer.byteLength(injection, "utf8"),
    hasSessionContext: injection.includes("<session_context>"),
    toolFamilies,
  };
}

function validateIdentity(input: RealChainIdentity): RealChainIdentity {
  return {
    spaceId: validateIdentifier("spaceId", input.spaceId),
    sessionId: validateIdentifier("sessionId", input.sessionId),
    teamId: validateIdentifier("teamId", input.teamId),
    agentId: validateIdentifier("agentId", input.agentId),
    ...(input.taskId ? { taskId: validateIdentifier("taskId", input.taskId) } : {}),
  };
}

function validateIdentifier(name: string, value: string): string {
  const normalized = requireText(name, value);
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error(`${name} contains unsupported characters`);
  }
  return normalized;
}

function validateEnvironmentName(value: string): string {
  const normalized = requireText("tdaiUserKeyEnv", value);
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(normalized)) {
    throw new Error("tdaiUserKeyEnv must be a valid environment variable name");
  }
  return normalized;
}

function requireText(name: string, value: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizeBaseUrl(value: string): string {
  const normalized = requireText("baseUrl", value).replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("baseUrl must be an absolute HTTP(S) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("baseUrl must use HTTP or HTTPS");
  }
  return normalized;
}
