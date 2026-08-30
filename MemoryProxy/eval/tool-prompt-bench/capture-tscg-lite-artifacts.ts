import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
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
import type { AnchorTarget, ContextBlock, InjectionPoint } from "../../src/injection/types.js";
import {
  buildCapabilitySignature,
  compileToolPrompt,
  getRuntimeToolContracts,
  getToolPromptProfileLineage,
  getVisibleRuntimeToolContracts,
  lintTscgCapabilityProjection,
  toolPromptCacheIdentity,
  TSCG_LITE_COMPILER_VERSION,
  TSCG_LITE_OPERATOR_IDS,
  TSCG_LITE_OPERATOR_INVENTORY,
  TSCG_LITE_PROFILE_OPERATORS,
  TSCG_LITE_PROFILES,
  type CompiledToolPrompt,
  type CompiledToolPromptProfile,
  type ToolPromptFamily,
  type ToolPromptProfile,
  type ToolPromptSurface,
  type TscgLiteProfile,
} from "../../src/injection/tool-prompt/index.js";
import { KNOWLEDGE_TOOL_PROMPT_SPECS } from "../../src/injection/tool-prompt/specs/knowledge.js";
import { MEMORY_TOOL_PROMPT_SPECS } from "../../src/injection/tool-prompt/specs/memory.js";
import { SKILL_TOOL_PROMPT_SPECS } from "../../src/injection/tool-prompt/specs/skill.js";

const BASELINE_COMMIT = "0373227c4b345c77f79ace5b0c19eb98e0fc50df";
const OUTPUT_ROOT = resolve("eval/tool-prompt-bench/method-candidates/tscg-lite");
const CAPABILITY_DIR = "full-readonly";
const REPO_ROOT = resolve("..");
const encoding = get_encoding("o200k_base");

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

const SPECS_BY_FAMILY = {
  memory: MEMORY_TOOL_PROMPT_SPECS,
  skill: SKILL_TOOL_PROMPT_SPECS,
  knowledge: KNOWLEDGE_TOOL_PROMPT_SPECS,
} as const;

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function tokens(content: string): number {
  return encoding.encode(content).length;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

interface BlockArtifact {
  blockId: string;
  injectionPoint: "system.before_tools" | "system.suffix";
  content: string;
}

interface RenderedCandidate {
  profile: ToolPromptProfile;
  injection: string;
  prompt: string;
  blocks: readonly BlockArtifact[];
  toolCompilations: readonly CompiledToolPrompt[];
}

function compileSurface(
  profile: ToolPromptProfile,
  family: ToolPromptFamily,
  surface: ToolPromptSurface,
  legacyContent: string,
): CompiledToolPrompt | null {
  if (profile === "legacy") return null;
  return compileToolPrompt({
    profile: profile as CompiledToolPromptProfile,
    family,
    surface,
    legacyUnits: [{ id: `${surface}.capture`, kind: "legacy-body", content: legacyContent }],
    capabilitySignature: CAPABILITY_SIGNATURE,
  });
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
    description: "TSCG-lite canonical artifact fixture",
    execute: (): ContextBlock[] => [{ type: "text", content }],
  });
}

async function renderProviderSystem(blocks: readonly BlockArtifact[]): Promise<string> {
  const byId = new Map(blocks.map((block) => [block.blockId, block.content]));
  const registry = new HookRegistryImpl();
  registerStaticHook(registry, "skill-tools-injector", "system.before_tools", 199, { slot: "skills", relation: "before" }, byId.get("skill_tools")!);
  registerStaticHook(registry, "skill-injector", "system.before_tools", 200, { slot: "skills", relation: "before" }, byId.get("available_skills")!);
  registerStaticHook(registry, "knowledge-tools-injector", "system.before_tools", 300, { slot: "knowledge", relation: "after" }, byId.get("knowledge_tools")!);
  registerStaticHook(registry, "tdai-memory-tools-injector", "system.suffix", 105, { slot: "memory", relation: "before" }, byId.get("tdai_memory_tools")!);
  registerStaticHook(registry, "tdai-profile-memory-injector", "system.suffix", 110, { slot: "memory", relation: "inside_append" }, byId.get("tdai_profile_memory")!);
  const pipeline = new InjectionPipeline(
    registry,
    new Map([["openai", new OpenAIAdapter()]]),
    { agentProfiles: new Map([["codebuddy", new CodeBuddyProfile()]]) },
  );
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    const result = await pipeline.process({
      model: "tscg-lite-artifact",
      messages: [
        {
          role: "system",
          content: [
            "Canonical CodeBuddy provider prompt for Task 1 TSCG-lite artifacts.",
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
      traceId: "tscg-lite-artifact",
      keyId: "tscg-lite-artifact",
      modelId: "tscg-lite-artifact",
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
    }) as Record<string, unknown>;
    const content = (result.messages as Array<{ content?: unknown }>)[0]?.content;
    if (typeof content !== "string") throw new Error("TSCG-lite provider prompt is not text");
    return content;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

async function renderProfile(profile: ToolPromptProfile): Promise<RenderedCandidate> {
  const legacySkill = renderSkillToolsBlock(
    CANONICAL.proxyOrigin,
    false,
    CANONICAL.sessionId,
    CANONICAL.spaceId,
  );
  const legacyMemory = renderTdaiMemoryToolsBlock(
    CANONICAL.proxyOrigin,
    CANONICAL.sessionId,
    CANONICAL.spaceId,
  );
  const legacyKnowledge = renderKnowledgeToolsBlock(KNOWLEDGE, CANONICAL.spaceId, {
    sessionKey: CANONICAL.sessionId,
    userId: CANONICAL.userId,
    teamId: CANONICAL.teamId,
    agentId: CANONICAL.agentId,
    agentSource: CANONICAL.agentSource,
    spaceId: CANONICAL.spaceId,
  });
  if (!legacyKnowledge) throw new Error("TSCG-lite knowledge fixture is empty");
  const skillCompiled = compileSurface(profile, "skill", "skill-tools", legacySkill);
  const knowledgeCompiled = compileSurface(profile, "knowledge", "knowledge-tools", legacyKnowledge);
  const memoryCompiled = compileSurface(profile, "memory", "memory-tools", legacyMemory);
  const guideCompiled = compileSurface(profile, "memory", "memory-guide", MEMORY_TOOLS_GUIDE);
  const skillTools = skillCompiled?.content ?? legacySkill;
  const knowledgeTools = knowledgeCompiled?.content ?? legacyKnowledge;
  const memoryTools = memoryCompiled?.content ?? legacyMemory;
  const guide = guideCompiled?.content ?? MEMORY_TOOLS_GUIDE;
  const listing = wrapAvailableSkillsBlock([
    "<available_skills>",
    "- task1-review: Review proxy prompt contracts and evidence",
    "- typescript-tests: Run deterministic TypeScript contract tests",
    "</available_skills>",
  ].join("\n"), profile, CAPABILITY_SIGNATURE);
  const profileMemory = renderTdaiProfileMemoryBlock([{
    agentName: "task1-agent",
    agentId: CANONICAL.agentId,
    isSelf: true,
    l3Content: "Prefers evidence-backed prompt changes.",
    l2Entries: [{ path: "task1/compiler.md", summary: "Compiler implementation decisions" }],
  }], guide).content;
  const blocks: BlockArtifact[] = [
    { blockId: "skill_tools", injectionPoint: "system.before_tools", content: skillTools },
    { blockId: "available_skills", injectionPoint: "system.before_tools", content: listing },
    { blockId: "knowledge_tools", injectionPoint: "system.before_tools", content: knowledgeTools },
    { blockId: "tdai_memory_tools", injectionPoint: "system.suffix", content: memoryTools },
    { blockId: "tdai_profile_memory", injectionPoint: "system.suffix", content: profileMemory },
  ];
  return {
    profile,
    injection: blocks.map((block) => block.content).join("\n"),
    prompt: await renderProviderSystem(blocks),
    blocks,
    toolCompilations: [skillCompiled, knowledgeCompiled, memoryCompiled].filter(
      (item): item is CompiledToolPrompt => item !== null,
    ),
  };
}

function staticTemplate(injection: string): string {
  let output = injection
    .replace(/<available_skills>[\s\S]*?<\/available_skills>/g, "{{dynamic:available-skills}}")
    .replace(/<knowledge type="[^"]+"[\s\S]*? \/>/g, "{{dynamic:knowledge-resource}}")
    .replace(/<tdai_profile_memory>[\s\S]*?<\/tdai_profile_memory>/g, "{{dynamic:profile-memory}}");
  const replacements: Array<[string, string]> = [
    [CANONICAL.proxyOrigin, "<proxy-origin>"],
    [CANONICAL.sessionId, "<session-id>"],
    [CANONICAL.spaceId, "<space-id>"],
    [CANONICAL.userId, "<user-id>"],
    [CANONICAL.teamId, "<team-id>"],
    [CANONICAL.agentId, "<agent-id>"],
    [CANONICAL.agentSource, "<agent-source>"],
  ];
  for (const [value, placeholder] of replacements) output = output.split(value).join(placeholder);
  return output;
}

function staticBlockTemplate(block: BlockArtifact): string {
  let output = block.content;
  if (block.blockId === "available_skills") {
    output = output.replace(
      /<available_skills>[\s\S]*?<\/available_skills>/g,
      "{{dynamic:available_skills}}",
    );
  } else if (block.blockId === "knowledge_tools") {
    output = output.replace(
      /<knowledge type="[^"]+"[\s\S]*? \/>/g,
      "{{dynamic:knowledge_tools}}",
    );
  } else if (block.blockId === "tdai_profile_memory") {
    output = output.replace(
      /<tdai_profile_memory>[\s\S]*?<\/tdai_profile_memory>/g,
      "{{dynamic:tdai_profile_memory}}",
    );
  }
  const replacements: Array<[string, string]> = [
    [CANONICAL.proxyOrigin, "<proxy-origin>"],
    [CANONICAL.sessionId, "<session-id>"],
    [CANONICAL.spaceId, "<space-id>"],
    [CANONICAL.userId, "<user-id>"],
    [CANONICAL.teamId, "<team-id>"],
    [CANONICAL.agentId, "<agent-id>"],
    [CANONICAL.agentSource, "<agent-source>"],
  ];
  for (const [value, placeholder] of replacements) output = output.split(value).join(placeholder);
  return output;
}

function assertRerunIdentical(first: RenderedCandidate, second: RenderedCandidate): void {
  const pairs: Array<[string, string, string]> = [
    ["injection", first.injection, second.injection],
    ["prompt", first.prompt, second.prompt],
    ["static-template", staticTemplate(first.injection), staticTemplate(second.injection)],
  ];
  for (const [label, left, right] of pairs) {
    if (left !== right) throw new Error(`${first.profile} ${label} differs across two captures`);
  }
}

function extractToolOrder(content: string): string[] {
  return [
    ...[...content.matchAll(/<tool name="([^"]+)">/g)].map((match) => match[1]),
    ...[...content.matchAll(/^\s+id: ([^\s]+)$/gm)].map((match) => match[1]),
    ...[...content.matchAll(/^\s*@T\|id=([^|\n]+)/gm)].map((match) => match[1]),
  ];
}

function writeCandidate(
  rendered: RenderedCandidate,
  rerendered: RenderedCandidate,
  v3Tokens: number,
): Record<string, unknown> {
  const profile = rendered.profile as TscgLiteProfile;
  const outputDir = resolve(OUTPUT_ROOT, profile, CAPABILITY_DIR);
  mkdirSync(outputDir, { recursive: true });
  const template = staticTemplate(rendered.injection);
  const rerenderedTemplate = staticTemplate(rerendered.injection);
  const fullTokens = tokens(rendered.injection);
  const staticTokens = rendered.blocks.reduce(
    (sum, block) => sum + tokens(staticBlockTemplate(block)),
    0,
  );
  const toolAudits = rendered.toolCompilations.map((compiled) => ({
    family: compiled.family,
    surface: compiled.surface,
    contractIds: compiled.contractIds,
    specIds: compiled.specIds,
    contentSha256: compiled.contentSha256,
    contractEquivalent: compiled.tscgLite?.contractEquivalent ?? false,
    droRoundTrip: compiled.tscgLite?.droRoundTrip ?? null,
    removedUnitMappings: compiled.tscgLite?.removedUnitMappings ?? [],
  }));
  const visibleIds = getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE)
    .map((contract) => contract.id);
  for (const family of ["memory", "skill", "knowledge"] as const) {
    const compilation = rendered.toolCompilations.find((item) => item.family === family)!;
    const program = buildProgramForAudit(family, compilation, extractToolOrder(compilation.content));
    lintTscgCapabilityProjection(program, visibleIds.filter((id) =>
      getRuntimeToolContracts(family).some((contract) => contract.id === id)
    ));
  }
  const manifest = {
    schemaVersion: 1,
    candidateId: profile.toUpperCase(),
    profile,
    parentProfile: profile === "tscg-sig"
      ? "capability-pruned"
      : TSCG_LITE_PROFILES[TSCG_LITE_PROFILES.indexOf(profile) - 1],
    profileLineage: getToolPromptProfileLineage(profile),
    enabledOperators: TSCG_LITE_OPERATOR_IDS.slice(
      0,
      TSCG_LITE_PROFILES.indexOf(profile) + 1,
    ),
    baselineCommit: BASELINE_COMMIT,
    compilerVersion: TSCG_LITE_COMPILER_VERSION,
    capabilitySignature: CAPABILITY_SIGNATURE,
    tokenizer: "o200k_base",
    tokenAccounting: "Each full injection and full static template is encoded as one complete string; component sums are not used as totals.",
    totalInjectionCharacters: rendered.injection.length,
    totalInjectionBytes: Buffer.byteLength(rendered.injection, "utf8"),
    totalInjectionTokens: fullTokens,
    totalInjectionSha256: sha256(rendered.injection),
    staticTemplateCharacters: template.length,
    staticTemplateBytes: Buffer.byteLength(template, "utf8"),
    staticToolTokens: staticTokens,
    fullStaticTemplateTokens: tokens(template),
    staticTemplateSha256: sha256(template),
    effectiveSystemTokens: tokens(rendered.prompt),
    effectiveSystemSha256: sha256(rendered.prompt),
    deltaVsV3Tokens: fullTokens - v3Tokens,
    contractEquivalent: toolAudits.every((audit) => audit.contractEquivalent),
    roundTrip: TSCG_LITE_PROFILE_OPERATORS[profile].dro
      ? toolAudits.every((audit) => audit.droRoundTrip === true)
      : null,
    captureSha256: {
      injection: {
        first: sha256(rendered.injection),
        second: sha256(rerendered.injection),
        identical: rendered.injection === rerendered.injection,
      },
      prompt: {
        first: sha256(rendered.prompt),
        second: sha256(rerendered.prompt),
        identical: rendered.prompt === rerendered.prompt,
      },
      staticTemplate: {
        first: sha256(template),
        second: sha256(rerenderedTemplate),
        identical: template === rerenderedTemplate,
      },
    },
    shaRerunIdentical: rendered.injection === rerendered.injection
      && rendered.prompt === rerendered.prompt
      && template === rerenderedTemplate,
    cacheIdentities: [
      "skill-tools-injector",
      "skill-injector",
      "knowledge-tools-injector",
      "tdai-memory-tools-injector",
      "tdai-profile-memory-injector",
    ].map((hookId) => ({
      hookId,
      cacheIdentity: toolPromptCacheIdentity(hookId, profile, CAPABILITY_SIGNATURE),
    })),
    toolAudits,
    blocks: rendered.blocks.map((block) => ({
      blockId: block.blockId,
      injectionPoint: block.injectionPoint,
      tokens: tokens(block.content),
      staticToolTokens: tokens(staticBlockTemplate(block)),
      sha256: sha256(block.content),
    })),
  };
  writeFileSync(resolve(outputDir, "injection.txt"), rendered.injection, "utf8");
  writeFileSync(resolve(outputDir, "prompt.txt"), rendered.prompt, "utf8");
  writeFileSync(resolve(outputDir, "static-template.txt"), template, "utf8");
  writeFileSync(resolve(outputDir, "manifest.json"), json(manifest), "utf8");
  return manifest;
}

function buildProgramForAudit(
  family: ToolPromptFamily,
  compilation: CompiledToolPrompt,
  order: readonly string[],
) {
  const contracts = getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE, family);
  const ordered = order.length > 0 ? order : contracts.map((contract) => contract.id);
  return {
    family,
    surface: compilation.surface,
    tools: ordered.map((id) => {
      const contract = contracts.find((item) => item.id === id)!;
      const spec = SPECS_BY_FAMILY[family].find((item) => item.contractId === id)!;
      return {
        contract: {
          id: contract.id,
          method: contract.method,
          path: contract.path,
          requiredHeaders: contract.requiredHeaders,
          requiredArgs: contract.requiredArgs,
          optionalArgs: contract.optionalArgs,
          forbiddenArgs: contract.forbiddenArgs,
          phase: contract.phase,
          capability: contract.capability,
          operation: contract.operation,
          responseKind: contract.responseKind,
        },
        decision: {
          when: spec.when,
          ...(spec.avoid ? { avoid: spec.avoid } : {}),
          contrasts: spec.contrasts ?? [],
        },
      };
    }),
    defaults: {},
    omittedFields: {},
    dependencyEdges: [],
  };
}

function verifyAncestorArtifacts(): Record<string, unknown> {
  const rows = [
    ["V0", "c00", "legacy"],
    ["V0-C", "c01", "contract-corrected"],
    ["V1a", "c02", "protocol-compact"],
    ["V1", "c03", "compact"],
    ["V2", "c04", "selection-calibrated"],
    ["V3", "c05", "capability-pruned"],
  ].map(([variant, stage, profile]) => {
    const files = ["injection.txt", "prompt.txt", "manifest.json"].map((filename) => {
      const relativePath = `MemoryProxy/eval/tool-prompt-bench/variants/${stage}/${profile}/${CAPABILITY_DIR}/${filename}`;
      const current = readFileSync(resolve(REPO_ROOT, relativePath));
      const baseline = execFileSync("git", ["show", `${BASELINE_COMMIT}:${relativePath}`], { cwd: REPO_ROOT });
      return {
        filename,
        sha256: sha256(current),
        baselineSha256: sha256(baseline),
        byteIdentical: current.equals(baseline),
      };
    });
    if (!files.every((file) => file.byteIdentical)) {
      throw new Error(`${variant} frozen ancestor artifact differs from ${BASELINE_COMMIT}`);
    }
    return { variant, profile, frozenStage: stage, files };
  });
  return {
    schemaVersion: 1,
    baselineCommit: BASELINE_COMMIT,
    variantMapping: Object.fromEntries(rows.map((row) => [row.variant, row.profile])),
    allByteIdentical: rows.every((row) => row.files.every((file) => file.byteIdentical)),
    rows,
  };
}

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

async function main(): Promise<void> {
  const v3 = await renderProfile("capability-pruned");
  const frozenV3 = readFileSync(
    resolve("eval/tool-prompt-bench/variants/c05/capability-pruned/full-readonly/injection.txt"),
    "utf8",
  );
  if (v3.injection !== frozenV3) throw new Error("current V3 render differs from frozen C05 bytes");
  const v3Tokens = tokens(v3.injection);
  const frozenV3Manifest = JSON.parse(readFileSync(
    resolve("eval/tool-prompt-bench/variants/c05/capability-pruned/full-readonly/manifest.json"),
    "utf8",
  )) as { staticToolTokens: number };
  const rendered = new Map<TscgLiteProfile, RenderedCandidate>();
  const rerendered = new Map<TscgLiteProfile, RenderedCandidate>();
  for (const profile of TSCG_LITE_PROFILES) {
    const first = await renderProfile(profile);
    const second = await renderProfile(profile);
    assertRerunIdentical(first, second);
    rendered.set(profile, first);
    rerendered.set(profile, second);
  }
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const manifests = TSCG_LITE_PROFILES.map((profile) =>
    writeCandidate(rendered.get(profile)!, rerendered.get(profile)!, v3Tokens)
  );
  const ledgerRows = manifests.map((manifest) => ({
    candidate: manifest.candidateId,
    profile: manifest.profile,
    enabledOperators: manifest.enabledOperators,
    fullInjectionTokens: manifest.totalInjectionTokens,
    staticToolTokens: manifest.staticToolTokens,
    deltaVsV3: manifest.deltaVsV3Tokens,
    contractEquivalent: manifest.contractEquivalent,
    roundTrip: manifest.roundTrip,
    shaRerunIdentical: manifest.shaRerunIdentical,
    captureSha256: manifest.captureSha256,
    injectionSha256: manifest.totalInjectionSha256,
  }));
  writeFileSync(resolve(OUTPUT_ROOT, "token-ledger.json"), json({
    schemaVersion: 1,
    tokenizer: "o200k_base",
    baseline: {
      candidate: "V3",
      fullInjectionTokens: v3Tokens,
      staticToolTokens: frozenV3Manifest.staticToolTokens,
      fullStaticTemplateTokens: tokens(staticTemplate(v3.injection)),
      injectionSha256: sha256(v3.injection),
    },
    rows: ledgerRows,
  }), "utf8");

  const ladder = [
    { id: "typed-signature", before: v3, after: rendered.get("tscg-sig")! },
    { id: "sdm", before: rendered.get("tscg-sig")!, after: rendered.get("tscg-sdm")! },
    { id: "dro", before: rendered.get("tscg-sdm")!, after: rendered.get("tscg-dro")! },
    { id: "cfo", before: rendered.get("tscg-dro")!, after: rendered.get("tscg-cfo")! },
  ];
  writeFileSync(resolve(OUTPUT_ROOT, "operator-attribution.json"), json({
    schemaVersion: 1,
    tokenizer: "o200k_base",
    rows: ladder.map((step) => {
      const inventory = TSCG_LITE_OPERATOR_INVENTORY.find((item) => item.id === step.id)!;
      const mappings = step.after.toolCompilations.flatMap(
        (compiled) => compiled.tscgLite?.removedUnitMappings ?? [],
      );
      return {
        operator: step.id,
        inputTokens: tokens(step.before.injection),
        outputTokens: tokens(step.after.injection),
        savedTokens: tokens(step.before.injection) - tokens(step.after.injection),
        inputSha256: sha256(step.before.injection),
        outputSha256: sha256(step.after.injection),
        changedFields: inventory.changedFields,
        preservedInvariants: inventory.preservedInvariants,
        removedUnitMapping: step.id === "sdm" ? mappings : [],
        beforeToolOrder: extractToolOrder(step.before.injection),
        afterToolOrder: extractToolOrder(step.after.injection),
      };
    }),
  }), "utf8");

  writeFileSync(resolve(OUTPUT_ROOT, "v3-unit-inventory.json"), json({
    schemaVersion: 1,
    baselineCommit: BASELINE_COMMIT,
    capabilitySignature: CAPABILITY_SIGNATURE,
    executionPlane: getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE).map((contract) => ({
      id: contract.id,
      method: contract.method,
      path: contract.path,
      requiredHeaders: contract.requiredHeaders,
      requiredArgs: contract.requiredArgs,
      optionalArgs: contract.optionalArgs,
      forbiddenArgs: contract.forbiddenArgs,
      phase: contract.phase,
      capability: contract.capability,
      operation: contract.operation,
      responseKind: contract.responseKind,
    })),
    decisionPlane: Object.values(SPECS_BY_FAMILY).flat().filter((spec) =>
      getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE).some((contract) => contract.id === spec.contractId)
    ),
    dynamicBindingPlane: {
      runtimeBindings: ["proxyOrigin", "sessionId", "spaceId", "userId", "teamId", "agentId", "agentSource"],
      assetRecords: ["available_skills", "knowledge resource records", "tdai_profile_memory L2/L3"],
      staticTemplateSha256: sha256(staticTemplate(v3.injection)),
    },
  }), "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "ancestor-integrity.json"), json(verifyAncestorArtifacts()), "utf8");

  const artifactFiles = listFiles(OUTPUT_ROOT)
    .filter((path) => !path.endsWith("artifact-sha256.json"))
    .sort();
  writeFileSync(resolve(OUTPUT_ROOT, "artifact-sha256.json"), json({
    schemaVersion: 1,
    files: Object.fromEntries(artifactFiles.map((path) => [
      relative(OUTPUT_ROOT, path).replaceAll("\\", "/"),
      { bytes: statSync(path).size, sha256: sha256(readFileSync(path)) },
    ])),
  }), "utf8");
  encoding.free();
  console.log(`captured deterministic TSCG-lite artifacts in ${OUTPUT_ROOT}`);
}

await main();
