import { describe, expect, it } from "vitest";

import { inspectFormalSmokeReadiness } from "../../eval/tool-prompt-bench/formal-smoke-readiness.js";

describe("Task 1 formal Smoke readiness", () => {
  it("passes the active 40-case trigger, binding, and Skill-route preflight", async () => {
    const report = await inspectFormalSmokeReadiness(process.cwd());

    expect(report).toMatchObject({
      ready: true,
      datasetRevision: "formal-v2.1-repo-backed-640",
      caseCount: 40,
      positiveCount: 24,
      noToolCount: 16,
      skillRouteCount: 8,
      episodePolicy: {
        additionalUserTurns: 0,
        tdaiAttemptHorizon: 4,
        defaultWallTimeMs: 180_000,
      },
      checks: {
        activeProjection: "pass",
        t03DvcBinding: "pass",
        t18ObservableArguments: "pass",
        skillVisibilityRoutes: "pass",
      },
      errors: [],
    });
  });
});
