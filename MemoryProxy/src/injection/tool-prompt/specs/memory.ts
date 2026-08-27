import type { ToolPromptSpec } from "../types.js";

export const MEMORY_TOOL_PROMPT_SPECS = [
  {
    id: "tdai_memory_search",
    contractId: "tdai_memory_search",
    when: "A stable preference, past conclusion, instruction, or fact may exist in atomic memory.",
    contrasts: [{ otherTool: "tdai_conversation_search", cue: "Use conversation search for exact message text or timeline details." }],
  },
  {
    id: "tdai_atomic_query",
    contractId: "tdai_atomic_query",
    when: "The caller needs atomic memories filtered by type, time window, or page rather than semantic similarity.",
  },
  {
    id: "tdai_conversation_search",
    contractId: "tdai_conversation_search",
    when: "Exact historical wording, quotations, or fine-grained timeline evidence is missing from the current context.",
    contrasts: [{ otherTool: "tdai_memory_search", cue: "Use atomic search for distilled preferences and conclusions." }],
  },
  {
    id: "tdai_conversation_query",
    contractId: "tdai_conversation_query",
    when: "A known session id must be read in chronological order.",
  },
  {
    id: "tdai_scenario_ls",
    contractId: "tdai_scenario_ls",
    when: "The injected scene index is absent, stale, or must be filtered by path prefix.",
  },
  {
    id: "tdai_read_scene",
    contractId: "tdai_read_scene",
    when: "A scene path is known from the injected index or scenario listing and its full body is required.",
    avoid: "Do not invent a scene path.",
  },
] as const satisfies readonly ToolPromptSpec[];
