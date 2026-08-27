import type { ToolPromptSpec } from "../types.js";

export const SKILL_TOOL_PROMPT_SPECS = [
  {
    id: "skill_search",
    contractId: "skill_search",
    when: "A reusable team workflow may exist but its exact skill name is not known.",
  },
  {
    id: "skill_view",
    contractId: "skill_view",
    when: "A known or discovered skill must be opened to read its instructions and resource manifest.",
  },
  {
    id: "skill_files_read",
    contractId: "skill_files_read",
    when: "A specific resource path from a viewed skill manifest must be read into context.",
    avoid: "Do not guess skill ids or resource paths.",
  },
  {
    id: "skill_files_download",
    contractId: "skill_files_download",
    when: "A specific resource path from a viewed skill manifest must be downloaded as raw bytes.",
    avoid: "Do not guess skill ids or resource paths.",
  },
  {
    id: "skill_extract",
    contractId: "skill_extract",
    when: "A completed conversation workflow is reusable and the current lifecycle capability allows forced archival.",
  },
  {
    id: "skill_create",
    contractId: "skill_create",
    when: "A new reusable skill must be persisted and write capability is enabled.",
  },
  {
    id: "skill_update",
    contractId: "skill_update",
    when: "The complete SKILL.md body of an owned skill must be replaced.",
  },
  {
    id: "skill_patch",
    contractId: "skill_patch",
    when: "A narrow substring edit to an owned skill is safer than replacing the entire body.",
  },
  {
    id: "skill_delete",
    contractId: "skill_delete",
    when: "An owned skill must be archived.",
  },
  {
    id: "skill_files_write",
    contractId: "skill_files_write",
    when: "One or more resource files of an owned skill must be created or replaced.",
  },
  {
    id: "skill_files_remove",
    contractId: "skill_files_remove",
    when: "One or more resource files of an owned skill must be removed.",
  },
] as const satisfies readonly ToolPromptSpec[];
