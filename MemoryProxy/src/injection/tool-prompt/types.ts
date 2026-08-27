export const TOOL_PROMPT_FAMILIES = ["memory", "skill", "knowledge"] as const;

export type ToolPromptFamily = (typeof TOOL_PROMPT_FAMILIES)[number];

export const TOOL_PROMPT_SURFACES = [
  "memory-tools",
  "memory-guide",
  "skill-tools",
  "skill-listing",
  "knowledge-tools",
] as const;

export type ToolPromptSurface = (typeof TOOL_PROMPT_SURFACES)[number];

export const TOOL_PROMPT_PROFILES = [
  "legacy",
  "contract-corrected",
  "protocol-compact",
  "compact",
  "selection-calibrated",
  "capability-pruned",
] as const;

export type ToolPromptProfile = (typeof TOOL_PROMPT_PROFILES)[number];
export type CompiledToolPromptProfile = Exclude<ToolPromptProfile, "legacy">;

export type ToolPromptPhase = "read" | "lifecycle" | "write";
export type ToolPromptResponseKind = "json" | "bytes" | "dynamic-schema";

/** Runtime truth derived from Bridge allowlists and downstream schemas. */
export interface RuntimeToolContract {
  id: string;
  family: ToolPromptFamily;
  phase: ToolPromptPhase;
  method: "POST";
  path: string;
  requiredHeaders: readonly string[];
  requiredArgs: readonly string[];
  optionalArgs: readonly string[];
  forbiddenArgs: readonly string[];
  responseKind: ToolPromptResponseKind;
  capability: string;
  sourceRefs: readonly string[];
}

/** Model-facing decision semantics. Transport facts stay in RuntimeToolContract. */
export interface ToolPromptSpec {
  id: string;
  contractId: string;
  when: string;
  avoid?: string;
  contrasts?: readonly {
    otherTool: string;
    cue: string;
  }[];
  responseHints?: readonly string[];
}

export type PromptUnitKind =
  | "legacy-body"
  | "policy"
  | "execution-grammar"
  | "tool-card"
  | "dynamic-assets";

export interface PromptUnit {
  id: string;
  family: ToolPromptFamily;
  kind: PromptUnitKind;
  content: string;
  sourceSpecIds: readonly string[];
}

export interface PromptUnitInput {
  id: string;
  kind: PromptUnitKind;
  content: string;
  /** Defaults to every decision Spec in the family. Dynamic assets use []. */
  sourceSpecIds?: readonly string[];
}

export interface ToolPromptCapabilityState {
  memory: boolean;
  skill: boolean;
  knowledge: boolean;
  wiki: boolean;
  codeGraph: boolean;
  skillWrite: boolean;
  skillExtract: boolean;
}

export interface CompileToolPromptInput {
  profile: CompiledToolPromptProfile;
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  /**
   * C00 compatibility units, already ordered exactly as the production
   * renderer emits them. Joining their content must preserve every byte.
   */
  legacyUnits: readonly PromptUnitInput[];
  capabilitySignature: string;
}

export interface CompiledToolPrompt {
  compilerVersion: string;
  profile: CompiledToolPromptProfile;
  profileLineage: readonly ToolPromptProfile[];
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  capabilitySignature: string;
  content: string;
  contentSha256: string;
  units: readonly PromptUnit[];
  contractIds: readonly string[];
  specIds: readonly string[];
}
