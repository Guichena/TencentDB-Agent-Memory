import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const datasetRoot = path.resolve(here, "../../../..");
const staging = path.join(datasetRoot, "staging", "teams", "T11");
const assetsDir = path.join(staging, "assets");
const observedAt = "2026-08-30T12:00:00+08:00";
const worldAsOf = "2026-08-30T23:59:59+08:00";
const agentId = "agent-task1-t11-general";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const withHash = (value) => ({ ...value, contentHash: sha(value) });
const controlledDeltaSha256 = (pair) => createHash("sha256").update(JSON.stringify({
  positive_delta_message: pair.positive.delta_message,
  negative_delta_message: pair.negative.delta_message,
  query: pair.query,
}), "utf8").digest("hex");
const readJson = async (...parts) => JSON.parse(await readFile(path.join(here, ...parts), "utf8"));
const insertDelta = (pair, role) => {
  const messages = pair.shared_context_messages.map((message) => ({ ...message }));
  messages.splice(pair.changed_message_index, 0, pair[role].delta_message);
  return messages;
};

const input = await readJson("input-pack.json");
const repairDraft = await readJson("repair", "luna-repair-01", "draft.json");
const memoryPairs = [
  ...(await readJson("memory", "memory-batch-01", "draft.json")).pairs,
  ...(await readJson("memory", "memory-batch-02", "draft.json")).pairs,
];
const skillPairs = [
  ...(await readJson("skill", "skill-batch-01", "draft.json")).pairs,
  ...(await readJson("skill", "skill-batch-02", "draft.json")).pairs,
];
const knowledgePairs = (await readJson("knowledge", "knowledge-batch-01", "draft.json")).pairs;
const naturalCases = (await readJson("natural-negative", "natural-negative-batch-01", "draft.json")).cases;

const syntheticEvidence = (sourceId, role, transform, batchId, contentRefs) => withHash({
  sourceId, provenanceKind: "synthetic", role, origin: "synthetic_agent_replay", worldAsOf,
  transform, transformVersion: "task1.build-06.t11.v1", reviewStatus: "reviewed",
  generatorModel: "gpt-5.6-luna", reasoningEffort: "high", promptVersion: "task1.luna-batch.v1",
  batchId, generatedAt: observedAt, contentRefs,
});
const externalEvidence = (source, storedPath) => withHash({
  sourceId: `source-${source.source_id}`, provenanceKind: "external_import", role: "skill_source", origin: "repo_document",
  worldAsOf, transform: "skill_package_import", transformVersion: "task1.skill-host-adaptation.v1", reviewStatus: "reviewed",
  dataset: "GitHub repository file", datasetRevision: source.revision, datasetArtifactSha256: source.raw_sha256,
  sourceRepoUrl: source.repository, sourceRepoCommit: source.revision, sourceRepoLicense: source.license,
  sourceTaskTime: observedAt, trajectoryGeneratedAt: observedAt, evidenceLocator: source.path,
  evidenceSha256: source.raw_sha256, transformInputSha256: source.raw_sha256, piiScan: "passed", reviewedBy: "Sol/build-06",
});

const sourceEvidence = [
  syntheticEvidence("source-t11-current-anchor", "current_anchor", "current_task_anchor", "t11-sol-input-pack", ["generators/parallel/build-06/T11/input-pack.json"]),
  syntheticEvidence("source-t11-memory-redacted", "history", "redacted_replay", "t11-memory-batches", ["generators/parallel/build-06/T11/memory/memory-batch-01/draft.json", "generators/parallel/build-06/T11/memory/memory-batch-02/draft.json"]),
  syntheticEvidence("source-t11-memory-atomic", "history", "atomic_fact_extraction", "t11-memory-batches", ["staging/teams/T11/assets/memory.json"]),
  syntheticEvidence("source-t11-memory-scene", "history", "multi_session_scene_synthesis", "t11-memory-batches", ["staging/teams/T11/assets/memory.json"]),
  syntheticEvidence("source-t11-memory-repair", "history", "redacted_replay", "t11-memory-repair-luna-high", ["generators/parallel/build-06/T11/repair/luna-repair-01/draft.json"]),
  syntheticEvidence("source-t11-memory-repair-atomic", "history", "atomic_fact_extraction", "t11-memory-repair-luna-high", ["generators/parallel/build-06/T11/repair/luna-repair-01/draft.json"]),
  syntheticEvidence("source-t11-memory-repair-scene", "history", "multi_session_scene_synthesis", "t11-memory-repair-luna-high", ["generators/parallel/build-06/T11/repair/luna-repair-01/draft.json"]),
  syntheticEvidence("source-t11-memory-repair-profile", "history", "stable_profile_derivation", "t11-memory-repair-luna-high", ["generators/parallel/build-06/T11/repair/luna-repair-01/draft.json"]),
  syntheticEvidence("source-t11-pairs", "evaluation_derivation", "paired_counterfactual", "t11-pair-batches", ["staging/teams/T11/team-fragment.json"]),
  syntheticEvidence("source-t11-natural", "evaluation_derivation", "natural_negative_selection", "t11-natural-negative-batch-01", ["generators/parallel/build-06/T11/natural-negative/natural-negative-batch-01/draft.json"]),
  syntheticEvidence("source-t11-knowledge-build", "repo_context", "code_graph_build", "t11-knowledge-batch-01", ["staging/teams/T11/assets/knowledge.json"]),
  syntheticEvidence("source-t11-knowledge-wiki", "repo_context", "repo_document_snapshot", "t11-knowledge-batch-01", ["staging/teams/T11/assets/knowledge.json"]),
  ...input.skill_sources.map((source) => externalEvidence(source, `source-material/T11/skills/${input.skill_visibility.find((item) => item.source_id === source.source_id).name}/SKILL.md`)),
];

const workspaceTemplates = input.project_streams.map((stream, index) => {
  // Keep the existing 40-case workspace identities byte-stable while the
  // expanded Skill pool is visible to discovery.
  const source = input.skill_sources.slice(0, 3)[index % 3];
  const slug = source.repository.replace("https://github.com/", "");
  const workspace = withHash({
    workspaceId: `workspace-task1-t11-${index + 1}`, repoSlug: slug, repoUrl: source.repository, baseCommit: source.revision,
    sourceRepoLicense: source.license, treeSha256: sha(`tree:${stream}:${source.revision}`), fileManifestSha256: sha(`manifest:${stream}:${source.path}`), state: "clean",
  });
  return { stream, source, workspace };
});
const tasks = workspaceTemplates.map(({ stream, source, workspace }, index) => withHash({
  taskId: `T11-TASK-${String(index + 1).padStart(2, "0")}`, teamId: "T11", title: stream,
  description: `Synthetic mobile engineering stream for ${stream}.`, goal: "Close only the frozen routing information gap and stop before implementation.",
  eligibleAgentIds: [agentId],
  projectRef: withHash({ projectRefId: `project-task1-t11-${index + 1}`, repoSlug: workspace.repoSlug, repoUrl: workspace.repoUrl, pinnedCommit: source.revision, sourceEvidenceIds: ["source-t11-current-anchor"] }),
  workspace, sourceEvidenceIds: ["source-t11-current-anchor"],
}));

const l0Conversations = memoryPairs.map((pair, index) => {
  const sessionId = index === 1 ? "T11-L0-ATLAS-CONFLICT-REVIEW" : index === 5 ? "T11-L0-ORCHID-ATLAS-RELEASE-LOCK" : `T11-L0-SUPPORT-${index + 1}`;
  const messages = [
    withHash({ messageId: `${sessionId}-M01`, role: "user", content: pair.query, sourceEvidenceIds: ["source-t11-memory-redacted"], observedAt }),
    withHash({ messageId: `${sessionId}-M02`, role: "assistant", content: pair.negative.delta_message.content, sourceEvidenceIds: ["source-t11-memory-redacted"], observedAt }),
  ];
  return withHash({ assetId: sessionId, ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-redacted"], observedAt, sessionId, messages });
});
// T11 repair batch: preserve the original two turns and append a coherent,
// timestamped ten-turn continuation to every existing session.
const fallbackRepairTurnSets = [
  ["请补充当时检查插件声明时先看了哪一份仓库配置。", "先看根级插件声明，再核对仓库块与版本目录是否一致。", "当时是否把模块内重复声明一并清理？", "是，模块只保留继承关系，重复声明已移除。", "最小构建验证覆盖了哪些模块？", "覆盖 Orchid 的核心 app 与一个库模块，结果一致。", "版本目录是否由发布分支锁定？", "是，发布分支锁定文件是唯一版本来源。", "这条约定还适用于当前失败吗？", "适用；先按同一继承规则核对配置，再判断失败是否来自插件解析。"],
  ["请补充冲突评审中服务端版本如何参与判断。", "先读取服务端版本并与删除基线比较，再决定是否可合并。", "如果更新版本只改变非删除字段呢？", "仍保留删除意图，只有确认未越过基线才允许合并。", "越过基线后是否自动恢复对象？", "不会自动恢复，记录进入待人工解决状态。", "本地重试会改变删除意图吗？", "不会，重试携带同一删除意图和客户端版本。", "审查结束前会写入同步队列吗？", "会保留待处理标记，但不把冲突静默转为成功。"],
  ["请补充保存点检查的具体断言顺序。", "先检查保存点包含字段，再触发重建，最后读取重建后的界面。", "重建前是否先断言界面值？", "是，记录提交值作为重建后的比较基线。", "重建动作完成如何确认？", "等待界面恢复信号后再读取字段。", "如果字段缺失怎么办？", "立即让测试失败，不用默认值掩盖恢复缺陷。", "最后断言比较哪两个值？", "比较重建前提交值与重建后读取值，并确认恢复完成。"],
  ["请补充冷启动采样的固定时间窗。", "先固定首屏帧时间窗，再在相同窗口核对主线程工作。", "热启动对照使用相同窗口吗？", "是，冷启动和热启动都按同一时间窗采样。", "采样时先改渲染实现吗？", "不先改实现，先保留证据判断是否为回归。", "还会记录线程调度吗？", "会记录主线程工作段与首屏帧对应关系。", "怎样确认问题可复现？", "至少重复冷启动采样并与热启动对照后再下结论。"],
  ["请补充 Compose 恢复断言中的输入字段来源。", "使用重建前提交的同一输入字段作为比较基线。", "恢复后只看界面是否显示可以吗？", "不够，还要读取字段值并与提交值相等。", "是否检查恢复信号？", "是，字段相等与界面恢复完成都必须满足。", "如果输入字段为空呢？", "仍按提交的空值比较，不改用默认字符串。", "断言发生在重建的哪个阶段？", "恢复信号到达且字段可读之后执行断言。"],
  ["请补充发布锁定时的两个前置条件如何核对。", "先核对插件版本与发布分支锁定文件，再核对客户端同步协议版本。", "两个条件是否都来自同一分支？", "是，都必须来自已验证的发布分支。", "协议版本不一致时能否只更新插件？", "不能，必须先解决协议版本差异。", "客户端版本锁定是否允许临时覆盖？", "不允许，临时覆盖会破坏发布可复现性。", "两个条件都通过后才做什么？", "只有都通过后才可更新发布配置。"],
];
const repairTurnSets = repairDraft.repair_payload.turnSets;
for (const [sessionIndex, session] of l0Conversations.entries()) {
  const turns = repairTurnSets[sessionIndex];
  const repairMessages = turns.map((content, turnIndex) => withHash({
    messageId: `${session.sessionId}-M${String(turnIndex + 3).padStart(2, "0")}`,
    role: turnIndex % 2 === 0 ? "user" : "assistant", content,
    sourceEvidenceIds: ["source-t11-memory-repair"],
    observedAt: `2026-08-30T12:${String(turnIndex + 1).padStart(2, "0")}:00+08:00`,
  }));
  session.messages.push(...repairMessages);
  const { contentHash: _ignored, ...sessionCore } = session;
  session.contentHash = sha(sessionCore);
}
const makeRepairConversation = (assetId, topic, turns) => {
  const messages = turns.map((content, turnIndex) => withHash({
    messageId: `${assetId}-M${String(turnIndex + 1).padStart(2, "0")}`,
    role: turnIndex % 2 === 0 ? "user" : "assistant", content,
    sourceEvidenceIds: ["source-t11-memory-repair"],
    observedAt: `2026-08-30T13:${String(turnIndex + 1).padStart(2, "0")}:00+08:00`,
  }));
  return withHash({ assetId, ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair"], observedAt, sessionId: assetId, messages });
};
l0Conversations.push(...repairDraft.repair_payload.newL0.map(({ assetId, turns }) => makeRepairConversation(assetId, assetId.includes("PULSE") ? "Pulse" : "Orchid", turns)));
const l1Memories = [
  withHash({ assetId: "T11-L1-ORCHID-AGP-MIGRATION-RULE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-atomic"], observedAt, type: "decision", content: memoryPairs[0].negative.delta_message.content, status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[0].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-HELIO-COMPOSE-RESTORE-ASSERTION", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-atomic"], observedAt, type: "fact", content: memoryPairs[4].negative.delta_message.content, status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[4].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-ORCHID-PLUGIN-SOURCE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "decision", content: "Orchid 构建先核对根级插件声明与官方仓库源，再确认模块继承同一版本目录。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[6].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-ORCHID-MODULE-INHERITANCE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "fact", content: "Orchid 模块不重复声明插件，统一从根级版本目录继承。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[6].messages[3].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-ATLAS-DELETE-INTENT", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "decision", content: "Atlas 冲突重试必须携带原删除意图和客户端版本。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[1].messages[3].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-ATLAS-MANUAL-CONFLICT", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "fact", content: "服务端版本越过删除基线时，Atlas 记录待人工解决而不自动复活。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[1].messages[5].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-NIMBUS-SAVEPOINT", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "fact", content: "Nimbus 恢复测试先确认保存点包含目标字段，再触发界面重建。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[2].messages[1].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-NIMBUS-FAIL-MISSING-FIELD", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "decision", content: "Nimbus 保存点缺少目标字段时立即失败，不以默认值掩盖恢复缺陷。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[2].messages[5].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-PULSE-SAME-WINDOW", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "decision", content: "Pulse 冷启动和热启动必须使用同一首屏帧时间窗进行对照。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[3].messages[3].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-PULSE-DEFER-RENDER-CHANGE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "preference", content: "Pulse 性能复核先保留采样证据，不在确认回归前修改渲染实现。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[3].messages[5].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-HELIO-SAME-FIELD", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "fact", content: "Helio 恢复后读取的字段必须与重建前提交的同一字段比较。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[4].messages[3].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
  withHash({ assetId: "T11-L1-RELEASE-NO-OVERRIDE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-atomic"], observedAt, type: "decision", content: "发布配置的插件与同步协议版本不允许临时覆盖锁定值。", status: "active", validFrom: observedAt, supportingMessageIds: [l0Conversations[5].messages[5].messageId], codeEvidenceLocators: [], testEvidenceLocators: [] }),
];
// The repair payload is the auditable source of truth for every new L1 item.
for (const [assetId, type, content, sessionIndex, messageIndex] of repairDraft.repair_payload.newL1) {
  const item = l1Memories.find((candidate) => candidate.assetId === assetId);
  if (!item) continue;
  item.type = type;
  item.content = content;
  item.supportingMessageIds = [l0Conversations[sessionIndex].messages[messageIndex].messageId];
  const { contentHash: _ignored, ...itemCore } = item;
  item.contentHash = sha(itemCore);
}
const l2Scenes = [
  withHash({ assetId: "T11-L2-NIMBUS-RESTORE-TIMELINE", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-scene"], observedAt, path: "mobile/nimbus/restoration-timeline", summary: "Nimbus verified restoration timeline", content: memoryPairs[2].negative.delta_message.content, injected: false, supportingSessionIds: [l0Conversations[1].sessionId, l0Conversations[2].sessionId] }),
  withHash({ assetId: "T11-L2-PULSE-COLD-START-JANK", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-scene"], observedAt, path: "mobile/pulse/cold-start-jank", summary: "Pulse cold-start jank investigation runbook", content: memoryPairs[3].negative.delta_message.content, injected: false, supportingSessionIds: [l0Conversations[3].sessionId, l0Conversations[4].sessionId] }),
  withHash({ assetId: "T11-L2-ORCHID-BUILD-REVIEW", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-scene"], observedAt, path: "mobile/orchid/build-review", summary: "Orchid plugin and version catalog review", content: "Orchid 构建复核按根级插件声明、官方仓库源、模块继承和最小构建顺序进行。", injected: false, supportingSessionIds: [l0Conversations[0].sessionId, l0Conversations[6].sessionId] }),
  withHash({ assetId: "T11-L2-PULSE-TRACE-COMPARISON", ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-scene"], observedAt, path: "mobile/pulse/trace-comparison", summary: "Pulse cold-hot trace comparison", content: "Pulse 先固定首屏帧窗口并记录主线程工作，再用相同窗口比较冷启动与热启动。", injected: false, supportingSessionIds: [l0Conversations[3].sessionId, l0Conversations[7].sessionId] }),
];
for (const [assetId, path, summary, content, firstSessionIndex, secondSessionIndex] of repairDraft.repair_payload.newL2) {
  const item = l2Scenes.find((candidate) => candidate.assetId === assetId);
  if (!item) continue;
  item.path = path;
  item.summary = summary;
  item.content = content;
  item.supportingSessionIds = [l0Conversations[firstSessionIndex].sessionId, l0Conversations[secondSessionIndex].sessionId];
  const { contentHash: _ignored, ...itemCore } = item;
  item.contentHash = sha(itemCore);
}
const l3Payload = repairDraft.repair_payload.newL3;
const l3Profiles = [withHash({ assetId: l3Payload.assetId, ownerAgentId: agentId, sourceEvidenceIds: ["source-t11-memory-repair-profile"], observedAt, content: l3Payload.content, stability: l3Payload.stability })];

const skills = input.skill_visibility.map((visibility) => {
  const source = input.skill_sources.find((item) => item.source_id === visibility.source_id);
  return withHash({ assetId: visibility.asset_id, ownerAgentId: agentId, sourceEvidenceIds: [`source-${source.source_id}`], observedAt,
    name: visibility.name, version: "1.0.0", description: `${visibility.use_when}; sourced from ${source.path}.`, useWhen: visibility.use_when,
    doNotUseWhen: visibility.do_not_use_when, repoCommit: source.revision, visibility: visibility.listed ? "private" : "team",
    provenanceMode: "imported_open_source", supportingSessionIds: [], codeEvidenceLocators: [], testEvidenceLocators: [], manifest: [{ path: "SKILL.md", sha256: source.raw_sha256 }],
  });
});
const knowledge = input.knowledge_assets.map((asset, index) => withHash({
  assetId: asset.id, ownerAgentId: agentId, sourceEvidenceIds: [asset.kind === "wiki" ? "source-t11-knowledge-wiki" : "source-t11-knowledge-build"], observedAt,
  type: asset.kind === "wiki" ? "wiki" : "code_graph", name: asset.description,
  ...(asset.kind === "wiki" ? {} : { repoUrl: workspaceTemplates[index % workspaceTemplates.length].workspace.repoUrl, repoCommit: workspaceTemplates[index % workspaceTemplates.length].source.revision, indexVersion: "task1-build06-fixture-v1" }),
  snapshotSha256: sha(`knowledge:${asset.id}:${asset.description}`), bindings: [{ agentId, visibility: "fixed" }],
}));
const memoryAssets = { schema_version: "task1.formal_memory_assets.v1", team_id: "T11", l0_conversations: l0Conversations, l1_memories: l1Memories, l2_scenes: l2Scenes, l3_profiles: l3Profiles };
const skillAssets = { schema_version: "task1.formal_skill_assets.v1", team_id: "T11", skills };
const knowledgeAssets = { schema_version: "task1.formal_knowledge_assets.v1", team_id: "T11", knowledge };
const snapshotAssetIds = [...l0Conversations, ...l1Memories, ...l2Scenes, ...l3Profiles, ...skills, ...knowledge].map((asset) => asset.assetId);
const visibleAssetSetSha256 = sha({ teamId: "T11", userId: "user-task1-t11-eval", agentId, assetIds: [...snapshotAssetIds].sort((left, right) => left.localeCompare(right)) });

const memoryRoutes = [
  { target: "T11-L1-ORCHID-AGP-MIGRATION-RULE", seq: ["tdai_memory_search"], first: { tool: "tdai_memory_search", endpoint: "/memory-bridge/v3/atomic/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: ["Orchid", "AGP", "迁移"] } } }, follow: [] },
  { target: "T11-L0-ATLAS-CONFLICT-REVIEW", seq: ["tdai_conversation_search"], first: { tool: "tdai_conversation_search", endpoint: "/memory-bridge/v3/conversation/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id"], stringContainsAny: { query: ["Atlas", "删除", "冲突"] } } }, follow: [] },
  { target: "T11-L2-NIMBUS-RESTORE-TIMELINE", seq: ["tdai_scenario_ls", "tdai_read_scene"], first: { tool: "tdai_scenario_ls", endpoint: "/memory-bridge/v3/scenario/ls", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id"], exactValues: { path_prefix: "mobile/nimbus" } } }, follow: [{ tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], valueFromPreviousStep: true } }] },
  { target: "T11-L2-PULSE-COLD-START-JANK", seq: ["tdai_scenario_ls", "tdai_read_scene"], first: { tool: "tdai_scenario_ls", endpoint: "/memory-bridge/v3/scenario/ls", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id"], exactValues: { path_prefix: "mobile/pulse" } } }, follow: [{ tool: "tdai_read_scene", endpoint: "/memory-bridge/v3/scenario/read", argumentRules: { requiredFields: ["path"], valueFromPreviousStep: true } }] },
  { target: "T11-L1-HELIO-COMPOSE-RESTORE-ASSERTION", seq: ["tdai_atomic_query"], first: { tool: "tdai_atomic_query", endpoint: "/memory-bridge/v3/atomic/query", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { type: "fact" } } }, follow: [] },
  { target: "T11-L0-ORCHID-ATLAS-RELEASE-LOCK", seq: ["tdai_conversation_query"], first: { tool: "tdai_conversation_query", endpoint: "/memory-bridge/v3/conversation/query", argumentRules: { requiredFields: [], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { session_id: "T11-L0-ORCHID-ATLAS-RELEASE-LOCK" } } }, follow: [] },
];
const forbiddenByFamily = {
  memory: ["skill_search", "skill_view", "knowledge_tools_list"],
  skill: ["tdai_memory_search", "tdai_conversation_search", "knowledge_tools_list"],
  knowledge: ["tdai_memory_search", "tdai_conversation_search", "skill_search", "skill_view"],
};
const publicCases = [];
const privateAnnotations = [];
const pairs = [];
let taskCursor = 0;

function addPair(pair, family, ordinal, route) {
  const pairId = `T11-PAIR-${String(ordinal).padStart(3, "0")}`;
  const stem = `${family.toUpperCase()}-${String(ordinal).padStart(3, "0")}`;
  const task = tasks[taskCursor++ % tasks.length];
  const evidenceRefs = family === "skill" ? [`source-${input.skill_visibility.find((item) => item.asset_id === route.target).source_id}`, "source-t11-current-anchor", "source-t11-pairs"] : family === "knowledge" ? [route.sourceId, "source-t11-current-anchor", "source-t11-pairs"] : ["source-t11-memory-redacted", "source-t11-current-anchor", "source-t11-pairs"];
  for (const role of ["positive", "negative"]) {
    const suffix = role === "positive" ? "P" : "N";
    const caseId = `T11-${stem}-${suffix}`;
    const item = withHash({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T11", userId: "user-task1-t11-eval", agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: pair.difficulty, contextMessages: insertDelta(pair, role), query: pair.query, visibleAssetSetSha256 });
    publicCases.push(item);
    const positive = role === "positive";
    const goldBase = positive ? {
      needTdaiTool: true, family, allowedFirstActions: [route.first], expectedFollowupActions: route.follow ?? [], expectedKnowledgeCalls: route.knowledgeCalls ?? [], allowedSequences: [route.seq], forbiddenTools: forbiddenByFamily[family], maxTdaiCalls: route.seq.length, targetAssetIds: [route.target],
      informationGap: pair.positive.private_proposal.unique_information_gap, stopAfter: route.stopAfter ?? `The final action returns ${route.target}.`, evidenceRefs,
      ablationEvidence: `Removing ${route.target} leaves the requested frozen workflow fact unavailable in current context.`,
    } : { needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs, ablationEvidence: "Not applicable: this counterfactual is intentionally self-contained.", noToolEvidence: pair.negative.private_proposal.why_current_context_is_sufficient };
    const gold = withHash(goldBase);
    privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: evidenceRefs, pairId, pairRole: role, gold, annotationReason: positive ? pair.positive.private_proposal.unique_information_gap : pair.negative.private_proposal.why_current_context_is_sufficient }));
  }
  pairs.push(withHash({ pairId, positiveCaseId: `T11-${stem}-P`, negativeCaseId: `T11-${stem}-N`, counterfactualKind: "answer_in_current_context", controlledDeltaSha256: controlledDeltaSha256(pair), currentEvidenceRefs: ["source-t11-current-anchor", "source-t11-pairs"] }));
}

memoryPairs.forEach((pair, index) => addPair(pair, "memory", index + 1, { ...memoryRoutes[index], stopAfter: memoryRoutes[index].seq.at(-1) === "tdai_read_scene" ? `tdai_read_scene returns ${memoryRoutes[index].target}.` : `${memoryRoutes[index].seq.at(-1)} returns ${memoryRoutes[index].target}.` }));
skillPairs.forEach((pair, index) => {
  const target = pair.positive.private_proposal.target_asset_ids[0];
  const searchable = index < 3;
  const skill = skills.find((item) => item.assetId === target);
  addPair(pair, "skill", index + 7, searchable ? {
    target, seq: ["skill_search", "skill_view_by_id"], first: { tool: "skill_search", endpoint: "/skill-bridge/v3/skill/search", argumentRules: { requiredFields: ["query"], forbiddenFields: ["user_id", "team_id", "agent_id", "top_k", "mode"], stringContainsAny: { query: ["Android", "performance", "profiling"] } } },
    follow: [{ tool: "skill_view_by_id", endpoint: "/skill-bridge/v3/skill/get", argumentRules: { requiredFields: ["skill_id"], forbiddenFields: ["user_id", "team_id", "agent_id"], valueFromPreviousStep: true } }], stopAfter: `skill_view_by_id returns ${skill.name}.`,
  } : {
    target, seq: ["skill_view"], first: { tool: "skill_view", endpoint: "/skill-bridge/v3/skill/get-by-name", argumentRules: { requiredFields: ["skill_name", "include_content", "include_manifest"], forbiddenFields: ["user_id", "team_id", "agent_id"], exactValues: { skill_name: skill.name, include_content: true, include_manifest: true } } }, follow: [], stopAfter: `skill_view returns ${skill.name}.`,
  });
});
knowledgePairs.forEach((pair, index) => {
  const target = pair.positive.private_proposal.target_asset_ids[0];
  const asset = input.knowledge_assets.find((item) => item.id === target);
  addPair(pair, "knowledge", index + 13, {
    target, sourceId: asset.kind === "wiki" ? "source-t11-knowledge-wiki" : "source-t11-knowledge-build", seq: ["knowledge_tools_list", "knowledge_tools_call"],
    first: { tool: "knowledge_tools_list", endpoint: "/tools/list", argumentRules: { requiredFields: ["knowledge_id"], exactValues: { knowledge_id: target } } }, follow: [],
    knowledgeCalls: [{ toolName: asset.tool_name, paramRules: { requiredFields: ["query"] } }], stopAfter: `knowledge_tools_call ${asset.tool_name} returns the requested frozen evidence from ${target}.`,
  });
});
naturalCases.forEach((draft, index) => {
  const task = tasks[taskCursor++ % tasks.length];
  const caseId = `T11-NATURAL-${String(index + 1).padStart(3, "0")}-N`;
  publicCases.push(withHash({ caseId, identity: { spaceId: "space-task1-engineering", teamId: "T11", userId: "user-task1-t11-eval", agentId, taskId: task.taskId, sessionId: `session-${caseId.toLowerCase()}`, agentSource: "codex" }, snapshotId: "snapshot-task1-dev-v1", workspace: task.workspace, language: "zh", difficulty: draft.difficulty, contextMessages: draft.context_messages, query: draft.query, visibleAssetSetSha256 }));
  const evidenceRefs = ["source-t11-current-anchor", "source-t11-natural"];
  privateAnnotations.push(withHash({ caseId, sourceEvidenceIds: evidenceRefs, gold: withHash({ needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs, ablationEvidence: "Not applicable: this natural coding task is intentionally self-contained.", noToolEvidence: draft.why_current_context_is_sufficient }), annotationReason: draft.why_current_context_is_sufficient }));
});

const teams = [withHash({ teamId: "T11", worldId: "world-task1-engineering", split: "dev", name: "移动端工程", businessAgentIds: [agentId], taskIds: tasks.map((task) => task.taskId), sourceEvidenceIds: ["source-t11-current-anchor"] })];
const detail = withHash({ description: "Maintains Android/iOS builds, lifecycle, offline sync, performance, and UI testing work in T11.", prompt: "Use only the current Team's frozen assets and stop when the case-specific information gap is closed." });
const businessAgents = [withHash({ agentId, teamId: "T11", name: "T11 通用业务 Agent", agentDetail: detail, importedMemoryAgentIds: [], boundSkillIds: skills.filter((skill) => skill.visibility === "private").map((skill) => skill.assetId), fixedKnowledgeIds: knowledge.map((asset) => asset.assetId), sourceEvidenceIds: ["source-t11-current-anchor"] })];
const fragment = {
  schema_version: "task1.team_fragment.v1", build_id: "build-06", team_id: "T11", split: "dev", sourceEvidence, teams, businessAgents, tasks, publicCases, privateAnnotations, pairs,
  snapshotAssetIds, generatorBatchRefs: ["T11/memory/memory-batch-01", "T11/memory/memory-batch-02", "T11/skill/skill-batch-01", "T11/skill/skill-batch-02", "T11/knowledge/knowledge-batch-01", "T11/natural-negative/natural-negative-batch-01", "T11/repair/luna-repair-01"],
  externalImports: input.skill_sources.map((source) => ({ sourceId: `source-${source.source_id}`, repository: source.repository, revision: source.revision, path: source.path, license: source.license, rawFileSha256: source.raw_sha256, storedFileSha256: source.raw_sha256, storedPath: source.stored_path ?? `source-material/T11/skills/${input.skill_visibility.find((item) => item.source_id === source.source_id).name}/SKILL.md`, licenseFileSha256: source.license_sha256, storedLicensePath: source.stored_license_path ?? (source.repository === "https://github.com/android/skills" ? "source-material/T11/skills/licenses/android-skills-LICENSE.txt" : "source-material/T11/skills/licenses/android-testing-skills-LICENSE") })),
};

await mkdir(assetsDir, { recursive: true });
await writeFile(path.join(staging, "team-fragment.json"), JSON.stringify(fragment, null, 2) + "\n");
await writeFile(path.join(assetsDir, "memory.json"), JSON.stringify(memoryAssets, null, 2) + "\n");
await writeFile(path.join(assetsDir, "skills.json"), JSON.stringify(skillAssets, null, 2) + "\n");
await writeFile(path.join(assetsDir, "knowledge.json"), JSON.stringify(knowledgeAssets, null, 2) + "\n");
await writeFile(path.join(staging, "review.md"), `# T11 Sol review\n\nReviewed all Luna drafts against production routing contracts. Existing 40 cases, 15 pairs, and Gold annotations are preserved. Final asset pool: L0=8 sessions (12 messages each), L1=12, L2=4, L3=1, Skill=14 (5 listed, 9 same-Team searchable), with at least three same-domain searchable competitors for every skill_search route. Existing 6 Memory positives, 6 Skill positives, 3 Knowledge positives, 15 paired no-tool negatives, and 10 natural coding negatives remain unchanged. Memory scene-discovery candidates retain read_scene. Repair batch t11-memory-repair-luna-high was generated with gpt-5.6-luna/high and reviewed by Sol. New Skills reuse frozen shared GitHub files with pinned commit, path, blob/SHA-256, and license records.\n`);
console.log(JSON.stringify({ team: "T11", cases: publicCases.length, pairs: pairs.length, positives: privateAnnotations.filter((item) => item.gold.needTdaiTool).length, assets: snapshotAssetIds.length }, null, 2));
