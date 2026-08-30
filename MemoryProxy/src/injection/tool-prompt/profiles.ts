import { createHash } from "node:crypto";
import {
  ALL_TOOL_PROMPT_PROFILES,
  TSCG_LITE_PROFILES,
  type CompiledToolPromptProfile,
  type TscgLiteProfile,
  type ToolPromptProfile,
} from "./types.js";

export type { ToolPromptProfile } from "./types.js";

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
    | "tscg-lite";
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
  "tscg-sig": {
    id: "tscg-sig",
    parent: "capability-pruned",
    renderer: "tscg-lite",
  },
  "tscg-sdm": {
    id: "tscg-sdm",
    parent: "tscg-sig",
    renderer: "tscg-lite",
  },
  "tscg-dro": {
    id: "tscg-dro",
    parent: "tscg-sdm",
    renderer: "tscg-lite",
  },
  "tscg-cfo": {
    id: "tscg-cfo",
    parent: "tscg-dro",
    renderer: "tscg-lite",
  },
};

const PROFILE_SET = new Set<string>(ALL_TOOL_PROMPT_PROFILES);
const TSCG_PROFILE_SET = new Set<string>(TSCG_LITE_PROFILES);

export function parseToolPromptProfile(value: unknown): ToolPromptProfile {
  if (typeof value === "string" && PROFILE_SET.has(value)) {
    return value as ToolPromptProfile;
  }
  throw new Error(
    `invalid injection.toolPromptProfile ${JSON.stringify(value)}; expected one of ${ALL_TOOL_PROMPT_PROFILES.join(", ")}`,
  );
}

export function isTscgLiteProfile(profile: ToolPromptProfile): profile is TscgLiteProfile {
  return TSCG_PROFILE_SET.has(profile);
}

export function isCapabilityPrunedProfile(profile: ToolPromptProfile): boolean {
  return profile === "capability-pruned" || isTscgLiteProfile(profile);
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
