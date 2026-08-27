import { describe, expect, it, vi } from "vitest";
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
import { renderSkillToolsBlock } from "../injection/injectors/skill-tools-injector.js";
import { renderTdaiMemoryToolsBlock } from "../injection/injectors/tdai-tools-injector.js";
import { prewarmAll } from "../injection/prewarm.js";
import { InjectionPipeline } from "../injection/pipeline.js";
import { HookRegistryImpl } from "../injection/registry.js";
import type { AnchorTarget, InjectionPoint, Protocol } from "../injection/types.js";
import {
  buildCapabilitySignature,
  compileToolPrompt,
  coordinateToolPromptSurface,
  getRuntimeToolContracts,
  getToolPromptProfileLineage,
  parseToolPromptProfile,
  toolPromptCacheIdentity,
  TOOL_PROMPT_PROFILES,
  type CompiledToolPromptProfile,
} from "../injection/tool-prompt/index.js";

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
  (profile): profile is CompiledToolPromptProfile => profile !== "legacy",
);

interface AgentParityCase {
  agentSource: string;
  protocol: Protocol;
  profile: AgentProfile | null;
  system: string;
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
  const familyBlocks = {
    skill: "<skill_tools>frozen skill bytes</skill_tools>",
    knowledge: "<knowledge_tools>frozen knowledge bytes</knowledge_tools>",
    memory: "<tdai_memory_tools>frozen memory bytes</tdai_memory_tools>",
  } as const;
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

describe("tool prompt compiler C00", () => {
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

  it("keeps every C00 compiled profile byte-equivalent to each frozen renderer", () => {
    const memory = renderTdaiMemoryToolsBlock("http://127.0.0.1:8096", "session-1", "space-1");
    const skill = renderSkillToolsBlock("http://127.0.0.1:8096", false, "session-1", "space-1");
    const knowledge = renderKnowledgeToolsBlock([
      {
        knowledge_id: "wiki-1",
        type: "wiki",
        name: "Architecture decisions",
        summary: "Why the proxy uses stable injection anchors",
        service_url: "http://127.0.0.1:8421/v3",
        team_id: "team-1",
        user_id: null,
        created_at: "2026-08-28T00:00:00.000Z",
        updated_at: "2026-08-28T00:00:00.000Z",
      },
    ], "space-1", { sessionKey: "session-1" });
    expect(knowledge).not.toBeNull();

    for (const profile of COMPILED_PROFILES) {
      for (const [family, content] of [
        ["memory", memory],
        ["skill", skill],
        ["knowledge", knowledge!],
      ] as const) {
        const compiled = compileToolPrompt({
          profile,
          family,
          surface: family === "memory"
            ? "memory-tools"
            : family === "skill"
              ? "skill-tools"
              : "knowledge-tools",
          legacyUnits: [{
            id: `${family}.legacy-body`,
            kind: "legacy-body",
            content,
          }],
          capabilitySignature: CAPABILITY_SIGNATURE,
        });
        expect(compiled.content).toBe(content);
        expect(compiled.units).toHaveLength(1);
        expect(compiled.contractIds.length).toBeGreaterThan(0);
        expect(compiled.contractIds).toEqual(compiled.specIds);
      }
    }
  });

  it("is deterministic for bytes, units, lineage, and audit hash", () => {
    const input = {
      profile: "selection-calibrated" as const,
      family: "memory" as const,
      surface: "memory-tools" as const,
      legacyUnits: [{
        id: "memory-tools.legacy-body",
        kind: "legacy-body" as const,
        content: "<tdai_memory_tools>frozen</tdai_memory_tools>",
      }],
      capabilitySignature: CAPABILITY_SIGNATURE,
    };
    expect(compileToolPrompt(input)).toEqual(compileToolPrompt(input));
  });

  it("keeps provider-visible bytes equal for every agent profile, fallback, and task shape", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const agent of AGENT_PARITY_CASES) {
        for (const withTask of [false, true]) {
          const legacy = await renderProviderParityPrompt(agent, "legacy", withTask);
          for (const profile of COMPILED_PROFILES) {
            expect(await renderProviderParityPrompt(agent, profile, withTask)).toEqual(legacy);
          }
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
