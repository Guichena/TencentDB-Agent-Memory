import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get_encoding } from "tiktoken";
import type { KnowledgeItem } from "../../src/knowledge/core-client.js";
import { OpenAIAdapter } from "../../src/injection/adapters/openai.js";
import { CodeBuddyProfile } from "../../src/injection/agents/codebuddy/profile.js";
import { renderKnowledgeToolsBlock } from "../../src/injection/injectors/knowledge-tools-injector.js";
import { renderSkillToolsBlock } from "../../src/injection/injectors/skill-tools-injector.js";
import { wrapAvailableSkillsBlock } from "../../src/injection/injectors/skill-injector.js";
import {
  MEMORY_TOOLS_GUIDE,
  renderTdaiProfileMemoryBlock,
} from "../../src/injection/injectors/tdai-profile-memory-injector.js";
import { renderTdaiMemoryToolsBlock } from "../../src/injection/injectors/tdai-tools-injector.js";
import { InjectionPipeline } from "../../src/injection/pipeline.js";
import { HookRegistryImpl } from "../../src/injection/registry.js";
import type {
  AnchorTarget,
  ContextBlock,
  InjectionPoint,
} from "../../src/injection/types.js";
import {
  buildCapabilitySignature,
  compileToolPrompt,
  TOOL_PROMPT_COMPILER_VERSION,
  TOOL_PROMPT_PROFILES,
  type CompiledToolPromptProfile,
  type ToolPromptFamily,
  type ToolPromptProfile,
  type ToolPromptSurface,
} from "../../src/injection/tool-prompt/index.js";

const CANONICAL = {
  proxyOrigin: "http://127.0.0.1:8096",
  sessionId: "session-c00",
  spaceId: "space-c00",
  userId: "user-c00",
  teamId: "team-c00",
  agentId: "agent-c00",
  agentSource: "codex",
} as const;

const CAPABILITY_SIGNATURE = buildCapabilitySignature({
  memory: true,
  skill: true,
  knowledge: true,
  wiki: true,
  codeGraph: true,
  skillWrite: false,
  skillExtract: false,
});

const CAPABILITY_DIR = "full-readonly";
const OUTPUT_ROOT = resolve("eval/tool-prompt-bench/variants/c00");
const encoding = get_encoding("o200k_base");

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function tokens(content: string): number {
  return encoding.encode(content).length;
}

function compileCompatibilitySurface(
  profile: ToolPromptProfile,
  family: ToolPromptFamily,
  surface: ToolPromptSurface,
  legacyContent: string,
): string {
  if (profile === "legacy") return legacyContent;
  return compileToolPrompt({
    profile: profile as CompiledToolPromptProfile,
    family,
    surface,
    legacyUnits: [{
      id: `${surface}.legacy-body`,
      kind: "legacy-body",
      content: legacyContent,
    }],
    capabilitySignature: CAPABILITY_SIGNATURE,
  }).content;
}

function compiledMemoryGuide(profile: ToolPromptProfile): string {
  if (profile === "legacy") return MEMORY_TOOLS_GUIDE;
  return compileToolPrompt({
    profile: profile as CompiledToolPromptProfile,
    family: "memory",
    surface: "memory-guide",
    legacyUnits: [{
      id: "memory-guide.policy",
      kind: "policy",
      content: MEMORY_TOOLS_GUIDE,
    }],
    capabilitySignature: CAPABILITY_SIGNATURE,
  }).content;
}

const KNOWLEDGE: KnowledgeItem[] = [{
  knowledge_id: "wiki-c00",
  type: "wiki",
  service_url: "http://127.0.0.1:8421/v3",
  name: "Task 1 architecture",
  summary: "Frozen design decisions for proxy prompt injection",
  team_id: CANONICAL.teamId,
  user_id: CANONICAL.userId,
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
}];

interface BlockArtifactInput {
  blockId: string;
  injectionPoint: "system.before_tools" | "system.suffix";
  content: string;
  dynamicPatterns: readonly RegExp[];
}

function registerStaticHook(
  registry: HookRegistryImpl,
  id: string,
  point: InjectionPoint,
  priority: number,
  anchor: AnchorTarget,
  content: string,
): void {
  registry.register({
    id,
    point,
    priority,
    anchor,
    description: "C00 canonical production-rendered prompt artifact",
    execute: (): ContextBlock[] => [{ type: "text", content }],
  });
}

async function renderProviderSystem(blocks: readonly BlockArtifactInput[]): Promise<string> {
  const byId = new Map(blocks.map((block) => [block.blockId, block.content]));
  const registry = new HookRegistryImpl();
  registerStaticHook(
    registry,
    "skill-tools-injector",
    "system.before_tools",
    199,
    { slot: "skills", relation: "before" },
    byId.get("skill_tools")!,
  );
  registerStaticHook(
    registry,
    "skill-injector",
    "system.before_tools",
    200,
    { slot: "skills", relation: "before" },
    byId.get("available_skills")!,
  );
  registerStaticHook(
    registry,
    "knowledge-tools-injector",
    "system.before_tools",
    300,
    { slot: "knowledge", relation: "after" },
    byId.get("knowledge_tools")!,
  );
  registerStaticHook(
    registry,
    "tdai-memory-tools-injector",
    "system.suffix",
    105,
    { slot: "memory", relation: "before" },
    byId.get("tdai_memory_tools")!,
  );
  registerStaticHook(
    registry,
    "tdai-profile-memory-injector",
    "system.suffix",
    110,
    { slot: "memory", relation: "inside_append" },
    byId.get("tdai_profile_memory")!,
  );
  const pipeline = new InjectionPipeline(
    registry,
    new Map([["openai", new OpenAIAdapter()]]),
    { agentProfiles: new Map([["codebuddy", new CodeBuddyProfile()]]) },
  );
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  let result: Record<string, unknown>;
  try {
    result = await pipeline.process({
      model: "c00-artifact",
      messages: [
        {
          role: "system",
          content: [
            "Canonical CodeBuddy provider prompt for Task 1 C00 artifacts.",
            "<mcp_protocol>native tools</mcp_protocol>",
            "<agent_skills>native skills</agent_skills>",
            "<memories>native memory</memories>",
            "<rules>native rules</rules>",
          ].join("\n"),
        },
        { role: "user", content: "canonical artifact input" },
      ],
    }, {
      protocol: "openai",
      traceId: "c00-artifact",
      keyId: "c00-artifact",
      modelId: "c00-artifact",
      stream: false,
      agentSource: "codebuddy",
      userId: CANONICAL.userId,
      spaceId: CANONICAL.spaceId,
      sessionKey: CANONICAL.sessionId,
      custom: {
        session: {
          session_id: CANONICAL.sessionId,
          space_id: CANONICAL.spaceId,
          user_id: CANONICAL.userId,
          team_id: CANONICAL.teamId,
          agent_id: CANONICAL.agentId,
        },
      },
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  const messages = result.messages as Array<Record<string, unknown>>;
  const content = messages[0]?.content;
  if (typeof content !== "string") {
    throw new Error("canonical provider system prompt was not serialized as text");
  }
  return content;
}

function replaceAllLiteral(content: string, value: string, replacement: string): string {
  return content.split(value).join(replacement);
}

function measureBlock(input: BlockArtifactInput): Record<string, unknown> {
  const dynamicParts: string[] = [];
  let staticTemplate = input.content;
  for (const pattern of input.dynamicPatterns) {
    staticTemplate = staticTemplate.replace(pattern, (match) => {
      dynamicParts.push(match);
      return `{{dynamic:${input.blockId}}}`;
    });
  }
  const bindings = Object.values(CANONICAL);
  const bindingPlaceholders = [
    "<proxy-origin>",
    "<session-id>",
    "<space-id>",
    "<user-id>",
    "<team-id>",
    "<agent-id>",
    "<agent-source>",
  ];
  const presentBindings: string[] = [];
  bindings.forEach((value, index) => {
    if (input.content.includes(value)) presentBindings.push(value);
    staticTemplate = replaceAllLiteral(staticTemplate, value, bindingPlaceholders[index]);
  });
  const bytes = Buffer.byteLength(input.content, "utf8");
  return {
    blockId: input.blockId,
    kind: dynamicParts.length > 0 ? "mixed" : "static_tool",
    injectionPoint: input.injectionPoint,
    characters: input.content.length,
    bytes,
    tokensO200k: tokens(input.content),
    promptSha256: sha256(input.content),
    staticTemplateCharacters: staticTemplate.length,
    staticTemplateBytes: Buffer.byteLength(staticTemplate, "utf8"),
    staticToolTokens: tokens(staticTemplate),
    staticTemplateSha256: sha256(staticTemplate),
    dynamicAssetTokens: dynamicParts.reduce((sum, part) => sum + tokens(part), 0),
    dynamicAssetSha256: sha256(dynamicParts.join("\n")),
    bindingTokens: tokens(presentBindings.join("\n")),
    runtimeBindingSha256: sha256(presentBindings.join("\n")),
  };
}

function firstChangedByte(parent: Buffer, current: Buffer): number | null {
  const length = Math.min(parent.length, current.length);
  for (let index = 0; index < length; index++) {
    if (parent[index] !== current[index]) return index;
  }
  return parent.length === current.length ? null : length;
}

async function renderProfile(
  profile: ToolPromptProfile,
): Promise<{ injection: string; providerSystem: string; blocks: BlockArtifactInput[] }> {
  const memoryTools = compileCompatibilitySurface(
    profile,
    "memory",
    "memory-tools",
    renderTdaiMemoryToolsBlock(CANONICAL.proxyOrigin, CANONICAL.sessionId, CANONICAL.spaceId),
  );
  const skillTools = compileCompatibilitySurface(
    profile,
    "skill",
    "skill-tools",
    renderSkillToolsBlock(CANONICAL.proxyOrigin, false, CANONICAL.sessionId, CANONICAL.spaceId),
  );
  const listing = [
    "<available_skills>",
    "- task1-review: Review proxy prompt contracts and evidence",
    "- typescript-tests: Run deterministic TypeScript contract tests",
    "</available_skills>",
  ].join("\n");
  const skillListing = wrapAvailableSkillsBlock(listing, profile, CAPABILITY_SIGNATURE);
  const legacyKnowledge = renderKnowledgeToolsBlock(KNOWLEDGE, CANONICAL.spaceId, {
    sessionKey: CANONICAL.sessionId,
    userId: CANONICAL.userId,
    teamId: CANONICAL.teamId,
    agentId: CANONICAL.agentId,
    agentSource: CANONICAL.agentSource,
    spaceId: CANONICAL.spaceId,
  });
  if (!legacyKnowledge) throw new Error("canonical knowledge block unexpectedly empty");
  const knowledgeTools = compileCompatibilitySurface(
    profile,
    "knowledge",
    "knowledge-tools",
    legacyKnowledge,
  );
  const profileMemory = renderTdaiProfileMemoryBlock([{
    agentName: "task1-agent",
    agentId: CANONICAL.agentId,
    isSelf: true,
    l3Content: "Prefers evidence-backed prompt changes.",
    l2Entries: [{ path: "task1/compiler.md", summary: "Compiler implementation decisions" }],
  }], compiledMemoryGuide(profile)).content;

  const blocks: BlockArtifactInput[] = [
    {
      blockId: "skill_tools",
      injectionPoint: "system.before_tools",
      content: skillTools,
      dynamicPatterns: [],
    },
    {
      blockId: "available_skills",
      injectionPoint: "system.before_tools",
      content: skillListing,
      dynamicPatterns: [/<available_skills>[\s\S]*?<\/available_skills>/g],
    },
    {
      blockId: "knowledge_tools",
      injectionPoint: "system.before_tools",
      content: knowledgeTools,
      dynamicPatterns: [/<knowledge type="[^"]+"[\s\S]*? \/>/g],
    },
    {
      blockId: "tdai_memory_tools",
      injectionPoint: "system.suffix",
      content: memoryTools,
      dynamicPatterns: [],
    },
    {
      blockId: "tdai_profile_memory",
      injectionPoint: "system.suffix",
      content: profileMemory,
      dynamicPatterns: [/<tdai_profile_memory>[\s\S]*?<\/tdai_profile_memory>/g],
    },
  ];
  return {
    injection: blocks.map((block) => block.content).join("\n"),
    providerSystem: await renderProviderSystem(blocks),
    blocks,
  };
}

async function main(): Promise<void> {
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: resolve(".."),
    encoding: "utf8",
  }).trim();
  let parentPrompt: string | null = null;
  for (const profile of TOOL_PROMPT_PROFILES) {
    const rendered = await renderProfile(profile);
    const promptBytes = Buffer.from(rendered.providerSystem, "utf8");
    const injectionBytes = Buffer.from(rendered.injection, "utf8");
    const parentBytes = parentPrompt === null ? promptBytes : Buffer.from(parentPrompt, "utf8");
    const changedAt = firstChangedByte(parentBytes, promptBytes);
    const stablePrefixBytes = changedAt ?? Math.min(parentBytes.length, promptBytes.length);
    const stablePrefixText = promptBytes.subarray(0, stablePrefixBytes).toString("utf8");
    const measuredBlocks = rendered.blocks.map(measureBlock);
    const manifest = {
      schemaVersion: 1,
      stage: "C00",
      profile,
      parentProfile: parentPrompt === null
        ? null
        : TOOL_PROMPT_PROFILES[TOOL_PROMPT_PROFILES.indexOf(profile) - 1],
      sourceCommit,
      compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
      capabilitySignature: CAPABILITY_SIGNATURE,
      tokenizer: "o200k_base",
      componentTokenAccounting:
        "Static templates, dynamic assets, and bindings are encoded independently; tokenizer boundaries make these diagnostic components non-additive. totalInjectionTokens is authoritative.",
      generatedAt: "2026-08-28T00:00:00.000Z",
      totalInjectionCharacters: rendered.injection.length,
      totalInjectionBytes: injectionBytes.length,
      totalInjectionTokens: tokens(rendered.injection),
      totalInjectionSha256: sha256(injectionBytes),
      effectiveSystemCharacters: rendered.providerSystem.length,
      effectiveSystemBytes: promptBytes.length,
      effectiveSystemTokens: tokens(rendered.providerSystem),
      effectiveSystemSha256: sha256(promptBytes),
      staticToolTokens: measuredBlocks.reduce(
        (sum, block) => sum + Number(block.staticToolTokens),
        0,
      ),
      dynamicAssetTokens: measuredBlocks.reduce(
        (sum, block) => sum + Number(block.dynamicAssetTokens),
        0,
      ),
      bindingTokens: measuredBlocks.reduce(
        (sum, block) => sum + Number(block.bindingTokens),
        0,
      ),
      stablePrefixBytes,
      stablePrefixCharacters: stablePrefixText.length,
      stablePrefixTokens: tokens(stablePrefixText),
      stablePrefixSha256: sha256(promptBytes.subarray(0, stablePrefixBytes)),
      firstChangedByteFromParent: changedAt,
      firstChangedCharacterFromParent: changedAt === null ? null : stablePrefixText.length,
      firstChangedTokenEstimateFromParent: changedAt === null ? null : tokens(stablePrefixText),
      blocks: measuredBlocks,
    };
    const outputDir = resolve(OUTPUT_ROOT, profile, CAPABILITY_DIR);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(resolve(outputDir, "injection.txt"), rendered.injection, "utf8");
    writeFileSync(resolve(outputDir, "prompt.txt"), rendered.providerSystem, "utf8");
    writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    parentPrompt = rendered.providerSystem;
  }
  encoding.free();
  console.log(`captured C00 prompt artifacts in ${OUTPUT_ROOT}`);
}

await main();
