import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildConfig, parseArgv } from "../config.js";
import { fingerprintProxyConfigForExperiment } from "../experiment-config-fingerprint.js";
import { createApp } from "../server.js";

describe("Task 1 formal production profile selection", () => {
  it("selects a production Prompt profile per invocation without rewriting YAML", () => {
    const directory = mkdtempSync(join(tmpdir(), "task1-profile-"));
    const configFile = join(directory, "config.yaml");
    const yaml = [
      "injection:",
      "  enabled: true",
      "  toolPromptProfile: legacy",
      "  assetReflection:",
      "    markerOptIn: true",
      "extraction:",
      "  enabled: true",
      "  extractors: [skill, tdai-memory]",
      "tdai:",
      "  memory:",
      "    writeL0: true",
      "skillRuntime:",
      "  allowLlmWrite: true",
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
      "--experiment-read-only",
    ]);
    expect(overrides.toolPromptProfile).toBe("capability-pruned");
    expect(overrides.experimentReadOnly).toBe(true);
    expect(buildConfig(overrides)).toMatchObject({
      injection: {
        toolPromptProfile: "capability-pruned",
        assetReflection: { markerOptIn: false },
      },
      extraction: { enabled: false, extractors: [] },
      tdai: { memory: { writeL0: false } },
      skillRuntime: { allowLlmWrite: false },
    });
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
      experimentReadOnly: true,
    });
    const response = await createApp(config, {
      serverInstanceId: "formal-profile-instance-01",
      serverStartedAt: "2026-08-30T00:00:00.000Z",
      experimentConfigFileSha256: "a".repeat(64),
    }).request("http://memory-proxy.test/health");
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      injectionEnabled: true,
      toolPromptProfile: "selection-calibrated",
      serverInstanceId: "formal-profile-instance-01",
      serverStartedAt: "2026-08-30T00:00:00.000Z",
      experimentConfigFingerprint: {
        schemaVersion: "task1.proxy-config-fingerprint.v2",
        baseSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        effectiveSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      experimentConfigFileSha256: "a".repeat(64),
      experimentReadOnly: {
        extractionDisabled: true,
        tdaiL0WriteDisabled: true,
        skillLlmWriteDisabled: true,
        analyseMarkerDisabled: true,
        toolPromptDiagnosticDisabled: true,
        ready: true,
      },
    });
  });

  it("keeps the base fingerprint stable across profiles and binds secret values", () => {
    const directory = mkdtempSync(join(tmpdir(), "task1-profile-fingerprint-"));
    const configFile = join(directory, "config.yaml");
    writeFileSync(configFile, [
      "upstream:",
      "  apiKey: top-secret-one",
      "injection:",
      "  enabled: true",
      "  toolPromptProfile: legacy",
      "",
    ].join("\n"), "utf8");

    const legacy = buildConfig({ configFile, toolPromptProfile: "legacy" });
    const compact = buildConfig({ configFile, toolPromptProfile: "compact" });
    const legacyFingerprint = fingerprintProxyConfigForExperiment(legacy);
    const compactFingerprint = fingerprintProxyConfigForExperiment(compact);

    expect(compactFingerprint.baseSha256).toBe(legacyFingerprint.baseSha256);
    expect(compactFingerprint.effectiveSha256).not.toBe(legacyFingerprint.effectiveSha256);
    expect(JSON.stringify({ legacyFingerprint, compactFingerprint })).not.toContain("top-secret-one");

    const changedSecretValue = structuredClone(legacy);
    changedSecretValue.upstream.apiKey = "top-secret-two";
    expect(fingerprintProxyConfigForExperiment(changedSecretValue).baseSha256)
      .not.toBe(legacyFingerprint.baseSha256);

    const missingSecret = structuredClone(legacy);
    missingSecret.upstream.apiKey = "";
    expect(fingerprintProxyConfigForExperiment(missingSecret).baseSha256)
      .not.toBe(legacyFingerprint.baseSha256);
  });
});
