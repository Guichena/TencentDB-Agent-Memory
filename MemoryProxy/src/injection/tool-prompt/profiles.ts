import { createHash } from "node:crypto";
import {
  TOOL_PROMPT_PROFILES,
  type CompiledToolPromptProfile,
  type ToolPromptProfile,
} from "./types.js";

export interface ToolPromptProfileDefinition {
  id: ToolPromptProfile;
  parent: ToolPromptProfile | null;
  /** C00 keeps every compiled profile byte-equivalent to the frozen renderer. */
  renderer: "frozen-compatibility";
}

const DEFINITIONS: Record<ToolPromptProfile, ToolPromptProfileDefinition> = {
  legacy: { id: "legacy", parent: null, renderer: "frozen-compatibility" },
  "contract-corrected": {
    id: "contract-corrected",
    parent: "legacy",
    renderer: "frozen-compatibility",
  },
  "protocol-compact": {
    id: "protocol-compact",
    parent: "contract-corrected",
    renderer: "frozen-compatibility",
  },
  compact: {
    id: "compact",
    parent: "protocol-compact",
    renderer: "frozen-compatibility",
  },
  "selection-calibrated": {
    id: "selection-calibrated",
    parent: "compact",
    renderer: "frozen-compatibility",
  },
  "capability-pruned": {
    id: "capability-pruned",
    parent: "selection-calibrated",
    renderer: "frozen-compatibility",
  },
};

const PROFILE_SET = new Set<string>(TOOL_PROMPT_PROFILES);

export function parseToolPromptProfile(value: unknown): ToolPromptProfile {
  if (typeof value === "string" && PROFILE_SET.has(value)) {
    return value as ToolPromptProfile;
  }
  throw new Error(
    `invalid injection.toolPromptProfile ${JSON.stringify(value)}; expected one of ${TOOL_PROMPT_PROFILES.join(", ")}`,
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
