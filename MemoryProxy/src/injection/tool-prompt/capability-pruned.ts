import {
  constrainCapabilitySignature,
  getRuntimeToolContracts,
  parseCapabilitySignature,
} from "./runtime-contract.js";
import { renderSelectionGate } from "./selection-calibrated.js";
import { coordinateToolPromptSurfaceFromCapabilitySignature } from "./surface-coordinator.js";
import type {
  PromptUnit,
  RuntimeToolContract,
  ToolPromptCapabilityState,
  ToolPromptFamily,
  ToolPromptSurface,
} from "./types.js";

export interface CapabilityPruningInput {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  capabilitySignature: string;
  contracts: readonly RuntimeToolContract[];
  units: readonly PromptUnit[];
}

export interface CapabilityPruningResult {
  units: readonly PromptUnit[];
  visibleContractIds: readonly string[];
}

export type CapabilitySurfaceBundle = Partial<Record<ToolPromptSurface, string>>;

export interface ToolPromptAssetCapabilityFlags {
  skill?: boolean;
  llm_wiki?: boolean;
  code_graph?: boolean;
  chat_memory?: boolean;
}

export const CAPABILITY_PRUNING_INVENTORY = [
  {
    id: "capability.family-intersection",
    source: "injector registration + AssetCapabilityFlags",
    effect: "Suppress disabled Memory, Skill, and Knowledge surfaces.",
  },
  {
    id: "capability.skill-write",
    source: "skillRuntime.allowLlmWrite",
    effect: "Expose skill write cards only when the production bridge path is enabled.",
  },
  {
    id: "capability.skill-extract",
    source: "isExtractionAllowed(config, skill)",
    effect: "Expose skill_extract only while the main-dialog buffer is populated.",
  },
  {
    id: "capability.knowledge-subtype",
    source: "AssetCapabilityFlags.llm_wiki/code_graph",
    effect: "Keep only executable Wiki and Code Graph resource records and policy text.",
  },
  {
    id: "capability.stable-signature",
    source: "session-init capability intersection",
    effect: "Drive shared hosts, prompt bytes, audit ids, and cache separation deterministically.",
  },
] as const;

export function resolveSessionCapabilitySignature(
  baseSignature: string,
  flags: ToolPromptAssetCapabilityFlags | undefined,
): string {
  if (!flags) return baseSignature;
  return constrainCapabilitySignature(baseSignature, {
    memory: flags.chat_memory !== false,
    skill: flags.skill !== false,
    wiki: flags.llm_wiki !== false,
    codeGraph: flags.code_graph !== false,
  });
}

export function applyCapabilityPruning(
  input: CapabilityPruningInput,
): CapabilityPruningResult {
  const state = parseCapabilitySignature(input.capabilitySignature);
  assertConsistentCapabilityState(state);
  if (!state[input.family]) {
    throw new Error(`cannot compile disabled ${input.family} prompt surface ${input.surface}`);
  }
  const visibleContracts = input.contracts.filter((contract) =>
    isContractVisible(contract, state)
  );
  const visibleIds = new Set(visibleContracts.map((contract) => contract.id));
  let units = input.units.map((unit) => ({
    ...unit,
    content: pruneSurface(input.surface, unit.content, state, visibleIds),
  }));
  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(input.capabilitySignature);
  if (plan.policyHost === input.family) {
    units = units.map((unit) => unit.id === "shared.selection-gate"
      ? {
          ...unit,
          content: `${renderSelectionGate(plan.activeFamilies, {
            wiki: state.wiki,
            codeGraph: state.codeGraph,
            skillWrite: state.skillWrite,
            skillExtract: state.skillExtract,
          })}\n\n`,
        }
      : unit);
  }
  return {
    units,
    visibleContractIds: visibleContracts.map((contract) => contract.id),
  };
}

export function getVisibleRuntimeToolContracts(
  capabilitySignature: string,
  family?: ToolPromptFamily,
): readonly RuntimeToolContract[] {
  const state = parseCapabilitySignature(capabilitySignature);
  assertConsistentCapabilityState(state);
  return getRuntimeToolContracts(family).filter((contract) =>
    isContractVisible(contract, state)
  );
}

export function lintCapabilityPrunedSurface(
  bundle: CapabilitySurfaceBundle,
  capabilitySignature: string,
): void {
  const state = parseCapabilitySignature(capabilitySignature);
  assertConsistentCapabilityState(state);
  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(capabilitySignature);
  const familySurfaces: Record<ToolPromptFamily, readonly ToolPromptSurface[]> = {
    memory: ["memory-tools", "memory-guide"],
    skill: ["skill-tools", "skill-listing"],
    knowledge: ["knowledge-tools"],
  };
  for (const family of ["memory", "skill", "knowledge"] as const) {
    for (const surface of familySurfaces[family]) {
      const content = bundle[surface];
      if (state[family] && content === undefined) {
        throw new Error(`active ${family} capability is missing ${surface}`);
      }
      if (!state[family] && content !== undefined) {
        throw new Error(`disabled ${family} capability retains ${surface}`);
      }
    }
  }
  const combined = Object.values(bundle).join("\n");
  const expectedSharedCount = plan.activeFamilies.length > 0 ? 1 : 0;
  for (const marker of ["## 统一工具调用协议", "## Tool / no-tool gate"]) {
    const actual = countLiteral(combined, marker);
    if (actual !== expectedSharedCount) {
      throw new Error(`${marker} expected ${expectedSharedCount}; found ${actual}`);
    }
  }

  const actualToolIds = [...combined.matchAll(/<tool name="([^"]+)">/g)]
    .map((match) => match[1]);
  const expectedToolIds = getVisibleRuntimeToolContracts(capabilitySignature)
    .map((contract) => contract.id);
  if (JSON.stringify(actualToolIds.sort()) !== JSON.stringify([...expectedToolIds].sort())) {
    throw new Error(
      `capability tool surface mismatch: expected ${expectedToolIds.join(",")}; got ${actualToolIds.join(",")}`,
    );
  }

  const knowledge = bundle["knowledge-tools"] ?? "";
  const wikiCount = countLiteral(knowledge, '<knowledge type="wiki"');
  const codeGraphCount = countLiteral(knowledge, '<knowledge type="code-graph"');
  if (!state.wiki && wikiCount !== 0) {
    throw new Error("wiki resource remains while wiki=0");
  }
  if (!state.codeGraph && codeGraphCount !== 0) {
    throw new Error("code-graph resource remains while code_graph=0");
  }
  if (state.knowledge && wikiCount + codeGraphCount === 0) {
    throw new Error("active knowledge surface has no executable resource records");
  }
  if (!state.skillWrite && /<tool name="skill_(?:create|update|patch|delete|files_write|files_remove)">/.test(combined)) {
    throw new Error("skill write card remains while skill_write=0");
  }
  if (!state.skillExtract && combined.includes('<tool name="skill_extract">')) {
    throw new Error("skill_extract remains while skill_extract=0");
  }
}

export function assertConsistentCapabilityState(
  state: ToolPromptCapabilityState,
): void {
  if (!state.skill && (state.skillWrite || state.skillExtract)) {
    throw new Error("skill_write/skill_extract require skill=1");
  }
  if (!state.knowledge && (state.wiki || state.codeGraph)) {
    throw new Error("wiki/code_graph require knowledge=1");
  }
  if (state.knowledge && !state.wiki && !state.codeGraph) {
    throw new Error("knowledge=1 requires wiki=1 or code_graph=1");
  }
}

function isContractVisible(
  contract: RuntimeToolContract,
  state: ToolPromptCapabilityState,
): boolean {
  if (!state[contract.family]) return false;
  if (contract.capability === "skill.write") return state.skillWrite;
  if (contract.capability === "skill.extract") return state.skillExtract;
  return true;
}

function pruneSurface(
  surface: ToolPromptSurface,
  source: string,
  state: ToolPromptCapabilityState,
  visibleContractIds: ReadonlySet<string>,
): string {
  let output = source.replace(
    /  <tool name="([^"]+)">\n[\s\S]*?  <\/tool>\n?/g,
    (card, name: string) => visibleContractIds.has(name) ? card : "",
  );
  if (surface === "knowledge-tools") {
    output = output.replace(
      /<knowledge type="(wiki|code-graph)"[\s\S]*?\/>\n?/g,
      (resource, type: "wiki" | "code-graph") => {
        if (type === "wiki") return state.wiki ? resource : "";
        return state.codeGraph ? resource : "";
      },
    );
  }
  return output.replace(/\n{3,}/g, "\n\n");
}

function countLiteral(source: string, fragment: string): number {
  if (fragment.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(fragment, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + fragment.length;
  }
}
