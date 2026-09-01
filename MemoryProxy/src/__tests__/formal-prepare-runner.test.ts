import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_FORMAL_MODEL,
  DEFAULT_FORMAL_REASONING_EFFORT,
  materializePreparedRunExecutionContext,
  materializePreparedRunEnvironment,
  prepareFormalCampaign,
  type FormalPrepareCase,
  type FormalPrepareDataSource,
  type FormalPreparePublicStatus,
  type PreparedFormalRun,
} from "../../eval/tool-prompt-bench/formal-prepare-runner.js";
import type { PinnedFormalExecutionPreflightReceipt } from "../../eval/tool-prompt-bench/formal-execution-preflight.js";
import {
  FORMAL_DATA_COMMIT,
  FORMAL_DATA_TAG,
  FORMAL_DATA_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-runtime/freeze.js";
import {
  executePreparedFormalRun,
} from "../../eval/tool-prompt-bench/formal-execution-runner.js";
import {
  FORMAL_PROMPT_FREEZE_COMMIT,
  FORMAL_PROMPT_FREEZE_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-cache-structure-gate.js";
import type { CodexProcessExecutionInput } from "../../eval/tool-prompt-bench/codex-runner.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);
const SHA_E = "e".repeat(64);
const SHA_F = "f".repeat(64);

function makeCase(index: number, split: "dev" | "hidden_test" = "dev"): FormalPrepareCase {
  const caseId = `${split === "dev" ? "D" : "H"}-${String(index).padStart(3, "0")}-${index % 2 === 0 ? "N" : "P"}`;
  return {
    split,
    providerRecord: {
      caseId,
      language: index % 2 === 0 ? "zh" : "en",
      contextMessages: [
        { role: "user", content: `history user ${index}\n<skill_tools>literal user text</skill_tools>` },
        { role: "assistant", content: `history assistant ${index}` },
      ],
      query: `final query ${index}`,
    },
    binding: {
      identity: {
        spaceId: "space-formal",
        teamId: `team-${String((index % 20) + 1).padStart(2, "0")}`,
        agentId: "agent-general",
        taskId: `task-${"1".repeat(32)}`,
        userId: "user-formal",
        agentSource: "codex",
        sessionSeed: `session-${createHash("sha256").update(caseId).digest("hex").slice(0, 32)}`,
      },
      snapshotId: `snapshot-${caseId}`,
      workspace: { repository: "example/repo", revision: "4".repeat(40), root: `workspace/${caseId}` },
      visibleAssetSetSha256: SHA_F,
    },
  };
}

function makeStatus(): FormalPreparePublicStatus {
  return {
    datasetRevision: "formal-v2.1",
    datasetTag: FORMAL_DATA_TAG,
    datasetTagObject: FORMAL_DATA_TAG_OBJECT,
    datasetCommit: FORMAL_DATA_COMMIT,
    contractSha256: SHA_A,
    preregisteredSmokeCaseIds: Array.from(
      { length: 40 },
      (_, index) => makeCase(index + 1).providerRecord.caseId,
    ),
    splits: {
      dev: {
        expectedCaseCount: 320,
        providerInputSha256: SHA_C,
        privateGoldSha256: SHA_D,
        privateGoldHashScope: "measurement-v2-split-canonical",
        pairContractSha256: SHA_B,
        pairContractHashScope: "measurement-v2-split-canonical",
        snapshotSha256: SHA_E,
      },
      hidden_test: {
        expectedCaseCount: 480,
        providerInputSha256: SHA_D,
        privateGoldSha256: SHA_E,
        privateGoldHashScope: "measurement-v2-split-canonical",
        pairContractSha256: SHA_C,
        pairContractHashScope: "measurement-v2-split-canonical",
        snapshotSha256: SHA_F,
      },
    },
    formalMetricEligible: false,
  };
}

function makeSource(audit: string[] = []): FormalPrepareDataSource {
  const dev = Array.from({ length: 320 }, (_, index) => makeCase(index + 1));
  const hidden = Array.from({ length: 480 }, (_, index) => makeCase(index + 1, "hidden_test"));
  return {
    async readPublicStatus() {
      audit.push("public-status");
      return makeStatus();
    },
    async openProviderSplit(split, options) {
      audit.push(`open:${split}:${options?.allowHiddenTest === true}`);
      return {
        cases: split === "dev" ? dev : hidden,
        caseBindingsFileSha256: SHA_F,
      };
    },
  };
}

function baseInput(outputRoot: string, source: FormalPrepareDataSource) {
  return {
    source,
    outputRoot,
    runtimeRoot: join(
      tmpdir(),
      "task1-r02-runtime",
      createHash("sha256").update(outputRoot).digest("hex").slice(0, 24),
    ),
    campaignId: "campaign-r02-c",
    scope: "case" as const,
    caseId: "D-001-P",
    caseSplit: "dev" as const,
    variant: "V0" as const,
    proxyInstance: {
      instanceId: "memory-proxy-v0",
      instanceEpoch: "2026-08-30T00:00:00.000Z",
      proxyBaseUrl: "http://127.0.0.1:8787",
      expectedToolPromptProfile: "legacy" as const,
      configFilePath: "D:/formal-config/config.yaml",
      configFileSha256: SHA_F,
      experimentBaseConfigSha256: SHA_A,
      experimentEffectiveConfigSha256: SHA_B,
    },
    repeats: 1,
    codeCommit: "2".repeat(40),
    promptFreezeCommit: FORMAL_PROMPT_FREEZE_COMMIT,
    createdAt: "2026-08-30T01:02:03.000Z",
  };
}

function makeExecutionPreflightReceipt(
  run: PreparedFormalRun,
): PinnedFormalExecutionPreflightReceipt {
  const expected = run.command.executionRequiredGates.identityBinding.expected;
  return {
    schemaVersion: "task1.formal-execution-preflight-receipt.v1",
    ready: true,
    logicalIdentity: {
      datasetUserId: expected.datasetUserId,
      spaceId: expected.spaceId,
      teamId: expected.teamId,
      agentId: expected.agentId,
      taskId: expected.taskId!,
    },
    runtimeIdentity: {
      resolvedAuthUserId: "runtime-user-formal",
      spaceId: "runtime-space-42",
      teamId: "runtime-team-42",
      agentId: "runtime-agent-42",
      taskId: "runtime-task-42",
    },
    sessionId: run.manifest.session_id,
    agentSource: "codex",
    visibleAssetSetSha256: run.manifest.visible_asset_set_sha256,
    visibleAssetCount: 9,
    provenance: {
      snapshotId: run.manifest.snapshot_id,
    },
    checks: [
      { id: "auth-user-mapping", status: "pass" },
      { id: "metadata-identity", status: "pass" },
      { id: "session-identity", status: "pass" },
      { id: "visible-assets", status: "pass" },
      { id: "write-side-disabled", status: "pass" },
      { id: "fresh-session-namespace", status: "pass" },
    ],
  };
}

describe("R02 PrepareOnly formal runner", () => {
  it("defaults to Luna/high and writes only Gold-blind preparation artifacts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r02-prepare-"));
    const result = await prepareFormalCampaign(baseInput(outputRoot, makeSource()));

    expect(DEFAULT_FORMAL_MODEL).toBe("gpt-5.6-luna");
    expect(DEFAULT_FORMAL_REASONING_EFFORT).toBe("high");
    expect(result.runs).toHaveLength(1);
    expect(result.formalMetricEligible).toBe(false);

    for (const run of result.runs) {
      expect(run.manifest).toMatchObject({
        dataset_revision: "formal-v2.1",
        dataset_commit: FORMAL_DATA_COMMIT,
        contract_sha256: SHA_A,
        private_gold_sha256: SHA_D,
        private_gold_hash_scope: "measurement-v2-split-canonical",
        snapshot_sha256: SHA_E,
        pair_contract_sha256: SHA_B,
        pair_contract_hash_scope: "measurement-v2-split-canonical",
        proxy_instance_id: "memory-proxy-v0",
        proxy_instance_epoch: "2026-08-30T00:00:00.000Z",
        proxy_config_sha256: SHA_B,
        identity_binding_state: "unverified-prepare-only",
        expected_tool_prompt_profile: "legacy",
        expected_codex_upstream_url: "https://chatgpt.com/backend-api/codex",
        expected_codex_upstream_auth: "client-passthrough",
        case_bindings_file_sha256: SHA_F,
        model_id: "gpt-5.6-luna",
        reasoning_effort: "high",
        case_id: "D-001-P",
        split: "dev",
        formalMetricEligible: false,
        started_at: null,
        finished_at: null,
      });
      expect(run.directory.replaceAll("\\", "/")).toContain(
        "/formal-v2.1/campaign-r02-c/D-001-P/",
      );
      expect(run.directory.replaceAll("\\", "/")).toMatch(/\/V0\/1$/);

      const names = (await readdir(run.directory)).sort();
      expect(names).toEqual([
        "prepare-command.json",
        "provider-prompt.json",
        "run-manifest.json",
      ]);
      expect(names).not.toContain("evaluation.json");
      expect(names).not.toContain("asset-check.json");
      expect(names).not.toContain("usage.json");

      const serialized = await readFile(join(run.directory, "run-manifest.json"), "utf8");
      expect(serialized).not.toMatch(/measurement_v2_commit|real_chain_gate_sha256|candidate_base_commit/);
      expect(serialized).not.toMatch(/authorization|auth\.json|CODEX_HOME|expectedTool|terminal/i);
      const command = JSON.parse(await readFile(join(run.directory, "prepare-command.json"), "utf8"));
      expect(command.environmentPolicy).toMatchObject({
        helper: "isolateCodexEnvironment",
        authentication: "current-codex-home-or-userprofile-dot-codex",
        copyAuthJson: false,
        readAuthJsonDuringPrepare: false,
      });
      expect(command.preflight).toEqual({
        method: "GET",
        healthUrl: "http://127.0.0.1:8787/health",
        expected: {
          injectionEnabled: true,
          toolPromptProfile: "legacy",
          serverInstanceId: "memory-proxy-v0",
          serverStartedAt: "2026-08-30T00:00:00.000Z",
          codexUpstream: "https://chatgpt.com/backend-api/codex",
          codexUpstreamAuth: "client-passthrough",
          experimentReadOnly: {
            extractionDisabled: true,
            tdaiL0WriteDisabled: true,
            skillLlmWriteDisabled: true,
            analyseMarkerDisabled: true,
            toolPromptDiagnosticDisabled: true,
            ready: true,
          },
          toolPromptDiagnostic: "disabled",
          experimentConfigFingerprint: {
            schemaVersion: "task1.proxy-config-fingerprint.v2",
            baseSha256: SHA_A,
            effectiveSha256: SHA_B,
          },
          experimentConfigFileSha256: SHA_F,
        },
      });
      expect(command.proxyStartupContract).toEqual({
        freshProcessRequired: true,
        configurationFileMutation: false,
        configurationFile: {
          path: "D:/formal-config/config.yaml",
          exactSha256: SHA_F,
        },
        cliOverride: ["--tool-prompt-profile", "legacy", "--experiment-read-only"],
      });
      expect(command.workspacePolicy).toMatchObject({
        initialState: "empty",
        inheritsDatasetWorkspace: false,
        createAtExecution: true,
      });
      expect(command.executionRequiredGates).toMatchObject({
        identityBinding: {
          state: "unverified-prepare-only",
          requiredBefore: "model-invocation",
          expected: {
            datasetUserId: "user-formal",
            spaceId: "space-formal",
            visibleAssetSetSha256: SHA_F,
          },
        },
        codeAndPromptFreeze: { state: "unverified-prepare-only" },
        runtimeIsolation: { operation: "materializePreparedRunExecutionContext" },
        campaignMatrix: { requiredOrder: "AB/BA" },
      });
    }
  });

  it("keeps provider input and dynamic binding identical across variants while sessions are fresh per case/repeat", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r02-identity-"));
    const common = baseInput(outputRoot, makeSource());
    const firstV0 = await prepareFormalCampaign({ ...common, repeats: 2 });
    const firstV3 = await prepareFormalCampaign({
      ...common,
      repeats: 2,
      campaignId: "campaign-r02-c-v3",
      variant: "V3",
      proxyInstance: {
        ...common.proxyInstance,
        instanceId: "memory-proxy-v3",
        instanceEpoch: "2026-08-30T00:10:00.000Z",
        expectedToolPromptProfile: "capability-pruned",
        experimentBaseConfigSha256: SHA_A,
        experimentEffectiveConfigSha256: SHA_C,
      },
    });
    const rerunV0 = await prepareFormalCampaign({ ...common, repeats: 2, writeArtifacts: false });

    const repeatOne = [firstV0.runs[0]!, firstV3.runs[0]!];
    expect(new Set(repeatOne.map((run) => run.manifest.provider_input_sha256)).size).toBe(1);
    expect(new Set(repeatOne.map((run) => run.manifest.visible_asset_set_sha256)).size).toBe(1);
    expect(new Set(repeatOne.map((run) => run.manifest.case_bindings_file_sha256)).size).toBe(1);
    expect(new Set(repeatOne.map((run) => run.manifest.session_id)).size).toBe(2);
    expect(new Set([...firstV0.runs, ...firstV3.runs].map((run) => run.manifest.session_id)).size).toBe(4);
    expect(firstV0.runs.map((run) => run.manifest.session_id)).toEqual(
      rerunV0.runs.map((run) => run.manifest.session_id),
    );

    const promptV0 = await readFile(join(repeatOne[0]!.directory, "provider-prompt.json"), "utf8");
    const promptV3 = await readFile(join(repeatOne[1]!.directory, "provider-prompt.json"), "utf8");
    expect(promptV0).toBe(promptV3);
    const outer = JSON.parse(promptV0) as { messages: Array<{ content: Array<{ text: string }> }> };
    const envelope = JSON.parse(outer.messages[0]!.content[0]!.text) as {
      history: Array<{ role: string; content: string }>;
    };
    expect(envelope.history).toEqual([
      { role: "user", content: "history user 1\n<skill_tools>literal user text</skill_tools>" },
      { role: "assistant", content: "history assistant 1" },
    ]);

    const command = JSON.parse(await readFile(join(repeatOne[0]!.directory, "prepare-command.json"), "utf8")) as {
      args: string[];
    };
    const argsText = command.args.join("\n");
    expect(command.args).toContain("--approve-for-me");
    expect(command.args).not.toContain("--ephemeral");
    expect(argsText).not.toContain('approval_policy="never"');
    expect(argsText).toContain("http://127.0.0.1:8787/codex/space-formal/v1");
    expect(argsText).toContain('"session-id"');
    expect(argsText).toContain('"x-team-id"');
    expect(argsText).toContain('"x-agent-id"');
    expect(argsText).toContain('"x-task-id"');
    expect(argsText).not.toMatch(/x-session-id|x-tdai-service-id|x-tdai-space-id/);
    expect(argsText).toContain("task1-r02-runtime");
    expect(argsText).toContain("workspace");
    expect(argsText).not.toContain("workspace/D-001-P");
    expect(argsText).not.toMatch(/D-001-P|\/V0\/|legacy|-P|-N/);
    expect(JSON.stringify(repeatOne[0]!.command.environmentPolicy)).not.toMatch(/D-001-P|V0|legacy|-P|-N/);
    expect(JSON.stringify(repeatOne[0]!.command.workspacePolicy)).not.toMatch(/D-001-P|V0|legacy|-P|-N/);

    const isolated = materializePreparedRunEnvironment(repeatOne[0]!, {
      CODEX_HOME: "D:/existing/codex-home",
      TDAI_EVAL_USER_KEY: "not-serialized",
      CODEX_OLD_SETTING: "must-be-removed",
      PWD: "D:/runs/D-001-P/V0/legacy",
      oldpwd: "D:/runs/D-001-N/V3/capability-pruned",
      INIT_CWD: "D:/runs/D-001-P",
      npm_config_local_prefix: "D:/runs/D-001-N",
      NPM_PACKAGE_JSON: "D:/runs/D-001-P/package.json",
      npm_lifecycle_script: "run D-001-N with V0 legacy",
      VSCODE_CWD: "D:/runs/D-001-P/V3",
      PATH: "D:/neutral/bin",
    });
    expect(isolated.CODEX_HOME).toBe("D:/existing/codex-home");
    expect(isolated.HOME).toBe(command.args.length > 0
      ? repeatOne[0]!.command.environmentPolicy.isolatedHome
      : "unreachable");
    expect(isolated.USERPROFILE).toBe(repeatOne[0]!.command.environmentPolicy.isolatedHome);
    expect(isolated.CODEX_SQLITE_HOME).toBe(
      repeatOne[0]!.command.environmentPolicy.isolatedCodexSqliteHome,
    );
    expect(isolated.CODEX_OLD_SETTING).toBeUndefined();
    expect(isolated.PWD).toBeUndefined();
    expect(isolated.oldpwd).toBeUndefined();
    expect(isolated.INIT_CWD).toBeUndefined();
    expect(isolated.npm_config_local_prefix).toBeUndefined();
    expect(isolated.NPM_PACKAGE_JSON).toBeUndefined();
    expect(isolated.npm_lifecycle_script).toBeUndefined();
    expect(isolated.VSCODE_CWD).toBeUndefined();
    expect(isolated.PATH).toBe("D:/neutral/bin");
    expect(JSON.stringify({
      args: repeatOne[0]!.command.args,
      cwd: repeatOne[0]!.command.workspacePolicy.path,
      home: isolated.HOME,
      userProfile: isolated.USERPROFILE,
      sqlite: isolated.CODEX_SQLITE_HOME,
      inherited: Object.fromEntries(Object.entries(isolated).filter(([name]) => (
        name !== "TDAI_EVAL_USER_KEY" && name !== "CODEX_HOME"
      ))),
    })).not.toMatch(/D-001-[PN]|\/V[0-3]\/|legacy|capability-pruned/i);
    const fallback = materializePreparedRunEnvironment(repeatOne[0]!, {
      USERPROFILE: "D:/Users/formal",
      TDAI_EVAL_USER_KEY: "not-serialized",
    });
    expect(fallback.CODEX_HOME?.replaceAll("\\", "/")).toBe("D:/Users/formal/.codex");
    expect(() => materializePreparedRunEnvironment(repeatOne[0]!, {
      USERPROFILE: "D:/Users/formal",
    })).toThrow(/TDAI_EVAL_USER_KEY/);

    const materialized = await materializePreparedRunExecutionContext(repeatOne[0]!, {
      CODEX_HOME: "D:/existing/codex-home",
      TDAI_EVAL_USER_KEY: "not-serialized",
      PWD: "D:/semantic/D-001-P/V0/legacy",
    });
    expect(materialized.cwd).toBe(repeatOne[0]!.command.workspacePolicy.path);
    expect(await readdir(materialized.cwd)).toEqual([]);
    await expect(materializePreparedRunExecutionContext(repeatOne[0]!, {
      CODEX_HOME: "D:/existing/codex-home",
      TDAI_EVAL_USER_KEY: "not-serialized",
    })).rejects.toThrow(/runtime directory already exists/i);

    const nextCampaign = await prepareFormalCampaign({
      ...common,
      campaignId: "campaign-r02-c-next",
      writeArtifacts: false,
    });
    expect(nextCampaign.runs[0]!.manifest.session_id).not.toBe(firstV0.runs[0]!.manifest.session_id);
  });

  it("rejects hidden scope before opening its sealed provider source without explicit authorization", async () => {
    const audit: string[] = [];
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r02-hidden-"));
    const input = {
      ...baseInput(outputRoot, makeSource(audit)),
      scope: "hidden_test" as const,
      caseId: undefined,
      caseSplit: undefined,
    };

    await expect(prepareFormalCampaign(input)).rejects.toThrow(/held-out authorization/i);
    expect(audit).toEqual([]);

    const allowed = await prepareFormalCampaign({
      ...input,
      heldOutAuthorized: true,
      writeArtifacts: false,
    });
    expect(audit).toEqual(["public-status", "open:hidden_test:true"]);
    expect(allowed.runs).toHaveLength(480);
    expect(JSON.stringify(allowed)).not.toContain("heldOutAuthorized");
  });

  it("enumerates exact dev/hidden counts, preregistered smoke 40, and one requested case", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r02-scopes-"));
    const common = baseInput(outputRoot, makeSource());

    const dev = await prepareFormalCampaign({
      ...common,
      scope: "dev",
      caseId: undefined,
      caseSplit: undefined,
      writeArtifacts: false,
    });
    expect(dev.runs).toHaveLength(320);

    const smoke = await prepareFormalCampaign({
      ...common,
      campaignId: "smoke-r02-c",
      scope: "smoke",
      caseId: undefined,
      caseSplit: undefined,
      variant: "V3",
      proxyInstance: {
        ...common.proxyInstance,
        instanceId: "memory-proxy-v3",
        instanceEpoch: "2026-08-30T00:20:00.000Z",
        expectedToolPromptProfile: "capability-pruned",
        experimentBaseConfigSha256: SHA_A,
        experimentEffectiveConfigSha256: SHA_C,
      },
      writeArtifacts: false,
    });
    expect(smoke.runs).toHaveLength(40);
    expect(smoke.runs.map((run) => run.manifest.case_id)).toEqual(makeStatus().preregisteredSmokeCaseIds);

    const one = await prepareFormalCampaign({ ...common, writeArtifacts: false });
    expect(one.runs).toHaveLength(1);
    expect(one.runs[0]!.manifest.case_id).toBe("D-001-P");
  });

  it("fails closed on wrong corpus sizes, duplicate ids, unsafe paths, and unsupported variants", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r02-invalid-"));
    const tooSmall = makeSource();
    tooSmall.openProviderSplit = async () => ({
      cases: [makeCase(1)],
      caseBindingsFileSha256: SHA_F,
    });
    await expect(prepareFormalCampaign({
      ...baseInput(outputRoot, tooSmall),
      scope: "dev",
      caseId: undefined,
      caseSplit: undefined,
    })).rejects.toThrow(/expected 320 cases/i);

    await expect(prepareFormalCampaign({
      ...baseInput(outputRoot, makeSource()),
      campaignId: "../escape",
    })).rejects.toThrow(/safe path segment/i);

    await expect(prepareFormalCampaign({
      ...baseInput(outputRoot, makeSource()),
      variant: "V4" as "V0",
    })).rejects.toThrow(/unsupported tool prompt variant/i);

    await expect(prepareFormalCampaign({
      ...baseInput(outputRoot, makeSource()),
      proxyInstance: {
        ...baseInput(outputRoot, makeSource()).proxyInstance,
        proxyBaseUrl: "https://secret@example.test/v1?token=leak",
      },
    })).rejects.toThrow(/without credentials, path, query, or fragment/i);

    await expect(prepareFormalCampaign({
      ...baseInput(outputRoot, makeSource()),
      proxyInstance: {
        ...baseInput(outputRoot, makeSource()).proxyInstance,
        expectedToolPromptProfile: "capability-pruned",
      },
    })).rejects.toThrow(/requires Proxy profile legacy/i);

    const noOverwriteInput = baseInput(outputRoot, makeSource());
    await prepareFormalCampaign(noOverwriteInput);
    await expect(prepareFormalCampaign(noOverwriteInput)).rejects.toThrow(/refuses to overwrite existing campaign root/i);
  });
});

describe("R04 Gold-blind formal execution runner", () => {
  it("executes the frozen command only after public runtime gates and persists raw evidence", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r04-execute-"));
    const campaign = await prepareFormalCampaign(baseInput(outputRoot, makeSource()));
    const run = campaign.runs[0]!;
    const processCalls: CodexProcessExecutionInput[] = [];
    const preflightReceipt = makeExecutionPreflightReceipt(run);
    const instants = [
      "2026-08-30T03:00:00.000Z",
      "2026-08-30T03:00:01.000Z",
    ];
    const micros = ["3000000", "4000000"];
    const codexStdout = [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 500,
          cached_input_tokens: 300,
          cache_write_input_tokens: 20,
          output_tokens: 40,
          reasoning_output_tokens: 12,
        },
      }),
      "",
    ].join("\n");

    const receipt = await executePreparedFormalRun({
      run,
      environmentSource: {
        CODEX_HOME: "D:/authenticated/codex-home",
        TDAI_EVAL_USER_KEY: "must-not-be-persisted",
        PATH: process.env.PATH,
      },
      preflightReceipt,
      knowledgeHealthUrl: "http://127.0.0.1:8790/health",
      expectedKnowledgeInstanceId: "knowledge-instance-r04",
      codeFreeze: {
        executionCodeCommit: run.manifest.code_commit,
        promptFreezeTagObject: FORMAL_PROMPT_FREEZE_TAG_OBJECT,
        promptFreezeCommit: FORMAL_PROMPT_FREEZE_COMMIT,
        promptFreezeIsAncestor: true,
        workingTreeClean: true,
      },
      timeoutMs: 120_000,
    }, {
      fetchJson: async (url) => {
        if (url === run.command.preflight.healthUrl) {
          return structuredClone(run.command.preflight.expected);
        }
        if (url === "http://127.0.0.1:8790/health") {
          return { status: "ok", serverInstanceId: "knowledge-instance-r04" };
        }
        throw new Error(`unexpected health URL ${url}`);
      },
      executeProcess: async (input) => {
        processCalls.push(input);
        return {
          exitCode: 0,
          timedOut: false,
          stdout: codexStdout,
          stderr: "",
        };
      },
      resolveCodexCliVersion: async (input) => {
        expect(input.executable).toBe(run.command.versionProbe.executable);
        expect(input.args).toEqual(run.command.versionProbe.args);
        return "codex-cli 1.2.3";
      },
      nowIso: () => instants.shift()!,
      wallTimeUnixMicros: () => micros.shift()!,
    });

    expect(processCalls).toHaveLength(1);
    expect(processCalls[0]).toMatchObject({
      executable: run.command.executable,
      cwd: run.command.workspacePolicy.path,
      timeoutMs: 120_000,
    });
    const effectiveArgs = processCalls[0]!.args;
    expect(effectiveArgs).toContain(
      'model_providers.custom.base_url="http://127.0.0.1:8787/codex/runtime-space-42/v1"',
    );
    expect(effectiveArgs).toContain(
      'model_providers.custom.http_headers={ "session-id" = '
        + `${JSON.stringify(run.manifest.session_id)}, "x-agent-id" = "runtime-agent-42", `
        + '"x-task-id" = "runtime-task-42", "x-team-id" = "runtime-team-42" }',
    );
    expect(effectiveArgs).not.toContain(
      'model_providers.custom.base_url="http://127.0.0.1:8787/codex/space-formal/v1"',
    );
    expect(processCalls[0]?.stdin).toContain("final query 1");
    expect((processCalls[0]?.environment as NodeJS.ProcessEnv).CODEX_HOME)
      .toBe("D:/authenticated/codex-home");
    expect((processCalls[0]?.environment as NodeJS.ProcessEnv).HOME)
      .toBe(run.command.environmentPolicy.isolatedHome);
    expect(receipt).toMatchObject({
      schemaVersion: "task1.formal-execution-receipt.v1",
      formalMetricEligible: false,
      runId: run.manifest.run_id,
      caseId: run.manifest.case_id,
      startedAt: "2026-08-30T03:00:00.000Z",
      finishedAt: "2026-08-30T03:00:01.000Z",
      startedWallTimeUnixMicros: "3000000",
      finishedWallTimeUnixMicros: "4000000",
      traceCollectionState: "pending-campaign-seal",
      process: { exitCode: 0, timedOut: false, infrastructureError: null },
      clientUsage: {
        inputTokens: 500,
        cachedInputTokens: 300,
        cacheWriteInputTokens: 20,
        outputTokens: 40,
        reasoningOutputTokens: 12,
      },
      executionIdentity: {
        modelId: run.manifest.model_id,
        reasoningEffort: run.manifest.reasoning_effort,
        verbosity: run.manifest.verbosity,
        codexCliVersion: "codex-cli 1.2.3",
      },
      effectiveInvocation: {
        canonical: {
          executable: run.command.executable,
          args: effectiveArgs,
          cwd: run.command.workspacePolicy.path,
          runtimeIdentity: preflightReceipt.runtimeIdentity,
        },
      },
      preparationBinding: {
        runNamespace: `run:${run.manifest.run_id}`,
        memoryProxyContextId: `proxy-context:${run.manifest.proxy_instance_id}:${run.manifest.session_id}`,
        localStateId: `local-state:${run.manifest.run_id}:${run.manifest.session_id}`,
        freshLocalState: true,
        inheritedHistory: false,
      },
      snapshotId: run.manifest.snapshot_id,
    });
    const names = (await readdir(run.directory)).sort();
    expect(names).toEqual([
      "client-usage.json",
      "codex-events.jsonl",
      "codex-stderr.log",
      "formal-execution-preflight-receipt.json",
      "formal-execution-receipt.json",
      "prepare-command.json",
      "provider-prompt.json",
      "run-manifest.json",
    ]);
    expect(await readFile(join(run.directory, "codex-events.jsonl"), "utf8"))
      .toBe(codexStdout);
    expect(JSON.parse(await readFile(
      join(run.directory, "formal-execution-preflight-receipt.json"),
      "utf8",
    ))).toEqual(preflightReceipt);
    const serialized = await readFile(join(run.directory, "formal-execution-receipt.json"), "utf8");
    expect(serialized).not.toContain("must-not-be-persisted");
    expect(serialized).not.toMatch(/privateGold|expectedTool|terminal|pairId/i);
  });

  it("refuses mismatched service identity before materializing or invoking Codex", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r04-refuse-"));
    const campaign = await prepareFormalCampaign(baseInput(outputRoot, makeSource()));
    const run = campaign.runs[0]!;
    let processCalls = 0;

    await expect(executePreparedFormalRun({
      run,
      environmentSource: {
        CODEX_HOME: "D:/authenticated/codex-home",
        TDAI_EVAL_USER_KEY: "not-persisted",
      },
      preflightReceipt: makeExecutionPreflightReceipt(run),
      knowledgeHealthUrl: "http://127.0.0.1:8790/health",
      expectedKnowledgeInstanceId: "knowledge-instance-r04",
      codeFreeze: {
        executionCodeCommit: run.manifest.code_commit,
        promptFreezeTagObject: FORMAL_PROMPT_FREEZE_TAG_OBJECT,
        promptFreezeCommit: FORMAL_PROMPT_FREEZE_COMMIT,
        promptFreezeIsAncestor: true,
        workingTreeClean: true,
      },
    }, {
      fetchJson: async (url) => (
        url === run.command.preflight.healthUrl
          ? { ...run.command.preflight.expected, serverInstanceId: "wrong-proxy" }
          : { status: "ok", serverInstanceId: "knowledge-instance-r04" }
      ),
      executeProcess: async () => {
        processCalls += 1;
        throw new Error("must not run");
      },
    })).rejects.toThrow(/MemoryProxy health mismatch.*serverInstanceId/i);
    expect(processCalls).toBe(0);
  });

  it("refuses an invalid pinned runtime mapping before health checks or Codex", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "task1-r04-runtime-map-"));
    const campaign = await prepareFormalCampaign(baseInput(outputRoot, makeSource()));
    const run = campaign.runs[0]!;
    const validReceipt = makeExecutionPreflightReceipt(run);
    const invalidReceipt: PinnedFormalExecutionPreflightReceipt = {
      ...validReceipt,
      runtimeIdentity: {
        ...validReceipt.runtimeIdentity,
        agentId: "",
      },
    };
    let healthCalls = 0;
    let processCalls = 0;

    await expect(executePreparedFormalRun({
      run,
      environmentSource: {
        CODEX_HOME: "D:/authenticated/codex-home",
        TDAI_EVAL_USER_KEY: "not-persisted",
      },
      preflightReceipt: invalidReceipt,
      knowledgeHealthUrl: "http://127.0.0.1:8790/health",
      expectedKnowledgeInstanceId: "knowledge-instance-r04",
      codeFreeze: {
        executionCodeCommit: run.manifest.code_commit,
        promptFreezeTagObject: FORMAL_PROMPT_FREEZE_TAG_OBJECT,
        promptFreezeCommit: FORMAL_PROMPT_FREEZE_COMMIT,
        promptFreezeIsAncestor: true,
        workingTreeClean: true,
      },
    }, {
      fetchJson: async () => {
        healthCalls += 1;
        throw new Error("must not check health");
      },
      executeProcess: async () => {
        processCalls += 1;
        throw new Error("must not run");
      },
    })).rejects.toThrow(/runtime identity\.agentId must be a non-empty string/i);
    expect(healthCalls).toBe(0);
    expect(processCalls).toBe(0);
  });
});
