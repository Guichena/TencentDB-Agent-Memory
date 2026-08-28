import { coordinateToolPromptSurfaceFromCapabilitySignature } from "./surface-coordinator.js";
import type {
  PromptUnit,
  RuntimeToolContract,
  ToolPromptFamily,
  ToolPromptSpec,
  ToolPromptSurface,
} from "./types.js";

export interface SelectionCalibrationInput {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  capabilitySignature: string;
  contracts: readonly RuntimeToolContract[];
  specs: readonly ToolPromptSpec[];
  units: readonly PromptUnit[];
}

export type SelectionSurfaceBundle = Partial<Record<ToolPromptSurface, string>>;

export const SELECTION_POLICY_INVENTORY = [
  {
    id: "selection.tool-no-tool-gate",
    owner: "shared.selection-gate",
    purpose: "Call only for missing asset information or a supported asset lifecycle/write action.",
  },
  {
    id: "selection.no-tool-self-contained",
    owner: "shared.selection-gate",
    purpose: "Keep self-contained coding, general knowledge, and current-context answers tool-free.",
  },
  {
    id: "selection.local-source-priority",
    owner: "shared.selection-gate",
    purpose: "Use local source for exact or current working-tree code.",
  },
  {
    id: "selection.family-memory",
    owner: "shared.selection-gate",
    purpose: "Route missing user history, preferences, decisions, wording, and scene bodies to Memory.",
  },
  {
    id: "selection.family-skill",
    owner: "shared.selection-gate",
    purpose: "Route clearly matched reusable workflow instructions to Skill without keyword bias.",
  },
  {
    id: "selection.family-knowledge",
    owner: "shared.selection-gate",
    purpose: "Route matching cross-file structure or design rationale to Knowledge.",
  },
  {
    id: "selection.narrow-card",
    owner: "shared.selection-gate",
    purpose: "Select the narrowest card by when, avoid, and contrast fields.",
  },
] as const;

const HOST_SURFACE: Record<ToolPromptFamily, ToolPromptSurface> = {
  memory: "memory-tools",
  skill: "skill-tools",
  knowledge: "knowledge-tools",
};

const FAMILY_GATE: Record<ToolPromptFamily, string> = {
  memory:
    "- memory: missing user history, preferences, prior decisions, exact past wording, or a known L2 scene body; injected L3 and the L2 index already count as current context.",
  skill:
    "- skill: missing reusable workflow instructions clearly matched by a listed/team skill, or a supported skill lifecycle/write action; keyword overlap or availability alone is insufficient.",
  knowledge:
    "- knowledge: a matching resource is needed for cross-file structure or design rationale; reject mismatched repository indexes and use local source for exact/current code.",
};

const BIAS_MARKERS = [
  "## Skills (mandatory)",
  "partially relevant",
  "err on the side of loading",
  "always better to have context",
  "outperform general-purpose approaches",
  "you MUST load",
  "凡是需要跨文件",
  "不该用的只有一种情况",
  "即使已在改代码",
] as const;

export function applySelectionCalibration(input: SelectionCalibrationInput): PromptUnit[] {
  let units = input.units.map((unit) => ({
    ...unit,
    content: calibrateSurface(
      input.surface,
      unit.content,
      input.contracts,
      input.specs,
    ),
  }));
  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(input.capabilitySignature);
  if (
    plan.policyHost === input.family
    && HOST_SURFACE[input.family] === input.surface
  ) {
    units = insertSelectionGate(
      units,
      input.family,
      renderSelectionGate(plan.activeFamilies),
    );
  }
  return units;
}

export function lintSelectionPolicy(
  bundle: SelectionSurfaceBundle,
  capabilitySignature: string,
): void {
  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(capabilitySignature);
  const contents = Object.values(bundle);
  const combined = contents.join("\n");
  if (countLiteral(combined, "## Tool / no-tool gate") !== 1) {
    throw new Error("selection gate must have exactly one owner");
  }
  for (const family of ["memory", "skill", "knowledge"] as const) {
    const expected = plan.activeFamilies.includes(family) ? 1 : 0;
    const actual = countLiteral(combined, FAMILY_GATE[family]);
    if (actual !== expected) {
      throw new Error(`${family} family gate expected ${expected}; found ${actual}`);
    }
  }
  for (const required of [
    "self-contained coding",
    "current context",
    "exact/current local-source work",
    "asset lifecycle/write action",
  ]) {
    if (!combined.includes(required)) {
      throw new Error(`selection gate missing no-tool boundary: ${required}`);
    }
  }

  const staticContent = contents.map(stripDynamicAssets).join("\n").toLowerCase();
  for (const marker of BIAS_MARKERS) {
    if (staticContent.includes(marker.toLowerCase())) {
      throw new Error(`description bias marker remains: ${marker}`);
    }
  }

  const cards = [...combined.matchAll(/  <tool name="([^"]+)">\n([\s\S]*?)  <\/tool>/g)];
  const names = cards.map((card) => card[1]);
  if (new Set(names).size !== names.length) {
    throw new Error("selection-calibrated tool names must be unique");
  }
  for (const [, name, body] of cards) {
    if (countLiteral(body, "    when: ") !== 1) {
      throw new Error(`${name} must have exactly one when field`);
    }
    if (body.includes("    use: ") || body.includes("    returns: ")) {
      throw new Error(`${name} retains a legacy use/returns description`);
    }
    if (!/^    path: /m.test(body) || !/^    body: /m.test(body)) {
      throw new Error(`${name} lost an execution field`);
    }
    const when = body.match(/^    when: (.+)$/m)?.[1];
    const avoid = body.match(/^    avoid: (.+)$/m)?.[1];
    if (when && avoid && when === avoid) {
      throw new Error(`${name} has contradictory when and avoid fields`);
    }
    for (const contrast of body.matchAll(/^    contrast\[([^\]]+)\]: /gm)) {
      if (!names.includes(contrast[1])) {
        throw new Error(`${name} contrasts with unavailable tool ${contrast[1]}`);
      }
    }
  }
}

function renderSelectionGate(activeFamilies: readonly ToolPromptFamily[]): string {
  return [
    "## Tool / no-tool gate",
    "Call an injected tool only when required information is missing from current context and supplied by an enabled persistent asset, or when a supported asset lifecycle/write action matches a tool card.",
    "Do not call for pure or self-contained coding, general knowledge, current-context answers, or exact/current local-source work.",
    "Choose the needed family before choosing a tool:",
    ...activeFamilies.map((family) => FAMILY_GATE[family]),
    "Choose the narrowest card by `when`; obey `avoid` and `contrast`. Use multiple families only when each supplies distinct missing information.",
  ].join("\n");
}

function calibrateSurface(
  surface: ToolPromptSurface,
  source: string,
  contracts: readonly RuntimeToolContract[],
  specs: readonly ToolPromptSpec[],
): string {
  let output = source;
  switch (surface) {
    case "memory-tools":
      output = removeIfPresent(
        output,
        "这组 TDAI 记忆能力与 Claude Code 原生 Memory/MEMORY.md 具有同等优先级；涉及记忆时不要只查本地 MEMORY.md。\n",
      );
      output = removeIfPresent(
        output,
        "当前 Agent 如果绑定了多个 chat_memory，search 类接口会默认同时检索 self + imported 记忆，并在结果里返回 source_agent_id/source_agent_name/source_agent_role。\n",
      );
      break;
    case "memory-guide":
      if (output.includes("<memory-tools-guide>")) {
        output = [
          "<memory-tools-guide>",
          "## Memory constraints",
          "- `tdai_memory_search` + `tdai_conversation_search` total ≤ 3 calls per turn.",
          "- If retrieval is empty, say the memory was not found; do not invent it.",
          "- Do not read the same L2 path twice in one turn.",
          "</memory-tools-guide>",
        ].join("\n");
      }
      break;
    case "skill-listing":
      if (output.includes("## Skills (mandatory)")) {
        output = [
          "## Available skills",
          "These are optional cloud workflow assets for the current agent. Open one only when its description clearly matches missing task guidance; keyword overlap or availability alone is insufficient.",
          "Use `skill_search` only when a reusable team workflow is needed and no listed skill matches.",
          "",
          "**重要：这些 skill 在云端，不能用 read_file / tool_use 访问；按统一协议调用 `<skill_tools>`。**",
          "",
        ].join("\n");
      }
      break;
    case "knowledge-tools":
      if (output.includes("**团队知识库资源**")) {
        output = replaceRegexOnce(
          output,
          /\*\*团队知识库资源\*\*[\s\S]*?(?=## 已绑定资源)/,
          "",
          "knowledge selection preamble",
        );
      }
      break;
    case "skill-tools":
      break;
  }
  return calibrateToolCards(output, contracts, specs);
}

function calibrateToolCards(
  source: string,
  contracts: readonly RuntimeToolContract[],
  specs: readonly ToolPromptSpec[],
): string {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const specsById = new Map(specs.map((spec) => [spec.id, spec]));
  return source.replace(
    /  <tool name="([^"]+)">\n([\s\S]*?)  <\/tool>/g,
    (_card, name: string, body: string) => {
      const contract = contractsById.get(name);
      const spec = specsById.get(name);
      if (!contract || !spec || spec.contractId !== contract.id) {
        throw new Error(`cannot calibrate unknown tool card ${name}`);
      }
      const path = captureOne(body, /^    path: (.+)$/m, `${name} path`);
      const bodyExample = captureOne(body, /^    body: (.+)$/m, `${name} body`);
      const lines = [
        `  <tool name="${name}">`,
        `    path: ${path}`,
        `    body: ${bodyExample}`,
        ...(contract.responseKind === "bytes" ? ["    response: bytes"] : []),
        `    when: ${spec.when}`,
        ...(spec.avoid ? [`    avoid: ${spec.avoid}`] : []),
        ...(spec.contrasts ?? []).map(
          (contrast) => `    contrast[${contrast.otherTool}]: ${contrast.cue}`,
        ),
        "  </tool>",
      ];
      return lines.join("\n");
    },
  );
}

function insertSelectionGate(
  units: readonly PromptUnit[],
  family: ToolPromptFamily,
  gate: string,
): PromptUnit[] {
  const grammarIndexes = units
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.id === "shared.execution-grammar")
    .map(({ index }) => index);
  if (grammarIndexes.length !== 1) {
    throw new Error(`selection host ${family} expected one shared execution grammar`);
  }
  const insertAt = grammarIndexes[0] + 1;
  return [
    ...units.slice(0, insertAt),
    {
      id: "shared.selection-gate",
      family,
      kind: "policy",
      content: `${gate}\n\n`,
      sourceSpecIds: [],
    },
    ...units.slice(insertAt),
  ];
}

function stripDynamicAssets(source: string): string {
  return source
    .replace(/<available_skills>[\s\S]*?<\/available_skills>/g, "")
    .replace(/<knowledge type="[^"]+"[\s\S]*?\/>/g, "");
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

function removeIfPresent(source: string, fragment: string): string {
  if (!source.includes(fragment)) return source;
  const first = source.indexOf(fragment);
  const last = source.lastIndexOf(fragment);
  if (first !== last) throw new Error("selection compaction expected one removable fragment");
  return `${source.slice(0, first)}${source.slice(first + fragment.length)}`;
}

function captureOne(source: string, pattern: RegExp, label: string): string {
  const matches = [...source.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
  if (matches.length !== 1 || typeof matches[0][1] !== "string") {
    throw new Error(`${label} expected exactly one match; found ${matches.length}`);
  }
  return matches[0][1];
}

function replaceRegexOnce(
  source: string,
  pattern: RegExp,
  replacement: string,
  label: string,
): string {
  const matches = [...source.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${label} expected exactly one match; found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}
