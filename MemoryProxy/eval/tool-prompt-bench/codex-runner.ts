import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, FIXTURES } from "./case-definitions.js";
import { evaluateToolPromptCase } from "./evaluator.js";
import { renderFixturePrompt } from "./prompt-harness.js";
import { startToolPromptMockServer } from "./protocol-harness.js";

export interface CodexInvocationInput {
  workspaceDir: string;
  model: string;
  profileName: string;
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
  reasoningEffort: CodexReasoningEffort;
  verbosity: CodexVerbosity;
}

export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type CodexVerbosity = "low" | "medium" | "high";

export const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = "high";
export const DEFAULT_CODEX_VERBOSITY: CodexVerbosity = "medium";

export interface CodexRunOptions {
  caseId: string;
  model: string;
  variant: string;
  repeat: number;
  outputRoot: string;
  providerBaseUrl?: string;
  codexExecutable?: string;
  authPath?: string;
  timeoutMs?: number;
  dryRun?: boolean;
  reasoningEffort: CodexReasoningEffort;
  verbosity: CodexVerbosity;
}

export interface CodexPromptAudit {
  sha256: string;
  messageCount: number;
  skillsInstructionsPresent: false;
}

export function codexProcessInfrastructureError(result: {
  timedOut: boolean;
  exitCode: number | null;
}): string | undefined {
  if (result.timedOut) return "Codex runner timed out";
  if (result.exitCode !== 0) return `Codex runner exited with code ${String(result.exitCode)}`;
  return undefined;
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
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--cd",
      input.workspaceDir,
      "--model",
      input.model,
      "--profile",
      input.profileName,
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
  codexHome: string,
): NodeJS.ProcessEnv {
  const isolated = Object.fromEntries(Object.entries(source).filter(([name]) => !name.toUpperCase().startsWith("CODEX_")));
  isolated.CODEX_HOME = codexHome;
  isolated.CODEX_SQLITE_HOME = join(codexHome, "sqlite");
  isolated.CODEX_CI = "1";
  // Codex also discovers user-level assets below the platform home directory
  // (for example ~/.agents/skills). Point both home variables at the fresh run
  // directory so a benchmark cannot inherit personal skills or prior state.
  isolated.HOME = codexHome;
  isolated.USERPROFILE = codexHome;
  return isolated;
}

export function buildCodexProfile(input: CodexProfileInput): string {
  const lines = [
    `developer_instructions = ${JSON.stringify(input.developerInstructions)}`,
    'approval_policy = "never"',
    `model_reasoning_effort = ${JSON.stringify(input.reasoningEffort)}`,
    `model_verbosity = ${JSON.stringify(input.verbosity)}`,
  ];
  if (input.providerBaseUrl) {
    lines.push(
      "",
      'model_provider = "custom"',
      "",
      "[model_providers.custom]",
      'name = "TDAI Eval Proxy"',
      `base_url = ${JSON.stringify(input.providerBaseUrl.replace(/\/$/, ""))}`,
      'wire_api = "responses"',
      "requires_openai_auth = true",
    );
  }
  lines.push(
    "",
    "[features]",
    "plugins = false",
    "apps = false",
    "multi_agent = false",
    "skill_search = false",
    "",
    "[skills]",
    "include_instructions = false",
  );
  return `${lines.join("\n")}\n`;
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
  const item = CASES.find((candidate) => candidate.caseId === options.caseId);
  if (!item) throw new Error(`unknown caseId ${options.caseId}`);
  const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
  if (!fixture) throw new Error(`${item.caseId}: missing fixture ${item.fixtureIds[0]}`);

  const outputRoot = resolve(options.outputRoot);
  mkdirSync(outputRoot, { recursive: true });
  const runDir = mkdtempSync(join(outputRoot, `${safeSegment(item.caseId)}-${safeSegment(options.variant)}-r${options.repeat}-`));
  const workspaceDir = join(runDir, "workspace");
  const codexHome = join(runDir, "codex-home");
  mkdirSync(workspaceDir);
  mkdirSync(codexHome);
  mkdirSync(join(codexHome, "sqlite"));
  const runId = randomUUID();
  const sessionId = randomUUID();
  const profileName = "tdai-eval";
  const invocation = resolveCodexInvocation(
    buildCodexInvocation({ workspaceDir, model: options.model, profileName }),
    { explicitExecutable: options.codexExecutable },
  );

  const server = await startToolPromptMockServer(fixture, { runId, sessionId });
  const authDestination = join(codexHome, "auth.json");
  try {
    const rendered = await renderFixturePrompt(item, fixture, {
      bridgeBaseUrl: server.baseUrl,
      sessionId,
      spaceId: "tool-prompt-bench",
      modelId: options.model,
    });
    const developerInstructions = `${rendered.prompt}${conversationContext(item.contextMessages)}`;
    const profile = buildCodexProfile({
      developerInstructions,
      providerBaseUrl: options.providerBaseUrl,
      reasoningEffort: options.reasoningEffort,
      verbosity: options.verbosity,
    });
    const profilePath = join(codexHome, `${profileName}.config.toml`);
    writeFileSync(profilePath, profile, "utf8");
    writeFileSync(join(runDir, "prompt.txt"), `${developerInstructions}\n`, "utf8");

    const codexEnv = isolateCodexEnvironment(process.env, codexHome);
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
      [...(invocation.commandPrefix ?? []), "--profile", profileName, "debug", "prompt-input", item.query],
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
      runId,
      sessionId,
      caseId: item.caseId,
      fixtureId: fixture.fixtureId,
      variant: options.variant,
      repeat: options.repeat,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      verbosity: options.verbosity,
      codexVersion: versionResult.stdout.trim(),
      promptSha256: createHash("sha256").update(developerInstructions).digest("hex"),
      codexPromptInputSha256: promptAudit.sha256,
      codexPromptMessageCount: promptAudit.messageCount,
      workspaceDir,
      codexHome,
      executable: invocation.executable,
      args: invocation.args,
      providerBaseUrl: options.providerBaseUrl ?? null,
      ephemeral: true,
      isolatedUserConfig: true,
      clientSkillsDisabled: true,
      ignoresRules: true,
    };
    writeFileSync(join(runDir, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    if (options.dryRun) return { ...manifest, runDir, dryRun: true };
    const authSource = resolve(options.authPath ?? join(homedir(), ".codex", "auth.json"));
    if (!existsSync(authSource)) throw new Error(`Codex auth file not found: ${authSource}`);
    copyFileSync(authSource, authDestination);
    chmodSync(authDestination, 0o600);

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
    const infrastructureError = codexProcessInfrastructureError(result);
    const evaluation = infrastructureError
      ? { caseId: item.caseId, state: "INFRASTRUCTURE_ERROR", infrastructureError }
      : evaluateToolPromptCase(item, fixture, server.bridge.attempts);
    const trace = { caseId: item.caseId, runId, attempts: server.bridge.attempts };
    writeFileSync(join(runDir, "trace.jsonl"), `${JSON.stringify(trace)}\n`, "utf8");
    writeFileSync(join(runDir, "evaluation.json"), `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
    return { ...manifest, runDir, exitCode: result.exitCode, timedOut: result.timedOut, evaluation };
  } finally {
    await server.close();
    // The copied auth token exists only for this process and is never retained
    // with experiment artifacts.
    if (existsSync(authDestination)) unlinkSync(authDestination);
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
    console.error("usage: tsx eval/tool-prompt-bench/codex-runner.ts --case <id> --model <model> [--reasoning-effort high] [--verbosity medium] [--variant V0] [--repeat 1] [--provider-base-url <url>] [--out <dir>] [--dry-run]");
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
      authPath: cliValue("--auth"),
      timeoutMs: Number(cliValue("--timeout-ms") ?? "180000"),
      dryRun: process.argv.includes("--dry-run"),
    });
    console.log(JSON.stringify(result, null, 2));
  }
}
