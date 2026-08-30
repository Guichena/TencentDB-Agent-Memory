import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  parseR05RuntimePreflightContractCliArguments,
  R05_FROZEN_DEV_SMOKE,
  R05_FROZEN_RESTORE_PLAN,
  validateR05PreparedSmoke,
  validateR05RestoreObservations,
  validateR05RestorePlan,
} from "../../eval/tool-prompt-bench/r05-runtime-preflight-contract.js";

function plan() {
  return {
    split: "dev",
    planSha256: R05_FROZEN_RESTORE_PLAN.planSha256,
    actions: Array.from({ length: R05_FROZEN_RESTORE_PLAN.actionCount }, () => ({})),
    requirements: Array.from({ length: R05_FROZEN_RESTORE_PLAN.requirementCount }, () => ({})),
    assets: Array.from({ length: R05_FROZEN_RESTORE_PLAN.assetCount }, () => ({})),
  };
}

function restore() {
  return {
    operation: "restore",
    split: "dev",
    planSha256: R05_FROZEN_RESTORE_PLAN.planSha256,
    verification: "unverified",
    formalMetricEligible: false,
    readyForFormalMeasurement: false,
    unverifiedObservations: {
      split: "dev",
      planSha256: R05_FROZEN_RESTORE_PLAN.planSha256,
      complete: true,
      actionCount: R05_FROZEN_RESTORE_PLAN.actionCount,
      requirementCount: R05_FROZEN_RESTORE_PLAN.requirementCount,
      actions: Array.from({ length: R05_FROZEN_RESTORE_PLAN.actionCount }, () => ({})),
      requirements: Array.from({ length: R05_FROZEN_RESTORE_PLAN.requirementCount }, () => ({})),
    },
  };
}

function smoke() {
  const caseIds = [...R05_FROZEN_DEV_SMOKE.caseIds];
  return {
    preregistration: {
      caseIds,
      selectionContract: { split: "dev", totalCases: 12 },
      sha256: R05_FROZEN_DEV_SMOKE.selectionSha256,
    },
    manifests: caseIds.map((caseId, index) => ({
      case_id: caseId,
      repeat: 1,
      session_id: `session-${index}`,
      run_id: `run-${index}`,
    })),
  };
}

describe("R05 reusable no-model runtime preflight", () => {
  it("rejects unknown or stray CLI arguments while allowing repeated manifests", () => {
    expect(() => parseR05RuntimePreflightContractCliArguments([
      "--bogus", "value",
    ])).toThrow(/unsupported.*--bogus/i);
    expect(() => parseR05RuntimePreflightContractCliArguments([
      "stray-value",
    ])).toThrow(/unsupported.*stray-value/i);

    expect(parseR05RuntimePreflightContractCliArguments([
      "--mode", "prepared",
      "--preregistration", "dev-smoke.json",
      "--manifest", "run-01.json",
      "--manifest", "run-02.json",
    ])).toEqual({
      mode: "prepared",
      preregistrationPath: "dev-smoke.json",
      manifestPaths: ["run-01.json", "run-02.json"],
    });
  });

  it("reports unknown CLI arguments on stderr without partial stdout", () => {
    const result = spawnSync(process.execPath, [
      "--import", "tsx/esm",
      resolve(process.cwd(), "eval/tool-prompt-bench/r05-runtime-preflight-contract.ts"),
      "--bogus", "value",
    ], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/unsupported.*--bogus/i);
  });

  it("pins the exact frozen plan and rejects hash or cardinality drift", () => {
    expect(validateR05RestorePlan(plan())).toEqual(R05_FROZEN_RESTORE_PLAN);
    expect(() => validateR05RestorePlan({ ...plan(), planSha256: "0".repeat(64) }))
      .toThrow(/planSha256/i);
    expect(() => validateR05RestorePlan({ ...plan(), assets: [] }))
      .toThrow(/284 assets/i);
  });

  it("keeps restore observations unverified and rejects adapter self-attestation", () => {
    expect(validateR05RestoreObservations(restore())).toMatchObject({
      complete: true,
      actionCount: 318,
      requirementCount: 209,
    });
    expect(() => validateR05RestoreObservations({
      ...restore(),
      readyForFormalMeasurement: true,
    })).toThrow(/readyForFormalMeasurement.*false/i);
    expect(() => validateR05RestoreObservations({
      ...restore(),
      unverifiedObservations: { ...restore().unverifiedObservations, complete: false },
    })).toThrow(/complete.*true/i);
  });

  it("requires the exact 12-case preregistered set and unique repeat-one identities", () => {
    const input = smoke();
    expect(validateR05PreparedSmoke(input.preregistration, input.manifests).caseIds)
      .toEqual(input.preregistration.caseIds);
    expect(() => validateR05PreparedSmoke({
      ...input.preregistration,
      caseIds: [...input.preregistration.caseIds].reverse(),
    }, input.manifests)).toThrow(/exact frozen 12-case ordered set/i);
    expect(() => validateR05PreparedSmoke(input.preregistration, [
      ...input.manifests.slice(0, 11),
      { ...input.manifests[11], case_id: input.manifests[0].case_id },
    ])).toThrow(/exact preregistered case set/i);
    expect(() => validateR05PreparedSmoke(input.preregistration, [
      { ...input.manifests[0], repeat: 2 },
      ...input.manifests.slice(1),
    ])).toThrow(/repeat.*1/i);
    expect(() => validateR05PreparedSmoke(input.preregistration, [
      { ...input.manifests[0], session_id: input.manifests[1].session_id },
      ...input.manifests.slice(1),
    ])).toThrow(/unique session_id/i);
  });

  it("keeps one public wrapper fail-closed and covers the complete 12-run chain", async () => {
    const source = await readFile(resolve(
      process.cwd(),
      "eval",
      "tool-prompt-bench",
      "run-r05-runtime-preflight.ps1",
    ), "utf8");

    expect(source).toMatch(/Node\.js 22/u);
    expect(source).toContain("task1-data-formal-v1.1");
    expect(source).toContain("task1-code-freeze");
    expect(source).toContain("/health");
    expect(source).toContain("/v3/meta/auth/verify");
    expect(source).toContain("TDAI_FORMAL_MEMORY_CORE_API_KEY");
    expect(source).toMatch(/Authorization\s*=\s*"Bearer \$CoreApiKey"/u);
    expect(source).toContain("eval:tool-prompt:formal:build-restore-plan");
    expect(source).toContain("eval:tool-prompt:formal:restore-assets");
    expect(source).toContain("run-formal-prepare.ps1");
    expect(source).toContain("eval:tool-prompt:formal:inspect-assets");
    expect(source).toContain("create-formal-preflight-receipt.ps1");
    expect(source).toContain("$expectedRunCount = 12");
    expect(source).toContain("Assert-FinalGitLocks");
    expect(source).toContain("finalGitLocks");
    expect(source).toContain("ready");
    expect(source).toContain("CreateNew");
    expect(source).toMatch(/ValidateSet\("Restore",\s*"Inspect"\)/u);
    expect(source).toContain("KnowledgeReadyConfirmed");
    expect(source).toContain("wait-for-knowledge-ready");
    expect(source).toMatch(/git[\s\S]*status[\s\S]*--porcelain/u);
    expect(source).toMatch(/git[\s\S]*cat-file[\s\S]*-t/u);
    expect(source).not.toMatch(/run-formal-execute|formal-execution-cli|codex\s+exec/iu);
    expect(source).not.toMatch(/docker|compose|Start-Process|npm\s+(?:install|ci)/iu);
    expect(source).not.toMatch(/auth\.json|login|logout/iu);
    expect(source).not.toMatch(/\$memoryCoreApiKey\s*\|\s*ConvertTo-Json/iu);
  });

  it("documents the wrapper as a reusable preparation stage, not a method result", async () => {
    const runbook = await readFile(resolve(
      process.cwd(),
      "eval",
      "tool-prompt-bench",
      "R05-PRODUCTION-ASSET-ADAPTER-RUNBOOK.md",
    ), "utf8");
    const r04Runbook = await readFile(resolve(
      process.cwd(),
      "eval",
      "tool-prompt-bench",
      "R04-FORMAL-CAMPAIGN-RUNBOOK.md",
    ), "utf8");

    expect(runbook).toContain("run-r05-runtime-preflight.ps1");
    expect(runbook).toContain("-Stage Restore");
    expect(runbook).toContain("-Stage Inspect -KnowledgeReadyConfirmed");
    expect(runbook).toMatch(/wait-for-knowledge-ready[\s\S]*同一[\s\S]*RunRoot/u);
    expect(runbook).toMatch(/等待异步 code-graph[\s\S]*不算失败[\s\S]*不换栈/u);
    expect(runbook).not.toMatch(/code-graph 尚未达到 `ready`[\s\S]*新的 RunRoot/u);
    expect(runbook).toMatch(/公共准备链/u);
    expect(runbook).toMatch(/所有创新/u);
    expect(runbook).toMatch(/不(?:是|代表).*(?:创新|方法).*结果/u);
    expect(runbook).toMatch(/support worktree[\s\S]*只完成[\s\S]*离线测试/u);
    expect(runbook).toMatch(/历史测试数[\s\S]*不能代替当前集成 Gate/u);
    expect(runbook).toMatch(/Measurement-v2 integration provisional common-base/u);
    expect(runbook).toMatch(/Selection Contract[\s\S]*freeze manifest/u);
    expect(runbook).toMatch(/不得再修改 HEAD/u);
    expect(runbook).toMatch(/普通 Prompt[\s\S]*不重跑公共 Gate/u);
    expect(runbook).not.toMatch(/\$R05Root\s*=\s*"D:\\projects\\TencentDB-Agent-Memory-task1-r05-runtime-gate-repro-v1"/u);
    expect(r04Runbook).toMatch(/历史 checkpoint/u);
    expect(r04Runbook).toContain("$ExecutionRoot");
    expect(r04Runbook).toMatch(/E01\/R04 V0 runtime smoke/u);
    expect(r04Runbook).toMatch(/tagged candidate-base/u);
  });

  const windowsIt = process.platform === "win32" ? it : it.skip;
  windowsIt("requires an existing restored RunRoot and explicit readiness confirmation for Inspect", () => {
    const root = resolve(process.cwd(), "..");
    const temp = mkdtempSync(resolve(tmpdir(), "task1-r05-two-stage-test-"));
    const commonArguments = [
      "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      resolve(process.cwd(), "eval/tool-prompt-bench/run-r05-runtime-preflight.ps1"),
      "-RepositoryRoot", root,
      "-Config", resolve(process.cwd(), "config.example.yaml"),
      "-FrozenDataRoot", root,
      "-MemoryCoreBaseUrl", "http://127.0.0.1:8420",
      "-MemoryKnowledgeBaseUrl", "http://127.0.0.1:8421",
      "-MemoryProxyBaseUrl", "http://127.0.0.1:8096",
      "-RuntimeServiceId", "space-local",
      "-RuntimeAuthUserId", "user-local",
    ];

    const missingRunRoot = resolve(temp, "missing-run-root");
    const missingResult = spawnSync("powershell.exe", [
      ...commonArguments,
      "-Stage", "Inspect",
      "-RunRoot", missingRunRoot,
      "-KnowledgeReadyConfirmed",
    ], { encoding: "utf8" });
    expect(missingResult.status).not.toBe(0);
    expect(`${missingResult.stdout}\n${missingResult.stderr}`).toMatch(
      /RunRoot.*must already exist.*Inspect/i,
    );
    expect(existsSync(missingRunRoot)).toBe(false);

    const unconfirmedResult = spawnSync("powershell.exe", [
      ...commonArguments,
      "-Stage", "Inspect",
      "-RunRoot", temp,
    ], { encoding: "utf8" });
    expect(unconfirmedResult.status).not.toBe(0);
    expect(`${unconfirmedResult.stdout}\n${unconfirmedResult.stderr}`).toMatch(
      /KnowledgeReadyConfirmed.*required.*Inspect/i,
    );

    const repeatedRestoreResult = spawnSync("powershell.exe", [
      ...commonArguments,
      "-Stage", "Restore",
      "-RunRoot", temp,
    ], { encoding: "utf8" });
    expect(repeatedRestoreResult.status).not.toBe(0);
    expect(`${repeatedRestoreResult.stdout}\n${repeatedRestoreResult.stderr}`).toMatch(
      /RunRoot.*must not already exist.*Restore/i,
    );
  }, 20_000);

  windowsIt("rejects each non-loopback service URL before Node or live-service checks", () => {
    const root = resolve(process.cwd(), "..");
    const serviceArguments = [
      "-MemoryCoreBaseUrl",
      "-MemoryKnowledgeBaseUrl",
      "-MemoryProxyBaseUrl",
    ] as const;
    for (const nonLoopbackArgument of serviceArguments) {
      const temp = mkdtempSync(resolve(tmpdir(), "task1-r05-loopback-test-"));
      const runRoot = resolve(temp, "must-not-exist");
      const urls = new Map<string, string>([
        ["-MemoryCoreBaseUrl", "http://127.0.0.1:8420"],
        ["-MemoryKnowledgeBaseUrl", "http://127.0.0.1:8421"],
        ["-MemoryProxyBaseUrl", "http://127.0.0.1:8096"],
      ]);
      urls.set(nonLoopbackArgument, "https://example.com");
      const result = spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
        resolve(process.cwd(), "eval/tool-prompt-bench/run-r05-runtime-preflight.ps1"),
        "-RepositoryRoot", root,
        "-Config", resolve(process.cwd(), "config.example.yaml"),
        "-RunRoot", runRoot,
        "-FrozenDataRoot", root,
        ...[...urls.entries()].flat(),
        "-RuntimeServiceId", "space-local",
        "-RuntimeAuthUserId", "user-local",
        "-DryRun",
      ], { encoding: "utf8" });

      expect(result.status, nonLoopbackArgument).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`, nonLoopbackArgument).toMatch(/loopback/i);
      expect(existsSync(runRoot), nonLoopbackArgument).toBe(false);
    }
  }, 20_000);
});
