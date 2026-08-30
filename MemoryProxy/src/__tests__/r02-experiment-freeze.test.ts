import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";
import { buildR02ExperimentFreezeManifest } from "../../eval/tool-prompt-bench/formal-runtime/capture-r02-experiment-freeze.js";

const manifestPath = resolve(
  "eval/tool-prompt-bench/EXPERIMENT-FREEZE-MANIFEST.json",
);

describe("R02 experiment freeze acceptance", () => {
  it("rebuilds the checked freeze manifest byte-for-byte as JSON", () => {
    const expected = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(buildR02ExperimentFreezeManifest(resolve(".."))).toEqual(expected);
  }, 20_000);

  it("binds the canonical digest without self-reference", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const { manifestCanonicalSha256, ...unsignedManifest } = manifest;
    expect(manifestCanonicalSha256).toBe(canonicalSha256(unsignedManifest));
  });

  it("remains prepare-only and formal-metric-ineligible", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      executionContract: Record<string, unknown>;
    };
    expect(manifest.executionContract).toMatchObject({
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      prepareOnly: true,
      readsOrWritesCodexAuth: false,
      modelRuns: 0,
      formalMetricEligible: false,
    });
  });
});
