import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
