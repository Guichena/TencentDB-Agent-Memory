import type { PromptUnit, ToolPromptSurface } from "./types.js";

export type SemanticSurfaceBundle = Partial<Record<ToolPromptSurface, string>>;

export interface SemanticUnitOwnership {
  id: string;
  removedSurface: ToolPromptSurface;
  removedMarker: string;
  retainedSurface: ToolPromptSurface | "shared-host";
  retainedMarker: string;
  rationale: string;
}

/**
 * Stable ownership map for V1b/V1. Every deleted rule has one observable
 * retained location; the linter below verifies the map against compiled bytes.
 */
export const SEMANTIC_UNIT_INVENTORY = [
  {
    id: "memory.capability-owner-guide",
    removedSurface: "memory-tools",
    removedMarker: "**这些是你可以主动调用的记忆能力**（不是文档）。",
    retainedSurface: "memory-guide",
    retainedMarker: "等，是**你可以主动调用的能力**（不是仅供参考的文档）。",
    rationale: "Capability activation belongs to the memory policy guide, not the transport catalogue.",
  },
  {
    id: "memory.trigger-owner-guide",
    removedSurface: "memory-tools",
    removedMarker: "遇到用户问身份/历史/偏好/过往结论/项目约定时，必须先使用下面的 TDAI 记忆工具查询，再基于查询结果回答。",
    retainedSurface: "memory-guide",
    retainedMarker: "### 必须先查记忆再回答的场景（命中任一条即触发工具调用）",
    rationale: "Detailed trigger rules in the guide own the broad trigger summary.",
  },
  {
    id: "memory.denial-owner-guide",
    removedSurface: "memory-tools",
    removedMarker: "禁止说\"我没有这个工具 / 需要 MCP / 只能查本地记忆\"",
    retainedSurface: "memory-guide",
    retainedMarker: "**禁止**回答类似\"我没有这个工具 / 需要 MCP / 需要斜杠命令\"。",
    rationale: "The guide keeps the single refusal-prevention rule.",
  },
  {
    id: "memory.layer-overview-owner-guide",
    removedSurface: "memory-tools",
    removedMarker: "覆盖范围：",
    retainedSurface: "memory-guide",
    retainedMarker: "L3（persona 长期画像）与 L2 场景索引已直接注入 system。L0/L1 需要用工具主动检索。",
    rationale: "The guide owns the layer overview; individual cards keep distinct tool-specific read details.",
  },
  {
    id: "memory.search-budget-owner-guide",
    removedSurface: "memory-tools",
    removedMarker: "每轮对话中，atomic_search + conversation_search **合计 ≤ 3 次**",
    retainedSurface: "memory-guide",
    retainedMarker: "每轮 `tdai_memory_search` + `tdai_conversation_search` **合计 ≤ 3 次**",
    rationale: "The policy guide is the sole owner of the memory search budget.",
  },
  {
    id: "memory.path-repeat-owner-guide",
    removedSurface: "memory-tools",
    removedMarker: "同一 path 不要重复读。",
    retainedSurface: "memory-guide",
    retainedMarker: "- 同一 L2 path 不要重复读",
    rationale: "The guide is the sole owner of the no-repeat scene rule.",
  },
  {
    id: "execution.identity-owner-shared-grammar",
    removedSurface: "skill-tools",
    removedMarker: "身份由 proxy 从 session 注入",
    retainedSurface: "shared-host",
    retainedMarker: "memory / skill 身份由 proxy 从 session 注入",
    rationale: "Identity injection is cross-family execution grammar, not a Skill-only rule.",
  },
  {
    id: "memory.identity-owner-shared-grammar",
    removedSurface: "memory-guide",
    removedMarker: "身份由 proxy 自动注入",
    retainedSurface: "shared-host",
    retainedMarker: "memory / skill 身份由 proxy 从 session 注入",
    rationale: "The memory guide references the shared execution owner without repeating identity semantics.",
  },
  {
    id: "skill.mandatory-load-single-rule",
    removedSurface: "skill-listing",
    removedMarker: "Err on the side of loading",
    retainedSurface: "skill-listing",
    retainedMarker: "If a listed skill matches or is even partially relevant, you MUST load it",
    rationale: "One mandatory-load sentence replaces several escalating restatements without weakening it.",
  },
  {
    id: "skill.skip-rule-folded-into-mandatory-rule",
    removedSurface: "skill-listing",
    removedMarker: "Only proceed without loading a skill if genuinely none are relevant to the task.",
    retainedSurface: "skill-listing",
    retainedMarker: "If a listed skill matches or is even partially relevant, you MUST load it",
    rationale: "The positive mandatory condition already defines the only skip condition.",
  },
] as const satisfies readonly SemanticUnitOwnership[];

export function applySemanticCompaction(
  surface: ToolPromptSurface,
  units: readonly PromptUnit[],
): PromptUnit[] {
  return units.map((unit) => ({
    ...unit,
    content: compactSurface(surface, unit.content),
  }));
}

export function lintDuplicateSemanticUnits(bundle: SemanticSurfaceBundle): void {
  const ids = SEMANTIC_UNIT_INVENTORY.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate semantic-unit ownership id");
  }
  for (const item of SEMANTIC_UNIT_INVENTORY) {
    const removedContent = bundle[item.removedSurface];
    if (removedContent === undefined) {
      throw new Error(`${item.id} missing compiled removed surface ${item.removedSurface}`);
    }
    if (removedContent.includes(item.removedMarker)) {
      throw new Error(`${item.id} duplicate marker remains on ${item.removedSurface}`);
    }
    const retainedContents = item.retainedSurface === "shared-host"
      ? Object.values(bundle)
      : [bundle[item.retainedSurface]];
    const retainedCount = retainedContents.reduce(
      (sum, content) => sum + countLiteral(content ?? "", item.retainedMarker),
      0,
    );
    if (retainedCount !== 1) {
      throw new Error(
        `${item.id} expected one retained owner ${item.retainedSurface}; found ${retainedCount}`,
      );
    }
  }
}

function compactSurface(surface: ToolPromptSurface, source: string): string {
  switch (surface) {
    case "memory-tools":
      return compactMemoryTools(source);
    case "memory-guide":
      return compactMemoryGuide(source);
    case "skill-tools":
      return compactSkillTools(source);
    case "skill-listing":
      return compactSkillListing(source);
    case "knowledge-tools":
      return compactKnowledgeTools(source);
  }
}

function compactMemoryTools(source: string): string {
  let output = ownSharedIdentity(source);
  output = removeIfPresent(output, "**这些是你可以主动调用的记忆能力**（不是文档）。\n", "memory capability duplicate");
  output = removeIfPresent(
    output,
    "遇到用户问身份/历史/偏好/过往结论/项目约定时，必须先使用下面的 TDAI 记忆工具查询，再基于查询结果回答。\n",
    "memory trigger duplicate",
  );
  output = removeIfPresent(
    output,
    "禁止说\"我没有这个工具 / 需要 MCP / 只能查本地记忆\" —— 你有 TDAI 记忆工具，就按统一调用协议执行下面的工具。\n",
    "memory denial duplicate",
  );
  output = removeIfPresent(
    output,
    [
      "覆盖范围：",
      "- L3（persona 长期画像）与 L2 场景索引（`<l2_scene_index>`）已直接注入 system，无需查询；",
      "- L2 正文按需用 tdai_read_scene 读取；",
      "- L0/L1（原始对话 / 原子记忆）**不再每轮自动召回**（会破坏 KV cache），需要时主动调工具检索。",
      "",
      "",
    ].join("\n"),
    "memory coverage duplicate",
  );
  output = removeIfPresent(
    output,
    [
      "- 每轮对话中，atomic_search + conversation_search **合计 ≤ 3 次**；",
      "  query / ls / read_scene 不计入上限，但同一 path 不要重复读。",
      "",
    ].join("\n"),
    "memory budget duplicate",
  );
  return output;
}

function compactMemoryGuide(source: string): string {
  if (!source.includes("身份由 proxy 自动注入")) return source;
  return replaceOnce(
    source,
    "**正确做法**：判定需要查记忆时，按统一协议执行对应工具；身份由 proxy 自动注入。",
    "**正确做法**：判定需要查记忆时，按统一协议执行对应工具。",
    "memory identity duplicate",
  );
}

function compactSkillTools(source: string): string {
  let output = ownSharedIdentity(source);
  const duplicatedIntro = "以下是云端 skill 操作工具。执行方式遵循统一工具调用协议，身份由 proxy 从 session 注入。";
  if (output.includes(duplicatedIntro)) {
    output = replaceOnce(
      output,
      duplicatedIntro,
      "以下是云端 skill 操作工具。",
      "skill execution duplicate",
    );
  }
  return output;
}

function compactSkillListing(source: string): string {
  let output = source;
  if (output.includes("Before replying, scan the skills below.")) {
    output = replaceRegexOnce(
      output,
      /Before replying, scan the skills below\.[\s\S]*?because the skill defines how it should be done here\.\n(?=If a skill has issues)/,
      "Before replying, scan the skills below. If a listed skill matches or is even partially relevant, you MUST load it with `skill_view` and follow it, even if you could do the task without it, because it carries specialized workflow and team conventions.\n",
      "skill mandatory-load duplicates",
    );
  }
  if (output.includes("Only proceed without loading a skill")) {
    output = removeOnce(
      output,
      "\nOnly proceed without loading a skill if genuinely none are relevant to the task.",
      "skill skip duplicate",
    );
  }
  return output;
}

function compactKnowledgeTools(source: string): string {
  return ownSharedIdentity(source);
}

function ownSharedIdentity(source: string): string {
  const from = "- `body` 必须是 JSON object，只传工具卡列出的业务字段；user_id / team_id / agent_id / task_id 等身份字段仅在工具卡明确列出时才可传。";
  if (!source.includes(from)) return source;
  const activeFamilies = source.match(/适用于当前已启用的 ([^；]+) 工具/)?.[1]
    ?.split(" / ") ?? [];
  const proxyIdentityFamilies = activeFamilies.filter(
    (family) => family === "memory" || family === "skill",
  );
  if (proxyIdentityFamilies.length === 0) return source;
  return replaceOnce(
    source,
    from,
    `- \`body\` 必须是 JSON object，只传工具卡列出的业务字段；${proxyIdentityFamilies.join(" / ")} 身份由 proxy 从 session 注入，除工具卡明确列出外不传 user_id / team_id / agent_id / task_id。`,
    "shared identity owner",
  );
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

function removeOnce(source: string, fragment: string, label: string): string {
  return replaceOnce(source, fragment, "", label);
}

function removeIfPresent(source: string, fragment: string, label: string): string {
  return source.includes(fragment) ? removeOnce(source, fragment, label) : source;
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
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`);
  const matches = [...source.matchAll(globalPattern)];
  if (matches.length !== 1) {
    throw new Error(`${label} expected exactly one match; found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}
