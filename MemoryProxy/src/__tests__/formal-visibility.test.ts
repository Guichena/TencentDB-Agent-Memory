import { describe, expect, it } from "vitest";
import { resolveVisibleSnapshot } from "../../eval/tool-prompt-bench/worlds/formal-visibility.js";
import type { FormalWorldContract } from "../../eval/tool-prompt-bench/worlds/formal-schema.js";

function contract(): FormalWorldContract {
  return {
    world: { spaceId: "space-w01" }, teams: [{ teamId: "team-a" }, { teamId: "team-b" }],
    businessAgents: [
      { agentId: "a-current", teamId: "team-a", importedMemoryAgentIds: ["a-import-1", "a-import-2"], boundSkillIds: ["skill-a-owned"], fixedKnowledgeIds: ["knowledge-a-graph"] },
      { agentId: "a-import-1", teamId: "team-a", importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [] },
      { agentId: "a-import-2", teamId: "team-a", importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [] },
      { agentId: "b-owner", teamId: "team-b", importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: [] },
    ],
    tasks: [
      { taskId: "task-a", teamId: "team-a", eligibleAgentIds: ["a-current"] },
      { taskId: "task-b", teamId: "team-b", eligibleAgentIds: ["b-owner"] },
    ],
    assets: {
      l0Conversations: [{ assetId: "l0-self", ownerAgentId: "a-current" }, { assetId: "l0-team-b", ownerAgentId: "b-owner" }],
      l1Memories: [{ assetId: "l1-import-1", ownerAgentId: "a-import-1" }, { assetId: "l1-import-2", ownerAgentId: "a-import-2" }, { assetId: "l1-team-b", ownerAgentId: "b-owner" }],
      l2Scenes: [{ assetId: "l2-self", ownerAgentId: "a-current" }],
      l3Profiles: [{ assetId: "l3-self", ownerAgentId: "a-current" }],
      skills: [
        { assetId: "skill-a-private", ownerAgentId: "a-current", visibility: "private" },
        { assetId: "skill-a-owned", ownerAgentId: "a-current", visibility: "team" },
        { assetId: "skill-a-team", ownerAgentId: "a-import-2", visibility: "team" },
        { assetId: "skill-a-import-private", ownerAgentId: "a-import-1", visibility: "private" },
        { assetId: "skill-b", ownerAgentId: "b-owner", visibility: "team" },
      ],
      knowledge: [
        { assetId: "knowledge-a-graph", ownerAgentId: "a-current", bindings: [{ agentId: "a-current", visibility: "fixed" }] },
        { assetId: "knowledge-a-not-fixed", ownerAgentId: "a-current", bindings: [{ agentId: "a-current", visibility: "fixed" }] },
        { assetId: "knowledge-b", ownerAgentId: "b-owner", bindings: [{ agentId: "a-current", visibility: "fixed" }] },
      ],
    },
  } as unknown as FormalWorldContract;
}

const selection = { spaceId: "space-w01", teamId: "team-a", userId: "user-a", agentId: "a-current", taskId: "task-a" };

describe("Formal V2 visibility", () => {
  it("includes only self plus at most two imported same-Team Memory owners", () => {
    const resolved = resolveVisibleSnapshot(contract(), selection);
    expect(resolved.memoryOwnerAgentIds).toEqual(["a-current", "a-import-1", "a-import-2"]);
    expect(resolved.memories.map((asset) => asset.assetId)).toEqual(["l0-self", "l1-import-1", "l1-import-2", "l2-self", "l3-self"]);
  });

  it("uses Team-visible plus current-owner Skills for search while freezing only own listing", () => {
    const resolved = resolveVisibleSnapshot(contract(), selection);
    expect(resolved.listedSkills.map((asset) => asset.assetId)).toEqual(["skill-a-owned"]);
    expect(resolved.teamVisibleSkills.map((asset) => asset.assetId)).toEqual(["skill-a-owned", "skill-a-team"]);
    expect(resolved.currentAgentOwnSkills.map((asset) => asset.assetId)).toEqual(["skill-a-owned", "skill-a-private"]);
    expect(resolved.teamSearchSkills.map((asset) => asset.assetId)).toEqual(["skill-a-owned", "skill-a-private", "skill-a-team"]);
    expect(resolved.knowledge.map((asset) => asset.assetId)).toEqual(["knowledge-a-graph"]);
    expect(JSON.stringify(resolved)).not.toContain("team-b");
  });

  it("fails closed for cross-Team imports and invalid task selection", () => {
    const imported = contract();
    imported.businessAgents[0]!.importedMemoryAgentIds = ["b-owner"];
    expect(() => resolveVisibleSnapshot(imported, selection)).toThrow(/not in selected Team/);
    const tooMany = contract();
    tooMany.businessAgents[0]!.importedMemoryAgentIds = ["a-import-1", "a-import-2", "b-owner"];
    expect(() => resolveVisibleSnapshot(tooMany, selection)).toThrow(/at most two/);
    expect(() => resolveVisibleSnapshot(contract(), { ...selection, taskId: "task-b" })).toThrow(/not eligible/);
  });
});
