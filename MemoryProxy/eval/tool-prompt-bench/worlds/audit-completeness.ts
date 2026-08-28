/**
 * Two questions this answers, both with numbers rather than impressions:
 *
 * 1. Is each world internally consistent in language? A Chinese query whose target
 *    asset is written in English cannot be retrieved by the bridge's term matching,
 *    so a mixed world silently degrades retrieval to arbitrary ordering.
 * 2. Is every asset class actually populated, or only declared? An asset that exists
 *    as a name with no body is a placeholder, not a distractor.
 *
 *   npx tsx eval/tool-prompt-bench/worlds/audit-completeness.ts
 */
import { WORLDS } from "./index.js";
import type { World } from "./world-schema.js";

const CJK = /[一-鿿]/;

/** Target density per world, from the world design. */
const SPEC = {
  conversations: [30, 50],
  memories: [15, 25],
  scenes: [6, 10],
  boundSkills: [8, 12],
  teamSkills: [10, 20],
  knowledge: [4, 6],
};

function lang(text: string): "zh" | "en" {
  return CJK.test(text) ? "zh" : "en";
}

function mix(values: string[]): string {
  const zh = values.filter((value) => lang(value) === "zh").length;
  const en = values.length - zh;
  if (values.length === 0) return "-";
  if (zh === 0) return `en×${en}`;
  if (en === 0) return `zh×${zh}`;
  return `MIXED zh×${zh}/en×${en}`;
}

function describe(world: World): void {
  console.log(`\n=== ${world.worldId} ${world.name} (${world.split}) ===`);
  const caseLangs = world.cases.map((item) => item.language);
  const zhCases = caseLangs.filter((value) => value === "zh").length;
  console.log(`cases            : zh×${zhCases}/en×${caseLangs.length - zhCases}`);
  console.log(`case queries     : ${mix(world.cases.map((item) => item.query))}`);
  console.log(`profile L3       : ${mix(world.profileL3)}`);
  console.log(`memories         : ${mix(world.memories.map((memory) => memory.content))}`);
  console.log(`conversations    : ${mix(world.conversations.flatMap((session) => session.messages.map((message) => message.content)))}`);
  console.log(`scene summaries  : ${mix(world.scenes.map((scene) => scene.summary))}`);
  console.log(`scene bodies     : ${mix(world.scenes.map((scene) => scene.content))}`);
  console.log(`skill descriptions: ${mix(world.skills.map((skill) => skill.description))}`);
  console.log(`skill bodies     : ${mix(world.skills.flatMap((skill) => skill.content ? [skill.content] : []))}`);
  console.log(`knowledge summaries: ${mix(world.knowledge.map((resource) => resource.summary))}`);
}

function depth(world: World): void {
  const skillBodies = world.skills.filter((skill) => skill.content);
  const avg = (values: number[]): string => values.length
    ? String(Math.round(values.reduce((total, value) => total + value, 0) / values.length))
    : "-";
  const turnsPerSession = world.conversations.map((session) => session.messages.length);
  console.log(
    `depth: conv turns avg=${avg(turnsPerSession)} min=${Math.min(...turnsPerSession)} `
    + `| skill body chars avg=${avg(skillBodies.map((skill) => skill.content!.length))} `
    + `| skills with manifest=${world.skills.filter((skill) => (skill.manifest ?? []).length > 0).length}/${world.skills.length} `
    + `| scene body chars avg=${avg(world.scenes.map((scene) => scene.content.length))}`,
  );
  const filesPerProject = world.projects.map((project) => Object.keys(project.files).length);
  console.log(`       workspace files per project=${filesPerProject.join(",")}`);
  // Knowledge is the one class where the fixture declares tools but may carry no data.
  const withGraph = world.knowledge.filter((resource) => (resource as { graph?: unknown }).graph).length;
  const withPages = world.knowledge.filter((resource) => (resource as { pages?: unknown }).pages).length;
  console.log(`       knowledge: ${world.knowledge.length} declared, ${withGraph} with graph data, ${withPages} with wiki pages`);
}

const gaps: string[] = [];

for (const world of WORLDS) {
  describe(world);
  depth(world);

  const caseLangs = new Set(world.cases.map((item) => item.language));
  const assetSamples = [
    ...world.profileL3,
    ...world.memories.map((memory) => memory.content),
    ...world.scenes.map((scene) => scene.content),
    ...world.skills.map((skill) => skill.description),
    ...world.knowledge.map((resource) => resource.summary),
  ];
  const assetLangs = new Set(assetSamples.map(lang));
  if (caseLangs.size > 1) gaps.push(`${world.worldId}: cases mix zh and en in one world`);
  if (assetLangs.size > 1) gaps.push(`${world.worldId}: assets mix zh and en in one world`);
  for (const caseLang of caseLangs) {
    if (!assetLangs.has(caseLang) || assetLangs.size > 1) {
      gaps.push(`${world.worldId}: ${caseLang} cases do not have a matching single-language asset set`);
      break;
    }
  }

  const counts: Record<string, number> = {
    conversations: world.conversations.length,
    memories: world.memories.length,
    scenes: world.scenes.length,
    boundSkills: world.skills.filter((skill) => skill.bound).length,
    teamSkills: world.skills.length,
    knowledge: world.knowledge.length,
  };
  for (const [key, [low]] of Object.entries(SPEC)) {
    if (counts[key]! < low) gaps.push(`${world.worldId}: ${key}=${counts[key]} below spec minimum ${low}`);
  }
  for (const resource of world.knowledge) {
    const hasData = (resource as { graph?: unknown; pages?: unknown }).graph
      || (resource as { pages?: unknown }).pages;
    if (!hasData) gaps.push(`${world.worldId}: knowledge ${resource.knowledgeId} declares tools but carries no content`);
  }
  for (const skill of world.skills) {
    if (!skill.content) gaps.push(`${world.worldId}: skill ${skill.name} has no body`);
  }
}

console.log(`\n=== gaps (${gaps.length}) ===`);
for (const gap of gaps) console.log(`  ${gap}`);
