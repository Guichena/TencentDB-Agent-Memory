import type {
  NeutralToolCard,
  NeutralToolCardComponent,
  PromptUnit,
  RuntimeToolContract,
  ToolCardComponent,
  ToolCardComponentMask,
  ToolPromptFamily,
  ToolPromptSpec,
  ToolPromptSurface,
} from "./types.js";
import { TOOL_CARD_COMPONENTS } from "./types.js";

export const V4_RN_RENDERER_VERSION = "v4-rn.1";

export const CANONICAL_NEUTRAL_TOOL_CARD_MASK: ToolCardComponentMask = {
  purpose: true,
  "use-when": true,
  limitations: true,
  contrast: true,
  "required-inputs": true,
  returns: true,
  execution: true,
};

export const NEUTRAL_TOOL_CARD_FIELD_LABELS: Readonly<Record<ToolCardComponent, string>> = {
  purpose: "purpose",
  "use-when": "use when",
  limitations: "limitations",
  contrast: "contrast",
  "required-inputs": "required inputs",
  returns: "returns",
  execution: "execution",
};

/** One stable causal axis owns every bidirectional contrast pair. */
export const CONFUSION_EDGE_AXES: Readonly<Record<string, string>> = {
  "memory.atomic-vs-conversation-search": "distilled atomic memory versus historical message evidence",
  "memory.atomic-search-vs-query": "semantic phrase retrieval versus filter/page retrieval",
  "memory.conversation-search-vs-query": "semantic message retrieval versus known-session chronology",
  "memory.scene-list-vs-read": "path discovery versus full-body retrieval",
  "skill.search-vs-view-name": "unknown name discovery versus known current-agent name",
  "skill.search-vs-view-id": "skill id discovery versus known id retrieval",
  "skill.view-name-vs-id": "current-agent name lookup versus exact id lookup",
  "skill.file-read-vs-download": "JSON-wrapped context content versus raw local bytes",
  "skill.create-vs-update": "new skill creation versus existing full-body replacement",
  "skill.update-vs-patch": "full-body replacement versus bounded substring replacement",
  "skill.files-write-vs-remove": "resource creation/replacement versus resource removal",
  "knowledge.list-vs-call": "dynamic schema discovery versus execution of a discovered schema",
};

export interface NeutralSymmetricToolCardInput {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  contracts: readonly RuntimeToolContract[];
  visibleContractIds: readonly string[];
  specs: readonly ToolPromptSpec[];
  units: readonly PromptUnit[];
  componentMask?: ToolCardComponentMask;
}

export interface NeutralBiasException {
  term: string;
  sourceRefs: readonly string[];
}

const TOOL_SURFACE_BY_FAMILY: Record<ToolPromptFamily, ToolPromptSurface> = {
  memory: "memory-tools",
  skill: "skill-tools",
  knowledge: "knowledge-tools",
};

const BIAS_TERMS = [
  "best",
  "preferred",
  "recommended",
  "powerful",
  "always",
  "must use whenever",
  "最佳",
  "优先",
  "推荐",
  "强大",
  "总是",
  "任何时候都必须",
] as const;

export function applyNeutralSymmetricToolCards(
  input: NeutralSymmetricToolCardInput,
): PromptUnit[] {
  lintNeutralSymmetricCatalog(input.family, input.contracts, input.specs);
  if (input.surface !== TOOL_SURFACE_BY_FAMILY[input.family]) {
    return input.units.map((unit) => ({ ...unit }));
  }

  const mask = input.componentMask ?? CANONICAL_NEUTRAL_TOOL_CARD_MASK;
  const contractsById = new Map(input.contracts.map((contract) => [contract.id, contract]));
  const specsByContractId = new Map(input.specs.map((spec) => [spec.contractId, spec]));
  const visible = new Set(input.visibleContractIds);
  const expectedOrder = input.contracts
    .filter((contract) => visible.has(contract.id))
    .map((contract) => contract.id);
  const cards: NeutralToolCard[] = [];

  const units = input.units.map((unit) => ({
    ...unit,
    content: unit.content.replace(
      /  <tool name="([^"]+)">\n([\s\S]*?)  <\/tool>/g,
      (_whole, toolId: string, body: string) => {
        if (!visible.has(toolId)) {
          throw new Error(`V4-RN retained hidden tool card ${toolId}`);
        }
        const contract = contractsById.get(toolId);
        const spec = specsByContractId.get(toolId);
        if (!contract || !spec) {
          throw new Error(`V4-RN cannot resolve tool card ${toolId}`);
        }
        const card = buildNeutralToolCard(contract, spec, body, visible);
        cards.push(card);
        return renderNeutralToolCard(card, mask);
      },
    ),
  }));

  if (JSON.stringify(cards.map((card) => card.toolId)) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      `V4-RN ${input.family} canonical order mismatch: expected ${expectedOrder.join(",")}; got ${cards.map((card) => card.toolId).join(",")}`,
    );
  }
  lintNeutralToolCards(cards);
  const content = units.map((unit) => unit.content).join("");
  lintNeutralFieldSkeleton(content, mask);
  lintNeutralContrastVisibility(content, expectedOrder);
  return units;
}

export function renderNeutralToolCard(
  card: NeutralToolCard,
  mask: ToolCardComponentMask = CANONICAL_NEUTRAL_TOOL_CARD_MASK,
): string {
  const byKind = new Map(card.components.map((component) => [component.kind, component]));
  const lines = [`  <tool name="${card.toolId}">`];
  for (const kind of TOOL_CARD_COMPONENTS) {
    if (!mask[kind]) continue;
    const component = byKind.get(kind);
    if (!component) throw new Error(`${card.toolId} missing V4-RN component ${kind}`);
    lines.push(`    ${NEUTRAL_TOOL_CARD_FIELD_LABELS[kind]}: ${component.content}`);
  }
  lines.push("  </tool>");
  return lines.join("\n");
}

export function lintNeutralToolCards(
  cards: readonly NeutralToolCard[],
  biasExceptions: readonly NeutralBiasException[] = [],
): void {
  const ids = cards.map((card) => card.toolId);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate V4-RN tool card id");
  const visible = new Set(ids);
  const edges = new Map<string, Array<{ toolId: string; otherTool: string }>>();

  for (const card of cards) {
    const kinds = card.components.map((component) => component.kind);
    if (JSON.stringify(kinds) !== JSON.stringify(TOOL_CARD_COMPONENTS)) {
      throw new Error(`${card.toolId} has non-canonical V4-RN component order`);
    }
    const normalized = new Map<string, ToolCardComponent>();
    for (const component of card.components) {
      const text = component.content.trim().toLowerCase().replace(/\s+/g, " ");
      const prior = normalized.get(text);
      if (prior && text !== "none.") {
        throw new Error(`${card.toolId} duplicates semantic unit ${prior}/${component.kind}`);
      }
      normalized.set(text, component.kind);
    }
    lintNeutralBias(card, biasExceptions);

    const contrast = card.components.find((component) => component.kind === "contrast")?.content;
    if (!contrast || contrast === "None.") continue;
    for (const match of contrast.matchAll(/\(([^)]+)\) vs ([^:|]+):/g)) {
      const edgeId = match[1];
      const otherTool = match[2].trim();
      if (!CONFUSION_EDGE_AXES[edgeId]) {
        throw new Error(`${card.toolId} references unregistered confusion edge ${edgeId}`);
      }
      if (!visible.has(otherTool)) {
        throw new Error(`${card.toolId} contrasts with unavailable tool ${otherTool}`);
      }
      const entries = edges.get(edgeId) ?? [];
      entries.push({ toolId: card.toolId, otherTool });
      edges.set(edgeId, entries);
    }
  }

  for (const [edgeId, entries] of edges) {
    if (entries.length !== 2) {
      throw new Error(`confusion edge ${edgeId} must have two visible directions; found ${entries.length}`);
    }
    const [left, right] = entries;
    if (left.toolId !== right.otherTool || right.toolId !== left.otherTool) {
      throw new Error(`confusion edge ${edgeId} is not bidirectional`);
    }
  }
}

export function lintNeutralSymmetricCatalog(
  family: ToolPromptFamily,
  contracts: readonly RuntimeToolContract[],
  specs: readonly ToolPromptSpec[],
): void {
  const contractIds = new Set(contracts.map((contract) => contract.id));
  const specsById = new Map(specs.map((spec) => [spec.id, spec]));
  const edges = new Map<string, Array<{ toolId: string; otherTool: string }>>();
  for (const spec of specs) {
    if (!contractIds.has(spec.contractId)) {
      throw new Error(`${family} V4-RN spec ${spec.id} references missing contract ${spec.contractId}`);
    }
    for (const contrast of spec.neutralContrasts ?? []) {
      if (!specsById.has(contrast.otherTool)) {
        throw new Error(`${spec.id} V4-RN contrast references missing tool ${contrast.otherTool}`);
      }
      if (!CONFUSION_EDGE_AXES[contrast.confusionEdgeId]) {
        throw new Error(`${spec.id} references unregistered confusion edge ${contrast.confusionEdgeId}`);
      }
      const entries = edges.get(contrast.confusionEdgeId) ?? [];
      entries.push({ toolId: spec.id, otherTool: contrast.otherTool });
      edges.set(contrast.confusionEdgeId, entries);
    }
  }
  for (const [edgeId, entries] of edges) {
    if (entries.length !== 2) {
      throw new Error(`catalog confusion edge ${edgeId} must have two directions; found ${entries.length}`);
    }
    const [left, right] = entries;
    if (left.toolId !== right.otherTool || right.toolId !== left.otherTool) {
      throw new Error(`catalog confusion edge ${edgeId} is not bidirectional`);
    }
  }
}

export function lintNeutralFieldSkeleton(
  content: string,
  mask: ToolCardComponentMask = CANONICAL_NEUTRAL_TOOL_CARD_MASK,
): void {
  const expected = TOOL_CARD_COMPONENTS
    .filter((kind) => mask[kind])
    .map((kind) => NEUTRAL_TOOL_CARD_FIELD_LABELS[kind]);
  const cards = [...content.matchAll(/  <tool name="([^"]+)">\n([\s\S]*?)  <\/tool>/g)];
  for (const [, toolId, body] of cards) {
    const actual = body
      .split("\n")
      .filter((line) => line.startsWith("    "))
      .map((line) => line.slice(4, line.indexOf(": ")));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${toolId} field skeleton differs from canonical V4-RN order`);
    }
  }
}

export function lintNeutralContrastVisibility(
  content: string,
  visibleToolIds: readonly string[],
): void {
  const visible = new Set(visibleToolIds);
  for (const match of content.matchAll(/\([^)]+\) vs ([^:|]+):/g)) {
    const otherTool = match[1].trim();
    if (!visible.has(otherTool)) {
      throw new Error(`V4-RN contrast retains hidden tool ${otherTool}`);
    }
  }
}

function buildNeutralToolCard(
  contract: RuntimeToolContract,
  spec: ToolPromptSpec,
  sourceBody: string,
  visible: ReadonlySet<string>,
): NeutralToolCard {
  const path = captureOne(sourceBody, /^    path: (.+)$/m, `${contract.id} path`);
  const body = captureOne(sourceBody, /^    body: (.+)$/m, `${contract.id} body`);
  const response = sourceBody.match(/^    response: (.+)$/m)?.[1] ?? contract.responseKind;
  validateExecution(contract, path, body, response);
  const decisionRef = `MemoryProxy/src/injection/tool-prompt/specs/${contract.family}.ts#${spec.id}`;
  const decisionSources = [decisionRef];
  const contractSources = [...contract.sourceRefs];
  const contrastRows = (spec.neutralContrasts ?? [])
    .filter((contrast) => visible.has(contrast.otherTool))
    .map((contrast) => `(${contrast.confusionEdgeId}) vs ${contrast.otherTool}: ${contrast.cue}`);
  const components: NeutralToolCardComponent[] = [
    component("purpose", spec.neutralPurpose, [spec.id], decisionSources),
    component("use-when", spec.neutralWhen, [spec.id], decisionSources),
    component(
      "limitations",
      spec.neutralLimitations ?? "None.",
      [spec.id],
      decisionSources,
    ),
    component("contrast", contrastRows.length > 0 ? contrastRows.join(" | ") : "None.", [spec.id], decisionSources),
    component(
      "required-inputs",
      contract.requiredArgs.length > 0 ? contract.requiredArgs.join(", ") : "none",
      [spec.id],
      contractSources,
    ),
    component(
      "returns",
      spec.responseHints?.join(" ") ?? responseHint(contract.responseKind),
      [spec.id],
      [...decisionSources, ...contractSources],
    ),
    component(
      "execution",
      `method=${contract.method}; path=${path}; headers=${contract.requiredHeaders.join(",")}; body=${body}; response=${response}`,
      [spec.id],
      contractSources,
    ),
  ];
  return { family: contract.family, toolId: contract.id, components };
}

function component(
  kind: ToolCardComponent,
  content: string,
  sourceSpecIds: readonly string[],
  sourceRefs: readonly string[],
): NeutralToolCardComponent {
  return { kind, content, sourceSpecIds, sourceRefs };
}

function validateExecution(
  contract: RuntimeToolContract,
  path: string,
  bodyText: string,
  response: string,
): void {
  const expectedPath = displayedPath(contract);
  if (path !== expectedPath) {
    throw new Error(`${contract.id} V4-RN path changed: expected ${expectedPath}; got ${path}`);
  }
  if (response !== contract.responseKind) {
    throw new Error(`${contract.id} V4-RN response changed: expected ${contract.responseKind}; got ${response}`);
  }
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${contract.id} V4-RN body is not JSON: ${(error as Error).message}`);
  }
  const present = new Set(Object.keys(body));
  for (const required of contract.requiredArgs) {
    if (!present.has(required)) throw new Error(`${contract.id} V4-RN body omits ${required}`);
  }
  for (const forbidden of contract.forbiddenArgs) {
    if (present.has(forbidden)) throw new Error(`${contract.id} V4-RN body contains forbidden ${forbidden}`);
  }
  const allowed = new Set([...contract.requiredArgs, ...contract.optionalArgs]);
  for (const field of present) {
    if (!allowed.has(field)) throw new Error(`${contract.id} V4-RN body contains unknown ${field}`);
  }
}

function displayedPath(contract: RuntimeToolContract): string {
  if (contract.family === "memory") return contract.path.slice("/memory-bridge/v3".length);
  if (contract.family === "skill") return contract.path.slice("/skill-bridge/v3/skill".length);
  return contract.path;
}

function lintNeutralBias(
  card: NeutralToolCard,
  exceptions: readonly NeutralBiasException[],
): void {
  const decisionText = card.components
    .filter((component) => component.kind !== "execution")
    .map((component) => component.content)
    .join("\n")
    .toLowerCase();
  for (const term of BIAS_TERMS) {
    if (!decisionText.includes(term.toLowerCase())) continue;
    const exception = exceptions.find((candidate) => candidate.term.toLowerCase() === term.toLowerCase());
    if (!exception || exception.sourceRefs.length === 0) {
      throw new Error(`${card.toolId} contains unreferenced bias term ${term}`);
    }
  }
}

function responseHint(kind: RuntimeToolContract["responseKind"]): string {
  if (kind === "bytes") return "Raw bytes.";
  if (kind === "dynamic-schema") return "Resource-specific dynamic-schema data.";
  return "JSON data for the next decision.";
}

function captureOne(source: string, pattern: RegExp, label: string): string {
  const matches = [...source.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
  if (matches.length !== 1 || typeof matches[0][1] !== "string") {
    throw new Error(`${label} expected exactly one match; found ${matches.length}`);
  }
  return matches[0][1];
}
