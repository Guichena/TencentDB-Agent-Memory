import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { get_encoding } from "tiktoken";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { toolPromptCacheIdentity } from "../../src/injection/tool-prompt/profiles.js";
import {
  TOOL_PROMPT_PROFILES,
  type ToolPromptProfile,
} from "../../src/injection/tool-prompt/types.js";
import { CASES, FIXTURES } from "./case-definitions.js";
import { renderFixturePrompt } from "./prompt-harness.js";
import { TOOL_PROMPT_VARIANT_PROFILES } from "./variant-profiles.js";

const OUTPUT_ROOT = resolve("eval/tool-prompt-bench/variants/code-freeze");
const FINAL_VARIANT_ROOT = resolve("eval/tool-prompt-bench/variants/c05");
const REPO_ROOT = resolve("..");
const CAPABILITY_SIGNATURE = [
  "memory=1",
  "skill=1",
  "knowledge=1",
  "wiki=1",
  "code_graph=1",
  "skill_write=0",
  "skill_extract=0",
].join(";");
const ADJACENT_DIFFS = [
  { stage: "C01", path: "eval/tool-prompt-bench/variants/c01/v0-to-v0c-diff.json" },
  { stage: "C02", path: "eval/tool-prompt-bench/variants/c02/v0c-to-v1a-diff.json" },
  { stage: "C03", path: "eval/tool-prompt-bench/variants/c03/v1a-to-v1-diff.json" },
  { stage: "C04", path: "eval/tool-prompt-bench/variants/c04/v1-to-v2-diff.json" },
  { stage: "C05", path: "eval/tool-prompt-bench/variants/c05/v2-to-v3-diff.json" },
] as const;

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function assertProfileMapping(): void {
  const mappedProfiles = Object.values(TOOL_PROMPT_VARIANT_PROFILES);
  if (JSON.stringify(mappedProfiles) !== JSON.stringify(TOOL_PROMPT_PROFILES)) {
    throw new Error(
      `runner variant mapping drift: expected ${TOOL_PROMPT_PROFILES.join(",")}; got ${mappedProfiles.join(",")}`,
    );
  }
  if (DEFAULT_CONFIG.injection.toolPromptProfile !== "legacy") {
    throw new Error("production default toolPromptProfile is no longer legacy");
  }
}

function captureProfileInventory(): Array<Record<string, unknown>> {
  return Object.entries(TOOL_PROMPT_VARIANT_PROFILES).map(([variant, profile]) => {
    const directory = resolve(FINAL_VARIANT_ROOT, profile, "full-readonly");
    const manifestPath = resolve(directory, "manifest.json");
    const promptPath = resolve(directory, "prompt.txt");
    const injectionPath = resolve(directory, "injection.txt");
    for (const path of [manifestPath, promptPath, injectionPath]) {
      if (!existsSync(path)) throw new Error(`missing frozen profile artifact ${path}`);
    }
    const manifest = readJson(manifestPath);
    const prompt = readFileSync(promptPath);
    const injection = readFileSync(injectionPath);
    if (sha256(prompt) !== manifest.effectiveSystemSha256) {
      throw new Error(`${profile} prompt.txt hash does not match its manifest`);
    }
    if (sha256(injection) !== manifest.totalInjectionSha256) {
      throw new Error(`${profile} injection.txt hash does not match its manifest`);
    }
    return {
      variant,
      profile,
      compilerVersion: manifest.compilerVersion,
      sourceCommit: manifest.sourceCommit,
      capabilitySignature: manifest.capabilitySignature,
      totalInjectionCharacters: manifest.totalInjectionCharacters,
      totalInjectionBytes: manifest.totalInjectionBytes,
      totalInjectionTokensO200k: manifest.totalInjectionTokens,
      totalInjectionSha256: manifest.totalInjectionSha256,
      effectiveSystemBytes: manifest.effectiveSystemBytes,
      effectiveSystemTokensO200k: manifest.effectiveSystemTokens,
      effectiveSystemSha256: manifest.effectiveSystemSha256,
      stablePrefixBytesFromParent: manifest.stablePrefixBytes,
      firstChangedByteFromParent: manifest.firstChangedByteFromParent,
      blocks: manifest.blocks,
    };
  });
}

function captureStageInventory(): Array<Record<string, unknown>> {
  return Array.from({ length: 6 }, (_, index) => {
    const stage = `C0${index}`;
    const tag = `task1-c0${index}-pass`;
    const gatePath = resolve(`eval/tool-prompt-bench/reports/gates/${stage}-gate.md`);
    if (!existsSync(gatePath)) throw new Error(`missing ${stage} gate report`);
    const gate = readFileSync(gatePath, "utf8");
    if (!gate.includes("- status: `PASSED`")) throw new Error(`${stage} gate is not PASSED`);
    return {
      stage,
      tag,
      tagCommit: git("rev-list", "-1", tag),
      gateSha256: sha256(gate),
    };
  });
}

function captureAdjacentDiffs(): Array<Record<string, unknown>> {
  return ADJACENT_DIFFS.map(({ stage, path }) => {
    const absolutePath = resolve(path);
    if (!existsSync(absolutePath)) throw new Error(`missing ${stage} adjacent diff ${path}`);
    const content = readFileSync(absolutePath);
    return { stage, path, bytes: content.length, sha256: sha256(content) };
  });
}

async function captureRunnerProfileSmoke(): Promise<Array<Record<string, unknown>>> {
  const item = CASES.find((candidate) => candidate.caseId === "notool-dev-profile-l3-017");
  if (!item) throw new Error("missing runner profile smoke case");
  const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
  if (!fixture) throw new Error("missing runner profile smoke fixture");
  const encoding = get_encoding("o200k_base");
  try {
    const rows = [];
    for (const [variant, profile] of Object.entries(TOOL_PROMPT_VARIANT_PROFILES)) {
      const rendered = await renderFixturePrompt(item, fixture, {
        bridgeBaseUrl: "http://127.0.0.1:43127",
        sessionId: "task1-code-freeze",
        spaceId: "tool-prompt-bench",
        modelId: "gpt-5.6-luna",
        profile,
        skillExtractionEnabled: false,
      });
      rows.push({
        variant,
        profile,
        capabilitySignature: rendered.capabilitySignature,
        promptCharacters: rendered.prompt.length,
        promptBytes: Buffer.byteLength(rendered.prompt, "utf8"),
        promptTokensO200k: encoding.encode(rendered.prompt).length,
        promptSha256: rendered.promptSha256,
        exposesSkillExtract: rendered.prompt.includes('<tool name="skill_extract">'),
      });
    }
    if (new Set(rows.map((row) => row.promptSha256)).size !== rows.length) {
      throw new Error("runner profile smoke did not produce one distinct prompt per variant");
    }
    const v2 = rows.find((row) => row.variant === "V2");
    const v3 = rows.find((row) => row.variant === "V3");
    if (!v2?.exposesSkillExtract || v3?.exposesSkillExtract) {
      throw new Error("runner V2/V3 extraction capability boundary is incorrect");
    }
    return rows;
  } finally {
    encoding.free();
  }
}

async function main(): Promise<void> {
  assertProfileMapping();
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const sourceCommit = git("rev-list", "-1", "HEAD", "--",
    "MemoryProxy/eval/tool-prompt-bench/capture-code-freeze.ts",
    "MemoryProxy/eval/tool-prompt-bench/variant-profiles.ts",
    "MemoryProxy/eval/tool-prompt-bench/prompt-harness.ts",
    "MemoryProxy/eval/tool-prompt-bench/codex-runner.ts",
    "MemoryProxy/eval/tool-prompt-bench/run-benchmark.ps1",
    "MemoryProxy/src/injection/tool-prompt",
    "MemoryProxy/src/injection/injectors/tdai-tools-injector.ts",
    "MemoryProxy/src/injection/injectors/tdai-profile-memory-injector.ts",
    "MemoryProxy/src/injection/injectors/skill-tools-injector.ts",
    "MemoryProxy/src/injection/injectors/skill-injector.ts",
    "MemoryProxy/src/injection/injectors/knowledge-tools-injector.ts",
  );
  const generatedAt = git("show", "-s", "--format=%cI", sourceCommit);
  const profileInventory = captureProfileInventory();
  const runnerSmoke = await captureRunnerProfileSmoke();
  const cacheNamespaces = Object.entries(TOOL_PROMPT_VARIANT_PROFILES).map(
    ([variant, profile]) => ({
      variant,
      profile,
      hookCacheIdentity: toolPromptCacheIdentity(
        "skill-tools-injector",
        profile as ToolPromptProfile,
        CAPABILITY_SIGNATURE,
      ) ?? "skill-tools-injector",
    }),
  );
  if (new Set(cacheNamespaces.map((row) => row.hookCacheIdentity)).size !== cacheNamespaces.length) {
    throw new Error("profile hook cache namespaces are not unique");
  }

  const manifest = {
    schemaVersion: 1,
    stage: "C06",
    sourceCommit,
    generatedAt,
    baselineCommit: git("rev-parse", "5299c00"),
    defaultProductionProfile: DEFAULT_CONFIG.injection.toolPromptProfile,
    canonicalCapabilitySignature: CAPABILITY_SIGNATURE,
    tokenizer: "o200k_base",
    typecheckBaseline: {
      diagnostics: 54,
      normalizedSha256: "ecf5cfe9c8c0d40163fb87f5622dee3cbb688a47aa649db245e2b27e1c50f65c",
    },
    profileInventory,
    stageInventory: captureStageInventory(),
    adjacentDiffs: captureAdjacentDiffs(),
    cacheNamespaces,
    runnerProfileSmoke: runnerSmoke,
    dryRunCommand:
      "npm run eval:tool-prompt:codex -- --case notool-dev-profile-l3-017 --model gpt-5.6-luna --reasoning-effort high --verbosity medium --variant V3 --repeat 1 --dry-run",
    rollback: "Set injection.toolPromptProfile to legacy and restart MemoryProxy.",
  };
  writeFileSync(
    resolve(OUTPUT_ROOT, "code-freeze-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`captured C06 code-freeze manifest in ${OUTPUT_ROOT}`);
}

await main();
