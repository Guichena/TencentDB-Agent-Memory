import { coordinateToolPromptSurfaceFromCapabilitySignature } from "./surface-coordinator.js";
import type {
  PromptUnit,
  RuntimeToolContract,
  ToolPromptFamily,
  ToolPromptSurface,
} from "./types.js";

export interface ProtocolCompactionInput {
  family: ToolPromptFamily;
  surface: ToolPromptSurface;
  capabilitySignature: string;
  contracts: readonly RuntimeToolContract[];
  units: readonly PromptUnit[];
}

export const PROTOCOL_COMPACTION_INVENTORY = [
  {
    id: "shared-post-json-grammar",
    scope: "cross-family",
    summary: "Render POST, JSON, required-header, response-envelope, and error classification rules once.",
    evidence: ["MemoryProxy/src/injection/tool-prompt/runtime-contract.ts"],
  },
  {
    id: "contract-derived-relative-paths",
    scope: "memory+skill+knowledge",
    summary: "Render tool-specific paths and validate required/forbidden body fields from RuntimeToolContract.",
    evidence: ["MemoryProxy/src/injection/tool-prompt/runtime-contract.ts"],
  },
  {
    id: "single-family-bindings",
    scope: "memory+skill+knowledge",
    summary: "Keep runtime base URLs and telemetry values once per family instead of once per curl recipe.",
    evidence: [
      "MemoryProxy/src/injection/injectors/tdai-tools-injector.ts",
      "MemoryProxy/src/injection/injectors/skill-tools-injector.ts",
      "MemoryProxy/src/injection/injectors/knowledge-tools-injector.ts",
    ],
  },
  {
    id: "remove-duplicate-examples-and-envelopes",
    scope: "all-static-surfaces",
    summary: "Remove duplicate curl shells, response envelopes, and error-code catalogues while preserving decision text.",
    evidence: ["MemoryProxy/eval/tool-prompt-bench/TASK1-CODE-STAGE-GATED-EXECUTION-PLAN.md#C02"],
  },
] as const;

const HOST_SURFACE: Record<ToolPromptFamily, ToolPromptSurface> = {
  memory: "memory-tools",
  skill: "skill-tools",
  knowledge: "knowledge-tools",
};

const FAMILY_BASE_PATH: Partial<Record<ToolPromptFamily, string>> = {
  memory: "/memory-bridge/v3",
  skill: "/skill-bridge/v3/skill",
};

export function applyProtocolCompaction(input: ProtocolCompactionInput): PromptUnit[] {
  let units = input.units.map((unit) => ({ ...unit }));
  switch (input.surface) {
    case "memory-tools":
      units = transformContents(units, (content) => compactMemoryTools(content, input.contracts));
      break;
    case "memory-guide":
      units = transformContents(units, compactMemoryGuide);
      break;
    case "skill-tools":
      units = transformContents(units, (content) => compactSkillTools(content, input.contracts));
      break;
    case "skill-listing":
      units = transformContents(units, compactSkillListing);
      break;
    case "knowledge-tools":
      units = transformContents(units, (content) => compactKnowledgeTools(content, input.contracts));
      break;
  }

  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(input.capabilitySignature);
  if (
    plan.executionGrammarHost === input.family
    && HOST_SURFACE[input.family] === input.surface
  ) {
    units = insertExecutionGrammar(
      units,
      input.surface,
      renderSharedExecutionGrammar(input.capabilitySignature, input.contracts),
    );
  }
  return units;
}

export function renderSharedExecutionGrammar(
  capabilitySignature: string,
  contracts: readonly RuntimeToolContract[],
): string {
  const plan = coordinateToolPromptSurfaceFromCapabilitySignature(capabilitySignature);
  const active = new Set(plan.activeFamilies);
  const activeContracts = contracts.filter((contract) => active.has(contract.family));
  if (activeContracts.length === 0) {
    throw new Error("cannot render shared execution grammar without an active tool family");
  }
  const commonHeaders = intersection(activeContracts.map((contract) => contract.requiredHeaders));
  const sessionFamilies = plan.activeFamilies.filter((family) =>
    activeContracts.some(
      (contract) => contract.family === family
        && contract.requiredHeaders.includes("x-conversation-id"),
    ),
  );
  const hasByteResponse = activeContracts.some((contract) => contract.responseKind === "bytes");
  const lines = [
    "## 统一工具调用协议",
    `适用于当前已启用的 ${plan.activeFamilies.join(" / ")} 工具；这些条目不是宿主原生函数，需要时用 Bash 发 HTTP 请求。`,
    `- method 固定为 POST；公共 headers: ${commonHeaders.join(", ")}。每个 family 的 \`headers:\` 只列运行时值和额外 header。`,
    "- endpoint = 当前 family 的 `endpoint-base` + 工具 `path`；knowledge 使用目标资源的 `url` + `path`。",
    "- `body` 必须是 JSON object，只传工具卡列出的业务字段；user_id / team_id / agent_id / task_id 等身份字段仅在工具卡明确列出时才可传。",
    sessionFamilies.length > 0
      ? `- ${sessionFamilies.join(" / ")} 调用必须带当前 session 的 x-conversation-id；其余 family 按自己的 headers 行。`
      : "- 按 family 的 headers 行发送租户与遥测值。",
    "- JSON 响应按 `{code, message, data}` 处理，只有 code=0 才成功；HTTP 或业务错误先看 message 和字段，不把错误信封当结果。",
    ...(hasByteResponse
      ? ["- 仅 response=bytes 的工具返回原始字节；需要落盘时才给 curl 加 `-o <path>`。"]
      : []),
    "canonical form: `curl -sSk -X POST '<endpoint>' -H 'content-type: application/json' <按 headers: 逐项加 -H> -d '<body>'`",
  ];
  return lines.join("\n");
}

function compactMemoryTools(
  source: string,
  contracts: readonly RuntimeToolContract[],
): string {
  if (!source.includes("<tdai_memory_tools>")) return source;
  const base = captureOne(
    source,
    /^    curl: (.+)\/atomic\/search$/m,
    "memory endpoint base",
  );
  const headers = captureOne(
    source,
    /^- 所有 curl 必须带：(.+)；Content-Type: application\/json。$/m,
    "memory runtime headers",
  );
  let output = replaceOnce(
    source,
    "**这些是你可以主动调用的记忆能力**（不是文档），通过 Bash + curl 使用。",
    "**这些是你可以主动调用的记忆能力**（不是文档）。",
    "memory transport intro",
  );
  output = replaceOnce(
    output,
    "禁止说\"我没有这个工具 / 需要 MCP / 只能查本地记忆\" —— 你有 TDAI 记忆工具，就用下面的 curl 命令。",
    "禁止说\"我没有这个工具 / 需要 MCP / 只能查本地记忆\" —— 你有 TDAI 记忆工具，就按统一调用协议执行下面的工具。",
    "memory transport directive",
  );
  output = replaceOnce(
    output,
    "调用方式：Bash 里执行 curl 命中 proxy 的 memory-bridge 路径。proxy 会自动注入身份鉴权（team_id/user_id/agent_id），body 只需业务字段。",
    `endpoint-base: ${base}\nheaders: ${headers.replaceAll("、", "; ")}\n`,
    "memory family protocol",
  );
  output = compactToolCards(output, "memory", contracts);
  output = replaceRegexOnce(
    output,
    /\n- 所有 curl 必须带：[^\n]+；Content-Type: application\/json。/,
    "",
    "memory duplicate header rule",
  );
  output = replaceRegexOnce(
    output,
    /\n## 完整示例\n```bash\n[\s\S]*?\n```(?=\n<\/tdai_memory_tools>)/,
    "",
    "memory duplicate curl example",
  );
  return output;
}

function compactSkillTools(
  source: string,
  contracts: readonly RuntimeToolContract[],
): string {
  if (!source.includes("<skill_tools>")) return source;
  const bridge = captureOne(source, /^  其中 <bridge> = (.+)$/m, "skill endpoint base");
  const template = captureOne(source, /^(  curl -sSk -X POST .+)$/m, "skill curl template");
  const headers = [...template.matchAll(/-H '([^']+)'/g)]
    .map((match) => match[1])
    .filter((header) => !header.toLowerCase().startsWith("content-type:"));
  const runtimeHeaders = headers.length > 0
    ? headers.join("; ")
    : "x-tdai-service-id: <space-id>; x-conversation-id: <session-id>";
  let output = replaceOnce(
    source,
    "以下是云端 skill 操作工具。**这些不是本地工具**，需要用 Bash 调用 curl 命中 proxy 的 skill-bridge 路径来执行。\nproxy 会自动注入身份与鉴权（user_id / team_id / agent_id 由 session 决定），body 里你只需要传业务字段。",
    "以下是云端 skill 操作工具。执行方式遵循统一工具调用协议，身份由 proxy 从 session 注入。",
    "skill transport intro",
  );
  output = replaceRegexOnce(
    output,
    /调用模板：\n  curl -sSk -X POST [^\n]+\n  其中 <bridge> = [^\n]+\n\n可用工具：/,
    `endpoint-base: ${bridge}\nheaders: ${runtimeHeaders}\n\n可用工具：`,
    "skill family protocol",
  );
  output = compactToolCards(output, "skill", contracts);
  output = replaceOnce(
    output,
    "返回 JSON 信封（含 base64/utf-8 编码的内容）。",
    "data 含 base64/utf-8 编码的内容。",
    "skill duplicate response envelope",
  );
  output = replaceRegexOnce(
    output,
    /\n错误处理：响应是 `\{code, message, request_id, data\?\}` 信封；`code != 0` 表示业务错。常见：[\s\S]*?(?=\n<\/skill_tools>)/,
    "",
    "skill duplicate error catalogue",
  );
  return output;
}

function compactMemoryGuide(source: string): string {
  if (!source.includes("<memory-tools-guide>")) return source;
  let output = replaceOnce(
    source,
    "它们通过 **Bash + curl**\n使用（见上方 `<tdai_memory_tools>` 段里的完整调用说明与 URL）。",
    "调用时遵循上方统一工具调用协议，endpoint/body 见 `<tdai_memory_tools>`。",
    "memory guide transport reference",
  );
  output = replaceOnce(
    output,
    "**正确做法**：判定需要查记忆时，直接在 Bash 里执行 curl，proxy 会自动注入身份与鉴权。",
    "**正确做法**：判定需要查记忆时，按统一协议执行对应工具；身份由 proxy 自动注入。",
    "memory guide execution shell",
  );
  output = replaceRegexOnce(
    output,
    /\*\*典型流程\*\*（用户：\"我叫什么\"）：\n```bash\n[\s\S]*?\n```/,
    [
      "**典型流程**（用户：\"我叫什么\"）：",
      "1. 调 `tdai_memory_search`，body 使用 `{\"query\":\"用户姓名 name 身份\",\"limit\":5}`。",
      "2. 从 `items[].content` 提取答案；若为空，明确说记忆里没找到并追问，不要装作知道。",
    ].join("\n"),
    "memory guide duplicate curl example",
  );
  return output;
}

function compactSkillListing(source: string): string {
  let output = source;
  if (output.includes("(see the `<skill_tools>` block above for the exact curl recipe)")) {
    output = replaceOnce(
      output,
      "(see the `<skill_tools>` block above for the exact curl recipe)",
      "(see `<skill_tools>` for its endpoint and body)",
      "skill listing curl reference",
    );
  }
  if (output.includes("**重要：这些 skill 存储在云端")) {
    output = replaceOnce(
      output,
      "**重要：这些 skill 存储在云端，不能使用 read_file / tool_use 直接访问，\n必须用 Bash 执行 curl 调用上方 <skill_tools> 块中的 skill-bridge 工具。**",
      "**重要：这些 skill 在云端，不能用 read_file / tool_use 访问；按统一协议调用 `<skill_tools>`。**",
      "skill listing transport reminder",
    );
  }
  return output;
}

function compactKnowledgeTools(
  source: string,
  contracts: readonly RuntimeToolContract[],
): string {
  if (!source.includes("<knowledge_tools>")) return source;
  const protocolSection = captureOne(
    source,
    /\n## 调用方式[^\n]*\n([\s\S]*?)\n## 约定/,
    "knowledge protocol section",
  );
  const headers = [...protocolSection.matchAll(/  -H '([^']+)' \\/g)]
    .map((match) => match[1])
    .filter((header) => !header.toLowerCase().startsWith("content-type:"));
  const uniqueHeaders = [...new Set(headers)];
  const listContract = requireContract(contracts, "knowledge_tools_list", "knowledge");
  const callContract = requireContract(contracts, "knowledge_tools_call", "knowledge");
  assertArgs(listContract, ["knowledge_id"]);
  assertArgs(callContract, ["knowledge_id", "tool_name", "params"]);
  const compactSection = [
    "",
    "## 知识库专用流程",
    "endpoint-base: 使用目标 `<knowledge>` 的 `url`；knowledge_id 只放 body，不拼进 URL。",
    `headers: ${uniqueHeaders.join("; ")}`,
    "",
    '  <tool name="knowledge_tools_list">',
    `    path: ${listContract.path}`,
    '    body: {"knowledge_id":"<知识id>"}',
    "    use:  每个资源首次使用时拿一次工具清单；返回 tools[].name/description/params，本会话复用，忘了再调。",
    "  </tool>",
    "",
    '  <tool name="knowledge_tools_call">',
    `    path: ${callContract.path}`,
    '    body: {"knowledge_id":"<知识id>","tool_name":"<list 返回的 name>","params":{}}',
    "    use:  执行该资源工具；tool_name 必须与 list 返回完全一致，params 无参也传 JSON object `{}`。",
    "  </tool>",
    "",
    "## 约定",
  ].join("\n");
  let output = replaceRegexOnce(
    source,
    /\n## 调用方式[^\n]*\n[\s\S]*?\n## 约定/,
    compactSection,
    "knowledge duplicate curl protocol",
  );
  output = replaceOnce(
    output,
    "- 响应格式统一为 {code, message, data}，code=0 表示成功。",
    "",
    "knowledge duplicate response envelope",
  );
  output = replaceOnce(
    output,
    "- tool_name 与 tools/list 返回的 name **完全一致**，不加前缀。params 必须是 JSON 对象，无参也传 {}。",
    "",
    "knowledge duplicate call fields",
  );
  return output;
}

function compactToolCards(
  source: string,
  family: "memory" | "skill",
  contracts: readonly RuntimeToolContract[],
): string {
  const basePath = FAMILY_BASE_PATH[family];
  if (!basePath) throw new Error(`missing compact base path for ${family}`);
  let count = 0;
  const output = source.replace(
    /  <tool name="([^"]+)">\n([\s\S]*?)\n  <\/tool>/g,
    (whole: string, toolId: string, inner: string) => {
      const contract = requireContract(contracts, toolId, family);
      if (!contract.path.startsWith(`${basePath}/`)) {
        throw new Error(`${toolId} path ${contract.path} is outside ${basePath}`);
      }
      const endpointMatches = inner.match(/^    (?:curl|path): .+$/gm) ?? [];
      if (endpointMatches.length !== 1) {
        throw new Error(`${toolId} expected one endpoint line; found ${endpointMatches.length}`);
      }
      const bodyText = captureOne(inner, /^    body: (.+)$/m, `${toolId} body`);
      let body: Record<string, unknown>;
      try {
        const parsed = JSON.parse(bodyText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("body is not an object");
        }
        body = parsed as Record<string, unknown>;
      } catch (error) {
        throw new Error(`${toolId} has invalid compact body example: ${(error as Error).message}`);
      }
      assertArgs(contract, Object.keys(body));
      const relativePath = contract.path.slice(basePath.length);
      const compactInner = inner.replace(endpointMatches[0], `    path: ${relativePath}`);
      count += 1;
      return `  <tool name="${toolId}">\n${compactInner}\n  </tool>`;
    },
  );
  if (count === 0) throw new Error(`protocol compaction found no ${family} tool cards`);
  return output;
}

function assertArgs(contract: RuntimeToolContract, presentArgs: readonly string[]): void {
  const present = new Set(presentArgs);
  for (const required of contract.requiredArgs) {
    if (!present.has(required)) {
      throw new Error(`${contract.id} compact body omits required argument ${required}`);
    }
  }
  for (const forbidden of contract.forbiddenArgs) {
    if (present.has(forbidden)) {
      throw new Error(`${contract.id} compact body contains forbidden argument ${forbidden}`);
    }
  }
}

function requireContract(
  contracts: readonly RuntimeToolContract[],
  id: string,
  family: ToolPromptFamily,
): RuntimeToolContract {
  const matches = contracts.filter((contract) => contract.id === id && contract.family === family);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${family} runtime contract ${id}; found ${matches.length}`);
  }
  return matches[0];
}

function insertExecutionGrammar(
  units: readonly PromptUnit[],
  surface: ToolPromptSurface,
  grammar: string,
): PromptUnit[] {
  const tag = surface === "memory-tools"
    ? "<tdai_memory_tools>\n"
    : surface === "skill-tools"
      ? "<skill_tools>\n"
      : "<knowledge_tools>\n";
  const hosts = units.filter((unit) => unit.content.includes(tag));
  if (hosts.length !== 1) {
    throw new Error(`${surface} expected one execution-grammar host; found ${hosts.length}`);
  }
  const output: PromptUnit[] = [];
  for (const unit of units) {
    if (unit !== hosts[0]) {
      output.push(unit);
      continue;
    }
    const splitAt = unit.content.indexOf(tag) + tag.length;
    output.push({
      ...unit,
      id: `${unit.id}.opening`,
      content: unit.content.slice(0, splitAt),
    });
    output.push({
      id: "shared.execution-grammar",
      family: unit.family,
      kind: "execution-grammar",
      content: `${grammar}\n\n`,
      sourceSpecIds: [],
    });
    output.push({
      ...unit,
      id: `${unit.id}.body`,
      content: unit.content.slice(splitAt),
    });
  }
  return output;
}

function intersection(values: readonly (readonly string[])[]): string[] {
  if (values.length === 0) return [];
  return values[0].filter((value) => values.every((candidate) => candidate.includes(value)));
}

function transformContents(
  units: readonly PromptUnit[],
  transform: (content: string) => string,
): PromptUnit[] {
  return units.map((unit) => ({ ...unit, content: transform(unit.content) }));
}

function captureOne(source: string, pattern: RegExp, label: string): string {
  const matches = [...source.matchAll(asGlobal(pattern))];
  if (matches.length !== 1 || typeof matches[0][1] !== "string") {
    throw new Error(`${label} expected exactly one match; found ${matches.length}`);
  }
  return matches[0][1];
}

function replaceOnce(source: string, from: string, to: string, label: string): string {
  const first = source.indexOf(from);
  const last = source.lastIndexOf(from);
  if (first < 0 || first !== last) {
    throw new Error(`${label} expected exactly one fragment`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function replaceRegexOnce(
  source: string,
  pattern: RegExp,
  replacement: string,
  label: string,
): string {
  const matches = [...source.matchAll(asGlobal(pattern))];
  if (matches.length !== 1) {
    throw new Error(`${label} expected exactly one match; found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

function asGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}
