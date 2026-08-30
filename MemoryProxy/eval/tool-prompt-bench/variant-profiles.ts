import type { ToolPromptProfile } from "../../src/injection/tool-prompt/types.js";

export const TOOL_PROMPT_VARIANT_PROFILES = {
  V0: "legacy",
  "V0-C": "contract-corrected",
  V1a: "protocol-compact",
  V1: "compact",
  V2: "selection-calibrated",
  V3: "capability-pruned",
  "V4-RN": "neutral-symmetric",
} as const satisfies Record<string, ToolPromptProfile>;

export type ToolPromptVariant = keyof typeof TOOL_PROMPT_VARIANT_PROFILES;

export interface ResolvedToolPromptVariant {
  variant: ToolPromptVariant;
  profile: ToolPromptProfile;
}

export function resolveToolPromptVariant(value: string): ResolvedToolPromptVariant {
  if (Object.prototype.hasOwnProperty.call(TOOL_PROMPT_VARIANT_PROFILES, value)) {
    const variant = value as ToolPromptVariant;
    return { variant, profile: TOOL_PROMPT_VARIANT_PROFILES[variant] };
  }
  throw new Error(
    `unsupported tool prompt variant ${JSON.stringify(value)}; expected one of ${Object.keys(TOOL_PROMPT_VARIANT_PROFILES).join(", ")}`,
  );
}
