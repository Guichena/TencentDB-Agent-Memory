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
  hashVisibleAssetSet,
} from "../../eval/tool-prompt-bench/worlds/formal-compile.js";

const HASH = "a".repeat(64);
const COMMIT = "b".repeat(40);
const TIME = "2026-08-01T00:00:00.000Z";

function publicCase(caseId: string, agentId = "agent-a", taskId = "task-a"): PublicCaseInput {
  return {
    caseId,
    identity: { spaceId: "space-1", teamId: "team-a", userId: "user-a", agentId, taskId, sessionId: `${caseId}-session`, agentSource: "codex" },
    snapshotId: "snapshot-1",
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
  return {
    world: {
      worldId: "world-1", spaceId: "space-1", split: "dev", status: "draft", worldAsOf: TIME,
      teamIds: ["team-a", "team-b"], sourceEvidenceIds: ["source-1"], snapshotId: "snapshot-1",
      leakageGroup: "repo-family/example", runtimePolicy: {
        allowLlmWrite: false, allowLlmExtract: false, assetReflection: false, writeL0: false, archiveWriteBack: false,
      }, contentHash: HASH,
    },
    sourceEvidence: [{
      sourceId: "source-1", dataset: "SWE-Gym", datasetRevision: "rev-1", datasetArtifactSha256: HASH,
      sourceRepoUrl: "https://github.com/example/a", sourceRepoCommit: COMMIT, sourceRepoLicense: "MIT",
      sourceTaskId: "task-source-1", trajectoryId: "trajectory-1", origin: "synthetic_agent_replay",
      sourceTaskTime: "2026-07-01T00:00:00.000Z", trajectoryGeneratedAt: "2026-07-02T00:00:00.000Z",
      worldAsOf: TIME, evidenceLocator: "trajectory-1/messages/4:0-60", evidenceSha256: HASH,
      transform: "redacted_replay", transformVersion: "v1", transformInputSha256: HASH,
      piiScan: "passed", reviewStatus: "reviewed", reviewedBy: "reviewer-1", contentHash: HASH,
    }],
    teams: [
      { teamId: "team-a", worldId: "world-1", name: "Team A", businessAgentIds: ["agent-a"], taskIds: ["task-a"], sourceEvidenceIds: ["source-1"], contentHash: HASH },
      { teamId: "team-b", worldId: "world-1", name: "Team B", businessAgentIds: ["agent-b"], taskIds: ["task-b"], sourceEvidenceIds: ["source-1"], contentHash: HASH },
    ],
    businessAgents: [
      { agentId: "agent-a", teamId: "team-a", name: "Agent A", agentDetail: { description: "Maintains repo A", prompt: "Use relevant assets only.", contentHash: HASH }, importedMemoryAgentIds: [], boundSkillIds: ["skill-a"], fixedKnowledgeIds: ["knowledge-a"], sourceEvidenceIds: ["source-1"], contentHash: HASH },
      { agentId: "agent-b", teamId: "team-b", name: "Agent B", agentDetail: { description: "Maintains repo B", prompt: "Use relevant assets only.", contentHash: HASH }, importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [], sourceEvidenceIds: ["source-1"], contentHash: HASH },
    ],
    tasks: [
      {
        taskId: "task-a", teamId: "team-a", title: "Task A", description: "Repair component A", goal: "Keep tests green", eligibleAgentIds: ["agent-a"],
        projectRef: { projectRefId: "project-a", repoSlug: "example/a", repoUrl: "https://github.com/example/a", pinnedCommit: COMMIT, sourceEvidenceIds: ["source-1"], contentHash: HASH },
        workspace: positive.workspace, sourceEvidenceIds: ["source-1"], contentHash: HASH,
      },
      {
        taskId: "task-b", teamId: "team-b", title: "Task B", description: "Repair component B", goal: "Keep tests green", eligibleAgentIds: ["agent-b"],
        projectRef: { projectRefId: "project-b", repoSlug: "example/b", repoUrl: "https://github.com/example/b", pinnedCommit: COMMIT, sourceEvidenceIds: ["source-1"], contentHash: HASH },
        workspace: { ...positive.workspace, workspaceId: "workspace-b", repoSlug: "example/b", repoUrl: "https://github.com/example/b" }, sourceEvidenceIds: ["source-1"], contentHash: HASH,
      },
    ],
    assets: {
      l0Conversations: [
        { assetId: "l0-a", ownerAgentId: "agent-a", sessionId: "history-a", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH, messages: [{ messageId: "message-a", role: "assistant", content: "Use the compatibility workflow.", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }] },
        { assetId: "l0-a-support", ownerAgentId: "agent-a", sessionId: "history-b", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-04T00:00:00.000Z", contentHash: HASH, messages: [{ messageId: "message-a-support", role: "assistant", content: "Verify the compatibility workflow.", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-04T00:00:00.000Z", contentHash: HASH }] },
      ],
      l1Memories: [{ assetId: "l1-a", ownerAgentId: "agent-a", type: "decision", content: "Use compatibility workflow.", status: "active", validFrom: "2026-07-03T00:00:00.000Z", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      l2Scenes: [{ assetId: "l2-a", ownerAgentId: "agent-a", path: "scenes/compat.md", summary: "Compatibility work", content: "Historical compatibility work", injected: false, supportingSessionIds: ["history-a", "history-b"], sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      l3Profiles: [{ assetId: "l3-a", ownerAgentId: "agent-a", content: "Run targeted tests after changes.", stability: "agent", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      skills: [{ assetId: "skill-a", ownerAgentId: "agent-a", name: "compat-workflow", version: "1.0.0", description: "Compatibility procedure", useWhen: "A compatibility migration is needed", doNotUseWhen: "The answer is already local", repoCommit: COMMIT, visibility: "private", manifest: [{ path: "SKILL.md", sha256: HASH }], sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
      knowledge: [{ assetId: "knowledge-a", ownerAgentId: "agent-a", type: "code_graph", name: "Repo A graph", repoUrl: "https://github.com/example/a", repoCommit: COMMIT, indexVersion: "graph-v1", snapshotSha256: HASH, bindings: [{ agentId: "agent-a", visibility: "fixed" }], sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
    },
    publicCases: [positive, negative],
    privateAnnotations: [
      { caseId: "case-positive", sourceEvidenceIds: ["source-1"], pairId: "pair-1", pairRole: "positive", annotationReason: "History is necessary.", contentHash: HASH, gold: { route: "memory", requiredSequences: [[{ family: "memory", operation: "tdai_memory_search", endpoint: "/memory-bridge/v3/atomic/search", requiredFields: ["query"] }]], allowedAlternativeSequences: [], forbiddenFamilies: ["skill", "knowledge"], maxAssetCalls: 1, goldAssetIds: ["l1-a"], evidenceRefs: ["source-1"], ablationEvidence: "Removing l1-a removes the final decision.", contentHash: HASH } },
      { caseId: "case-negative", sourceEvidenceIds: ["source-1"], pairId: "pair-1", pairRole: "negative", annotationReason: "Current context includes the answer.", contentHash: HASH, gold: { route: "none", requiredSequences: [], allowedAlternativeSequences: [], forbiddenFamilies: ["memory", "skill", "knowledge"], maxAssetCalls: 0, goldAssetIds: [], evidenceRefs: ["source-1"], ablationEvidence: "Not applicable to a no-tool case.", noToolEvidence: "The current message states the workflow.", contentHash: HASH } },
    ],
    pairs: [{ pairId: "pair-1", positiveCaseId: "case-positive", negativeCaseId: "case-negative", counterfactualKind: "answer_in_current_context", controlledDeltaSha256: HASH, currentEvidenceRefs: ["source-1"], contentHash: HASH }],
    snapshot: { snapshotId: "snapshot-1", worldId: "world-1", sourcePackSha256: HASH, visibleAssetSets: [{ teamId: "team-a", userId: "user-a", agentId: "agent-a", assetIds: ["l0-a", "l0-a-support", "l1-a", "l2-a", "l3-a", "skill-a", "knowledge-a"], sha256: HASH }, { teamId: "team-b", userId: "user-b", agentId: "agent-b", assetIds: [], sha256: HASH }], workspaceManifestSha256: HASH, runtimePolicySha256: HASH, cacheResetRecipeSha256: HASH, contentHash: HASH },
    runRecords: [{ runId: "run-1", caseId: "case-positive", snapshotId: "snapshot-1", identity: positive.identity, visibleAssetSetSha256: HASH, runtimeConfigSha256: HASH, injectionSha256: HASH, staticToolDescriptionSha256: HASH, attemptTraceSha256: HASH, cacheResetVerified: true, recordHash: HASH }],
  };
}

describe("Formal V2 world contract", () => {
  it("accepts a fully sourced, two-team, separated formal contract", () => {
    const input = contract();
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });
    expect(() => assertFormalWorldContract(input)).not.toThrow();
  });

  it("rejects source gaps, future evidence, and invalid hashes", () => {
    const input = contract();
    input.sourceEvidence[0].sourceRepoCommit = "short";
    input.sourceEvidence[0].sourceTaskTime = "2026-09-01T00:00:00.000Z";
    input.sourceEvidence[0].evidenceSha256 = "not-a-hash";
    input.sourceEvidence[0].transform = "verbatim_copy" as never;
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/sourceRepoCommit/);
    expect(errors).toMatch(/sourceTaskTime is after worldAsOf/);
    expect(errors).toMatch(/evidenceSha256/);
    expect(errors).toMatch(/not a formal TDAI transform/);
  });

  it("enforces exactly two teams and same-team imported memory", () => {
    const input = contract();
    input.teams.pop();
    input.businessAgents[0].importedMemoryAgentIds = ["agent-b", "agent-x", "agent-y"];
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/exactly two teams/);
    expect(errors).toMatch(/imports more than two/);
    expect(errors).toMatch(/imports cross-team memory/);
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
    const input = contract() as FormalWorldContract & { world: { runtimePolicy: { archiveWriteBack: boolean } } };
    input.world.runtimePolicy.archiveWriteBack = true;
    expect(validateFormalWorldContract(input as FormalWorldContract).errors.join("\n")).toMatch(/archive write-back/);
  });

  it("compiles identity, workspace, and visible assets outside the provider allowlist", () => {
    const input = contract();
    const set = input.snapshot.visibleAssetSets[0];
    set.sha256 = hashVisibleAssetSet(set);
    input.publicCases.forEach((item) => { item.visibleAssetSetSha256 = set.sha256; });
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
    input.snapshot.visibleAssetSets.push({ teamId: "team-a", userId: "user-a", agentId: "agent-a2", assetIds: ["skill-a"], sha256: HASH });

    expect(validateFormalWorldContract(input).errors.join("\n")).toMatch(/neither current-agent owned nor team-visible/);
    input.assets.skills[0].visibility = "team";
    expect(validateFormalWorldContract(input)).toEqual({ valid: true, errors: [] });
  });

  it("rejects cross-team assets in a visible set and incomplete paired Gold", () => {
    const input = contract();
    input.snapshot.visibleAssetSets[0].assetIds.push("l0-b");
    input.assets.l0Conversations.push({
      assetId: "l0-b", ownerAgentId: "agent-b", sessionId: "history-b", sourceEvidenceIds: ["source-1"],
      observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH,
      messages: [{ messageId: "message-b", role: "assistant", content: "Other team only", sourceEvidenceIds: ["source-1"], observedAt: "2026-07-03T00:00:00.000Z", contentHash: HASH }],
    });
    input.privateAnnotations[0].gold.ablationEvidence = "";
    const errors = validateFormalWorldContract(input).errors.join("\n");
    expect(errors).toMatch(/crosses team boundary/);
    expect(errors).toMatch(/lacks sequence, asset, or ablation evidence/);
  });
});
