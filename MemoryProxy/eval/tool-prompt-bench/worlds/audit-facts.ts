/**
 * Cross-asset fact consistency.
 *
 * In a shared world the same fact appears in several assets: a decision memory, the
 * session where it was decided, the scene that records it, and the wiki page that
 * documents it. If the numbers drift between them the world contradicts itself, and
 * no schema check catches that.
 *
 * This lists every multi-digit number that appears in more than one asset, so a
 * contradiction shows up as the same fact carrying two different values.
 *
 *   npx tsx eval/tool-prompt-bench/worlds/audit-facts.ts > facts-report.txt
 */
import { writeFileSync } from "node:fs";
import { WORLDS } from "./index.js";
import type { World } from "./world-schema.js";

interface Fragment {
  id: string;
  text: string;
}

function fragments(world: World): Fragment[] {
  const items: Fragment[] = [];
  for (const memory of world.memories) items.push({ id: `mem:${memory.memoryId}`, text: memory.content });
  for (const session of world.conversations) {
    for (const [index, message] of session.messages.entries()) {
      items.push({ id: `conv:${session.sessionId}#${index}`, text: message.content });
    }
  }
  for (const scene of world.scenes) {
    items.push({ id: `scene:${scene.path}`, text: `${scene.summary}\n${scene.content}` });
  }
  for (const skill of world.skills) {
    if (skill.content) items.push({ id: `skill:${skill.name}`, text: skill.content });
    for (const [path, body] of Object.entries(skill.files ?? {})) {
      items.push({ id: `skillfile:${skill.name}/${path}`, text: body });
    }
  }
  for (const resource of world.knowledge) {
    for (const page of resource.pages ?? []) items.push({ id: `wiki:${page.ref}`, text: page.body });
    for (const symbol of resource.graph?.symbols ?? []) {
      items.push({ id: `sym:${resource.knowledgeId}/${symbol.symbol}`, text: `${symbol.file} ${symbol.signature} ${symbol.summary}` });
    }
  }
  for (const project of world.projects) {
    items.push({ id: `task:${project.projectId}`, text: project.taskDescription });
    for (const [path, body] of Object.entries(project.files)) {
      items.push({ id: `file:${path}`, text: body });
    }
  }
  for (const line of world.profileL3) items.push({ id: "profileL3", text: line });
  return items;
}

/**
 * Numbers worth cross-checking: 2+ digits so per-module counts and durations are
 * included. Below 10 there is too much incidental overlap (step numbers, list indices)
 * for a shared value to mean anything.
 */
const NUMBER = /\b\d{2,6}(?:\.\d+)?\b/g;

const lines: string[] = [];
for (const world of WORLDS) {
  const index = new Map<string, Set<string>>();
  for (const fragment of fragments(world)) {
    for (const match of fragment.text.matchAll(NUMBER)) {
      const value = match[0];
      if (!index.has(value)) index.set(value, new Set());
      index.get(value)!.add(fragment.id);
    }
  }
  lines.push(`=== ${world.worldId} ${world.name} ===`);
  const shared = [...index.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .sort((a, b) => b[1].size - a[1].size);
  for (const [value, ids] of shared) {
    lines.push(`  ${value.padEnd(8)} in ${ids.size} assets: ${[...ids].join(", ")}`);
  }
  const once = [...index.entries()].filter(([, ids]) => ids.size === 1).length;
  lines.push(`  (${shared.length} numbers shared across assets, ${once} appear once)`);
  lines.push("");
}

writeFileSync("eval/tool-prompt-bench/worlds/facts-report.txt", `${lines.join("\n")}\n`, "utf8");
console.log(`wrote facts-report.txt (${lines.length} lines)`);
