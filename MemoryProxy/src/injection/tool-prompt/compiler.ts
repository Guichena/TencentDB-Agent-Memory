import { createHash } from "node:crypto";
import { getToolPromptProfileDefinition, getToolPromptProfileLineage } from "./profiles.js";
import { getRuntimeToolContracts } from "./runtime-contract.js";
import { KNOWLEDGE_TOOL_PROMPT_SPECS } from "./specs/knowledge.js";
import { MEMORY_TOOL_PROMPT_SPECS } from "./specs/memory.js";
import { SKILL_TOOL_PROMPT_SPECS } from "./specs/skill.js";
import type {
  CompiledToolPrompt,
  CompileToolPromptInput,
  RuntimeToolContract,
  ToolPromptFamily,
  ToolPromptSpec,
} from "./types.js";

export const TOOL_PROMPT_COMPILER_VERSION = "c00.1";

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
 * C00 deliberately uses a frozen compatibility Renderer. It validates the
 * Runtime Contract and decision Spec catalog, wraps the unchanged production
 * bytes in ordered PromptUnits, and emits deterministic audit metadata. A
 * mixed surface may already separate stable policy from dynamic assets without
 * changing their joined bytes. Later stages replace only the internal Renderer
 * selected by the profile definition.
 */
export function compileToolPrompt(input: CompileToolPromptInput): CompiledToolPrompt {
  const definition = getToolPromptProfileDefinition(input.profile);
  if (definition.renderer !== "frozen-compatibility") {
    throw new Error(`unsupported renderer ${definition.renderer} for ${input.profile}`);
  }
  if (input.legacyUnits.length === 0) {
    throw new Error(`cannot compile empty ${input.surface} prompt surface`);
  }

  const contracts = getRuntimeToolContracts(input.family);
  const specs = SPECS_BY_FAMILY[input.family];
  validateCatalog(input.family, contracts, specs);

  assertUnique(input.legacyUnits.map((unit) => unit.id), `${input.surface} prompt unit id`);
  const allSpecIds = specs.map((spec) => spec.id);
  const knownSpecIds = new Set(allSpecIds);
  const units = input.legacyUnits.map((unit) => {
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
  const content = units.map((unit) => unit.content).join("");
  if (content.length === 0) {
    throw new Error(`cannot compile empty ${input.surface} prompt content`);
  }

  return {
    compilerVersion: TOOL_PROMPT_COMPILER_VERSION,
    profile: input.profile,
    profileLineage: getToolPromptProfileLineage(input.profile),
    family: input.family,
    surface: input.surface,
    capabilitySignature: input.capabilitySignature,
    content,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    units,
    contractIds: contracts.map((contract) => contract.id),
    specIds: specs.map((spec) => spec.id),
  };
}
