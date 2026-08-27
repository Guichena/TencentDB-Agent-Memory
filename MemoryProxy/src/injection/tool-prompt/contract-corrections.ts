import type { PromptUnit, ToolPromptSurface } from "./types.js";

export interface ContractCorrection {
  id: string;
  surface: ToolPromptSurface;
  summary: string;
  evidence: readonly string[];
  /** The fragment is absent when its capability-controlled tool card is not rendered. */
  optionalWhenCapabilityAbsent?: boolean;
  from: string;
  to: string;
}

/**
 * V0-C changes only source-proven transport or response facts. Exact fragments
 * make the diff auditable and force a failure if a legacy renderer drifts.
 */
export const CONTRACT_CORRECTIONS = [
  {
    id: "memory-guide-required-service-header",
    surface: "memory-guide",
    summary: "The guide example must carry the tenant-routing header required by the canonical memory tool recipe.",
    evidence: [
      "MemoryProxy/src/memory/memory-bridge.ts#deriveSessionId",
      "MemoryProxy/src/memory/memory-bridge.ts#spaceId",
      "MemoryProxy/src/injection/injectors/tdai-tools-injector.ts#renderTdaiMemoryToolsBlock",
    ],
    from: "  -H 'Content-Type: application/json' -H 'x-conversation-id: <sid>' \\",
    to: "  -H 'Content-Type: application/json' -H 'x-tdai-service-id: <space-id>' -H 'x-conversation-id: <sid>' \\",
  },
  {
    id: "skill-search-bm25-contract",
    surface: "skill-tools",
    summary: "The bridge drops caller mode and Core defaults this search to BM25, not semantic search.",
    evidence: [
      "MemoryProxy/src/skill/skill-bridge.ts#Hard-whitelist inbound",
      "MemoryCore/src/core/skill/skill-store.ts#requestedMode",
    ],
    from: "在**你在团队中有权限访问**的 skill 中按关键词 + 语义检索匹配项",
    to: "在**你在团队中有权限访问**的 skill 中按 BM25 关键词检索匹配项",
  },
  {
    id: "skill-team-result-view-by-id",
    surface: "skill-tools",
    summary: "Team search hits need the /get path because /get-by-name is scoped to the current owner agent.",
    evidence: [
      "MemoryProxy/src/skill/skill-bridge.ts#isTeamWideSearch",
      "MemoryCore/src/gateway/skill-handlers.ts#handleGetByName",
      "MemoryCore/src/core/skill/skill-core.ts#async get",
    ],
    from: "skill_name 用 <available_skills> 里 `- name: description` 那个 name，或 skill_search 结果里的 name 字段。\n  </tool>\n\n  <tool name=\"skill_files_read\">",
    to: "skill_name 用 <available_skills> 里 `- name: description` 那个 name；skill_search 返回的跨 agent 结果改用 skill_view_by_id。\n  </tool>\n\n  <tool name=\"skill_view_by_id\">\n    path: {{bridge}}/get\n    body: {\"skill_id\": \"skl-xxx\", \"version\": 3, \"include_content\": true, \"include_manifest\": true}\n    use:  按 skill_id 打开 skill。用于 skill_search 返回的团队 skill，或已经知道精确 skill_id 时；version 用搜索结果中的数值，可省略以读取当前版本。返回 SKILL.md、manifest 和 version。\n  </tool>\n\n  <tool name=\"skill_files_read\">",
  },
  {
    id: "skill-file-read-json-only",
    surface: "skill-tools",
    summary: "The /files/read endpoint returns a JSON envelope; raw bytes use /files/download.",
    evidence: [
      "MemoryProxy/src/skill/skill-bridge.ts#files/download",
      "MemoryCore/src/gateway/skill-schemas.ts#filesReadRequestSchema",
    ],
    from: "读取单个资源文件内容。**必须先调 skill_view 拿 manifest**，从里面挑出 skill_id + path，本工具才能定位。默认返回 JSON 信封（含 base64/utf-8 编码的字节）。\n    若需下载到本地：在 curl 末尾加 -o <本地路径>，proxy 会返回原始字节直接写入文件，不进上下文。下载的脚本需 chmod +x 后再执行。\n  </tool>\n\n  <tool name=\"skill_extract\">",
    to: "读取单个资源文件内容。**必须先调 skill_view 或 skill_view_by_id 拿 manifest**，从里面挑出 skill_id + path，本工具才能定位。返回 JSON 信封（含 base64/utf-8 编码的内容）。\n  </tool>\n\n  <tool name=\"skill_files_download\">\n    path: {{bridge}}/files/download\n    body: {\"skill_id\": \"skl-xxx\", \"version\": 3, \"path\": \"scripts/run.sh\", \"encoding\": \"utf-8|base64\"}\n    use:  下载 manifest 中的单个资源文件并返回原始字节。version 使用 skill_view / skill_view_by_id 返回的数值；调用这个路径时在 curl 末尾加 -o <本地路径>，脚本下载后按需 chmod +x。\n  </tool>\n\n  <tool name=\"skill_extract\">",
  },
  {
    id: "skill-update-expected-version",
    surface: "skill-tools",
    summary: "Core update schema requires expected_version.",
    evidence: ["MemoryCore/src/gateway/skill-schemas.ts#updateRequestSchema"],
    optionalWhenCapabilityAbsent: true,
    from: "body: {\"skill_id\": \"skl-xxx\", \"content\": \"新 SKILL.md\"}",
    to: "body: {\"skill_id\": \"skl-xxx\", \"expected_version\": 3, \"content\": \"新 SKILL.md\"}",
  },
  {
    id: "skill-patch-expected-version",
    surface: "skill-tools",
    summary: "Core patch schema requires expected_version.",
    evidence: ["MemoryCore/src/gateway/skill-schemas.ts#patchRequestSchema"],
    optionalWhenCapabilityAbsent: true,
    from: "body: {\"skill_id\": \"skl-xxx\", \"old_string\": \"...\", \"new_string\": \"...\", \"replace_all\": false}",
    to: "body: {\"skill_id\": \"skl-xxx\", \"expected_version\": 3, \"old_string\": \"...\", \"new_string\": \"...\", \"replace_all\": false}",
  },
  {
    id: "skill-delete-expected-version",
    surface: "skill-tools",
    summary: "Core delete schema requires expected_version.",
    evidence: ["MemoryCore/src/gateway/skill-schemas.ts#deleteRequestSchema"],
    optionalWhenCapabilityAbsent: true,
    from: "body: {\"skill_id\": \"skl-xxx\"}\n    use:  软删（archived；不递增版本）",
    to: "body: {\"skill_id\": \"skl-xxx\", \"expected_version\": 3}\n    use:  软删（archived；不递增版本）",
  },
  {
    id: "skill-delete-physical-contract",
    surface: "skill-tools",
    summary: "Delete now physically removes all versions; archived=true is retained only for wire compatibility.",
    evidence: ["MemoryCore/src/core/skill/skill-core.ts#async delete"],
    optionalWhenCapabilityAbsent: true,
    from: "use:  软删（archived；不递增版本）",
    to: "use:  物理删除该 skill 的全部版本；返回 archived=true 表示删除已完成（兼容字段）",
  },
  {
    id: "skill-files-write-expected-version",
    surface: "skill-tools",
    summary: "Core files/write schema requires expected_version.",
    evidence: ["MemoryCore/src/gateway/skill-schemas.ts#filesWriteRequestSchema"],
    optionalWhenCapabilityAbsent: true,
    from: "body: {\"skill_id\": \"skl-xxx\", \"files\": [{\"path\": \"scripts/x.sh\", \"content\": \"...\", \"encoding\": \"utf-8\", \"is_executable\": true}]}",
    to: "body: {\"skill_id\": \"skl-xxx\", \"expected_version\": 3, \"files\": [{\"path\": \"scripts/x.sh\", \"content\": \"...\", \"encoding\": \"utf-8\", \"is_executable\": true}]}",
  },
  {
    id: "skill-files-remove-expected-version",
    surface: "skill-tools",
    summary: "Core files/remove schema requires expected_version.",
    evidence: ["MemoryCore/src/gateway/skill-schemas.ts#filesRemoveRequestSchema"],
    optionalWhenCapabilityAbsent: true,
    from: "body: {\"skill_id\": \"skl-xxx\", \"paths\": [\"scripts/old.sh\"]}",
    to: "body: {\"skill_id\": \"skl-xxx\", \"expected_version\": 3, \"paths\": [\"scripts/old.sh\"]}",
  },
  {
    id: "skill-error-contract-details",
    surface: "skill-tools",
    summary: "Clarify the exact duplicate, stale-version, and patch error contracts.",
    evidence: [
      "MemoryCore/src/gateway/skill-handlers.ts#ERROR_CODE_MAP",
      "MemoryCore/src/core/skill/skill-core.ts#SKILL_PATCH_NOT_UNIQUE",
    ],
    optionalWhenCapabilityAbsent: true,
    from: "- 40901 SKILL_VERSION_STALE：版本过期，先 skill_view 拿最新版本再写。\n- 42201 SKILL_NAME_DUPLICATE：同 team 重名。\n- 42202 SKILL_PATCH_NOT_UNIQUE：old_string 不唯一，传 replace_all=true。",
    to: "- 40901 SKILL_VERSION_STALE：expected_version 过期，先 skill_view / skill_view_by_id 拿最新 version 再写。\n- 42201 SKILL_NAME_DUPLICATE：同 team + owner agent 下重名。\n- 42202 SKILL_PATCH_NOT_UNIQUE：old_string 未找到或不唯一；仅在确实要全部替换时传 replace_all=true。",
  },
  {
    id: "skill-not-found-scope",
    surface: "skill-tools",
    summary: "The id-based read is team-scoped, while get-by-name is scoped to the current owner agent.",
    evidence: [
      "MemoryCore/src/core/skill/skill-core.ts#async get",
      "MemoryCore/src/gateway/skill-handlers.ts#handleGetByName",
    ],
    from: "- 40401 SKILL_NOT_FOUND：skill 不存在或不属于你所在的 agent；先用 skill_search 找同类 skill。",
    to: "- 40401 SKILL_NOT_FOUND：skill_id / version 不存在，或 skill_view 的 name 不属于当前 agent；从 skill_search 或 <available_skills> 重新确认。",
  },
  {
    id: "knowledge-node-requires-include-code",
    surface: "knowledge-tools",
    summary: "node returns source only when includeCode=true.",
    evidence: ["MemoryKnowledge/src/routes/tools.ts#CODE_GRAPH_TOOLS node"],
    from: "X 在哪 → search；只要单个符号的定义 → node；",
    to: "符号名在哪 → search；要单个符号的完整定义 / 源码 → node（includeCode=true）；",
  },
  {
    id: "knowledge-source-response-contract",
    surface: "knowledge-tools",
    summary: "Only explore and node(includeCode=true) guarantee source in their response.",
    evidence: ["MemoryKnowledge/src/routes/tools.ts#CODE_GRAPH_TOOLS"],
    from: "explore / node 返回的源码是逐字的",
    to: "explore / node（includeCode=true）返回的源码是逐字的",
  },
  {
    id: "knowledge-file-search-contract",
    surface: "knowledge-tools",
    summary: "search is symbol-name search; explore accepts file names.",
    evidence: ["MemoryKnowledge/src/routes/tools.ts#CODE_GRAPH_TOOLS"],
    from: "- 找文件用 explore / search（query 直接支持文件名，如 \"session-manager.ts\"）；files 只用于一次性总览目录结构，每个资源每会话最多一次。",
    to: "- 找文件名用 explore（query 支持文件名，如 \"session-manager.ts\"）；search 只按符号名定位，files 只用于一次性总览目录结构，每个资源每会话最多一次。",
  },
] as const satisfies readonly ContractCorrection[];

export function applyContractCorrections(
  surface: ToolPromptSurface,
  units: readonly PromptUnit[],
): PromptUnit[] {
  const output = units.map((unit) => ({ ...unit }));
  const optionalCapabilityAvailable = surface !== "skill-tools"
    || output.some((unit) => unit.content.includes('<tool name="skill_update">'));
  for (const correction of CONTRACT_CORRECTIONS) {
    if (correction.surface !== surface) continue;
    const matches = output.filter((unit) => unit.content.includes(correction.from));
    if (
      matches.length === 0
      && "optionalWhenCapabilityAbsent" in correction
      && correction.optionalWhenCapabilityAbsent
      && !optionalCapabilityAvailable
    ) continue;
    if (matches.length !== 1) {
      throw new Error(
        `contract correction ${correction.id} expected exactly one legacy fragment on ${surface}; found ${matches.length}`,
      );
    }
    const unit = matches[0];
    unit.content = unit.content.replace(correction.from, correction.to);
  }
  if (surface === "skill-tools") {
    for (const unit of output) {
      if (unit.content.includes("{{bridge}}")) {
        unit.content = unit.content.replaceAll("{{bridge}}", bridgeFromSkillPrompt(unit.content));
      }
    }
  }
  return output;
}

function bridgeFromSkillPrompt(content: string): string {
  const match = content.match(/其中 <bridge> = (.+)$/m);
  if (!match?.[1]) {
    throw new Error("contract-corrected skill prompt cannot resolve <bridge> binding");
  }
  return match[1];
}
