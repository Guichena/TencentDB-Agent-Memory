import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createFormalPrepareDataSource } from "../../eval/tool-prompt-bench/formal-prepare-datasource.js";
import { resolveFormalDataFreeze } from "../../eval/tool-prompt-bench/formal-runtime/index.js";

describe("R02 PrepareOnly public datasource adapter", () => {
  it("joins the frozen Dev provider/bindings and projects only public hash metadata", async () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const source = createFormalPrepareDataSource({ freeze });
    const status = await source.readPublicStatus();
    const dev = await source.openProviderSplit("dev");

    expect(status).toMatchObject({
      datasetRevision: "formal-v2.1-repo-backed-640",
      datasetTag: "task1-data-formal-v2.1",
      datasetTagObject: freeze.tagObject,
      datasetCommit: freeze.commit,
      formalMetricEligible: false,
    });
    expect(status.splits.dev).toMatchObject({
      expectedCaseCount: 320,
      privateGoldHashScope: "repo-backed-v2.1-file",
      pairContractHashScope: "repo-backed-v2.1-file",
    });
    expect(status.splits.hidden_test.expectedCaseCount).toBe(320);
    expect(status.preregisteredSmokeCaseIds).toHaveLength(40);
    expect(dev.cases).toHaveLength(320);
    expect(new Set(dev.cases.map((item) => item.binding.identity.teamId))).not.toContain("T05");
    expect(dev.caseBindingsFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(dev.cases[0]).toMatchObject({
      split: "dev",
      providerRecord: { caseId: expect.any(String) },
      binding: {
        identity: { spaceId: expect.any(String), teamId: expect.any(String) },
        snapshotId: expect.any(String),
        visibleAssetSetSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(JSON.stringify(dev.cases[0])).not.toMatch(/allowedSequences|expectedTool|terminal|gold/i);
  });

  it("rejects hidden access before invoking any reader and has no private-loader dependency", async () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    const source = createFormalPrepareDataSource({
      freeze,
      readText(path) {
        reads.push(path);
        throw new Error("reader must not run");
      },
    });

    await expect(source.openProviderSplit("hidden_test")).rejects.toThrow(/not authorized/i);
    expect(reads).toEqual([]);

    const sourceText = await readFile(
      join(process.cwd(), "eval/tool-prompt-bench/formal-prepare-datasource.ts"),
      "utf8",
    );
    expect(sourceText).not.toMatch(/from ["'].*private-loader/);
  });

  it("excludes the four archived no-workspace Teams from the active Hidden split", async () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const source = createFormalPrepareDataSource({ freeze });
    const hidden = await source.openProviderSplit("hidden_test", { allowHiddenTest: true });
    const teams = new Set(hidden.cases.map((item) => item.binding.identity.teamId));

    expect(hidden.cases).toHaveLength(320);
    expect([...teams].sort()).toEqual([
      "T07", "T08", "T09", "T10", "T15", "T16", "T19", "T20",
    ]);
  });

  it("reads the active projection and uses the corrected DVC binding", async () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    const source = createFormalPrepareDataSource({
      freeze,
      readText(path) {
        reads.push(path.replace(/\\/gu, "/"));
        return readFileSync(path, "utf8");
      },
    });
    const dev = await source.openProviderSplit("dev");
    const positive = dev.cases.find((item) => item.providerRecord.caseId === "T03-MEM-001-P");
    const negative = dev.cases.find((item) => item.providerRecord.caseId === "T03-MEM-001-N");
    const dvcAnchor = dev.cases.find((item) => item.providerRecord.caseId === "T03-MEM-005-P");

    expect(positive?.binding.workspace).toMatchObject({
      workspaceId: "workspace-t03-project-dvc-pipelines",
      repoSlug: "iterative/dvc",
      baseCommit: "a2f1367a9a75849ef6ad7ee23a5bacc18580f102",
    });
    expect(negative?.binding.workspace).toEqual(positive?.binding.workspace);
    expect(positive?.binding.identity.taskId).toBe(dvcAnchor?.binding.identity.taskId);
    expect(negative?.binding.identity.taskId).toBe(dvcAnchor?.binding.identity.taskId);
    expect(reads).toContainEqual(expect.stringMatching(
      /formal-dataset\/repo-backed-v2\.1\/provider\/dev\.jsonl$/u,
    ));
    expect(reads).not.toContainEqual(expect.stringMatching(
      /formal-dataset\/provider\/dev\.jsonl$/u,
    ));
  });
});
