import { describe, expect, it } from "vitest";

import {
  buildFormalRuntimeFreezeManifest,
  serializeFormalRuntimeFreezeManifest,
} from "../../eval/tool-prompt-bench/formal-runtime/build-runtime-freeze.js";
import {
  FORMAL_DATA_COMMIT,
  FORMAL_DATA_TAG,
  FORMAL_DATA_TAG_OBJECT,
  FORMAL_RUNTIME_FREEZE_CANONICAL_SHA256,
  FORMAL_RUNTIME_FREEZE_FILE_SHA256,
  loadFormalRuntimeFreezeManifest,
  resolveFormalDataFreeze,
} from "../../eval/tool-prompt-bench/formal-runtime/index.js";

describe("Task 1 formal runtime hash-only freeze", () => {
  it("binds public data, runtime bindings, smoke, and Measurement-v2 split hashes", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const manifest = buildFormalRuntimeFreezeManifest({ freeze });

    expect(manifest).toMatchObject({
      schemaVersion: "task1.formal-runtime-freeze.v1",
      datasetContractRevision: "formal-v1",
      dataFreeze: {
        tag: FORMAL_DATA_TAG,
        tagObject: FORMAL_DATA_TAG_OBJECT,
        commit: FORMAL_DATA_COMMIT,
      },
      counts: { total: 640, dev: 240, hiddenTest: 400 },
      measurementV2: {
        manifestCanonicalSha256: "ff5384e0386079a1e16464063247520eae7ea4964b43c6b7a9972e38b2ba7da9",
        gold: {
          devCanonicalSha256: "8cfffec5c06b37b92b41cf95ee0d70333e9a2a7f6063145100b20ce753fe58c5",
          hiddenCanonicalSha256: "fdcbfbce3ada6b274cdfb6a9444c3f151af004b6186ca5e0186fe7e16d3c883f",
          fullCanonicalSha256: "7b08420acc04894b2a9aa6f56a17994bc79f2d1913032eebb94a17ace332e3a8",
        },
        pairs: {
          devCanonicalSha256: "72def9ee92733ad5b2bc33f40ff500a75abf748ccdf4703f6b8464678e508c31",
          hiddenCanonicalSha256: "9195cf6dc6fbec5dca2f1824c93763f50d42cb3f00f06339f7431dde239b42b8",
          fullCanonicalSha256: "79f531d3cef550c390c167444f9f97d656b78d95c5392a4962a2a65a94c10652",
        },
        runtimeContractsCanonicalSha256: "42c1f5847fe88ed70ec9ce35217dcd8cfdc90fa8a7dd9a53e45b50481204b96e",
      },
      artifacts: {
        caseBindings: { count: 640, devCount: 240, hiddenTestCount: 400 },
        devSmokePreregistration: {
          count: 12,
          fileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          selectionCanonicalSha256: "f300079fc408878cf2bf5921a9e6b3004ce9e5fa3034857221554c00a9a101ec",
        },
      },
      formalMetricEligible: false,
    });
    expect(manifest.sources.snapshots).toEqual({
      devCanonicalSha256: "3a82d0ad8241ff3e2173555efbdb65dfb367a0a38c9998203c5b4754611a4783",
      hiddenCanonicalSha256: "23fe7b47d13c950765fa9557da918e1d102b7ab4558171cb15a8444d1cbd9c9e",
    });

    const first = serializeFormalRuntimeFreezeManifest(manifest);
    const second = serializeFormalRuntimeFreezeManifest(buildFormalRuntimeFreezeManifest({ freeze }));
    expect(second).toBe(first);
    expect(first).not.toMatch(/"query"|"contextMessages"|"allowedSequences"|"positiveCaseId"/u);

    const loaded = loadFormalRuntimeFreezeManifest({ freeze });
    expect(loaded).toEqual(manifest);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.measurementV2.gold)).toBe(true);
    expect(FORMAL_RUNTIME_FREEZE_FILE_SHA256).toBe("eb759933bf57ac158682c12cc794020f2d13078b6c929127d930302b0fe83e3c");
    expect(FORMAL_RUNTIME_FREEZE_CANONICAL_SHA256).toBe("6aab76908f0806d0a71d5975866a850f946e66dc96a0dc8023f4e71645be98db");
  });
});
