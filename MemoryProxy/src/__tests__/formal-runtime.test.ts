import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FORMAL_DATA_COMMIT,
  FORMAL_DATA_TAG,
  FORMAL_DATA_TAG_OBJECT,
  loadFormalDatasetMetadata,
  loadFormalProviderSplit,
  resolveFormalDataFreeze,
} from "../../eval/tool-prompt-bench/formal-runtime/index.js";

describe("Task 1 formal runtime freeze", () => {
  it("accepts only the annotated formal-v1.1 data tag and pins its object and commit", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });

    expect(freeze).toMatchObject({
      tag: FORMAL_DATA_TAG,
      tagObject: FORMAL_DATA_TAG_OBJECT,
      commit: FORMAL_DATA_COMMIT,
      objectType: "tag",
      statusTagBlob: "6e1f9324b0f2a5cce645340701ad9624f3683c21",
      statusFileSha256: "94c447322c8c204403b44a4abf6f691480b8902c3300caa09224ac11fe3f1267",
      formalMetricEligible: false,
    });

    for (const rejectedTag of ["task1-data-formal-v1", "task1-data-core-formal-v1"]) {
      expect(() => resolveFormalDataFreeze({
        repositoryRoot: process.cwd(),
        tag: rejectedTag,
      })).toThrow(/rejected formal data tag/);
    }
  });

  it("loads only the selected provider JSONL and gates hidden before any read", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    const readText = (path: string): string => {
      reads.push(path);
      return path.endsWith("dev.jsonl")
        ? [
          JSON.stringify({
            caseId: "T01-CASE-001",
            language: "zh",
            contextMessages: [{ role: "user", content: "已有上下文" }],
            query: "现在该怎么做？",
          }),
          JSON.stringify({
            caseId: "T01-CASE-002",
            language: "en",
            contextMessages: [],
            query: "What next?",
          }),
        ].join("\n")
        : "";
    };

    const dev = loadFormalProviderSplit({ freeze, split: "dev", readText });
    expect(dev).toMatchObject({
      split: "dev",
      count: 2,
      formalMetricEligible: false,
    });
    expect(dev.fileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(dev.canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(dev.cases.map((item) => item.caseId)).toEqual([
      "T01-CASE-001",
      "T01-CASE-002",
    ]);
    expect(Object.isFrozen(dev.cases)).toBe(true);
    expect(Object.isFrozen(dev.cases[0])).toBe(true);
    expect(Object.isFrozen(dev.cases[0]?.contextMessages)).toBe(true);
    expect(Object.isFrozen(dev.cases[0]?.contextMessages[0])).toBe(true);
    expect(reads).toEqual([
      expect.stringMatching(/[\\/]provider[\\/]dev\.jsonl$/),
    ]);

    reads.length = 0;
    expect(() => loadFormalProviderSplit({
      freeze,
      split: "hidden_test",
      readText,
    })).toThrow(/hidden_test provider access is not authorized/);
    expect(reads).toEqual([]);
  });

  it("rejects private or unknown fields in a provider row", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    expect(() => loadFormalProviderSplit({
      freeze,
      split: "dev",
      readText: () => JSON.stringify({
        caseId: "T01-CASE-001",
        language: "zh",
        contextMessages: [],
        query: "query",
        gold: { needTdaiTool: true },
      }),
    })).toThrow(/provider row has unexpected key: gold/);
  });

  it("loads all 640 provider cases with frozen split hashes", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const dev = loadFormalProviderSplit({ freeze, split: "dev" });
    const hidden = loadFormalProviderSplit({
      freeze,
      split: "hidden_test",
      allowHiddenTest: true,
    });

    expect(dev).toMatchObject({
      count: 240,
      fileSha256: "8018bb65160eb1cac13e489ae54f258f2369dc4af058f09a3e1dc432961bc1f3",
      canonicalSha256: "ab1842aa1cc6d36a79bd8c232f2d66fd0d097c50eea4c2c09c4b4c8393e6308a",
      formalMetricEligible: false,
    });
    expect(hidden).toMatchObject({
      count: 400,
      fileSha256: "743b2ee051572c81aec8b4db6b581a77143ed283ee136448b095e8576e0d5799",
      canonicalSha256: "fc2d655011681cf63c38e5b71e92790ebeb601ec77ed5cf2ac42784aa73e212b",
      formalMetricEligible: false,
    });
    expect(new Set([...dev.cases, ...hidden.cases].map((item) => item.caseId)).size).toBe(640);
  });

  it("reads public status metadata for private hashes without opening private files", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    const metadata = loadFormalDatasetMetadata({
      freeze,
      readText: (path) => {
        reads.push(path);
        return readFileSync(path, "utf8");
      },
    });

    expect(reads).toEqual([
      expect.stringMatching(/[\\/]formal-dataset[\\/]DATASET-BUILD-STATUS\.json$/),
    ]);
    expect(metadata).toMatchObject({
      datasetContractRevision: "formal-v1",
      dataFreeze: {
        tag: FORMAL_DATA_TAG,
        tagObject: FORMAL_DATA_TAG_OBJECT,
        commit: FORMAL_DATA_COMMIT,
        statusTagBlob: "6e1f9324b0f2a5cce645340701ad9624f3683c21",
        statusFileSha256: "94c447322c8c204403b44a4abf6f691480b8902c3300caa09224ac11fe3f1267",
      },
      counts: { total: 640, dev: 240, hiddenTest: 400, pairs: 240 },
      contractHashes: {
        fileSha256: "991ff87255019c0d4b64deba16b76b144bd3c63138be355c747865329e83da44",
        canonicalSha256: "4fc62c1829301fe9f2410f6be40698d7b3d09ec90dde3bfe294452f7ef152d41",
      },
      snapshotHashes: {
        devCanonicalSha256: "3a82d0ad8241ff3e2173555efbdb65dfb367a0a38c9998203c5b4754611a4783",
        hiddenCanonicalSha256: "23fe7b47d13c950765fa9557da918e1d102b7ab4558171cb15a8444d1cbd9c9e",
      },
      privateArtifactHashes: {
        measurementV2ManifestCanonicalSha256: "ff5384e0386079a1e16464063247520eae7ea4964b43c6b7a9972e38b2ba7da9",
        goldV2FullCanonicalSha256: "7b08420acc04894b2a9aa6f56a17994bc79f2d1913032eebb94a17ace332e3a8",
        pairV2FullCanonicalSha256: "79f531d3cef550c390c167444f9f97d656b78d95c5392a4962a2a65a94c10652",
        runtimeContractsV2CanonicalSha256: "42c1f5847fe88ed70ec9ce35217dcd8cfdc90fa8a7dd9a53e45b50481204b96e",
      },
      formalMetricEligible: false,
    });
  });
});
