import type { ToolPromptSpec } from "../types.js";

export const KNOWLEDGE_TOOL_PROMPT_SPECS = [
  {
    id: "knowledge_tools_list",
    contractId: "knowledge_tools_list",
    neutralPurpose: "Discover a knowledge resource's tool schemas.",
    neutralWhen: "The matching resource's tool name and parameter schema are not yet known in this session.",
    when: "A matching knowledge resource is needed and its resource-specific tool schema has not been discovered in this session.",
    neutralContrasts: [
      { confusionEdgeId: "knowledge.list-vs-call", otherTool: "knowledge_tools_call", cue: "Choose this to discover names and schemas; choose tools call after that schema is known." },
    ],
    responseHints: ["Tool names, descriptions, and parameter schemas."],
  },
  {
    id: "knowledge_tools_call",
    contractId: "knowledge_tools_call",
    neutralPurpose: "Execute one discovered knowledge tool.",
    neutralWhen: "A tool name and parameter schema from tools list are available for the same resource.",
    neutralLimitations: "The tool name and parameters come from that resource's tools list result.",
    when: "A tool name and parameter schema returned by tools/list must be executed against the same knowledge resource.",
    avoid: "Do not invent dynamic tool names or parameters.",
    neutralContrasts: [
      { confusionEdgeId: "knowledge.list-vs-call", otherTool: "knowledge_tools_list", cue: "Choose this to execute a known schema; choose tools list when names or parameters are unknown." },
    ],
    responseHints: ["The selected knowledge tool's result."],
  },
] as const satisfies readonly ToolPromptSpec[];
