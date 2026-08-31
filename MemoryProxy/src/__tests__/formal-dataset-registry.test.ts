import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateFormalWorldContract,
  type FormalWorldContract,
} from "../../eval/tool-prompt-bench/worlds/formal-schema.js";
import { compileFormalSplitInputs } from "../../eval/tool-prompt-bench/worlds/formal-compile.js";
import {
  validateFormalV1Freeze,
  validateFormalV2Freeze,
} from "../../eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.js";

const root = resolve(process.cwd(), "eval/tool-prompt-bench/formal-dataset");

describe("Task 1 DS00 identity registry", () => {
  it("registers one Space with T01-T20 and Team-owned Dev/Hidden splits", () => {
    const space = JSON.parse(readFileSync(resolve(root, "registry/space.json"), "utf8")) as {
      space_id: string;
      team_ids: string[];
      snapshot_ids: { dev: string; hidden_test: string };
    };
    expect(space).toEqual(expect.objectContaining({
      space_id: "space-task1-engineering",
      team_ids: [
        "T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08",
        "T09", "T10", "T11", "T12", "T13", "T14", "T15", "T16",
        "T17", "T18", "T19", "T20",
      ],
      snapshot_ids: { dev: "snapshot-task1-dev-v2", hidden_test: "snapshot-task1-hidden-v2" },
    }));

    const files = readdirSync(resolve(root, "registry/teams")).sort();
    expect(files).toEqual(space.team_ids.map((teamId) => `${teamId}.json`));
    const teams = files.map((file) => JSON.parse(readFileSync(resolve(root, "registry/teams", file), "utf8")) as Record<string, unknown>);
    expect(teams.filter((team) => team.split === "dev").map((team) => team.team_id)).toEqual([
      "T01", "T02", "T03", "T04", "T11", "T12", "T17", "T18",
    ]);
    expect(teams.filter((team) => team.split === "hidden_test").map((team) => team.team_id)).toEqual([
      "T05", "T06", "T07", "T08", "T09", "T10", "T13", "T14", "T15", "T16", "T19", "T20",
    ]);
    for (const team of teams) {
      expect(team.space_id).toBe(space.space_id);
      expect(team.active_agent).toEqual(expect.objectContaining({ agent_id: `agent-task1-${String(team.team_id).toLowerCase()}-general` }));
      expect(team).not.toHaveProperty("assets");
      expect(team).not.toHaveProperty("cases");
    }
  });

  it("keeps construction and freeze entry points explicit", () => {
    expect(readdirSync(resolve(root, "scripts")).sort()).toEqual([
      "build-formal-restore-plan.ts",
      "build-formal-v21-coverage.ts",
      "build-measurement-v2-overlay.ts",
      "compile-formal-dataset.ts",
      "inspect-formal-snapshot.ts",
      "integrate-formal-v2.ts",
      "integrate-team-fragments.ts",
      "measurement-v2-overlay-schema.ts",
      "restore-formal-snapshot.ts",
      "validate-formal-dataset.ts",
    ]);
  });

  it("requires explicit create-new evidence outputs for the R05 production CLIs", () => {
    for (const script of [
      "build-formal-restore-plan.ts",
      "restore-formal-snapshot.ts",
      "inspect-formal-snapshot.ts",
    ]) {
      const source = readFileSync(resolve(root, "scripts", script), "utf8");
      expect(source).toContain('option("--output")');
      expect(source).toContain('flag: "wx"');
    }
  });
});

describe("Task 1 formal-v2 integrated contract", () => {
  it("accepts the 20-Team full freeze", () => {
    const contract = JSON.parse(readFileSync(resolve(root, "registry/contracts/formal-v2.json"), "utf8")) as FormalWorldContract;
    expect(validateFormalWorldContract(contract)).toEqual({ valid: true, errors: [] });
    expect(validateFormalV2Freeze(contract)).toEqual([]);
    expect(compileFormalSplitInputs(contract, "dev")).toHaveLength(320);
    expect(compileFormalSplitInputs(contract, "hidden_test")).toHaveLength(480);
    expect(contract.publicCases).toHaveLength(800);
    expect(contract.privateAnnotations).toHaveLength(800);
    expect(contract.pairs).toHaveLength(300);
  }, 120_000);

  it("rejects formal-v2 count drift directly", () => {
    const contract = JSON.parse(readFileSync(resolve(root, "registry/contracts/formal-v2.json"), "utf8")) as FormalWorldContract;
    const drifted = structuredClone(contract);
    drifted.publicCases.pop();
    drifted.privateAnnotations.pop();
    expect(validateFormalV2Freeze(drifted)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Cases expected/)]),
    );
  }, 120_000);
});

describe("Task 1 formal-v1 integrated contract", () => {
  it("accepts the current Dev milestone or the final Full freeze", () => {
    const contractText = readFileSync(resolve(root, "registry/contracts/formal-v1.json"), "utf8");
    const contract = JSON.parse(contractText) as FormalWorldContract;
    expect(validateFormalWorldContract(contract)).toEqual({ valid: true, errors: [] });
    expect(contract.world.spaceId).toBe("space-task1-engineering");
    const isDevMilestone = contract.teams.length === 6;
    expect(validateFormalV1Freeze(contract, isDevMilestone ? "dev" : undefined)).toEqual([]);
    expect(compileFormalSplitInputs(contract, "dev")).toHaveLength(240);
    expect(compileFormalSplitInputs(contract, "hidden_test")).toHaveLength(isDevMilestone ? 0 : 400);
    expect(contract.publicCases).toHaveLength(isDevMilestone ? 240 : 640);
    expect(contract.privateAnnotations).toHaveLength(contract.publicCases.length);
    expect(contract.pairs).toHaveLength(isDevMilestone ? 90 : 240);
    expect(contractText).not.toContain("stop_after_first_tdai_tool_decision");
  }, 30_000);

  it("rejects formal-v1 count drift directly", () => {
    const contract = JSON.parse(readFileSync(resolve(root, "registry/contracts/formal-v1.json"), "utf8")) as FormalWorldContract;
    const isDevMilestone = contract.teams.length === 6;
    const drifted = structuredClone(contract);
    drifted.publicCases.pop();
    drifted.privateAnnotations.pop();
    expect(validateFormalV1Freeze(drifted, isDevMilestone ? "dev" : "hidden_test")).toEqual(
      expect.arrayContaining([expect.stringMatching(/Cases expected/)]),
    );
  });
});
