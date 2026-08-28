/**
 * World-level validation.
 *
 * The frozen validate.ts checks the 100-case dataset and assumes one fixture per
 * case plus a single hardcoded workspace repo. Worlds break both assumptions on
 * purpose, so they are validated here instead. Run:
 *
 *   npx tsx eval/tool-prompt-bench/worlds/validate-worlds.ts
 */
import { WORLDS } from "./index.js";
import { compileWorldCases, compileWorldFixture, projectOf } from "./compile.js";
import type { World, WorldCase } from "./world-schema.js";

const KNOWLEDGE_ID = /^(?:cg|wiki)-[0-9a-z]{8}$/;
/** Recommended density from the world design; below this is a warning, not an error. */
const BUDGET = {
  conversations: 30,
  memories: 15,
  scenes: 6,
  boundSkills: 8,
  teamSkills: 10,
  knowledge: 4,
};

const errors: string[] = [];
const warnings: string[] = [];

function skillNameFor(world: World, skillId: string): string | undefined {
  return world.skills.find((skill) => skill.skillId === skillId)?.name;
}

function checkGoldAssets(world: World, item: WorldCase): void {
  const memoryIds = new Set(world.memories.map((memory) => memory.memoryId));
  const sessionIds = new Set(world.conversations.map((session) => session.sessionId));
  const scenePaths = new Set(world.scenes.map((scene) => scene.path));
  const skillIds = new Set(world.skills.map((skill) => skill.skillId));
  const knowledgeIds = new Set(world.knowledge.map((resource) => resource.knowledgeId));
  for (const assetId of item.goldAssetIds ?? []) {
    const known = memoryIds.has(assetId)
      || sessionIds.has(assetId)
      || scenePaths.has(assetId)
      || skillIds.has(assetId)
      || knowledgeIds.has(assetId);
    if (!known) errors.push(`${item.caseId}: goldAssetId ${assetId} does not exist in ${world.worldId}`);
  }
}

function checkSkillCase(world: World, item: WorldCase): void {
  if (item.gold.family !== "skill") return;
  const actions = [item.gold.firstAction, ...(item.gold.followupActions ?? [])].filter(Boolean);
  for (const action of actions) {
    const values = action!.argumentRules?.exactValues ?? {};
    const skillName = values.skill_name;
    if (typeof skillName === "string") {
      const skill = world.skills.find((candidate) => candidate.name === skillName);
      if (!skill) {
        errors.push(`${item.caseId}: gold skill ${skillName} is not in the world team library`);
        continue;
      }
      // A bound skill is visible in the prompt; an unbound one must be searched for first.
      if (item.preconditions?.goldSkillInListing === true && !skill.bound) {
        errors.push(`${item.caseId}: goldSkillInListing is true but ${skillName} is not bound`);
      }
      if (item.preconditions?.goldSkillInListing === false && skill.bound) {
        errors.push(`${item.caseId}: goldSkillInListing is false but ${skillName} is bound and listed`);
      }
      if (!skill.bound && item.gold.firstAction?.tool === "skill_view") {
        errors.push(`${item.caseId}: unbound skill ${skillName} cannot be viewed before it is found`);
      }
    }
    const skillId = values.skill_id;
    if (typeof skillId === "string") {
      if (!world.skills.some((candidate) => candidate.skillId === skillId)) {
        errors.push(`${item.caseId}: gold skill id ${skillId} does not exist`);
      }
      const path = values.path;
      const skill = world.skills.find((candidate) => candidate.skillId === skillId);
      if (skill && typeof path === "string" && !(path in (skill.files ?? {}))) {
        errors.push(`${item.caseId}: ${skillNameFor(world, skillId)} has no manifest file ${path}`);
      }
    }
  }
}

function checkSceneCase(world: World, item: WorldCase): void {
  // Only scenario actions; skill_files_read also carries a `path` argument.
  const actions = [item.gold.firstAction, ...(item.gold.followupActions ?? [])]
    .filter((action) => action?.tool === "tdai_read_scene");
  for (const action of actions) {
    const path = action!.argumentRules?.exactValues?.path;
    if (typeof path !== "string") continue;
    const scene = world.scenes.find((candidate) => candidate.path === path);
    if (!scene) {
      errors.push(`${item.caseId}: gold scene ${path} does not exist`);
      continue;
    }
    const firstIsRead = item.gold.firstAction?.tool === "tdai_read_scene";
    if (firstIsRead && !scene.injected) {
      errors.push(`${item.caseId}: reads ${path} directly but the path is not injected`);
    }
    if (firstIsRead && item.preconditions?.scenePathInjected !== true) {
      errors.push(`${item.caseId}: direct scene read requires scenePathInjected true`);
    }
    if (!firstIsRead && scene.injected && item.preconditions?.scenePathInjected === false) {
      errors.push(`${item.caseId}: discovery flow points at an already-injected scene ${path}`);
    }
  }
}

function checkKnowledgeCase(world: World, item: WorldCase): void {
  if (item.gold.family !== "knowledge") return;
  const knowledgeId = item.gold.firstAction?.argumentRules?.exactValues?.knowledge_id;
  const resource = world.knowledge.find((candidate) => candidate.knowledgeId === knowledgeId);
  if (!resource) {
    errors.push(`${item.caseId}: gold knowledge ${String(knowledgeId)} does not exist`);
    return;
  }
  const project = projectOf(world, item.activeProject);
  // World-aware replacement for the frozen single-repo check.
  if (resource.type === "code-graph" && resource.repoSlug !== project.repoSlug) {
    errors.push(`${item.caseId}: code-graph ${resource.knowledgeId} does not index the active repo ${project.repoSlug}`);
  }
  if (resource.project !== item.activeProject) {
    errors.push(`${item.caseId}: gold knowledge belongs to ${resource.project}, not the active ${item.activeProject}`);
  }
  const toolNames = resource.tools.map((tool) => tool.name);
  for (const call of item.gold.knowledgeCalls ?? []) {
    if (!toolNames.includes(call.toolName)) {
      errors.push(`${item.caseId}: ${resource.knowledgeId} does not expose ${call.toolName}`);
    }
    const tool = resource.tools.find((candidate) => candidate.name === call.toolName);
    for (const field of call.paramRules.requiredFields ?? []) {
      if (tool && !(field in tool.params)) {
        errors.push(`${item.caseId}: ${call.toolName} does not accept ${field}`);
      }
    }
  }
  const sequence = (item.gold.knowledgeCalls ?? []).map((call) => call.toolName).join(">");
  if (resource.type === "wiki" && sequence !== "search>read_page") {
    errors.push(`${item.caseId}: wiki lookup must be search then read_page, got ${sequence || "none"}`);
  }
}

function checkNoToolCase(world: World, item: WorldCase): void {
  if (item.gold.family !== null) return;
  const fixture = compileWorldFixture(world);
  const hasDistractor = Boolean(
    fixture.assets.atomicMemories?.length
    || fixture.assets.skills?.listed.length
    || fixture.assets.knowledge?.length,
  );
  if (!hasDistractor) errors.push(`${item.caseId}: no-tool case has no reachable distractor asset`);
  if (item.gold.firstAction) errors.push(`${item.caseId}: no-tool case declares a first action`);
}

function checkWorld(world: World): void {
  const projectIds = new Set(world.projects.map((project) => project.projectId));
  if (!projectIds.has(world.defaultProject)) {
    errors.push(`${world.worldId}: defaultProject ${world.defaultProject} is not a declared project`);
  }
  if (world.projects.length < 3) {
    errors.push(`${world.worldId}: a world needs an active sub-scene plus at least two distractor sub-scenes`);
  }

  const seenSkillNames = new Set<string>();
  for (const skill of world.skills) {
    if (seenSkillNames.has(skill.name)) {
      errors.push(`${world.worldId}: duplicate skill name ${skill.name}; the bridge resolves skills by name`);
    }
    seenSkillNames.add(skill.name);
    if (!projectIds.has(skill.project)) errors.push(`${world.worldId}: skill ${skill.name} has unknown project ${skill.project}`);
    for (const entry of skill.manifest ?? []) {
      if (!(entry.path in (skill.files ?? {}))) {
        errors.push(`${world.worldId}: ${skill.name} lists manifest ${entry.path} with no file body`);
      }
    }
  }

  for (const memory of world.memories) {
    if (!projectIds.has(memory.project)) errors.push(`${world.worldId}: memory ${memory.memoryId} has unknown project ${memory.project}`);
    if (!memory.supersededBy) continue;
    const target = world.memories.find((candidate) => candidate.memoryId === memory.supersededBy);
    if (!target) {
      errors.push(`${world.worldId}: ${memory.memoryId} points at missing ${memory.supersededBy}`);
      continue;
    }
    if (target.timestamp <= memory.timestamp) {
      errors.push(`${world.worldId}: ${memory.supersededBy} is not later than ${memory.memoryId}`);
    }
    if (!target.final) {
      errors.push(`${world.worldId}: ${memory.supersededBy} supersedes a record but is not marked final`);
    }
  }

  for (const session of world.conversations) {
    if (!projectIds.has(session.project)) errors.push(`${world.worldId}: session ${session.sessionId} has unknown project ${session.project}`);
    if (session.messages.length === 0) errors.push(`${world.worldId}: session ${session.sessionId} has no messages`);
  }
  for (const scene of world.scenes) {
    if (!projectIds.has(scene.project)) errors.push(`${world.worldId}: scene ${scene.path} has unknown project ${scene.project}`);
  }
  for (const resource of world.knowledge) {
    if (!KNOWLEDGE_ID.test(resource.knowledgeId)) {
      errors.push(`${world.worldId}: knowledge id ${resource.knowledgeId} does not match the service contract`);
    }
    if (!projectIds.has(resource.project)) errors.push(`${world.worldId}: knowledge ${resource.knowledgeId} has unknown project ${resource.project}`);
    if (resource.type === "code-graph" && !resource.repoSlug) {
      errors.push(`${world.worldId}: code-graph ${resource.knowledgeId} has no repo_slug`);
    }
  }

  for (const item of world.cases) {
    if (!projectIds.has(item.activeProject)) {
      errors.push(`${item.caseId}: activeProject ${item.activeProject} is not a declared project`);
    }
    if (!item.uniqueness.trim()) errors.push(`${item.caseId}: missing uniqueness justification`);
    if (!item.annotationReason.trim()) errors.push(`${item.caseId}: missing annotationReason`);
    checkGoldAssets(world, item);
    checkSkillCase(world, item);
    checkSceneCase(world, item);
    checkKnowledgeCase(world, item);
    checkNoToolCase(world, item);
  }

  const bound = world.skills.filter((skill) => skill.bound).length;
  const density: Array<[string, number, number]> = [
    ["conversations", world.conversations.length, BUDGET.conversations],
    ["memories", world.memories.length, BUDGET.memories],
    ["scenes", world.scenes.length, BUDGET.scenes],
    ["bound skills", bound, BUDGET.boundSkills],
    ["team skills", world.skills.length, BUDGET.teamSkills],
    ["knowledge", world.knowledge.length, BUDGET.knowledge],
  ];
  for (const [label, actual, target] of density) {
    if (actual < target) warnings.push(`${world.worldId}: ${label} ${actual} is below the recommended ${target}`);
  }
}

/** Dev-world asset names must not reappear in a test world, or tuning transfers by wording. */
function checkSplitLeakage(): void {
  const namesBySplit = new Map<string, Map<string, string>>();
  for (const world of WORLDS) {
    const names = new Map<string, string>();
    for (const skill of world.skills) names.set(`skill:${skill.name}`, world.worldId);
    for (const memory of world.memories) names.set(`memory:${memory.memoryId}`, world.worldId);
    for (const session of world.conversations) names.set(`session:${session.sessionId}`, world.worldId);
    for (const scene of world.scenes) names.set(`scene:${scene.path}`, world.worldId);
    for (const resource of world.knowledge) names.set(`knowledge:${resource.knowledgeId}`, world.worldId);
    for (const project of world.projects) names.set(`repo:${project.repoSlug}`, world.worldId);
    namesBySplit.set(world.worldId, names);
  }
  const devNames = new Map<string, string>();
  for (const world of WORLDS.filter((candidate) => candidate.split === "dev")) {
    for (const [name, worldId] of namesBySplit.get(world.worldId)!) devNames.set(name, worldId);
  }
  for (const world of WORLDS.filter((candidate) => candidate.split === "test")) {
    for (const [name] of namesBySplit.get(world.worldId)!) {
      if (devNames.has(name)) {
        errors.push(`split leakage: ${name} appears in both ${devNames.get(name)} (dev) and ${world.worldId} (test)`);
      }
    }
  }
}

const seenCaseIds = new Set<string>();
const seenWorldIds = new Set<string>();
for (const world of WORLDS) {
  if (seenWorldIds.has(world.worldId)) errors.push(`duplicate worldId ${world.worldId}`);
  seenWorldIds.add(world.worldId);
  for (const item of world.cases) {
    if (seenCaseIds.has(item.caseId)) errors.push(`duplicate caseId ${item.caseId}`);
    seenCaseIds.add(item.caseId);
  }
  checkWorld(world);
}
checkSplitLeakage();

const compiled = WORLDS.flatMap((world) => compileWorldCases(world));
for (const item of compiled) {
  if (item.fixtureIds.length !== 1) errors.push(`${item.caseId}: expected exactly one world fixture`);
  const familyTools = item.gold.allowedFirstActions.map((action) => action.tool);
  for (const tool of familyTools) {
    if (item.gold.forbiddenTools.includes(tool)) {
      errors.push(`${item.caseId}: gold tool ${tool} is also listed as forbidden`);
    }
  }
  if (item.gold.needTdaiTool && item.gold.allowedFirstActions.length === 0) {
    errors.push(`${item.caseId}: positive case has no allowed first action`);
  }
  if (!item.gold.needTdaiTool && item.gold.maxTdaiCalls !== 0) {
    errors.push(`${item.caseId}: no-tool case allows ${item.gold.maxTdaiCalls} calls`);
  }
}

const summary = {
  worlds: WORLDS.length,
  cases: compiled.length,
  bySplit: Object.fromEntries(["dev", "test"].map((split) => [
    split,
    compiled.filter((item) => item.split === split).length,
  ])),
  byCategory: Object.fromEntries(
    [...new Set(compiled.map((item) => item.category))].sort().map((category) => [
      category,
      compiled.filter((item) => item.category === category).length,
    ]),
  ),
  byWorld: Object.fromEntries(WORLDS.map((world) => [
    world.worldId,
    {
      split: world.split,
      cases: world.cases.length,
      projects: world.projects.length,
      assets: {
        memories: world.memories.length,
        conversations: world.conversations.length,
        scenes: world.scenes.length,
        skillsBound: world.skills.filter((skill) => skill.bound).length,
        skillsTeam: world.skills.length,
        knowledge: world.knowledge.length,
      },
    },
  ])),
};

if (warnings.length > 0) console.warn(`${warnings.length} density warning(s):\n${warnings.join("\n")}\n`);
if (errors.length > 0) {
  console.error(`${errors.length} error(s):`);
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("evaluation worlds are valid");
  console.log(JSON.stringify(summary, null, 2));
}
