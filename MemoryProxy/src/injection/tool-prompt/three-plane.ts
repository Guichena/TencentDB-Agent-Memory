import { createHash } from "node:crypto";

import type {
  CompiledToolPrompt,
  PromptUnit,
  PromptUnitKind,
} from "./types.js";

export const TOOL_PROMPT_PLANES = [
  "decision",
  "execution",
  "runtime-binding",
] as const;

export type ToolPromptPlane = (typeof TOOL_PROMPT_PLANES)[number];

export interface PromptUnitPlaneMembership {
  readonly unitId: string;
  readonly unitKind: PromptUnitKind;
  readonly planes: readonly ToolPromptPlane[];
  readonly exact: boolean;
  readonly provenance: string;
}

export interface ToolPromptPlaneInventory {
  readonly inventoryVersion: "c3p-membership-v1";
  readonly profile: CompiledToolPrompt["profile"];
  readonly family: CompiledToolPrompt["family"];
  readonly surface: CompiledToolPrompt["surface"];
  readonly capabilitySignature: string;
  readonly contentSha256: string;
  readonly memberships: readonly PromptUnitPlaneMembership[];
  readonly exactOwnership: boolean;
  readonly mixedUnitIds: readonly string[];
  readonly inventorySha256: string;
}

const PLANES_BY_KIND: Readonly<Record<PromptUnitKind, readonly ToolPromptPlane[]>> = {
  "policy": ["decision"],
  "execution-grammar": ["execution"],
  "dynamic-assets": ["runtime-binding"],
  "tool-card": ["decision", "execution"],
  "legacy-body": ["decision", "execution", "runtime-binding"],
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function membershipFor(unit: PromptUnit): PromptUnitPlaneMembership {
  const planes = Object.freeze([...PLANES_BY_KIND[unit.kind]]);
  return Object.freeze({
    unitId: unit.id,
    unitKind: unit.kind,
    planes,
    exact: planes.length === 1,
    provenance: `prompt-unit-kind:${unit.kind}`,
  });
}

/**
 * Build a detached, non-provider-visible inventory of the current compiler
 * units. Mixed legacy/tool-card units remain explicitly mixed until a later
 * byte-exact partition proves that every contiguous span has one owner.
 */
export function buildToolPromptPlaneInventory(
  compiled: CompiledToolPrompt,
): ToolPromptPlaneInventory {
  const joined = compiled.units.map((unit) => unit.content).join("");
  if (joined !== compiled.content) {
    throw new Error("compiled content does not equal ordered PromptUnit bytes");
  }
  if (sha256(compiled.content) !== compiled.contentSha256) {
    throw new Error("compiled contentSha256 mismatch");
  }

  const unitIds = compiled.units.map((unit) => unit.id);
  if (new Set(unitIds).size !== unitIds.length) {
    throw new Error("compiled PromptUnit ids must be unique");
  }

  const memberships = Object.freeze(compiled.units.map(membershipFor));
  const mixedUnitIds = Object.freeze(
    memberships.filter((membership) => !membership.exact).map((membership) => membership.unitId),
  );
  const hashInput = {
    inventoryVersion: "c3p-membership-v1",
    profile: compiled.profile,
    family: compiled.family,
    surface: compiled.surface,
    capabilitySignature: compiled.capabilitySignature,
    contentSha256: compiled.contentSha256,
    memberships,
  } as const;

  return Object.freeze({
    ...hashInput,
    exactOwnership: mixedUnitIds.length === 0,
    mixedUnitIds,
    inventorySha256: sha256(JSON.stringify(hashInput)),
  });
}
