import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalSha256 } from "../../../worlds/formal-snapshot.js";
import type {
  FormalWorldContract,
  L0Conversation,
  PrivateCaseAnnotation,
  PublicCaseInput,
  SourceEvidence,
} from "../../../worlds/formal-schema.js";

const GENERATED_AT = "2026-08-29T18:10:00+08:00";
const WORLD_AS_OF = "2026-08-29T23:59:59+08:00";
const OWNER_AGENT_ID = "agent-task1-t01-general";
const USER_ID = "user-task1-t01-eval";
const TEAM_ID = "T01";
const SERVICE_ID = "space-task1-engineering";
const CURRENT_REPO_COMMIT = "8c57ffc7210f11e44352cb7aa0716e610720a509";
const OPENHANDS_ARTIFACT_SHA = "ea4bf37de020e165c5210bedddeef523d8834a89a35a8c65fec24f76f0eae4f1";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const benchRoot = resolve(root, "..");

function withoutContentHash<T extends { contentHash?: string }>(value: T): Omit<T, "contentHash"> {
  const { contentHash: _contentHash, ...rest } = value;
  void _contentHash;
  return rest;
}

function withHash<T extends Record<string, unknown>>(value: T): T & { contentHash: string } {
  return { ...value, contentHash: canonicalSha256(value) };
}

function fileSha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function upsertById<T>(items: T[], key: (item: T) => string, additions: T[]): T[] {
  const merged = new Map(items.map((item) => [key(item), item]));
  for (const item of additions) merged.set(key(item), item);
  return [...merged.values()].sort((left, right) => key(left).localeCompare(key(right)));
}

interface DraftL0Session {
  session_id: string;
  source: {
    dataset_id: string;
    dataset_revision: string;
    stable_locator: string;
    instance_id: string;
    repo: string;
    base_commit: string;
    trajectory_row: number;
  };
  redacted_replay: { version: string };
  input_sha256: string;
  output_sha256: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

const motoSourceTimes: Record<string, string> = {
  "getmoto__moto-5134": "2022-05-13T19:55:51Z",
  "getmoto__moto-6567": "2023-07-28T10:14:41Z",
  "getmoto__moto-7365": "2024-02-19T20:29:03Z",
  "getmoto__moto-5587": "2022-10-21T20:58:13Z",
  "getmoto__moto-6585": "2023-08-01T16:05:18Z",
  "getmoto__moto-6913": "2023-10-13T19:07:22Z",
};

function l0Evidence(session: DraftL0Session): SourceEvidence {
  const observedAt = motoSourceTimes[session.source.instance_id];
  if (!observedAt) throw new Error(`missing source time for ${session.source.instance_id}`);
  return withHash({
    sourceId: `source-t01-history-${session.source.instance_id}`,
    dataset: session.source.dataset_id,
    datasetRevision: session.source.dataset_revision,
    datasetArtifactSha256: OPENHANDS_ARTIFACT_SHA,
    sourceRepoUrl: `https://github.com/${session.source.repo}`,
    sourceRepoCommit: session.source.base_commit,
    sourceRepoLicense: "Apache-2.0",
    sourceTaskId: session.source.instance_id,
    trajectoryId: `openhands-row-${session.source.trajectory_row}`,
    role: "history" as const,
    origin: "synthetic_agent_replay" as const,
    sourceTaskTime: observedAt,
    trajectoryGeneratedAt: "2025-05-10T03:26:28Z",
    worldAsOf: WORLD_AS_OF,
    evidenceLocator: `formal-worlds/W01/drafts/l0-sessions.json#session=${session.session_id}; ${session.source.stable_locator}`,
    evidenceSha256: session.output_sha256,
    transform: "redacted_replay" as const,
    transformVersion: session.redacted_replay.version,
    transformInputSha256: session.input_sha256,
    piiScan: "passed" as const,
    reviewStatus: "reviewed" as const,
    reviewedBy: "Sol/DS02-pilot",
  });
}

function l0Asset(session: DraftL0Session): { asset: L0Conversation; retainedSourceIndexes: number[] } {
  const retainedSourceIndexes = session.messages
    .map((message, index) => ({ index, bytes: Buffer.byteLength(message.content, "utf8") }))
    .filter((item) => item.bytes <= 4096)
    .slice(-40)
    .map((item) => item.index);
  if (retainedSourceIndexes.length < 12) throw new Error(`${session.session_id} has fewer than twelve safe messages`);
  const sourceEvidenceId = `source-t01-history-${session.source.instance_id}`;
  const observedAt = motoSourceTimes[session.source.instance_id];
  const assetId = session.session_id.replace("W01-", "T01-");
  const messages = retainedSourceIndexes.map((sourceIndex) => withHash({
    messageId: `${assetId}-M${String(sourceIndex).padStart(3, "0")}`,
    role: session.messages[sourceIndex].role,
    content: session.messages[sourceIndex].content,
    sourceEvidenceIds: [sourceEvidenceId],
    observedAt,
  }));
  return {
    asset: withHash({
      assetId,
      ownerAgentId: OWNER_AGENT_ID,
      sourceEvidenceIds: [sourceEvidenceId],
      observedAt,
      sessionId: assetId,
      messages,
    }),
    retainedSourceIndexes,
  };
}

function repoSource(input: {
  sourceId: string;
  dataset: string;
  datasetRevision: string;
  datasetArtifactSha256: string;
  sourceRepoUrl: string;
  sourceRepoCommit: string;
  sourceRepoLicense: string;
  sourceTaskId: string;
  sourceTaskTime: string;
  evidenceLocator: string;
  evidenceSha256: string;
  transform: "code_graph_build" | "repo_document_snapshot" | "current_task_anchor" | "paired_counterfactual";
  role: "repo_context" | "current_anchor" | "evaluation_derivation";
  origin: "repo_code" | "repo_document" | "evidence_grounded_synthesis";
  transformInputSha256: string;
}): SourceEvidence {
  return withHash({
    ...input,
    trajectoryGeneratedAt: GENERATED_AT,
    worldAsOf: WORLD_AS_OF,
    transformVersion: "ds02.pilot.v1",
    piiScan: "passed" as const,
    reviewStatus: "reviewed" as const,
    reviewedBy: "Sol/DS02-pilot",
  });
}

async function main(): Promise<void> {
  const contractPath = resolve(root, "registry/contracts/formal-v1.json");
  const contract = JSON.parse(await readFile(contractPath, "utf8")) as FormalWorldContract;
  const l0Draft = JSON.parse(await readFile(resolve(benchRoot, "formal-worlds/W01/drafts/l0-sessions.json"), "utf8")) as {
    sessions: DraftL0Session[];
  };
  const addedL0 = l0Draft.sessions.slice(0, 6).map(l0Asset);
  const addedL0Evidence = l0Draft.sessions.slice(0, 6).map(l0Evidence);

  const ujsonIndex = {
    schema_version: "task1.code_graph_fixture.v1",
    repo_slug: "ultrajson/ultrajson",
    repo_commit: "8f23cce7929c49b9235d2f46ac9a403d051a9c95",
    nodes: [
      { symbol: "ujsonMethods", kind: "variable", file: "src/ujson/python/ujson.c", line: 63 },
      { symbol: "JSONToObj", kind: "function", file: "src/ujson/python/JSONtoObj.c", line: 163 },
      { symbol: "JSON_DecodeObject", kind: "function", file: "src/ujson/lib/ultrajsondec.c", line: 790 },
    ],
    edges: [{ from: "JSONToObj", to: "JSON_DecodeObject", file: "src/ujson/python/JSONtoObj.c", line: 247 }],
    caller_results: {
      JSON_DecodeObject: [{ symbol: "JSONToObj", file: "src/ujson/python/JSONtoObj.c", line: 247 }],
    },
  };
  const mypyIndex = {
    schema_version: "task1.code_graph_fixture.v1",
    repo_slug: "python/mypy",
    repo_commit: "d7b24514d7301f86031b7d1e2215cf8c2476bec0",
    nodes: [
      { symbol: "snapshot_definition", kind: "function", file: "mypy/server/astdiff.py", line: 227 },
      { symbol: "AliasPrinter", kind: "class", file: "mypy/stubgen.py", line: 364 },
    ],
    edges: [],
  };
  const reviewPath = resolve(benchRoot, "formal-worlds/W01/reviews/L0-ASSET-CANDIDATE-REVIEW.md");
  const reviewText = await readFile(reviewPath, "utf8");
  const reliabilityWiki = {
    schema_version: "task1.wiki_fixture.v1",
    name: "T01 Python reliability evidence policy",
    pages: [{
      ref: "python-reliability-evidence-policy",
      title: "Python reliability evidence promotion policy",
      path: "reviews/L0-ASSET-CANDIDATE-REVIEW.md",
      content_sha256: fileSha256(reviewText),
      summary: "Promotion boundaries for replay evidence, atomic memory, scene, profile, and Skill assets.",
    }],
  };
  const ujsonIndexSha = canonicalSha256(ujsonIndex);
  const mypyIndexSha = canonicalSha256(mypyIndex);
  const wikiSnapshotSha = canonicalSha256(reliabilityWiki);

  const knowledgeFixture = {
    schema_version: "task1.ds02_retrieval_pressure_fixture.v1",
    team_id: TEAM_ID,
    service_id: SERVICE_ID,
    resources: [
      {
        knowledge_id: "cg-t01ujs01",
        type: "code-graph",
        name: "ultrajson pinned code graph",
        summary: "Pinned symbol and call graph for the ujson reliability workspace.",
        status: "ready",
        service_url: "http://memoryknowledge.test/v3",
        repo_slug: "ultrajson/ultrajson",
        repo_url: "https://github.com/ultrajson/ultrajson",
        branch: "8f23cce7929c49b9235d2f46ac9a403d051a9c95",
        snapshot_sha256: ujsonIndexSha,
      },
      {
        knowledge_id: "cg-t01mypy1",
        type: "code-graph",
        name: "mypy pinned code graph",
        summary: "Pinned symbol graph for the separate mypy regression workspace.",
        status: "ready",
        service_url: "http://memoryknowledge.test/v3",
        repo_slug: "python/mypy",
        repo_url: "https://github.com/python/mypy",
        branch: "d7b24514d7301f86031b7d1e2215cf8c2476bec0",
        snapshot_sha256: mypyIndexSha,
      },
      {
        knowledge_id: "wiki-t01rel01",
        type: "wiki",
        name: "T01 Python reliability evidence policy",
        summary: "Why replay facts may or may not be promoted into durable Memory, scene, profile, or Skill assets.",
        status: "ready",
        service_url: "http://memoryknowledge.test/v3",
        snapshot_sha256: wikiSnapshotSha,
      },
    ],
    snapshots: {
      "cg-t01ujs01": ujsonIndex,
      "cg-t01mypy1": mypyIndex,
      "wiki-t01rel01": reliabilityWiki,
    },
    expected_target: {
      workspace_repo_slug: "ultrajson/ultrajson",
      knowledge_id: "cg-t01ujs01",
      list_tool_names: ["get_info", "search", "explore", "callers", "callees", "impact", "node", "status", "files"],
      call: { tool_name: "callers", params: { symbol: "JSON_DecodeObject" } },
      result: ujsonIndex.caller_results.JSON_DecodeObject,
    },
  };
  const fixturePath = resolve(root, "fixtures/T01-retrieval-pressure.json");
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(knowledgeFixture, null, 2)}\n`, "utf8");
  const fixtureSha = fileSha256(`${JSON.stringify(knowledgeFixture, null, 2)}\n`);

  const reviewSha = fileSha256(reviewText);
  const newSources: SourceEvidence[] = [
    ...addedL0Evidence,
    repoSource({
      sourceId: "source-t01-knowledge-ujson-codegraph",
      dataset: "ultrajson pinned repository",
      datasetRevision: "8f23cce7929c49b9235d2f46ac9a403d051a9c95",
      datasetArtifactSha256: "a89398e94c4256807c3f6e7580218b7bb9b885103e75f46e43d5090c07249dc9",
      sourceRepoUrl: "https://github.com/ultrajson/ultrajson",
      sourceRepoCommit: "8f23cce7929c49b9235d2f46ac9a403d051a9c95",
      sourceRepoLicense: "BSD-3-Clause",
      sourceTaskId: "T01-knowledge-ujson-codegraph",
      sourceTaskTime: "2026-01-05T20:58:16+02:00",
      evidenceLocator: "formal-dataset/fixtures/T01-retrieval-pressure.json#snapshots.cg-t01ujs01",
      evidenceSha256: ujsonIndexSha,
      transform: "code_graph_build",
      role: "repo_context",
      origin: "repo_code",
      transformInputSha256: "a556b0a171c8dd1c5017e3b182bf2f57bbd70ea9a38a39f99b347bb02a681bdf",
    }),
    repoSource({
      sourceId: "source-t01-knowledge-mypy-codegraph",
      dataset: "mypy pinned repository",
      datasetRevision: "d7b24514d7301f86031b7d1e2215cf8c2476bec0",
      datasetArtifactSha256: "e651c712b2d4a66cc032ca4d4311fc787c03dbf0688af108c1bbd06f5a712f33",
      sourceRepoUrl: "https://github.com/python/mypy",
      sourceRepoCommit: "d7b24514d7301f86031b7d1e2215cf8c2476bec0",
      sourceRepoLicense: "MIT",
      sourceTaskId: "T01-knowledge-mypy-codegraph",
      sourceTaskTime: "2023-08-27T15:20:13-07:00",
      evidenceLocator: "formal-dataset/fixtures/T01-retrieval-pressure.json#snapshots.cg-t01mypy1",
      evidenceSha256: mypyIndexSha,
      transform: "code_graph_build",
      role: "repo_context",
      origin: "repo_code",
      transformInputSha256: "81e0f38140de19704e5f7282d9028f9dcea00719d94a5292bb1c85d84afc3e3e",
    }),
    repoSource({
      sourceId: "source-t01-knowledge-reliability-wiki",
      dataset: "Task1 T01 evidence review",
      datasetRevision: CURRENT_REPO_COMMIT,
      datasetArtifactSha256: reviewSha,
      sourceRepoUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
      sourceRepoCommit: CURRENT_REPO_COMMIT,
      sourceRepoLicense: "MIT",
      sourceTaskId: "T01-knowledge-reliability-wiki",
      sourceTaskTime: "2026-08-29T17:59:18+08:00",
      evidenceLocator: "formal-worlds/W01/reviews/L0-ASSET-CANDIDATE-REVIEW.md",
      evidenceSha256: wikiSnapshotSha,
      transform: "repo_document_snapshot",
      role: "repo_context",
      origin: "repo_document",
      transformInputSha256: reviewSha,
    }),
    repoSource({
      sourceId: "source-t01-current-ujson-impact",
      dataset: "Task1 evidence-grounded current task",
      datasetRevision: `DS02@${CURRENT_REPO_COMMIT}`,
      datasetArtifactSha256: fixtureSha,
      sourceRepoUrl: "https://github.com/ultrajson/ultrajson",
      sourceRepoCommit: "8f23cce7929c49b9235d2f46ac9a403d051a9c95",
      sourceRepoLicense: "BSD-3-Clause",
      sourceTaskId: "T01-current-ujson-decoder-impact",
      sourceTaskTime: GENERATED_AT,
      evidenceLocator: "formal-dataset/fixtures/T01-retrieval-pressure.json#expected_target",
      evidenceSha256: canonicalSha256(knowledgeFixture.expected_target),
      transform: "current_task_anchor",
      role: "current_anchor",
      origin: "evidence_grounded_synthesis",
      transformInputSha256: fixtureSha,
    }),
  ];

  const sharedMessages = [
    { role: "user" as const, content: "准备给 ujson 解码入口增加一项只读配置，但先不要改代码；我需要确认跨 Python/C 边界的实际影响面。" },
    { role: "assistant" as const, content: "当前工作区固定在 ultrajson/ultrajson 的指定提交。局部源码表明 loads 和 decode 都注册到 JSONToObj，但这还不是完整的跨文件调用关系。" },
    { role: "user" as const, content: "问题不是怎么写 Atheris harness，也不是重新挑 fuzz target；那两项流程资产只是同 Team 干扰。" },
    { role: "assistant" as const, content: "已排除 Skill 路径。这里要确认的是仓库快照中的符号调用边，以及该边是否还有其他直接调用者。" },
    { role: "user" as const, content: "本地 grep 能看到一个调用点，但生成文件和 C 声明分散在多个目录，我不想把一次文本命中误当成完整影响面。" },
    { role: "assistant" as const, content: "因此需要使用与当前 workspace 匹配的预建仓库关系索引；mypy 图和团队证据 wiki 都不匹配这个代码问题。" },
    { role: "user" as const, content: "目标符号是 JSON_DecodeObject。先只回答直接调用者和落点，拿到这个关系就停。" },
  ];
  const positiveDelta = {
    role: "assistant" as const,
    content: "当前上下文仍未证明固定提交里 JSON_DecodeObject 是否只有一个直接调用者，也没有冻结可复核的调用边结果。",
  };
  const negativeDelta = {
    role: "assistant" as const,
    content: "固定提交的调用边清单已在当前上下文给出：JSON_DecodeObject 只有直接调用者 JSONToObj，调用点是 src/ujson/python/JSONtoObj.c:247；loads 与 decode 都在 src/ujson/python/ujson.c 注册到 JSONToObj。",
  };
  const query = "在动 decoder 参数前，先确认 JSON_DecodeObject 的直接调用者和文件位置，判断 Python 入口是否都会受影响。";
  const pairId = "T01-PAIR-005";
  const controlledDeltaSha256 = createHash("sha256").update(JSON.stringify({
    positive_delta_message: positiveDelta,
    negative_delta_message: negativeDelta,
    query,
  }), "utf8").digest("hex");
  const pairSource = repoSource({
    sourceId: "source-t01-pair-005",
    dataset: "Task1 paired counterfactual authoring",
    datasetRevision: `DS02@${CURRENT_REPO_COMMIT}`,
    datasetArtifactSha256: fixtureSha,
    sourceRepoUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
    sourceRepoCommit: CURRENT_REPO_COMMIT,
    sourceRepoLicense: "MIT",
    sourceTaskId: pairId,
    sourceTaskTime: GENERATED_AT,
    evidenceLocator: "formal-dataset/generators/sol-ds02-pilot/build-pilot.ts#T01-PAIR-005",
    evidenceSha256: controlledDeltaSha256,
    transform: "paired_counterfactual",
    role: "evaluation_derivation",
    origin: "evidence_grounded_synthesis",
    transformInputSha256: fixtureSha,
  });
  newSources.push(pairSource);

  contract.sourceEvidence = upsertById(contract.sourceEvidence, (item) => item.sourceId, newSources);
  contract.assets.l0Conversations = upsertById(
    contract.assets.l0Conversations,
    (item) => item.assetId,
    addedL0.map((item) => item.asset),
  );
  contract.assets.knowledge = [
    withHash({
      assetId: "cg-t01ujs01",
      ownerAgentId: OWNER_AGENT_ID,
      sourceEvidenceIds: ["source-t01-knowledge-ujson-codegraph"],
      observedAt: GENERATED_AT,
      type: "code_graph" as const,
      name: "ultrajson pinned code graph",
      repoUrl: "https://github.com/ultrajson/ultrajson",
      repoCommit: "8f23cce7929c49b9235d2f46ac9a403d051a9c95",
      indexVersion: "task1-codegraph-fixture-v1",
      snapshotSha256: ujsonIndexSha,
      bindings: [{ agentId: OWNER_AGENT_ID, visibility: "fixed" as const }],
    }),
    withHash({
      assetId: "cg-t01mypy1",
      ownerAgentId: OWNER_AGENT_ID,
      sourceEvidenceIds: ["source-t01-knowledge-mypy-codegraph"],
      observedAt: GENERATED_AT,
      type: "code_graph" as const,
      name: "mypy pinned code graph",
      repoUrl: "https://github.com/python/mypy",
      repoCommit: "d7b24514d7301f86031b7d1e2215cf8c2476bec0",
      indexVersion: "task1-codegraph-fixture-v1",
      snapshotSha256: mypyIndexSha,
      bindings: [{ agentId: OWNER_AGENT_ID, visibility: "fixed" as const }],
    }),
    withHash({
      assetId: "wiki-t01rel01",
      ownerAgentId: OWNER_AGENT_ID,
      sourceEvidenceIds: ["source-t01-knowledge-reliability-wiki"],
      observedAt: GENERATED_AT,
      type: "wiki" as const,
      name: "T01 Python reliability evidence policy",
      snapshotSha256: wikiSnapshotSha,
      bindings: [{ agentId: OWNER_AGENT_ID, visibility: "fixed" as const }],
    }),
  ];

  const activeAgent = contract.businessAgents.find((item) => item.agentId === OWNER_AGENT_ID);
  if (!activeAgent) throw new Error("missing T01 active agent");
  activeAgent.fixedKnowledgeIds = contract.assets.knowledge
    .map((item) => item.assetId)
    .sort((left, right) => left.localeCompare(right));
  activeAgent.contentHash = canonicalSha256(withoutContentHash(activeAgent));

  const devSnapshot = contract.snapshots.find((item) => item.split === "dev");
  if (!devSnapshot) throw new Error("missing dev snapshot");
  const visibleSet = devSnapshot.visibleAssetSets.find((item) => item.teamId === TEAM_ID && item.agentId === OWNER_AGENT_ID);
  if (!visibleSet) throw new Error("missing T01 visible set");
  visibleSet.assetIds = [
    ...contract.assets.l0Conversations.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).map((item) => item.assetId),
    ...contract.assets.l1Memories.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).map((item) => item.assetId),
    ...contract.assets.l2Scenes.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).map((item) => item.assetId),
    ...contract.assets.l3Profiles.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).map((item) => item.assetId),
    ...contract.assets.skills.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).map((item) => item.assetId),
    ...contract.assets.knowledge.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).map((item) => item.assetId),
  ].sort((left, right) => left.localeCompare(right));
  visibleSet.sha256 = canonicalSha256({
    teamId: visibleSet.teamId,
    userId: visibleSet.userId,
    agentId: visibleSet.agentId,
    assetIds: visibleSet.assetIds,
  });

  for (const publicCase of contract.publicCases) {
    if (publicCase.identity.teamId !== TEAM_ID) continue;
    publicCase.visibleAssetSetSha256 = visibleSet.sha256;
    publicCase.contentHash = canonicalSha256(withoutContentHash(publicCase));
  }

  const ujsonTask = contract.tasks.find((item) => item.taskId === "T01-TASK-UJSON-FUZZING");
  if (!ujsonTask) throw new Error("missing ujson task");
  function publicCase(caseId: string, suffix: "p" | "n", delta: typeof positiveDelta): PublicCaseInput {
    return withHash({
      caseId,
      identity: {
        spaceId: contract.world.spaceId,
        teamId: TEAM_ID,
        userId: USER_ID,
        agentId: OWNER_AGENT_ID,
        taskId: ujsonTask.taskId,
        sessionId: `session-t01-knowledge-decoder-005-${suffix}`,
        agentSource: "codex" as const,
      },
      snapshotId: devSnapshot.snapshotId,
      workspace: ujsonTask.workspace,
      language: "zh" as const,
      difficulty: "hard" as const,
      contextMessages: [...sharedMessages, delta],
      query,
      visibleAssetSetSha256: visibleSet.sha256,
    });
  }
  const positiveCase = publicCase("T01-KNOWLEDGE-DECODER-005-P", "p", positiveDelta);
  const negativeCase = publicCase("T01-KNOWLEDGE-DECODER-005-N", "n", negativeDelta);
  contract.publicCases = upsertById(contract.publicCases, (item) => item.caseId, [positiveCase, negativeCase]);

  const positiveGold = withHash({
    needTdaiTool: true,
    family: "knowledge" as const,
    allowedFirstActions: [{
      tool: "knowledge_tools_list",
      endpoint: "/tools/list",
      argumentRules: {
        requiredFields: ["knowledge_id"],
        exactValues: { knowledge_id: "cg-t01ujs01" },
      },
    }],
    expectedFollowupActions: [],
    expectedKnowledgeCalls: [{
      toolName: "callers",
      paramRules: {
        requiredFields: ["symbol"],
        exactValues: { symbol: "JSON_DecodeObject" },
      },
    }],
    allowedSequences: [["knowledge_tools_list", "knowledge_tools_call"]],
    forbiddenTools: ["tdai_conversation_search", "tdai_memory_search", "skill_search", "skill_view"],
    maxTdaiCalls: 2,
    targetAssetIds: ["cg-t01ujs01"],
    informationGap: "The task asks for a complete cross-file caller relation in the pinned ujson tree; current context has only a local text hit and the other two fixed Knowledge resources do not match this workspace.",
    stopAfter: "knowledge_tools_call callers(JSON_DecodeObject) returns the frozen direct caller and source location from cg-t01ujs01.",
    evidenceRefs: ["source-t01-knowledge-ujson-codegraph", "source-t01-current-ujson-impact", "source-t01-pair-005"],
    ablationEvidence: "Removing cg-t01ujs01 leaves no frozen, workspace-matched relationship index that can establish the complete direct-caller set.",
  });
  const negativeGold = withHash({
    needTdaiTool: false,
    family: null,
    allowedFirstActions: [],
    expectedFollowupActions: [],
    expectedKnowledgeCalls: [],
    allowedSequences: [],
    forbiddenTools: [],
    maxTdaiCalls: 0,
    targetAssetIds: [],
    evidenceRefs: ["source-t01-current-ujson-impact", "source-t01-pair-005"],
    ablationEvidence: "Not applicable: this counterfactual is intentionally self-contained.",
    noToolEvidence: "The complete direct-caller relation, source location, and Python method registration are already present in current context; visible Knowledge resources remain distractors.",
  });
  const positiveAnnotation: PrivateCaseAnnotation = withHash({
    caseId: positiveCase.caseId,
    sourceEvidenceIds: ["source-t01-knowledge-ujson-codegraph", "source-t01-current-ujson-impact", "source-t01-pair-005"],
    pairId,
    pairRole: "positive" as const,
    gold: positiveGold,
    annotationReason: "The workspace-matched ujson graph is the sole fixed resource that can close the requested cross-file caller gap through list then callers.",
  });
  const negativeAnnotation: PrivateCaseAnnotation = withHash({
    caseId: negativeCase.caseId,
    sourceEvidenceIds: ["source-t01-current-ujson-impact", "source-t01-pair-005"],
    pairId,
    pairRole: "negative" as const,
    gold: negativeGold,
    annotationReason: "The registered delta supplies the complete requested relation in current context, so every TDAI call is unnecessary.",
  });
  contract.privateAnnotations = upsertById(
    contract.privateAnnotations,
    (item) => item.caseId,
    [positiveAnnotation, negativeAnnotation],
  );
  contract.pairs = upsertById(contract.pairs, (item) => item.pairId, [withHash({
    pairId,
    positiveCaseId: positiveCase.caseId,
    negativeCaseId: negativeCase.caseId,
    counterfactualKind: "answer_in_current_context" as const,
    controlledDeltaSha256,
    currentEvidenceRefs: ["source-t01-current-ujson-impact", "source-t01-pair-005"],
  })]);

  contract.world.sourceEvidenceIds = contract.sourceEvidence.map((item) => item.sourceId);
  contract.world.contentHash = canonicalSha256(withoutContentHash(contract.world));
  devSnapshot.sourcePackSha256 = canonicalSha256(contract.sourceEvidence);
  devSnapshot.contentHash = canonicalSha256(withoutContentHash(devSnapshot));

  await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  await writeFile(resolve(root, "registry/assets/memory/T01.json"), `${JSON.stringify({
    schema_version: "task1.formal_memory_assets.v1",
    team_id: TEAM_ID,
    l0_conversations: contract.assets.l0Conversations.filter((item) => item.ownerAgentId === OWNER_AGENT_ID),
    l1_memories: contract.assets.l1Memories.filter((item) => item.ownerAgentId === OWNER_AGENT_ID),
    l2_scenes: contract.assets.l2Scenes.filter((item) => item.ownerAgentId === OWNER_AGENT_ID),
    l3_profiles: contract.assets.l3Profiles.filter((item) => item.ownerAgentId === OWNER_AGENT_ID),
  }, null, 2)}\n`, "utf8");
  await writeFile(resolve(root, "registry/assets/knowledge/T01.json"), `${JSON.stringify({
    schema_version: "task1.formal_knowledge_assets.v1",
    team_id: TEAM_ID,
    knowledge: contract.assets.knowledge,
  }, null, 2)}\n`, "utf8");
  const annotationsByCase = new Map(contract.privateAnnotations.map((item) => [item.caseId, item]));
  await writeFile(resolve(root, "registry/cases/dev.private.jsonl"), `${contract.publicCases
    .filter((item) => item.identity.teamId === TEAM_ID)
    .sort((left, right) => left.caseId.localeCompare(right.caseId))
    .map((item) => JSON.stringify({ publicCase: item, privateAnnotation: annotationsByCase.get(item.caseId) }))
    .join("\n")}\n`, "utf8");

  const provenancePath = resolve(root, "provenance/T01.json");
  const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
  provenance.stage = "DS02_pilot";
  provenance.ds02_pilot = {
    generated_at: GENERATED_AT,
    added_l0: addedL0.map((item, index) => ({
      formal_asset_id: item.asset.assetId,
      source_task_id: l0Draft.sessions[index].source.instance_id,
      source_message_count: l0Draft.sessions[index].messages.length,
      formal_message_count: item.asset.messages.length,
      retained_source_indexes: item.retainedSourceIndexes,
      disposition: "approved_l0_distractor_only",
    })),
    knowledge_fixture_sha256: fixtureSha,
    knowledge_snapshot_sha256: {
      "cg-t01ujs01": ujsonIndexSha,
      "cg-t01mypy1": mypyIndexSha,
      "wiki-t01rel01": wikiSnapshotSha,
    },
    pilot_pair_id: pairId,
    controlled_delta_sha256: controlledDeltaSha256,
  };
  provenance.source_evidence = contract.sourceEvidence;
  provenance.contract_sha256 = canonicalSha256(contract);
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  const report = {
    schema_version: "task1.ds02_pilot_authoring.v1",
    generated_at: GENERATED_AT,
    contract_sha256: canonicalSha256(contract),
    fixture_sha256: fixtureSha,
    t01_l0_count: contract.assets.l0Conversations.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).length,
    t01_skill_count: contract.assets.skills.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).length,
    t01_knowledge_count: contract.assets.knowledge.filter((item) => item.ownerAgentId === OWNER_AGENT_ID).length,
    t01_case_count: contract.publicCases.filter((item) => item.identity.teamId === TEAM_ID).length,
    t01_pair_count: contract.pairs.filter((item) => item.pairId.startsWith("T01-")).length,
    pilot_pairs: ["T01-PAIR-004", "T01-PAIR-002", pairId],
    model_runs: 0,
    luna_batches: 0,
  };
  await writeFile(resolve(root, "reports/DS02-PILOT-AUTHORING.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

await main();
