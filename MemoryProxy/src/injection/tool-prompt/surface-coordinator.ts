import { TOOL_PROMPT_FAMILIES, type ToolPromptFamily } from "./types.js";
import { parseCapabilitySignature } from "./runtime-contract.js";

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

/**
 * Resolve the same deterministic plan from the compiler's canonical capability
 * identity. This keeps host selection inside the compiler seam; injectors do
 * not need to coordinate with one another or learn profile-specific rules.
 */
export function coordinateToolPromptSurfaceFromCapabilitySignature(
  capabilitySignature: string,
): ToolPromptSurfacePlan {
  const state = parseCapabilitySignature(capabilitySignature);
  const activeFamilies = TOOL_PROMPT_FAMILIES.filter((family) => state[family]);
  return coordinateToolPromptSurface(activeFamilies);
}
