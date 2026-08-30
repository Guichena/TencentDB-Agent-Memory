import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  CAPABILITY_PRUNING_INVENTORY,
  compileToolPrompt,
  CONTRACT_CORRECTIONS,
  lintDuplicateSemanticUnits,
  lintCapabilityPrunedSurface,
  lintSelectionPolicy,
  PROTOCOL_COMPACTION_INVENTORY,
  SELECTION_POLICY_INVENTORY,
  SEMANTIC_UNIT_INVENTORY,
  TOOL_PROMPT_COMPILER_VERSION,
  TOOL_PROMPT_PROFILES,
  type CompiledToolPromptProfile,
  type ToolPromptFamily,
  type ToolPromptCapabilityState,
  type ToolPromptProfile,
  type ToolPromptSurface,
} from "../../src/injection/tool-prompt/index.js";

const requestedStage = process.argv[2]?.toUpperCase();
if (!requestedStage || !/^C0[0-6]$/.test(requestedStage)) {
  throw new Error("usage: capture-profile-artifacts.ts C00|C01|...|C06");
}
const STAGE = requestedStage;
const STAGE_DIR = STAGE.toLowerCase();
const expectedCompilerVersion = `${STAGE_DIR}.1`;
if (TOOL_PROMPT_COMPILER_VERSION !== expectedCompilerVersion) {
  throw new Error(
    `refusing to capture ${STAGE} with compiler ${TOOL_PROMPT_COMPILER_VERSION}; expected ${expectedCompilerVersion}`,
  );
}

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
const OUTPUT_ROOT = resolve(`eval/tool-prompt-bench/variants/${STAGE_DIR}`);
const FROZEN_STAGE_PROFILES = TOOL_PROMPT_PROFILES.filter(
  (profile) => profile !== "neutral-symmetric",
);
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

const CAPABILITY_MATRIX_KNOWLEDGE: KnowledgeItem[] = [
  ...KNOWLEDGE,
  {
    knowledge_id: "code-graph-c05",
    type: "code-graph",
    service_url: "http://127.0.0.1:8421/v3",
    name: "Task 1 source graph",
    summary: "Indexed MemoryProxy source",
    team_id: CANONICAL.teamId,
    user_id: CANONICAL.userId,
    repo_url: "https://github.com/TencentDB/TencentDB-Agent-Memory.git",
    branch: "main",
    created_at: "2026-08-28T00:00:00.000Z",
    updated_at: "2026-08-28T00:00:00.000Z",
  },
];

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

interface ArtifactManifest {
  profile: ToolPromptProfile;
  totalInjectionCharacters: number;
  totalInjectionBytes: number;
  totalInjectionTokens: number;
  totalInjectionSha256: string;
  effectiveSystemCharacters: number;
  effectiveSystemBytes: number;
  effectiveSystemTokens: number;
  effectiveSystemSha256: string;
  stablePrefixBytes: number;
  firstChangedByteFromParent: number | null;
  blocks: Array<{
    blockId: string;
    characters: number;
    bytes: number;
    tokensO200k: number;
    promptSha256: string;
    dynamicAssetSha256: string;
  }>;
}

function readManifest(profile: ToolPromptProfile): ArtifactManifest {
  const path = resolve(OUTPUT_ROOT, profile, CAPABILITY_DIR, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8")) as ArtifactManifest;
}

function assertFrozenAncestors(): void {
  const stageNumber = Number(STAGE.slice(1));
  const ancestors: Array<{
    completedAt: number;
    profile: ToolPromptProfile;
    frozenStage: string;
  }> = [
    { completedAt: 0, profile: "legacy", frozenStage: "c00" },
    { completedAt: 1, profile: "contract-corrected", frozenStage: "c01" },
    { completedAt: 2, profile: "protocol-compact", frozenStage: "c02" },
    { completedAt: 3, profile: "compact", frozenStage: "c03" },
    { completedAt: 4, profile: "selection-calibrated", frozenStage: "c04" },
    { completedAt: 5, profile: "capability-pruned", frozenStage: "c05" },
  ];
  for (const ancestor of ancestors) {
    if (stageNumber > ancestor.completedAt) {
      assertFrozenProfile(ancestor.profile, ancestor.frozenStage);
    }
  }
}

function assertFrozenProfile(profile: ToolPromptProfile, frozenStage: string): void {
  const frozenRoot = resolve(
    `eval/tool-prompt-bench/variants/${frozenStage}/${profile}`,
    CAPABILITY_DIR,
  );
  for (const filename of ["injection.txt", "prompt.txt"] as const) {
    const frozenPath = resolve(frozenRoot, filename);
    const currentPath = resolve(OUTPUT_ROOT, profile, CAPABILITY_DIR, filename);
    if (!existsSync(frozenPath)) {
      throw new Error(`cannot verify ${profile} parity; missing ${frozenPath}`);
    }
    if (!readFileSync(frozenPath).equals(readFileSync(currentPath))) {
      throw new Error(`${STAGE} ${profile} ${filename} differs from frozen ${frozenStage} bytes`);
    }
  }
}

function writeC01DiffArtifacts(sourceCommit: string, generatedAt: string): void {
  if (STAGE !== "C01") return;
  const legacy = readManifest("legacy");
  const corrected = readManifest("contract-corrected");
  if (legacy.totalInjectionSha256 === corrected.totalInjectionSha256) {
    throw new Error("C01 contract-corrected output unexpectedly equals legacy");
  }
  for (const profile of FROZEN_STAGE_PROFILES.slice(2)) {
    const inherited = readManifest(profile);
    if (
      inherited.totalInjectionSha256 !== corrected.totalInjectionSha256
      || inherited.effectiveSystemSha256 !== corrected.effectiveSystemSha256
    ) {
      throw new Error(`${profile} does not inherit the frozen C01 renderer`);
    }
  }

  const legacyBlocks = new Map(legacy.blocks.map((block) => [block.blockId, block]));
  const blockDeltas = corrected.blocks.map((block) => {
    const parent = legacyBlocks.get(block.blockId);
    if (!parent) throw new Error(`legacy artifact lacks block ${block.blockId}`);
    return {
      blockId: block.blockId,
      changed: block.promptSha256 !== parent.promptSha256,
      parentSha256: parent.promptSha256,
      currentSha256: block.promptSha256,
      characterDelta: block.characters - parent.characters,
      byteDelta: block.bytes - parent.bytes,
      tokenDeltaO200k: block.tokensO200k - parent.tokensO200k,
    };
  });
  const diff = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    parentProfile: "legacy",
    currentProfile: "contract-corrected",
    firstChangedByte: corrected.firstChangedByteFromParent,
    stablePrefixBytes: corrected.stablePrefixBytes,
    totalInjection: {
      parentSha256: legacy.totalInjectionSha256,
      currentSha256: corrected.totalInjectionSha256,
      characterDelta: corrected.totalInjectionCharacters - legacy.totalInjectionCharacters,
      byteDelta: corrected.totalInjectionBytes - legacy.totalInjectionBytes,
      tokenDeltaO200k: corrected.totalInjectionTokens - legacy.totalInjectionTokens,
    },
    effectiveSystem: {
      parentSha256: legacy.effectiveSystemSha256,
      currentSha256: corrected.effectiveSystemSha256,
      characterDelta: corrected.effectiveSystemCharacters - legacy.effectiveSystemCharacters,
      byteDelta: corrected.effectiveSystemBytes - legacy.effectiveSystemBytes,
      tokenDeltaO200k: corrected.effectiveSystemTokens - legacy.effectiveSystemTokens,
    },
    blocks: blockDeltas,
    inventoryCorrectionIds: CONTRACT_CORRECTIONS.map((correction) => correction.id),
    appliedCorrectionIds: CONTRACT_CORRECTIONS
      .filter((correction) => !("optionalWhenCapabilityAbsent" in correction))
      .map((correction) => correction.id),
  };
  const corrections = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    corrections: CONTRACT_CORRECTIONS.map((correction) => ({
      ...correction,
      appliedInCapabilityFixture: !("optionalWhenCapabilityAbsent" in correction),
      fromBytes: Buffer.byteLength(correction.from, "utf8"),
      toBytes: Buffer.byteLength(correction.to, "utf8"),
      byteDelta: Buffer.byteLength(correction.to, "utf8")
        - Buffer.byteLength(correction.from, "utf8"),
      fromSha256: sha256(correction.from),
      toSha256: sha256(correction.to),
    })),
  };
  writeFileSync(resolve(OUTPUT_ROOT, "v0-to-v0c-diff.json"), `${JSON.stringify(diff, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(OUTPUT_ROOT, "contract-corrections.json"),
    `${JSON.stringify(corrections, null, 2)}\n`,
    "utf8",
  );
}

function writeC02DiffArtifacts(sourceCommit: string, generatedAt: string): void {
  if (STAGE !== "C02") return;
  const parent = readManifest("contract-corrected");
  const current = readManifest("protocol-compact");
  if (parent.totalInjectionSha256 === current.totalInjectionSha256) {
    throw new Error("C02 protocol-compact output unexpectedly equals contract-corrected");
  }
  for (const profile of FROZEN_STAGE_PROFILES.slice(3)) {
    const inherited = readManifest(profile);
    if (
      inherited.totalInjectionSha256 !== current.totalInjectionSha256
      || inherited.effectiveSystemSha256 !== current.effectiveSystemSha256
    ) {
      throw new Error(`${profile} does not inherit the frozen C02 renderer`);
    }
  }

  const parentBlocks = new Map(parent.blocks.map((block) => [block.blockId, block]));
  const blockDeltas = current.blocks.map((block) => {
    const parentBlock = parentBlocks.get(block.blockId);
    if (!parentBlock) throw new Error(`contract-corrected artifact lacks block ${block.blockId}`);
    return {
      blockId: block.blockId,
      changed: block.promptSha256 !== parentBlock.promptSha256,
      parentSha256: parentBlock.promptSha256,
      currentSha256: block.promptSha256,
      characterDelta: block.characters - parentBlock.characters,
      byteDelta: block.bytes - parentBlock.bytes,
      tokenDeltaO200k: block.tokensO200k - parentBlock.tokensO200k,
    };
  });
  const diff = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    parentProfile: "contract-corrected",
    currentProfile: "protocol-compact",
    firstChangedByte: current.firstChangedByteFromParent,
    stablePrefixBytes: current.stablePrefixBytes,
    totalInjection: {
      parentSha256: parent.totalInjectionSha256,
      currentSha256: current.totalInjectionSha256,
      characterDelta: current.totalInjectionCharacters - parent.totalInjectionCharacters,
      byteDelta: current.totalInjectionBytes - parent.totalInjectionBytes,
      tokenDeltaO200k: current.totalInjectionTokens - parent.totalInjectionTokens,
    },
    effectiveSystem: {
      parentSha256: parent.effectiveSystemSha256,
      currentSha256: current.effectiveSystemSha256,
      characterDelta: current.effectiveSystemCharacters - parent.effectiveSystemCharacters,
      byteDelta: current.effectiveSystemBytes - parent.effectiveSystemBytes,
      tokenDeltaO200k: current.effectiveSystemTokens - parent.effectiveSystemTokens,
    },
    blocks: blockDeltas,
    transformationIds: PROTOCOL_COMPACTION_INVENTORY.map((item) => item.id),
  };
  const inventory = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    transformations: PROTOCOL_COMPACTION_INVENTORY,
  };
  writeFileSync(resolve(OUTPUT_ROOT, "v0c-to-v1a-diff.json"), `${JSON.stringify(diff, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(OUTPUT_ROOT, "protocol-compaction.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
}

function writeC03DiffArtifacts(sourceCommit: string, generatedAt: string): void {
  if (STAGE !== "C03") return;
  const parent = readManifest("protocol-compact");
  const current = readManifest("compact");
  if (parent.totalInjectionSha256 === current.totalInjectionSha256) {
    throw new Error("C03 compact output unexpectedly equals protocol-compact");
  }
  if (current.totalInjectionTokens >= parent.totalInjectionTokens) {
    throw new Error("C03 compact output does not reduce total injection tokens");
  }
  for (const profile of FROZEN_STAGE_PROFILES.slice(4)) {
    const inherited = readManifest(profile);
    if (
      inherited.totalInjectionSha256 !== current.totalInjectionSha256
      || inherited.effectiveSystemSha256 !== current.effectiveSystemSha256
    ) {
      throw new Error(`${profile} does not inherit the frozen C03 renderer`);
    }
  }

  const parentBlocks = new Map(parent.blocks.map((block) => [block.blockId, block]));
  const blockDeltas = current.blocks.map((block) => {
    const parentBlock = parentBlocks.get(block.blockId);
    if (!parentBlock) throw new Error(`protocol-compact artifact lacks block ${block.blockId}`);
    return {
      blockId: block.blockId,
      changed: block.promptSha256 !== parentBlock.promptSha256,
      parentSha256: parentBlock.promptSha256,
      currentSha256: block.promptSha256,
      characterDelta: block.characters - parentBlock.characters,
      byteDelta: block.bytes - parentBlock.bytes,
      tokenDeltaO200k: block.tokensO200k - parentBlock.tokensO200k,
    };
  });
  const diff = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    parentProfile: "protocol-compact",
    currentProfile: "compact",
    firstChangedByte: current.firstChangedByteFromParent,
    stablePrefixBytes: current.stablePrefixBytes,
    totalInjection: {
      parentSha256: parent.totalInjectionSha256,
      currentSha256: current.totalInjectionSha256,
      characterDelta: current.totalInjectionCharacters - parent.totalInjectionCharacters,
      byteDelta: current.totalInjectionBytes - parent.totalInjectionBytes,
      tokenDeltaO200k: current.totalInjectionTokens - parent.totalInjectionTokens,
    },
    effectiveSystem: {
      parentSha256: parent.effectiveSystemSha256,
      currentSha256: current.effectiveSystemSha256,
      characterDelta: current.effectiveSystemCharacters - parent.effectiveSystemCharacters,
      byteDelta: current.effectiveSystemBytes - parent.effectiveSystemBytes,
      tokenDeltaO200k: current.effectiveSystemTokens - parent.effectiveSystemTokens,
    },
    blocks: blockDeltas,
    semanticUnitIds: SEMANTIC_UNIT_INVENTORY.map((item) => item.id),
  };
  const inventory = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    units: SEMANTIC_UNIT_INVENTORY,
  };
  writeFileSync(resolve(OUTPUT_ROOT, "v1a-to-v1-diff.json"), `${JSON.stringify(diff, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(OUTPUT_ROOT, "semantic-unit-ownership.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
}

function writeC04DiffArtifacts(sourceCommit: string, generatedAt: string): void {
  if (STAGE !== "C04") return;
  const parent = readManifest("compact");
  const current = readManifest("selection-calibrated");
  if (parent.totalInjectionSha256 === current.totalInjectionSha256) {
    throw new Error("C04 selection-calibrated output unexpectedly equals compact");
  }
  const inherited = readManifest("capability-pruned");
  if (
    inherited.totalInjectionSha256 !== current.totalInjectionSha256
    || inherited.effectiveSystemSha256 !== current.effectiveSystemSha256
  ) {
    throw new Error("capability-pruned does not inherit the frozen C04 renderer");
  }

  const parentBlocks = new Map(parent.blocks.map((block) => [block.blockId, block]));
  const blockDeltas = current.blocks.map((block) => {
    const parentBlock = parentBlocks.get(block.blockId);
    if (!parentBlock) throw new Error(`compact artifact lacks block ${block.blockId}`);
    if (block.dynamicAssetSha256 !== parentBlock.dynamicAssetSha256) {
      throw new Error(`${block.blockId} dynamic asset bytes changed during C04`);
    }
    return {
      blockId: block.blockId,
      changed: block.promptSha256 !== parentBlock.promptSha256,
      dynamicAssetUnchanged: true,
      parentSha256: parentBlock.promptSha256,
      currentSha256: block.promptSha256,
      characterDelta: block.characters - parentBlock.characters,
      byteDelta: block.bytes - parentBlock.bytes,
      tokenDeltaO200k: block.tokensO200k - parentBlock.tokensO200k,
    };
  });
  const diff = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    parentProfile: "compact",
    currentProfile: "selection-calibrated",
    firstChangedByte: current.firstChangedByteFromParent,
    stablePrefixBytes: current.stablePrefixBytes,
    totalInjection: {
      parentSha256: parent.totalInjectionSha256,
      currentSha256: current.totalInjectionSha256,
      characterDelta: current.totalInjectionCharacters - parent.totalInjectionCharacters,
      byteDelta: current.totalInjectionBytes - parent.totalInjectionBytes,
      tokenDeltaO200k: current.totalInjectionTokens - parent.totalInjectionTokens,
    },
    effectiveSystem: {
      parentSha256: parent.effectiveSystemSha256,
      currentSha256: current.effectiveSystemSha256,
      characterDelta: current.effectiveSystemCharacters - parent.effectiveSystemCharacters,
      byteDelta: current.effectiveSystemBytes - parent.effectiveSystemBytes,
      tokenDeltaO200k: current.effectiveSystemTokens - parent.effectiveSystemTokens,
    },
    blocks: blockDeltas,
    selectionPolicyIds: SELECTION_POLICY_INVENTORY.map((item) => item.id),
  };
  const inventory = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    policies: SELECTION_POLICY_INVENTORY,
  };
  writeFileSync(resolve(OUTPUT_ROOT, "v1-to-v2-diff.json"), `${JSON.stringify(diff, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(OUTPUT_ROOT, "selection-policy.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
}

function writeC05DiffArtifacts(sourceCommit: string, generatedAt: string): void {
  if (STAGE !== "C05") return;
  const parent = readManifest("selection-calibrated");
  const current = readManifest("capability-pruned");
  if (parent.totalInjectionSha256 === current.totalInjectionSha256) {
    throw new Error("C05 capability-pruned output unexpectedly equals selection-calibrated");
  }
  if (current.totalInjectionTokens >= parent.totalInjectionTokens) {
    throw new Error("C05 full-readonly capability projection does not reduce injection tokens");
  }

  const parentBlocks = new Map(parent.blocks.map((block) => [block.blockId, block]));
  const blockDeltas = current.blocks.map((block) => {
    const parentBlock = parentBlocks.get(block.blockId);
    if (!parentBlock) throw new Error(`selection-calibrated artifact lacks block ${block.blockId}`);
    if (block.dynamicAssetSha256 !== parentBlock.dynamicAssetSha256) {
      throw new Error(`${block.blockId} dynamic asset bytes changed during canonical C05 capture`);
    }
    return {
      blockId: block.blockId,
      changed: block.promptSha256 !== parentBlock.promptSha256,
      dynamicAssetUnchanged: true,
      parentSha256: parentBlock.promptSha256,
      currentSha256: block.promptSha256,
      characterDelta: block.characters - parentBlock.characters,
      byteDelta: block.bytes - parentBlock.bytes,
      tokenDeltaO200k: block.tokensO200k - parentBlock.tokensO200k,
    };
  });
  const diff = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    parentProfile: "selection-calibrated",
    currentProfile: "capability-pruned",
    capabilitySignature: CAPABILITY_SIGNATURE,
    firstChangedByte: current.firstChangedByteFromParent,
    stablePrefixBytes: current.stablePrefixBytes,
    totalInjection: {
      parentSha256: parent.totalInjectionSha256,
      currentSha256: current.totalInjectionSha256,
      characterDelta: current.totalInjectionCharacters - parent.totalInjectionCharacters,
      byteDelta: current.totalInjectionBytes - parent.totalInjectionBytes,
      tokenDeltaO200k: current.totalInjectionTokens - parent.totalInjectionTokens,
    },
    effectiveSystem: {
      parentSha256: parent.effectiveSystemSha256,
      currentSha256: current.effectiveSystemSha256,
      characterDelta: current.effectiveSystemCharacters - parent.effectiveSystemCharacters,
      byteDelta: current.effectiveSystemBytes - parent.effectiveSystemBytes,
      tokenDeltaO200k: current.effectiveSystemTokens - parent.effectiveSystemTokens,
    },
    blocks: blockDeltas,
    pruningIds: CAPABILITY_PRUNING_INVENTORY.map((item) => item.id),
  };
  const inventory = {
    schemaVersion: 1,
    stage: STAGE,
    sourceCommit,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    generatedAt,
    transformations: CAPABILITY_PRUNING_INVENTORY,
  };
  writeFileSync(resolve(OUTPUT_ROOT, "v2-to-v3-diff.json"), `${JSON.stringify(diff, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(OUTPUT_ROOT, "capability-pruning.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
  writeC05CapabilityMatrix(sourceCommit, generatedAt);
}

function writeC05CapabilityMatrix(sourceCommit: string, generatedAt: string): void {
  const rows: Array<{ id: string; state: ToolPromptCapabilityState }> = [
    { id: "full-readonly", state: { memory: true, skill: true, knowledge: true, wiki: true, codeGraph: true, skillWrite: false, skillExtract: false } },
    { id: "full-write-extract", state: { memory: true, skill: true, knowledge: true, wiki: true, codeGraph: true, skillWrite: true, skillExtract: true } },
    { id: "memory-only", state: { memory: true, skill: false, knowledge: false, wiki: false, codeGraph: false, skillWrite: false, skillExtract: false } },
    { id: "skill-readonly", state: { memory: false, skill: true, knowledge: false, wiki: false, codeGraph: false, skillWrite: false, skillExtract: false } },
    { id: "skill-write", state: { memory: false, skill: true, knowledge: false, wiki: false, codeGraph: false, skillWrite: true, skillExtract: false } },
    { id: "skill-extract", state: { memory: false, skill: true, knowledge: false, wiki: false, codeGraph: false, skillWrite: false, skillExtract: true } },
    { id: "wiki-only", state: { memory: false, skill: false, knowledge: true, wiki: true, codeGraph: false, skillWrite: false, skillExtract: false } },
    { id: "code-graph-only", state: { memory: false, skill: false, knowledge: true, wiki: false, codeGraph: true, skillWrite: false, skillExtract: false } },
    { id: "skill-and-wiki", state: { memory: false, skill: true, knowledge: true, wiki: true, codeGraph: false, skillWrite: false, skillExtract: false } },
  ];
  const listing = [
    "<available_skills>",
    "- task1-review: Review proxy prompt contracts and evidence",
    "- typescript-tests: Run deterministic TypeScript contract tests",
    "</available_skills>",
  ].join("\n");
  const legacyKnowledge = renderKnowledgeToolsBlock(
    CAPABILITY_MATRIX_KNOWLEDGE,
    CANONICAL.spaceId,
    {
      sessionKey: CANONICAL.sessionId,
      userId: CANONICAL.userId,
      teamId: CANONICAL.teamId,
      agentId: CANONICAL.agentId,
      agentSource: CANONICAL.agentSource,
      spaceId: CANONICAL.spaceId,
    },
  );
  if (!legacyKnowledge) throw new Error("C05 capability matrix knowledge fixture is empty");

  const matrixRows = rows.map(({ id, state }) => {
    const signature = buildCapabilitySignature(state);
    const bundle: Partial<Record<ToolPromptSurface, string>> = {};
    const orderedBlocks: string[] = [];
    const compile = (
      family: ToolPromptFamily,
      surface: ToolPromptSurface,
      legacyContent: string,
    ): string => compileToolPrompt({
      profile: "capability-pruned",
      family,
      surface,
      legacyUnits: [{ id: `${id}.${surface}`, kind: "legacy-body", content: legacyContent }],
      capabilitySignature: signature,
    }).content;

    if (state.skill) {
      const skillTools = compile(
        "skill",
        "skill-tools",
        renderSkillToolsBlock(
          CANONICAL.proxyOrigin,
          state.skillWrite,
          CANONICAL.sessionId,
          CANONICAL.spaceId,
        ),
      );
      const skillListing = wrapAvailableSkillsBlock(listing, "capability-pruned", signature);
      bundle["skill-tools"] = skillTools;
      bundle["skill-listing"] = skillListing;
      orderedBlocks.push(skillTools, skillListing);
    }
    if (state.knowledge) {
      const knowledge = compile("knowledge", "knowledge-tools", legacyKnowledge);
      bundle["knowledge-tools"] = knowledge;
      orderedBlocks.push(knowledge);
    }
    if (state.memory) {
      const memoryTools = compile(
        "memory",
        "memory-tools",
        renderTdaiMemoryToolsBlock(
          CANONICAL.proxyOrigin,
          CANONICAL.sessionId,
          CANONICAL.spaceId,
        ),
      );
      const memoryGuide = compile("memory", "memory-guide", MEMORY_TOOLS_GUIDE);
      const profileMemory = renderTdaiProfileMemoryBlock([{
        agentName: "task1-agent",
        agentId: CANONICAL.agentId,
        isSelf: true,
        l3Content: "Prefers evidence-backed prompt changes.",
        l2Entries: [{ path: "task1/compiler.md", summary: "Compiler implementation decisions" }],
      }], memoryGuide).content;
      bundle["memory-tools"] = memoryTools;
      bundle["memory-guide"] = memoryGuide;
      orderedBlocks.push(memoryTools, profileMemory);
    }
    lintCapabilityPrunedSurface(bundle, signature);
    const injection = orderedBlocks.join("\n");
    return {
      id,
      capabilitySignature: signature,
      activeFamilies: [
        ...(state.memory ? ["memory"] : []),
        ...(state.skill ? ["skill"] : []),
        ...(state.knowledge ? ["knowledge"] : []),
      ],
      injectionBytes: Buffer.byteLength(injection, "utf8"),
      injectionTokensO200k: tokens(injection),
      injectionSha256: sha256(injection),
      toolIds: [...injection.matchAll(/<tool name="([^"]+)">/g)].map((match) => match[1]),
      knowledgeResourceTypes: [...injection.matchAll(/<knowledge type="([^"]+)"/g)]
        .map((match) => match[1]),
    };
  });
  writeFileSync(
    resolve(OUTPUT_ROOT, "capability-matrix.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      stage: STAGE,
      sourceCommit,
      compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
      generatedAt,
      rows: matrixRows,
    }, null, 2)}\n`,
    "utf8",
  );
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
  const memoryGuide = compiledMemoryGuide(profile);
  const profileMemory = renderTdaiProfileMemoryBlock([{
    agentName: "task1-agent",
    agentId: CANONICAL.agentId,
    isSelf: true,
    l3Content: "Prefers evidence-backed prompt changes.",
    l2Entries: [{ path: "task1/compiler.md", summary: "Compiler implementation decisions" }],
  }], memoryGuide).content;

  if (profile === "compact") {
    lintDuplicateSemanticUnits({
      "memory-tools": memoryTools,
      "memory-guide": memoryGuide,
      "skill-tools": skillTools,
      "skill-listing": skillListing,
      "knowledge-tools": knowledgeTools,
    });
  }
  if (profile === "selection-calibrated") {
    lintSelectionPolicy({
      "memory-tools": memoryTools,
      "memory-guide": memoryGuide,
      "skill-tools": skillTools,
      "skill-listing": skillListing,
      "knowledge-tools": knowledgeTools,
    }, CAPABILITY_SIGNATURE);
  }
  if (profile === "capability-pruned") {
    lintCapabilityPrunedSurface({
      "memory-tools": memoryTools,
      "memory-guide": memoryGuide,
      "skill-tools": skillTools,
      "skill-listing": skillListing,
      "knowledge-tools": knowledgeTools,
    }, CAPABILITY_SIGNATURE);
  }

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
  const sourceCommit = execFileSync("git", [
    "rev-list",
    "-1",
    "HEAD",
    "--",
    "MemoryProxy/src/injection/tool-prompt",
    "MemoryProxy/src/injection/injectors/tdai-tools-injector.ts",
    "MemoryProxy/src/injection/injectors/tdai-profile-memory-injector.ts",
    "MemoryProxy/src/injection/injectors/skill-tools-injector.ts",
    "MemoryProxy/src/injection/injectors/skill-injector.ts",
    "MemoryProxy/src/injection/injectors/knowledge-tools-injector.ts",
  ], {
    cwd: resolve(".."),
    encoding: "utf8",
  }).trim();
  const generatedAt = execFileSync("git", ["show", "-s", "--format=%cI", sourceCommit], {
    cwd: resolve(".."),
    encoding: "utf8",
  }).trim();
  let parentPrompt: string | null = null;
  for (const profile of FROZEN_STAGE_PROFILES) {
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
      stage: STAGE,
      profile,
      parentProfile: parentPrompt === null
        ? null
        : FROZEN_STAGE_PROFILES[FROZEN_STAGE_PROFILES.indexOf(profile) - 1],
      sourceCommit,
      compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
      capabilitySignature: CAPABILITY_SIGNATURE,
      tokenizer: "o200k_base",
      componentTokenAccounting:
        "Static templates, dynamic assets, and bindings are encoded independently; tokenizer boundaries make these diagnostic components non-additive. totalInjectionTokens is authoritative.",
      generatedAt,
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
  assertFrozenAncestors();
  writeC01DiffArtifacts(sourceCommit, generatedAt);
  writeC02DiffArtifacts(sourceCommit, generatedAt);
  writeC03DiffArtifacts(sourceCommit, generatedAt);
  writeC04DiffArtifacts(sourceCommit, generatedAt);
  writeC05DiffArtifacts(sourceCommit, generatedAt);
  encoding.free();
  console.log(`captured ${STAGE} prompt artifacts in ${OUTPUT_ROOT}`);
}

await main();
