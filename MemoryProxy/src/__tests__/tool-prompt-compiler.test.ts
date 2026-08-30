import { describe, expect, it, vi } from "vitest";
import { parseCurlCommand } from "../../eval/tool-prompt-bench/protocol-harness.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { HookCacheEntry, HookCacheRepo } from "../db/hookCacheRepo.js";
import { AnthropicAdapter } from "../injection/adapters/anthropic.js";
import type { ProtocolAdapter } from "../injection/adapters/interface.js";
import { OpenAIAdapter } from "../injection/adapters/openai.js";
import { ClaudeCodeProfile } from "../injection/agents/claude-code/index.js";
import { CodeBuddyProfile } from "../injection/agents/codebuddy/profile.js";
import type { AgentProfile } from "../injection/agents/interface.js";
import { PiProfile } from "../injection/agents/pi/profile.js";
import { WorkbuddyProfile } from "../injection/agents/workbuddy/profile.js";
import { MEMORY_BRIDGE_ALLOWED_SUBPATHS } from "../memory/memory-bridge.js";
import { SKILL_BRIDGE_ALLOWED_SUBPATHS, SKILL_BRIDGE_WRITE_SUBPATHS } from "../skill/skill-bridge.js";
import { renderKnowledgeToolsBlock } from "../injection/injectors/knowledge-tools-injector.js";
import { wrapAvailableSkillsBlock } from "../injection/injectors/skill-injector.js";
import {
  renderSkillToolsBlock,
  SkillToolsInjector,
} from "../injection/injectors/skill-tools-injector.js";
import { MEMORY_TOOLS_GUIDE } from "../injection/injectors/tdai-profile-memory-injector.js";
import { renderTdaiMemoryToolsBlock } from "../injection/injectors/tdai-tools-injector.js";
import { prewarmAll } from "../injection/prewarm.js";
import { InjectionPipeline } from "../injection/pipeline.js";
import { HookRegistryImpl } from "../injection/registry.js";
import type { AnchorTarget, InjectionPoint, Protocol } from "../injection/types.js";
import {
  applyContractFlowOrdering,
  applySemanticDeduplication,
  buildCapabilitySignature,
  buildTypedSignatureProgram,
  CAPABILITY_PRUNING_INVENTORY,
  compareTscgContracts,
  compileToolPrompt,
  decodeTscgField,
  encodeTscgField,
  constrainCapabilitySignature,
  CONTRACT_CORRECTIONS,
  coordinateToolPromptSurface,
  coordinateToolPromptSurfaceFromCapabilitySignature,
  getRuntimeToolContracts,
  getToolPromptProfileLineage,
  getVisibleRuntimeToolContracts,
  getVisibleTscgDependencyEdges,
  lintCapabilityPrunedSurface,
  lintDuplicateSemanticUnits,
  lintSelectionPolicy,
  lintTscgCapabilityProjection,
  parseToolPromptProfile,
  parseCapabilitySignature,
  resolveSessionCapabilitySignature,
  roundTripDroProgram,
  SELECTION_POLICY_INVENTORY,
  SEMANTIC_UNIT_INVENTORY,
  toolPromptCacheIdentity,
  TSCG_LITE_PROFILES,
  TSCG_SIGNATURE_FIELD_ORDER,
  stableTopologicalOrder,
  TOOL_PROMPT_PROFILES,
  type CompiledToolPromptProfile,
  type CapabilitySurfaceBundle,
  type SelectionSurfaceBundle,
  type ToolPromptCapabilityState,
} from "../injection/tool-prompt/index.js";
import { MEMORY_TOOL_PROMPT_SPECS } from "../injection/tool-prompt/specs/memory.js";
import { SKILL_TOOL_PROMPT_SPECS } from "../injection/tool-prompt/specs/skill.js";

const CAPABILITY_SIGNATURE = buildCapabilitySignature({
  memory: true,
  skill: true,
  knowledge: true,
  wiki: true,
  codeGraph: true,
  skillWrite: false,
  skillExtract: false,
});

const COMPILED_PROFILES = TOOL_PROMPT_PROFILES.filter(
  (profile): profile is Exclude<(typeof TOOL_PROMPT_PROFILES)[number], "legacy"> =>
    profile !== "legacy",
);

interface AgentParityCase {
  agentSource: string;
  protocol: Protocol;
  profile: AgentProfile | null;
  system: string;
}

const KNOWLEDGE_FIXTURE = [{
  knowledge_id: "code-graph-1",
  type: "code-graph" as const,
  name: "MemoryProxy",
  summary: "Indexed repository",
  service_url: "http://127.0.0.1:8421/v3",
  team_id: "team-1",
  user_id: null,
  repo_url: "https://github.com/TencentDB/TencentDB-Agent-Memory.git",
  branch: "main",
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
}];

const KNOWLEDGE_CAPABILITY_FIXTURE = [
  ...KNOWLEDGE_FIXTURE,
  {
    knowledge_id: "wiki-1",
    type: "wiki" as const,
    name: "Task 1 decisions",
    summary: "Prompt optimization rationale and prior decisions",
    service_url: "http://127.0.0.1:8421/v3",
    team_id: "team-1",
    user_id: null,
    created_at: "2026-08-28T00:00:00.000Z",
    updated_at: "2026-08-28T00:00:00.000Z",
  },
];

function renderProductionFamilyBlocks(allowLlmWrite = false): {
  memory: string;
  skill: string;
  knowledge: string;
} {
  const knowledge = renderKnowledgeToolsBlock(
    KNOWLEDGE_FIXTURE,
    "space-parity",
    { sessionKey: "session-parity" },
  );
  if (!knowledge) throw new Error("knowledge fixture must render a prompt block");
  return {
    memory: renderTdaiMemoryToolsBlock(
      "http://127.0.0.1:8096",
      "session-parity",
      "space-parity",
    ),
    skill: renderSkillToolsBlock(
      "http://127.0.0.1:8096",
      allowLlmWrite,
      "session-parity",
      "space-parity",
    ),
    knowledge,
  };
}

const AGENT_PARITY_CASES: readonly AgentParityCase[] = [
  {
    agentSource: "codebuddy",
    protocol: "openai",
    profile: new CodeBuddyProfile(),
    system: "CodeBuddy\n<mcp_protocol>tools</mcp_protocol>\n<agent_skills>skills</agent_skills>\n<memories>memory</memories>",
  },
  {
    agentSource: "claude-code",
    protocol: "anthropic",
    profile: new ClaudeCodeProfile(),
    system: "Claude Code\n# Harness\nrules\n# Session-specific guidance\nskills\n# Memory\nmemory\n# Environment\nenv",
  },
  {
    agentSource: "workbuddy",
    protocol: "openai",
    profile: new WorkbuddyProfile(),
    system: "WorkBuddy\n<mcp_configuration>tools</mcp_configuration>\n<agent_skills>skills</agent_skills>\n<workbuddy_memory_slot_1>memory</workbuddy_memory_slot_1>",
  },
  {
    agentSource: "pi",
    protocol: "openai",
    profile: new PiProfile(),
    system: "You are operating inside pi, a coding agent harness.\nAvailable tools:\nterminal\nGuidelines:\nbe precise\n<project_context>\nrepo\n</project_context>",
  },
  {
    agentSource: "codex",
    protocol: "openai",
    profile: null,
    system: "Generic provider prompt without a known anchor.",
  },
];

function registerParityHook(
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
    description: "C00 provider-visible parity fixture",
    execute: () => [{ type: "text", content }],
  });
}

async function renderProviderParityPrompt(
  agent: AgentParityCase,
  profile: "legacy" | CompiledToolPromptProfile,
  withTask: boolean,
): Promise<Record<string, unknown>> {
  const registry = new HookRegistryImpl();
  const familyBlocks = renderProductionFamilyBlocks();
  const content = (family: keyof typeof familyBlocks): string => {
    const frozen = familyBlocks[family];
    if (profile === "legacy") return frozen;
    return compileToolPrompt({
      profile,
      family,
      surface: family === "skill"
        ? "skill-tools"
        : family === "memory"
          ? "memory-tools"
          : "knowledge-tools",
      legacyUnits: [{
        id: `${family}.legacy-body`,
        kind: "legacy-body",
        content: frozen,
      }],
      capabilitySignature: CAPABILITY_SIGNATURE,
    }).content;
  };
  registerParityHook(
    registry,
    "skill-tools-injector",
    "system.before_tools",
    199,
    { slot: "skills", relation: "before" },
    content("skill"),
  );
  registerParityHook(
    registry,
    "knowledge-tools-injector",
    "system.before_tools",
    300,
    { slot: "knowledge", relation: "after" },
    content("knowledge"),
  );
  registerParityHook(
    registry,
    "tdai-memory-tools-injector",
    "system.suffix",
    105,
    { slot: "memory", relation: "before" },
    content("memory"),
  );

  const adapters = new Map<Protocol, ProtocolAdapter>([
    ["openai", new OpenAIAdapter()],
    ["anthropic", new AnthropicAdapter()],
  ]);
  const agentProfiles = agent.profile
    ? new Map([[agent.agentSource, agent.profile]])
    : new Map<string, AgentProfile>();
  const pipeline = new InjectionPipeline(registry, adapters, { agentProfiles });
  const session = {
    session_id: "session-parity",
    space_id: "space-parity",
    user_id: "user-parity",
    team_id: "team-parity",
    agent_id: "agent-parity",
    ...(withTask ? { task_id: "task-parity" } : {}),
  };
  const body = agent.protocol === "anthropic"
    ? {
        system: agent.system,
        messages: [{ role: "user", content: "hello" }],
        model: "parity-model",
      }
    : {
        messages: [
          { role: "system", content: agent.system },
          { role: "user", content: "hello" },
        ],
        model: "parity-model",
      };
  return pipeline.process(body, {
    protocol: agent.protocol,
    traceId: `parity:${agent.agentSource}`,
    keyId: "parity",
    modelId: "parity-model",
    stream: false,
    agentSource: agent.agentSource,
    userId: "user-parity",
    spaceId: "space-parity",
    sessionKey: "session-parity",
    custom: { session },
  });
}

describe("tool prompt compiler C00-C05 and TSCG-lite", () => {
  it("keeps legacy as the default and rejects unknown profile names", () => {
    expect(DEFAULT_CONFIG.injection.toolPromptProfile).toBe("legacy");
    expect(parseToolPromptProfile("capability-pruned")).toBe("capability-pruned");
    expect(() => parseToolPromptProfile("minimal")).toThrow(/invalid injection\.toolPromptProfile/);
  });

  it("freezes the recursive profile lineage", () => {
    expect(getToolPromptProfileLineage("capability-pruned")).toEqual([
      "legacy",
      "contract-corrected",
      "protocol-compact",
      "compact",
      "selection-calibrated",
      "capability-pruned",
    ]);
  });

  it("keeps completed ancestors frozen and isolates the C01 through C05 renderer boundaries", () => {
    const blocks = renderProductionFamilyBlocks(true);
    const correctedByFamily = new Map<string, string>();
    const protocolByFamily = new Map<string, string>();
    const semanticByFamily = new Map<string, string>();
    const selectionByFamily = new Map<string, string>();
    const capabilityByFamily = new Map<string, string>();

    for (const profile of COMPILED_PROFILES) {
      for (const [family, content] of Object.entries(blocks) as Array<
        ["memory" | "skill" | "knowledge", string]
      >) {
        const surface = family === "memory"
          ? "memory-tools"
          : family === "skill"
            ? "skill-tools"
            : "knowledge-tools";
        const compiled = compileToolPrompt({
          profile,
          family,
          surface,
          legacyUnits: [{
            id: `${family}.legacy-body`,
            kind: "legacy-body",
            content,
          }],
          capabilitySignature: CAPABILITY_SIGNATURE,
        });
        expect(compiled.contractIds.length).toBeGreaterThan(0);
        expect(compiled.contractIds).toEqual(compiled.specIds);

        if (profile === "contract-corrected") {
          expect(compiled.units).toHaveLength(1);
          correctedByFamily.set(family, compiled.content);
          if (family === "memory") expect(compiled.content).toBe(content);
          else expect(compiled.content).not.toBe(content);
        } else if (profile === "protocol-compact") {
          protocolByFamily.set(family, compiled.content);
          expect(compiled.content).not.toBe(correctedByFamily.get(family));
          expect(compiled.units).toHaveLength(family === "memory" ? 3 : 1);
        } else if (profile === "compact") {
          semanticByFamily.set(family, compiled.content);
          if (family === "knowledge") {
            expect(compiled.content).toBe(protocolByFamily.get(family));
          } else {
            expect(compiled.content).not.toBe(protocolByFamily.get(family));
          }
          expect(compiled.units).toHaveLength(family === "memory" ? 3 : 1);
        } else if (profile === "selection-calibrated") {
          selectionByFamily.set(family, compiled.content);
          expect(compiled.content).not.toBe(semanticByFamily.get(family));
          expect(compiled.units).toHaveLength(family === "memory" ? 4 : 1);
        } else {
          capabilityByFamily.set(family, compiled.content);
          if (family === "knowledge") {
            expect(compiled.content).toBe(selectionByFamily.get(family));
          } else {
            expect(compiled.content).not.toBe(selectionByFamily.get(family));
          }
          expect(compiled.units).toHaveLength(family === "memory" ? 4 : 1);
          expect(compiled.contractIds).toEqual(
            getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE, family).map(
              (contract) => contract.id,
            ),
          );
          expect(compiled.specIds).toEqual(compiled.contractIds);
        }
      }
    }

    const correctedSkill = correctedByFamily.get("skill") ?? "";
    expect(correctedSkill).toContain('<tool name="skill_view_by_id">');
    expect(correctedSkill).toContain('<tool name="skill_files_download">');
    expect(correctedSkill.match(/"expected_version": 3/g)).toHaveLength(5);
    expect(correctedSkill).toContain("按 BM25 关键词检索匹配项");
    expect(correctedSkill).toContain("物理删除该 skill 的全部版本");
    expect(correctedSkill).toContain("skill_id / version 不存在");
    expect(correctedSkill).not.toContain("proxy 会返回原始字节直接写入文件");
    expect(correctedSkill).not.toContain("软删（archived；不递增版本）");

    const correctedKnowledge = correctedByFamily.get("knowledge") ?? "";
    expect(correctedKnowledge).toContain("node（includeCode=true）");
    expect(correctedKnowledge).toContain("search 只按符号名定位");

    const compactMemory = protocolByFamily.get("memory") ?? "";
    const compactSkill = protocolByFamily.get("skill") ?? "";
    const compactKnowledge = protocolByFamily.get("knowledge") ?? "";
    const combined = `${compactSkill}\n${compactKnowledge}\n${compactMemory}`;
    expect(combined.match(/## 统一工具调用协议/g)).toHaveLength(1);
    expect(combined.match(/canonical form:/g)).toHaveLength(1);
    expect(combined.match(/curl -sSk -X POST/g)).toHaveLength(1);
    expect(compactMemory).toContain("endpoint-base: http://127.0.0.1:8096/memory-bridge/v3");
    expect(compactMemory).toContain("path: /atomic/search");
    expect(compactMemory).not.toContain("## 完整示例");
    expect(compactSkill).toContain("endpoint-base: http://127.0.0.1:8096/skill-bridge/v3/skill");
    expect(compactSkill).toContain("path: /get-by-name");
    expect(compactSkill).not.toContain("错误处理：响应是");
    expect(compactKnowledge).toContain('<tool name="knowledge_tools_list">');
    expect(compactKnowledge).toContain("path: /tools/call");
    expect(compactKnowledge).not.toContain("### Step 1:");

    const semanticMemory = semanticByFamily.get("memory") ?? "";
    const semanticSkill = semanticByFamily.get("skill") ?? "";
    const semanticKnowledge = semanticByFamily.get("knowledge") ?? "";
    const extractToolNames = (content: string): string[] => [
      ...content.matchAll(/<tool name="([^"]+)">/g),
    ].map((match) => match[1]);
    expect(extractToolNames(semanticMemory)).toEqual(extractToolNames(compactMemory));
    expect(extractToolNames(semanticSkill)).toEqual(extractToolNames(compactSkill));
    expect(extractToolNames(semanticKnowledge)).toEqual(extractToolNames(compactKnowledge));
    expect(`${semanticSkill}\n${semanticKnowledge}\n${semanticMemory}`.length).toBeLessThan(combined.length);

    const selectionMemory = selectionByFamily.get("memory") ?? "";
    const selectionSkill = selectionByFamily.get("skill") ?? "";
    const selectionKnowledge = selectionByFamily.get("knowledge") ?? "";
    const extractExecution = (content: string): Array<{
      name: string;
      path: string;
      body: string;
    }> => [...content.matchAll(
      /<tool name="([^"]+)">\n\s+path: (.+)\n\s+body: (.+)$/gm,
    )].map((match) => ({ name: match[1], path: match[2], body: match[3] }));
    expect(extractExecution(selectionMemory)).toEqual(extractExecution(semanticMemory));
    expect(extractExecution(selectionSkill)).toEqual(extractExecution(semanticSkill));
    expect(extractExecution(selectionKnowledge)).toEqual(extractExecution(semanticKnowledge));
    expect(`${selectionSkill}\n${selectionKnowledge}\n${selectionMemory}`)
      .toContain("## Tool / no-tool gate");
    expect(`${selectionSkill}\n${selectionKnowledge}\n${selectionMemory}`)
      .not.toContain("    use: ");
    expect(selectionSkill).toContain("all of its versions must be physically deleted");
    expect(selectionSkill).not.toContain("must be archived");

    const capabilitySkill = capabilityByFamily.get("skill") ?? "";
    expect(capabilitySkill).not.toContain('<tool name="skill_extract">');
    expect(capabilitySkill).not.toMatch(
      /<tool name="skill_(?:create|update|patch|delete|files_write|files_remove)">/,
    );
    expect(capabilityByFamily.get("memory")).toContain(
      "- skill: missing reusable workflow instructions clearly matched by a listed/team skill;",
    );
  });

  it("assigns every C03 duplicate semantic unit to exactly one retained owner", () => {
    const blocks = renderProductionFamilyBlocks(true);
    const compile = (
      family: "memory" | "skill" | "knowledge",
      surface: "memory-tools" | "memory-guide" | "skill-tools" | "knowledge-tools",
      content: string,
    ): string => compileToolPrompt({
      profile: "compact",
      family,
      surface,
      legacyUnits: [{ id: `${surface}.fixture`, kind: "legacy-body", content }],
      capabilitySignature: CAPABILITY_SIGNATURE,
    }).content;
    const bundle = {
      "memory-tools": compile("memory", "memory-tools", blocks.memory),
      "memory-guide": compile("memory", "memory-guide", MEMORY_TOOLS_GUIDE),
      "skill-tools": compile("skill", "skill-tools", blocks.skill),
      "skill-listing": wrapAvailableSkillsBlock(
        "<available_skills>\n<skill><name>review</name></skill>\n</available_skills>",
        "compact",
        CAPABILITY_SIGNATURE,
      ),
      "knowledge-tools": compile("knowledge", "knowledge-tools", blocks.knowledge),
    };

    expect(new Set(SEMANTIC_UNIT_INVENTORY.map((item) => item.id)).size)
      .toBe(SEMANTIC_UNIT_INVENTORY.length);
    expect(() => lintDuplicateSemanticUnits(bundle)).not.toThrow();
    expect(bundle["memory-tools"]).toContain("HTTP 5xx 可一次性 retry；HTTP 4xx 不要重试");
    expect(bundle["skill-listing"]).toContain("不能用 read_file / tool_use 访问");
    expect(bundle["knowledge-tools"]).toContain("每个资源每会话最多一次");
    expect(bundle["knowledge-tools"]).toContain("不要全量 list_pages");
  });

  it("keeps the C04 selection policy neutral while preserving dynamic skill assets", () => {
    const blocks = renderProductionFamilyBlocks(true);
    const listing = [
      "<available_skills>",
      "- review: Review this repository",
      "- testing: Run contract tests",
      "</available_skills>",
    ].join("\n");
    const compile = (
      family: "memory" | "skill" | "knowledge",
      surface: "memory-tools" | "memory-guide" | "skill-tools" | "knowledge-tools",
      content: string,
    ): string => compileToolPrompt({
      profile: "selection-calibrated",
      family,
      surface,
      legacyUnits: [{ id: `${surface}.fixture`, kind: "legacy-body", content }],
      capabilitySignature: CAPABILITY_SIGNATURE,
    }).content;
    const skillListing = wrapAvailableSkillsBlock(
      listing,
      "selection-calibrated",
      CAPABILITY_SIGNATURE,
    );
    const bundle = {
      "memory-tools": compile("memory", "memory-tools", blocks.memory),
      "memory-guide": compile("memory", "memory-guide", MEMORY_TOOLS_GUIDE),
      "skill-tools": compile("skill", "skill-tools", blocks.skill),
      "skill-listing": skillListing,
      "knowledge-tools": compile("knowledge", "knowledge-tools", blocks.knowledge),
    };

    expect(new Set(SELECTION_POLICY_INVENTORY.map((item) => item.id)).size)
      .toBe(SELECTION_POLICY_INVENTORY.length);
    expect(() => lintSelectionPolicy(bundle, CAPABILITY_SIGNATURE)).not.toThrow();
    expect(skillListing.match(/<available_skills>[\s\S]*?<\/available_skills>/)?.[0])
      .toBe(listing);
    expect(skillListing).toContain("## Available skills");
    expect(skillListing).not.toContain("mandatory");
    expect(skillListing).not.toContain("partially relevant");
    expect(bundle["memory-guide"]).toContain("## Memory constraints");
    expect(bundle["knowledge-tools"]).not.toContain("凡是需要跨文件");
  });

  it("keeps V3 byte-identical to V2 when every production capability is enabled", () => {
    const signature = buildCapabilitySignature({
      memory: true,
      skill: true,
      knowledge: true,
      wiki: true,
      codeGraph: true,
      skillWrite: true,
      skillExtract: true,
    });
    const blocks = renderProductionFamilyBlocks(true);
    const knowledge = renderKnowledgeToolsBlock(
      KNOWLEDGE_CAPABILITY_FIXTURE,
      "space-parity",
      { sessionKey: "session-parity" },
    );
    if (!knowledge) throw new Error("full-capability knowledge fixture must render");
    const listing = "<available_skills>\n- review: Review this repository\n</available_skills>";
    const surfaces = [
      { family: "memory", surface: "memory-tools", content: blocks.memory },
      { family: "memory", surface: "memory-guide", content: MEMORY_TOOLS_GUIDE },
      { family: "skill", surface: "skill-tools", content: blocks.skill },
      { family: "knowledge", surface: "knowledge-tools", content: knowledge },
    ] as const;

    for (const item of surfaces) {
      const compile = (profile: "selection-calibrated" | "capability-pruned") =>
        compileToolPrompt({
          profile,
          family: item.family,
          surface: item.surface,
          legacyUnits: [{
            id: `${item.surface}.full-capability`,
            kind: "legacy-body",
            content: item.content,
          }],
          capabilitySignature: signature,
        }).content;
      expect(compile("capability-pruned")).toBe(compile("selection-calibrated"));
    }
    expect(wrapAvailableSkillsBlock(listing, "capability-pruned", signature))
      .toBe(wrapAvailableSkillsBlock(listing, "selection-calibrated", signature));
  });

  it("projects the C05 prompt onto each production-supported capability matrix row", () => {
    const rows: Array<{ id: string; state: ToolPromptCapabilityState }> = [
      {
        id: "full-readonly",
        state: { memory: true, skill: true, knowledge: true, wiki: true, codeGraph: true, skillWrite: false, skillExtract: false },
      },
      {
        id: "full-write-extract",
        state: { memory: true, skill: true, knowledge: true, wiki: true, codeGraph: true, skillWrite: true, skillExtract: true },
      },
      {
        id: "memory-only",
        state: { memory: true, skill: false, knowledge: false, wiki: false, codeGraph: false, skillWrite: false, skillExtract: false },
      },
      {
        id: "skill-readonly",
        state: { memory: false, skill: true, knowledge: false, wiki: false, codeGraph: false, skillWrite: false, skillExtract: false },
      },
      {
        id: "skill-write",
        state: { memory: false, skill: true, knowledge: false, wiki: false, codeGraph: false, skillWrite: true, skillExtract: false },
      },
      {
        id: "skill-extract",
        state: { memory: false, skill: true, knowledge: false, wiki: false, codeGraph: false, skillWrite: false, skillExtract: true },
      },
      {
        id: "wiki-only",
        state: { memory: false, skill: false, knowledge: true, wiki: true, codeGraph: false, skillWrite: false, skillExtract: false },
      },
      {
        id: "code-graph-only",
        state: { memory: false, skill: false, knowledge: true, wiki: false, codeGraph: true, skillWrite: false, skillExtract: false },
      },
      {
        id: "skill-and-wiki",
        state: { memory: false, skill: true, knowledge: true, wiki: true, codeGraph: false, skillWrite: false, skillExtract: false },
      },
    ];
    const listing = "<available_skills>\n- review: Review this repository\n</available_skills>";
    const memory = renderProductionFamilyBlocks().memory;
    const knowledge = renderKnowledgeToolsBlock(
      KNOWLEDGE_CAPABILITY_FIXTURE,
      "space-parity",
      { sessionKey: "session-parity" },
    );
    if (!knowledge) throw new Error("capability knowledge fixture must render");

    for (const { id, state } of rows) {
      const signature = buildCapabilitySignature(state);
      const bundle: CapabilitySurfaceBundle = {};
      const compile = (
        family: "memory" | "skill" | "knowledge",
        surface: "memory-tools" | "memory-guide" | "skill-tools" | "knowledge-tools",
        content: string,
      ): string => compileToolPrompt({
        profile: "capability-pruned",
        family,
        surface,
        legacyUnits: [{ id: `${id}.${surface}`, kind: "legacy-body", content }],
        capabilitySignature: signature,
      }).content;

      if (state.memory) {
        bundle["memory-tools"] = compile("memory", "memory-tools", memory);
        bundle["memory-guide"] = compile("memory", "memory-guide", MEMORY_TOOLS_GUIDE);
      }
      if (state.skill) {
        const skillTools = renderSkillToolsBlock(
          "http://127.0.0.1:8096",
          state.skillWrite,
          "session-parity",
          "space-parity",
        );
        bundle["skill-tools"] = compile("skill", "skill-tools", skillTools);
        bundle["skill-listing"] = wrapAvailableSkillsBlock(
          listing,
          "capability-pruned",
          signature,
        );
        expect(bundle["skill-listing"]?.match(
          /<available_skills>[\s\S]*?<\/available_skills>/,
        )?.[0]).toBe(listing);
      }
      if (state.knowledge) {
        bundle["knowledge-tools"] = compile("knowledge", "knowledge-tools", knowledge);
      }

      expect(() => lintCapabilityPrunedSurface(bundle, signature)).not.toThrow();
      expect(Object.values(bundle).join("\n").match(/## Tool \/ no-tool gate/g))
        .toHaveLength(1);
    }

    expect(new Set(CAPABILITY_PRUNING_INVENTORY.map((item) => item.id)).size)
      .toBe(CAPABILITY_PRUNING_INVENTORY.length);
  });

  it("intersects the process signature with Session Init asset flags deterministically", async () => {
    const base = buildCapabilitySignature({
      memory: true,
      skill: true,
      knowledge: true,
      wiki: true,
      codeGraph: true,
      skillWrite: true,
      skillExtract: true,
    });
    const flags = {
      chat_memory: false,
      skill: true,
      llm_wiki: false,
      code_graph: true,
    };
    const expected = buildCapabilitySignature({
      memory: false,
      skill: true,
      knowledge: true,
      wiki: false,
      codeGraph: true,
      skillWrite: true,
      skillExtract: true,
    });
    expect(resolveSessionCapabilitySignature(base, flags)).toBe(expected);
    expect(resolveSessionCapabilitySignature(base, flags)).toBe(
      constrainCapabilitySignature(base, {
        memory: false,
        skill: true,
        wiki: false,
        codeGraph: true,
      }),
    );
    expect(parseCapabilitySignature(expected)).toMatchObject({
      memory: false,
      skill: true,
      knowledge: true,
      wiki: false,
      codeGraph: true,
    });

    for (const toolPromptProfile of ["capability-pruned", "tscg-cfo"] as const) {
      const injector = new SkillToolsInjector({
        proxyBaseUrl: "http://127.0.0.1:8096",
        allowLlmWrite: true,
        toolPromptProfile,
        capabilitySignature: base,
      });
      const blocks = await injector.prewarm!({
        keyId: `capability-session:${toolPromptProfile}`,
        userId: "user-parity",
        agentSource: "codex",
        spaceId: "space-parity",
        sessionInfo: {
          session_id: "session-parity",
          space_id: "space-parity",
          user_id: "user-parity",
          team_id: "team-parity",
          agent_id: "agent-parity",
        },
        agentDetail: null,
        taskDetail: null,
        assetCapabilities: flags,
      });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).not.toContain("- memory:");
      expect(blocks[0].content).toContain("- knowledge: a matching code-graph resource");
      expect(blocks[0].metadata?.cacheKey).toContain(expected);
      if (toolPromptProfile === "tscg-cfo") {
        expect(blocks[0].content).toContain("@T|id=skill_create");
        expect(blocks[0].content).not.toContain("memory/skill identity");
        expect(blocks[0].content).toContain("skill identity is session-injected");
      }
    }
  });

  it("keeps the C01 correction inventory unique and source-backed", () => {
    const ids = CONTRACT_CORRECTIONS.map((correction) => correction.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const correction of CONTRACT_CORRECTIONS) {
      expect(correction.evidence.length).toBeGreaterThan(0);
      expect(correction.from).not.toBe(correction.to);
    }
  });

  it("adds the required tenant header to the C01 memory guide only", () => {
    const corrected = compileToolPrompt({
      profile: "contract-corrected",
      family: "memory",
      surface: "memory-guide",
      legacyUnits: [{
        id: "memory-guide.policy",
        kind: "policy",
        content: MEMORY_TOOLS_GUIDE,
      }],
      capabilitySignature: CAPABILITY_SIGNATURE,
    }).content;

    expect(MEMORY_TOOLS_GUIDE).not.toContain("x-tdai-service-id: <space-id>");
    expect(corrected).toContain("x-tdai-service-id: <space-id>");
  });

  it("is deterministic for bytes, units, lineage, and audit hash", () => {
    const input = {
      profile: "selection-calibrated" as const,
      family: "memory" as const,
      surface: "memory-tools" as const,
      legacyUnits: [{
        id: "memory-tools.legacy-body",
        kind: "legacy-body" as const,
        content: renderTdaiMemoryToolsBlock(
          "http://127.0.0.1:8096",
          "session-parity",
          "space-parity",
        ),
      }],
      capabilitySignature: CAPABILITY_SIGNATURE,
    };
    expect(compileToolPrompt(input)).toEqual(compileToolPrompt(input));
  });

  it("hosts the shared protocol exactly once for every non-empty family mask", () => {
    const blocks = renderProductionFamilyBlocks();
    for (let mask = 1; mask < 8; mask += 1) {
      const active = {
        memory: Boolean(mask & 1),
        skill: Boolean(mask & 2),
        knowledge: Boolean(mask & 4),
      };
      const signature = buildCapabilitySignature({
        ...active,
        wiki: active.knowledge,
        codeGraph: active.knowledge,
        skillWrite: false,
        skillExtract: false,
      });
      const output = (Object.entries(active) as Array<
        ["memory" | "skill" | "knowledge", boolean]
      >)
        .filter(([, enabled]) => enabled)
        .map(([family]) => compileToolPrompt({
          profile: "protocol-compact",
          family,
          surface: family === "memory"
            ? "memory-tools"
            : family === "skill"
              ? "skill-tools"
              : "knowledge-tools",
          legacyUnits: [{
            id: `${family}.legacy-body`,
            kind: "legacy-body",
            content: blocks[family],
          }],
          capabilitySignature: signature,
        }).content)
        .join("\n");
      expect(output.match(/## 统一工具调用协议/g)).toHaveLength(1);
      expect(output.match(/canonical form:/g)).toHaveLength(1);
    }
  });

  it("keeps the C03 proxy-identity owner accurate for every non-empty family mask", () => {
    const blocks = renderProductionFamilyBlocks();
    for (let mask = 1; mask < 8; mask += 1) {
      const active = {
        memory: Boolean(mask & 1),
        skill: Boolean(mask & 2),
        knowledge: Boolean(mask & 4),
      };
      const signature = buildCapabilitySignature({
        ...active,
        wiki: active.knowledge,
        codeGraph: active.knowledge,
        skillWrite: false,
        skillExtract: false,
      });
      const output = (Object.entries(active) as Array<
        ["memory" | "skill" | "knowledge", boolean]
      >)
        .filter(([, enabled]) => enabled)
        .map(([family]) => compileToolPrompt({
          profile: "compact",
          family,
          surface: family === "memory"
            ? "memory-tools"
            : family === "skill"
              ? "skill-tools"
              : "knowledge-tools",
          legacyUnits: [{
            id: `${family}.legacy-body`,
            kind: "legacy-body",
            content: blocks[family],
          }],
          capabilitySignature: signature,
        }).content)
        .join("\n");
      const expectedIdentityFamilies = [
        ...(active.memory ? ["memory"] : []),
        ...(active.skill ? ["skill"] : []),
      ];
      if (expectedIdentityFamilies.length === 0) {
        expect(output).not.toContain("身份由 proxy 从 session 注入");
      } else {
        expect(output.match(/身份由 proxy 从 session 注入/g)).toHaveLength(1);
        expect(output).toContain(`${expectedIdentityFamilies.join(" / ")} 身份由 proxy 从 session 注入`);
      }
    }
  });

  it("hosts one neutral C04 gate with only the enabled family rows for every mask", () => {
    const blocks = renderProductionFamilyBlocks();
    for (let mask = 1; mask < 8; mask += 1) {
      const active = {
        memory: Boolean(mask & 1),
        skill: Boolean(mask & 2),
        knowledge: Boolean(mask & 4),
      };
      const signature = buildCapabilitySignature({
        ...active,
        wiki: active.knowledge,
        codeGraph: active.knowledge,
        skillWrite: false,
        skillExtract: false,
      });
      const bundle: SelectionSurfaceBundle = {};
      for (const [family, enabled] of Object.entries(active) as Array<
        ["memory" | "skill" | "knowledge", boolean]
      >) {
        if (!enabled) continue;
        const surface = family === "memory"
          ? "memory-tools"
          : family === "skill"
            ? "skill-tools"
            : "knowledge-tools";
        bundle[surface] = compileToolPrompt({
          profile: "selection-calibrated",
          family,
          surface,
          legacyUnits: [{
            id: `${family}.legacy-body`,
            kind: "legacy-body",
            content: blocks[family],
          }],
          capabilitySignature: signature,
        }).content;
      }
      const combined = Object.values(bundle).join("\n");
      expect(combined.match(/## Tool \/ no-tool gate/g)).toHaveLength(1);
      expect(() => lintSelectionPolicy(bundle, signature)).not.toThrow();
    }
  });

  it("composes a compact contract-derived card into the safe curl parser form", () => {
    const memory = renderProductionFamilyBlocks().memory;
    const signature = buildCapabilitySignature({
      memory: true,
      skill: false,
      knowledge: false,
      wiki: false,
      codeGraph: false,
      skillWrite: false,
      skillExtract: false,
    });
    const compact = compileToolPrompt({
      profile: "protocol-compact",
      family: "memory",
      surface: "memory-tools",
      legacyUnits: [{ id: "memory.legacy-body", kind: "legacy-body", content: memory }],
      capabilitySignature: signature,
    }).content;
    const base = compact.match(/^endpoint-base: (.+)$/m)?.[1];
    const path = compact.match(/<tool name="tdai_memory_search">\n    path: (.+)$/m)?.[1];
    expect(base).toBe("http://127.0.0.1:8096/memory-bridge/v3");
    expect(path).toBe("/atomic/search");

    const parsed = parseCurlCommand(
      `curl -sSk -X POST '${base}${path}' -H 'content-type: application/json' `
        + "-H 'x-tdai-service-id: space-parity' -H 'x-conversation-id: session-parity' "
        + `-d '{"query":"历史偏好","limit":5}'`,
      "http://127.0.0.1:8096",
    );
    expect(parsed).toMatchObject({
      method: "POST",
      url: "http://127.0.0.1:8096/memory-bridge/v3/atomic/search",
      body: { query: "历史偏好", limit: 5 },
    });
  });

  it("keeps C04 frozen and produces one provider-visible C05 result for every agent and task shape", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const agent of AGENT_PARITY_CASES) {
        for (const withTask of [false, true]) {
          const legacy = await renderProviderParityPrompt(agent, "legacy", withTask);
          const corrected = await renderProviderParityPrompt(agent, "contract-corrected", withTask);
          expect(corrected).not.toEqual(legacy);
          const protocol = await renderProviderParityPrompt(agent, "protocol-compact", withTask);
          expect(protocol).not.toEqual(corrected);
          const semantic = await renderProviderParityPrompt(agent, "compact", withTask);
          expect(semantic).not.toEqual(protocol);
          const selection = await renderProviderParityPrompt(
            agent,
            "selection-calibrated",
            withTask,
          );
          expect(selection).not.toEqual(semantic);
          const capability = await renderProviderParityPrompt(
            agent,
            "capability-pruned",
            withTask,
          );
          expect(capability).not.toEqual(selection);
        }
      }
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it("keeps runtime contracts inside the production bridge allowlists", () => {
    const memorySubpaths = getRuntimeToolContracts("memory").map((contract) =>
      contract.path.replace("/memory-bridge/v3/", ""),
    );
    expect(memorySubpaths.sort()).toEqual([...MEMORY_BRIDGE_ALLOWED_SUBPATHS].sort());

    const skillContracts = getRuntimeToolContracts("skill");
    const skillSubpaths = skillContracts.map((contract) =>
      contract.path.replace("/skill-bridge/v3/skill/", ""),
    );
    for (const subpath of skillSubpaths) {
      expect(SKILL_BRIDGE_ALLOWED_SUBPATHS).toContain(subpath);
    }
    const writeSubpaths = skillContracts
      .filter((contract) => contract.phase === "write")
      .map((contract) => contract.path.replace("/skill-bridge/v3/skill/", ""));
    expect(writeSubpaths.sort()).toEqual([...SKILL_BRIDGE_WRITE_SUBPATHS].sort());

    expect(getRuntimeToolContracts("knowledge").map((contract) => contract.path)).toEqual([
      "/tools/list",
      "/tools/call",
    ]);
  });

  it("builds stable capability and cache identities without changing legacy keys", () => {
    expect(CAPABILITY_SIGNATURE).toBe(
      "memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0",
    );
    expect(toolPromptCacheIdentity("skill-tools-injector", "legacy", CAPABILITY_SIGNATURE)).toBeUndefined();
    expect(toolPromptCacheIdentity("skill-tools-injector", "compact", CAPABILITY_SIGNATURE))
      .toBe(toolPromptCacheIdentity("skill-tools-injector", "compact", CAPABILITY_SIGNATURE));
    expect(toolPromptCacheIdentity("skill-tools-injector", "compact", CAPABILITY_SIGNATURE))
      .not.toBe(toolPromptCacheIdentity("skill-tools-injector", "selection-calibrated", CAPABILITY_SIGNATURE));
  });

  it("selects one deterministic existing family block as the shared surface host", () => {
    expect(coordinateToolPromptSurface(["knowledge", "skill", "knowledge"])).toEqual({
      activeFamilies: ["skill", "knowledge"],
      policyHost: "skill",
      executionGrammarHost: "skill",
    });
    expect(coordinateToolPromptSurface([])).toEqual({
      activeFamilies: [],
      policyHost: null,
      executionGrammarHost: null,
    });
    expect(coordinateToolPromptSurfaceFromCapabilitySignature(CAPABILITY_SIGNATURE)).toEqual({
      activeFamilies: ["memory", "skill", "knowledge"],
      policyHost: "memory",
      executionGrammarHost: "memory",
    });
    expect(() => coordinateToolPromptSurfaceFromCapabilitySignature("unconfigured"))
      .toThrow(/missing memory=0\|1/);
  });

  it("compiles four uniquely identified TSCG-lite ladder profiles from frozen V3", () => {
    const memory = renderProductionFamilyBlocks().memory;
    const compile = (profile: "capability-pruned" | (typeof TSCG_LITE_PROFILES)[number]) =>
      compileToolPrompt({
        profile,
        family: "memory",
        surface: "memory-tools",
        legacyUnits: [{ id: "memory.tscg-fixture", kind: "legacy-body", content: memory }],
        capabilitySignature: CAPABILITY_SIGNATURE,
      });
    const v3 = compile("capability-pruned");
    const sig = compile("tscg-sig");
    const sdm = compile("tscg-sdm");
    const dro = compile("tscg-dro");
    const cfo = compile("tscg-cfo");

    expect(parseToolPromptProfile("tscg-cfo")).toBe("tscg-cfo");
    expect(getToolPromptProfileLineage("tscg-cfo")).toEqual([
      "legacy",
      "contract-corrected",
      "protocol-compact",
      "compact",
      "selection-calibrated",
      "capability-pruned",
      "tscg-sig",
      "tscg-sdm",
      "tscg-dro",
      "tscg-cfo",
    ]);
    expect(v3.content).toContain('<tool name="tdai_memory_search">');
    expect(sig.content).toContain("[typed-tool]");
    expect(sig.content).not.toContain("[typed-defaults]");
    expect(sig.content).toContain("origin: http://127.0.0.1:8096");
    expect(sig.content).toContain("`origin` + full tool `path`");
    expect(sig.content).not.toContain("endpoint-base:");
    expect(sig.content).not.toContain(
      "/memory-bridge/v3/memory-bridge/v3",
    );
    expect(sdm.content).toContain("[typed-defaults]");
    expect(dro.content).toContain("@D|");
    expect(dro.content).toContain("@T|id=tdai_memory_search");
    expect(cfo.content).toContain("@T|id=tdai_atomic_query");
    expect(cfo.content).not.toBe(dro.content);
    expect(new Set([sig, sdm, dro, cfo].map((item) => item.contentSha256)).size).toBe(4);
    for (const candidate of [sig, sdm, dro, cfo]) {
      expect(candidate.contractIds).toEqual(v3.contractIds);
      expect(candidate.specIds).toEqual(v3.specIds);
      expect(candidate.tscgLite?.contractEquivalent).toBe(true);
      expect(candidate.content).toContain("session-parity");
      expect(candidate.content).toContain("space-parity");
    }
    expect(sig.tscgLite?.enabledOperators).toEqual(["typed-signature"]);
    expect(sdm.tscgLite?.removedUnitMappings.length).toBeGreaterThan(0);
    expect(dro.tscgLite?.droRoundTrip).toBe(true);
    expect(cfo.tscgLite?.droRoundTrip).toBe(true);

    const identities = TSCG_LITE_PROFILES.map((profile) =>
      toolPromptCacheIdentity("tdai-memory-tools-injector", profile, CAPABILITY_SIGNATURE)
    );
    expect(new Set(identities).size).toBe(4);
  });

  it("keeps every O1 contract field exact and makes every O2 deletion auditable", () => {
    const contracts = getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE, "skill");
    const typed = buildTypedSignatureProgram({
      family: "skill",
      surface: "skill-tools",
      contracts,
      specs: SKILL_TOOL_PROMPT_SPECS,
    });
    expect(TSCG_SIGNATURE_FIELD_ORDER).toEqual([
      "id",
      "method",
      "path",
      "requiredHeaders",
      "requiredArgs",
      "optionalArgs",
      "forbiddenArgs",
      "phase",
      "capability",
      "operation",
      "responseKind",
    ]);
    expect(compareTscgContracts(contracts, typed)).toEqual({
      equivalent: true,
      differences: [],
    });
    const sdm = applySemanticDeduplication(typed);
    expect(compareTscgContracts(contracts, sdm.program).equivalent).toBe(true);
    expect(sdm.removedUnitMappings.length).toBeGreaterThan(0);
    for (const mapping of sdm.removedUnitMappings) {
      expect(mapping.sourceUnit).toMatch(/^[a-z0-9_]+\./);
      expect(mapping.retainedUnit).toBe(`defaults.${mapping.field}`);
      expect(JSON.stringify(sdm.program.defaults[mapping.field])).toBe(mapping.canonicalValue);
    }
    expect(sdm.program.tools.map((tool) => tool.decision))
      .toEqual(typed.tools.map((tool) => tool.decision));
  });

  it("round-trips DRO escaping and fails CFO cycles closed", () => {
    const escaped = "value|with^reserved>delimiters%and\nnewline";
    expect(decodeTscgField(encodeTscgField(escaped))).toBe(escaped);
    expect(encodeTscgField(escaped)).not.toMatch(/[|^>\n]/);
    const contracts = getVisibleRuntimeToolContracts(CAPABILITY_SIGNATURE, "memory");
    const typed = buildTypedSignatureProgram({
      family: "memory",
      surface: "memory-tools",
      contracts,
      specs: MEMORY_TOOL_PROMPT_SPECS,
    });
    const sdm = applySemanticDeduplication(typed).program;
    const roundTrip = roundTripDroProgram(sdm);
    expect(roundTrip.identical).toBe(true);
    expect(roundTrip.encoded).toContain("@T|id=tdai_memory_search");

    const ordered = applyContractFlowOrdering(sdm);
    const ids = ordered.tools.map((tool) => tool.contract.id);
    expect(ids.indexOf("tdai_scenario_ls")).toBeLessThan(ids.indexOf("tdai_read_scene"));
    const canonicalRecords = (program: typeof sdm) => [...program.tools]
      .sort((left, right) => left.contract.id < right.contract.id ? -1 : 1)
      .map((tool) => JSON.stringify(tool));
    expect(canonicalRecords(ordered)).toEqual(canonicalRecords(sdm));
    expect(() => stableTopologicalOrder(["a", "b"], [
      { from: "a", to: "b", flow: "x" },
      { from: "b", to: "a", flow: "y" },
    ])).toThrow(/dependency cycle/);
  });

  it("drops all TSCG contrasts and graph edges that reference pruned tools", () => {
    const readonlySignature = buildCapabilitySignature({
      memory: false,
      skill: true,
      knowledge: false,
      wiki: false,
      codeGraph: false,
      skillWrite: false,
      skillExtract: false,
    });
    const visible = getVisibleRuntimeToolContracts(readonlySignature, "skill");
    const program = buildTypedSignatureProgram({
      family: "skill",
      surface: "skill-tools",
      contracts: visible,
      specs: SKILL_TOOL_PROMPT_SPECS,
    });
    expect(() => lintTscgCapabilityProjection(
      program,
      visible.map((contract) => contract.id),
    )).not.toThrow();
    expect(getVisibleTscgDependencyEdges(visible.map((contract) => contract.id)))
      .toEqual(program.dependencyEdges);
    const referenced = JSON.stringify(program.dependencyEdges);
    for (const pruned of [
      "skill_extract",
      "skill_create",
      "skill_update",
      "skill_patch",
      "skill_delete",
      "skill_files_write",
      "skill_files_remove",
    ]) expect(referenced).not.toContain(pruned);
  });

  it("persists prewarmed candidate content under cacheIdentity while reporting the hook id", async () => {
    const registry = new HookRegistryImpl();
    registry.register({
      id: "skill-tools-injector",
      cacheIdentity: "skill-tools-injector-tp-compact-abc123",
      point: "system.before_tools",
      priority: 1,
      description: "test",
      cacheStrategy: "session_init",
      prewarm: () => [{ type: "text", content: "candidate" }],
      execute: () => [],
    });

    const putMany = vi.fn<HookCacheRepo["putMany"]>();
    const repo: HookCacheRepo = {
      put: vi.fn(),
      putMany,
      get: vi.fn(async () => null),
      getAllForSession: vi.fn(async () => [] as HookCacheEntry[]),
      clearBySession: vi.fn(),
    };
    const result = await prewarmAll(registry, repo, {
      keyId: "codex:session-1",
      userId: "user-1",
      agentSource: "codex",
      spaceId: "space-1",
      sessionInfo: {
        session_id: "session-1",
        space_id: "space-1",
        user_id: "user-1",
        team_id: "team-1",
        agent_id: "agent-1",
      },
      agentDetail: null,
      taskDetail: null,
    });

    expect(result.cachedHookIds).toEqual(["skill-tools-injector"]);
    expect(putMany).toHaveBeenCalledWith(
      "space-1",
      "user-1",
      "codex",
      "session-1",
      [{
        hookId: "skill-tools-injector-tp-compact-abc123",
        blocks: [{ type: "text", content: "candidate" }],
      }],
    );
  });
});
