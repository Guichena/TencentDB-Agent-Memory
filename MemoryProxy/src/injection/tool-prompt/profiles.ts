import { createHash } from "node:crypto";
import {
  TOOL_PROMPT_PROFILE_IDS,
  type CompiledToolPromptProfile,
  type ToolPromptProfile,
} from "./types.js";

export interface ToolPromptProfileDefinition {
  id: ToolPromptProfile;
  parent: ToolPromptProfile | null;
  renderer:
    | "frozen-compatibility"
    | "contract-corrected"
    | "protocol-compact"
    | "semantic-compact"
    | "selection-calibrated"
    | "capability-pruned"
    | "typed-action-graph"
    | "typed-action-graph-deduplicated";
}

const DEFINITIONS: Record<ToolPromptProfile, ToolPromptProfileDefinition> = {
  legacy: { id: "legacy", parent: null, renderer: "frozen-compatibility" },
  "contract-corrected": {
    id: "contract-corrected",
    parent: "legacy",
    renderer: "contract-corrected",
  },
  "protocol-compact": {
    id: "protocol-compact",
    parent: "contract-corrected",
    renderer: "protocol-compact",
  },
  compact: {
    id: "compact",
    parent: "protocol-compact",
    renderer: "semantic-compact",
  },
  "selection-calibrated": {
    id: "selection-calibrated",
    parent: "compact",
    renderer: "selection-calibrated",
  },
  "capability-pruned": {
    id: "capability-pruned",
    parent: "selection-calibrated",
    renderer: "capability-pruned",
  },
  "typed-action-graph": {
    id: "typed-action-graph",
    parent: "capability-pruned",
    renderer: "typed-action-graph",
  },
  "typed-action-graph-deduplicated": {
    id: "typed-action-graph-deduplicated",
    parent: "typed-action-graph",
    renderer: "typed-action-graph-deduplicated",
  },
};

const PROFILE_SET = new Set<string>(TOOL_PROMPT_PROFILE_IDS);

export function parseToolPromptProfile(value: unknown): ToolPromptProfile {
  if (typeof value === "string" && PROFILE_SET.has(value)) {
    return value as ToolPromptProfile;
  }
  throw new Error(
    `invalid injection.toolPromptProfile ${JSON.stringify(value)}; expected one of ${TOOL_PROMPT_PROFILE_IDS.join(", ")}`,
  );
}

export function getToolPromptProfileDefinition(
  profile: ToolPromptProfile,
): ToolPromptProfileDefinition {
  return DEFINITIONS[profile];
}

export function getToolPromptProfileLineage(
  profile: CompiledToolPromptProfile,
): readonly ToolPromptProfile[] {
  const lineage: ToolPromptProfile[] = [];
  let current: ToolPromptProfile | null = profile;
  while (current) {
    lineage.push(current);
    current = DEFINITIONS[current].parent;
  }
  return lineage.reverse();
}

export function toolPromptCacheIdentity(
  hookId: string,
  profile: ToolPromptProfile,
  capabilitySignature: string,
): string | undefined {
  if (profile === "legacy") return undefined;
  const capabilityHash = createHash("sha256")
    .update(capabilitySignature)
    .digest("hex")
    .slice(0, 12);
  return `${hookId}-tp-${profile}-${capabilityHash}`;
}

/** Profiles at and after V3 must use Session-effective capability facts. */
export function usesCapabilityPruning(profile: ToolPromptProfile): boolean {
  return profile === "capability-pruned"
    || profile === "typed-action-graph"
    || profile === "typed-action-graph-deduplicated";
}

export type { ToolPromptProfile } from "./types.js";
