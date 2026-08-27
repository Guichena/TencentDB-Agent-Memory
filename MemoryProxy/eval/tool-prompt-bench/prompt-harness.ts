import { createHash } from "node:crypto";
import type { KnowledgeItem } from "../../src/knowledge/core-client.js";
import { OpenAIAdapter } from "../../src/injection/adapters/openai.js";
import { renderKnowledgeToolsBlock } from "../../src/injection/injectors/knowledge-tools-injector.js";
import { renderSkillToolsBlock } from "../../src/injection/injectors/skill-tools-injector.js";
import { wrapAvailableSkillsBlock } from "../../src/injection/injectors/skill-injector.js";
import {
  renderTdaiProfileMemoryBlock,
} from "../../src/injection/injectors/tdai-profile-memory-injector.js";
import { renderTdaiMemoryToolsBlock } from "../../src/injection/injectors/tdai-tools-injector.js";
import { InjectionPipeline } from "../../src/injection/pipeline.js";
import { HookRegistryImpl } from "../../src/injection/registry.js";
import { HOOK_PRIORITY, type ContextBlock, type InjectionHook, type InjectionPoint } from "../../src/injection/types.js";
import type { EvalFixture, ToolPromptEvalCase } from "./schema.js";

export interface FixturePromptOptions {
  bridgeBaseUrl: string;
  sessionId: string;
  spaceId: string;
  modelId?: string;
}

export interface RenderedFixturePrompt {
  body: Record<string, unknown>;
  prompt: string;
  promptSha256: string;
}

function staticHook(
  id: string,
  point: InjectionPoint,
  priority: number,
  content: string | ContextBlock | null,
): InjectionHook {
  return {
    id,
    point,
    priority,
    description: `Fixture-backed V0 ${id}`,
    execute: () => {
      if (!content) return [];
      return [typeof content === "string" ? { type: "text", content, metadata: { source: id } } : content];
    },
  };
}

function renderSkillListing(fixture: EvalFixture): string | null {
  const listed = fixture.assets.skills?.listed ?? [];
  if (listed.length === 0) return null;
  const lines = listed.map((skill) => `- ${String(skill.name ?? "")}: ${String(skill.description ?? "")}`);
  return wrapAvailableSkillsBlock(`<available_skills>\n${lines.join("\n")}\n</available_skills>`);
}

function fixtureKnowledge(fixture: EvalFixture, bridgeBaseUrl: string): KnowledgeItem[] {
  const now = "2026-01-01T00:00:00.000Z";
  return (fixture.assets.knowledge ?? []).map((resource) => ({
    knowledge_id: String(resource.knowledge_id),
    type: resource.type === "wiki" ? "wiki" : "code-graph",
    service_url: bridgeBaseUrl.replace(/\/$/, ""),
    name: String(resource.name),
    summary: typeof resource.summary === "string" ? resource.summary : null,
    team_id: "eval-team",
    user_id: "eval-user",
    repo_url: typeof resource.repo_url === "string" ? resource.repo_url : undefined,
    repo_slug: typeof resource.repo_slug === "string" ? resource.repo_slug : undefined,
    branch: typeof resource.branch === "string" ? resource.branch : undefined,
    created_at: now,
    updated_at: now,
  }));
}

function fixtureProfile(fixture: EvalFixture): ContextBlock {
  const l3Content = fixture.assets.profileL3?.join("\n");
  const l2Entries = (fixture.assets.sceneIndex ?? []).flatMap((entry) => (
    typeof entry.path === "string"
      ? [{ path: entry.path, summary: typeof entry.summary === "string" ? entry.summary : undefined }]
      : []
  ));
  return renderTdaiProfileMemoryBlock([{
    agentName: "tool-prompt-bench-agent",
    agentId: "eval-agent",
    isSelf: true,
    l3Content,
    l2Entries,
  }]);
}

/** Render a case with the same InjectionPipeline and V0 block renderers used by Codex. */
export async function renderFixturePrompt(
  item: ToolPromptEvalCase,
  fixture: EvalFixture,
  options: FixturePromptOptions,
): Promise<RenderedFixturePrompt> {
  const registry = new HookRegistryImpl();
  const baseUrl = options.bridgeBaseUrl.replace(/\/$/, "");

  if (item.capabilities.skill) {
    registry.register(staticHook(
      "skill-tools-injector",
      "system.before_tools",
      HOOK_PRIORITY.SKILL - 1,
      renderSkillToolsBlock(baseUrl, item.capabilities.allowLlmWrite, options.sessionId, options.spaceId),
    ));
    registry.register(staticHook(
      "skill-injector",
      "system.before_tools",
      HOOK_PRIORITY.SKILL,
      renderSkillListing(fixture),
    ));
  }

  if (item.capabilities.llmWiki || item.capabilities.codeGraph) {
    const resources = fixtureKnowledge(fixture, baseUrl).filter((resource) => (
      resource.type === "wiki" ? item.capabilities.llmWiki : item.capabilities.codeGraph
    ));
    registry.register(staticHook(
      "knowledge-tools-injector",
      "system.before_tools",
      HOOK_PRIORITY.WIKI,
      renderKnowledgeToolsBlock(resources, options.spaceId, {
        sessionKey: options.sessionId,
        userId: "eval-user",
        teamId: "eval-team",
        agentId: "eval-agent",
        agentSource: "codex",
        spaceId: options.spaceId,
      }),
    ));
  }

  if (item.capabilities.chatMemory) {
    registry.register(staticHook(
      "tdai-memory-tools-injector",
      "system.suffix",
      HOOK_PRIORITY.MEMORY + 5,
      renderTdaiMemoryToolsBlock(baseUrl, options.sessionId, options.spaceId),
    ));
    registry.register(staticHook(
      "tdai-profile-memory-injector",
      "system.suffix",
      HOOK_PRIORITY.MEMORY + 10,
      fixtureProfile(fixture),
    ));
  }

  const pipeline = new InjectionPipeline(
    registry,
    new Map([["openai", new OpenAIAdapter()]]),
  );
  const body = await pipeline.process({
    messages: [
      { role: "system", content: "" },
      ...(item.contextMessages ?? []),
      { role: "user", content: item.query },
    ],
    model: options.modelId ?? "tool-prompt-bench",
  }, {
    protocol: "openai",
    traceId: `eval:${item.caseId}`,
    keyId: "tool-prompt-bench",
    modelId: options.modelId ?? "tool-prompt-bench",
    stream: false,
    agentSource: "codex",
    userId: "eval-user",
    spaceId: options.spaceId,
    sessionKey: options.sessionId,
    custom: {
      session: {
        session_id: options.sessionId,
        space_id: options.spaceId,
        user_id: "eval-user",
        team_id: "eval-team",
        agent_id: "eval-agent",
      },
    },
  });
  const messages = body.messages as Array<Record<string, unknown>>;
  const prompt = typeof messages[0]?.content === "string" ? messages[0].content : "";
  return {
    body,
    prompt,
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
  };
}
