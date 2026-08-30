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
  readonly unitContentSha256: string;
  readonly sourceSpecIds: readonly string[];
  /** Conservative candidates until a reviewed byte-span catalog attests ownership. */
  readonly possiblePlanes: readonly ToolPromptPlane[];
  readonly exact: boolean;
  readonly provenance: string;
}

export interface ToolPromptPlaneInventory {
  readonly inventoryVersion: "c3p-membership-v2";
  readonly compilerVersion: string;
  readonly profile: CompiledToolPrompt["profile"];
  readonly profileLineage: CompiledToolPrompt["profileLineage"];
  readonly family: CompiledToolPrompt["family"];
  readonly surface: CompiledToolPrompt["surface"];
  readonly capabilitySignature: string;
  readonly contentSha256: string;
  readonly contractIds: readonly string[];
  readonly specIds: readonly string[];
  readonly memberships: readonly PromptUnitPlaneMembership[];
  readonly exactOwnership: boolean;
  readonly mixedUnitIds: readonly string[];
  readonly inventorySha256: string;
}

export interface PromptPlaneByteSpanInput {
  readonly plane: ToolPromptPlane;
  readonly byteStart: number;
  readonly byteEnd: number;
  readonly provenance: string;
}

export interface PromptUnitPlanePartition {
  readonly unitId: string;
  readonly spans: readonly PromptPlaneByteSpanInput[];
}

export interface PromptPlaneByteSpan extends PromptPlaneByteSpanInput {
  readonly unitId: string;
  readonly unitByteStart: number;
  readonly unitByteEnd: number;
  readonly promptByteStart: number;
  readonly promptByteEnd: number;
  readonly contentSha256: string;
}

export interface ToolPromptPlaneSourceMap {
  readonly sourceMapVersion: "c3p-byte-coverage-v1";
  readonly profile: CompiledToolPrompt["profile"];
  readonly family: CompiledToolPrompt["family"];
  readonly surface: CompiledToolPrompt["surface"];
  readonly capabilitySignature: string;
  readonly contentSha256: string;
  readonly inventorySha256: string;
  readonly structuralCoverageExact: true;
  readonly semanticOwnershipAttested: false;
  readonly spans: readonly PromptPlaneByteSpan[];
  readonly sourceMapSha256: string;
}

const PLANES_BY_KIND: Readonly<Record<PromptUnitKind, readonly ToolPromptPlane[]>> = {
  "policy": ["decision", "execution"],
  "execution-grammar": ["execution"],
  "dynamic-assets": ["runtime-binding"],
  "tool-card": ["decision", "execution"],
  "legacy-body": ["decision", "execution", "runtime-binding"],
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function membershipFor(unit: PromptUnit): PromptUnitPlaneMembership {
  const exactCatalogPlane = unit.id === "shared.selection-gate"
    ? "decision" as const
    : undefined;
  const possiblePlanes = Object.freeze(exactCatalogPlane
    ? [exactCatalogPlane]
    : [...PLANES_BY_KIND[unit.kind]]);
  return Object.freeze({
    unitId: unit.id,
    unitKind: unit.kind,
    unitContentSha256: sha256(unit.content),
    sourceSpecIds: Object.freeze([...unit.sourceSpecIds]),
    possiblePlanes,
    exact: possiblePlanes.length === 1,
    provenance: exactCatalogPlane
      ? "catalog:shared.selection-gate"
      : `prompt-unit-kind:${unit.kind}:fail-closed`,
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
    inventoryVersion: "c3p-membership-v2",
    compilerVersion: compiled.compilerVersion,
    profile: compiled.profile,
    profileLineage: Object.freeze([...compiled.profileLineage]),
    family: compiled.family,
    surface: compiled.surface,
    capabilitySignature: compiled.capabilitySignature,
    contentSha256: compiled.contentSha256,
    contractIds: Object.freeze([...compiled.contractIds]),
    specIds: Object.freeze([...compiled.specIds]),
    memberships,
  } as const;

  return Object.freeze({
    ...hashInput,
    exactOwnership: mixedUnitIds.length === 0,
    mixedUnitIds,
    inventorySha256: sha256(JSON.stringify(hashInput)),
  });
}

function validatePartitionSpan(
  unit: PromptUnit,
  membership: PromptUnitPlaneMembership,
  span: PromptPlaneByteSpanInput,
  expectedStart: number,
): void {
  if (!TOOL_PROMPT_PLANES.includes(span.plane)) {
    throw new Error(`unit ${unit.id} has unknown plane ${String(span.plane)}`);
  }
  if (!membership.possiblePlanes.includes(span.plane)) {
    throw new Error(`unit ${unit.id} span plane ${span.plane} is outside its possible plane set`);
  }
  const unitBytes = Buffer.from(unit.content, "utf8");
  if (!Number.isInteger(span.byteStart) || !Number.isInteger(span.byteEnd)) {
    throw new Error(`unit ${unit.id} byte span offsets must be integers`);
  }
  if (span.byteStart !== expectedStart
    || span.byteEnd <= span.byteStart
    || span.byteEnd > unitBytes.length) {
    throw new Error(`unit ${unit.id} byte spans contain a gap or overlap`);
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(unitBytes.subarray(span.byteStart, span.byteEnd));
  } catch {
    throw new Error(`unit ${unit.id} byte span splits an invalid UTF-8 boundary`);
  }
  if (span.provenance.trim().length === 0) {
    throw new Error(`unit ${unit.id} byte span provenance must be non-empty`);
  }
}

/**
 * Validate and bind structurally exact byte-span coverage. Singleton units
 * require no caller partition. Every mixed unit must provide an explicit
 * contiguous partition; the function never guesses or attests semantic
 * ownership from prose.
 */
export function buildToolPromptPlaneSourceMap(
  compiled: CompiledToolPrompt,
  partitions: readonly PromptUnitPlanePartition[],
): ToolPromptPlaneSourceMap {
  const inventory = buildToolPromptPlaneInventory(compiled);
  const unitIds = new Set(compiled.units.map((unit) => unit.id));
  const partitionsByUnit = new Map<string, PromptUnitPlanePartition>();
  for (const partition of partitions) {
    if (!unitIds.has(partition.unitId)) {
      throw new Error(`plane partition references unknown unit ${partition.unitId}`);
    }
    if (partitionsByUnit.has(partition.unitId)) {
      throw new Error(`duplicate plane partition for unit ${partition.unitId}`);
    }
    partitionsByUnit.set(partition.unitId, partition);
  }

  const spans: PromptPlaneByteSpan[] = [];
  let promptByteOffset = 0;
  for (let index = 0; index < compiled.units.length; index += 1) {
    const unit = compiled.units[index];
    const membership = inventory.memberships[index];
    const explicit = partitionsByUnit.get(unit.id);
    let unitSpans: readonly PromptPlaneByteSpanInput[];

    if (membership.exact) {
      if (explicit) {
        throw new Error(`exact unit ${unit.id} must not override its plane membership`);
      }
      const unitByteLength = Buffer.byteLength(unit.content);
      unitSpans = unitByteLength === 0
        ? []
        : [{
            plane: membership.possiblePlanes[0],
            byteStart: 0,
            byteEnd: unitByteLength,
            provenance: membership.provenance,
          }];
    } else {
      if (Buffer.byteLength(unit.content) === 0) {
        if (explicit) throw new Error(`empty mixed unit ${unit.id} must not define byte spans`);
        unitSpans = [];
      } else if (!explicit || explicit.spans.length === 0) {
        throw new Error(`mixed unit ${unit.id} requires exact byte spans`);
      } else {
        unitSpans = explicit.spans;
      }
    }

    let expectedStart = 0;
    const usedPlanes = new Set<ToolPromptPlane>();
    const unitBytes = Buffer.from(unit.content, "utf8");
    for (const span of unitSpans) {
      validatePartitionSpan(unit, membership, span, expectedStart);
      const slice = unitBytes.subarray(span.byteStart, span.byteEnd);
      spans.push(Object.freeze({
        plane: span.plane,
        byteStart: span.byteStart,
        byteEnd: span.byteEnd,
        provenance: span.provenance,
        unitId: unit.id,
        unitByteStart: span.byteStart,
        unitByteEnd: span.byteEnd,
        promptByteStart: promptByteOffset + span.byteStart,
        promptByteEnd: promptByteOffset + span.byteEnd,
        contentSha256: sha256(slice),
      }));
      expectedStart = span.byteEnd;
      usedPlanes.add(span.plane);
    }
    if (expectedStart !== unitBytes.length) {
      throw new Error(`unit ${unit.id} byte spans contain a gap or overlap`);
    }
    if (unitBytes.length > 0) {
      const missingPlanes = membership.possiblePlanes.filter((plane) => !usedPlanes.has(plane));
      if (missingPlanes.length > 0) {
        throw new Error(`unit ${unit.id} byte spans do not cover declared planes: ${missingPlanes.join(",")}`);
      }
    }
    promptByteOffset += unitBytes.length;
  }
  if (promptByteOffset !== Buffer.byteLength(compiled.content)
    || spans.at(-1)?.promptByteEnd !== Buffer.byteLength(compiled.content)) {
    throw new Error("plane byte spans do not cover compiled content exactly");
  }

  const frozenSpans = Object.freeze(spans);
  const hashInput = {
    sourceMapVersion: "c3p-byte-coverage-v1",
    profile: compiled.profile,
    family: compiled.family,
    surface: compiled.surface,
    capabilitySignature: compiled.capabilitySignature,
    contentSha256: compiled.contentSha256,
    inventorySha256: inventory.inventorySha256,
    spans: frozenSpans,
  } as const;
  return Object.freeze({
    ...hashInput,
    structuralCoverageExact: true as const,
    semanticOwnershipAttested: false as const,
    sourceMapSha256: sha256(JSON.stringify(hashInput)),
  });
}
