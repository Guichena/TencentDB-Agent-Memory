import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const workspace = process.cwd();
const buildRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17");
const stagingRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T17");
const sourceRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T17");
const worldAsOf = "2026-08-31T23:00:00+08:00";
const observedAt = "2026-08-31T18:00:00+08:00";

const readJson = async (path) => JSON.parse(await readFile(resolve(workspace, path), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const canonicalSha256 = (value) => sha256(Buffer.from(canonical(value), "utf8"));
const withHash = (value) => ({ ...value, contentHash: canonicalSha256(value) });
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const input = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/input-pack.json");
const sourceLock = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/source-lock.json");
const memoryAssetsDraft = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/memory-bulk-01/assets-draft.json");
const adaptationDraft = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/skill-bulk-01/adaptation-draft.json");

const pairDrafts = {
  memoryTrial: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/trial-memory-01/draft.json"),
  memoryBulk: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/memory-bulk-01/draft.json"),
  memoryReplacement: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/memory-replacement-02/draft.json"),
  skillTrial: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/trial-skill-01/draft.json"),
  skillBulk: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/skill-bulk-01/draft.json"),
  knowledgeReplacement: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/knowledge-replacement-01/draft.json"),
  natural: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/natural-bulk-01/draft.json"),
};

const acceptedBatchPaths = [
  "trial-memory-01", "memory-bulk-01", "memory-replacement-02",
  "trial-skill-01", "skill-bulk-01", "knowledge-replacement-01", "natural-bulk-01",
];
const manifests = new Map();
for (const batchPath of acceptedBatchPaths) {
  const manifest = await readJson(`MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T17/${batchPath}/manifest.json`);
  manifests.set(batchPath, manifest);
}

const sourceIds = {
  anchor: "T17-SRC-SOL-ANCHOR-01",
  l0: "T17-SRC-MEMORY-L0-01",
  l1: "T17-SRC-MEMORY-L1-01",
  l2: "T17-SRC-MEMORY-L2-01",
  l3: "T17-SRC-MEMORY-L3-01",
  knowledge: "T17-SRC-KNOWLEDGE-WIKI-01",
  natural: "T17-SRC-NATURAL-01",
};
const evalSourceByBatchPath = Object.fromEntries(acceptedBatchPaths
  .filter((path) => path !== "natural-bulk-01")
  .map((path) => [path, `T17-SRC-PAIR-${path.toUpperCase()}`]));
const skillSourceId = (assetId) => `T17-SRC-SKILL-${assetId.slice(-2)}`;

const syntheticEvidence = ({ sourceId, role, transform, batchPath, batchId, generatedAt, contentRefs, generatorModel = "gpt-5.6-luna" }) => withHash({
  sourceId,
  provenanceKind: "synthetic",
  role,
  origin: "synthetic_agent_replay",
  worldAsOf,
  transform,
  transformVersion: "task1.formal-v2.t17.v1",
  reviewStatus: "reviewed",
  generatorModel,
  reasoningEffort: "high",
  promptVersion: generatorModel === "gpt-5.6-sol" ? "task1.sol-freeze.v1" : "task1.luna-batch.v1",
  batchId: batchId ?? manifests.get(batchPath)?.batch_id,
  generatedAt: generatedAt ?? manifests.get(batchPath)?.generated_at,
  contentRefs,
});

const externalEvidence = sourceLock.skills.map((skill) => {
  const repo = Object.values(sourceLock.repositories).find((candidate) => candidate.repository === skill.repository);
  return withHash({
    sourceId: skillSourceId(skill.assetId),
    provenanceKind: "external_import",
    role: "skill_source",
    origin: "repo_document",
    worldAsOf,
    transform: "skill_package_import",
    transformVersion: "task1.skill-adaptation.v1",
    reviewStatus: "reviewed",
    dataset: "GitHub repository file",
    datasetRevision: skill.revision,
    datasetArtifactSha256: skill.rawSha256,
    sourceRepoUrl: skill.repository,
    sourceRepoCommit: skill.revision,
    sourceRepoLicense: skill.license,
    sourceTaskTime: repo.committedAt,
    trajectoryGeneratedAt: "2026-08-31T12:30:00+08:00",
    evidenceLocator: skill.path,
    evidenceSha256: skill.rawSha256,
    transformInputSha256: skill.rawSha256,
    piiScan: "passed",
    reviewedBy: "gpt-5.6-sol",
  });
});

const activeAgentId = input.identity.active_agent_id;
const assetAgentA = input.identity.asset_agents[0];
const assetAgentB = input.identity.asset_agents[1];
const memoryAssetIds = [];
const l0Conversations = memoryAssetsDraft.l0_sessions.map((session, sessionIndex) => {
  const sessionId = `session-task1-t17-${session.session_id}`;
  const messages = session.messages.map((message, messageIndex) => withHash({
    messageId: message.message_id,
    role: message.role,
    content: message.content,
    sourceEvidenceIds: [sourceIds.l0],
    observedAt: `2026-08-${String(10 + sessionIndex).padStart(2, "0")}T${String(8 + (messageIndex % 10)).padStart(2, "0")}:00:00+08:00`,
  }));
  memoryAssetIds.push(session.asset_id);
  return withHash({
    assetId: session.asset_id,
    ownerAgentId: activeAgentId,
    sourceEvidenceIds: [sourceIds.l0],
    observedAt,
    sessionId,
    messages,
  });
});
const sessionByAsset = new Map(memoryAssetsDraft.l0_sessions.map((session) => [session.asset_id, `session-task1-t17-${session.session_id}`]));
const messageIdsBySessionAsset = new Map(l0Conversations.map((session) => [
  memoryAssetsDraft.l0_sessions.find((draft) => `session-task1-t17-${draft.session_id}` === session.sessionId).asset_id,
  session.messages.map((message) => message.messageId),
]));

const l1Memories = memoryAssetsDraft.l1_memories.map((memory) => {
  memoryAssetIds.push(memory.asset_id);
  return withHash({
    assetId: memory.asset_id,
    ownerAgentId: activeAgentId,
    sourceEvidenceIds: [sourceIds.l1],
    observedAt,
    type: memory.title.toLowerCase().includes("preference") ? "preference" : "decision",
    content: memory.content,
    status: "active",
    validFrom: "2026-08-12T00:00:00+08:00",
    supportingMessageIds: [...new Set(memory.support_chain.flatMap((sessionAssetId) => messageIdsBySessionAsset.get(sessionAssetId) ?? []).slice(-4))],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
  });
});

const l2Support = {
  "T17-L2-01": ["T17-L0-01", "T17-L0-08"],
  "T17-L2-02": ["T17-L0-03", "T17-L0-07"],
  "T17-L2-03": ["T17-L0-04", "T17-L0-10"],
  "T17-L2-04": ["T17-L0-02", "T17-L0-06"],
  "T17-L2-05": ["T17-L0-05", "T17-L0-09"],
};
const l2Scenes = memoryAssetsDraft.l2_scenes.map((scene) => {
  memoryAssetIds.push(scene.asset_id);
  return withHash({
    assetId: scene.asset_id,
    ownerAgentId: activeAgentId,
    sourceEvidenceIds: [sourceIds.l2],
    observedAt,
    path: scene.path,
    summary: scene.summary,
    content: scene.content,
    injected: true,
    supportingSessionIds: l2Support[scene.asset_id].map((assetId) => sessionByAsset.get(assetId)),
  });
});
const l3Profiles = memoryAssetsDraft.l3_profiles.map((profile) => {
  memoryAssetIds.push(profile.asset_id);
  return withHash({
    assetId: profile.asset_id,
    ownerAgentId: activeAgentId,
    sourceEvidenceIds: [sourceIds.l3],
    observedAt,
    content: profile.content,
    stability: "team",
  });
});

const adaptationByAsset = new Map(adaptationDraft.adaptations.map((item) => [item.asset_id, item]));
const skillAssets = [];
const adaptationAudit = [];
for (const skill of sourceLock.skills) {
  const adaptation = adaptationByAsset.get(skill.assetId);
  if (!adaptation) throw new Error(`missing adaptation for ${skill.assetId}`);
  const rawPath = resolve(workspace, skill.copiedTo);
  const raw = await readFile(rawPath, "utf8");
  const hostLines = [
    "## TDAI Host Routing",
    "",
    "Load this package with `skill_view`. If the manifest points to a supporting file, read that file with `skill_files_read`; do not install or execute source-repository dependencies for Task 1.",
    "",
    "Use when:",
    ...adaptation.use_when.map((item) => `- ${item}`),
    "",
    "Do not use when:",
    ...adaptation.do_not_use_when.map((item) => `- ${item}`),
    "",
    "The upstream technical workflow below is preserved unchanged.",
    "",
  ];
  const frontmatterEnd = raw.indexOf("\n---", 4);
  if (frontmatterEnd < 0) throw new Error(`cannot locate frontmatter end for ${skill.assetId}`);
  const insertAt = frontmatterEnd + 4;
  const inserted = `\n\n${hostLines.join("\n")}`;
  const adapted = `${raw.slice(0, insertAt)}${inserted}${raw.slice(insertAt)}`;
  const adaptedPath = resolve(sourceRoot, "adapted", skill.name, "SKILL.md");
  await mkdir(dirname(adaptedPath), { recursive: true });
  await writeFile(adaptedPath, adapted, "utf8");
  const patchPath = resolve(sourceRoot, "diffs", `${skill.name}.patch`);
  await mkdir(dirname(patchPath), { recursive: true });
  const insertedLines = inserted.trimEnd().split("\n");
  const insertionLine = raw.slice(0, insertAt).split("\n").length + 1;
  const patchText = [
    `--- a/${skill.path}`,
    `+++ b/adapted/${skill.name}/SKILL.md`,
    `@@ -${insertionLine},0 +${insertionLine},${insertedLines.length} @@`,
    ...insertedLines.map((line) => `+${line}`),
    "",
  ].join("\n");
  await writeFile(patchPath, patchText, "utf8");
  const adaptedSha256 = sha256(Buffer.from(adapted, "utf8"));
  const manifest = [{ path: "SKILL.md", sha256: adaptedSha256 }];
  if (skill.assetId === "T17-SKL-02") {
    const resource = sourceLock.resources.find((item) => item.assetId === skill.assetId);
    const resourceBytes = await readFile(resolve(workspace, resource.copiedTo));
    const resourcePath = resolve(sourceRoot, "adapted", skill.name, resource.manifestPath);
    await mkdir(dirname(resourcePath), { recursive: true });
    await writeFile(resourcePath, resourceBytes);
    manifest.push({ path: resource.manifestPath, sha256: resource.rawSha256 });
  }
  const numeric = Number(skill.assetId.slice(-2));
  const ownerAgentId = numeric <= 6 ? activeAgentId : numeric <= 11 ? assetAgentA : assetAgentB;
  skillAssets.push(withHash({
    assetId: skill.assetId,
    ownerAgentId,
    sourceEvidenceIds: [skillSourceId(skill.assetId)],
    observedAt,
    name: skill.name,
    version: "1.0.0-t17",
    description: adaptation.listing_description,
    useWhen: adaptation.use_when.join("; "),
    doNotUseWhen: adaptation.do_not_use_when.join("; "),
    repoCommit: skill.revision,
    visibility: numeric <= 6 ? "private" : "team",
    provenanceMode: "imported_open_source",
    supportingSessionIds: [],
    codeEvidenceLocators: [],
    testEvidenceLocators: [],
    manifest,
  }));
  adaptationAudit.push({
    assetId: skill.assetId,
    repository: skill.repository,
    revision: skill.revision,
    license: skill.license,
    upstreamPath: skill.path,
    rawPath: skill.copiedTo,
    rawSha256: skill.rawSha256,
    adaptedPath: adaptedPath.slice(workspace.length + 1).replaceAll("\\", "/"),
    adaptedSha256,
    diffPath: patchPath.slice(workspace.length + 1).replaceAll("\\", "/"),
    diffSha256: sha256(Buffer.from(patchText, "utf8")),
    coreStepsPreserved: adaptation.core_steps_preserved,
  });
}

const knowledgeFixtures = [
  {
    assetId: "T17-KNW-01", name: "Aurora architecture decisions", summary: "Aurora token、组件与可访问性架构决策索引；摘要不包含目标影响清单。",
    tools: [{ name: "search", requiredParams: ["query"] }, { name: "read_page", requiredParams: ["page_id"] }],
    call: { toolName: "search", params: { query: "TokenRegistry impact inventory" }, response: { ruleText: "TokenRegistry 注册定义位于 packages/tokens/src/registry.ts；主题装配入口 packages/theme/src/createTheme.ts；组件消费者为 packages/components/src/Button/styles.ts、packages/components/src/Input/styles.ts、packages/components/src/Select/styles.ts；发布产物为 packages/tokens/dist/aurora.css；文档预览入口为 apps/docs/src/theme/preview.tsx；验证范围包括 packages/tokens/test/registry.test.ts、packages/theme/test/createTheme.test.ts、packages/components/test/token-contract.test.ts。" } },
  },
  {
    assetId: "T17-KNW-02", name: "Helios rendering decisions", summary: "Helios SSR、streaming 与 hydration 设计决策索引；摘要不包含具体归属依据。",
    tools: [{ name: "search", requiredParams: ["query"] }, { name: "read_page", requiredParams: ["page_id"] }],
    call: { toolName: "search", params: { query: "hydration boundary ownership rationale" }, response: { ruleText: "SSR platform team 负责 hydration boundary，因为该团队同时控制 server stream checkpoints 与 client hydration handoff，可避免跨团队变更造成边界不一致。" } },
  },
  {
    assetId: "T17-KNW-03", name: "Foundry build decisions", summary: "Foundry chunk、模块边界与构建决策索引；摘要不包含目标调用关系。",
    tools: [{ name: "search", requiredParams: ["query"] }, { name: "read_page", requiredParams: ["page_id"] }],
    call: { toolName: "search", params: { query: "createChunkPlan direct callers" }, response: { ruleText: "createChunkPlan 的直接调用者是 emitAsyncChunk（packages/foundry/chunks/emitter.ts）和 planEntryChunks（packages/foundry/chunks/entry.ts）。" } },
  },
];
const knowledgeAssets = knowledgeFixtures.map((fixture) => withHash({
  assetId: fixture.assetId,
  ownerAgentId: activeAgentId,
  sourceEvidenceIds: [sourceIds.knowledge],
  observedAt,
  type: "wiki",
  name: fixture.name,
  summary: fixture.summary,
  snapshotSha256: canonicalSha256({ tools: fixture.tools, call: fixture.call }),
  bindings: [{ agentId: activeAgentId, visibility: "fixed" }],
}));

const workspaceRef = withHash({
  workspaceId: input.workspace.workspace_id,
  repoSlug: input.workspace.repo_slug,
  repoUrl: input.workspace.repo_url,
  baseCommit: input.workspace.base_commit,
  sourceRepoLicense: input.workspace.source_repo_license,
  treeSha256: input.workspace.tree_sha256,
  fileManifestSha256: input.workspace.file_manifest_sha256,
  state: input.workspace.state,
});
const streamMeta = {
  AURORA: { slug: "aurora", title: "Aurora component architecture", description: "Audit component contracts, tokens, accessibility, and browser behavior.", goal: "Keep component architecture reviewable across themes and browsers." },
  ATLAS: { slug: "atlas", title: "Atlas state and cache boundaries", description: "Separate local state, shared state, remote cache, and mutation boundaries.", goal: "Prevent stale data and unnecessary rendering while preserving rollback." },
  HELIOS: { slug: "helios", title: "Helios SSR and hydration", description: "Design server rendering, streaming, hydration, and RSC ownership boundaries.", goal: "Keep first render deterministic and rollout observable." },
  FOUNDRY: { slug: "foundry", title: "Foundry build and module boundaries", description: "Control chunking, package exports, module ownership, and compatibility targets.", goal: "Keep browser bundles within budget and module boundaries explicit." },
  PULSE: { slug: "pulse", title: "Pulse Web performance", description: "Measure long tasks, rendering stability, resource priority, and Web Vitals.", goal: "Reduce main-thread and layout regressions under representative devices." },
};
const taskIdByProject = {};
const tasks = Object.entries(streamMeta).map(([key, meta]) => {
  const taskId = `task-task1-t17-${meta.slug}`;
  taskIdByProject[key] = taskId;
  return withHash({
    taskId,
    teamId: "T17",
    title: meta.title,
    description: meta.description,
    goal: meta.goal,
    eligibleAgentIds: [activeAgentId],
    projectRef: withHash({
      projectRefId: `project-task1-t17-${meta.slug}`,
      repoSlug: input.workspace.repo_slug,
      repoUrl: input.workspace.repo_url,
      pinnedCommit: input.workspace.base_commit,
      sourceEvidenceIds: [sourceIds.anchor],
    }),
    workspace: workspaceRef,
    sourceEvidenceIds: [sourceIds.anchor],
  });
});

const taskForAsset = (assetId) => {
  if (/L1-03|L0-03|L0-07|SKL-05/.test(assetId)) return taskIdByProject.ATLAS;
  if (/L0-02|L0-06|L2-04|KNW-02|SKL-04/.test(assetId)) return taskIdByProject.HELIOS;
  if (/L1-11|KNW-03/.test(assetId)) return taskIdByProject.FOUNDRY;
  if (/KNW-01|L0-08|L1-15|SKL-02|SKL-07|SKL-08|SKL-10/.test(assetId)) return taskIdByProject.AURORA;
  return taskIdByProject.PULSE;
};

const allVisibleAssetIds = [...memoryAssetIds, ...skillAssets.map((item) => item.assetId), ...knowledgeAssets.map((item) => item.assetId)].sort();
const visibleAssetSetSha256 = canonicalSha256({
  teamId: "T17", userId: input.identity.user_id, agentId: activeAgentId, assetIds: allVisibleAssetIds,
});
const identityFor = (taskId, sessionId) => ({
  spaceId: input.identity.space_id,
  teamId: "T17",
  userId: input.identity.user_id,
  agentId: activeAgentId,
  taskId,
  sessionId,
  agentSource: "codex",
});

const action = (tool, endpoint, argumentRules) => ({ tool, endpoint, ...(argumentRules ? { argumentRules } : {}) });
const memoryRoute = (assetId) => {
  const table = {
    "T17-L1-03": { first: action("tdai_memory_search", "/memory-bridge/v3/atomic/search", { requiredFields: ["query"], stringContainsAny: { query: ["Atlas", "跨租户", "mutation", "失效"] } }), sequence: ["tdai_memory_search"] },
    "T17-L0-02": { first: action("tdai_conversation_search", "/memory-bridge/v3/conversation/search", { requiredFields: ["query"], stringContainsAny: { query: ["Helios", "hydration", "事故", "措辞"] } }), sequence: ["tdai_conversation_search"] },
    "T17-L1-11": { first: action("tdai_memory_search", "/memory-bridge/v3/atomic/search", { requiredFields: ["query"], stringContainsAny: { query: ["Foundry", "chunk", "预算", "gzip"] } }), sequence: ["tdai_memory_search"] },
    "T17-L0-08": { first: action("tdai_conversation_search", "/memory-bridge/v3/conversation/search", { requiredFields: ["query"], stringContainsAny: { query: ["Aurora", "combobox", "屏幕阅读器", "回退"] } }), sequence: ["tdai_conversation_search"] },
    "T17-L1-15": { first: action("tdai_atomic_query", "/memory-bridge/v3/atomic/query", { requiredFields: [], exactValues: { type: "instruction", time_start: "2026-08-12T00:00:00Z", time_end: "2026-08-19T00:00:00Z" } }), sequence: ["tdai_atomic_query"] },
    "T17-L2-04": { first: action("tdai_read_scene", "/memory-bridge/v3/scenario/read", { requiredFields: ["path"], exactValues: { path: "projects/helios/streaming-hydration-rollout.md" }, pathFromFixture: true }), sequence: ["tdai_read_scene"] },
  };
  return table[assetId];
};
const skillRoute = (assetId, name) => {
  if (["T17-SKL-07", "T17-SKL-08", "T17-SKL-10"].includes(assetId)) {
    const terms = assetId === "T17-SKL-07" ? ["design system", "设计系统", "token", "主题"]
      : assetId === "T17-SKL-08" ? ["responsive", "响应式", "container", "断点"]
        : ["accessibility", "可访问性", "WCAG", "辅助技术"];
    return {
      first: action("skill_search", "/skill-bridge/v3/skill/search", { requiredFields: ["query"], forbiddenFields: ["top_k", "mode"], stringContainsAny: { query: terms } }),
      followups: [action("skill_view_by_id", "/skill-bridge/v3/skill/get", { requiredFields: ["skill_id"], valueFromPreviousStep: true })],
      sequence: ["skill_search", "skill_view_by_id"],
    };
  }
  if (assetId === "T17-SKL-02") return {
    first: action("skill_view", "/skill-bridge/v3/skill/get-by-name", { requiredFields: ["skill_name"], exactValues: { skill_name: name } }),
    followups: [action("skill_files_read", "/skill-bridge/v3/skill/files/read", { requiredFields: ["skill_id", "path"], exactValues: { path: "references/details.md" }, valueFromPreviousStep: true })],
    sequence: ["skill_view", "skill_files_read"],
  };
  return {
    first: action("skill_view", "/skill-bridge/v3/skill/get-by-name", { requiredFields: ["skill_name"], exactValues: { skill_name: name } }),
    sequence: ["skill_view"],
  };
};
const knowledgeRoute = (assetId) => {
  const fixture = knowledgeFixtures.find((item) => item.assetId === assetId);
  return {
    first: action("knowledge_tools_list", "/tools/list", { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: assetId } }),
    expectedKnowledgeCalls: [{ toolName: fixture.call.toolName, paramRules: { requiredFields: Object.keys(fixture.call.params), exactValues: fixture.call.params } }],
    sequence: ["knowledge_tools_list", "knowledge_tools_call"],
  };
};

const publicCases = [];
const privateAnnotations = [];
const pairs = [];
const evaluationRefs = new Map();
const addPair = ({ family, number, draftPair, batchPath }) => {
  const prefix = family === "memory" ? "MEM" : family === "skill" ? "SKL" : "KNW";
  const caseBaseId = `T17-${prefix}-${String(number).padStart(2, "0")}`;
  const pairId = `T17-PAIR-${prefix}-${String(number).padStart(2, "0")}`;
  const positiveCaseId = `${caseBaseId}-P`;
  const negativeCaseId = `${caseBaseId}-N`;
  const targetAssetId = draftPair.positive.private_proposal.target_asset_ids[0];
  const taskId = taskForAsset(targetAssetId);
  const evaluationSourceId = evalSourceByBatchPath[batchPath];
  const assetSourceId = family === "memory"
    ? targetAssetId.startsWith("T17-L0") ? sourceIds.l0 : targetAssetId.startsWith("T17-L1") ? sourceIds.l1 : sourceIds.l2
    : family === "skill" ? skillSourceId(targetAssetId) : sourceIds.knowledge;
  const route = family === "memory" ? memoryRoute(targetAssetId)
    : family === "skill" ? skillRoute(targetAssetId, skillAssets.find((item) => item.assetId === targetAssetId).name)
      : knowledgeRoute(targetAssetId);
  const contexts = {
    positive: [...draftPair.shared_context_messages, draftPair.positive.delta_message],
    negative: [...draftPair.shared_context_messages, draftPair.negative.delta_message],
  };
  for (const role of ["positive", "negative"]) {
    const caseId = role === "positive" ? positiveCaseId : negativeCaseId;
    const publicCase = withHash({
      caseId,
      identity: identityFor(taskId, `session-task1-t17-${prefix.toLowerCase()}-${String(number).padStart(2, "0")}-${role === "positive" ? "p" : "n"}`),
      snapshotId: input.identity.snapshot_id,
      workspace: workspaceRef,
      language: "zh",
      difficulty: draftPair.difficulty,
      contextMessages: contexts[role],
      query: draftPair.query,
      visibleAssetSetSha256,
    });
    publicCases.push(publicCase);
    const gold = role === "positive" ? withHash({
      needTdaiTool: true,
      family,
      allowedFirstActions: [route.first],
      ...(route.followups ? { expectedFollowupActions: route.followups } : {}),
      ...(route.expectedKnowledgeCalls ? { expectedKnowledgeCalls: route.expectedKnowledgeCalls } : {}),
      allowedSequences: [route.sequence],
      forbiddenTools: [],
      maxTdaiCalls: route.sequence.length,
      targetAssetIds: [targetAssetId],
      informationGap: draftPair.positive.private_proposal.unique_information_gap,
      stopAfter: draftPair.positive.private_proposal.stop_after_candidate,
      evidenceRefs: [assetSourceId, evaluationSourceId],
      ablationEvidence: `Removing ${targetAssetId} leaves the registered information gap unresolved; the paired delta supplies exactly that information.`,
    }) : withHash({
      needTdaiTool: false,
      family: null,
      allowedFirstActions: [],
      expectedFollowupActions: [],
      expectedKnowledgeCalls: [],
      allowedSequences: [],
      forbiddenTools: [],
      maxTdaiCalls: 0,
      targetAssetIds: [],
      evidenceRefs: [evaluationSourceId],
      ablationEvidence: "The paired delta already supplies the sole missing information.",
      noToolEvidence: draftPair.negative.private_proposal.why_current_context_is_sufficient,
    });
    privateAnnotations.push(withHash({
      caseId,
      sourceEvidenceIds: role === "positive" ? [assetSourceId, evaluationSourceId] : [evaluationSourceId],
      pairId,
      pairRole: role,
      gold,
      annotationReason: role === "positive" ? `The current context lacks one fact or procedure held only by ${targetAssetId}.` : draftPair.negative.private_proposal.why_current_context_is_sufficient,
    }));
  }
  const controlledDeltaSha256 = sha256(Buffer.from(JSON.stringify({
    positive_delta_message: draftPair.positive.delta_message,
    negative_delta_message: draftPair.negative.delta_message,
    query: draftPair.query,
  }), "utf8"));
  pairs.push(withHash({
    pairId,
    positiveCaseId,
    negativeCaseId,
    counterfactualKind: "answer_in_current_context",
    controlledDeltaSha256,
    currentEvidenceRefs: [evaluationSourceId],
  }));
  if (!evaluationRefs.has(batchPath)) evaluationRefs.set(batchPath, []);
  evaluationRefs.get(batchPath).push(pairId, positiveCaseId, negativeCaseId);
};

const memoryPairs = [
  [pairDrafts.memoryTrial.pairs[0], "trial-memory-01"],
  [pairDrafts.memoryBulk.pairs.find((pair) => pair.draft_pair_id.includes("02")), "memory-bulk-01"],
  [pairDrafts.memoryBulk.pairs.find((pair) => pair.draft_pair_id.includes("03")), "memory-bulk-01"],
  [pairDrafts.memoryBulk.pairs.find((pair) => pair.draft_pair_id.includes("04")), "memory-bulk-01"],
  [pairDrafts.memoryReplacement.pairs[0], "memory-replacement-02"],
  [pairDrafts.memoryBulk.pairs.find((pair) => pair.draft_pair_id.includes("06")), "memory-bulk-01"],
];
memoryPairs.forEach(([draftPair, batchPath], index) => addPair({ family: "memory", number: index + 1, draftPair, batchPath }));
const skillPairs = [
  [pairDrafts.skillBulk.pairs.find((pair) => pair.draft_pair_id === "T17-SKL-01"), "skill-bulk-01"],
  [pairDrafts.skillBulk.pairs.find((pair) => pair.draft_pair_id === "T17-SKL-02"), "skill-bulk-01"],
  [pairDrafts.skillTrial.pairs[0], "trial-skill-01"],
  [pairDrafts.skillBulk.pairs.find((pair) => pair.draft_pair_id === "T17-SKL-04"), "skill-bulk-01"],
  [pairDrafts.skillBulk.pairs.find((pair) => pair.draft_pair_id === "T17-SKL-05"), "skill-bulk-01"],
  [pairDrafts.skillBulk.pairs.find((pair) => pair.draft_pair_id === "T17-SKL-06"), "skill-bulk-01"],
];
skillPairs.forEach(([draftPair, batchPath], index) => addPair({ family: "skill", number: index + 1, draftPair, batchPath }));
pairDrafts.knowledgeReplacement.pairs.forEach((draftPair, index) => addPair({ family: "knowledge", number: index + 1, draftPair, batchPath: "knowledge-replacement-01" }));

const naturalTaskOrder = ["AURORA", "AURORA", "ATLAS", "ATLAS", "HELIOS", "HELIOS", "FOUNDRY", "FOUNDRY", "PULSE", "PULSE"];
pairDrafts.natural.cases.forEach((draftCase, index) => {
  const caseId = `T17-NAT-${String(index + 1).padStart(2, "0")}`;
  const publicCase = withHash({
    caseId,
    identity: identityFor(taskIdByProject[naturalTaskOrder[index]], `session-task1-t17-nat-${String(index + 1).padStart(2, "0")}`),
    snapshotId: input.identity.snapshot_id,
    workspace: workspaceRef,
    language: "zh",
    difficulty: draftCase.difficulty,
    contextMessages: draftCase.context_messages,
    query: draftCase.query,
    visibleAssetSetSha256,
  });
  publicCases.push(publicCase);
  const gold = withHash({
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    expectedFollowupActions: [],
    expectedKnowledgeCalls: [],
    allowedSequences: [],
    forbiddenTools: [],
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs: [sourceIds.natural],
    ablationEvidence: "The request remains self-contained under the full T17 distractor pool.",
    noToolEvidence: draftCase.why_current_context_is_sufficient,
  });
  privateAnnotations.push(withHash({
    caseId,
    sourceEvidenceIds: [sourceIds.natural],
    gold,
    annotationReason: draftCase.why_current_context_is_sufficient,
  }));
});

const sourceEvidence = [
  syntheticEvidence({ sourceId: sourceIds.anchor, role: "current_anchor", transform: "current_task_anchor", batchId: "T17-SOL-INPUT-01", generatedAt: "2026-08-31T12:00:00+08:00", generatorModel: "gpt-5.6-sol", contentRefs: ["T17", ...tasks.map((task) => task.taskId)] }),
  syntheticEvidence({ sourceId: sourceIds.l0, role: "history", transform: "redacted_replay", batchPath: "memory-bulk-01", contentRefs: l0Conversations.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.l1, role: "history", transform: "atomic_fact_extraction", batchPath: "memory-bulk-01", contentRefs: l1Memories.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.l2, role: "history", transform: "multi_session_scene_synthesis", batchPath: "memory-bulk-01", contentRefs: l2Scenes.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.l3, role: "history", transform: "stable_profile_derivation", batchPath: "memory-bulk-01", contentRefs: l3Profiles.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.knowledge, role: "repo_context", transform: "repo_document_snapshot", batchPath: "knowledge-replacement-01", contentRefs: knowledgeAssets.map((item) => item.assetId), generatorModel: "gpt-5.6-luna" }),
  syntheticEvidence({ sourceId: sourceIds.natural, role: "evaluation_derivation", transform: "natural_negative_selection", batchPath: "natural-bulk-01", contentRefs: publicCases.filter((item) => item.caseId.startsWith("T17-NAT-")).map((item) => item.caseId) }),
  ...Object.entries(evalSourceByBatchPath).map(([batchPath, sourceId]) => syntheticEvidence({
    sourceId,
    role: "evaluation_derivation",
    transform: "paired_counterfactual",
    batchPath,
    contentRefs: evaluationRefs.get(batchPath) ?? [`T17-REVIEWED-${batchPath.toUpperCase()}`],
  })),
  ...externalEvidence,
];

const team = withHash({
  teamId: "T17",
  worldId: "world-task1-formal-v2",
  split: "dev",
  name: "前端架构与性能",
  businessAgentIds: [activeAgentId, assetAgentA, assetAgentB],
  taskIds: tasks.map((task) => task.taskId),
  sourceEvidenceIds: [sourceIds.anchor],
});
const businessAgents = [
  withHash({
    agentId: activeAgentId,
    teamId: "T17",
    name: "T17 通用业务 Agent",
    agentDetail: withHash({
      description: "Coordinates frontend architecture, rendering, build boundaries, Web performance, accessibility, and browser compatibility.",
      prompt: "Keep Aurora, Atlas, Helios, Foundry, and Pulse decisions distinct; use frozen read-only assets only when the current context lacks required information.",
    }),
    importedMemoryAgentIds: [],
    boundSkillIds: skillAssets.filter((item) => item.ownerAgentId === activeAgentId).map((item) => item.assetId),
    fixedKnowledgeIds: knowledgeAssets.map((item) => item.assetId),
    sourceEvidenceIds: [sourceIds.anchor],
  }),
  ...[assetAgentA, assetAgentB].map((agentId) => withHash({
    agentId,
    teamId: "T17",
    name: agentId.endsWith("a") ? "T17 资产 Agent A" : "T17 资产 Agent B",
    agentDetail: withHash({ description: "Owns same-Team discoverable frontend Skill assets.", prompt: "Expose only Team-visible frozen Skill packages." }),
    importedMemoryAgentIds: [],
    boundSkillIds: [],
    fixedKnowledgeIds: [],
    sourceEvidenceIds: [sourceIds.anchor],
  })),
];

const externalImports = adaptationAudit.map((item) => ({
  assetId: item.assetId,
  repository: item.repository,
  revision: item.revision,
  license: item.license,
  path: item.upstreamPath,
  rawSha256: item.rawSha256,
  adaptedSha256: item.adaptedSha256,
  adaptedPath: item.adaptedPath,
  diffPath: item.diffPath,
}));
const teamFragment = {
  schema_version: "task1.team_fragment.v2",
  dataset_revision: "formal-v2",
  build_id: "build-09",
  team_id: "T17",
  generatorBatchRefs: acceptedBatchPaths.map((path) => ({ batchId: manifests.get(path).batch_id, path, status: "accepted" })),
  rejectedBatchRefs: [
    { batchId: "T17-MEM-REPL-01", path: "memory-replacement-01", reason: "browser values conflict with frozen L1 and distractor set is empty" },
    { batchId: "T17-TRIAL-KNW-01", path: "trial-knowledge-01", reason: "code-graph fixture did not supply the requested impact inventory" },
    { batchId: "T17-KNW-BULK-01", path: "knowledge-bulk-01", reason: "synthetic code-graph repository/path provenance would violate formal-v2 source rules" },
  ],
  externalImports,
  sourceEvidence,
  teams: [team],
  businessAgents,
  tasks,
  publicCases,
  privateAnnotations,
  pairs,
};

const memoryOutput = { schema_version: "task1.team_memory_assets.v2", team_id: "T17", l0Conversations, l1Memories, l2Scenes, l3Profiles };
const skillOutput = { schema_version: "task1.team_skill_assets.v2", team_id: "T17", skills: skillAssets, adaptationAudit };
const knowledgeOutput = { schema_version: "task1.team_knowledge_assets.v2", team_id: "T17", knowledge: knowledgeAssets, fixtures: knowledgeFixtures };

await writeJson(resolve(stagingRoot, "team-fragment.json"), teamFragment);
await writeJson(resolve(stagingRoot, "assets/memory.json"), memoryOutput);
await writeJson(resolve(stagingRoot, "assets/skills.json"), skillOutput);
await writeJson(resolve(stagingRoot, "assets/knowledge.json"), knowledgeOutput);

const review = `# T17 formal-v2 Sol review\n\n` +
  `Status: reviewed for Team Gate. Dataset integration and real-service restoration remain integration-task work.\n\n` +
  `## Accepted construction\n\n` +
  `- 40 cases: 6 Memory Positive, 6 Skill Positive, 3 Knowledge Positive, 15 paired No-tool Negative, 10 natural coding Negative.\n` +
  `- 15 one-delta pairs; discovery/direct split is 10/5.\n` +
  `- Memory assets: 10 L0 sessions (12 messages each), 16 L1, 5 injected L2 indexes with non-leaking summaries, 1 L3 profile.\n` +
  `- Skill assets: 16 real MIT-licensed GitHub Skill files from two pinned repositories; six listed and ten same-Team searchable. Search Gold stops at skill_view_by_id using the prior search result skill_id.\n` +
  `- Knowledge assets: three ready synthetic wiki resources. They do not claim a repository, revision, license, external path, or external hash. Each freezes tools/list followed by one search tools/call.\n\n` +
  `## Sol corrections\n\n` +
  `- Rejected memory-replacement-01 because its browser values contradicted T17-L1-15; accepted memory-replacement-02 with Chromium 124, Firefox 125, Safari 17.5, Edge 124 and exact structured filters.\n` +
  `- Replaced the synthetic code-graph Knowledge candidates with wiki resources so synthetic material does not invent repository provenance.\n` +
  `- Rejected the original KNW-01 fixture because it could not answer the requested impact inventory; the accepted replacement returns the full frozen inventory.\n` +
  `- Corrected Skill discovery follow-up from name-based view to skill_view_by_id, as the search response exposes skill_id and the runbook freezes that chain.\n\n` +
  `## Semantic review\n\n` +
  `Every Positive lacks one required fact/procedure, has at least two same-domain distractors, and stops at the first response carrying the target. Every paired Negative retains identity (except fresh session id), snapshot, workspace, query, shared context, and full distractor pool; only the appended delta changes. Natural negatives are locally actionable from current context. Provider-visible case objects contain no Gold, target ids, pair ids, knowledge ids, route names, or source records.\n`;
await writeFile(resolve(stagingRoot, "review.md"), review, "utf8");

console.log(JSON.stringify({
  team: "T17",
  cases: publicCases.length,
  annotations: privateAnnotations.length,
  pairs: pairs.length,
  assets: { l0: l0Conversations.length, l1: l1Memories.length, l2: l2Scenes.length, l3: l3Profiles.length, skills: skillAssets.length, knowledge: knowledgeAssets.length },
  stagingRoot: stagingRoot.slice(workspace.length + 1),
}, null, 2));
