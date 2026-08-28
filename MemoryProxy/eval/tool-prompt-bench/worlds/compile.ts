/**
 * Compile a World into the shapes the existing harness already consumes:
 * one shared EvalFixture plus one ToolPromptEvalCase per case.
 *
 * Nothing outside this folder is modified. The emitted fixture is a superset of
 * EvalFixture, so mock-bridge.ts and prompt-harness.ts read it unchanged.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { EvalFamily, SourceRef, ToolPromptEvalCase } from "../schema.js";
import type { ProjectContext, World, WorldCase, WorldFixture } from "./world-schema.js";

/** Cases carry their world and active sub-scene so the runner can set up a workspace. */
export interface WorldEvalCase extends ToolPromptEvalCase {
  worldId: string;
  activeProject: string;
  uniqueness: string;
}

const WORLD_SOURCE: SourceRef = {
  dataset: "project-authored",
  sourceId: "worlds/evaluation-world",
  revision: "97f94654280b2932c35ba4806a491999ed244cc9",
  license: "MIT",
  usage: "project-authored",
  adaptation: "Authored against the current TDAI tool contract as a shared-asset evaluation world.",
};

const MEMORY_TOOLS = [
  "tdai_memory_search",
  "tdai_atomic_query",
  "tdai_conversation_search",
  "tdai_conversation_query",
  "tdai_scenario_ls",
  "tdai_read_scene",
];
const SKILL_TOOLS = ["skill_search", "skill_view", "skill_files_read"];
const KNOWLEDGE_TOOLS = ["knowledge_tools_list", "knowledge_tools_call"];

const TOOLS_BY_FAMILY: Record<EvalFamily, string[]> = {
  memory: MEMORY_TOOLS,
  skill: SKILL_TOOLS,
  knowledge: KNOWLEDGE_TOOLS,
};

/** Every tool of every family the case must not touch, plus the write tool. */
function forbiddenTools(item: WorldCase): string[] {
  const explicit = item.gold.forbiddenTools ?? [];
  const families: EvalFamily[] = ["memory", "skill", "knowledge"];
  const blocked = families
    .filter((family) => family !== item.gold.family)
    .flatMap((family) => TOOLS_BY_FAMILY[family]);
  return [...new Set([...blocked, "skill_extract", ...explicit])];
}

function allowedSequence(item: WorldCase): string[][] {
  if (!item.gold.firstAction) return [];
  const sequence = [item.gold.firstAction.tool];
  for (const followup of item.gold.followupActions ?? []) sequence.push(followup.tool);
  for (const _call of item.gold.knowledgeCalls ?? []) sequence.push("knowledge_tools_call");
  return [sequence];
}

function maxCalls(item: WorldCase): number {
  if (!item.gold.family) return 0;
  if (typeof item.gold.maxTdaiCalls === "number") return item.gold.maxTdaiCalls;
  return 1 + (item.gold.followupActions?.length ?? 0) + (item.gold.knowledgeCalls?.length ?? 0);
}

export function worldFixtureId(world: World): string {
  return `${world.worldId.toLowerCase()}-world-fixture`;
}

/** One fixture per world, shared by every case in it. */
export function compileWorldFixture(world: World): WorldFixture {
  return {
    fixtureId: worldFixtureId(world),
    split: world.split,
    description: world.description,
    worldId: world.worldId,
    projects: world.projects,
    assets: {
      profileL3: world.profileL3,
      atomicMemories: world.memories.map((memory) => ({
        memory_id: memory.memoryId,
        type: memory.type,
        content: memory.content,
        timestamp: memory.timestamp,
        project: memory.project,
        ...(memory.final ? { final: true } : {}),
        ...(memory.supersededBy ? { superseded_by: memory.supersededBy } : {}),
      })),
      conversations: world.conversations.map((session) => ({
        session_id: session.sessionId,
        title: session.title,
        project: session.project,
        started_at: session.startedAt,
        messages: session.messages,
      })),
      // Only injected scenes appear in the prompt's L2 index; ls/read still see all.
      sceneIndex: world.scenes
        .filter((scene) => scene.injected)
        .map((scene) => ({ path: scene.path, summary: scene.summary })),
      scenes: world.scenes.map((scene) => ({
        path: scene.path,
        summary: scene.summary,
        content: scene.content,
        project: scene.project,
      })),
      skills: {
        listed: world.skills.filter((skill) => skill.bound).map(serializeSkill),
        teamLibrary: world.skills.map(serializeSkill),
      },
      knowledge: world.knowledge.map((resource) => ({
        knowledge_id: resource.knowledgeId,
        type: resource.type,
        name: resource.name,
        summary: resource.summary,
        project: resource.project,
        ...(resource.repoSlug ? { repo_slug: resource.repoSlug } : {}),
        ...(resource.branch ? { branch: resource.branch } : {}),
        tools: resource.tools,
      })),
    },
  };
}

function serializeSkill(skill: {
  skillId: string;
  name: string;
  description: string;
  project: string;
  content?: string;
  manifest?: Array<{ path: string; description: string }>;
  files?: Record<string, string>;
}): Record<string, unknown> {
  return {
    skill_id: skill.skillId,
    name: skill.name,
    description: skill.description,
    project: skill.project,
    ...(skill.content ? { content: skill.content } : {}),
    manifest: skill.manifest ?? [],
    files: skill.files ?? {},
  };
}

export function compileWorldCases(world: World): WorldEvalCase[] {
  const fixtureId = worldFixtureId(world);
  return world.cases.map((item) => ({
    caseId: item.caseId,
    schemaVersion: "1.0",
    split: world.split,
    language: item.language,
    category: item.category,
    query: item.query,
    ...(item.contextMessages ? { contextMessages: item.contextMessages } : {}),
    source: WORLD_SOURCE,
    capabilities: {
      chatMemory: true,
      skill: true,
      llmWiki: true,
      codeGraph: true,
      allowLlmWrite: false,
      allowLlmExtract: true,
    },
    gold: {
      needTdaiTool: item.gold.family !== null,
      family: item.gold.family,
      allowedFirstActions: item.gold.firstAction ? [item.gold.firstAction] : [],
      allowedSequences: allowedSequence(item),
      ...(item.gold.followupActions ? { expectedFollowupActions: item.gold.followupActions } : {}),
      ...(item.gold.knowledgeCalls ? { expectedKnowledgeCalls: item.gold.knowledgeCalls } : {}),
      forbiddenTools: forbiddenTools(item),
      maxTdaiCalls: maxCalls(item),
    },
    preconditions: {
      answerInCurrentContext: item.preconditions?.answerInCurrentContext ?? false,
      answerInProfileL3: item.preconditions?.answerInProfileL3 ?? false,
      scenePathInjected: item.preconditions?.scenePathInjected ?? false,
      goldSkillInListing: item.preconditions?.goldSkillInListing ?? false,
      knowledgeMatchesWorkspace: item.preconditions?.knowledgeMatchesWorkspace ?? false,
    },
    fixtureIds: [fixtureId],
    annotationReason: item.annotationReason,
    // One groupId per world: a world never splits across dev/test.
    groupId: world.worldId,
    worldId: world.worldId,
    activeProject: item.activeProject,
    uniqueness: item.uniqueness,
  }));
}

/**
 * Materialize the active sub-scene's files into a run workspace.
 * Only the active project's files are written; the other sub-scenes stay
 * visible as assets but not as local code.
 */
export function materializeWorkspace(project: ProjectContext, workspaceDir: string): string[] {
  const workspaceRoot = resolve(workspaceDir);
  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(project.files)) {
    const target = resolve(workspaceRoot, relativePath);
    const targetFromRoot = relative(workspaceRoot, target);
    if (
      !relativePath
      || isAbsolute(relativePath)
      || targetFromRoot === ""
      || targetFromRoot === ".."
      || targetFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      || isAbsolute(targetFromRoot)
    ) {
      throw new Error(`${project.projectId}: workspace file escapes root: ${relativePath}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${content}\n`, "utf8");
    written.push(relativePath);
  }
  return written;
}

/** AgentDetail/TaskDetail payload for session_init, derived from the active sub-scene. */
export function sessionInitDetail(world: World, project: ProjectContext): Record<string, unknown> {
  return {
    agent_detail: {
      agent_id: "eval-agent",
      agent_name: "tool-prompt-bench-agent",
      description: `Engineer working in ${world.name}.`,
    },
    task_detail: {
      task_id: `${world.worldId}-${project.projectId}`,
      workspace: project.workspaceName,
      repo_slug: project.repoSlug,
      description: project.taskDescription,
    },
  };
}

export function projectOf(world: World, projectId: string): ProjectContext {
  const project = world.projects.find((candidate) => candidate.projectId === projectId);
  if (!project) throw new Error(`${world.worldId}: unknown project ${projectId}`);
  return project;
}

export function workspacePathFor(runDir: string, project: ProjectContext): string {
  return join(runDir, "workspace", project.workspaceName);
}
