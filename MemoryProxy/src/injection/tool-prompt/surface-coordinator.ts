import { TOOL_PROMPT_FAMILIES, type ToolPromptFamily } from "./types.js";

export interface ToolPromptSurfacePlan {
  activeFamilies: readonly ToolPromptFamily[];
  policyHost: ToolPromptFamily | null;
  executionGrammarHost: ToolPromptFamily | null;
}

/**
 * Select one existing family block as the host for future shared units.
 * No new top-level block is introduced, and caller order cannot affect output.
 */
export function coordinateToolPromptSurface(
  activeFamilies: readonly ToolPromptFamily[],
): ToolPromptSurfacePlan {
  const active = new Set(activeFamilies);
  const ordered = TOOL_PROMPT_FAMILIES.filter((family) => active.has(family));
  const host = ordered[0] ?? null;
  return {
    activeFamilies: ordered,
    policyHost: host,
    executionGrammarHost: host,
  };
}
