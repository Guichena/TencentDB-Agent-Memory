import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const workspace = process.cwd();
const buildRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18");
const stagingRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/staging/teams/T18");
const sourceRoot = resolve(workspace, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T18");
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

const input = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/input-pack.json");
const sourceLock = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/source-lock.json");
const memoryAssetsDraft = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/memory-bulk-01/assets-draft.json");
const adaptationDraft = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/skill-bulk-01/adaptation-draft.json");
const knowledgeAssetsDraft = await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/knowledge-bulk-01/assets-draft.json");

const pairDrafts = {
  memoryTrial: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/trial-memory-01/draft.json"),
  memoryBulk: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/memory-bulk-01/draft.json"),
  skillTrial: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/trial-skill-01/draft.json"),
  skillBulk: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/skill-bulk-01/draft.json"),
  knowledgeTrial: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/trial-knowledge-01/draft.json"),
  knowledgeBulk: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/knowledge-bulk-01/draft.json"),
  natural: await readJson("MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/natural-bulk-01/draft.json"),
};

const acceptedBatchPaths = [
  "trial-memory-01", "memory-bulk-01", "trial-skill-01", "skill-bulk-01",
  "trial-knowledge-01", "knowledge-bulk-01", "natural-bulk-01",
];
const manifests = new Map();
for (const batchPath of acceptedBatchPaths) {
  const manifest = await readJson(`MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-09/T18/${batchPath}/manifest.json`);
  manifests.set(batchPath, manifest);
}

const sourceIds = {
  anchor: "T18-SRC-SOL-ANCHOR-01",
  l0: "T18-SRC-MEMORY-L0-01",
  l1: "T18-SRC-MEMORY-L1-01",
  l2: "T18-SRC-MEMORY-L2-01",
  l3: "T18-SRC-MEMORY-L3-01",
  knowledge: "T18-SRC-KNOWLEDGE-WIKI-01",
  natural: "T18-SRC-NATURAL-01",
};
const evalSourceByBatchPath = Object.fromEntries(acceptedBatchPaths
  .filter((path) => path !== "natural-bulk-01")
  .map((path) => [path, `T18-SRC-PAIR-${path.toUpperCase()}`]));
const skillSourceId = (assetId) => `T18-SRC-SKILL-${assetId.slice(-2)}`;

const syntheticEvidence = ({ sourceId, role, transform, batchPath, batchId, generatedAt, contentRefs, generatorModel = "gpt-5.6-luna" }) => withHash({
  sourceId,
  provenanceKind: "synthetic",
  role,
  origin: "synthetic_agent_replay",
  worldAsOf,
  transform,
  transformVersion: "task1.formal-v2.t18.v1",
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
  const sessionId = `session-task1-t18-${session.session_id}`;
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
const sessionByAsset = new Map(memoryAssetsDraft.l0_sessions.map((session) => [session.asset_id, `session-task1-t18-${session.session_id}`]));
const messageIdsBySessionAsset = new Map(l0Conversations.map((session) => [
  memoryAssetsDraft.l0_sessions.find((draft) => `session-task1-t18-${draft.session_id}` === session.sessionId).asset_id,
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
    supportingSessionIds: scene.support_chain.map((assetId) => sessionByAsset.get(assetId)),
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
  if (skill.assetId === "T18-SKL-02") {
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
    version: "1.0.0-t18",
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

const knowledgeDraftItems = knowledgeAssetsDraft.resources
  ?? knowledgeAssetsDraft.knowledge_resources
  ?? knowledgeAssetsDraft.candidates;
const knowledgeFixtures = knowledgeDraftItems.map((item) => {
  const queryFixture = item.query_fixtures?.[0]
    ?? item.minimal_synthetic_query_result?.successful_query;
  const tools = item.fixed_tools ?? item.tools;
  return {
    assetId: item.asset_id,
    name: item.name,
    summary: item.summary,
    tools: tools.map((tool) => ({
      name: tool.name,
      requiredParams: Object.keys(tool.input ?? tool.params ?? {}),
    })),
    call: {
      toolName: queryFixture.tool_name,
      params: queryFixture.params ?? queryFixture.query,
      response: queryFixture.response ?? queryFixture.result,
    },
  };
});
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
  QUARTZ: { slug: "quartz", title: "Quartz request performance", description: "Profile end-to-end latency, CPU, memory, and capacity bottlenecks.", goal: "Keep request latency within frozen representative-load budgets." },
  IRONCLAD: { slug: "ironclad", title: "Ironclad concurrent runtime", description: "Control worker pools, backpressure, races, and resource lifecycles.", goal: "Keep concurrency bounded and runtime behavior diagnosable." },
  CASCADE: { slug: "cascade", title: "Cascade data throughput", description: "Tune Spark partitioning, shuffle behavior, database plans, and batch throughput.", goal: "Improve throughput without hiding skew or shifting bottlenecks." },
  SENTINEL: { slug: "sentinel", title: "Sentinel performance observability", description: "Manage tracing, sampling, SLIs, SLOs, and regression alerts.", goal: "Make latency regressions attributable with controlled telemetry cost." },
  FORGE: { slug: "forge", title: "Forge build efficiency", description: "Optimize Bazel remote execution, cache behavior, and monorepo build latency.", goal: "Keep builds reproducible while improving cache and execution efficiency." },
};
const taskIdByProject = {};
const tasks = Object.entries(streamMeta).map(([key, meta]) => {
  const taskId = `task-task1-t18-${meta.slug}`;
  taskIdByProject[key] = taskId;
  return withHash({
    taskId,
    teamId: "T18",
    title: meta.title,
    description: meta.description,
    goal: meta.goal,
    eligibleAgentIds: [activeAgentId],
    projectRef: withHash({
      projectRefId: `project-task1-t18-${meta.slug}`,
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
  if (/L1-03|L1-15|KNW-01|SKL-01/.test(assetId)) return taskIdByProject.QUARTZ;
  if (/L0-02|SKL-02/.test(assetId)) return taskIdByProject.IRONCLAD;
  if (/L1-11|KNW-02|SKL-07|SKL-14/.test(assetId)) return taskIdByProject.CASCADE;
  if (/L0-08|SKL-04/.test(assetId)) return taskIdByProject.SENTINEL;
  return taskIdByProject.FORGE;
};

const allVisibleAssetIds = [...memoryAssetIds, ...skillAssets.map((item) => item.assetId), ...knowledgeAssets.map((item) => item.assetId)].sort();
const visibleAssetSetSha256 = canonicalSha256({
  teamId: "T18", userId: input.identity.user_id, agentId: activeAgentId, assetIds: allVisibleAssetIds,
});
const identityFor = (taskId, sessionId) => ({
  spaceId: input.identity.space_id,
  teamId: "T18",
  userId: input.identity.user_id,
  agentId: activeAgentId,
  taskId,
  sessionId,
  agentSource: "codex",
});

const action = (tool, endpoint, argumentRules) => ({ tool, endpoint, ...(argumentRules ? { argumentRules } : {}) });
const memoryRoute = (assetId) => {
  const table = {
    "T18-L1-03": { first: action("tdai_memory_search", "/memory-bridge/v3/atomic/search", { requiredFields: ["query"], stringContainsAny: { query: ["Quartz", "p99", "阈值", "根因"] } }), sequence: ["tdai_memory_search"] },
    "T18-L0-02": { first: action("tdai_conversation_search", "/memory-bridge/v3/conversation/search", { requiredFields: ["query"], stringContainsAny: { query: ["Ironclad", "worker pool", "事故", "措辞"] } }), sequence: ["tdai_conversation_search"] },
    "T18-L1-11": { first: action("tdai_memory_search", "/memory-bridge/v3/atomic/search", { requiredFields: ["query"], stringContainsAny: { query: ["Cascade", "Spark", "倾斜", "例外"] } }), sequence: ["tdai_memory_search"] },
    "T18-L0-08": { first: action("tdai_conversation_search", "/memory-bridge/v3/conversation/search", { requiredFields: ["query"], stringContainsAny: { query: ["Sentinel", "trace", "sampling", "回滚"] } }), sequence: ["tdai_conversation_search"] },
    "T18-L1-15": { first: action("tdai_atomic_query", "/memory-bridge/v3/atomic/query", { requiredFields: [], exactValues: { type: "instruction", time_start: "2026-08-12T00:00:00Z", time_end: "2026-08-19T00:00:00Z" } }), sequence: ["tdai_atomic_query"] },
    "T18-L2-04": { first: action("tdai_read_scene", "/memory-bridge/v3/scenario/read", { requiredFields: ["path"], exactValues: { path: "projects/forge/remote-cache-degradation.md" }, pathFromFixture: true }), sequence: ["tdai_read_scene"] },
  };
  return table[assetId];
};
const skillRoute = (assetId, name) => {
  if (["T18-SKL-07", "T18-SKL-10", "T18-SKL-14"].includes(assetId)) {
    const terms = assetId === "T18-SKL-07" ? ["PostgreSQL", "schema", "索引", "表设计"]
      : assetId === "T18-SKL-10" ? ["Bazel", "构建", "remote execution", "缓存"]
        : ["database", "数据库", "慢查询", "执行计划"];
    return {
      first: action("skill_search", "/skill-bridge/v3/skill/search", { requiredFields: ["query"], forbiddenFields: ["top_k", "mode"], stringContainsAny: { query: terms } }),
      followups: [action("skill_view_by_id", "/skill-bridge/v3/skill/get", { requiredFields: ["skill_id"], valueFromPreviousStep: true })],
      sequence: ["skill_search", "skill_view_by_id"],
    };
  }
  if (assetId === "T18-SKL-02") return {
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
  const caseBaseId = `T18-${prefix}-${String(number).padStart(2, "0")}`;
  const pairId = `T18-PAIR-${prefix}-${String(number).padStart(2, "0")}`;
  const positiveCaseId = `${caseBaseId}-P`;
  const negativeCaseId = `${caseBaseId}-N`;
  const targetAssetId = draftPair.positive.private_proposal.target_asset_ids[0];
  const taskId = taskForAsset(targetAssetId);
  const evaluationSourceId = evalSourceByBatchPath[batchPath];
  const assetSourceId = family === "memory"
    ? targetAssetId.startsWith("T18-L0") ? sourceIds.l0 : targetAssetId.startsWith("T18-L1") ? sourceIds.l1 : sourceIds.l2
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
      identity: identityFor(taskId, `session-task1-t18-${prefix.toLowerCase()}-${String(number).padStart(2, "0")}-${role === "positive" ? "p" : "n"}`),
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
  ...pairDrafts.memoryBulk.pairs
    .sort((left, right) => left.draft_pair_id.localeCompare(right.draft_pair_id))
    .map((pair) => [pair, "memory-bulk-01"]),
];
memoryPairs.forEach(([draftPair, batchPath], index) => addPair({ family: "memory", number: index + 1, draftPair, batchPath }));
const skillPairs = [
  [pairDrafts.skillTrial.pairs[0], "trial-skill-01"],
  ...pairDrafts.skillBulk.pairs
    .sort((left, right) => left.draft_pair_id.localeCompare(right.draft_pair_id))
    .map((pair) => [pair, "skill-bulk-01"]),
];
skillPairs.forEach(([draftPair, batchPath], index) => addPair({ family: "skill", number: index + 1, draftPair, batchPath }));
const knowledgePairs = [
  [pairDrafts.knowledgeTrial.pairs[0], "trial-knowledge-01"],
  ...pairDrafts.knowledgeBulk.pairs
    .sort((left, right) => left.draft_pair_id.localeCompare(right.draft_pair_id))
    .map((pair) => [pair, "knowledge-bulk-01"]),
];
knowledgePairs.forEach(([draftPair, batchPath], index) => addPair({ family: "knowledge", number: index + 1, draftPair, batchPath }));

const naturalTaskOrder = ["QUARTZ", "QUARTZ", "IRONCLAD", "IRONCLAD", "CASCADE", "CASCADE", "SENTINEL", "SENTINEL", "FORGE", "FORGE"];
pairDrafts.natural.cases.forEach((draftCase, index) => {
  const caseId = `T18-NAT-${String(index + 1).padStart(2, "0")}`;
  const publicCase = withHash({
    caseId,
    identity: identityFor(taskIdByProject[naturalTaskOrder[index]], `session-task1-t18-nat-${String(index + 1).padStart(2, "0")}`),
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
    ablationEvidence: "The request remains self-contained under the full T18 distractor pool.",
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
  syntheticEvidence({ sourceId: sourceIds.anchor, role: "current_anchor", transform: "current_task_anchor", batchId: "T18-SOL-INPUT-01", generatedAt: "2026-08-31T12:00:00+08:00", generatorModel: "gpt-5.6-sol", contentRefs: ["T18", ...tasks.map((task) => task.taskId)] }),
  syntheticEvidence({ sourceId: sourceIds.l0, role: "history", transform: "redacted_replay", batchPath: "memory-bulk-01", contentRefs: l0Conversations.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.l1, role: "history", transform: "atomic_fact_extraction", batchPath: "memory-bulk-01", contentRefs: l1Memories.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.l2, role: "history", transform: "multi_session_scene_synthesis", batchPath: "memory-bulk-01", contentRefs: l2Scenes.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.l3, role: "history", transform: "stable_profile_derivation", batchPath: "memory-bulk-01", contentRefs: l3Profiles.map((item) => item.assetId) }),
  syntheticEvidence({ sourceId: sourceIds.knowledge, role: "repo_context", transform: "repo_document_snapshot", batchPath: "knowledge-bulk-01", contentRefs: knowledgeAssets.map((item) => item.assetId), generatorModel: "gpt-5.6-luna" }),
  syntheticEvidence({ sourceId: sourceIds.natural, role: "evaluation_derivation", transform: "natural_negative_selection", batchPath: "natural-bulk-01", contentRefs: publicCases.filter((item) => item.caseId.startsWith("T18-NAT-")).map((item) => item.caseId) }),
  ...Object.entries(evalSourceByBatchPath).map(([batchPath, sourceId]) => syntheticEvidence({
    sourceId,
    role: "evaluation_derivation",
    transform: "paired_counterfactual",
    batchPath,
    contentRefs: evaluationRefs.get(batchPath) ?? [`T18-REVIEWED-${batchPath.toUpperCase()}`],
  })),
  ...externalEvidence,
];

const team = withHash({
  teamId: "T18",
  worldId: "world-task1-formal-v2",
  split: "dev",
  name: "系统性能工程",
  businessAgentIds: [activeAgentId, assetAgentA, assetAgentB],
  taskIds: tasks.map((task) => task.taskId),
  sourceEvidenceIds: [sourceIds.anchor],
});
const businessAgents = [
  withHash({
    agentId: activeAgentId,
    teamId: "T18",
    name: "T18 通用业务 Agent",
    agentDetail: withHash({
      description: "Coordinates request profiling, concurrent runtimes, data throughput, performance observability, and build efficiency.",
      prompt: "Keep Quartz, Ironclad, Cascade, Sentinel, and Forge decisions distinct; use frozen read-only assets only when the current context lacks required information.",
    }),
    importedMemoryAgentIds: [],
    boundSkillIds: skillAssets.filter((item) => item.ownerAgentId === activeAgentId).map((item) => item.assetId),
    fixedKnowledgeIds: knowledgeAssets.map((item) => item.assetId),
    sourceEvidenceIds: [sourceIds.anchor],
  }),
  ...[assetAgentA, assetAgentB].map((agentId) => withHash({
    agentId,
    teamId: "T18",
    name: agentId.endsWith("a") ? "T18 资产 Agent A" : "T18 资产 Agent B",
    agentDetail: withHash({ description: "Owns same-Team discoverable system-performance Skill assets.", prompt: "Expose only Team-visible frozen Skill packages." }),
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
  team_id: "T18",
  generatorBatchRefs: acceptedBatchPaths.map((path) => ({ batchId: manifests.get(path).batch_id, path, status: "accepted" })),
  rejectedBatchRefs: [],
  externalImports,
  sourceEvidence,
  teams: [team],
  businessAgents,
  tasks,
  publicCases,
  privateAnnotations,
  pairs,
};

const memoryOutput = { schema_version: "task1.team_memory_assets.v2", team_id: "T18", l0Conversations, l1Memories, l2Scenes, l3Profiles };
const skillOutput = { schema_version: "task1.team_skill_assets.v2", team_id: "T18", skills: skillAssets, adaptationAudit };
const knowledgeOutput = { schema_version: "task1.team_knowledge_assets.v2", team_id: "T18", knowledge: knowledgeAssets, fixtures: knowledgeFixtures };

await writeJson(resolve(stagingRoot, "team-fragment.json"), teamFragment);
await writeJson(resolve(stagingRoot, "assets/memory.json"), memoryOutput);
await writeJson(resolve(stagingRoot, "assets/skills.json"), skillOutput);
await writeJson(resolve(stagingRoot, "assets/knowledge.json"), knowledgeOutput);

const review = `# T18 formal-v2 Sol review\n\n` +
  `Status: reviewed for Team Gate. Dataset integration and real-service restoration remain integration-task work.\n\n` +
  `## Accepted construction\n\n` +
  `- 40 cases: 6 Memory Positive, 6 Skill Positive, 3 Knowledge Positive, 15 paired No-tool Negative, 10 natural coding Negative.\n` +
  `- 15 one-delta pairs; discovery/direct split is 10/5.\n` +
  `- Memory assets: 10 L0 sessions (12-20 messages each), 16 L1, 5 injected L2 indexes with non-leaking summaries, 1 L3 profile.\n` +
  `- Skill assets: 16 real MIT-licensed GitHub Skill files from two pinned repositories; six listed and ten same-Team searchable. Search Gold stops at skill_view_by_id using the prior search result skill_id.\n` +
  `- Knowledge assets: three ready synthetic wiki resources. They do not claim a repository, revision, license, external path, or external hash. Each freezes tools/list followed by one search tools/call.\n\n` +
  `## Sol review decisions\n\n` +
  `- Kept the structured CPU profiling query as a direct atomic query with explicit type and time filters.\n` +
  `- Kept synthetic Knowledge resources as wiki fixtures without repository provenance; each accepted response fully carries its registered answer boundary.\n` +
  `- Skill discovery follow-up uses skill_view_by_id because the search response supplies skill_id; listed Skills use skill_view by injected name.\n` +
  `- The resource-read case uses the frozen go-concurrency-patterns manifest path references/details.md.\n\n` +
  `## Semantic review\n\n` +
  `Every Positive lacks one required fact/procedure, has at least two same-domain distractors, and stops at the first response carrying the target. Every paired Negative retains identity (except fresh session id), snapshot, workspace, query, shared context, and full distractor pool; only the appended delta changes. Natural negatives are locally actionable from current context. Provider-visible case objects contain no Gold, target ids, pair ids, knowledge ids, route names, or source records.\n`;
await writeFile(resolve(stagingRoot, "review.md"), review, "utf8");

console.log(JSON.stringify({
  team: "T18",
  cases: publicCases.length,
  annotations: privateAnnotations.length,
  pairs: pairs.length,
  assets: { l0: l0Conversations.length, l1: l1Memories.length, l2: l2Scenes.length, l3: l3Profiles.length, skills: skillAssets.length, knowledge: knowledgeAssets.length },
  stagingRoot: stagingRoot.slice(workspace.length + 1),
}, null, 2));
