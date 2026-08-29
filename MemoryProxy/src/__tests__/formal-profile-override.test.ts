import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildConfig, parseArgv } from "../config.js";
import { createApp } from "../server.js";

describe("Task 1 formal production profile selection", () => {
  it("selects a production Prompt profile per invocation without rewriting YAML", () => {
    const directory = mkdtempSync(join(tmpdir(), "task1-profile-"));
    const configFile = join(directory, "config.yaml");
    const yaml = [
      "injection:",
      "  enabled: true",
      "  toolPromptProfile: legacy",
      "",
    ].join("\n");
    writeFileSync(configFile, yaml, "utf8");

    const overrides = parseArgv([
      "node",
      "src/index.ts",
      "--config",
      configFile,
      "--tool-prompt-profile",
      "capability-pruned",
    ]);
    expect(overrides.toolPromptProfile).toBe("capability-pruned");
    expect(buildConfig(overrides).injection.toolPromptProfile).toBe("capability-pruned");
    expect(readFileSync(configFile, "utf8")).toBe(yaml);

    expect(() => parseArgv([
      "node",
      "src/index.ts",
      "--tool-prompt-profile",
      "unknown-profile",
    ])).toThrow(/invalid injection\.toolPromptProfile/);
  });

  it("reports the effective production profile through the health contract", async () => {
    const directory = mkdtempSync(join(tmpdir(), "task1-profile-health-"));
    const configFile = join(directory, "config.yaml");
    writeFileSync(configFile, [
      "injection:",
      "  enabled: true",
      "  toolPromptProfile: legacy",
      "",
    ].join("\n"), "utf8");
    const config = buildConfig({
      configFile,
      toolPromptProfile: "selection-calibrated",
    });
    const response = await createApp(config, {
      serverInstanceId: "formal-profile-instance-01",
      serverStartedAt: "2026-08-30T00:00:00.000Z",
    }).request("http://memory-proxy.test/health");
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      injectionEnabled: true,
      toolPromptProfile: "selection-calibrated",
      serverInstanceId: "formal-profile-instance-01",
      serverStartedAt: "2026-08-30T00:00:00.000Z",
    });
  });
});
