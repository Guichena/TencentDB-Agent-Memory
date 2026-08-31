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
      datasetContractRevision: "formal-v2.1",
      dataFreeze: {
        tag: FORMAL_DATA_TAG,
        tagObject: FORMAL_DATA_TAG_OBJECT,
        commit: FORMAL_DATA_COMMIT,
      },
      counts: { total: 800, dev: 320, hiddenTest: 480 },
      measurementV2: {
        manifestCanonicalSha256: "a9756066d59ea2a972fb48910bf8099fd218a4541bf8451393114cd5feeb13bc",
        gold: {
          devCanonicalSha256: "720d5ee06bebb6edb5b15698d605590bf917998eedf6f448692b1fdf16bb3657",
          hiddenCanonicalSha256: "2e5c5bf72c2fa162944ddf7fdc788b9cc2d9cbb2bbce42e27b9d98773e69565f",
          fullCanonicalSha256: "0f57a9b87d6c6a044fcb627e75c701fb63e90d1fce47a22be011b200b54635fe",
        },
        pairs: {
          devCanonicalSha256: "a5a5e1e8b2db77c309110cca514024a67cbbf66f15d9744002fc2e5886dc5e9d",
          hiddenCanonicalSha256: "76ee4c151313fb731dc83f51301eee666e105db08b1d08351c6ef87e5727ac3d",
          fullCanonicalSha256: "b99596e3f60da8dc2b9080c7b218ca48829347ed13f73a25a7a853147a4ac85d",
        },
        runtimeContractsCanonicalSha256: "3bd16cf3563711ce08df9da9d71d52db8dffdc200715265b6812961d63dc73d1",
      },
      artifacts: {
        caseBindings: { count: 800, devCount: 320, hiddenTestCount: 480 },
        devSmokePreregistration: {
          count: 40,
          fileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          selectionCanonicalSha256: "523788fad4c50750049ea8efb53e9c4ce43d43d0b05de8696fd403e7efd68bee",
        },
      },
      formalMetricEligible: false,
    });
    expect(manifest.sources.snapshots).toEqual({
      devCanonicalSha256: "addd9c6311d4bd44478ea9438f50816d59eb2c8adfb9c4d9f53fd3fc152e0b7e",
      hiddenCanonicalSha256: "93d18538660330603f082a396791712e9b0cdba6647ea819fa3ca6e456085fbb",
    });

    const first = serializeFormalRuntimeFreezeManifest(manifest);
    const second = serializeFormalRuntimeFreezeManifest(buildFormalRuntimeFreezeManifest({ freeze }));
    expect(second).toBe(first);
    expect(first).not.toMatch(/"query"|"contextMessages"|"allowedSequences"|"positiveCaseId"/u);

    const loaded = loadFormalRuntimeFreezeManifest({ freeze });
    expect(loaded).toEqual(manifest);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.measurementV2.gold)).toBe(true);
    expect(FORMAL_RUNTIME_FREEZE_FILE_SHA256).toBe("69480e56ae6281711c926fda743a38c7ff9d76874f94e19a0e430b5d9a9596e4");
    expect(FORMAL_RUNTIME_FREEZE_CANONICAL_SHA256).toBe("64c86aa6743714514b4e27384308bd3afc8e073be93c2fd23c11e1d600317854");
  });
});
