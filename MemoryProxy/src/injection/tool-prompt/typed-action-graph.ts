import type {
  ActionHandoff,
  BindingSource,
  PromptUnit,
  RuntimeToolContract,
  ToolActionGraph,
  ToolActionInput,
  ToolActionOutput,
  ToolActionStep,
  ToolPromptFamily,
  ToolPromptSpec,
  ToolPromptSurface,
} from "./types.js";

export const TYPED_ACTION_GRAPH_VERSION = "v4-g.1";

export const TYPED_ACTION_GRAPH_DEDUPLICATIONS = [
  {
    family: "skill",
    from: "A team skill returned by skill_search, or any skill known by exact skill_id, must be opened.",
    to: "A skill known by exact skill_id must be opened.",
  },
  {
    family: "skill",
    from: "A specific resource path from a viewed skill manifest must be read into context.",
    to: "A specific skill resource must be read into context.",
  },
  {
    family: "skill",
    from: "A specific resource path from a viewed skill manifest must be downloaded as raw bytes.",
    to: "A specific skill resource must be downloaded as raw bytes.",
  },
  {
    family: "knowledge",
    from: "A tool name and parameter schema returned by tools/list must be executed against the same knowledge resource.",
    to: "A selected typed operation must be executed against its knowledge resource.",
  },
  {
    family: "memory",
    from: "A scene path is known from the injected index or scenario listing and its full body is required.",
    to: "The full body of a known scene is required.",
  },
] as const satisfies readonly {
  family: ToolPromptFamily;
  from: string;
  to: string;
}[];

const TOOL_SURFACE: Record<ToolPromptFamily, ToolPromptSurface> = {
  memory: "memory-tools",
  skill: "skill-tools",
  knowledge: "knowledge-tools",
};

const ALL_SOURCES = ["user", "injected_asset", "prior_tool_output"] as const;
const USER_OR_PRIOR = ["user", "prior_tool_output"] as const;
const PRIOR_ONLY = ["prior_tool_output"] as const;

interface ActionSemantics {
  inputTypes?: Readonly<Record<string, string>>;
  inputSources?: Readonly<Record<string, readonly BindingSource[]>>;
  producerTools?: Readonly<Record<string, readonly string[]>>;
  produces?: readonly ToolActionOutput[];
  effects: readonly string[];
  terminals: readonly string[];
  operationPredicate?: string;
}

const ACTION_SEMANTICS: Readonly<Record<string, ActionSemantics>> = {
  tdai_memory_search: {
    effects: ["retrieve atomic memories by semantic query"],
    produces: [{ name: "memory_item", valueType: "memory-item" }],
    terminals: ["memory.atomic.semantic-search"],
  },
  tdai_atomic_query: {
    effects: ["retrieve filtered atomic memories"],
    produces: [{ name: "memory_item", valueType: "memory-item" }],
    terminals: ["memory.atomic.filtered-read"],
  },
  tdai_conversation_search: {
    effects: ["retrieve matching historical messages"],
    produces: [{ name: "conversation_item", valueType: "conversation-item" }],
    terminals: ["memory.conversation.semantic-search"],
  },
  tdai_conversation_query: {
    effects: ["read a known session chronologically"],
    produces: [{ name: "conversation_item", valueType: "conversation-item" }],
    terminals: ["memory.conversation.ordered-read"],
  },
  tdai_scenario_ls: {
    effects: ["list available scene paths"],
    produces: [{ name: "data.entries[].path", valueType: "scene-path" }],
    terminals: ["memory.scene.list"],
  },
  tdai_read_scene: {
    inputTypes: { path: "scene-path" },
    inputSources: { path: ALL_SOURCES },
    producerTools: { path: ["tdai_scenario_ls"] },
    effects: ["read the selected scene body"],
    produces: [{ name: "scene_body", valueType: "scene-body" }],
    terminals: ["memory.scene.read"],
  },
  skill_search: {
    effects: ["find matching team skills"],
    produces: [
      { name: "data.items[].skill_id", valueType: "skill-id" },
      { name: "data.items[].version", valueType: "skill-version" },
    ],
    terminals: ["skill.discovery"],
  },
  skill_view: {
    inputTypes: { skill_name: "skill-name" },
    inputSources: { skill_name: ["user", "injected_asset"] },
    effects: ["read an agent-owned skill by exact name"],
    produces: [
      { name: "data.skill_id", valueType: "skill-id" },
      { name: "data.version", valueType: "skill-version" },
      { name: "data.manifest[].path", valueType: "skill-resource-path" },
    ],
    terminals: ["skill.instructions.read"],
  },
  skill_view_by_id: {
    inputTypes: { skill_id: "skill-id" },
    inputSources: { skill_id: ALL_SOURCES },
    producerTools: { skill_id: ["skill_search"] },
    effects: ["read a skill by exact id"],
    produces: [
      { name: "data.skill_id", valueType: "skill-id" },
      { name: "data.version", valueType: "skill-version" },
      { name: "data.manifest[].path", valueType: "skill-resource-path" },
    ],
    terminals: ["skill.instructions.read"],
  },
  skill_files_read: {
    inputTypes: { skill_id: "skill-id", path: "skill-resource-path" },
    inputSources: { skill_id: ALL_SOURCES, path: ALL_SOURCES },
    producerTools: {
      skill_id: ["skill_view", "skill_view_by_id"],
      path: ["skill_view", "skill_view_by_id"],
    },
    effects: ["read one skill resource as a JSON envelope"],
    produces: [{ name: "data.content", valueType: "skill-resource-content" }],
    terminals: ["skill.resource.read"],
  },
  skill_files_download: {
    inputTypes: { skill_id: "skill-id", path: "skill-resource-path" },
    inputSources: { skill_id: ALL_SOURCES, path: ALL_SOURCES },
    producerTools: {
      skill_id: ["skill_view", "skill_view_by_id"],
      path: ["skill_view", "skill_view_by_id"],
    },
    effects: ["download one skill resource as bytes"],
    produces: [{ name: "response_body", valueType: "bytes" }],
    terminals: ["skill.resource.download"],
  },
  skill_extract: {
    effects: ["archive the current reusable workflow"],
    terminals: ["skill.lifecycle.extract"],
  },
  skill_create: {
    effects: ["persist a new skill"],
    terminals: ["skill.write.create"],
  },
  skill_update: {
    inputTypes: { skill_id: "skill-id", expected_version: "skill-version" },
    inputSources: { skill_id: ALL_SOURCES, expected_version: USER_OR_PRIOR },
    effects: ["replace an owned skill body"],
    terminals: ["skill.write.update"],
  },
  skill_patch: {
    inputTypes: { skill_id: "skill-id", expected_version: "skill-version" },
    inputSources: { skill_id: ALL_SOURCES, expected_version: USER_OR_PRIOR },
    effects: ["patch an owned skill body"],
    terminals: ["skill.write.patch"],
  },
  skill_delete: {
    inputTypes: { skill_id: "skill-id", expected_version: "skill-version" },
    inputSources: { skill_id: ALL_SOURCES, expected_version: USER_OR_PRIOR },
    effects: ["delete an owned skill"],
    terminals: ["skill.write.delete"],
  },
  skill_files_write: {
    inputTypes: { skill_id: "skill-id", expected_version: "skill-version", files: "skill-resource-set" },
    inputSources: { skill_id: ALL_SOURCES, expected_version: USER_OR_PRIOR },
    effects: ["write skill resource files"],
    terminals: ["skill.write.files"],
  },
  skill_files_remove: {
    inputTypes: { skill_id: "skill-id", expected_version: "skill-version", paths: "skill-resource-path-set" },
    inputSources: { skill_id: ALL_SOURCES, expected_version: USER_OR_PRIOR },
    effects: ["remove skill resource files"],
    terminals: ["skill.write.files-remove"],
  },
  knowledge_tools_list: {
    inputTypes: { knowledge_id: "knowledge-id" },
    inputSources: { knowledge_id: ALL_SOURCES },
    effects: ["discover operations for one knowledge resource"],
    produces: [
      { name: "data.knowledge_id", valueType: "knowledge-id" },
      { name: "data.tools[].name", valueType: "knowledge-operation" },
      { name: "data.tools[].params", valueType: "json-schema" },
    ],
    terminals: ["knowledge.operation.discovery"],
  },
  knowledge_tools_call: {
    inputTypes: {
      knowledge_id: "knowledge-id",
      tool_name: "knowledge-operation",
      params: "json-object",
    },
    inputSources: {
      knowledge_id: ALL_SOURCES,
      tool_name: PRIOR_ONLY,
      params: USER_OR_PRIOR,
    },
    producerTools: {
      knowledge_id: ["knowledge_tools_list"],
      tool_name: ["knowledge_tools_list"],
      params: ["knowledge_tools_list", "knowledge_tools_call"],
    },
    operationPredicate:
      "tool_name and params conform to the same knowledge resource's tools/list result; action identity includes tool_name",
    effects: ["execute one typed knowledge operation"],
    produces: [{ name: "data", valueType: "json-object" }],
    terminals: ["knowledge.query"],
  },
};

const HANDOFFS: readonly (ActionHandoff & { family: ToolPromptFamily })[] = [
  {
    family: "memory",
    fromActionId: "memory.tdai_scenario_ls",
    output: "data.entries[].path",
    toActionId: "memory.tdai_read_scene",
    input: "path",
    condition: "the target path is not already bound",
  },
  {
    family: "skill",
    fromActionId: "skill.skill_search",
    output: "data.items[].skill_id",
    toActionId: "skill.skill_view_by_id",
    input: "skill_id",
    condition: "open the selected team-search result",
  },
  ...["skill_view", "skill_view_by_id"].flatMap((producer) =>
    ["skill_files_read", "skill_files_download"].flatMap((consumer) => [
      {
        family: "skill" as const,
        fromActionId: `skill.${producer}`,
        output: "data.skill_id",
        toActionId: `skill.${consumer}`,
        input: "skill_id",
        condition: "read or download a resource from the viewed manifest",
      },
      {
        family: "skill" as const,
        fromActionId: `skill.${producer}`,
        output: "data.manifest[].path",
        toActionId: `skill.${consumer}`,
        input: "path",
        condition: "use an exact manifest path",
      },
    ])
  ),
  {
    family: "knowledge",
    fromActionId: "knowledge.knowledge_tools_list",
    output: "data.knowledge_id",
    toActionId: "knowledge.knowledge_tools_call",
    input: "knowledge_id",
    condition: "execute an operation declared by this resource listing",
  },
  {
    family: "knowledge",
    fromActionId: "knowledge.knowledge_tools_list",
    output: "data.tools[].name",
    toActionId: "knowledge.knowledge_tools_call",
    input: "tool_name",
    condition: "execute an operation declared by this resource listing",
  },
  {
    family: "knowledge",
    fromActionId: "knowledge.knowledge_tools_list",
    output: "data.tools[].params",
    toActionId: "knowledge.knowledge_tools_call",
    input: "params",
    condition: "construct params that conform to the returned schema",
  },
  {
    family: "knowledge",
    fromActionId: "knowledge.knowledge_tools_call",
    output: "data",
    toActionId: "knowledge.knowledge_tools_call",
    input: "params",
    condition: "a different listed operation accepts fields from the prior result",
  },
];

function actionId(contract: RuntimeToolContract): string {
  return `${contract.family}.${contract.id}`;
}

function defaultInputType(name: string): string {
  if (name === "params") return "json-object";
  if (name === "files" || name === "paths") return "json-array";
  if (name === "expected_version" || name === "version") return "number";
  return "string";
}

/** Build the graph from visible runtime contracts; only relation semantics are catalogued here. */
export function buildToolActionGraph(
  family: ToolPromptFamily,
  contracts: readonly RuntimeToolContract[],
  specs: readonly ToolPromptSpec[],
): ToolActionGraph {
  const specsByContract = new Map(specs.map((spec) => [spec.contractId, spec]));
  const familyContracts = contracts.filter((contract) => contract.family === family);
  const visibleActionIds = new Set(familyContracts.map(actionId));
  const actions: ToolActionStep[] = familyContracts.map((contract) => {
    const semantics = ACTION_SEMANTICS[contract.id];
    if (!semantics) throw new Error(`typed action graph lacks semantics for ${contract.id}`);
    if (!specsByContract.has(contract.id)) {
      throw new Error(`typed action graph ${contract.id} has no prompt decision spec`);
    }
    const requiredInputs: ToolActionInput[] = contract.requiredArgs.map((name) => ({
      name,
      valueType: semantics.inputTypes?.[name] ?? defaultInputType(name),
      anyOfSources: semantics.inputSources?.[name] ?? ["user"],
      ...(semantics.producerTools?.[name]
        ? {
            producerActionIds: semantics.producerTools[name]
              .map((toolId) => `${family}.${toolId}`)
              .filter((id) => visibleActionIds.has(id)),
          }
        : {}),
    }));
    return {
      actionId: actionId(contract),
      toolId: contract.id,
      endpoint: contract.path,
      ...(semantics.operationPredicate
        ? { operationPredicate: semantics.operationPredicate }
        : {}),
      requiredInputs,
      produces: semantics.produces ?? [],
      effects: semantics.effects,
      terminalIntentClasses: semantics.terminals,
    };
  });
  const handoffs = HANDOFFS
    .filter((handoff) => handoff.family === family)
    .map(({ family: _family, ...handoff }) => handoff)
    .filter((handoff) => (
      visibleActionIds.has(handoff.fromActionId)
      && visibleActionIds.has(handoff.toActionId)
    ));
  const graph = {
    family,
    actions,
    handoffs,
    supportedIntentClasses: [...new Set(actions.flatMap((action) => action.terminalIntentClasses))],
  } satisfies ToolActionGraph;
  lintToolActionGraph(graph, familyContracts);
  return graph;
}

export function lintToolActionGraph(
  graph: ToolActionGraph,
  contracts: readonly RuntimeToolContract[],
): void {
  const actionIds = graph.actions.map((action) => action.actionId);
  assertUnique(actionIds, `${graph.family} action id`);
  const actions = new Map(graph.actions.map((action) => [action.actionId, action]));
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const visibleToolIds = new Set(contracts.map((contract) => contract.id));

  for (const action of graph.actions) {
    const contract = contractsById.get(action.toolId);
    if (!contract || contract.family !== graph.family) {
      throw new Error(`${action.actionId} references hidden or missing tool ${action.toolId}`);
    }
    if (action.endpoint !== contract.path) {
      throw new Error(`${action.actionId} endpoint ${action.endpoint} differs from ${contract.path}`);
    }
    if (action.operationPredicate && action.toolId !== "knowledge_tools_call") {
      throw new Error(`${action.actionId} has an unsupported dynamic operation predicate`);
    }
    const inputs = action.requiredInputs.map((input) => input.name);
    if (JSON.stringify(inputs) !== JSON.stringify([...contract.requiredArgs])) {
      throw new Error(`${action.actionId} required inputs drift from RuntimeToolContract`);
    }
    assertUnique(inputs, `${action.actionId} required input`);
    assertUnique(action.produces.map((output) => output.name), `${action.actionId} output`);
    for (const input of action.requiredInputs) {
      if (input.anyOfSources.length === 0) {
        throw new Error(`${action.actionId}.${input.name} has no binding provenance`);
      }
      for (const source of input.anyOfSources) {
        if (source !== "user" && source !== "injected_asset" && source !== "prior_tool_output") {
          throw new Error(`${action.actionId}.${input.name} has invalid binding source ${source}`);
        }
      }
      for (const producerId of input.producerActionIds ?? []) {
        if (!actions.has(producerId)) {
          throw new Error(`${action.actionId}.${input.name} references hidden producer ${producerId}`);
        }
      }
    }
    if (!visibleToolIds.has(action.toolId)) {
      throw new Error(`${action.actionId} survived capability pruning without its tool`);
    }
  }

  for (const handoff of graph.handoffs) {
    const from = actions.get(handoff.fromActionId);
    const to = actions.get(handoff.toActionId);
    if (!from || !to) throw new Error(`dangling typed action handoff ${handoff.fromActionId} -> ${handoff.toActionId}`);
    const output = from.produces.find((candidate) => candidate.name === handoff.output);
    const input = to.requiredInputs.find((candidate) => candidate.name === handoff.input);
    if (!output || !input) {
      throw new Error(`invalid typed handoff binding ${handoff.fromActionId}.${handoff.output} -> ${handoff.toActionId}.${handoff.input}`);
    }
    if (!compatibleBindingTypes(output.valueType, input.valueType)) {
      throw new Error(`incompatible typed handoff ${output.valueType} -> ${input.valueType}`);
    }
    if (!input.anyOfSources.includes("prior_tool_output")) {
      throw new Error(`${handoff.toActionId}.${handoff.input} rejects prior_tool_output`);
    }
  }

  const terminals = new Set(graph.actions.flatMap((action) => action.terminalIntentClasses));
  for (const intentClass of graph.supportedIntentClasses) {
    if (!terminals.has(intentClass)) {
      throw new Error(`${graph.family} intent class ${intentClass} has no reachable terminal`);
    }
  }
  assertReachableTerminals(graph);
  lintTerminalContracts(graph);
}

function assertReachableTerminals(graph: ToolActionGraph): void {
  const reachable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const action of graph.actions) {
      if (reachable.has(action.actionId)) continue;
      const inputsReachable = action.requiredInputs.every((input) => (
        input.anyOfSources.includes("user")
        || input.anyOfSources.includes("injected_asset")
        || (input.anyOfSources.includes("prior_tool_output")
          && (input.producerActionIds ?? []).some((producer) => reachable.has(producer)))
      ));
      if (inputsReachable) {
        reachable.add(action.actionId);
        changed = true;
      }
    }
  }
  for (const intentClass of graph.supportedIntentClasses) {
    if (!graph.actions.some((action) => (
      reachable.has(action.actionId) && action.terminalIntentClasses.includes(intentClass)
    ))) {
      throw new Error(`${graph.family} intent class ${intentClass} is unreachable from legal bindings`);
    }
  }
}

function lintTerminalContracts(graph: ToolActionGraph): void {
  const byTool = new Map(graph.actions.map((action) => [action.toolId, action]));
  if (graph.family === "skill") {
    const search = byTool.get("skill_search");
    if (search?.terminalIntentClasses.includes("skill.instructions.read")) {
      throw new Error("skill_search cannot terminate skill.instructions.read");
    }
    if (!byTool.get("skill_view_by_id")?.terminalIntentClasses.includes("skill.instructions.read")) {
      throw new Error("skill_view_by_id must terminate team skill instruction reads");
    }
  }
  if (graph.family === "knowledge") {
    if (byTool.get("knowledge_tools_list")?.terminalIntentClasses.includes("knowledge.query")) {
      throw new Error("knowledge_tools_list cannot terminate knowledge.query");
    }
    if (!byTool.get("knowledge_tools_call")?.terminalIntentClasses.includes("knowledge.query")) {
      throw new Error("knowledge_tools_call must terminate knowledge.query");
    }
  }
  if (graph.family === "memory") {
    if (byTool.get("tdai_scenario_ls")?.terminalIntentClasses.includes("memory.scene.read")) {
      throw new Error("tdai_scenario_ls cannot terminate memory.scene.read");
    }
    if (!byTool.get("tdai_read_scene")?.terminalIntentClasses.includes("memory.scene.read")) {
      throw new Error("tdai_read_scene must terminate memory.scene.read");
    }
  }
}

export function renderToolActionGraph(graph: ToolActionGraph): string {
  const lines = [
    `<typed_action_graph family="${graph.family}" version="${TYPED_ACTION_GRAPH_VERSION}">`,
    "bindings: required values must come from user | injected_asset | prior_tool_output; never invent ids, paths, operations, or params.",
  ];
  for (const action of graph.actions) {
    const inputs = action.requiredInputs.length === 0
      ? "-"
      : action.requiredInputs.map((input) => {
          const producers = input.producerActionIds?.length
            ? `<=${input.producerActionIds.map(displayAction).join("|")}`
            : "";
          return `${input.name}:${input.valueType}[${input.anyOfSources.join("|")}]${producers}`;
        }).join(",");
    const outputs = action.produces.length === 0
      ? "-"
      : action.produces.map((output) => `${output.name}:${output.valueType}`).join(",");
    const terminal = action.terminalIntentClasses.length === 0
      ? "-"
      : action.terminalIntentClasses.join("|");
    lines.push(
      `action ${action.toolId}${action.operationPredicate ? "[typed-operation]" : ""}: endpoint=${action.endpoint}; requires=${inputs}; produces=${outputs}; effects=${action.effects.join("|")}; terminal=${terminal}`,
    );
    if (action.operationPredicate) lines.push(`  operation: ${action.operationPredicate}`);
  }
  for (const handoff of graph.handoffs) {
    lines.push(
      `handoff ${displayAction(handoff.fromActionId)}.${handoff.output} -> ${displayAction(handoff.toActionId)}.${handoff.input}${handoff.condition ? `; when=${handoff.condition}` : ""}`,
    );
  }
  lines.push(
    "direct-call: a downstream action is legal when every required binding already has one declared provenance; handoffs are conditional, not mandatory prerequisites.",
  );
  if (graph.family === "knowledge") {
    lines.push(
      "repeat: knowledge_tools_call may run consecutively on the same endpoint when each call uses a different listed typed operation and valid params.",
    );
  }
  lines.push(`</typed_action_graph>`);
  return lines.join("\n");
}

export function applyTypedActionGraph(
  profile: "typed-action-graph" | "typed-action-graph-deduplicated",
  family: ToolPromptFamily,
  surface: ToolPromptSurface,
  contracts: readonly RuntimeToolContract[],
  specs: readonly ToolPromptSpec[],
  units: readonly PromptUnit[],
): PromptUnit[] {
  if (surface !== TOOL_SURFACE[family]) return [...units];
  const graph = buildToolActionGraph(family, contracts, specs);
  const baseUnits = profile === "typed-action-graph-deduplicated"
    ? deduplicateCoveredHandoffProse(family, units)
    : [...units];
  return [
    ...baseUnits,
    {
      id: `${family}.typed-action-graph`,
      family,
      kind: "action-graph",
      content: `\n${renderToolActionGraph(graph)}\n`,
      sourceSpecIds: specs.map((spec) => spec.id),
    },
  ];
}

function deduplicateCoveredHandoffProse(
  family: ToolPromptFamily,
  units: readonly PromptUnit[],
): PromptUnit[] {
  const output = units.map((unit) => ({ ...unit }));
  for (const replacement of TYPED_ACTION_GRAPH_DEDUPLICATIONS) {
    if (replacement.family !== family) continue;
    const matches = output.flatMap((unit, index) => (
      unit.content.includes(replacement.from) ? [index] : []
    ));
    if (matches.length !== 1) {
      throw new Error(
        `typed action graph dedup expected one ${family} handoff phrase, found ${matches.length}`,
      );
    }
    const index = matches[0];
    output[index] = {
      ...output[index],
      content: output[index].content.replace(replacement.from, replacement.to),
    };
  }
  return output;
}

function displayAction(id: string): string {
  return id.slice(id.indexOf(".") + 1);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`duplicate ${label}`);
}

function compatibleBindingTypes(output: string, input: string): boolean {
  return output === input || (output === "json-schema" && input === "json-object");
}
