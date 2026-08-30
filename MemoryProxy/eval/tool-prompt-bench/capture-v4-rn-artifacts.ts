import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import type { AnchorTarget, ContextBlock, InjectionPoint } from "../../src/injection/types.js";
import {
  buildCapabilitySignature,
  CANONICAL_NEUTRAL_TOOL_CARD_MASK,
  compileToolPrompt,
  getRuntimeToolContracts,
  lintCapabilityPrunedSurface,
  lintNeutralContrastVisibility,
  lintNeutralFieldSkeleton,
  lintNeutralToolCards,
  NEUTRAL_TOOL_CARD_FIELD_LABELS,
  toolPromptCacheIdentity,
  TOOL_CARD_COMPONENTS,
  V4_RN_RENDERER_VERSION,
  type CompiledToolPromptProfile,
  type NeutralToolCard,
  type NeutralToolCardComponent,
  type ToolCardComponent,
  type ToolPromptFamily,
  type ToolPromptProfile,
  type ToolPromptSurface,
} from "../../src/injection/tool-prompt/index.js";

const OUTPUT_ROOT = resolve("eval/tool-prompt-bench/method-candidates/v4-rn/full-readonly");
const FROZEN_V3_ROOT = resolve(
  "eval/tool-prompt-bench/variants/c05/capability-pruned/full-readonly",
);
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
const V3_BIAS_TERMS = [
  "best", "preferred", "recommended", "powerful", "always", "must", "最佳", "优先", "推荐", "强大", "总是",
] as const;

interface BlockInput {
  blockId: string;
  injectionPoint: "system.before_tools" | "system.suffix";
  content: string;
}

interface RenderedProfile {
  injection: string;
  providerSystem: string;
  blocks: readonly BlockInput[];
  contractIds: readonly string[];
}

interface ParsedCard {
  family: ToolPromptFamily;
  toolId: string;
  order: number;
  text: string;
  body: string;
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function tokens(content: string): number {
  return encoding.encode(content).length;
}

function compileSurface(
  profile: CompiledToolPromptProfile,
  family: ToolPromptFamily,
  surface: ToolPromptSurface,
  legacyContent: string,
): { content: string; contractIds: readonly string[] } {
  const compiled = compileToolPrompt({
    profile,
    family,
    surface,
    legacyUnits: [{ id: `${surface}.candidate-capture`, kind: "legacy-body", content: legacyContent }],
    capabilitySignature: CAPABILITY_SIGNATURE,
  });
  return { content: compiled.content, contractIds: compiled.contractIds };
}

async function renderProfile(profile: "capability-pruned" | "neutral-symmetric"): Promise<RenderedProfile> {
  const memory = compileSurface(
    profile,
    "memory",
    "memory-tools",
    renderTdaiMemoryToolsBlock(CANONICAL.proxyOrigin, CANONICAL.sessionId, CANONICAL.spaceId),
  );
  const skill = compileSurface(
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
  if (!legacyKnowledge) throw new Error("V4-RN capture knowledge fixture is empty");
  const knowledge = compileSurface(profile, "knowledge", "knowledge-tools", legacyKnowledge);
  const guide = compileSurface(profile, "memory", "memory-guide", MEMORY_TOOLS_GUIDE);
  const profileMemory = renderTdaiProfileMemoryBlock([{
    agentName: "task1-agent",
    agentId: CANONICAL.agentId,
    isSelf: true,
    l3Content: "Prefers evidence-backed prompt changes.",
    l2Entries: [{ path: "task1/compiler.md", summary: "Compiler implementation decisions" }],
  }], guide.content).content;
  const bundle = {
    "memory-tools": memory.content,
    "memory-guide": guide.content,
    "skill-tools": skill.content,
    "skill-listing": skillListing,
    "knowledge-tools": knowledge.content,
  };
  lintCapabilityPrunedSurface(bundle, CAPABILITY_SIGNATURE);
  if (profile === "neutral-symmetric") {
    for (const content of [memory.content, skill.content, knowledge.content]) {
      lintNeutralFieldSkeleton(content);
    }
    const toolIds = [...`${skill.content}\n${knowledge.content}\n${memory.content}`
      .matchAll(/<tool name="([^"]+)">/g)].map((match) => match[1]);
    lintNeutralContrastVisibility(`${skill.content}\n${knowledge.content}\n${memory.content}`, toolIds);
  }
  const blocks: BlockInput[] = [
    { blockId: "skill_tools", injectionPoint: "system.before_tools", content: skill.content },
    { blockId: "available_skills", injectionPoint: "system.before_tools", content: skillListing },
    { blockId: "knowledge_tools", injectionPoint: "system.before_tools", content: knowledge.content },
    { blockId: "tdai_memory_tools", injectionPoint: "system.suffix", content: memory.content },
    { blockId: "tdai_profile_memory", injectionPoint: "system.suffix", content: profileMemory },
  ];
  return {
    injection: blocks.map((block) => block.content).join("\n"),
    providerSystem: await renderProviderSystem(blocks),
    blocks,
    contractIds: [...skill.contractIds, ...knowledge.contractIds, ...memory.contractIds],
  };
}

function registerHook(
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
    description: "V4-RN deterministic candidate capture",
    execute: (): ContextBlock[] => [{ type: "text", content }],
  });
}

async function renderProviderSystem(blocks: readonly BlockInput[]): Promise<string> {
  const byId = new Map(blocks.map((block) => [block.blockId, block.content]));
  const registry = new HookRegistryImpl();
  registerHook(registry, "skill-tools-injector", "system.before_tools", 199, { slot: "skills", relation: "before" }, byId.get("skill_tools")!);
  registerHook(registry, "skill-injector", "system.before_tools", 200, { slot: "skills", relation: "before" }, byId.get("available_skills")!);
  registerHook(registry, "knowledge-tools-injector", "system.before_tools", 300, { slot: "knowledge", relation: "after" }, byId.get("knowledge_tools")!);
  registerHook(registry, "tdai-memory-tools-injector", "system.suffix", 105, { slot: "memory", relation: "before" }, byId.get("tdai_memory_tools")!);
  registerHook(registry, "tdai-profile-memory-injector", "system.suffix", 110, { slot: "memory", relation: "inside_append" }, byId.get("tdai_profile_memory")!);
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
      model: "v4-rn-artifact",
      messages: [{
        role: "system",
        content: [
          "Canonical CodeBuddy provider prompt for Task 1 C00 artifacts.",
          "<mcp_protocol>native tools</mcp_protocol>",
          "<agent_skills>native skills</agent_skills>",
          "<memories>native memory</memories>",
          "<rules>native rules</rules>",
        ].join("\n"),
      }, { role: "user", content: "canonical artifact input" }],
    }, {
      protocol: "openai",
      traceId: "v4-rn-artifact",
      keyId: "v4-rn-artifact",
      modelId: "v4-rn-artifact",
      stream: false,
      agentSource: "codebuddy",
      userId: CANONICAL.userId,
      spaceId: CANONICAL.spaceId,
      sessionKey: CANONICAL.sessionId,
      custom: { session: {
        session_id: CANONICAL.sessionId,
        space_id: CANONICAL.spaceId,
        user_id: CANONICAL.userId,
        team_id: CANONICAL.teamId,
        agent_id: CANONICAL.agentId,
      } },
    });
    const content = (result.messages as Array<Record<string, unknown>>)[0]?.content;
    if (typeof content !== "string") throw new Error("V4-RN provider prompt is not text");
    return content;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function parseCards(content: string): ParsedCard[] {
  const contracts = new Map(getRuntimeToolContracts().map((contract) => [contract.id, contract]));
  return [...content.matchAll(/  <tool name="([^"]+)">\n([\s\S]*?)  <\/tool>/g)]
    .map((match, order) => {
      const toolId = match[1];
      const contract = contracts.get(toolId);
      if (!contract) throw new Error(`capture found unknown card ${toolId}`);
      return { family: contract.family, toolId, order, text: match[0], body: match[2] };
    });
}

function parseV4Components(card: ParsedCard): NeutralToolCard {
  const components: NeutralToolCardComponent[] = TOOL_CARD_COMPONENTS.map((kind) => {
    const label: Record<ToolCardComponent, string> = NEUTRAL_TOOL_CARD_FIELD_LABELS;
    const prefix = `    ${label[kind]}: `;
    const line = card.body.split("\n").find((candidate) => candidate.startsWith(prefix));
    if (!line) throw new Error(`${card.toolId} capture missing ${kind}`);
    return {
      kind,
      content: line.slice(prefix.length),
      sourceSpecIds: [card.toolId],
      sourceRefs: [`capture#${card.toolId}.${kind}`],
    };
  });
  return { family: card.family, toolId: card.toolId, components };
}

function v3Inventory(cards: readonly ParsedCard[]): Array<Record<string, unknown>> {
  return cards.map((card) => ({
    family: card.family,
    tool: card.toolId,
    canonicalOrder: card.order,
    fields: card.body.split("\n").filter((line) => line.startsWith("    ")).map((line) => line.trim().split(":", 1)[0]),
    characters: card.text.length,
    tokensO200k: tokens(card.text),
    biasMarkers: V3_BIAS_TERMS.filter((term) => card.body.toLowerCase().includes(term.toLowerCase())),
    contrasts: [...card.body.matchAll(/^    contrast\[([^\]]+)\]: (.+)$/gm)].map((match) => ({ otherTool: match[1], cue: match[2] })),
  }));
}

function executionFromV3(card: ParsedCard): Record<string, string> {
  const path = card.body.match(/^    path: (.+)$/m)?.[1];
  const body = card.body.match(/^    body: (.+)$/m)?.[1];
  const contract = getRuntimeToolContracts().find((candidate) => candidate.id === card.toolId);
  if (!path || !body || !contract) throw new Error(`${card.toolId} missing V3 execution`);
  return {
    method: contract.method,
    path,
    headers: contract.requiredHeaders.join(","),
    body,
    response: card.body.match(/^    response: (.+)$/m)?.[1] ?? contract.responseKind,
  };
}

function executionFromV4(card: ParsedCard): Record<string, string> {
  const value = card.body.match(/^    execution: method=([^;]+); path=([^;]+); headers=([^;]+); body=(.+); response=([^\n]+)$/m);
  if (!value) throw new Error(`${card.toolId} missing V4-RN execution`);
  return { method: value[1], path: value[2], headers: value[3], body: value[4], response: value[5] };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function markdownCell(value: unknown): string {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function main(): Promise<void> {
  const v3 = await renderProfile("capability-pruned");
  const run1 = await renderProfile("neutral-symmetric");
  const run2 = await renderProfile("neutral-symmetric");
  if (run1.injection !== run2.injection || run1.providerSystem !== run2.providerSystem) {
    throw new Error("V4-RN independent captures are not byte-identical");
  }
  const frozenInjection = readFileSync(resolve(FROZEN_V3_ROOT, "injection.txt"), "utf8");
  const frozenPrompt = readFileSync(resolve(FROZEN_V3_ROOT, "prompt.txt"), "utf8");
  if (v3.injection !== frozenInjection || v3.providerSystem !== frozenPrompt) {
    throw new Error(
      `current V3 render differs from frozen C05 canonical bytes: injection=${v3.injection === frozenInjection}; prompt=${v3.providerSystem === frozenPrompt}; current=${sha256(v3.injection)}/${sha256(v3.providerSystem)}; frozen=${sha256(frozenInjection)}/${sha256(frozenPrompt)}`,
    );
  }

  const v3Cards = parseCards(v3.injection);
  const v4Cards = parseCards(run1.injection);
  const v4Ir = v4Cards.map(parseV4Components);
  lintNeutralToolCards(v4Ir);
  const v3Order = v3Cards.map((card) => card.toolId);
  const v4Order = v4Cards.map((card) => card.toolId);
  if (JSON.stringify(v3Order) !== JSON.stringify(v4Order)) throw new Error("V4-RN changed canonical tool order");
  const v3Execution = new Map(v3Cards.map((card) => [card.toolId, executionFromV3(card)]));
  const executionDiff = v4Cards.map((card) => {
    const before = v3Execution.get(card.toolId);
    const after = executionFromV4(card);
    const unchanged = before?.method === after.method
      && before.path === after.path
      && before.headers === after.headers
      && before.body === after.body
      && before.response === after.response;
    if (!unchanged) throw new Error(`${card.toolId} execution changed from V3`);
    const contract = getRuntimeToolContracts().find((candidate) => candidate.id === card.toolId)!;
    return {
      family: card.family,
      tool: card.toolId,
      runtimeContract: {
        requiredHeaders: contract.requiredHeaders,
        requiredArgs: contract.requiredArgs,
        optionalArgs: contract.optionalArgs,
        forbiddenArgs: contract.forbiddenArgs,
        responseKind: contract.responseKind,
        sourceRefs: contract.sourceRefs,
      },
      before,
      after,
      unchanged,
    };
  });

  const rawRows = v4Cards.map((card) => {
    const ir = v4Ir.find((candidate) => candidate.toolId === card.toolId)!;
    const componentTokens = Object.fromEntries(ir.components.map((component) => [
      component.kind,
      tokens(`    ${NEUTRAL_TOOL_CARD_FIELD_LABELS[component.kind]}: ${component.content}`),
    ]));
    const decisionTokens = ir.components
      .filter((component) => ["purpose", "use-when", "limitations", "contrast"].includes(component.kind))
      .reduce((sum, component) => sum + tokens(component.content), 0);
    const contractTokens = ir.components
      .filter((component) => ["required-inputs", "returns", "execution"].includes(component.kind))
      .reduce((sum, component) => sum + tokens(component.content), 0);
    return {
      family: card.family,
      tool: card.toolId,
      v3CardTokens: tokens(v3Cards.find((candidate) => candidate.toolId === card.toolId)!.text),
      v4RnCardTokens: tokens(card.text),
      componentMask: TOOL_CARD_COMPONENTS.filter((kind) => CANONICAL_NEUTRAL_TOOL_CARD_MASK[kind]),
      componentTokens,
      decisionTokens,
      contractTokens,
    };
  });
  const familyStats = new Map<ToolPromptFamily, { total: number; decision: number; contract: number }>();
  for (const family of ["memory", "skill", "knowledge"] as const) {
    const rows = rawRows.filter((row) => row.family === family);
    familyStats.set(family, {
      total: median(rows.map((row) => row.v4RnCardTokens)),
      decision: median(rows.map((row) => row.decisionTokens)),
      contract: median(rows.map((row) => row.contractTokens)),
    });
  }
  const ledger = rawRows.map((row) => {
    const stats = familyStats.get(row.family)!;
    const materialLengthException = row.v4RnCardTokens > stats.total + 20;
    const contractExplainsDelta = row.contractTokens - stats.contract
      >= row.v4RnCardTokens - stats.total - 4;
    if (materialLengthException && !contractExplainsDelta && row.decisionTokens > stats.decision + 12) {
      throw new Error(`${row.tool} has an unexplained non-contract card-length imbalance`);
    }
    return {
      ...row,
      contractOnlyLengthException: materialLengthException && contractExplainsDelta
        ? `yes: contract components +${Math.round(row.contractTokens - stats.contract)} tokens vs family median`
        : "no",
      biasLint: "pass",
      symmetryLint: "pass",
    };
  });

  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve(".."), encoding: "utf8" }).trim();
  const sourceDate = execFileSync("git", ["show", "-s", "--format=%cI", sourceCommit], { cwd: resolve(".."), encoding: "utf8" }).trim();
  const manifest = {
    schemaVersion: 1,
    candidate: "V4-RN",
    profile: "neutral-symmetric",
    parentProfile: "capability-pruned",
    sourceCommit,
    generatedAt: sourceDate,
    rendererVersion: V4_RN_RENDERER_VERSION,
    capabilitySignature: CAPABILITY_SIGNATURE,
    tokenizer: "o200k_base",
    componentMask: CANONICAL_NEUTRAL_TOOL_CARD_MASK,
    onlyExperimentalFactor: "neutral, symmetric, componentized decision-card presentation",
    unchanged: {
      toolSet: true,
      runtimeContracts: true,
      canonicalOrder: true,
      capabilityProjection: true,
      data: true,
      scorer: true,
    },
    cacheIdentity: toolPromptCacheIdentity("candidate-capture", "neutral-symmetric", CAPABILITY_SIGNATURE),
    parentCacheIdentity: toolPromptCacheIdentity("candidate-capture", "capability-pruned", CAPABILITY_SIGNATURE),
    frozenV3: {
      byteIdentical: true,
      injectionTokens: tokens(v3.injection),
      injectionSha256: sha256(v3.injection),
      providerPromptSha256: sha256(v3.providerSystem),
    },
    candidateCapture: {
      fullInjectionTokens: tokens(run1.injection),
      deltaVsV3: tokens(run1.injection) - tokens(v3.injection),
      injectionSha256Run1: sha256(run1.injection),
      injectionSha256Run2: sha256(run2.injection),
      providerPromptSha256Run1: sha256(run1.providerSystem),
      providerPromptSha256Run2: sha256(run2.providerSystem),
      identical: true,
    },
    contractIds: run1.contractIds,
    toolIds: v4Order,
  };
  const semanticDiff = {
    schemaVersion: 1,
    parent: "V3",
    candidate: "V4-RN",
    singleFactor: manifest.onlyExperimentalFactor,
    canonicalOrderUnchanged: true,
    contractIdsUnchanged: JSON.stringify(v3.contractIds) === JSON.stringify(run1.contractIds),
    execution: executionDiff,
    dynamicBlocks: ["available_skills", "tdai_profile_memory"].map((blockId) => ({
      blockId,
      unchanged: v3.blocks.find((block) => block.blockId === blockId)?.content
        === run1.blocks.find((block) => block.blockId === blockId)?.content,
    })),
  };
  const inventory = v3Inventory(v3Cards);
  const visibleEdges = [...new Set(v4Cards.flatMap((card) => [
    ...card.body.matchAll(/\(([^)]+)\) vs /g),
  ].map((match) => match[1])))];
  const report = [
    "# V4-RN no-model evidence",
    "",
    `- Parent: \`V3 / capability-pruned\``,
    `- Candidate profile: \`neutral-symmetric\``,
    `- Capability: \`${CAPABILITY_SIGNATURE}\``,
    `- Tokenizer: \`o200k_base\``,
    `- Renderer: \`${V4_RN_RENDERER_VERSION}\``,
    "- Behavioral metrics: not run; this report contains structure, token, contract, and hash evidence only.",
    "",
    "## V3 inventory",
    "",
    "| Family | Tool | Order | Fields | Characters | Tokens | Bias markers | Contrast targets |",
    "| --- | --- | ---: | --- | ---: | ---: | --- | --- |",
    ...inventory.map((row) => {
      const record = row as Record<string, unknown>;
      const contrasts = record.contrasts as Array<{ otherTool: string }>;
      return `| ${markdownCell(record.family)} | ${markdownCell(record.tool)} | ${record.canonicalOrder} | ${markdownCell((record.fields as string[]).join(", "))} | ${record.characters} | ${record.tokensO200k} | ${markdownCell((record.biasMarkers as string[]).join(", ") || "none")} | ${markdownCell(contrasts.map((item) => item.otherTool).join(", ") || "none")} |`;
    }),
    "",
    "V3's full-readonly cards use optional response/avoid/contrast rows rather than one sibling skeleton. The visible V3 contrasts cover only the atomic-memory/conversation-search pair. V4-RN renders the same seven fields on every visible card and supplies bidirectional registered edges for: "
      + visibleEdges.map((edge) => `\`${edge}\``).join(", ") + ".",
    "",
    "## Card and component token ledger",
    "",
    "| Family | Tool | V3 card tokens | V4-RN card tokens | Purpose | Use when | Limitations | Contrast | Required inputs | Returns | Execution | Contract-only length exception | Bias lint | Symmetry lint |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...ledger.map((row) => `| ${row.family} | ${row.tool} | ${row.v3CardTokens} | ${row.v4RnCardTokens} | ${row.componentTokens.purpose} | ${row.componentTokens["use-when"]} | ${row.componentTokens.limitations} | ${row.componentTokens.contrast} | ${row.componentTokens["required-inputs"]} | ${row.componentTokens.returns} | ${row.componentTokens.execution} | ${markdownCell(row.contractOnlyLengthException)} | ${row.biasLint} | ${row.symmetryLint} |`),
    "",
    `Canonical component mask: \`${TOOL_CARD_COMPONENTS.filter((kind) => CANONICAL_NEUTRAL_TOOL_CARD_MASK[kind]).join("+")}\`. Component counts encode each complete rendered field line independently; tokenizer boundary effects make their sum diagnostic rather than a substitute for whole-card or full-injection encoding.`,
    "",
    "## Deterministic full-injection capture",
    "",
    "| Candidate | Full injection tokens | Delta vs V3 | SHA-256 run 1 | SHA-256 run 2 | Identical |",
    "| --- | ---: | ---: | --- | --- | --- |",
    `| V4-RN | ${manifest.candidateCapture.fullInjectionTokens} | ${manifest.candidateCapture.deltaVsV3 >= 0 ? "+" : ""}${manifest.candidateCapture.deltaVsV3} | \`${manifest.candidateCapture.injectionSha256Run1}\` | \`${manifest.candidateCapture.injectionSha256Run2}\` | yes |`,
    "",
    `Frozen V3 remains byte-identical at ${manifest.frozenV3.injectionTokens} tokens and SHA-256 \`${manifest.frozenV3.injectionSha256}\`. Tool ids, capability projection, contract ids, method/path/body/response facts, dynamic asset blocks, and canonical order are unchanged.`,
  ].join("\n");

  mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeFileSync(resolve(OUTPUT_ROOT, "v3-injection.txt"), v3.injection, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "injection-run-1.txt"), run1.injection, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "injection-run-2.txt"), run2.injection, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "prompt-run-1.txt"), run1.providerSystem, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "prompt-run-2.txt"), run2.providerSystem, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "v3-card-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "card-token-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "semantic-diff.json"), `${JSON.stringify(semanticDiff, null, 2)}\n`, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(resolve(OUTPUT_ROOT, "report.md"), `${report}\n`, "utf8");
  encoding.free();
  console.log(JSON.stringify(manifest.candidateCapture));
}

await main();
