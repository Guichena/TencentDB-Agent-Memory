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
  it("accepts only the annotated formal-v2.1 data tag and pins its object and commit", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });

    expect(freeze).toMatchObject({
      tag: FORMAL_DATA_TAG,
      tagObject: FORMAL_DATA_TAG_OBJECT,
      commit: FORMAL_DATA_COMMIT,
      objectType: "tag",
      statusTagBlob: "7a262b13836fd843637e74312ca5b6c9b7e43396",
      statusFileSha256: "acd98947d3892047c9479287325bb502a0a892c2710c5e248c86968c0dcf22cc",
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

  it("loads all 800 provider cases with frozen split hashes", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const dev = loadFormalProviderSplit({ freeze, split: "dev" });
    const hidden = loadFormalProviderSplit({
      freeze,
      split: "hidden_test",
      allowHiddenTest: true,
    });

    expect(dev).toMatchObject({
      count: 320,
      fileSha256: "b062d284cb849edd6504340e81f4f34e1dc37b126dca53edab6062749b1c2ed4",
      canonicalSha256: "2b4d0645d8111699f7a6a06d4fb387b767122037b2c813583fe393068dbcde10",
      formalMetricEligible: false,
    });
    expect(hidden).toMatchObject({
      count: 480,
      fileSha256: "0a38a9433761adaf286b00a62b2bbda6526c41ab83dcad844b0f7b83929118fc",
      canonicalSha256: "34e01c72495d4617ff8951d2c4b0b2a574b9dabc9b621fcd5385bb27c4699566",
      formalMetricEligible: false,
    });
    expect(new Set([...dev.cases, ...hidden.cases].map((item) => item.caseId)).size).toBe(800);
  });

  it("reads public status metadata without opening private files", () => {
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
      datasetContractRevision: "formal-v2.1",
      dataFreeze: {
        tag: FORMAL_DATA_TAG,
        tagObject: FORMAL_DATA_TAG_OBJECT,
        commit: FORMAL_DATA_COMMIT,
        statusTagBlob: "7a262b13836fd843637e74312ca5b6c9b7e43396",
        statusFileSha256: "acd98947d3892047c9479287325bb502a0a892c2710c5e248c86968c0dcf22cc",
      },
      counts: { total: 800, dev: 320, hiddenTest: 480, pairs: 300 },
      contractHashes: {
        fileSha256: "0d398c9e4c46b60f86f245265769062b9ede2ffdf53a80088fe0421fdd797d9d",
        canonicalSha256: "eb04b26cfe03810030f6b7d0a06f82dfedf7c8011ce11bb181db8af0b94b58b7",
      },
      snapshotHashes: {
        devCanonicalSha256: "addd9c6311d4bd44478ea9438f50816d59eb2c8adfb9c4d9f53fd3fc152e0b7e",
        hiddenCanonicalSha256: "93d18538660330603f082a396791712e9b0cdba6647ea819fa3ca6e456085fbb",
      },
      formalMetricEligible: false,
    });
  });
});
