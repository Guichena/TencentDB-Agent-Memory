import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertAnnotatedTagIdentity,
  buildTask1CandidateBaseManifest,
  readSelectionContractCanonicalSha256,
  serializeTask1CandidateBaseManifest,
  TASK1_CANDIDATE_BASE_SELECTION_CONTRACT_SHA256,
  TASK1_CANDIDATE_BASE_TAGS,
} from "../../eval/tool-prompt-bench/measurement-v2/build-provisional-freeze-manifest.js";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";

const repositoryRoot = resolve("..");
const storedManifestPath = resolve(
  repositoryRoot,
  "MemoryProxy/eval/tool-prompt-bench/measurement-v2/PROVISIONAL-FREEZE-MANIFEST.json",
);

describe("Task 1 candidate-base manifest", () => {
  it("rejects CLI arguments without changing the manifest or writing partial stdout", () => {
    const before = readFileSync(storedManifestPath, "utf8");
    const result = spawnSync(process.execPath, [
      "--import", "tsx/esm",
      resolve(
        process.cwd(),
        "eval/tool-prompt-bench/measurement-v2/build-provisional-freeze-manifest.ts",
      ),
      "--bogus",
    ], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/does not accept arguments/i);
    expect(readFileSync(storedManifestPath, "utf8")).toBe(before);
  });

  it("is deterministic, self-digesting, and byte-identical to the stored manifest", () => {
    const first = serializeTask1CandidateBaseManifest(repositoryRoot);
    const second = serializeTask1CandidateBaseManifest(repositoryRoot);
    expect(second).toBe(first);
    expect(readFileSync(storedManifestPath, "utf8")).toBe(first);

    const manifest = buildTask1CandidateBaseManifest(repositoryRoot);
    const { canonicalSha256: recorded, ...unsignedManifest } = manifest;
    expect(recorded).toBe(canonicalSha256(unsignedManifest));
    expect(manifest).toMatchObject({
      schemaVersion: "task1.candidate-base.v1",
      status: "awaiting-r05",
      formalData: TASK1_CANDIDATE_BASE_TAGS.data,
      promptBaseline: TASK1_CANDIDATE_BASE_TAGS.prompt,
      selectionContract: {
        canonicalSha256: TASK1_CANDIDATE_BASE_SELECTION_CONTRACT_SHA256,
      },
      executionCohort: {
        model: "gpt-5.6-luna",
        reasoningEffort: "high",
        verbosity: "medium",
        provider: "openai",
        apiProtocol: "responses-v1",
        adapterVersion: "memory-proxy-provider-observer-v1",
        nodeMajor: 22,
        codexCliVersion: null,
      },
      tokenizer: {
        id: "o200k_base",
        version: "tiktoken-1.0.22",
      },
      r05: {
        status: "pending",
        receiptSha256: null,
        runtimeConfigFileSha256: null,
      },
      modelRunsAtFreeze: 0,
    });
  });

  it("rejects annotated-tag and Selection Contract drift", () => {
    expect(() => assertAnnotatedTagIdentity(repositoryRoot, {
      ...TASK1_CANDIDATE_BASE_TAGS.data,
      tagObject: "0".repeat(40),
    })).toThrow(/drift/i);

    expect(() => readSelectionContractCanonicalSha256(
      repositoryRoot,
      "0".repeat(64),
    )).toThrow(/canonical hash drift/i);
  });
});
