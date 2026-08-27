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
import { renderSkillToolsBlock } from "../injection/injectors/skill-tools-injector.js";
import { MEMORY_TOOLS_GUIDE } from "../injection/injectors/tdai-profile-memory-injector.js";
import { renderTdaiMemoryToolsBlock } from "../injection/injectors/tdai-tools-injector.js";
import { prewarmAll } from "../injection/prewarm.js";
import { InjectionPipeline } from "../injection/pipeline.js";
import { HookRegistryImpl } from "../injection/registry.js";
import type { AnchorTarget, InjectionPoint, Protocol } from "../injection/types.js";
import {
  buildCapabilitySignature,
  compileToolPrompt,
  CONTRACT_CORRECTIONS,
  coordinateToolPromptSurface,
  coordinateToolPromptSurfaceFromCapabilitySignature,
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

describe("tool prompt compiler C00-C02", () => {
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

  it("keeps legacy frozen and isolates the C01 and C02 renderer boundaries", () => {
    const blocks = renderProductionFamilyBlocks(true);
    const correctedByFamily = new Map<string, string>();
    const compactByFamily = new Map<string, string>();

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
          compactByFamily.set(family, compiled.content);
          expect(compiled.content).not.toBe(correctedByFamily.get(family));
          expect(compiled.units).toHaveLength(family === "memory" ? 3 : 1);
        } else {
          expect(compiled.content).toBe(compactByFamily.get(family));
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

    const compactMemory = compactByFamily.get("memory") ?? "";
    const compactSkill = compactByFamily.get("skill") ?? "";
    const compactKnowledge = compactByFamily.get("knowledge") ?? "";
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

  it("keeps one provider-visible C02 result across descendants for every agent and task shape", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const agent of AGENT_PARITY_CASES) {
        for (const withTask of [false, true]) {
          const legacy = await renderProviderParityPrompt(agent, "legacy", withTask);
          const corrected = await renderProviderParityPrompt(agent, "contract-corrected", withTask);
          expect(corrected).not.toEqual(legacy);
          const compact = await renderProviderParityPrompt(agent, "protocol-compact", withTask);
          expect(compact).not.toEqual(corrected);
          for (const profile of COMPILED_PROFILES.slice(2)) {
            expect(await renderProviderParityPrompt(agent, profile, withTask)).toEqual(compact);
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
    expect(coordinateToolPromptSurfaceFromCapabilitySignature(CAPABILITY_SIGNATURE)).toEqual({
      activeFamilies: ["memory", "skill", "knowledge"],
      policyHost: "memory",
      executionGrammarHost: "memory",
    });
    expect(() => coordinateToolPromptSurfaceFromCapabilitySignature("unconfigured"))
      .toThrow(/missing memory=0\|1/);
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
