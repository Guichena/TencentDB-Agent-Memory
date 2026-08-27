import type { ToolPromptSpec } from "../types.js";

export const KNOWLEDGE_TOOL_PROMPT_SPECS = [
  {
    id: "knowledge_tools_list",
    contractId: "knowledge_tools_list",
    when: "A matching knowledge resource is needed and its resource-specific tool schema has not been discovered in this session.",
  },
  {
    id: "knowledge_tools_call",
    contractId: "knowledge_tools_call",
    when: "A tool name and parameter schema returned by tools/list must be executed against the same knowledge resource.",
    avoid: "Do not invent dynamic tool names or parameters.",
  },
] as const satisfies readonly ToolPromptSpec[];
