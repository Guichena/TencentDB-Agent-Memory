import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { toProviderVisibleCase, validateFormalWorldContract } from "../../../../../worlds/formal-schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMAL_ROOT = resolve(HERE, "../../../..");
const BENCH_ROOT = resolve(FORMAL_ROOT, "..");
const REPO_ROOT = resolve(BENCH_ROOT, "../../..");
const STAGING = resolve(FORMAL_ROOT, "staging/teams/T04");
const TEAM_ID = "T04";
const ACTIVE = "agent-task1-t04-general";
const ASSET_A = "agent-task1-t04-assets-a";
const ASSET_B = "agent-task1-t04-assets-b";

const routeContract = {
  tdai_memory_search: "/memory-bridge/v3/atomic/search",
  tdai_atomic_query: "/memory-bridge/v3/atomic/query",
  tdai_conversation_search: "/memory-bridge/v3/conversation/search",
  tdai_conversation_query: "/memory-bridge/v3/conversation/query",
  tdai_read_scene: "/memory-bridge/v3/scenario/read",
  skill_search: "/skill-bridge/v3/skill/search",
  skill_view: "/skill-bridge/v3/skill/get-by-name",
  skill_view_by_id: "/skill-bridge/v3/skill/get",
  skill_files_read: "/skill-bridge/v3/skill/files/read",
  knowledge_tools_list: "/tools/list",
};

function canonicalize(value, ancestors = new Set()) {
  if (value === null) return "null";
  if (["boolean", "string", "number"].includes(typeof value)) return JSON.stringify(value);
  if (typeof value !== "object") throw new TypeError(`unsupported canonical value ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError("cyclic canonical value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry, ancestors)).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function sha(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalize(value);
  return createHash("sha256").update(bytes).digest("hex");
}

function withoutHash(value) {
  const { contentHash: _ignored, ...rest } = value;
  return rest;
}

function checkHash(errors, label, value) {
  const actual = sha(withoutHash(value));
  if (actual !== value.contentHash) errors.push(`${label} contentHash mismatch`);
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function deepEqual(left, right) {
  return canonicalize(left) === canonicalize(right);
}

function push(errors, condition, message) {
  if (!condition) errors.push(message);
}

function ownerTeam(asset, agents) {
  return agents.find((item) => item.agentId === asset.ownerAgentId)?.teamId;
}

function allAssets(memory, skills, knowledge) {
  return [...memory.l0Conversations, ...memory.l1Memories, ...memory.l2Scenes, ...memory.l3Profiles, ...skills.skills, ...knowledge.knowledge];
}

function visibleSet(agentId, userId, assets, skills, agents) {
  const agent = agents.find((item) => item.agentId === agentId);
  const assetIds = assets.filter((asset) => {
    if (assetIdKinds.skill.has(asset.assetId)) {
      return asset.ownerAgentId === agentId || (asset.visibility === "team" && ownerTeam(asset, agents) === agent.teamId);
    }
    if (assetIdKinds.knowledge.has(asset.assetId)) return asset.bindings.some((binding) => binding.agentId === agentId);
    return asset.ownerAgentId === agentId || agent.importedMemoryAgentIds.includes(asset.ownerAgentId);
  }).map((asset) => asset.assetId).sort();
  const base = { teamId: TEAM_ID, userId, agentId, assetIds };
  return { ...base, sha256: sha(base) };
}

const assetIdKinds = { skill: new Set(), knowledge: new Set() };

async function main() {
  const errors = [];
  const warnings = [];
  const fragment = await json(resolve(STAGING, "team-fragment.json"));
  const memory = await json(resolve(STAGING, "assets/memory.json"));
  const skills = await json(resolve(STAGING, "assets/skills.json"));
  const knowledge = await json(resolve(STAGING, "assets/knowledge.json"));
  const reviews = await json(resolve(STAGING, "pair-review.json"));
  const inputPack = await json(resolve(HERE, "input-pack.json"));
  const assets = allAssets(memory, skills, knowledge);
  skills.skills.forEach((item) => assetIdKinds.skill.add(item.assetId));
  knowledge.knowledge.forEach((item) => assetIdKinds.knowledge.add(item.assetId));
  const assetById = new Map(assets.map((item) => [item.assetId, item]));
  const annotationByCase = new Map(fragment.privateAnnotations.map((item) => [item.caseId, item]));
  const publicById = new Map(fragment.publicCases.map((item) => [item.caseId, item]));
  const reviewByPair = new Map(reviews.pairs.map((item) => [item.pairId, item]));

  push(errors, fragment.schema_version === "task1.team_fragment.v1", "wrong fragment schema");
  push(errors, fragment.team_id === TEAM_ID && fragment.split === "dev", "wrong Team or split");
  push(errors, fragment.teams.length === 1 && fragment.teams[0].teamId === TEAM_ID, "fragment must contain exactly T04 team");
  push(errors, fragment.businessAgents.length === 3, "T04 must have three business agents");
  push(errors, fragment.tasks.length === 4, "T04 must have four project streams/tasks");
  push(errors, fragment.publicCases.length === 40, `expected 40 cases, got ${fragment.publicCases.length}`);
  push(errors, fragment.privateAnnotations.length === 40, `expected 40 annotations, got ${fragment.privateAnnotations.length}`);
  push(errors, fragment.pairs.length === 15, `expected 15 pairs, got ${fragment.pairs.length}`);
  push(errors, fragment.snapshotAssetIds.length === assets.length, "snapshot asset count mismatch");
  push(errors, new Set(fragment.snapshotAssetIds).size === fragment.snapshotAssetIds.length, "snapshot assets repeat");
  push(errors, fragment.snapshotAssetIds.every((id) => assetById.has(id)), "snapshot references unknown staged asset");
  push(errors, memory.l0Conversations.length === 10, "expected 10 L0 sessions");
  push(errors, memory.l0Conversations.every((item) => item.messages.length >= 12 && item.messages.length <= 20), "L0 sessions must have 12-20 messages");
  push(errors, memory.l1Memories.length === 16, "expected 16 L1 memories");
  push(errors, memory.l2Scenes.length === 5, "expected 5 L2 scenes");
  push(errors, memory.l3Profiles.length === 1, "expected 1 L3 profile");
  push(errors, skills.skills.length === 16, "expected 16 Skills");
  push(errors, knowledge.knowledge.length === 3, "expected 3 Knowledge assets");

  const ids = [
    ...fragment.sourceEvidence.map((item) => item.sourceId), ...fragment.businessAgents.map((item) => item.agentId),
    ...fragment.tasks.map((item) => item.taskId), ...fragment.publicCases.map((item) => item.caseId),
    ...fragment.privateAnnotations.map((item) => item.caseId), ...fragment.pairs.map((item) => item.pairId),
    ...assets.map((item) => item.assetId),
  ];
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index && !fragment.publicCases.some((item) => item.caseId === id));
  push(errors, duplicateIds.length === 0, `duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);

  for (const [label, list] of [
    ["source", fragment.sourceEvidence], ["team", fragment.teams], ["agent", fragment.businessAgents], ["task", fragment.tasks],
    ["public", fragment.publicCases], ["annotation", fragment.privateAnnotations], ["pair", fragment.pairs], ["asset", assets],
  ]) for (const item of list) checkHash(errors, `${label} ${item.sourceId ?? item.teamId ?? item.agentId ?? item.taskId ?? item.caseId ?? item.pairId ?? item.assetId}`, item);
  for (const session of memory.l0Conversations) for (const message of session.messages) checkHash(errors, `message ${message.messageId}`, message);
  for (const annotation of fragment.privateAnnotations) checkHash(errors, `gold ${annotation.caseId}`, annotation.gold);

  const positives = fragment.privateAnnotations.filter((item) => item.gold.needTdaiTool);
  const pairNegatives = fragment.privateAnnotations.filter((item) => item.pairRole === "negative");
  const naturalNegatives = fragment.privateAnnotations.filter((item) => !item.pairId);
  push(errors, positives.length === 15, `expected 15 positives, got ${positives.length}`);
  push(errors, pairNegatives.length === 15, `expected 15 paired negatives, got ${pairNegatives.length}`);
  push(errors, naturalNegatives.length === 10, `expected 10 natural negatives, got ${naturalNegatives.length}`);
  push(errors, reviews.naturalCases?.length === 10, "expected 10 Sol-reviewed natural negatives");
  const naturalPublicCases = fragment.publicCases.filter((item) => item.caseId.startsWith(`${TEAM_ID}-NAT-`));
  push(errors, new Set(naturalPublicCases.map((item) => item.query)).size === 10, "natural negatives reuse a query template");
  push(errors, new Set(naturalPublicCases.map((item) => item.identity.taskId)).size === 4, "natural negatives must cover all four T04 project streams");
  for (const item of reviews.naturalCases ?? []) {
    push(errors, item.distractors.length >= 2, `${item.draftCaseId} lacks two distractors`);
    push(errors, item.distractors.every((id) => assetById.has(id)), `${item.draftCaseId} has an unknown distractor`);
    push(errors, typeof item.whyCurrentContextIsSufficient === "string" && item.whyCurrentContextIsSufficient.trim().length > 0, `${item.draftCaseId} lacks sufficiency review`);
  }
  const familyCount = Object.fromEntries(["memory", "skill", "knowledge"].map((family) => [family, positives.filter((item) => item.gold.family === family).length]));
  push(errors, familyCount.memory === 6 && familyCount.skill === 6 && familyCount.knowledge === 3, `wrong family counts ${JSON.stringify(familyCount)}`);
  const plannedTargets = {
    memory: inputPack.final_positive_plan.memory.map((item) => item.target).sort(),
    skill: inputPack.final_positive_plan.skill.map((item) => item.target).sort(),
    knowledge: inputPack.final_positive_plan.knowledge.map((item) => item.target).sort(),
  };
  const actualTargets = Object.fromEntries(["memory", "skill", "knowledge"].map((family) => [family, positives.filter((item) => item.gold.family === family).map((item) => item.gold.targetAssetIds[0]).sort()]));
  for (const family of ["memory", "skill", "knowledge"]) push(errors, deepEqual(actualTargets[family], plannedTargets[family]), `${family} targets drifted from frozen input plan`);
  const searchFirstCount = Object.fromEntries(["memory", "skill", "knowledge"].map((family) => [family, positives.filter((item) => item.gold.family === family && ["tdai_memory_search", "tdai_conversation_search", "skill_search", "knowledge_tools_list"].includes(item.gold.allowedSequences[0][0])).length]));
  push(errors, searchFirstCount.memory === 4, `Memory search-first expected 4, got ${searchFirstCount.memory}`);
  push(errors, searchFirstCount.skill === 3, `Skill search-first expected 3, got ${searchFirstCount.skill}`);
  push(errors, searchFirstCount.knowledge === 3, `Knowledge discovery-first expected 3, got ${searchFirstCount.knowledge}`);

  for (const pair of fragment.pairs) {
    const positive = publicById.get(pair.positiveCaseId);
    const negative = publicById.get(pair.negativeCaseId);
    const pa = annotationByCase.get(pair.positiveCaseId);
    const na = annotationByCase.get(pair.negativeCaseId);
    push(errors, Boolean(positive && negative && pa && na), `${pair.pairId} incomplete`);
    if (!positive || !negative || !pa || !na) continue;
    push(errors, positive.query === negative.query, `${pair.pairId} query drift`);
    push(errors, deepEqual(positive.workspace, negative.workspace), `${pair.pairId} workspace drift`);
    push(errors, positive.identity.taskId === negative.identity.taskId && positive.snapshotId === negative.snapshotId, `${pair.pairId} identity/snapshot drift`);
    push(errors, positive.contextMessages.length === negative.contextMessages.length, `${pair.pairId} context length drift`);
    push(errors, deepEqual(positive.contextMessages.slice(0, -1), negative.contextMessages.slice(0, -1)), `${pair.pairId} shared context drift`);
    push(errors, !deepEqual(positive.contextMessages.at(-1), negative.contextMessages.at(-1)), `${pair.pairId} delta did not change`);
    const deltaHash = createHash("sha256").update(JSON.stringify({ positive_delta_message: positive.contextMessages.at(-1), negative_delta_message: negative.contextMessages.at(-1), query: positive.query }), "utf8").digest("hex");
    push(errors, deltaHash === pair.controlledDeltaSha256, `${pair.pairId} controlled delta mismatch`);
    push(errors, pa.gold.needTdaiTool && !na.gold.needTdaiTool, `${pair.pairId} Gold polarity mismatch`);
    push(errors, na.gold.maxTdaiCalls === 0 && na.gold.allowedSequences.length === 0 && na.gold.targetAssetIds.length === 0, `${pair.pairId} negative still allows a tool`);
    const review = reviewByPair.get(pair.pairId);
    push(errors, Boolean(review), `${pair.pairId} lacks Sol review`);
    if (review) {
      push(errors, review.distractors.length >= 2, `${pair.pairId} lacks two distractors`);
      push(errors, review.distractors.every((id) => assetById.has(id) && id !== review.target), `${pair.pairId} has invalid distractor`);
      push(errors, deepEqual(review.sequence, pa.gold.allowedSequences[0]), `${pair.pairId} reviewed sequence drift`);
    }
  }

  for (const item of reviews.pairs) {
    const plan = inputPack.final_positive_plan[item.family].find((candidate) => candidate.target === item.target);
    push(errors, Boolean(plan), `${item.pairId} target is absent from frozen positive plan`);
    if (plan) {
      const plannedRoute = item.family === "knowledge" ? ["knowledge_tools_list", "knowledge_tools_call"] : plan.route;
      push(errors, deepEqual(item.sequence, plannedRoute), `${item.pairId} route drifted from frozen positive plan`);
    }
  }

  const reviewByTarget = new Map(reviews.pairs.map((item) => [item.target, item]));
  const semanticText = (target) => {
    const item = reviewByTarget.get(target);
    return item ? `${item.query}\n${item.informationGap}\n${item.negativeDelta}`.toLowerCase() : "";
  };
  const jakartaText = semanticText("T04-SKILL-JAKARTA");
  const restClientText = semanticText("T04-SKILL-RESTCLIENT");
  const dependencyText = semanticText("T04-SKILL-MAVEN-DEPENDENCY");
  const lifecycleText = semanticText("T04-SKILL-MAVEN-LIFECYCLE");
  const pluginText = semanticText("T04-SKILL-MAVEN-PLUGIN");
  const testingText = semanticText("T04-SKILL-SPRING-TESTING");
  push(errors, /jakarta/.test(jakartaText) && /javax\.sql/.test(jakartaText) && /javax\.crypto/.test(jakartaText), "Jakarta pair lacks the retained JDK javax.sql/javax.crypto boundary");
  push(errors, /restclient/.test(restClientText) && /(同步|synchronous)/.test(restClientText), "RestClient pair lacks the synchronous migration boundary");
  push(errors, /(dependency|依赖)/.test(dependencyText) && /(convergence|收敛|dependencymanagement|bom|exclusion|scope)/.test(dependencyText), "Maven dependency pair lacks dependency-resolution evidence");
  push(errors, /(lifecycle|生命周期)/.test(lifecycleText) && /(phase|阶段|profile|模块)/.test(lifecycleText), "Maven lifecycle pair lacks phase/profile/module evidence");
  push(errors, /(plugin|插件)/.test(pluginText) && /(execution|goal|parameter|inherit|执行|目标|参数|继承)/.test(pluginText), "Maven plugin pair lacks execution/configuration evidence");
  push(errors, new Set([dependencyText, lifecycleText, pluginText]).size === 3, "Maven root-cause pairs reuse one textual template");
  push(errors, /restclienttest\.md|restclient/.test(testingText), "Spring testing pair lacks the RestClient resource boundary");

  const active = fragment.businessAgents.find((item) => item.agentId === ACTIVE);
  push(errors, active.importedMemoryAgentIds.length === 2 && active.importedMemoryAgentIds.includes(ASSET_A) && active.importedMemoryAgentIds.includes(ASSET_B), "active Memory imports must be exactly the two T04 asset agents");
  push(errors, active.boundSkillIds.length === 6, "active listing must have six Skills");
  push(errors, active.fixedKnowledgeIds.length === 3, "active agent must have three fixed Knowledge resources");
  const activeVisible = new Set(fragment.snapshotAssetIds);
  for (const annotation of positives) {
    const sequence = annotation.gold.allowedSequences[0];
    const target = annotation.gold.targetAssetIds[0];
    const asset = assetById.get(target);
    push(errors, activeVisible.has(target) && Boolean(asset), `${annotation.caseId} target not visible`);
    push(errors, annotation.gold.maxTdaiCalls === sequence.length, `${annotation.caseId} maxTdaiCalls is not minimal sequence length`);
    push(errors, annotation.gold.allowedFirstActions.length === 1 && annotation.gold.allowedFirstActions[0].tool === sequence[0], `${annotation.caseId} first action mismatch`);
    const actionList = [...annotation.gold.allowedFirstActions, ...(annotation.gold.expectedFollowupActions ?? [])];
    for (const action of actionList) push(errors, routeContract[action.tool] === action.endpoint, `${annotation.caseId} wrong production endpoint for ${action.tool}`);
    if (annotation.gold.family === "knowledge") {
      push(errors, deepEqual(sequence, ["knowledge_tools_list", "knowledge_tools_call"]), `${annotation.caseId} Knowledge chain is not list->call`);
      push(errors, annotation.gold.expectedKnowledgeCalls?.length === 1 && annotation.gold.expectedKnowledgeCalls[0].toolName === "search", `${annotation.caseId} Knowledge call must be search`);
      push(errors, knowledge.fixtures[target]?.status === "ready" && knowledge.fixtures[target]?.tools.includes("search"), `${annotation.caseId} Knowledge fixture not ready/searchable`);
    }
    if (annotation.gold.family === "skill") {
      const isSearch = sequence[0] === "skill_search";
      push(errors, isSearch ? asset.visibility === "team" && !active.boundSkillIds.includes(target) : asset.ownerAgentId === ACTIVE && active.boundSkillIds.includes(target), `${annotation.caseId} Skill listing/search visibility mismatch`);
      if (sequence.includes("skill_files_read")) push(errors, asset.manifest.some((entry) => entry.path === "references/restclienttest.md"), `${annotation.caseId} resource path missing from manifest`);
    }
    if (annotation.gold.family === "memory") push(errors, asset.ownerAgentId === ACTIVE || active.importedMemoryAgentIds.includes(asset.ownerAgentId), `${annotation.caseId} Memory target owner is not imported`);
  }

  const privateKeys = /"(?:gold|pairId|pairRole|sourceEvidenceIds|targetAssetIds|allowedFirstActions|expectedFollowupActions|expectedKnowledgeCalls|allowedSequences|forbiddenTools|informationGap|stopAfter|annotationReason|ablationEvidence|noToolEvidence|needTdaiTool|family)"/;
  const textualLeaks = [
    /\/memory-bridge\//i, /\/skill-bridge\//i, /\/tools\/(?:list|call)/i,
    /\btdai_(?:memory|atomic|conversation|scenario|read)[a-z_]*\b/i,
    /\bskill_(?:search|view|view_by_id|files_read)\b/i,
    /\bknowledge_tools_(?:list|call)\b/i,
    /\bT04-(?:L[0-3]|SKILL|KNOW)-[A-Z0-9-]+\b/,
  ];
  let providerLeakCount = 0;
  for (const publicCase of fragment.publicCases) {
    const provider = toProviderVisibleCase(publicCase);
    const encoded = JSON.stringify(provider);
    const providerText = JSON.stringify({ language: provider.language, contextMessages: provider.contextMessages, query: provider.query });
    if (privateKeys.test(encoded) || textualLeaks.some((pattern) => pattern.test(providerText))) {
      providerLeakCount += 1;
      errors.push(`${publicCase.caseId} provider leakage`);
    }
  }

  const frozenWithoutHash = { ...inputPack };
  delete frozenWithoutHash.input_pack_sha256;
  push(errors, sha(frozenWithoutHash) === inputPack.input_pack_sha256, "input pack canonical hash mismatch");
  const sourceLockByAsset = new Map(inputPack.frozen_skills.map((item) => [item.assetId, item]));
  for (const imported of fragment.externalImports) {
    const lock = sourceLockByAsset.get(imported.assetId);
    push(errors, Boolean(lock), `${imported.assetId} missing source lock`);
    if (!lock) continue;
    const rawPath = resolve(BENCH_ROOT, imported.localRawPath);
    const adaptedPath = resolve(BENCH_ROOT, imported.localAdaptedPath);
    const sourcePath = resolve(dirname(rawPath), "../source.json");
    const licensePath = resolve(dirname(rawPath), "../LICENSE.txt");
    const raw = await readFile(rawPath);
    const adapted = await readFile(adaptedPath);
    const source = await json(sourcePath);
    const license = await readFile(licensePath, "utf8");
    push(errors, sha(raw) === imported.rawSha256 && imported.rawSha256 === lock.raw_file_sha256, `${imported.assetId} raw hash mismatch`);
    push(errors, sha(adapted) === lock.adapted_file_sha256, `${imported.assetId} adapted hash mismatch`);
    push(errors, source.repository === imported.repository && source.commit_sha === imported.commit && source.path === imported.path, `${imported.assetId} source lock metadata mismatch`);
    push(errors, source.license === imported.license && license.trim().length > 0, `${imported.assetId} license missing/mismatch`);
    push(errors, /^[a-f0-9]{40}$/.test(imported.commit) && /^[a-f0-9]{64}$/.test(imported.rawSha256), `${imported.assetId} source pin malformed`);
    push(errors, sha(Buffer.from(license.replace(/\r\n/g, "\n"), "utf8")) === source.license_sha256, `${imported.assetId} license hash mismatch`);
    for (const resource of source.resource_files ?? []) {
      const rawResource = resolve(dirname(rawPath), resource.localPath);
      const adaptedResource = resolve(dirname(adaptedPath), resource.localPath);
      push(errors, sha(await readFile(rawResource)) === resource.sha256, `${imported.assetId} raw resource hash mismatch: ${resource.localPath}`);
      push(errors, sha(await readFile(adaptedResource)) === resource.sha256, `${imported.assetId} adapted resource hash mismatch: ${resource.localPath}`);
    }
  }
  push(errors, fragment.externalImports.length === 16, "expected 16 external Skill imports");

  for (const batch of fragment.generatorBatchRefs) {
    push(errors, batch.generatorModel === "gpt-5.6-luna" && batch.reasoningEffort === "high" && batch.forkTurns === "none", `${batch.batchId} has wrong Luna settings`);
    push(errors, batch.inputPackSha256 === inputPack.input_pack_sha256, `${batch.batchId} input pack hash mismatch`);
    const batchDir = resolve(BENCH_ROOT, batch.path);
    const familyArg = batch.family;
    try {
      execFileSync(process.execPath, [resolve(FORMAL_ROOT, "generators/DS02/T01/validate-luna-batch.mjs"), batchDir, familyArg, String(batch.count), TEAM_ID, "DS03"], { stdio: "pipe" });
    } catch (error) {
      errors.push(`batch validator failed for ${batch.batchId}: ${error.stdout?.toString() || error.message}`);
    }
  }

  try {
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "-z"], { cwd: REPO_ROOT });
    const entries = status.toString("utf8").split("\0").filter(Boolean);
    const allowedPrefixes = [
      "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-02/T03/",
      "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-02/T04/",
      "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T03/",
      "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T04/",
      "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T03/",
      "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T04/",
    ];
    for (const entry of entries) {
      const path = entry.slice(3).replaceAll("\\", "/");
      if (!allowedPrefixes.some((prefix) => path.startsWith(prefix))) errors.push(`out-of-scope changed path: ${path}`);
    }
  } catch (error) {
    errors.push(`git scope check failed: ${error.message}`);
  }

  const baseline = await json(resolve(FORMAL_ROOT, "registry/contracts/formal-v1.json"));
  const fragmentCaseIds = new Set(fragment.publicCases.map((item) => item.caseId));
  const fragmentPairIds = new Set(fragment.pairs.map((item) => item.pairId));
  baseline.sourceEvidence = [...baseline.sourceEvidence.filter((item) => !fragment.sourceEvidence.some((added) => added.sourceId === item.sourceId)), ...fragment.sourceEvidence];
  baseline.teams = [...baseline.teams.filter((item) => item.teamId !== TEAM_ID), ...fragment.teams];
  baseline.businessAgents = [...baseline.businessAgents.filter((item) => item.teamId !== TEAM_ID), ...fragment.businessAgents];
  baseline.tasks = [...baseline.tasks.filter((item) => item.teamId !== TEAM_ID), ...fragment.tasks];
  baseline.publicCases = [...baseline.publicCases.filter((item) => item.identity.teamId !== TEAM_ID), ...fragment.publicCases];
  baseline.privateAnnotations = [...baseline.privateAnnotations.filter((item) => !fragmentCaseIds.has(item.caseId) && !item.caseId.startsWith(`${TEAM_ID}-`)), ...fragment.privateAnnotations];
  baseline.pairs = [...baseline.pairs.filter((item) => !fragmentPairIds.has(item.pairId) && !item.pairId.startsWith(`${TEAM_ID}-`)), ...fragment.pairs];
  for (const key of ["l0Conversations", "l1Memories", "l2Scenes", "l3Profiles", "skills", "knowledge"]) {
    const additions = key === "l0Conversations" ? memory.l0Conversations : key === "l1Memories" ? memory.l1Memories : key === "l2Scenes" ? memory.l2Scenes : key === "l3Profiles" ? memory.l3Profiles : key === "skills" ? skills.skills : knowledge.knowledge;
    baseline.assets[key] = [...baseline.assets[key].filter((item) => !item.assetId.startsWith(`${TEAM_ID}-`)), ...additions];
  }
  baseline.world.sourceEvidenceIds = baseline.sourceEvidence.map((item) => item.sourceId);
  baseline.world.contentHash = sha(withoutHash(baseline.world));
  const dev = baseline.snapshots.find((item) => item.split === "dev");
  const mergedAssets = [...baseline.assets.l0Conversations, ...baseline.assets.l1Memories, ...baseline.assets.l2Scenes, ...baseline.assets.l3Profiles, ...baseline.assets.skills, ...baseline.assets.knowledge];
  const t04Sets = fragment.businessAgents.map((agent) => visibleSet(agent.agentId, agent.agentId === ACTIVE ? "user-task1-t04-eval" : `user-${agent.agentId}`, mergedAssets, baseline.assets.skills, fragment.businessAgents));
  dev.visibleAssetSets = [...dev.visibleAssetSets.filter((item) => item.teamId !== TEAM_ID), ...t04Sets];
  dev.sourcePackSha256 = sha(baseline.sourceEvidence);
  dev.contentHash = sha(withoutHash(dev));
  const formal = validateFormalWorldContract(baseline);
  if (!formal.valid) errors.push(...formal.errors.map((error) => `formal-schema: ${error}`));

  const chainChecks = positives.map((annotation) => ({
    caseId: annotation.caseId,
    family: annotation.gold.family,
    sequence: annotation.gold.allowedSequences[0],
    targetAssetId: annotation.gold.targetAssetIds[0],
    targetVisible: activeVisible.has(annotation.gold.targetAssetIds[0]),
    fixtureReady: annotation.gold.family !== "knowledge" || knowledge.fixtures[annotation.gold.targetAssetIds[0]]?.status === "ready",
    complete: annotation.gold.allowedSequences[0].length === annotation.gold.maxTdaiCalls,
  }));
  push(errors, chainChecks.every((item) => item.targetVisible && item.fixtureReady && item.complete), "minimal chain fixture synthesis failed");

  const result = {
    schema_version: "task1.team_gate.v1",
    team_id: TEAM_ID,
    build_id: "build-02",
    status: errors.length === 0 ? "passed" : "failed",
    checked_at: "2026-08-29T23:59:00+08:00",
    counts: {
      cases: fragment.publicCases.length,
      pairs: fragment.pairs.length,
      positives: familyCount,
      paired_negatives: pairNegatives.length,
      natural_negatives: naturalNegatives.length,
      assets: { l0: memory.l0Conversations.length, l1: memory.l1Memories.length, l2: memory.l2Scenes.length, l3: memory.l3Profiles.length, skills: skills.skills.length, knowledge: knowledge.knowledge.length },
    },
    luna_batches: fragment.generatorBatchRefs,
    external_imports: fragment.externalImports.length,
    gold_chains: {
      memory_search_first: searchFirstCount.memory,
      memory_direct_first: familyCount.memory - searchFirstCount.memory,
      skill_search_first: searchFirstCount.skill,
      skill_listed_first: familyCount.skill - searchFirstCount.skill,
      knowledge_list_then_call: searchFirstCount.knowledge,
      complete_chain_fixtures: chainChecks.length,
    },
    gates: {
      batch_format: errors.every((item) => !item.startsWith("batch validator")),
      formal_schema_merge_simulation: formal.valid,
      pair_single_variable: !errors.some((item) => item.includes("drift") || item.includes("delta")),
      visibility: !errors.some((item) => item.includes("visible") || item.includes("visibility") || item.includes("import")),
      external_skill_source_locks: !errors.some((item) => item.includes("source lock") || item.includes("raw hash") || item.includes("license") || item.includes("source pin")),
      provider_leak_count: providerLeakCount,
      path_scope: !errors.some((item) => item.includes("out-of-scope")),
      minimal_call_chains: chainChecks.every((item) => item.complete && item.targetVisible && item.fixtureReady),
    },
    outputs: [
      "formal-dataset/staging/teams/T04/team-fragment.json",
      "formal-dataset/staging/teams/T04/assets/memory.json",
      "formal-dataset/staging/teams/T04/assets/skills.json",
      "formal-dataset/staging/teams/T04/assets/knowledge.json",
      "formal-dataset/staging/teams/T04/review.md",
    ],
    pending_integration: ["merge Team fragment into the global contract", "rebuild dev snapshot and cross-Team hashes", "publish provider/private exports", "run cross-Team duplicate/leakage gates"],
    warnings,
    error_count: errors.length,
    errors,
  };
  await writeFile(resolve(STAGING, "gate.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  process.exit(errors.length === 0 ? 0 : 1);
}

await main();
