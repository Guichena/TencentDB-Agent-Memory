/**
 * Evaluation World schema.
 *
 * A World is one frozen snapshot of a team's assets and history. It holds several
 * programming sub-scenes (project contexts) and many cases. Every case names one
 * active project; the other projects' assets stay loaded and act as distractors.
 *
 *   World     -> one EvalFixture, shared by every case of that world
 *   WorldCase -> one ToolPromptEvalCase
 *
 * A World never spans splits, so Dev/Test separation happens at world level and
 * no case can leak asset names or phrasing across the boundary.
 */
import type {
  AllowedToolAction,
  ContextMessage,
  EvalCategory,
  EvalFamily,
  EvalFixture,
  EvalLanguage,
  EvalSplit,
  KnowledgeCallExpectation,
} from "../schema.js";

/** One programming sub-scene inside a world. */
export interface ProjectContext {
  projectId: string;
  /** Workspace directory name the runner materializes for an active case. */
  workspaceName: string;
  repoSlug: string;
  /** Task description surfaced through session_init as TaskDetail. */
  taskDescription: string;
  summary: string;
  /** Relative path -> file body, written into the run workspace when active. */
  files: Record<string, string>;
}

export interface WorldMemory {
  memoryId: string;
  type: "persona" | "preference" | "decision" | "event" | "fact";
  content: string;
  project: string;
  timestamp: string;
  /** Marks the surviving record of a superseded pair. */
  final?: boolean;
  /** memoryId of the record that replaced this one. */
  supersededBy?: string;
}

export interface WorldConversation {
  sessionId: string;
  project: string;
  title: string;
  startedAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface WorldScene {
  path: string;
  summary: string;
  content: string;
  project: string;
  /** True when the path appears in the injected L2 index. */
  injected: boolean;
}

export interface WorldSkill {
  skillId: string;
  name: string;
  description: string;
  project: string;
  /** True when the skill is bound to the current agent and listed in the prompt. */
  bound: boolean;
  content?: string;
  manifest?: Array<{ path: string; description: string }>;
  files?: Record<string, string>;
}

export interface WorldKnowledgeTool {
  name: string;
  description: string;
  params: Record<string, { type: string; required?: boolean }>;
}

/** One symbol in a code-graph resource. */
export interface GraphSymbol {
  symbol: string;
  file: string;
  kind: "function" | "method" | "class" | "const" | "component";
  signature: string;
  summary: string;
}

/** A directed call edge: `from` calls `to`. */
export interface GraphEdge {
  from: string;
  to: string;
  file: string;
  line: number;
}

export interface CodeGraphData {
  symbols: GraphSymbol[];
  edges: GraphEdge[];
}

/** One page in a wiki resource. */
export interface WikiPage {
  ref: string;
  title: string;
  body: string;
}

export interface WorldKnowledge {
  knowledgeId: string;
  type: "code-graph" | "wiki";
  name: string;
  summary: string;
  project: string;
  repoSlug?: string;
  branch?: string;
  tools: WorldKnowledgeTool[];
  /** Real symbols and call edges, so callers/callees/impact resolve from data. */
  graph?: CodeGraphData;
  /** Real pages, so search and read_page return authored text. */
  pages?: WikiPage[];
}

/** Gold expectation for one case, in world-authoring shorthand. */
export interface WorldGold {
  family: EvalFamily | null;
  firstAction?: AllowedToolAction;
  followupActions?: AllowedToolAction[];
  knowledgeCalls?: KnowledgeCallExpectation[];
  /** Extra families that must not be touched, beyond the automatic ones. */
  forbiddenTools?: string[];
  maxTdaiCalls?: number;
}

export interface WorldCase {
  caseId: string;
  /** projectId of the sub-scene this case is working in. */
  activeProject: string;
  language: EvalLanguage;
  category: EvalCategory;
  query: string;
  contextMessages?: ContextMessage[];
  gold: WorldGold;
  /** Asset ids this case's gold answer depends on, for uniqueness auditing. */
  goldAssetIds?: string[];
  /**
   * Set when retrieval is *expected* to return several equally matching assets and
   * the model must then choose between them. Names the field that decides it, so
   * the audit checks the deciding metadata exists instead of demanding a rank gap.
   */
  disambiguateBy?: "recency" | "final-flag";
  preconditions?: {
    answerInCurrentContext?: boolean;
    answerInProfileL3?: boolean;
    scenePathInjected?: boolean;
    goldSkillInListing?: boolean;
    knowledgeMatchesWorkspace?: boolean;
  };
  annotationReason: string;
  /** Why exactly one asset answers this case and near misses do not. */
  uniqueness: string;
}

export interface World {
  worldId: string;
  name: string;
  split: EvalSplit;
  description: string;
  /** projectId treated as active when a case does not override it. */
  defaultProject: string;
  projects: ProjectContext[];
  profileL3: string[];
  memories: WorldMemory[];
  conversations: WorldConversation[];
  scenes: WorldScene[];
  skills: WorldSkill[];
  knowledge: WorldKnowledge[];
  cases: WorldCase[];
}

/** An EvalFixture plus the world metadata the runner needs to set up a case. */
export interface WorldFixture extends EvalFixture {
  worldId: string;
  projects: ProjectContext[];
}

const IDENTITY_FIELDS = ["user_id", "team_id", "agent_id"];

export function action(
  tool: string,
  endpoint: string,
  requiredFields: string[],
  options: Partial<NonNullable<AllowedToolAction["argumentRules"]>> = {},
): AllowedToolAction {
  return {
    tool,
    endpoint,
    argumentRules: { requiredFields, forbiddenFields: IDENTITY_FIELDS, ...options },
  };
}

export const memorySearch = (terms: string[]): AllowedToolAction => action(
  "tdai_memory_search",
  "/memory-bridge/v3/atomic/search",
  ["query"],
  { stringContainsAny: { query: terms } },
);
export const atomicQuery = (exactValues: Record<string, unknown>): AllowedToolAction => action(
  "tdai_atomic_query",
  "/memory-bridge/v3/atomic/query",
  [],
  { exactValues },
);
export const conversationSearch = (terms: string[]): AllowedToolAction => action(
  "tdai_conversation_search",
  "/memory-bridge/v3/conversation/search",
  ["query"],
  { stringContainsAny: { query: terms } },
);
export const conversationQuery = (sessionId: string): AllowedToolAction => action(
  "tdai_conversation_query",
  "/memory-bridge/v3/conversation/query",
  ["session_id"],
  { exactValues: { session_id: sessionId } },
);
export const scenarioLs = (prefix: string): AllowedToolAction => action(
  "tdai_scenario_ls",
  "/memory-bridge/v3/scenario/ls",
  [],
  { exactValues: { path_prefix: prefix } },
);
export const readScene = (path: string): AllowedToolAction => action(
  "tdai_read_scene",
  "/memory-bridge/v3/scenario/read",
  ["path"],
  { exactValues: { path }, pathFromFixture: true },
);

export const skillView = (skillName: string): AllowedToolAction => action(
  "skill_view",
  "/skill-bridge/v3/skill/get-by-name",
  ["skill_name", "include_content", "include_manifest"],
  { exactValues: { skill_name: skillName, include_content: true, include_manifest: true } },
);
export const skillSearch = (terms: string[]): AllowedToolAction => action(
  "skill_search",
  "/skill-bridge/v3/skill/search",
  ["query"],
  { stringContainsAny: { query: terms } },
);
export const skillFilesRead = (skillId: string, path: string): AllowedToolAction => action(
  "skill_files_read",
  "/skill-bridge/v3/skill/files/read",
  ["skill_id", "path"],
  { exactValues: { skill_id: skillId, path }, valueFromPreviousStep: true },
);

export const knowledgeToolsList = (knowledgeId: string): AllowedToolAction => action(
  "knowledge_tools_list",
  "/tools/list",
  ["knowledge_id"],
  { exactValues: { knowledge_id: knowledgeId } },
);
export const knowledgeCall = (
  toolName: string,
  requiredFields: string[],
  stringContainsAny?: Record<string, string[]>,
): KnowledgeCallExpectation => ({
  toolName,
  paramRules: { requiredFields, ...(stringContainsAny ? { stringContainsAny } : {}) },
});

/** Build a conversation from alternating single-line user/assistant turns. */
export function conversation(
  sessionId: string,
  project: string,
  title: string,
  startedAt: string,
  ...turns: string[]
): WorldConversation {
  return {
    sessionId,
    project,
    title,
    startedAt,
    messages: turns.map((content, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content,
    })),
  };
}

/**
 * Build a conversation from a transcript block.
 *
 * `U:` and `A:` at the start of a line open a user or assistant message; every other
 * line continues the current one, so a message can carry command output, a diff, a
 * table or a stack trace. The common indent of a message's continuation lines is
 * stripped, which keeps code indentation relative inside the message.
 *
 *   transcript("sess-x", "proj", "title", "2026-01-01T00:00:00.000Z", `
 *     U: 为什么 cache 没命中？
 *     A: 先看第一个变化位置：
 *          prefix hash V0 = 9f2c
 *          prefix hash V1 = 4ab1
 *        前缀被改了。
 *   `)
 *
 * Roles do not have to alternate: a real session has consecutive assistant messages.
 */
export function transcript(
  sessionId: string,
  project: string,
  title: string,
  startedAt: string,
  body: string,
): WorldConversation {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let role: "user" | "assistant" | null = null;
  let lines: string[] = [];

  const flush = (): void => {
    if (role === null) return;
    const continuation = lines.slice(1).filter((line) => line.trim().length > 0);
    const indent = continuation.length > 0
      ? Math.min(...continuation.map((line) => line.length - line.trimStart().length))
      : 0;
    const content = lines
      .map((line, index) => (index === 0 ? line : line.slice(indent)))
      .join("\n")
      .replace(/\s+$/, "");
    if (content.length > 0) messages.push({ role, content });
    lines = [];
  };

  for (const raw of body.split("\n")) {
    const match = raw.match(/^\s*([UA]):\s?(.*)$/);
    if (match) {
      flush();
      role = match[1] === "U" ? "user" : "assistant";
      lines = [match[2]!];
      continue;
    }
    if (role === null) continue;
    lines.push(raw);
  }
  flush();

  if (messages.length === 0) throw new Error(`${sessionId}: transcript has no messages`);
  return { sessionId, project, title, startedAt, messages };
}
