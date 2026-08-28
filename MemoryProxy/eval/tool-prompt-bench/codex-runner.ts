import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";
import { CASES, FIXTURES } from "./case-definitions.js";
import { evaluateToolPromptCase } from "./evaluator.js";
import { renderFixturePrompt } from "./prompt-harness.js";
import { startToolPromptMockServer } from "./protocol-harness.js";
import type { EvalFixture, ToolPromptEvalCase } from "./schema.js";
import { resolveToolPromptVariant } from "./variant-profiles.js";
import {
  materializeWorkspace,
  projectOf,
  workspacePathFor,
} from "./worlds/compile.js";
import {
  WORLD_CASES,
  WORLD_FIXTURES,
  worldOf,
  type World,
} from "./worlds/index.js";
import type { ProjectContext } from "./worlds/world-schema.js";
import { startWorldMockServer } from "./worlds/worlds-bridge.js";

export interface CodexInvocationInput {
  workspaceDir: string;
  model: string;
  configArgs: string[];
}

export interface CodexInvocation {
  executable: string;
  args: string[];
  commandPrefix?: string[];
}

export interface ResolveCodexInvocationOptions {
  explicitExecutable?: string;
  platform?: NodeJS.Platform;
  appData?: string;
  nodeExecutable?: string;
  pathExists?: (path: string) => boolean;
}

export interface CodexProfileInput {
  developerInstructions: string;
  providerBaseUrl?: string;
  providerHeaders?: Record<string, string>;
  /** Provider header -> environment variable name. Secret values never enter CLI args. */
  providerEnvHeaders?: Record<string, string>;
  reasoningEffort: CodexReasoningEffort;
  verbosity: CodexVerbosity;
}

export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type CodexVerbosity = "low" | "medium" | "high";

export const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = "high";
export const DEFAULT_CODEX_VERBOSITY: CodexVerbosity = "medium";
export const MOCK_CONTRACT_RUN_MODE = "mock-contract" as const;
export const TDAI_EVAL_USER_KEY_ENV = "TDAI_EVAL_USER_KEY" as const;

export interface CodexRunOptions {
  caseId: string;
  model: string;
  variant: string;
  repeat: number;
  outputRoot: string;
  providerBaseUrl?: string;
  codexExecutable?: string;
  codexHome?: string;
  timeoutMs?: number;
  dryRun?: boolean;
  reasoningEffort: CodexReasoningEffort;
  verbosity: CodexVerbosity;
}

export interface ResolvedBenchmarkCase {
  item: ToolPromptEvalCase;
  fixture: EvalFixture;
  world?: World;
  activeProject?: ProjectContext;
}

export interface PreparedBenchmarkWorkspace {
  workspaceDir: string;
  writtenFiles: string[];
}

/** Resolve both the frozen one-case fixtures and the shared World pilot cases. */
export function resolveBenchmarkCase(caseId: string): ResolvedBenchmarkCase {
  const legacyItem = CASES.find((candidate) => candidate.caseId === caseId);
  const worldItem = WORLD_CASES.find((candidate) => candidate.caseId === caseId);
  if (legacyItem && worldItem) throw new Error(`ambiguous caseId ${caseId}`);

  if (worldItem) {
    const world = worldOf(caseId);
    const fixture = WORLD_FIXTURES.find((candidate) => candidate.fixtureId === worldItem.fixtureIds[0]);
    if (!fixture) throw new Error(`${caseId}: missing World fixture ${worldItem.fixtureIds[0]}`);
    return {
      item: worldItem,
      fixture,
      world,
      activeProject: projectOf(world, worldItem.activeProject),
    };
  }

  if (!legacyItem) throw new Error(`unknown caseId ${caseId}`);
  const fixture = FIXTURES.find((candidate) => candidate.fixtureId === legacyItem.fixtureIds[0]);
  if (!fixture) throw new Error(`${caseId}: missing fixture ${legacyItem.fixtureIds[0]}`);
  return { item: legacyItem, fixture };
}

/** Create a clean case workspace and materialize only the active World project. */
export function prepareBenchmarkWorkspace(
  runDir: string,
  resolvedCase: ResolvedBenchmarkCase,
): PreparedBenchmarkWorkspace {
  if (resolvedCase.world && resolvedCase.activeProject) {
    const workspaceDir = workspacePathFor(runDir, resolvedCase.activeProject);
    mkdirSync(workspaceDir, { recursive: true });
    return {
      workspaceDir,
      writtenFiles: materializeWorkspace(resolvedCase.activeProject, workspaceDir),
    };
  }

  const workspaceDir = join(runDir, "workspace");
  mkdirSync(workspaceDir);
  return { workspaceDir, writtenFiles: [] };
}

export async function startBenchmarkMockServer(
  resolvedCase: ResolvedBenchmarkCase,
  context: { runId: string; sessionId: string },
) {
  if (resolvedCase.world) {
    return startWorldMockServer(resolvedCase.fixture, resolvedCase.world.knowledge, context);
  }
  return startToolPromptMockServer(resolvedCase.fixture, context);
}

export interface CodexPromptAudit {
  sha256: string;
  messageCount: number;
  skillsInstructionsPresent: false;
}

export function codexProcessInfrastructureError(result: {
  timedOut: boolean;
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
}): string | undefined {
  if (result.timedOut) return "Codex runner timed out";
  const processOutput = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/(?:rejected:\s*)?blocked by (?:execution )?policy|command execution[^\n]*(?:denied|blocked)/i.test(processOutput)) {
    return "Codex tool execution was blocked by local policy";
  }
  if (result.exitCode !== 0) return `Codex runner exited with code ${String(result.exitCode)}`;
  return undefined;
}

export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export function codexRunInfrastructureError(
  result: Parameters<typeof codexProcessInfrastructureError>[0],
  usage: CodexUsage | null,
): string | undefined {
  return codexProcessInfrastructureError(result)
    ?? (usage ? undefined : "Codex JSONL did not contain complete turn.completed usage");
}

export function countInjectionTokens(prompt: string): number {
  const encoding = get_encoding("o200k_base");
  try {
    return encoding.encode(prompt).length;
  } finally {
    encoding.free();
  }
}

export function normalizePromptCacheTemplate(
  prompt: string,
  bridgeBaseUrl: string,
  sessionId: string,
): string {
  return prompt
    .split(bridgeBaseUrl.replace(/\/$/, "")).join("<BRIDGE_BASE_URL>")
    .split(sessionId).join("<SESSION_ID>");
}

export function extractCodexUsage(eventsJsonl: string): CodexUsage | null {
  const records = eventsJsonl.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return parsed.type === "turn.completed" && parsed.usage && typeof parsed.usage === "object"
        ? [parsed.usage as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });
  const usage = records.at(-1);
  if (!usage) return null;
  const requiredFields = [
    "input_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
  ] as const;
  if (requiredFields.some((field) => (
    typeof usage[field] !== "number"
    || !Number.isFinite(usage[field])
    || (usage[field] as number) < 0
  ))) return null;
  const number = (field: typeof requiredFields[number]): number => usage[field] as number;
  return {
    inputTokens: number("input_tokens"),
    cachedInputTokens: number("cached_input_tokens"),
    cacheWriteInputTokens: number("cache_write_input_tokens"),
    outputTokens: number("output_tokens"),
    reasoningOutputTokens: number("reasoning_output_tokens"),
  };
}

/** Verify the effective client prompt, not only the benchmark-owned block. */
export function auditCodexPromptInput(
  rawPromptInput: string,
  expectedDeveloperInstructions: string,
): CodexPromptAudit {
  let messages: unknown;
  try {
    messages = JSON.parse(rawPromptInput);
  } catch {
    throw new Error("Codex prompt audit did not return valid JSON");
  }
  if (!Array.isArray(messages)) throw new Error("Codex prompt audit must be a JSON array");
  const texts = messages.flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    const content = (message as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => (
      part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
        ? [(part as Record<string, unknown>).text as string]
        : []
    ));
  });
  if (!texts.some((value) => value.includes(expectedDeveloperInstructions))) {
    throw new Error("Codex prompt audit is missing the benchmark developer instructions");
  }
  if (texts.some((value) => value.includes("<skills_instructions>"))) {
    throw new Error("Codex prompt audit contains client skill instructions");
  }
  return {
    sha256: createHash("sha256").update(rawPromptInput).digest("hex"),
    messageCount: messages.length,
    skillsInstructionsPresent: false,
  };
}

export function buildCodexInvocation(input: CodexInvocationInput): CodexInvocation {
  return {
    executable: process.platform === "win32" ? "codex.exe" : "codex",
    commandPrefix: [],
    args: [
      "exec",
      "--ephemeral",
      "--ignore-rules",
      "--ignore-user-config",
      ...input.configArgs,
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--cd",
      input.workspaceDir,
      "--model",
      input.model,
      "-",
    ],
  };
}

/** Avoid the Windows Store alias, which cannot always be spawned by Node. */
export function resolveCodexInvocation(
  invocation: CodexInvocation,
  options: ResolveCodexInvocationOptions = {},
): CodexInvocation {
  if (options.explicitExecutable) {
    return { executable: options.explicitExecutable, args: [...invocation.args], commandPrefix: [] };
  }
  const platform = options.platform ?? process.platform;
  const appData = options.appData ?? process.env.APPDATA;
  if (platform === "win32" && appData) {
    const cliEntrypoint = join(appData, "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
    const pathExists = options.pathExists ?? existsSync;
    if (pathExists(cliEntrypoint)) {
      return {
        executable: options.nodeExecutable ?? process.execPath,
        args: [cliEntrypoint, ...invocation.args],
        commandPrefix: [cliEntrypoint],
      };
    }
  }
  return {
    executable: invocation.executable,
    args: [...invocation.args],
    commandPrefix: [...(invocation.commandPrefix ?? [])],
  };
}

export function isolateCodexEnvironment(
  source: NodeJS.ProcessEnv,
  authenticatedCodexHome: string,
  isolatedHome: string,
): NodeJS.ProcessEnv {
  const isolated = Object.fromEntries(Object.entries(source).filter(([name]) => !name.toUpperCase().startsWith("CODEX_")));
  // Authentication remains in the single, already logged-in CODEX_HOME. Never
  // copy auth.json: OAuth refresh/rotation from a copied cache can invalidate the
  // cache used by the desktop app or the user's normal CLI session.
  isolated.CODEX_HOME = authenticatedCodexHome;
  isolated.CODEX_SQLITE_HOME = join(isolatedHome, "sqlite");
  isolated.CODEX_CI = "1";
  // Codex also discovers user-level assets below the platform home directory
  // (for example ~/.agents/skills). Point both home variables at the fresh run
  // directory so a benchmark cannot inherit personal skills or prior state.
  isolated.HOME = isolatedHome;
  isolated.USERPROFILE = isolatedHome;
  return isolated;
}

/** Convert the benchmark-only profile into invocation-scoped CLI overrides. */
export function buildCodexConfigArgs(input: CodexProfileInput): string[] {
  const values = [
    `developer_instructions=${JSON.stringify(input.developerInstructions)}`,
    'approval_policy="never"',
    `model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}`,
    `model_verbosity=${JSON.stringify(input.verbosity)}`,
    "features.plugins=false",
    "features.apps=false",
    "features.multi_agent=false",
    "features.skill_search=false",
    "skills.include_instructions=false",
    "sandbox_workspace_write.network_access=true",
  ];
  if (input.providerBaseUrl) {
    values.push(
      'model_provider="custom"',
      'model_providers.custom.name="TDAI Eval Proxy"',
      `model_providers.custom.base_url=${JSON.stringify(input.providerBaseUrl.replace(/\/$/, ""))}`,
      'model_providers.custom.wire_api="responses"',
      "model_providers.custom.requires_openai_auth=true",
    );
    const providerHeaders = Object.entries(input.providerHeaders ?? {}).sort(([left], [right]) => left.localeCompare(right));
    if (providerHeaders.length > 0) {
      for (const [name] of providerHeaders) {
        if (!/^[a-z0-9-]+$/i.test(name)) throw new Error(`invalid provider header name: ${name}`);
      }
      const inlineTable = providerHeaders
        .map(([name, value]) => `${JSON.stringify(name.toLowerCase())} = ${JSON.stringify(value)}`)
        .join(", ");
      values.push(`model_providers.custom.http_headers={ ${inlineTable} }`);
    }
    const providerEnvHeaders = Object.entries(input.providerEnvHeaders ?? {}).sort(([left], [right]) => left.localeCompare(right));
    if (providerEnvHeaders.length > 0) {
      for (const [name, environmentName] of providerEnvHeaders) {
        if (!/^[a-z0-9-]+$/i.test(name)) throw new Error(`invalid provider header name: ${name}`);
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(environmentName)) {
          throw new Error(`invalid provider header environment name: ${environmentName}`);
        }
      }
      const inlineTable = providerEnvHeaders
        .map(([name, environmentName]) => `${JSON.stringify(name.toLowerCase())} = ${JSON.stringify(environmentName)}`)
        .join(", ");
      values.push(`model_providers.custom.env_http_headers={ ${inlineTable} }`);
      values.push(`shell_environment_policy.exclude=${JSON.stringify(providerEnvHeaders.map(([, environmentName]) => environmentName))}`);
    }
  }
  return values.flatMap((value) => ["-c", value]);
}

function safeSegment(value: string): string {
  const segment = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!segment) throw new Error("run path segment is empty after sanitization");
  return segment;
}

function conversationContext(messages: Array<{ role: "user" | "assistant"; content: string }> | undefined): string {
  if (!messages?.length) return "";
  return [
    "",
    "<evaluation_conversation_context>",
    "The following turns occurred before the final user query:",
    ...messages.map((message) => `<${message.role}>${message.content}</${message.role}>`),
    "</evaluation_conversation_context>",
  ].join("\n");
}

function runChild(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdin: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      resolveRun({ exitCode, stdout, stderr, timedOut });
    });
    child.stdin.end(stdin);
  });
}

export async function runCodexCase(options: CodexRunOptions): Promise<Record<string, unknown>> {
  const resolvedVariant = resolveToolPromptVariant(options.variant);
  const resolvedCase = resolveBenchmarkCase(options.caseId);
  const { item, fixture, world, activeProject } = resolvedCase;

  const outputRoot = resolve(options.outputRoot);
  mkdirSync(outputRoot, { recursive: true });
  const runDir = mkdtempSync(join(outputRoot, `${safeSegment(item.caseId)}-${safeSegment(options.variant)}-r${options.repeat}-`));
  const preparedWorkspace = prepareBenchmarkWorkspace(runDir, resolvedCase);
  const { workspaceDir } = preparedWorkspace;
  const isolatedHome = join(runDir, "isolated-home");
  const codexHome = resolve(options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  mkdirSync(isolatedHome);
  mkdirSync(join(isolatedHome, "sqlite"));
  const runId = randomUUID();
  const sessionId = randomUUID();
  const server = await startBenchmarkMockServer(resolvedCase, { runId, sessionId });
  try {
    const rendered = await renderFixturePrompt(item, fixture, {
      bridgeBaseUrl: server.baseUrl,
      sessionId,
      spaceId: world?.worldId.toLowerCase() ?? "tool-prompt-bench",
      modelId: options.model,
      profile: resolvedVariant.profile,
      skillExtractionEnabled: false,
    });
    const developerInstructions = `${rendered.prompt}${conversationContext(item.contextMessages)}`;
    const injectionTokenCount = countInjectionTokens(rendered.prompt);
    const promptCacheTemplate = normalizePromptCacheTemplate(rendered.prompt, server.baseUrl, sessionId);
    const configArgs = buildCodexConfigArgs({
      developerInstructions,
      providerBaseUrl: options.providerBaseUrl,
      providerHeaders: { "x-tdai-eval-mode": "mock-contract" },
      providerEnvHeaders: process.env[TDAI_EVAL_USER_KEY_ENV]
        ? { "x-tdai-user-key": TDAI_EVAL_USER_KEY_ENV }
        : undefined,
      reasoningEffort: options.reasoningEffort,
      verbosity: options.verbosity,
    });
    const invocation = resolveCodexInvocation(
      buildCodexInvocation({ workspaceDir, model: options.model, configArgs }),
      { explicitExecutable: options.codexExecutable },
    );
    writeFileSync(join(runDir, "prompt.txt"), `${developerInstructions}\n`, "utf8");

    const codexEnv = isolateCodexEnvironment(process.env, codexHome, isolatedHome);
    const versionResult = await runChild(
      invocation.executable,
      [...(invocation.commandPrefix ?? []), "--version"],
      workspaceDir,
      codexEnv,
      "",
      10_000,
    );
    if (versionResult.timedOut || versionResult.exitCode !== 0) {
      throw new Error(`unable to read Codex version: ${versionResult.stderr.trim() || "unknown error"}`);
    }
    const promptAuditResult = await runChild(
      invocation.executable,
      [
        ...(invocation.commandPrefix ?? []),
        "--ignore-user-config",
        ...configArgs,
        "debug",
        "prompt-input",
        item.query,
      ],
      workspaceDir,
      codexEnv,
      "",
      30_000,
    );
    if (promptAuditResult.timedOut || promptAuditResult.exitCode !== 0) {
      throw new Error(`unable to audit Codex prompt: ${promptAuditResult.stderr.trim() || "unknown error"}`);
    }
    writeFileSync(join(runDir, "codex-prompt-input.json"), promptAuditResult.stdout, "utf8");
    const promptAudit = auditCodexPromptInput(promptAuditResult.stdout, developerInstructions);

    const manifest = {
      schemaVersion: "1.0",
      evaluationLayer: MOCK_CONTRACT_RUN_MODE,
      formalMetricEligible: false,
      injectionOwner: "runner-pre-rendered-production-renderers",
      toolEndpointMode: world ? "isolated-world-mock-bridge" : "isolated-mock-bridge",
      runId,
      sessionId,
      caseId: item.caseId,
      fixtureId: fixture.fixtureId,
      worldId: world?.worldId ?? null,
      activeProject: activeProject?.projectId ?? null,
      workspaceFiles: preparedWorkspace.writtenFiles,
      variant: resolvedVariant.variant,
      toolPromptProfile: rendered.toolPromptProfile,
      capabilitySignature: rendered.capabilitySignature,
      repeat: options.repeat,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      verbosity: options.verbosity,
      codexVersion: versionResult.stdout.trim(),
      injectionPromptSha256: rendered.promptSha256,
      promptCacheTemplateSha256: createHash("sha256").update(promptCacheTemplate).digest("hex"),
      injectionTokenEncoding: "o200k_base",
      injectionTokenCount,
      injectionCharacterCount: rendered.prompt.length,
      injectionUtf8ByteCount: Buffer.byteLength(rendered.prompt, "utf8"),
      promptSha256: createHash("sha256").update(developerInstructions).digest("hex"),
      codexPromptInputSha256: promptAudit.sha256,
      codexPromptMessageCount: promptAudit.messageCount,
      workspaceDir,
      codexHome,
      isolatedHome,
      executable: invocation.executable,
      args: invocation.args,
      providerBaseUrl: options.providerBaseUrl ?? null,
      ephemeral: true,
      isolatedUserConfig: true,
      authenticationMode: "shared-codex-home-no-copy",
      tdaiUserKeyHeaderConfigured: Boolean(process.env[TDAI_EVAL_USER_KEY_ENV]),
      clientSkillsDisabled: true,
      ignoresRules: true,
    };
    writeFileSync(join(runDir, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    if (options.dryRun) return { ...manifest, runDir, dryRun: true };
    const result = await runChild(
      invocation.executable,
      invocation.args,
      workspaceDir,
      codexEnv,
      item.query,
      options.timeoutMs ?? 180_000,
    );
    writeFileSync(join(runDir, "codex-events.jsonl"), result.stdout, "utf8");
    writeFileSync(join(runDir, "codex-stderr.log"), result.stderr, "utf8");
    const modelUsage = extractCodexUsage(result.stdout);
    const infrastructureError = codexRunInfrastructureError(result, modelUsage);
    const evaluationResult = infrastructureError
      ? { caseId: item.caseId, state: "INFRASTRUCTURE_ERROR", infrastructureError }
      : evaluateToolPromptCase(item, fixture, server.bridge.attempts);
    const evaluation = {
      evaluationLayer: MOCK_CONTRACT_RUN_MODE,
      formalMetricEligible: false,
      ...evaluationResult,
    };
    const trace = {
      evaluationLayer: MOCK_CONTRACT_RUN_MODE,
      formalMetricEligible: false,
      caseId: item.caseId,
      runId,
      attempts: server.bridge.attempts,
      infrastructureError,
    };
    writeFileSync(join(runDir, "trace.jsonl"), `${JSON.stringify(trace)}\n`, "utf8");
    writeFileSync(join(runDir, "evaluation.json"), `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
    const usage = {
      evaluationLayer: MOCK_CONTRACT_RUN_MODE,
      formalMetricEligible: false,
      injection: {
        encoding: "o200k_base",
        tokens: injectionTokenCount,
        characters: rendered.prompt.length,
        utf8Bytes: Buffer.byteLength(rendered.prompt, "utf8"),
      },
      model: modelUsage,
    };
    writeFileSync(join(runDir, "usage.json"), `${JSON.stringify(usage, null, 2)}\n`, "utf8");
    const runResult = {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      infrastructureError: infrastructureError ?? null,
      usage,
      evaluation,
    };
    writeFileSync(join(runDir, "run-result.json"), `${JSON.stringify(runResult, null, 2)}\n`, "utf8");
    return { ...manifest, runDir, ...runResult };
  } finally {
    await server.close();
  }
}

function cliValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseReasoningEffort(value: string | undefined): CodexReasoningEffort {
  const candidate = value ?? DEFAULT_CODEX_REASONING_EFFORT;
  if (["minimal", "low", "medium", "high", "xhigh"].includes(candidate)) {
    return candidate as CodexReasoningEffort;
  }
  throw new Error(`unsupported Codex reasoning effort: ${candidate}`);
}

function parseVerbosity(value: string | undefined): CodexVerbosity {
  const candidate = value ?? DEFAULT_CODEX_VERBOSITY;
  if (["low", "medium", "high"].includes(candidate)) return candidate as CodexVerbosity;
  throw new Error(`unsupported Codex verbosity: ${candidate}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const caseId = cliValue("--case");
  const model = cliValue("--model");
  if (!caseId || !model) {
    console.error("usage: tsx eval/tool-prompt-bench/codex-runner.ts --case <id> --model <model> [--reasoning-effort high] [--verbosity medium] [--variant V0|V0-C|V1a|V1|V2|V3] [--repeat 1] [--provider-base-url <url>] [--codex-home <dir>] [--out <dir>] [--dry-run]");
    process.exitCode = 2;
  } else {
    const result = await runCodexCase({
      caseId,
      model,
      reasoningEffort: parseReasoningEffort(cliValue("--reasoning-effort")),
      verbosity: parseVerbosity(cliValue("--verbosity")),
      variant: cliValue("--variant") ?? "V0",
      repeat: Number(cliValue("--repeat") ?? "1"),
      outputRoot: cliValue("--out") ?? resolve(process.cwd(), "eval", "tool-prompt-bench", "runs"),
      providerBaseUrl: cliValue("--provider-base-url"),
      codexExecutable: cliValue("--codex-bin"),
      codexHome: cliValue("--codex-home"),
      timeoutMs: Number(cliValue("--timeout-ms") ?? "180000"),
      dryRun: process.argv.includes("--dry-run"),
    });
    console.log(JSON.stringify(result, null, 2));
  }
}
