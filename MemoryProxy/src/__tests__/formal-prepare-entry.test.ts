import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  prepareFormalCampaignFromSources,
  type PrepareFormalCampaignEntryInput,
} from "../../eval/tool-prompt-bench/formal-prepare-entry.js";
import { parseFormalPrepareCliArgs } from "../../eval/tool-prompt-bench/formal-prepare-cli.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const CONFIG_BYTES = Buffer.from([
  "upstream:",
  "  apiKey: never-serialize-this-secret",
  "injection:",
  "  enabled: true",
  "  toolPromptProfile: legacy",
  "",
].join("\n"), "utf8");

function health(profile = "legacy") {
  return {
    injectionEnabled: true,
    toolPromptProfile: profile,
    serverInstanceId: "formal-instance-01",
    serverStartedAt: "2026-08-30T02:00:00.000Z",
    codexUpstream: "https://chatgpt.com/backend-api/codex",
    codexUpstreamAuth: "client-passthrough",
    experimentConfigFingerprint: {
      schemaVersion: "task1.proxy-config-fingerprint.v2",
      baseSha256: SHA_A,
      effectiveSha256: SHA_B,
    },
    experimentConfigFileSha256: createHash("sha256").update(CONFIG_BYTES).digest("hex"),
    experimentReadOnly: {
      extractionDisabled: true,
      tdaiL0WriteDisabled: true,
      skillLlmWriteDisabled: true,
      analyseMarkerDisabled: true,
      toolPromptDiagnosticDisabled: true,
      ready: true,
    },
    toolPromptDiagnostic: "disabled",
  };
}

function entryInput(): PrepareFormalCampaignEntryInput {
  return {
    repositoryRoot: process.cwd(),
    configFile: "config.formal.yaml",
    outputRoot: join(tmpdir(), "task1-formal-prepare-entry-artifacts"),
    campaignId: "campaign-entry-test",
    scope: "case",
    caseId: "T01-KNOWLEDGE-014-N",
    caseSplit: "dev",
    variant: "V0",
    proxyBaseUrl: "http://127.0.0.1:8787",
    codeRef: "HEAD",
    promptFreezeRef: "HEAD",
    writeArtifacts: false,
  };
}

describe("R02 formal PrepareOnly source factory", () => {
  it("resolves the frozen public datasource, actual config bytes, Git refs and health receipt", async () => {
    const configReads: string[] = [];
    const healthReads: string[] = [];
    const gitReads: string[] = [];
    const result = await prepareFormalCampaignFromSources(entryInput(), {
      async readConfigFile(path) {
        configReads.push(path);
        return CONFIG_BYTES;
      },
      async readHealth(url) {
        healthReads.push(url);
        return health();
      },
      resolveGitCommit(_root, ref) {
        gitReads.push(ref);
        return ref === "HEAD" ? "7".repeat(40) : "8".repeat(40);
      },
      now: () => "2026-08-30T02:01:00.000Z",
    });

    expect(configReads).toEqual([resolve(process.cwd(), "config.formal.yaml")]);
    expect(healthReads).toEqual(["http://127.0.0.1:8787/health"]);
    expect(gitReads).toEqual(["HEAD", "HEAD"]);
    expect(result.runs).toHaveLength(1);
    const run = result.runs[0]!;
    expect(run.manifest).toMatchObject({
      case_id: "T01-KNOWLEDGE-014-N",
      proxy_instance_id: "formal-instance-01",
      proxy_instance_epoch: "2026-08-30T02:00:00.000Z",
      proxy_config_file_sha256: createHash("sha256").update(CONFIG_BYTES).digest("hex"),
      proxy_base_config_sha256: SHA_A,
      proxy_config_sha256: SHA_B,
      code_commit: "7".repeat(40),
      prompt_freeze_commit: "7".repeat(40),
      formalMetricEligible: false,
    });
    expect(run.command.preflight.expected).toMatchObject({
      experimentConfigFingerprint: {
        schemaVersion: "task1.proxy-config-fingerprint.v2",
        baseSha256: SHA_A,
        effectiveSha256: SHA_B,
      },
      experimentConfigFileSha256: createHash("sha256").update(CONFIG_BYTES).digest("hex"),
      experimentReadOnly: { ready: true },
      toolPromptDiagnostic: "disabled",
    });
    expect(run.command.proxyStartupContract.cliOverride).toEqual([
      "--tool-prompt-profile",
      "legacy",
      "--experiment-read-only",
    ]);
    expect(run.command.proxyStartupContract.configurationFile).toEqual({
      path: resolve(process.cwd(), "config.formal.yaml"),
      exactSha256: createHash("sha256").update(CONFIG_BYTES).digest("hex"),
    });
    const runtimeNamespace = resolve(tmpdir(), "tdai-task1-formal-runtime-v1");
    const normalizedRuntime = run.manifest.execution_workspace_path.replaceAll("\\", "/");
    expect(normalizedRuntime.startsWith(runtimeNamespace.replaceAll("\\", "/"))).toBe(true);
    expect(normalizedRuntime).toMatch(/\/run-[a-f0-9]{32}\/workspace$/);
    expect(relative(resolve(entryInput().outputRoot), run.manifest.execution_workspace_path)).toMatch(/^\.\./);
    const modelVisible = JSON.stringify({
      args: run.command.args,
      workspace: run.command.workspacePolicy,
      environment: run.command.environmentPolicy,
    });
    expect(modelVisible).not.toMatch(/T01-KNOWLEDGE-014-N|knowledge|\/V0\/|legacy|-P|-N/i);
    expect(JSON.stringify(result)).not.toContain("never-serialize-this-secret");
  });

  it("rejects held-out access before Git, data, config or health reads", async () => {
    const reads: string[] = [];
    await expect(prepareFormalCampaignFromSources({
      ...entryInput(),
      scope: "hidden_test",
      caseId: undefined,
      caseSplit: undefined,
    }, {
      resolveDataFreeze() {
        reads.push("data");
        throw new Error("must not run");
      },
      resolveGitCommit() {
        reads.push("git");
        throw new Error("must not run");
      },
      async readConfigFile() {
        reads.push("config");
        throw new Error("must not run");
      },
      async readHealth() {
        reads.push("health");
        throw new Error("must not run");
      },
    })).rejects.toThrow(/held-out authorization/i);
    expect(reads).toEqual([]);
  });

  it("fails closed when the actual health profile or read-only receipt drifts", async () => {
    const common = {
      async readConfigFile() {
        return CONFIG_BYTES;
      },
      resolveDataFreeze() {
        throw new Error("data must not be read after an invalid health receipt");
      },
    };
    await expect(prepareFormalCampaignFromSources(entryInput(), {
      ...common,
      async readHealth() {
        return health("capability-pruned");
      },
    })).rejects.toThrow(/does not match Variant V0/i);

    await expect(prepareFormalCampaignFromSources(entryInput(), {
      ...common,
      async readHealth() {
        return {
          ...health(),
          experimentReadOnly: { ...health().experimentReadOnly, tdaiL0WriteDisabled: false },
        };
      },
    })).rejects.toThrow(/tdaiL0WriteDisabled must be true/i);

    await expect(prepareFormalCampaignFromSources(entryInput(), {
      ...common,
      async readHealth() {
        return { ...health(), codexUpstream: "https://example.invalid/codex" };
      },
    })).rejects.toThrow(/official Codex upstream/i);

    await expect(prepareFormalCampaignFromSources(entryInput(), {
      ...common,
      async readHealth() {
        return { ...health(), codexUpstreamAuth: "api-key" };
      },
    })).rejects.toThrow(/client-passthrough/i);

    await expect(prepareFormalCampaignFromSources(entryInput(), {
      ...common,
      async readHealth() {
        return { ...health(), experimentConfigFileSha256: "c".repeat(64) };
      },
    })).rejects.toThrow(/does not match the locally read startup YAML/i);
  });

  it("parses a PrepareOnly CLI without accepting caller-provided instance or hash identities", () => {
    const parsed = parseFormalPrepareCliArgs([
      "node",
      "formal-prepare-cli.ts",
      "--prepare-only",
      "--scope", "case",
      "--case-id", "T01-KNOWLEDGE-014-N",
      "--case-split", "dev",
      "--variant", "V0",
      "--campaign", "campaign-cli",
      "--repository-root", process.cwd(),
      "--config", "config.yaml",
      "--output-root", "D:/formal-artifacts",
      "--proxy-base-url", "http://127.0.0.1:8787",
    ]);
    expect(parsed).toMatchObject({
      scope: "case",
      caseId: "T01-KNOWLEDGE-014-N",
      variant: "V0",
      campaignId: "campaign-cli",
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
    });
    expect(parsed).not.toHaveProperty("runtimeRoot");
    expect(parsed).not.toHaveProperty("proxyInstance");
    expect(parsed).not.toHaveProperty("configFileSha256");
    expect(() => parseFormalPrepareCliArgs([
      "node",
      "formal-prepare-cli.ts",
      "--scope", "dev",
    ])).toThrow(/--prepare-only is required/i);
    expect(() => parseFormalPrepareCliArgs([
      "node",
      "formal-prepare-cli.ts",
      "--prepare-only",
      "--scope", "dev",
      "--runtime-root", "D:/semantic/V0",
    ])).toThrow(/unsupported formal PrepareOnly argument: --runtime-root/i);
  });

  it("keeps the PowerShell wrapper thin and PrepareOnly", async () => {
    const wrapper = await readFile(
      resolve(process.cwd(), "eval/tool-prompt-bench/run-formal-prepare.ps1"),
      "utf8",
    );
    expect(wrapper).toContain("--prepare-only");
    expect(wrapper).toContain("formal-prepare-cli.ts");
    expect(wrapper).toContain("node_modules/.bin/tsx.cmd");
    expect(wrapper).not.toMatch(/\bnpx\b/i);
    expect(wrapper).not.toMatch(/codex exec|docker|MemoryProxy\/src\/index|auth\.json/i);
  });
});
