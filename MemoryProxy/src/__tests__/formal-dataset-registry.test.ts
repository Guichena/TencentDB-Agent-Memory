import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateFormalWorldContract,
  type FormalWorldContract,
} from "../../eval/tool-prompt-bench/worlds/formal-schema.js";
import { compileFormalSplitInputs } from "../../eval/tool-prompt-bench/worlds/formal-compile.js";

const root = resolve(process.cwd(), "eval/tool-prompt-bench/formal-dataset");

describe("Task 1 DS00 identity registry", () => {
  it("freezes one Space with T01-T10 and Team-owned Dev/Hidden splits", () => {
    const space = JSON.parse(readFileSync(resolve(root, "registry/space.json"), "utf8")) as {
      space_id: string;
      team_ids: string[];
      snapshot_ids: { dev: string; hidden_test: string };
    };
    expect(space).toEqual(expect.objectContaining({
      space_id: "space-task1-engineering",
      team_ids: ["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10"],
      snapshot_ids: { dev: "snapshot-task1-dev-v1", hidden_test: "snapshot-task1-hidden-v1" },
    }));

    const files = readdirSync(resolve(root, "registry/teams")).sort();
    expect(files).toEqual(space.team_ids.map((teamId) => `${teamId}.json`));
    const teams = files.map((file) => JSON.parse(readFileSync(resolve(root, "registry/teams", file), "utf8")) as Record<string, unknown>);
    expect(teams.filter((team) => team.split === "dev").map((team) => team.team_id)).toEqual(["T01", "T02", "T03", "T04"]);
    expect(teams.filter((team) => team.split === "hidden_test").map((team) => team.team_id)).toEqual(["T05", "T06", "T07", "T08", "T09", "T10"]);
    for (const team of teams) {
      expect(team.space_id).toBe(space.space_id);
      expect(team.active_agent).toEqual(expect.objectContaining({ agent_id: `agent-task1-${String(team.team_id).toLowerCase()}-general` }));
      expect(team).not.toHaveProperty("assets");
      expect(team).not.toHaveProperty("cases");
    }
  });

  it("adds exactly the four thin construction entry points", () => {
    expect(readdirSync(resolve(root, "scripts")).sort()).toEqual([
      "compile-formal-dataset.ts",
      "inspect-formal-snapshot.ts",
      "restore-formal-snapshot.ts",
      "validate-formal-dataset.ts",
    ]);
  });
});

describe("Task 1 DS01 T01 migration", () => {
  it("migrates four pairs with source-grounded L0 and distinct listed/search Skill chains", () => {
    const contractText = readFileSync(resolve(root, "registry/contracts/formal-v1.json"), "utf8");
    const contract = JSON.parse(contractText) as FormalWorldContract;
    expect(validateFormalWorldContract(contract)).toEqual({ valid: true, errors: [] });
    expect(contract.world.spaceId).toBe("space-task1-engineering");
    expect(contract.teams).toHaveLength(10);
    expect(contract.publicCases.filter((item) => item.identity.teamId === "T01")).toHaveLength(8);
    expect(contract.pairs).toHaveLength(4);
    expect(compileFormalSplitInputs(contract, "dev")).toHaveLength(8);
    expect(compileFormalSplitInputs(contract, "hidden_test")).toHaveLength(0);

    expect(contract.assets.l0Conversations).toHaveLength(6);
    for (const session of contract.assets.l0Conversations) {
      expect(session.messages.length).toBeGreaterThanOrEqual(12);
      expect(session.messages.length).toBeLessThanOrEqual(40);
    }
    expect(contract.assets.l1Memories).toEqual([]);
    expect(contract.assets.l2Scenes).toEqual([]);
    expect(contract.assets.l3Profiles).toEqual([]);

    const annotationById = new Map(contract.privateAnnotations.map((item) => [item.caseId, item]));
    const listed = annotationById.get("T01-SKILL-TARGET-001-P")!.gold;
    expect(listed.allowedSequences).toEqual([["skill_view"]]);
    expect(listed.stopAfter).toMatch(/skill_view returns/);
    const searched = annotationById.get("T01-SKILL-HARNESS-002-P")!.gold;
    expect(searched.allowedSequences).toEqual([["skill_search", "skill_view_by_id"]]);
    expect(searched.expectedFollowupActions?.[0].tool).toBe("skill_view_by_id");
    expect(searched.stopAfter).toMatch(/skill_view_by_id returns/);
    expect(contractText).not.toContain("stop_after_first_tdai_tool_decision");

    const provenance = JSON.parse(readFileSync(resolve(root, "provenance/T01.json"), "utf8")) as {
      inputs: { w01_pair_draft_sha256: string; w01_l0_draft_sha256: string };
      l0_migration: Array<{ input_sha256: string; output_sha256: string }>;
    };
    expect(provenance.inputs.w01_pair_draft_sha256).toBe("b4bdf8f4bf1f8547bc84028489f38d0a6fe6c3390c0e1f6399ab50d77874d71a");
    expect(provenance.inputs.w01_l0_draft_sha256).toBe("749be097a0417d6e4876f6e5c0ef3847fa3a8aa098498fc06e3bda86b2dffe8c");
    expect(provenance.l0_migration).toHaveLength(6);
    expect(provenance.l0_migration.every((item) => /^[a-f0-9]{64}$/.test(item.input_sha256) && /^[a-f0-9]{64}$/.test(item.output_sha256))).toBe(true);
  });
});
