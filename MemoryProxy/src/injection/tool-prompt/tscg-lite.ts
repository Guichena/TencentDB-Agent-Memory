import type {
  PromptUnit,
  RuntimeToolContract,
  ToolPromptFamily,
  ToolPromptOperation,
  ToolPromptPhase,
  ToolPromptResponseKind,
  ToolPromptSpec,
  ToolPromptSurface,
  TscgLiteProfile,
} from "./types.js";
import { coordinateToolPromptSurfaceFromCapabilitySignature } from "./surface-coordinator.js";

export const TSCG_LITE_COMPILER_VERSION = "tscg-lite.1";

export const TSCG_LITE_OPERATOR_IDS = [
  "typed-signature",
  "sdm",
  "dro",
  "cfo",
] as const;

export type TscgLiteOperatorId = (typeof TSCG_LITE_OPERATOR_IDS)[number];

export interface TscgLiteOperatorFlags {
  typedSignature: boolean;
  sdm: boolean;
  dro: boolean;
  cfo: boolean;
}

export const TSCG_LITE_PROFILE_OPERATORS: Record<
  TscgLiteProfile,
  TscgLiteOperatorFlags
> = {
  "tscg-sig": { typedSignature: true, sdm: false, dro: false, cfo: false },
  "tscg-sdm": { typedSignature: true, sdm: true, dro: false, cfo: false },
  "tscg-dro": { typedSignature: true, sdm: true, dro: true, cfo: false },
  "tscg-cfo": { typedSignature: true, sdm: true, dro: true, cfo: true },
};

export const TSCG_LITE_OPERATOR_INVENTORY = [
  {
    id: "typed-signature",
    input: "V3 capability-pruned tool cards",
    output: "fixed-field contract and decision records",
    changedFields: ["representation", "endpoint binding semantics"],
    preservedInvariants: [
      "tool id",
      "method/path/headers",
      "required/optional/forbidden args",
      "phase/capability/operation/response kind",
      "when/avoid/contrast",
    ],
  },
  {
    id: "sdm",
    input: "typed records",
    output: "typed records with repeated exact values inherited from one defaults record",
    changedFields: ["method", "headers", "phase", "capability", "operation", "response"],
    preservedInvariants: ["resolved contract fields", "when/avoid/contrast", "tool order"],
  },
  {
    id: "dro",
    input: "readable typed records",
    output: "escaped delimiter records",
    changedFields: ["delimiters", "field labels", "record layout"],
    preservedInvariants: ["semantic field set", "record order", "parse/round-trip"],
  },
  {
    id: "cfo",
    input: "delimiter records",
    output: "the same records in stable dependency order",
    changedFields: ["tool order"],
    preservedInvariants: ["record bytes", "contract fields", "decision fields"],
  },
] as const;

export const TSCG_SIGNATURE_FIELD_ORDER = [
  "id",
  "method",
  "path",
  "requiredHeaders",
  "requiredArgs",
  "optionalArgs",
  "forbiddenArgs",
  "phase",
  "capability",
  "operation",
  "responseKind",
] as const;

type DefaultableField =
  | "method"
  | "requiredHeaders"
  | "phase"
  | "capability"
  | "operation"
  | "responseKind";

const DEFAULTABLE_FIELDS = [
  "method",
  "requiredHeaders",
  "phase",
  "capability",
  "operation",
  "responseKind",
] as const satisfies readonly DefaultableField[];

export interface TscgContractRecord {
  id: string;
  method: "POST";
  path: string;
  requiredHeaders: readonly string[];
  requiredArgs: readonly string[];
  optionalArgs: readonly string[];
  forbiddenArgs: readonly string[];
  phase: ToolPromptPhase;
  capability: string;
  operation: ToolPromptOperation;
  responseKind: ToolPromptResponseKind;
}

export interface TscgDecisionRecord {
  when: string;
  avoid?: string;
  contrasts: readonly { otherTool: string; cue: string }[];
}

export interface TscgToolRecord {
  contract: TscgContractRecord;
  decision: TscgDecisionRecord;
}

export type TscgDefaults = Partial<Pick<TscgContractRecord, DefaultableField>>;

export interface TscgRemovedUnitMapping {
  sourceUnit: string;
  retainedUnit: string;
  field: DefaultableField | "executionGrammar";
  canonicalValue: string;
}

interface TscgDefaultUnitMapping extends TscgRemovedUnitMapping {
  field: DefaultableField;
}

export interface TscgDependencyEdge {
  from: string;
  to: string;
  flow: string;
}

export interface TscgPromptProgram {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  tools: readonly TscgToolRecord[];
  defaults: TscgDefaults;
  omittedFields: Readonly<Record<string, readonly DefaultableField[]>>;
  dependencyEdges: readonly TscgDependencyEdge[];
}

export interface TscgContractComparison {
  equivalent: boolean;
  differences: readonly string[];
}

export interface TscgDroRoundTripResult {
  encoded: string;
  decoded: TscgPromptProgram;
  identical: boolean;
}

export interface ApplyTscgLiteInput {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  capabilitySignature: string;
  contracts: readonly RuntimeToolContract[];
  specs: readonly ToolPromptSpec[];
  units: readonly PromptUnit[];
  operators: TscgLiteOperatorFlags;
}

export interface ApplyTscgLiteResult {
  units: readonly PromptUnit[];
  program: TscgPromptProgram | null;
  enabledOperators: readonly TscgLiteOperatorId[];
  removedUnitMappings: readonly TscgRemovedUnitMapping[];
  contractComparison: TscgContractComparison | null;
  droRoundTrip: boolean | null;
}

export const TSCG_DEPENDENCY_EDGES = [
  { from: "tdai_scenario_ls", to: "tdai_read_scene", flow: "scene path" },
  { from: "skill_search", to: "skill_view_by_id", flow: "skill_id" },
  { from: "skill_view", to: "skill_files_read", flow: "skill_id/path" },
  { from: "skill_view", to: "skill_files_download", flow: "skill_id/path" },
  { from: "skill_view_by_id", to: "skill_files_read", flow: "skill_id/path" },
  { from: "skill_view_by_id", to: "skill_files_download", flow: "skill_id/path" },
  { from: "skill_view", to: "skill_update", flow: "skill_id/expected_version" },
  { from: "skill_view", to: "skill_patch", flow: "skill_id/expected_version" },
  { from: "skill_view", to: "skill_delete", flow: "skill_id/expected_version" },
  { from: "skill_view", to: "skill_files_write", flow: "skill_id/expected_version" },
  { from: "skill_view", to: "skill_files_remove", flow: "skill_id/expected_version" },
  { from: "knowledge_tools_list", to: "knowledge_tools_call", flow: "tool_name/schema" },
] as const satisfies readonly TscgDependencyEdge[];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(value: unknown): string {
  return JSON.stringify(value);
}

function cloneOperation(operation: ToolPromptOperation): ToolPromptOperation {
  return operation.kind === "none"
    ? { kind: "none" }
    : { kind: "argument", path: operation.path };
}

export function projectRuntimeContract(contract: RuntimeToolContract): TscgContractRecord {
  return {
    id: contract.id,
    method: contract.method,
    path: contract.path,
    requiredHeaders: [...contract.requiredHeaders],
    requiredArgs: [...contract.requiredArgs],
    optionalArgs: [...contract.optionalArgs],
    forbiddenArgs: [...contract.forbiddenArgs],
    phase: contract.phase,
    capability: contract.capability,
    operation: cloneOperation(contract.operation),
    responseKind: contract.responseKind,
  };
}

export function getVisibleTscgDependencyEdges(
  toolIds: readonly string[],
  edges: readonly TscgDependencyEdge[] = TSCG_DEPENDENCY_EDGES,
): TscgDependencyEdge[] {
  const visible = new Set(toolIds);
  return edges
    .filter((edge) => visible.has(edge.from) && visible.has(edge.to))
    .map((edge) => ({ ...edge }))
    .sort((left, right) => (
      compareText(left.from, right.from)
      || compareText(left.to, right.to)
      || compareText(left.flow, right.flow)
    ));
}

export function buildTypedSignatureProgram(input: {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  contracts: readonly RuntimeToolContract[];
  specs: readonly ToolPromptSpec[];
  orderedToolIds?: readonly string[];
}): TscgPromptProgram {
  const contracts = new Map(input.contracts.map((contract) => [contract.id, contract]));
  const specs = new Map(input.specs.map((spec) => [spec.contractId, spec]));
  const orderedIds = input.orderedToolIds ?? input.contracts.map((contract) => contract.id);
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("TSCG typed signature input contains duplicate tool ids");
  }
  const tools = orderedIds.map((id) => {
    const contract = contracts.get(id);
    const spec = specs.get(id);
    if (!contract || contract.family !== input.family) {
      throw new Error(`TSCG missing ${input.family} runtime contract ${id}`);
    }
    if (!spec || spec.contractId !== contract.id) {
      throw new Error(`TSCG missing decision spec for ${id}`);
    }
    return {
      contract: projectRuntimeContract(contract),
      decision: {
        when: spec.when,
        ...(spec.avoid ? { avoid: spec.avoid } : {}),
        contrasts: (spec.contrasts ?? []).map((contrast) => ({ ...contrast })),
      },
    };
  });
  const visible = new Set(orderedIds);
  for (const tool of tools) {
    for (const contrast of tool.decision.contrasts) {
      if (!visible.has(contrast.otherTool)) {
        throw new Error(
          `TSCG ${tool.contract.id} contrasts with capability-pruned tool ${contrast.otherTool}`,
        );
      }
    }
  }
  return {
    family: input.family,
    surface: input.surface,
    tools,
    defaults: {},
    omittedFields: {},
    dependencyEdges: getVisibleTscgDependencyEdges(orderedIds),
  };
}

function selectCanonicalDefault(
  tools: readonly TscgToolRecord[],
  field: DefaultableField,
): unknown | undefined {
  const byValue = new Map<string, { count: number; value: unknown }>();
  for (const tool of tools) {
    const value = tool.contract[field];
    const key = stableValue(value);
    const current = byValue.get(key);
    byValue.set(key, { count: (current?.count ?? 0) + 1, value });
  }
  const ranked = [...byValue.entries()].sort((left, right) => (
    right[1].count - left[1].count || compareText(left[0], right[0])
  ));
  return ranked[0]?.[1].count >= 2 ? ranked[0][1].value : undefined;
}

export function applySemanticDeduplication(program: TscgPromptProgram): {
  program: TscgPromptProgram;
  removedUnitMappings: readonly TscgDefaultUnitMapping[];
} {
  const defaults: TscgDefaults = {};
  const omittedFields: Record<string, DefaultableField[]> = {};
  const removedUnitMappings: TscgDefaultUnitMapping[] = [];
  for (const field of DEFAULTABLE_FIELDS) {
    const value = selectCanonicalDefault(program.tools, field);
    if (value === undefined) continue;
    (defaults as Record<string, unknown>)[field] = value;
    for (const tool of program.tools) {
      if (stableValue(tool.contract[field]) !== stableValue(value)) continue;
      (omittedFields[tool.contract.id] ??= []).push(field);
      removedUnitMappings.push({
        sourceUnit: `${tool.contract.id}.${field}`,
        retainedUnit: `defaults.${field}`,
        field,
        canonicalValue: stableValue(value),
      });
    }
  }
  return {
    program: {
      ...program,
      defaults,
      omittedFields,
      tools: program.tools.map((tool) => ({
        contract: { ...tool.contract, operation: cloneOperation(tool.contract.operation) },
        decision: {
          ...tool.decision,
          contrasts: tool.decision.contrasts.map((contrast) => ({ ...contrast })),
        },
      })),
    },
    removedUnitMappings,
  };
}

export function stableTopologicalOrder(
  toolIds: readonly string[],
  edges: readonly TscgDependencyEdge[],
): string[] {
  if (new Set(toolIds).size !== toolIds.length) {
    throw new Error("TSCG CFO received duplicate tool ids");
  }
  const nodes = new Set(toolIds);
  const outgoing = new Map(toolIds.map((id) => [id, new Set<string>()]));
  const indegree = new Map(toolIds.map((id) => [id, 0]));
  for (const edge of edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error(`TSCG CFO dangling edge ${edge.from}->${edge.to}`);
    }
    if (outgoing.get(edge.from)!.has(edge.to)) continue;
    outgoing.get(edge.from)!.add(edge.to);
    indegree.set(edge.to, indegree.get(edge.to)! + 1);
  }
  const ready = toolIds.filter((id) => indegree.get(id) === 0).sort(compareText);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const target of [...outgoing.get(id)!].sort(compareText)) {
      const next = indegree.get(target)! - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort(compareText);
      }
    }
  }
  if (ordered.length !== toolIds.length) {
    const cycle = toolIds.filter((id) => !ordered.includes(id)).sort(compareText);
    throw new Error(`TSCG CFO dependency cycle: ${cycle.join(" -> ")}`);
  }
  return ordered;
}

export function applyContractFlowOrdering(program: TscgPromptProgram): TscgPromptProgram {
  const ids = program.tools.map((tool) => tool.contract.id);
  const edges = getVisibleTscgDependencyEdges(ids, program.dependencyEdges);
  const order = stableTopologicalOrder(ids, edges);
  const tools = new Map(program.tools.map((tool) => [tool.contract.id, tool]));
  return {
    ...program,
    tools: order.map((id) => tools.get(id)!),
    dependencyEdges: edges,
  };
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? "-" : values.join(",");
}

function formatOperation(operation: ToolPromptOperation): string {
  return operation.kind === "none" ? "none" : `argument:${operation.path}`;
}

function parseOperation(value: string): ToolPromptOperation {
  if (value === "none") return { kind: "none" };
  if (value.startsWith("argument:") && value.length > "argument:".length) {
    return { kind: "argument", path: value.slice("argument:".length) };
  }
  throw new Error(`invalid TSCG operation ${JSON.stringify(value)}`);
}

function renderReadableDefaults(defaults: TscgDefaults): string | null {
  const lines: string[] = [];
  for (const field of DEFAULTABLE_FIELDS) {
    const value = defaults[field];
    if (value === undefined) continue;
    const rendered = field === "requiredHeaders"
      ? formatList(value as readonly string[])
      : field === "operation"
        ? formatOperation(value as ToolPromptOperation)
        : String(value);
    lines.push(`    ${field}: ${rendered}`);
  }
  return lines.length === 0
    ? null
    : ["  [typed-defaults]", ...lines, "  [/typed-defaults]"].join("\n");
}

function renderReadableTool(
  tool: TscgToolRecord,
  omitted: readonly DefaultableField[],
): string {
  const skip = new Set(omitted);
  const contract = tool.contract;
  const lines = ["  [typed-tool]", `    id: ${contract.id}`];
  if (!skip.has("method")) lines.push(`    method: ${contract.method}`);
  lines.push(`    path: ${contract.path}`);
  if (!skip.has("requiredHeaders")) {
    lines.push(`    requiredHeaders: ${formatList(contract.requiredHeaders)}`);
  }
  lines.push(`    requiredArgs: ${formatList(contract.requiredArgs)}`);
  lines.push(`    optionalArgs: ${formatList(contract.optionalArgs)}`);
  lines.push(`    forbiddenArgs: ${formatList(contract.forbiddenArgs)}`);
  if (!skip.has("phase")) lines.push(`    phase: ${contract.phase}`);
  if (!skip.has("capability")) lines.push(`    capability: ${contract.capability}`);
  if (!skip.has("operation")) lines.push(`    operation: ${formatOperation(contract.operation)}`);
  if (!skip.has("responseKind")) lines.push(`    responseKind: ${contract.responseKind}`);
  lines.push(`    when: ${tool.decision.when}`);
  if (tool.decision.avoid) lines.push(`    avoid: ${tool.decision.avoid}`);
  for (const contrast of tool.decision.contrasts) {
    lines.push(`    contrast[${contrast.otherTool}]: ${contrast.cue}`);
  }
  lines.push("  [/typed-tool]");
  return lines.join("\n");
}

export function encodeTscgField(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("|", "%7C")
    .replaceAll("^", "%5E")
    .replaceAll(">", "%3E")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export function decodeTscgField(value: string): string {
  return value.replace(/%([0-9A-F]{2})/g, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
}

function encodeList(values: readonly string[]): string {
  return values.length === 0
    ? "-"
    : values.map((value) => encodeTscgField(value).replaceAll(",", "%2C")).join(",");
}

function decodeList(value: string): string[] {
  return value === "-" ? [] : value.split(",").map(decodeTscgField);
}

const DRO_DEFAULT_KEYS: Record<DefaultableField, string> = {
  method: "m",
  requiredHeaders: "h",
  phase: "ph",
  capability: "cap",
  operation: "op",
  responseKind: "r",
};

function encodeDefaultValue(field: DefaultableField, value: unknown): string {
  if (field === "requiredHeaders") return encodeList(value as readonly string[]);
  if (field === "operation") return encodeTscgField(formatOperation(value as ToolPromptOperation));
  return encodeTscgField(String(value));
}

export function encodeDroProgram(program: TscgPromptProgram): string {
  const defaultFields = DEFAULTABLE_FIELDS.flatMap((field) => {
    const value = program.defaults[field];
    return value === undefined ? [] : [`${DRO_DEFAULT_KEYS[field]}=${encodeDefaultValue(field, value)}`];
  });
  const records: string[] = defaultFields.length > 0 ? [`  @D|${defaultFields.join("|")}`] : [];
  for (const tool of program.tools) {
    const contract = tool.contract;
    const omitted = new Set(program.omittedFields[contract.id] ?? []);
    const fields = [
      `id=${encodeTscgField(contract.id)}`,
      ...(!omitted.has("method") ? [`m=${contract.method}`] : []),
      `p=${encodeTscgField(contract.path)}`,
      ...(!omitted.has("requiredHeaders") ? [`h=${encodeList(contract.requiredHeaders)}`] : []),
      `req=${encodeList(contract.requiredArgs)}`,
      `opt=${encodeList(contract.optionalArgs)}`,
      `x=${encodeList(contract.forbiddenArgs)}`,
      ...(!omitted.has("phase") ? [`ph=${contract.phase}`] : []),
      ...(!omitted.has("capability") ? [`cap=${encodeTscgField(contract.capability)}`] : []),
      ...(!omitted.has("operation") ? [`op=${encodeTscgField(formatOperation(contract.operation))}`] : []),
      ...(!omitted.has("responseKind") ? [`r=${contract.responseKind}`] : []),
      `w=${encodeTscgField(tool.decision.when)}`,
      ...(tool.decision.avoid ? [`a=${encodeTscgField(tool.decision.avoid)}`] : []),
      ...(tool.decision.contrasts.length > 0
        ? [`c=${tool.decision.contrasts.map((contrast) =>
            `${encodeTscgField(contrast.otherTool)}>${encodeTscgField(contrast.cue)}`
          ).join("^")}`]
        : []),
    ];
    records.push(`  @T|${fields.join("|")}`);
  }
  return records.join("\n");
}

function parseDroFields(line: string, marker: "@D" | "@T"): Map<string, string> {
  const parts = line.trim().split("|");
  if (parts.shift() !== marker) throw new Error(`invalid TSCG DRO ${marker} record`);
  const fields = new Map<string, string>();
  for (const part of parts) {
    const at = part.indexOf("=");
    if (at <= 0) throw new Error(`invalid TSCG DRO field ${JSON.stringify(part)}`);
    const key = part.slice(0, at);
    if (fields.has(key)) throw new Error(`duplicate TSCG DRO field ${key}`);
    fields.set(key, part.slice(at + 1));
  }
  return fields;
}

function requireDroField(fields: ReadonlyMap<string, string>, key: string, id: string): string {
  const value = fields.get(key);
  if (value === undefined) throw new Error(`TSCG DRO ${id} missing ${key}`);
  return value;
}

export function decodeDroProgram(
  encoded: string,
  family: ToolPromptFamily,
  surface: ToolPromptSurface,
): TscgPromptProgram {
  const lines = encoded.split("\n").filter((line) => line.trim().length > 0);
  const defaults: TscgDefaults = {};
  let offset = 0;
  if (lines[0]?.trim().startsWith("@D|")) {
    const fields = parseDroFields(lines[0], "@D");
    const reverse = new Map(Object.entries(DRO_DEFAULT_KEYS).map(([field, key]) => [key, field as DefaultableField]));
    for (const [key, raw] of fields) {
      const field = reverse.get(key);
      if (!field) throw new Error(`unknown TSCG DRO default field ${key}`);
      const value: unknown = field === "requiredHeaders"
        ? decodeList(raw)
        : field === "operation"
          ? parseOperation(decodeTscgField(raw))
          : decodeTscgField(raw);
      (defaults as Record<string, unknown>)[field] = value;
    }
    offset = 1;
  }
  const omittedFields: Record<string, DefaultableField[]> = {};
  const tools = lines.slice(offset).map((line) => {
    const fields = parseDroFields(line, "@T");
    const id = decodeTscgField(requireDroField(fields, "id", "tool"));
    const inherited = <T>(field: DefaultableField, key: string, parse: (value: string) => T): T => {
      const raw = fields.get(key);
      if (raw !== undefined) return parse(raw);
      const value = defaults[field];
      if (value === undefined) throw new Error(`TSCG DRO ${id} missing ${key} and defaults.${field}`);
      (omittedFields[id] ??= []).push(field);
      return value as T;
    };
    const contrasts = (fields.get("c") ?? "").split("^").filter(Boolean).map((entry) => {
      const separator = entry.indexOf(">");
      if (separator <= 0) throw new Error(`invalid TSCG DRO contrast for ${id}`);
      return {
        otherTool: decodeTscgField(entry.slice(0, separator)),
        cue: decodeTscgField(entry.slice(separator + 1)),
      };
    });
    return {
      contract: {
        id,
        method: inherited("method", "m", (value) => {
          if (value !== "POST") throw new Error(`invalid TSCG method ${value}`);
          return "POST" as const;
        }),
        path: decodeTscgField(requireDroField(fields, "p", id)),
        requiredHeaders: inherited("requiredHeaders", "h", decodeList),
        requiredArgs: decodeList(requireDroField(fields, "req", id)),
        optionalArgs: decodeList(requireDroField(fields, "opt", id)),
        forbiddenArgs: decodeList(requireDroField(fields, "x", id)),
        phase: inherited("phase", "ph", (value) => value as ToolPromptPhase),
        capability: inherited("capability", "cap", decodeTscgField),
        operation: inherited("operation", "op", (value) => parseOperation(decodeTscgField(value))),
        responseKind: inherited("responseKind", "r", (value) => value as ToolPromptResponseKind),
      },
      decision: {
        when: decodeTscgField(requireDroField(fields, "w", id)),
        ...(fields.has("a") ? { avoid: decodeTscgField(fields.get("a")!) } : {}),
        contrasts,
      },
    };
  });
  return {
    family,
    surface,
    tools,
    defaults,
    omittedFields,
    dependencyEdges: getVisibleTscgDependencyEdges(tools.map((tool) => tool.contract.id)),
  };
}

function semanticProjection(program: TscgPromptProgram): unknown {
  return {
    family: program.family,
    surface: program.surface,
    tools: program.tools.map((tool) => ({
      contract: tool.contract,
      decision: tool.decision,
    })),
  };
}

export function roundTripDroProgram(program: TscgPromptProgram): TscgDroRoundTripResult {
  const encoded = encodeDroProgram(program);
  const decoded = decodeDroProgram(encoded, program.family, program.surface);
  return {
    encoded,
    decoded,
    identical: stableValue(semanticProjection(decoded)) === stableValue(semanticProjection(program)),
  };
}

export function compareTscgContracts(
  contracts: readonly RuntimeToolContract[],
  program: TscgPromptProgram,
): TscgContractComparison {
  const expected = new Map(contracts.map((contract) => [contract.id, projectRuntimeContract(contract)]));
  const actual = new Map(program.tools.map((tool) => [tool.contract.id, tool.contract]));
  const differences: string[] = [];
  const ids = [...new Set([...expected.keys(), ...actual.keys()])].sort(compareText);
  for (const id of ids) {
    if (!expected.has(id)) differences.push(`${id}: unexpected contract`);
    else if (!actual.has(id)) differences.push(`${id}: missing contract`);
    else {
      for (const field of TSCG_SIGNATURE_FIELD_ORDER) {
        const left = stableValue(expected.get(id)![field]);
        const right = stableValue(actual.get(id)![field]);
        if (left !== right) differences.push(`${id}.${field}: ${left} != ${right}`);
      }
    }
  }
  return { equivalent: differences.length === 0, differences };
}

export function assertTscgContractEquivalent(
  contracts: readonly RuntimeToolContract[],
  program: TscgPromptProgram,
): void {
  const comparison = compareTscgContracts(contracts, program);
  if (!comparison.equivalent) {
    throw new Error(`TSCG contract mismatch: ${comparison.differences.join("; ")}`);
  }
}

function collectToolCards(content: string): Array<{ id: string; start: number; end: number }> {
  const cards: Array<{ id: string; start: number; end: number }> = [];
  const opening = '  <tool name="';
  const close = "  </tool>";
  let offset = 0;
  while (true) {
    const start = content.indexOf(opening, offset);
    if (start < 0) break;
    const idStart = start + opening.length;
    const idEnd = content.indexOf('">', idStart);
    if (idEnd < 0) throw new Error("TSCG found unterminated tool name");
    const closing = content.indexOf(close, idEnd + 2);
    if (closing < 0) throw new Error(`TSCG found unterminated tool card ${content.slice(idStart, idEnd)}`);
    cards.push({ id: content.slice(idStart, idEnd), start, end: closing + close.length });
    offset = closing + close.length;
  }
  return cards;
}

function renderProgram(program: TscgPromptProgram, dro: boolean): string {
  if (dro) return encodeDroProgram(program);
  const records = program.tools.map((tool) =>
    renderReadableTool(tool, program.omittedFields[tool.contract.id] ?? [])
  );
  const defaults = renderReadableDefaults(program.defaults);
  return [...(defaults ? [defaults] : []), ...records].join("\n\n");
}

function replaceCardHost(
  units: readonly PromptUnit[],
  program: TscgPromptProgram,
  dro: boolean,
): PromptUnit[] {
  const hosts = units
    .map((unit, index) => ({ unit, index, cards: collectToolCards(unit.content) }))
    .filter((item) => item.cards.length > 0);
  if (hosts.length !== 1) {
    throw new Error(`TSCG ${program.surface} expected one tool-card host; found ${hosts.length}`);
  }
  const host = hosts[0];
  for (let index = 1; index < host.cards.length; index += 1) {
    const gap = host.unit.content.slice(host.cards[index - 1].end, host.cards[index].start);
    if (gap.trim().length > 0) {
      throw new Error(`TSCG ${program.surface} found non-whitespace content between tool cards`);
    }
  }
  const first = host.cards[0];
  const last = host.cards[host.cards.length - 1];
  const prefix = host.unit.content.slice(0, first.start);
  const suffix = host.unit.content.slice(last.end);
  const rendered = renderProgram(program, dro);
  return [
    ...units.slice(0, host.index),
    ...(prefix.length > 0 ? [{ ...host.unit, id: `${host.unit.id}.tscg-prefix`, content: prefix }] : []),
    {
      id: `${program.surface}.tscg-records`,
      family: program.family,
      kind: "tool-card" as const,
      content: rendered,
      sourceSpecIds: program.tools.map((tool) => tool.contract.id),
    },
    ...(suffix.length > 0 ? [{ ...host.unit, id: `${host.unit.id}.tscg-suffix`, content: suffix }] : []),
    ...units.slice(host.index + 1),
  ];
}

function normalizeEndpointBinding(
  family: ToolPromptFamily,
  source: string,
): string {
  const marker = "endpoint-base: ";
  const lines = source.split("\n");
  const lineIndex = lines.findIndex((line) => line.startsWith(marker));
  if (lineIndex < 0) return source;
  const original = lines[lineIndex];
  let replacement: string;
  if (family === "knowledge") {
    replacement = "origin: target <knowledge>.url; knowledge_id stays in body";
  } else {
    const basePath = family === "memory" ? "/memory-bridge/v3" : "/skill-bridge/v3/skill";
    const value = original.slice(marker.length);
    if (!value.endsWith(basePath)) {
      throw new Error(`TSCG SDM ${family} endpoint-base does not end in ${basePath}`);
    }
    replacement = `origin: ${value.slice(0, -basePath.length)}`;
  }
  lines[lineIndex] = replacement;
  return lines.join("\n");
}

function normalizeTypedSignatureBindings(
  family: ToolPromptFamily,
  units: readonly PromptUnit[],
): PromptUnit[] {
  const legacyEndpointRule = "- endpoint = 当前 family 的 `endpoint-base` + 工具 `path`；knowledge 使用目标资源的 `url` + `path`。";
  const typedEndpointRule = "- endpoint = current family `origin` + full tool `path`; knowledge uses target resource `url` + `path`.";
  return units.map((unit) => {
    let content = normalizeEndpointBinding(family, unit.content);
    if (content.includes(legacyEndpointRule)) {
      if (content.indexOf(legacyEndpointRule) !== content.lastIndexOf(legacyEndpointRule)) {
        throw new Error("TSCG O1 found duplicate endpoint binding rules");
      }
      content = content.replace(legacyEndpointRule, typedEndpointRule);
    }
    return { ...unit, content };
  });
}

function minifyTscgSurfaceUnits(
  capabilitySignature: string,
  units: readonly PromptUnit[],
): { units: PromptUnit[]; mappings: TscgRemovedUnitMapping[] } {
  const mappings: TscgRemovedUnitMapping[] = [];
  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(capabilitySignature);
  const sessionIdentityFamilies = plan.activeFamilies.filter(
    (activeFamily) => activeFamily === "memory" || activeFamily === "skill",
  );
  const compactGrammar = [
    "## 统一工具调用协议",
    "These records are Bash HTTP tools, not native functions.",
    "- endpoint = family `origin` + full `path`; knowledge uses resource `url` + `path`.",
    `- Send JSON with only \`requiredArgs\`/\`optionalArgs\`; never send \`forbiddenArgs\`. Add every \`requiredHeaders\` entry using the family values below${sessionIdentityFamilies.length > 0 ? `; ${sessionIdentityFamilies.join("/")} identity is session-injected` : ""}.`,
    "- `responseKind=json|dynamic-schema` uses `{code,message,data}` and succeeds only at code=0; `bytes` is raw.",
    "canonical: `curl -sSk -X POST '<endpoint>' <headers> -d '<body>'`",
    "",
    "",
  ].join("\n");
  const transformed = units.map((unit) => {
    if (unit.id === "shared.execution-grammar") {
      mappings.push({
        sourceUnit: "shared.execution-grammar",
        retainedUnit: "shared.execution-grammar.canonical",
        field: "executionGrammar",
        canonicalValue: compactGrammar.trimEnd(),
      });
      return { ...unit, content: compactGrammar };
    }
    return { ...unit };
  });
  return { units: transformed, mappings };
}

export function applyTscgLiteOperators(input: ApplyTscgLiteInput): ApplyTscgLiteResult {
  const enabledOperators = TSCG_LITE_OPERATOR_IDS.filter((id) => (
    id === "typed-signature" ? input.operators.typedSignature
      : id === "sdm" ? input.operators.sdm
        : id === "dro" ? input.operators.dro
          : input.operators.cfo
  ));
  const cardIds = input.units.flatMap((unit) => collectToolCards(unit.content).map((card) => card.id));
  if (cardIds.length === 0) {
    return {
      units: input.units.map((unit) => ({ ...unit })),
      program: null,
      enabledOperators,
      removedUnitMappings: [],
      contractComparison: null,
      droRoundTrip: null,
    };
  }
  if (!input.operators.typedSignature) {
    throw new Error("TSCG representation operators require typedSignature output");
  }
  const visible = new Set(cardIds);
  const contracts = input.contracts.filter((contract) => visible.has(contract.id));
  let program = buildTypedSignatureProgram({
    family: input.family,
    surface: input.surface,
    contracts,
    specs: input.specs,
    orderedToolIds: cardIds,
  });
  let removedUnitMappings: readonly TscgRemovedUnitMapping[] = [];
  if (input.operators.sdm) {
    const result = applySemanticDeduplication(program);
    program = result.program;
    removedUnitMappings = result.removedUnitMappings;
  }
  if (input.operators.cfo) program = applyContractFlowOrdering(program);
  const contractComparison = compareTscgContracts(contracts, program);
  if (!contractComparison.equivalent) {
    throw new Error(`TSCG contract mismatch: ${contractComparison.differences.join("; ")}`);
  }
  const roundTrip = input.operators.dro ? roundTripDroProgram(program) : null;
  if (roundTrip && !roundTrip.identical) throw new Error("TSCG DRO round-trip mismatch");
  let units = normalizeTypedSignatureBindings(
    input.family,
    replaceCardHost(input.units, program, input.operators.dro),
  );
  if (input.operators.sdm) {
    const minified = minifyTscgSurfaceUnits(
      input.capabilitySignature,
      units,
    );
    units = minified.units;
    removedUnitMappings = [...removedUnitMappings, ...minified.mappings];
  }
  return {
    units,
    program,
    enabledOperators,
    removedUnitMappings,
    contractComparison,
    droRoundTrip: roundTrip?.identical ?? null,
  };
}

export function lintTscgCapabilityProjection(
  program: TscgPromptProgram,
  visibleContractIds: readonly string[],
): void {
  const visible = new Set(visibleContractIds);
  const ids = program.tools.map((tool) => tool.contract.id);
  if (new Set(ids).size !== ids.length) throw new Error("TSCG capability projection has duplicate tools");
  for (const id of ids) {
    if (!visible.has(id)) throw new Error(`TSCG retained capability-pruned tool ${id}`);
  }
  for (const tool of program.tools) {
    for (const contrast of tool.decision.contrasts) {
      if (!visible.has(contrast.otherTool)) {
        throw new Error(`TSCG retained contrast to capability-pruned tool ${contrast.otherTool}`);
      }
    }
  }
  for (const edge of program.dependencyEdges) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) {
      throw new Error(`TSCG retained edge to capability-pruned tool ${edge.from}->${edge.to}`);
    }
  }
}
