import { describe, expect, it } from "vitest";
import {
  assertFormalWorldContract,
  toProviderVisibleCase,
  validateFormalWorldContract,
  type FormalWorldContract,
  type PublicCaseInput,
} from "../../eval/tool-prompt-bench/worlds/formal-schema.js";
import {
  compileFormalCaseInput,
  compileFormalSplitInputs,
  hashVisibleAssetSet,
} from "../../eval/tool-prompt-bench/worlds/formal-compile.js";

const HASH = "a".repeat(64);
const COMMIT = "b".repeat(40);
const TIME = "2026-08-01T00:00:00.000Z";

function publicCase(caseId: string, agentId = "agent-a", taskId = "task-a"): PublicCaseInput {
  return {
    caseId,
    identity: { spaceId: "space-1", teamId: "team-a", userId: "user-a", agentId, taskId, sessionId: `${caseId}-session`, agentSource: "codex" },
    snapshotId: "snapshot-dev",
    workspace: {
      workspaceId: "workspace-a", repoSlug: "example/a", repoUrl: "https://github.com/example/a",
      baseCommit: COMMIT, sourceRepoLicense: "MIT", treeSha256: HASH, fileManifestSha256: HASH,
      state: "clean", contentHash: HASH,
    },
    language: "en",
    difficulty: "medium",
    contextMessages: [{ role: "user", content: "Please continue the established workflow." }],
    query: "Which established workflow applies here?",
    visibleAssetSetSha256: HASH,
    contentHash: HASH,
  };
}

function contract(): FormalWorldContract {
  const positive = publicCase("case-positive");
  const negative = publicCase("case-negative");
  const hidden = publicCase("case-hidden", "agent-b", "task-b");
  hidden.identity.teamId = "team-b";
  hidden.identity.userId = "user-b";
  hidden.snapshotId = "snapshot-hidden";
  hidden.workspace = {
    ...hidden.workspace,
    workspaceId: "workspace-b",
    repoSlug: "example/b",
    repoUrl: "https://github.com/example/b",
  };
  return {
    world: {
      worldId: "world-1", spaceId: "space-1", status: "draft", worldAsOf: TIME,
      teamIds: ["team-a", "team-b"], sourceEvidenceIds: ["source-1"],
      snapshotIds: { dev: "snapshot-dev", hidden_test: "snapshot-hidden" },
      leakageGroup: "repo-family/example", runtimePolicy: {
        allowLlmWrite: false, extraction: { enabled: false, extractors: [] }, assetReflection: false, writeL0: false, archiveWriteBack: false,
      }, contentHash: HASH,
    },
    sourceEvidence: [
      { sourceId: "source-1", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-source-1", trajectoryId: "trajectory-1", role: "history", origin: "synthetic_agent_replay", sourceTaskTime: "2026-07-01T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-02T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "trajectory-1/messages", evidenceSha256: HASH, transform: "redacted_replay", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-2", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-source-2", trajectoryId: "trajectory-2", role: "history", origin: "synthetic_agent_replay", sourceTaskTime: "2026-07-02T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-03T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "trajectory-2/messages", evidenceSha256: HASH, transform: "redacted_replay", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-l1", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-source-1", trajectoryId: "trajectory-1", role: "history", origin: "synthetic_agent_replay", sourceTaskTime: "2026-07-01T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-02T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "trajectory-1/messages/message-a", evidenceSha256: HASH, transform: "atomic_fact_extraction", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-l2", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-source-1", trajectoryId: "trajectory-1", role: "history", origin: "synthetic_agent_replay", sourceTaskTime: "2026-07-01T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-02T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "history-a+history-b", evidenceSha256: HASH, transform: "multi_session_scene_synthesis", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-profile", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-source-1", trajectoryId: "trajectory-1", role: "history", origin: "synthetic_agent_replay", sourceTaskTime: "2026-07-01T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-02T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "history-a+history-b/profile", evidenceSha256: HASH, transform: "stable_profile_derivation", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-skill", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-source-1", trajectoryId: "trajectory-1", role: "history", origin: "synthetic_agent_replay", sourceTaskTime: "2026-07-01T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-02T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "history-a+history-b/procedure", evidenceSha256: HASH, transform: "skill_procedure_derivation", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-anchor", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-current-1", role: "current_anchor", origin: "repo_code", sourceTaskTime: "2026-07-10T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-10T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "task-current-1", evidenceSha256: HASH, transform: "current_task_anchor", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
      { sourceId: "source-knowledge", dataset: "repo", datasetRevision: COMMIT, datasetArtifactSha256: HASH, sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT", sourceTaskId: "task-current-1", role: "repo_context", origin: "repo_code", sourceTaskTime: "2026-07-10T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-10T00:00:00.000Z", worldAsOf: TIME, evidenceLocator: "repo/code-graph", evidenceSha256: HASH, transform: "code_graph_build", transformVersion: "v1", transformInputSha256: HASH, piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH },
    ],
    teams: [
      { teamId: "team-a", worldId: "world-1", split: "dev", name: "Team A", businessAgentIds: ["agent-a"], taskIds: ["task-a"], sourceEvidenceIds: ["source-1"], contentHash: HASH },
      { teamId: "team-b", worldId: "world-1", split: "hidden_test", name: "Team B", businessAgentIds: ["agent-b"], taskIds: ["task-b"], sourceEvidenceIds: ["source-1"], contentHash: HASH },
    ],
    businessAgents: [
      { agentId: "agent-a", teamId: "team-a", name: "Agent A", agentDetail: { description: "Maintains repo A", prompt: "Use relevant assets only.", contentHash: HASH }, importedMemoryAgentIds: [], boundSkillIds: ["skill-a"], fixedKnowledgeIds: ["knowledge-a"], sourceEvidenceIds: ["source-1"], contentHash: HASH },
      { agentId: "agent-b", teamId: "team-b", name: "Agent B", agentDetail: { description: "Maintains repo B", prompt: "Use relevant assets only.", contentHash: HASH }, importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: ["source-1"], contentHash: HASH },
    ],
    tasks: [
      {
        taskId: "task-a", teamId: "team-a", title: "Task A", description: "Repair component A", goal: "Keep tests green", eligibleAgentIds: ["agent-a"],
        projectRef: { projectRefId: "project-a", repoSlug: "example/a", repoUrl: "https://github.com/example/a", pinnedCommit: COMMIT, sourceEvidenceIds: ["source-anchor"], contentHash: HASH },
        workspace: positive.workspace, sourceEvidenceIds: ["source-anchor"], contentHash: HASH,
      },
      {
        taskId: "task-b", teamId: "team-b", title: "Task B", description: "Repair component B", goal: "Keep tests green", eligibleAgentIds: ["agent-b"],
        projectRef: { projectRefId: "project-b", repoSlug: "example/b", repoUrl: "https://github.com/example/b", pinnedCommit: COMMIT, sourceEvidenceIds: ["source-anchor"], contentHash: HASH },
        workspace: { ...positive.workspace, workspaceId: "workspace-b", repoSlug: "example/b", repoUrl: "https://github.com/example/b" }, sourceEvidenceIds: ["source-anchor"], contentHash: HASH,
      },
    ],
    assets: {
      l0Conversations: [
        { assetId: "l0-a", ownerAgentId: "agent-a", sessionId: "history-a", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH, messages: [{ messageId: "message-a", role: "assistant", content: "Use the compatibility workflow.", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }] },
        { assetId: "l0-a-support", ownerAgentId: "agent-a", sessionId: "history-b", sourceEvidenceIds: ["source-2"], observedAt: "2026-07-04T00:00:00.000Z", contentHash: HASH, messages: [{ messageId: "message-a-support", role: "assistant", content: "Verify the compatibility workflow.", sourceEvidenceIds: ["source-2"], observedAt: "2026-07-04T00:00:00.000Z", contentHash: HASH }] },
      ],
      l1Memories: [{ assetId: "l1-a", ownerAgentId: "agent-a", type: "decision", content: "Use compatibility workflow.", status: "active", validFrom: "2026-07-03T00:00:00.000Z", supportingMessageIds: ["message-a"], codeEvidenceLocators: ["src/compat.ts#workflow"], testEvidenceLocators: ["tests/compat.test.ts#workflow"], sourceEvidenceIds: ["source-l1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      l2Scenes: [{ assetId: "l2-a", ownerAgentId: "agent-a", path: "scenes/compat.md", summary: "Compatibility work", content: "Historical compatibility work", injected: false, supportingSessionIds: ["history-a", "history-b"], sourceEvidenceIds: ["source-l2"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      l3Profiles: [{ assetId: "l3-a", ownerAgentId: "agent-a", content: "Run targeted tests after changes.", stability: "agent", sourceEvidenceIds: ["source-profile"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      skills: [{ assetId: "skill-a", ownerAgentId: "agent-a", name: "compat-workflow", version: "1.0.0", description: "Compatibility procedure", useWhen: "A compatibility migration is needed", doNotUseWhen: "The answer is already local", repoCommit: COMMIT, visibility: "private", provenanceMode: "history_derived", supportingSessionIds: ["history-a", "history-b"], codeEvidenceLocators: ["src/compat.ts#workflow"], testEvidenceLocators: ["tests/compat.test.ts#workflow"], manifest: [{ path: "SKILL.md", sha256: HASH }], sourceEvidenceIds: ["source-skill"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      knowledge: [{ assetId: "knowledge-a", ownerAgentId: "agent-a", type: "code_graph", name: "Repo A graph", repoUrl: "https://github.com/example/a", repoCommit: COMMIT, indexVersion: "graph-v1", snapshotSha256: HASH, bindings: [{ agentId: "agent-a", visibility: "fixed" }], sourceEvidenceIds: ["source-knowledge"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
    },
    publicCases: [positive, negative, hidden],
    privateAnnotations: [
      { caseId: "case-positive", sourceEvidenceIds: ["source-1"], pairId: "pair-1", pairRole: "positive", annotationReason: "History is necessary.", contentHash: HASH, gold: { needTdaiTool: true, family: "memory", allowedFirstActions: [{ tool: "tdai_memory_search", endpoint: "/memory-bridge/v3/atomic/search", argumentRules: { requiredFields: ["query"] } }], allowedSequences: [["tdai_memory_search"]], forbiddenTools: [], maxTdaiCalls: 1, targetAssetIds: ["l1-a"], informationGap: "The established workflow is absent from the current context.", stopAfter: "The memory search returns l1-a.", evidenceRefs: ["source-1"], ablationEvidence: "Removing l1-a removes the final decision.", contentHash: HASH } },
      { caseId: "case-negative", sourceEvidenceIds: ["source-1"], pairId: "pair-1", pairRole: "negative", annotationReason: "Current context includes the answer.", contentHash: HASH, gold: { needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs: ["source-1"], ablationEvidence: "Not applicable to a no-tool case.", noToolEvidence: "The current message states the workflow.", contentHash: HASH } },
      { caseId: "case-hidden", sourceEvidenceIds: ["source-1"], annotationReason: "The hidden request is self-contained.", contentHash: HASH, gold: { needTdaiTool: false, family: null, allowedFirstActions: [], expectedFollowupActions: [], expectedKnowledgeCalls: [], allowedSequences: [], forbiddenTools: [], maxTdaiCalls: 0, targetAssetIds: [], evidenceRefs: ["source-1"], ablationEvidence: "Not applicable to a no-tool case.", noToolEvidence: "The current message is self-contained.", contentHash: HASH } },
    ],
    pairs: [{ pairId: "pair-1", positiveCaseId: "case-positive", negativeCaseId: "case-negative", counterfactualKind: "answer_in_current_context", controlledDeltaSha256: HASH, currentEvidenceRefs: ["source-1"], contentHash: HASH }],
    snapshots: [
      { snapshotId: "snapshot-dev", worldId: "world-1", split: "dev", sourcePackSha256: HASH, visibleAssetSets: [{ teamId: "team-a", userId: "user-a", agentId: "agent-a", assetIds: ["l0-a", "l0-a-support", "l1-a", "l2-a", "l3-a", "skill-a", "knowledge-a"], sha256: HASH }], workspaceManifestSha256: HASH, runtimePolicySha256: HASH, cacheResetRecipeSha256: HASH, contentHash: HASH },
      { snapshotId: "snapshot-hidden", worldId: "world-1", split: "hidden_test", sourcePackSha256: HASH, visibleAssetSets: [{ teamId: "team-b", userId: "user-b", agentId: "agent-b", assetIds: [], sha256: HASH }], workspaceManifestSha256: HASH, runtimePolicySha256: HASH, cacheResetRecipeSha256: HASH, contentHash: HASH },
    ],
    runRecords: [{ runId: "run-1", caseId: "case-positive", snapshotId: "snapshot-dev", identity: positive.identity, visibleAssetSetSha256: HASH, runtimeConfigSha256: HASH, injectionSha256: HASH, staticToolDescriptionSha256: HASH, attemptTraceSha256: HASH, cacheResetVerified: true, recordHash: HASH }],
  };
}

describe("Formal V2 world contract", () => {
  it("accepts a fully sourced, Team-split formal contract", () => {
    const input = contract();
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });
    expect(() => assertFormalWorldContract(input)).not.toThrow();
  });

  it("expresses ten Teams in one Space and compiles Dev/Hidden independently", () => {
    const input = contract();
    for (let index = 3; index <= 10; index += 1) {
      const teamId = `team-${index}`;
      const agentId = `agent-${index}`;
      const taskId = `task-${index}`;
      const split = index <= 4 ? "dev" : "hidden_test";
      input.world.teamIds.push(teamId);
      input.teams.push({
        teamId, worldId: input.world.worldId, split, name: `Team ${index}`,
        businessAgentIds: [agentId], taskIds: [taskId], sourceEvidenceIds: ["source-1"], contentHash: HASH,
      });
      input.businessAgents.push({
        agentId, teamId, name: `Agent ${index}`,
        agentDetail: { description: `Maintains Team ${index}`, prompt: "Use relevant assets only.", contentHash: HASH },
        importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: ["source-1"], contentHash: HASH,
      });
      input.tasks.push({
        taskId, teamId, title: `Task ${index}`, description: `Repair component ${index}`, goal: "Keep tests green", eligibleAgentIds: [agentId],
        projectRef: { projectRefId: `project-${index}`, repoSlug: `example/${index}`, repoUrl: `https://github.com/example/${index}`, pinnedCommit: COMMIT, sourceEvidenceIds: ["source-anchor"], contentHash: HASH },
        workspace: { workspaceId: `workspace-${index}`, repoSlug: `example/${index}`, repoUrl: `https://github.com/example/${index}`, baseCommit: COMMIT, sourceRepoLicense: "MIT", treeSha256: HASH, fileManifestSha256: HASH, state: "clean", contentHash: HASH },
        sourceEvidenceIds: ["source-anchor"], contentHash: HASH,
      });
      input.snapshots.find((snapshot) => snapshot.split === split)!.visibleAssetSets.push({
        teamId, userId: `user-${index}`, agentId, assetIds: [], sha256: HASH,
      });
    }

    for (const snapshot of input.snapshots) {
      for (const set of snapshot.visibleAssetSets) set.sha256 = hashVisibleAssetSet(set);
    }
    for (const item of input.publicCases) {
      const snapshot = input.snapshots.find((candidate) => candidate.snapshotId === item.snapshotId)!;
      item.visibleAssetSetSha256 = snapshot.visibleAssetSets.find((set) => set.agentId === item.identity.agentId)!.sha256;
    }

    expect(input.world.spaceId).toBe("space-1");
    expect(input.teams).toHaveLength(10);
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });
    expect(compileFormalSplitInputs(input, "dev").map((item) => item.caseId)).toEqual(["case-negative", "case-positive"]);
    expect(compileFormalSplitInputs(input, "hidden_test").map((item) => item.caseId)).toEqual(["case-hidden"]);
  });

  it("rejects source gaps, future evidence, and invalid hashes", () => {
    const input = contract();
    input.sourceEvidence[0].sourceRepoCommit = "short";
    input.sourceEvidence[0].sourceTaskTime = "2026-09-01T00:00:00.000Z";
    input.sourceEvidence[0].evidenceSha256 = "not-a-hash";
    input.sourceEvidence[0].transform = "verbatim_copy" as never;
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/sourceRepoCommit/);
    expect(errors).toMatch(/sourceTaskTime must be before worldAsOf/);
    expect(errors).toMatch(/evidenceSha256/);
    expect(errors).toMatch(/not a formal TDAI transform/);
  });

  it("requires the Team registry to match the World and keeps imported Memory in-Team", () => {
    const input = contract();
    input.teams.pop();
    input.businessAgents[0].importedMemoryAgentIds = ["agent-b", "agent-x", "agent-y"];
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/teams must exactly match world.teamIds/);
    expect(errors).toMatch(/imports more than two/);
    expect(errors).toMatch(/imports cross-team memory/);
  });

  it("rejects current-anchor history assets and non-independent procedure evidence", () => {
    const input = contract();
    input.assets.l1Memories[0].sourceEvidenceIds = ["source-anchor"];
    input.assets.l1Memories[0].supportingMessageIds = ["missing-message"];
    input.assets.l1Memories[0].testEvidenceLocators = [];
    input.sourceEvidence.find((source) => source.sourceId === "source-2")!.sourceTaskId = "task-source-1";
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/L1 memory l1-a must use history atomic_fact_extraction evidence/);
    expect(errors).toMatch(/references unknown message missing-message/);
    expect(errors).toMatch(/lacks test evidence locator/);
    expect(errors).toMatch(/L2 scene l2-a needs two independent history source tasks/);
    expect(errors).toMatch(/skill skill-a needs two independent history source tasks/);
  });

  it("accepts a frozen open-source Skill without fabricated history sessions", () => {
    const input = contract();
    const source = input.sourceEvidence.find((item) => item.sourceId === "source-skill")!;
    source.role = "skill_source";
    source.origin = "repo_document";
    source.transform = "skill_package_import";
    const skill = input.assets.skills[0];
    skill.provenanceMode = "imported_open_source";
    skill.supportingSessionIds = [];
    skill.codeEvidenceLocators = [];
    skill.testEvidenceLocators = [];
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });
  });

  it("accepts a verifier-grounded authored Skill and rejects fake imported history", () => {
    const input = contract();
    const source = input.sourceEvidence.find((item) => item.sourceId === "source-skill")!;
    source.role = "skill_source";
    source.origin = "evidence_grounded_synthesis";
    source.transform = "grounded_skill_authoring";
    const skill = input.assets.skills[0];
    skill.provenanceMode = "evidence_grounded_authored";
    skill.supportingSessionIds = [];
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });

    skill.provenanceMode = "imported_open_source";
    skill.supportingSessionIds = ["history-a"];
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/must use skill_source skill_package_import evidence/);
    expect(errors).toMatch(/must not invent supporting sessions for imported_open_source/);
  });

  it("rejects source transforms that cross runtime roles", () => {
    const input = contract();
    input.sourceEvidence.find((source) => source.sourceId === "source-anchor")!.transform = "atomic_fact_extraction";
    input.sourceEvidence.find((source) => source.sourceId === "source-knowledge")!.transform = "paired_counterfactual";
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/source source-anchor.transform atomic_fact_extraction is incompatible with role current_anchor/);
    expect(errors).toMatch(/source source-knowledge.transform paired_counterfactual is incompatible with role repo_context/);
  });

  it("requires strict source time and current-anchor task evidence", () => {
    const input = contract();
    input.sourceEvidence[0].sourceTaskTime = TIME;
    input.tasks[0].sourceEvidenceIds = ["source-1"];
    input.tasks[0].projectRef.sourceEvidenceIds = ["source-1"];
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/sourceTaskTime must be before worldAsOf/);
    expect(errors).toMatch(/task task-a lacks current_anchor evidence/);
    expect(errors).toMatch(/task task-a.projectRef lacks current_anchor evidence/);
  });

  it("rejects timestamps whose timezone is implicit", () => {
    const input = contract();
    input.sourceEvidence[0].trajectoryGeneratedAt = "2026-07-02T00:00:00";
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/source source-1.trajectoryGeneratedAt must be an ISO timestamp with timezone/);
  });

  it("rejects injected private fields and emits only the provider allowlist", () => {
    const input = publicCase("case-public") as PublicCaseInput & { gold?: unknown; pairRole?: unknown; sourceEvidenceIds?: unknown };
    input.gold = { route: "memory" };
    input.pairRole = "positive";
    input.sourceEvidenceIds = ["source-1"];
    expect(() => toProviderVisibleCase(input)).toThrow(/private and must not be provider-visible/);

    const visible = toProviderVisibleCase(publicCase("case-safe"));
    expect(visible).toEqual({
      caseId: "case-safe",
      language: "en",
      contextMessages: [{ role: "user", content: "Please continue the established workflow." }],
      query: "Which established workflow applies here?",
    });
    expect(visible).not.toHaveProperty("workspace");
    expect(visible).not.toHaveProperty("identity");
    expect(visible).not.toHaveProperty("snapshotId");
  });

  it("rejects archive write-back in the frozen runtime policy", () => {
    const input = contract();
    (input.world.runtimePolicy as unknown as { archiveWriteBack: boolean }).archiveWriteBack = true;
    expect(validateFormalWorldContract(input).errors.join("\n")).toMatch(/archive write-back/);
  });

  it("compiles identity, workspace, and visible assets outside the provider allowlist", () => {
    const input = contract();
    const set = input.snapshots[0].visibleAssetSets[0];
    set.sha256 = hashVisibleAssetSet(set);
    input.publicCases.filter((item) => item.snapshotId === "snapshot-dev").forEach((item) => { item.visibleAssetSetSha256 = set.sha256; });
    const compiled = compileFormalCaseInput(input, "case-positive");
    expect(compiled.sessionInit).toEqual({
      spaceId: "space-1",
      registration: {
        team_id: "team-a", user_id: "user-a", agent_id: "agent-a",
        task_id: "task-a", session_id: "case-positive-session",
      },
      agentSource: "codex",
    });
    expect(compiled.provider).toEqual({
      caseId: "case-positive", language: "en",
      contextMessages: [{ role: "user", content: "Please continue the established workflow." }],
      query: "Which established workflow applies here?",
    });
    expect(compiled.provider).not.toHaveProperty("identity");
    expect(compiled.provider).not.toHaveProperty("workspace");
    expect(compiled.provider).not.toHaveProperty("gold");
  });

  it("uses Skill visibility rather than an agent-searchable binding", () => {
    const input = contract();
    input.businessAgents.push({
      agentId: "agent-a2", teamId: "team-a", name: "Agent A2",
      agentDetail: { description: "Teammate", prompt: "Use relevant assets only.", contentHash: HASH },
      importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: ["source-1"], contentHash: HASH,
    });
    input.teams[0].businessAgentIds.push("agent-a2");
    input.snapshots[0].visibleAssetSets.push({ teamId: "team-a", userId: "user-a", agentId: "agent-a2", assetIds: ["skill-a"], sha256: HASH });

    expect(validateFormalWorldContract(input).errors.join("\n")).toMatch(/neither current-agent owned nor team-visible/);
    input.assets.skills[0].visibility = "team";
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });
  });

  it("rejects cross-team assets in a visible set and incomplete paired Gold", () => {
    const input = contract();
    input.snapshots[0].visibleAssetSets[0].assetIds.push("l0-b");
    input.assets.l0Conversations.push({
      assetId: "l0-b", ownerAgentId: "agent-b", sessionId: "history-b", sourceEvidenceIds: ["source-1"],
      observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH,
      messages: [{ messageId: "message-b", role: "assistant", content: "Other team only", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
    });
    input.privateAnnotations[0].gold.ablationEvidence = "";
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/crosses team boundary/);
    expect(errors).toMatch(/lacks family, action, sequence, asset, gap, stop point, or ablation evidence/);
  });
});
