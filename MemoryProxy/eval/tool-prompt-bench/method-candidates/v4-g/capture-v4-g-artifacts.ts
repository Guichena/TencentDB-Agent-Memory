import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get_encoding } from "tiktoken";
import type { KnowledgeItem } from "../../../../src/knowledge/core-client.js";
import { renderKnowledgeToolsBlock } from "../../../../src/injection/injectors/knowledge-tools-injector.js";
import { renderSkillToolsBlock } from "../../../../src/injection/injectors/skill-tools-injector.js";
import { wrapAvailableSkillsBlock } from "../../../../src/injection/injectors/skill-injector.js";
import {
  MEMORY_TOOLS_GUIDE,
  renderTdaiProfileMemoryBlock,
} from "../../../../src/injection/injectors/tdai-profile-memory-injector.js";
import { renderTdaiMemoryToolsBlock } from "../../../../src/injection/injectors/tdai-tools-injector.js";
import {
  buildCapabilitySignature,
  compileToolPrompt,
  getToolPromptProfileLineage,
  lintCapabilityPrunedSurface,
  toolPromptCacheIdentity,
  TOOL_PROMPT_COMPILER_VERSION,
  TYPED_ACTION_GRAPH_DEDUPLICATIONS,
  TYPED_ACTION_GRAPH_VERSION,
  usesCapabilityPruning,
  type ToolPromptFamily,
  type ToolPromptProfile,
  type ToolPromptSurface,
} from "../../../../src/injection/tool-prompt/index.js";

const BASELINE_COMMIT = "0373227c4b345c77f79ace5b0c19eb98e0fc50df";
const DEFAULT_OUTPUT_ROOT = resolve(
  "eval/tool-prompt-bench/method-candidates/v4-g/artifacts",
);
const OUTPUT_ROOT = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT_ROOT;
const FROZEN_PROFILE_ROOT = resolve("eval/tool-prompt-bench/variants/c05");
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

interface Block {
  blockId: string;
  content: string;
  dynamicPatterns: readonly RegExp[];
}

interface Capture {
  profile: ToolPromptProfile;
  injection: string;
  blocks: readonly Block[];
  totalInjectionTokens: number;
  totalInjectionSha256: string;
  staticToolTokens: number;
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function tokens(content: string): number {
  return encoding.encode(content).length;
}

function compileSurface(
  profile: ToolPromptProfile,
  family: ToolPromptFamily,
  surface: ToolPromptSurface,
  legacyContent: string,
): string {
  if (profile === "legacy") return legacyContent;
  return compileToolPrompt({
    profile,
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

function measureStaticTemplate(block: Block): number {
  let template = block.content;
  for (const pattern of block.dynamicPatterns) {
    template = template.replace(pattern, `{{dynamic:${block.blockId}}}`);
  }
  const placeholders = [
    "<proxy-origin>",
    "<session-id>",
    "<space-id>",
    "<user-id>",
    "<team-id>",
    "<agent-id>",
    "<agent-source>",
  ];
  Object.values(CANONICAL).forEach((value, index) => {
    template = template.split(value).join(placeholders[index]);
  });
  return tokens(template);
}

function render(profile: ToolPromptProfile): Capture {
  const memoryTools = compileSurface(
    profile,
    "memory",
    "memory-tools",
    renderTdaiMemoryToolsBlock(CANONICAL.proxyOrigin, CANONICAL.sessionId, CANONICAL.spaceId),
  );
  const skillTools = compileSurface(
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
  const knowledgeTools = compileSurface(profile, "knowledge", "knowledge-tools", legacyKnowledge);
  const memoryGuide = compileSurface(profile, "memory", "memory-guide", MEMORY_TOOLS_GUIDE);
  const profileMemory = renderTdaiProfileMemoryBlock([{
    agentName: "task1-agent",
    agentId: CANONICAL.agentId,
    isSelf: true,
    l3Content: "Prefers evidence-backed prompt changes.",
    l2Entries: [{ path: "task1/compiler.md", summary: "Compiler implementation decisions" }],
  }], memoryGuide).content;

  const bundle = {
    "memory-tools": memoryTools,
    "memory-guide": memoryGuide,
    "skill-tools": skillTools,
    "skill-listing": skillListing,
    "knowledge-tools": knowledgeTools,
  };
  if (usesCapabilityPruning(profile)) {
    lintCapabilityPrunedSurface(bundle, CAPABILITY_SIGNATURE);
  }

  const blocks: Block[] = [
    { blockId: "skill_tools", content: skillTools, dynamicPatterns: [] },
    {
      blockId: "available_skills",
      content: skillListing,
      dynamicPatterns: [/<available_skills>[\s\S]*?<\/available_skills>/g],
    },
    {
      blockId: "knowledge_tools",
      content: knowledgeTools,
      dynamicPatterns: [/<knowledge type="[^"]+"[\s\S]*? \/>/g],
    },
    { blockId: "tdai_memory_tools", content: memoryTools, dynamicPatterns: [] },
    {
      blockId: "tdai_profile_memory",
      content: profileMemory,
      dynamicPatterns: [/<tdai_profile_memory>[\s\S]*?<\/tdai_profile_memory>/g],
    },
  ];
  const injection = blocks.map((block) => block.content).join("\n");
  return {
    profile,
    injection,
    blocks,
    totalInjectionTokens: tokens(injection),
    totalInjectionSha256: sha256(injection),
    staticToolTokens: blocks.reduce((sum, block) => sum + measureStaticTemplate(block), 0),
  };
}

function stableManifest(
  capture: Capture,
  parent: ToolPromptProfile,
  v3: Capture,
): Record<string, unknown> {
  if (
    capture.profile !== "typed-action-graph"
    && capture.profile !== "typed-action-graph-deduplicated"
  ) {
    throw new Error(`cannot write candidate manifest for ${capture.profile}`);
  }
  return {
    schemaVersion: 1,
    method: "V4-G Typed Action Graph",
    candidate: capture.profile === "typed-action-graph" ? "V4-G1" : "V4-G2",
    profile: capture.profile,
    parent,
    profileLineage: getToolPromptProfileLineage(capture.profile),
    baselineCommit: BASELINE_COMMIT,
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    actionGraphVersion: TYPED_ACTION_GRAPH_VERSION,
    capabilitySignature: CAPABILITY_SIGNATURE,
    tokenizer: "o200k_base",
    componentTokenAccounting:
      "staticToolTokens is diagnostic and non-additive; totalInjectionTokens is authoritative.",
    totalInjectionTokens: capture.totalInjectionTokens,
    totalInjectionSha256: capture.totalInjectionSha256,
    staticToolTokens: capture.staticToolTokens,
    deltaVsV3: {
      totalInjectionTokens: capture.totalInjectionTokens - v3.totalInjectionTokens,
      staticToolTokens: capture.staticToolTokens - v3.staticToolTokens,
    },
    cacheIdentity: toolPromptCacheIdentity(
      "tool-prompt-bench-v4-g",
      capture.profile,
      CAPABILITY_SIGNATURE,
    ),
    deterministicRerun: true,
    blockSha256: Object.fromEntries(
      capture.blocks.map((block) => [block.blockId, sha256(block.content)]),
    ),
  };
}

function assertSameCapture(first: Capture, second: Capture): void {
  if (first.injection !== second.injection) {
    throw new Error(`${first.profile} independent renders differ`);
  }
  if (first.totalInjectionTokens !== second.totalInjectionTokens) {
    throw new Error(`${first.profile} independent token counts differ`);
  }
  const firstBlocks = first.blocks.map((block) => [block.blockId, sha256(block.content)]);
  const secondBlocks = second.blocks.map((block) => [block.blockId, sha256(block.content)]);
  if (JSON.stringify(firstBlocks) !== JSON.stringify(secondBlocks)) {
    throw new Error(`${first.profile} independent block hashes differ`);
  }
}

function actionGraphBytes(capture: Capture): readonly string[] {
  return capture.injection.match(/<typed_action_graph[\s\S]*?<\/typed_action_graph>/g) ?? [];
}

function writeCandidate(capture: Capture, manifest: Record<string, unknown>): void {
  const directory = resolve(OUTPUT_ROOT, capture.profile, "full-readonly");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "injection.txt"), capture.injection, "utf8");
  writeFileSync(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function assertFrozenHistorical(capture: Capture): void {
  const directory = resolve(FROZEN_PROFILE_ROOT, capture.profile, "full-readonly");
  const frozenInjection = readFileSync(resolve(directory, "injection.txt"), "utf8");
  const frozenManifest = JSON.parse(
    readFileSync(resolve(directory, "manifest.json"), "utf8"),
  ) as { totalInjectionTokens: number; totalInjectionSha256: string; staticToolTokens: number };
  if (capture.injection !== frozenInjection) {
    throw new Error(`current ${capture.profile} bytes differ from frozen C05`);
  }
  if (
    capture.totalInjectionTokens !== frozenManifest.totalInjectionTokens
    || capture.totalInjectionSha256 !== frozenManifest.totalInjectionSha256
    || capture.staticToolTokens !== frozenManifest.staticToolTokens
  ) {
    throw new Error(`current ${capture.profile} token/hash accounting differs from frozen C05`);
  }
}

function main(): void {
  try {
    const historicalProfiles = [
      "legacy",
      "contract-corrected",
      "protocol-compact",
      "compact",
      "selection-calibrated",
      "capability-pruned",
    ] as const satisfies readonly ToolPromptProfile[];
    const historical = historicalProfiles.map((profile) => render(profile));
    historical.forEach(assertFrozenHistorical);
    const v3 = historical.at(-1)!;

    const g1 = render("typed-action-graph");
    const g1Rerun = render("typed-action-graph");
    const g2 = render("typed-action-graph-deduplicated");
    const g2Rerun = render("typed-action-graph-deduplicated");
    assertSameCapture(g1, g1Rerun);
    assertSameCapture(g2, g2Rerun);
    if (JSON.stringify(actionGraphBytes(g1)) !== JSON.stringify(actionGraphBytes(g2))) {
      throw new Error("G2 changed typed action graph bytes instead of only covered prose");
    }

    const g1Manifest = stableManifest(g1, "capability-pruned", v3);
    const g2Manifest = stableManifest(g2, "typed-action-graph", v3);
    writeCandidate(g1, g1Manifest);
    writeCandidate(g2, g2Manifest);
    const rows = [
      {
        candidate: "V3",
        parent: "selection-calibrated",
        profile: "capability-pruned",
        fullInjectionTokens: v3.totalInjectionTokens,
        staticToolTokens: v3.staticToolTokens,
        deltaVsV3: 0,
        sha256: v3.totalInjectionSha256,
        deterministicRerun: true,
        frozenC05Parity: true,
      },
      ...[
        { name: "V4-G1", parent: "V3", capture: g1, rerun: g1Rerun },
        { name: "V4-G2", parent: "V4-G1", capture: g2, rerun: g2Rerun },
      ].map(({ name, parent, capture, rerun }) => ({
        candidate: name,
        parent,
        profile: capture.profile,
        fullInjectionTokens: capture.totalInjectionTokens,
        staticToolTokens: capture.staticToolTokens,
        deltaVsV3: capture.totalInjectionTokens - v3.totalInjectionTokens,
        staticDeltaVsV3: capture.staticToolTokens - v3.staticToolTokens,
        sha256: capture.totalInjectionSha256,
        deterministicRerun: capture.totalInjectionSha256 === rerun.totalInjectionSha256,
        frozenC05Parity: null,
      })),
    ];
    mkdirSync(OUTPUT_ROOT, { recursive: true });
    writeFileSync(
      resolve(OUTPUT_ROOT, "comparison.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        baselineCommit: BASELINE_COMMIT,
        capabilitySignature: CAPABILITY_SIGNATURE,
        tokenizer: "o200k_base",
        modelRuns: 0,
        behaviorMetrics: null,
        historicalProfileParity: Object.fromEntries(
          historical.map((capture) => [capture.profile, true]),
        ),
        rows,
      }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      resolve(OUTPUT_ROOT, "g1-to-g2-diff.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        parent: "V4-G1",
        candidate: "V4-G2",
        invariant: "typed action graph bytes are unchanged; only listed covered prose is replaced",
        replacements: TYPED_ACTION_GRAPH_DEDUPLICATIONS,
        fullInjectionTokenDelta: g2.totalInjectionTokens - g1.totalInjectionTokens,
        staticToolTokenDelta: g2.staticToolTokens - g1.staticToolTokens,
        parentSha256: g1.totalInjectionSha256,
        candidateSha256: g2.totalInjectionSha256,
      }, null, 2)}\n`,
      "utf8",
    );
    console.log(`captured deterministic V4-G artifacts in ${OUTPUT_ROOT}`);
  } finally {
    encoding.free();
  }
}

main();
