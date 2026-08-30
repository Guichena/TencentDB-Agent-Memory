import type { ToolPromptSpec } from "../types.js";

export const MEMORY_TOOL_PROMPT_SPECS = [
  {
    id: "tdai_memory_search",
    contractId: "tdai_memory_search",
    neutralPurpose: "Find semantically related atomic memories.",
    neutralWhen: "A distilled preference, conclusion, instruction, or fact is missing from current context.",
    when: "A stable preference, past conclusion, instruction, or fact may exist in atomic memory.",
    contrasts: [{ otherTool: "tdai_conversation_search", cue: "Use conversation search for exact message text or timeline details." }],
    neutralContrasts: [
      { confusionEdgeId: "memory.atomic-vs-conversation-search", otherTool: "tdai_conversation_search", cue: "Choose this for distilled memory; choose conversation search for message wording or timeline evidence." },
      { confusionEdgeId: "memory.atomic-search-vs-query", otherTool: "tdai_atomic_query", cue: "Choose this for semantic similarity; choose atomic query for filters and pagination without a search phrase." },
    ],
    responseHints: ["Matching atomic memory items."],
  },
  {
    id: "tdai_atomic_query",
    contractId: "tdai_atomic_query",
    neutralPurpose: "List atomic memories by filters and page.",
    neutralWhen: "Type, time, offset, or limit determines the requested atomic memories.",
    when: "The caller needs atomic memories filtered by type, time window, or page rather than semantic similarity.",
    neutralContrasts: [
      { confusionEdgeId: "memory.atomic-search-vs-query", otherTool: "tdai_memory_search", cue: "Choose this for filters and pagination; choose atomic search for semantic similarity to a phrase." },
    ],
    responseHints: ["Filtered atomic memory items and total count."],
  },
  {
    id: "tdai_conversation_search",
    contractId: "tdai_conversation_search",
    neutralPurpose: "Find semantically related historical messages.",
    neutralWhen: "Exact wording, quotations, or timeline evidence is missing from current context.",
    when: "Exact historical wording, quotations, or fine-grained timeline evidence is missing from the current context.",
    contrasts: [{ otherTool: "tdai_memory_search", cue: "Use atomic search for distilled preferences and conclusions." }],
    neutralContrasts: [
      { confusionEdgeId: "memory.atomic-vs-conversation-search", otherTool: "tdai_memory_search", cue: "Choose this for message wording or timeline evidence; choose atomic search for distilled memory." },
      { confusionEdgeId: "memory.conversation-search-vs-query", otherTool: "tdai_conversation_query", cue: "Choose this for semantic similarity; choose conversation query for chronological messages from a known session." },
    ],
    responseHints: ["Matching historical messages."],
  },
  {
    id: "tdai_conversation_query",
    contractId: "tdai_conversation_query",
    neutralPurpose: "List historical messages by session and page.",
    neutralWhen: "Chronological messages from a known session are needed.",
    when: "A known session id must be read in chronological order.",
    neutralContrasts: [
      { confusionEdgeId: "memory.conversation-search-vs-query", otherTool: "tdai_conversation_search", cue: "Choose this for chronological messages from a known session; choose conversation search for semantic similarity." },
    ],
    responseHints: ["Chronological messages and total count."],
  },
  {
    id: "tdai_scenario_ls",
    contractId: "tdai_scenario_ls",
    neutralPurpose: "List available scene paths.",
    neutralWhen: "The scene index is absent, stale, or needs a path-prefix filter.",
    when: "The injected scene index is absent, stale, or must be filtered by path prefix.",
    neutralContrasts: [
      { confusionEdgeId: "memory.scene-list-vs-read", otherTool: "tdai_read_scene", cue: "Choose this to discover paths; choose scene read when a known path's full body is needed." },
    ],
    responseHints: ["Scene path entries and total count."],
  },
  {
    id: "tdai_read_scene",
    contractId: "tdai_read_scene",
    neutralPurpose: "Read the full body of one scene.",
    neutralWhen: "A scene path is known and its full body is needed.",
    neutralLimitations: "The path comes from current context or a scenario listing.",
    when: "A scene path is known from the injected index or scenario listing and its full body is required.",
    avoid: "Do not invent a scene path.",
    neutralContrasts: [
      { confusionEdgeId: "memory.scene-list-vs-read", otherTool: "tdai_scenario_ls", cue: "Choose this for a known path's full body; choose scenario list to discover paths." },
    ],
    responseHints: ["Scene content and version metadata."],
  },
] as const satisfies readonly ToolPromptSpec[];
