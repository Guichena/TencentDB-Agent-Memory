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
      datasetRevision: "formal-v1",
      datasetTag: "task1-data-formal-v1.1",
      datasetTagObject: freeze.tagObject,
      datasetCommit: freeze.commit,
      formalMetricEligible: false,
    });
    expect(status.splits.dev).toMatchObject({
      expectedCaseCount: 240,
      privateGoldHashScope: "measurement-v2-split-canonical",
      pairContractHashScope: "measurement-v2-split-canonical",
    });
    expect(status.preregisteredSmokeCaseIds).toHaveLength(12);
    expect(dev.cases).toHaveLength(240);
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
});
