import { createHash } from "node:crypto";
import { applyCapabilityPruning } from "./capability-pruned.js";
import { applyContractCorrections } from "./contract-corrections.js";
import { applyProtocolCompaction } from "./protocol-compact.js";
import { applySelectionCalibration } from "./selection-calibrated.js";
import { applySemanticCompaction } from "./semantic-compact.js";
import {
  getToolPromptProfileDefinition,
  getToolPromptProfileLineage,
  isTscgLiteProfile,
} from "./profiles.js";
import { getRuntimeToolContracts } from "./runtime-contract.js";
import { KNOWLEDGE_TOOL_PROMPT_SPECS } from "./specs/knowledge.js";
import { MEMORY_TOOL_PROMPT_SPECS } from "./specs/memory.js";
import { SKILL_TOOL_PROMPT_SPECS } from "./specs/skill.js";
import {
  applyTscgLiteOperators,
  TSCG_LITE_COMPILER_VERSION,
  TSCG_LITE_PROFILE_OPERATORS,
} from "./tscg-lite.js";
import type {
  CompiledToolPrompt,
  CompileToolPromptInput,
  RuntimeToolContract,
  ToolPromptFamily,
  ToolPromptSpec,
} from "./types.js";

export const TOOL_PROMPT_COMPILER_VERSION = "c05.1";

const SPECS_BY_FAMILY: Record<ToolPromptFamily, readonly ToolPromptSpec[]> = {
  memory: MEMORY_TOOL_PROMPT_SPECS,
  skill: SKILL_TOOL_PROMPT_SPECS,
  knowledge: KNOWLEDGE_TOOL_PROMPT_SPECS,
};

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateCatalog(
  family: ToolPromptFamily,
  contracts: readonly RuntimeToolContract[],
  specs: readonly ToolPromptSpec[],
): void {
  assertUnique(contracts.map((contract) => contract.id), `${family} runtime contract id`);
  assertUnique(specs.map((spec) => spec.id), `${family} prompt spec id`);

  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  for (const spec of specs) {
    const contract = contractsById.get(spec.contractId);
    if (!contract) {
      throw new Error(`${family} prompt spec ${spec.id} references missing contract ${spec.contractId}`);
    }
    if (contract.family !== family) {
      throw new Error(`${family} prompt spec ${spec.id} references ${contract.family} contract ${contract.id}`);
    }
  }

  const referenced = new Set(specs.map((spec) => spec.contractId));
  for (const contract of contracts) {
    if (!referenced.has(contract.id)) {
      throw new Error(`${family} runtime contract ${contract.id} has no prompt decision spec`);
    }
  }
}

/**
 * Compile one existing family block for a non-legacy profile.
 *
 * C00 uses a frozen compatibility Renderer. C01 applies source-proven contract
 * corrections. C02 then compiles shared protocol grammar and contract-derived
 * paths without changing decision semantics. C03 assigns each repeated
 * behaviour rule one stable owner. C04 then compiles a neutral global gate and
 * contract-backed when/avoid/contrast cards. C05 deterministically intersects
 * those surfaces with Session Init capability facts. Later profiles inherit
 * the latest completed renderer until their own stage implements a new change.
 */
export function compileToolPrompt(input: CompileToolPromptInput): CompiledToolPrompt {
  const definition = getToolPromptProfileDefinition(input.profile);
  const tscgProfile = isTscgLiteProfile(input.profile) ? input.profile : null;
  if (input.legacyUnits.length === 0) {
    throw new Error(`cannot compile empty ${input.surface} prompt surface`);
  }

  const contracts = getRuntimeToolContracts(input.family);
  const specs = SPECS_BY_FAMILY[input.family];
  validateCatalog(input.family, contracts, specs);

  assertUnique(input.legacyUnits.map((unit) => unit.id), `${input.surface} prompt unit id`);
  const allSpecIds = specs.map((spec) => spec.id);
  const knownSpecIds = new Set(allSpecIds);
  const compatibilityUnits = input.legacyUnits.map((unit) => {
    const sourceSpecIds = unit.sourceSpecIds ?? allSpecIds;
    for (const specId of sourceSpecIds) {
      if (!knownSpecIds.has(specId)) {
        throw new Error(`${input.surface} prompt unit ${unit.id} references missing spec ${specId}`);
      }
    }
    return {
      id: unit.id,
      family: input.family,
      kind: unit.kind,
      content: unit.content,
      sourceSpecIds,
    };
  });
  const correctedUnits = definition.renderer === "frozen-compatibility"
    ? compatibilityUnits
    : applyContractCorrections(input.surface, compatibilityUnits);
  const protocolUnits = definition.renderer === "protocol-compact"
    || definition.renderer === "semantic-compact"
    || definition.renderer === "selection-calibrated"
    || definition.renderer === "capability-pruned"
    || definition.renderer === "tscg-lite"
    ? applyProtocolCompaction({
        family: input.family,
        surface: input.surface,
        capabilitySignature: input.capabilitySignature,
        contracts: getRuntimeToolContracts(),
        units: correctedUnits,
      })
    : correctedUnits;
  const semanticUnits = definition.renderer === "semantic-compact"
    || definition.renderer === "selection-calibrated"
    || definition.renderer === "capability-pruned"
    || definition.renderer === "tscg-lite"
    ? applySemanticCompaction(input.surface, protocolUnits)
    : protocolUnits;
  const selectionUnits = definition.renderer === "selection-calibrated"
    || definition.renderer === "capability-pruned"
    || definition.renderer === "tscg-lite"
    ? applySelectionCalibration({
        family: input.family,
        surface: input.surface,
        capabilitySignature: input.capabilitySignature,
        contracts,
        specs,
        units: semanticUnits,
      })
    : semanticUnits;
  const capabilityResult = definition.renderer === "capability-pruned"
    || definition.renderer === "tscg-lite"
    ? applyCapabilityPruning({
        family: input.family,
        surface: input.surface,
        capabilitySignature: input.capabilitySignature,
        contracts,
        units: selectionUnits,
      })
    : null;
  const tscgResult = tscgProfile
    ? applyTscgLiteOperators({
        family: input.family,
        surface: input.surface,
        capabilitySignature: input.capabilitySignature,
        contracts,
        specs,
        units: capabilityResult?.units ?? selectionUnits,
        operators: TSCG_LITE_PROFILE_OPERATORS[tscgProfile],
      })
    : null;
  const units = tscgResult?.units ?? capabilityResult?.units ?? selectionUnits;
  const content = units.map((unit) => unit.content).join("");
  if (content.length === 0) {
    throw new Error(`cannot compile empty ${input.surface} prompt content`);
  }

  return {
    compilerVersion: tscgProfile ? TSCG_LITE_COMPILER_VERSION : TOOL_PROMPT_COMPILER_VERSION,
    profile: input.profile,
    profileLineage: getToolPromptProfileLineage(input.profile),
    family: input.family,
    surface: input.surface,
    capabilitySignature: input.capabilitySignature,
    content,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    units,
    contractIds: capabilityResult?.visibleContractIds
      ?? contracts.map((contract) => contract.id),
    specIds: capabilityResult
      ? specs
          .filter((spec) => capabilityResult.visibleContractIds.includes(spec.contractId))
          .map((spec) => spec.id)
      : specs.map((spec) => spec.id),
    ...(tscgResult?.program
      ? {
          tscgLite: {
            enabledOperators: tscgResult.enabledOperators,
            removedUnitMappings: tscgResult.removedUnitMappings,
            contractEquivalent: tscgResult.contractComparison?.equivalent ?? false,
            droRoundTrip: tscgResult.droRoundTrip,
          },
        }
      : {}),
  };
}
