import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertFormalCampaignIsolationUniqueness,
  buildFormalExpectedProviderPrompts,
  buildFormalPairRunBindings,
  deriveFormalCampaignExecutionIdentity,
  discoverExecutionReceipts,
  formalCampaignPhaseToPairStage,
  formatFormalRepeatId,
  parseFormalCollectScoreCliArguments,
} from "../../eval/tool-prompt-bench/formal-collect-score-cli.js";
import {
  buildEffectiveFormalInvocation,
  type FormalExecutionReceipt,
} from "../../eval/tool-prompt-bench/formal-execution-runner.js";
import type { PreparedFormalRun } from "../../eval/tool-prompt-bench/formal-prepare-runner.js";
import {
  FORMAL_PROMPT_FREEZE_COMMIT,
  FORMAL_PROMPT_FREEZE_TAG_OBJECT,
} from "../../eval/tool-prompt-bench/formal-cache-structure-gate.js";
import type { FormalPublicDatasourceSplit } from "../../eval/tool-prompt-bench/formal-runtime/index.js";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";
import type { FormalM2PreGoldEvidence } from "../../eval/tool-prompt-bench/measurement-v2/formal-m2-evidence-builder.js";
import {
  FORMAL_PROVIDER_USAGE_CONTRACT,
  type CollectedProviderRun,
} from "../../eval/tool-prompt-bench/measurement-v2/provider-evidence-collector.js";
import { normalizeProviderUsage } from "../../eval/tool-prompt-bench/measurement-v2/provider-usage.js";

function executionReceipt(
  runId: string,
  repeat = 1,
  codexCliVersion = "codex-cli-test",
): FormalExecutionReceipt {
  return {
    schemaVersion: "task1.formal-execution-receipt.v1",
    formalMetricEligible: false,
    runId,
    caseId: `case-${runId}`,
    variantId: "V0",
    repeat,
    sessionId: `session-${runId}`,
    executionIdentity: {
      modelId: "gpt-5.6-luna",
      reasoningEffort: "high",
      verbosity: "medium",
      codexCliVersion,
    },
    preparationBinding: {
      runManifestCanonicalSha256: "1".repeat(64),
      prepareCommandCanonicalSha256: "2".repeat(64),
      workspacePolicySha256: "3".repeat(64),
      runNamespace: `run-namespace-${runId}`,
      memoryProxyContextId: `proxy-context-${runId}`,
      localStateId: `local-state-${runId}`,
      freshLocalState: true,
      inheritedHistory: false,
    },
  } as FormalExecutionReceipt;
}

function providerRun(execution: FormalExecutionReceipt): CollectedProviderRun {
  const providerUsageNormalization = normalizeProviderUsage({
    ...FORMAL_PROVIDER_USAGE_CONTRACT,
    rawUsage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 2 },
      output_tokens: 3,
      output_tokens_details: { reasoning_tokens: 1 },
      total_tokens: 13,
    },
  });
  return {
    runId: execution.runId,
    caseId: execution.caseId,
    variantId: execution.variantId,
    sessionId: execution.sessionId,
    requests: [{
      correlationId: `correlation-${execution.runId}`,
      requestSequence: 2,
      requestWallTimeUnixMicros: "2",
      completionSequence: 3,
      completionWallTimeUnixMicros: "3",
      latencyMs: 1,
      path: "/responses",
      method: "POST",
      rawBodySha256: "a".repeat(64),
      providerToolDefinitionCount: 0,
      status: 200,
      upstreamRequestId: `request-${execution.runId}`,
      responseBodySha256: "b".repeat(64),
      usage: {
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 3,
        reasoningOutputTokens: 1,
        totalTokens: 13,
      },
      providerUsageNormalization,
      injectionAudit: null,
      providerVisibleInjection: null,
      productionSourceEvidence: null,
    }],
    injection: null,
    providerUsage: {
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 3,
      reasoningOutputTokens: 1,
      totalTokens: 13,
      requestCount: 1,
    },
    formalProviderEvidenceEligible: true,
    issues: [],
  };
}

function m2PreGold(execution: FormalExecutionReceipt): FormalM2PreGoldEvidence {
  const withoutSha = {
    runId: execution.runId,
    caseId: execution.caseId,
    variantId: execution.variantId,
    runIsolation: {
      runId: execution.runId,
      caseId: execution.caseId,
      variantId: execution.variantId,
      repeatIndex: execution.repeat,
      localState: {
        pathId: execution.preparationBinding.localStateId,
      },
    },
    fixture: "pair-binding-test",
  };
  return {
    ...withoutSha,
    canonicalSha256: canonicalSha256(withoutSha),
  } as unknown as FormalM2PreGoldEvidence;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const utf8Sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

async function writeCompletedExecutionFixture(
  root: string,
  caseId: string,
  repeat: number,
): Promise<{ directory: string; receipt: FormalExecutionReceipt }> {
  const datasetRevision = "task1-data-formal-v2.1";
  const campaignId = "campaign-a";
  const directory = join(root, datasetRevision, campaignId, caseId, "V0", String(repeat));
  await mkdir(directory, { recursive: true });
  const runId = `run-${caseId}-${repeat}`;
  const sessionId = `session-${caseId}-${repeat}`;
  const proxyInstanceId = "proxy-instance-a";
  const visibleAssetSetSha256 = "4".repeat(64);
  const snapshotCanonicalSha256 = "5".repeat(64);
  const executionWorkspacePath = `D:/formal-runtime/${caseId}/${repeat}/workspace`;
  const isolatedHome = `D:/formal-runtime/${caseId}/${repeat}/home`;
  const isolatedCodexSqliteHome = `${isolatedHome}/sqlite`;
  const providerPrompt = JSON.stringify({
    type: "task1_user_history_envelope",
    version: 1,
    history: [],
    finalQuery: `query ${caseId}`,
  });
  const providerPromptObject = {
    schemaVersion: "task1.formal-provider-prompt.v1",
    historyTransport: "user-plane-envelope-v1",
    messages: [{
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: providerPrompt }],
    }],
  };
  const manifest = {
    schemaVersion: "task1.formal-prepare-run-manifest.v1",
    prepareOnly: true,
    formalMetricEligible: false,
    dataset_revision: datasetRevision,
    run_id: runId,
    case_id: caseId,
    variant_id: "V0",
    repeat,
    session_id: sessionId,
    proxy_instance_id: proxyInstanceId,
    provider_input_sha256: utf8Sha256(providerPrompt),
    visible_asset_set_sha256: visibleAssetSetSha256,
    model_id: "gpt-5.6-luna",
    reasoning_effort: "high",
    verbosity: "medium",
    code_commit: "6".repeat(40),
    prompt_freeze_commit: FORMAL_PROMPT_FREEZE_COMMIT,
    snapshot_id: "snapshot-a",
    snapshot_sha256: snapshotCanonicalSha256,
    proxy_config_sha256: "7".repeat(64),
    execution_workspace_path: executionWorkspacePath,
    episode_policy: {
      additionalUserTurns: 0,
      tdaiAttemptHorizon: 4,
      defaultWallTimeMs: 180_000,
    },
  };
  const workspacePolicy = {
    path: executionWorkspacePath,
    initialState: "empty",
    inheritsDatasetWorkspace: false,
    createAtExecution: true,
  };
  const command = {
    schemaVersion: "task1.formal-prepare-command.v1",
    autoExecute: false,
    executable: "codex.exe",
    preflight: {
      healthUrl: "http://127.0.0.1:8787/health",
    },
    workspacePolicy,
    environmentPolicy: {
      isolatedHome,
      isolatedCodexSqliteHome,
    },
    executionRequiredGates: {
      identityBinding: {
        expected: {
          datasetUserId: "dataset-user-a",
          spaceId: "space-a",
          teamId: "team-a",
          agentId: "agent-a",
          taskId: "task-a",
          visibleAssetSetSha256,
        },
      },
    },
  };
  const preflight = {
    schemaVersion: "task1.formal-execution-preflight-receipt.v1",
    ready: true,
    logicalIdentity: {
      datasetUserId: "dataset-user-a",
      spaceId: "space-a",
      teamId: "team-a",
      agentId: "agent-a",
      taskId: "task-a",
    },
    runtimeIdentity: {
      resolvedAuthUserId: "runtime-user-a",
      spaceId: "runtime-space-a",
      teamId: "runtime-team-a",
      agentId: "runtime-agent-a",
      taskId: "runtime-task-a",
    },
    sessionId,
    agentSource: "codex",
    visibleAssetSetSha256,
    effectiveConfigSha256: manifest.proxy_config_sha256,
    provenance: {
      restorePlanSha256: "8".repeat(64),
      snapshotId: manifest.snapshot_id,
      snapshotCanonicalSha256,
      inspectEnvelopeCanonicalSha256: "9".repeat(64),
    },
    checks: [
      "auth-user-mapping",
      "metadata-identity",
      "session-identity",
      "visible-assets",
      "write-side-disabled",
      "fresh-session-namespace",
    ].map((id) => ({ id, status: "pass" })),
  };
  const runManifestRaw = json(manifest);
  const prepareCommandRaw = json(command);
  const providerPromptRaw = json(providerPromptObject);
  const preflightRaw = json(preflight);
  const stdout = `${JSON.stringify({ type: "turn.completed" })}\n`;
  const stderr = "";
  const commonIsolation = { runId, sessionId };
  const effectiveInvocation = buildEffectiveFormalInvocation(
    { directory, manifest, command } as unknown as PreparedFormalRun,
    preflight as unknown as Parameters<typeof buildEffectiveFormalInvocation>[1],
  );
  const receipt = {
    schemaVersion: "task1.formal-execution-receipt.v1",
    formalMetricEligible: false,
    runId,
    caseId,
    variantId: "V0",
    repeat,
    sessionId,
    proxyInstanceId,
    knowledgeInstanceId: "knowledge-instance-a",
    providerPromptSha256: manifest.provider_input_sha256,
    visibleAssetSetSha256,
    preflightReceiptSha256: canonicalSha256(preflight),
    artifactBindings: {
      runManifestFileSha256: utf8Sha256(runManifestRaw),
      prepareCommandFileSha256: utf8Sha256(prepareCommandRaw),
      providerPromptFileSha256: utf8Sha256(providerPromptRaw),
      preflightReceiptFileSha256: utf8Sha256(preflightRaw),
    },
    executionIdentity: {
      modelId: manifest.model_id,
      reasoningEffort: manifest.reasoning_effort,
      verbosity: manifest.verbosity,
      codexCliVersion: "codex-cli-test",
    },
    effectiveInvocation,
    preparationBinding: {
      runManifestCanonicalSha256: canonicalSha256(manifest),
      prepareCommandCanonicalSha256: canonicalSha256(command),
      workspacePolicySha256: canonicalSha256(workspacePolicy),
      runNamespace: `run:${canonicalSha256({
        ...commonIsolation,
        executionWorkspacePath,
      })}`,
      memoryProxyContextId: `proxy-context:${canonicalSha256({
        ...commonIsolation,
        proxyInstanceId,
      })}`,
      localStateId: `local-state:${canonicalSha256({
        ...commonIsolation,
        executionWorkspacePath,
        isolatedHome,
        isolatedCodexSqliteHome,
        workspacePolicySha256: canonicalSha256(workspacePolicy),
      })}`,
      freshLocalState: true,
      inheritedHistory: false,
    },
    snapshotBinding: preflight.provenance,
    codeFreeze: {
      executionCodeCommit: manifest.code_commit,
      promptFreezeTagObject: FORMAL_PROMPT_FREEZE_TAG_OBJECT,
      promptFreezeCommit: FORMAL_PROMPT_FREEZE_COMMIT,
      promptFreezeIsAncestor: true,
      workingTreeClean: true,
    },
    startedAt: "2026-08-30T03:00:00.000Z",
    finishedAt: "2026-08-30T03:00:01.000Z",
    startedWallTimeUnixMicros: "3000000",
    finishedWallTimeUnixMicros: "4000000",
    process: {
      exitCode: 0,
      timedOut: false,
      infrastructureError: null,
      stdoutSha256: utf8Sha256(stdout),
      stderrSha256: utf8Sha256(stderr),
    },
    clientUsage: null,
    promptEvidenceState: "captured-by-provider-observer-pending-seal",
    providerUsageState: "captured-by-provider-observer-pending-seal",
    traceCollectionState: "pending-campaign-seal",
    episodePolicy: { additionalUserTurns: 0, tdaiAttemptHorizon: 4, wallTimeMs: 180_000 },
  } as const satisfies FormalExecutionReceipt;
  await Promise.all([
    writeFile(join(directory, "run-manifest.json"), runManifestRaw, "utf8"),
    writeFile(join(directory, "prepare-command.json"), prepareCommandRaw, "utf8"),
    writeFile(join(directory, "provider-prompt.json"), providerPromptRaw, "utf8"),
    writeFile(join(directory, "formal-execution-preflight-receipt.json"), preflightRaw, "utf8"),
    writeFile(join(directory, "codex-events.jsonl"), stdout, "utf8"),
    writeFile(join(directory, "codex-stderr.log"), stderr, "utf8"),
    writeFile(join(directory, "formal-execution-receipt.json"), json(receipt), "utf8"),
  ]);
  return { directory, receipt };
}

describe("formal collect/score CLI", () => {
  it("rebuilds the exact frozen user-plane prompt and binds its receipt hash", () => {
    const expectedPrompt = JSON.stringify({
      type: "task1_user_history_envelope",
      version: 1,
      history: [{ role: "user", content: "earlier context" }],
      finalQuery: "frozen query",
    });
    const receipt = {
      ...executionReceipt("run-frozen"),
      caseId: "case-frozen",
      providerPromptSha256: createHash("sha256").update(expectedPrompt, "utf8").digest("hex"),
    } as FormalExecutionReceipt;
    const datasource = {
      split: "dev",
      cases: [{
        provider: {
          caseId: "case-frozen",
          language: "en",
          contextMessages: [{ role: "user", content: "earlier context" }],
          query: "frozen query",
        },
        binding: {
          caseId: "case-frozen",
          split: "dev",
          identity: {},
          snapshotId: "snapshot-a",
          workspace: {},
          visibleAssetSetSha256: "a".repeat(64),
        },
      }],
    } as unknown as FormalPublicDatasourceSplit;

    expect(buildFormalExpectedProviderPrompts(datasource, [receipt]).get(receipt.runId))
      .toEqual({
        userPrompt: expectedPrompt,
        userPromptSha256: receipt.providerPromptSha256,
      });
    expect(() => buildFormalExpectedProviderPrompts(datasource, [{
      ...receipt,
      providerPromptSha256: "b".repeat(64),
    }])).toThrow(/frozen provider prompt/i);
  });

  it("maps the explicit public phase and formal repeat ids without inference", () => {
    expect(formalCampaignPhaseToPairStage("dev-discovery")).toBe("dev_discovery");
    expect(formalCampaignPhaseToPairStage("dev-confirmation"))
      .toBe("dev_finalist_confirmation");
    expect(formalCampaignPhaseToPairStage("hidden")).toBe("hidden");
    expect(formatFormalRepeatId(1)).toBe("r01");
    expect(formatFormalRepeatId(3)).toBe("r03");
    expect(() => formatFormalRepeatId(0)).toThrow(/positive safe integer/i);
  });

  it("binds each execution directly to its canonical M2 pre-Gold evidence", () => {
    const first = executionReceipt("run-1");
    const second = executionReceipt("run-2", 2);
    const firstPreGold = m2PreGold(first);
    const secondPreGold = m2PreGold(second);
    const bindings = buildFormalPairRunBindings(
      "campaign-a",
      [first, second],
      [firstPreGold, secondPreGold],
    );
    expect(bindings.map((binding) => [
      binding.caseId,
      binding.runId,
      binding.repeatId,
      binding.rawEvidenceArtifactRef,
      binding.rawEvidenceArtifactSha256,
      binding.localStateId,
    ])).toEqual([
      [first.caseId, first.runId, "r01", "#/m2PreGoldEvidence/0",
        firstPreGold.canonicalSha256, first.preparationBinding.localStateId],
      [second.caseId, second.runId, "r02", "#/m2PreGoldEvidence/1",
        secondPreGold.canonicalSha256, second.preparationBinding.localStateId],
    ]);
    for (const binding of bindings) {
      const index = Number(binding.rawEvidenceArtifactRef.match(
        /^#\/m2PreGoldEvidence\/(\d+)$/u,
      )?.[1]);
      expect([firstPreGold, secondPreGold][index]).toMatchObject({
        runId: binding.runId,
        canonicalSha256: binding.rawEvidenceArtifactSha256,
      });
    }
    const reversedBindings = buildFormalPairRunBindings(
      "campaign-a",
      [second, first],
      [secondPreGold, firstPreGold],
    );
    expect(reversedBindings.map((binding) => [
      binding.runId,
      binding.rawEvidenceArtifactRef,
      binding.rawEvidenceArtifactSha256,
    ])).toEqual([
      [first.runId, "#/m2PreGoldEvidence/1", firstPreGold.canonicalSha256],
      [second.runId, "#/m2PreGoldEvidence/0", secondPreGold.canonicalSha256],
    ]);

    const driftedWithoutSha = {
      ...firstPreGold,
      runIsolation: {
        ...firstPreGold.runIsolation,
        repeatIndex: 2,
      },
    };
    const { canonicalSha256: _discarded, ...driftedContent } = driftedWithoutSha;
    const drifted = {
      ...driftedContent,
      canonicalSha256: canonicalSha256(driftedContent),
    } as FormalM2PreGoldEvidence;
    expect(() => buildFormalPairRunBindings(
      "campaign-a",
      [first],
      [drifted],
    )).toThrow(/identity does not match/i);
  });

  it("derives one exact cohort identity and rejects Codex version drift", () => {
    const first = executionReceipt("run-1");
    expect(deriveFormalCampaignExecutionIdentity([first], [providerRun(first)]))
      .toMatchObject({ apiProtocol: "responses-v1" });
    const drifted = executionReceipt("run-2", 1, "codex-cli-drifted");
    expect(() => deriveFormalCampaignExecutionIdentity(
      [first, drifted],
      [providerRun(first), providerRun(drifted)],
    )).toThrow(/multiple execution identities/i);
  });

  it("rejects reused session and local-state identities across formal runs", () => {
    const first = executionReceipt("run-1");
    const second = executionReceipt("run-2");
    expect(() => assertFormalCampaignIsolationUniqueness([first, second])).not.toThrow();
    const reused = {
      ...second,
      sessionId: first.sessionId,
    } as FormalExecutionReceipt;
    expect(() => assertFormalCampaignIsolationUniqueness([first, reused]))
      .toThrow(/unique non-blank session/i);
  });

  it("requires an explicit held-out authorization flag", () => {
    const common = [
      "--campaign-id", "campaign-a",
      "--campaign-root", "D:/runs/campaign-a",
      "--trace-campaign-dir", "D:/traces/campaign-a",
      "--repo-root", "D:/repo",
      "--split", "hidden_test",
      "--campaign-phase", "hidden",
      "--output", "D:/results/campaign-a.json",
    ];
    expect(() => parseFormalCollectScoreCliArguments(common))
      .toThrow(/requires --allow-hidden-test/i);
    expect(parseFormalCollectScoreCliArguments([...common, "--allow-hidden-test"]))
      .toMatchObject({
        split: "hidden_test",
        campaignPhase: "hidden",
        allowHiddenTest: true,
      });
  });

  it("derives a single repeat policy from the explicit campaign phase", () => {
    const common = [
      "--campaign-id", "campaign-a",
      "--campaign-root", "D:/runs/campaign-a",
      "--trace-campaign-dir", "D:/traces/campaign-a",
      "--repo-root", "D:/repo",
      "--output", "D:/results/campaign-a.json",
    ];
    expect(parseFormalCollectScoreCliArguments([
      ...common,
      "--split", "dev",
      "--campaign-phase", "dev-discovery",
    ])).toMatchObject({ split: "dev", campaignPhase: "dev-discovery" });
    expect(() => parseFormalCollectScoreCliArguments([
      ...common,
      "--split", "dev",
      "--campaign-phase", "hidden",
      "--allow-hidden-test",
    ])).toThrow(/campaign phase.*split/i);
  });

  it("discovers only completed execution receipts in deterministic order", async () => {
    const root = await mkdtemp(join(tmpdir(), "task1-collect-receipts-"));
    await writeCompletedExecutionFixture(root, "case-b", 1);
    await writeCompletedExecutionFixture(root, "case-a", 2);
    await writeCompletedExecutionFixture(root, "case-a", 1);
    await mkdir(join(root, "prepared-only"));

    const receipts = await discoverExecutionReceipts(root, "campaign-a");
    expect(receipts.map((receipt) => `${receipt.caseId}:${receipt.repeat}`))
      .toEqual(["case-a:1", "case-a:2", "case-b:1"]);
  });

  it("rejects a one-byte drift in every receipt-bound sibling artifact", async () => {
    const files = [
      "run-manifest.json",
      "prepare-command.json",
      "provider-prompt.json",
      "formal-execution-preflight-receipt.json",
      "codex-events.jsonl",
      "codex-stderr.log",
    ];
    for (const [index, file] of files.entries()) {
      const root = await mkdtemp(join(tmpdir(), `task1-collect-drift-${index}-`));
      const fixture = await writeCompletedExecutionFixture(root, `case-${index}`, 1);
      const path = join(fixture.directory, file);
      await writeFile(path, `${await readFile(path, "utf8")} `, "utf8");
      await expect(discoverExecutionReceipts(root, "campaign-a"))
        .rejects.toThrow(/file SHA-256 mismatch/i);
    }
  });

  it("rejects a self-consistent effective invocation bound to the wrong runtime mapping", async () => {
    const root = await mkdtemp(join(tmpdir(), "task1-collect-runtime-mapping-"));
    const fixture = await writeCompletedExecutionFixture(root, "case-a", 1);
    const canonical = {
      ...fixture.receipt.effectiveInvocation.canonical,
      runtimeIdentity: {
        ...fixture.receipt.effectiveInvocation.canonical.runtimeIdentity,
        teamId: "wrong-runtime-team",
      },
    };
    const receipt = {
      ...fixture.receipt,
      effectiveInvocation: {
        canonical,
        canonicalSha256: canonicalSha256(canonical),
      },
    };
    await writeFile(
      join(fixture.directory, "formal-execution-receipt.json"),
      json(receipt),
      "utf8",
    );

    await expect(discoverExecutionReceipts(root, "campaign-a"))
      .rejects.toThrow(/effective invocation\/preflight binding SHA-256 mismatch/i);
  });

  it("rejects a schema-only receipt and a cross-directory receipt splice", async () => {
    const schemaOnlyRoot = await mkdtemp(join(tmpdir(), "task1-collect-schema-only-"));
    const schemaOnlyDirectory = join(
      schemaOnlyRoot,
      "task1-data-formal-v2.1",
      "campaign-a",
      "case-a",
      "V0",
      "1",
    );
    await mkdir(schemaOnlyDirectory, { recursive: true });
    await writeFile(join(schemaOnlyDirectory, "formal-execution-receipt.json"), json({
      schemaVersion: "task1.formal-execution-receipt.v1",
    }), "utf8");
    await expect(discoverExecutionReceipts(schemaOnlyRoot, "campaign-a"))
      .rejects.toThrow(/execution receipt/i);

    const spliceRoot = await mkdtemp(join(tmpdir(), "task1-collect-splice-"));
    const first = await writeCompletedExecutionFixture(spliceRoot, "case-a", 1);
    const second = await writeCompletedExecutionFixture(spliceRoot, "case-b", 1);
    await writeFile(
      join(second.directory, "formal-execution-receipt.json"),
      json(first.receipt),
      "utf8",
    );
    await expect(discoverExecutionReceipts(spliceRoot, "campaign-a"))
      .rejects.toThrow(/directory identity|artifact|file SHA-256/i);
  });

  it("builds observed M2 evidence before the cache Gate and private scoring", async () => {
    const source = await readFile(resolve(
      process.cwd(),
      "eval",
      "tool-prompt-bench",
      "formal-collect-score-cli.ts",
    ), "utf8");
    expect(source).toContain("inspectFormalCacheStructureFreeze");
    expect(source.indexOf("const m2PreGoldEvidence = buildFormalM2CampaignPreGoldEvidence"))
      .toBeLessThan(source.indexOf("const cacheStructureGate = await inspectFormalCacheStructureFreeze"));
    expect(source.indexOf("const cacheStructureGate = await inspectFormalCacheStructureFreeze"))
      .toBeLessThan(source.indexOf("const privateMeasurement = loadPrivateMeasurementSplit"));
    expect(source).toContain("cacheStructureGate,");
    expect(source).toMatch(/m2PreGoldEvidence,\r?\n\s+pairScoring:/u);
    expect(source).toContain("buildFormalPairEvidenceV2");
  });
});
