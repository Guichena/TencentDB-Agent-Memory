import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSha256 } from "../measurement-v2/canonical-json.js";

const R02_SOURCE_COMMIT = "41bce09fd034c41f694f5fda5f776a09cb3efc69";
const R01_SOURCE_COMMIT = "b7944f2ef252eb454de619382b87eb89da1ce0dc";
const DATA_TAG = "task1-data-formal-v1.1";
const DATA_TAG_OBJECT = "6ba3a0e4098786882dd500f884823f2f8dfbb9d3";
const DATA_COMMIT = "02620d8313dcb883b7a57c4c2edc8f4286eb4bc9";
const CODE_FREEZE_TAG = "task1-code-freeze";
const CODE_FREEZE_TAG_OBJECT = "edbf18309fbf100cdf5b26d64c0fbb6f12c8f3a5";
const CODE_FREEZE_COMMIT = "d0996809ed63f6cfc67504ad180db0d48ac70475";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../../..");
const OUTPUT_PATH = "MemoryProxy/eval/tool-prompt-bench/EXPERIMENT-FREEZE-MANIFEST.json";

const SOURCE_ARTIFACTS = {
  adapter: [
    "MemoryProxy/eval/tool-prompt-bench/real-chain-adapter.ts",
  ],
  config: [
    "MemoryProxy/src/config.ts",
    "MemoryProxy/src/experiment-config-fingerprint.ts",
  ],
  prompt: [
    "MemoryProxy/eval/tool-prompt-bench/variants/code-freeze/code-freeze-manifest.json",
  ],
  runner: [
    "MemoryProxy/eval/tool-prompt-bench/formal-prepare-cli.ts",
    "MemoryProxy/eval/tool-prompt-bench/formal-prepare-datasource.ts",
    "MemoryProxy/eval/tool-prompt-bench/formal-prepare-entry.ts",
    "MemoryProxy/eval/tool-prompt-bench/formal-prepare-runner.ts",
    "MemoryProxy/eval/tool-prompt-bench/run-formal-prepare.ps1",
  ],
  scorer: [
    "MemoryProxy/eval/tool-prompt-bench/evaluator.ts",
    "MemoryProxy/eval/tool-prompt-bench/score.ts",
    "MemoryProxy/eval/tool-prompt-bench/formal-runtime/private-loader.ts",
  ],
  data: [
    "MemoryProxy/eval/tool-prompt-bench/formal-runtime/frozen/formal-runtime-freeze.json",
  ],
} as const;

const ACCEPTANCE_OVERLAY_ARTIFACTS = [
  "MemoryProxy/package.json",
  "MemoryProxy/eval/tool-prompt-bench/formal-runtime/capture-r02-experiment-freeze.ts",
  "MemoryProxy/eval/tool-prompt-bench/formal-runtime/vitest.r02.config.ts",
  "MemoryProxy/src/__tests__/r02-experiment-freeze.test.ts",
] as const;

const REQUIRED_COMMANDS = [
  "eval:tool-prompt:d0:test",
  "eval:tool-prompt:test",
  "eval:tool-prompt:real-chain:gate",
  "eval:tool-prompt:formal:gate",
  "eval:tool-prompt:formal:prepare",
  "eval:tool-prompt:formal:freeze-runtime",
  "eval:tool-prompt:capture-freeze",
  "eval:tool-prompt:formal:capture-r02-freeze",
] as const;

interface ArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly fileSha256: string;
  readonly gitBlobSha1?: string;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function gitText(repositoryRoot: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function gitBytes(repositoryRoot: string, revisionAndPath: string): Buffer {
  return execFileSync("git", ["show", revisionAndPath], {
    cwd: repositoryRoot,
  });
}

function sourceArtifact(
  repositoryRoot: string,
  path: string,
): ArtifactIdentity {
  const content = gitBytes(repositoryRoot, `${R02_SOURCE_COMMIT}:${path}`);
  return {
    path,
    bytes: content.length,
    fileSha256: sha256(content),
    gitBlobSha1: gitText(repositoryRoot, "rev-parse", `${R02_SOURCE_COMMIT}:${path}`),
  };
}

function overlayArtifact(
  repositoryRoot: string,
  path: string,
): ArtifactIdentity {
  const content = readFileSync(resolve(repositoryRoot, path));
  return {
    path,
    bytes: content.length,
    fileSha256: sha256(content),
  };
}

function readJsonAt(
  repositoryRoot: string,
  revision: string,
  path: string,
): Record<string, unknown> {
  return JSON.parse(
    gitBytes(repositoryRoot, `${revision}:${path}`).toString("utf8"),
  ) as Record<string, unknown>;
}

function assertFrozenAnnotatedTag(
  repositoryRoot: string,
  tag: string,
  expectedTagObject: string,
  expectedCommit: string,
): void {
  const objectType = gitText(repositoryRoot, "cat-file", "-t", tag);
  if (objectType !== "tag") {
    throw new Error(`${tag} must resolve to an annotated tag object`);
  }
  const actualTagObject = gitText(repositoryRoot, "rev-parse", tag);
  const actualCommit = gitText(repositoryRoot, "rev-parse", `${tag}^{}`);
  if (actualTagObject !== expectedTagObject || actualCommit !== expectedCommit) {
    throw new Error(
      `${tag} drifted: expected ${expectedTagObject} -> ${expectedCommit}; `
      + `got ${actualTagObject} -> ${actualCommit}`,
    );
  }
}

function assertR02Lineage(repositoryRoot: string): void {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", R01_SOURCE_COMMIT, R02_SOURCE_COMMIT],
      { cwd: repositoryRoot, stdio: "ignore" },
    );
  } catch {
    throw new Error("R02 source commit no longer descends from the frozen R01 source");
  }
}

function readCommandSet(repositoryRoot: string): Record<string, string> {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, "MemoryProxy/package.json"), "utf8"),
  ) as { scripts?: Record<string, unknown> };
  const scripts = packageJson.scripts ?? {};
  return Object.fromEntries(REQUIRED_COMMANDS.map((name) => {
    const command = scripts[name];
    if (typeof command !== "string" || command.length === 0) {
      throw new Error(`required R02 acceptance command is missing: ${name}`);
    }
    return [name, command];
  }));
}

function assertRuntimeFreeze(runtimeFreeze: Record<string, unknown>): void {
  const dataFreeze = runtimeFreeze.dataFreeze as Record<string, unknown> | undefined;
  const counts = runtimeFreeze.counts as Record<string, unknown> | undefined;
  if (
    runtimeFreeze.schemaVersion !== "task1.formal-runtime-freeze.v1"
    || dataFreeze?.tag !== DATA_TAG
    || dataFreeze.tagObject !== DATA_TAG_OBJECT
    || dataFreeze.commit !== DATA_COMMIT
    || counts?.total !== 640
    || counts.dev !== 240
    || counts.hiddenTest !== 400
    || runtimeFreeze.formalMetricEligible !== false
  ) {
    throw new Error("R02 formal runtime freeze no longer matches formal-v1.1");
  }
}

export function buildR02ExperimentFreezeManifest(
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
): Record<string, unknown> {
  assertR02Lineage(repositoryRoot);
  assertFrozenAnnotatedTag(
    repositoryRoot,
    DATA_TAG,
    DATA_TAG_OBJECT,
    DATA_COMMIT,
  );
  assertFrozenAnnotatedTag(
    repositoryRoot,
    CODE_FREEZE_TAG,
    CODE_FREEZE_TAG_OBJECT,
    CODE_FREEZE_COMMIT,
  );

  const runtimeFreezePath = SOURCE_ARTIFACTS.data[0];
  const runtimeFreeze = readJsonAt(repositoryRoot, R02_SOURCE_COMMIT, runtimeFreezePath);
  assertRuntimeFreeze(runtimeFreeze);

  const sourceArtifacts = Object.fromEntries(
    Object.entries(SOURCE_ARTIFACTS).map(([category, paths]) => [
      category,
      paths.map((path) => sourceArtifact(repositoryRoot, path)),
    ]),
  );
  const commands = readCommandSet(repositoryRoot);
  const unsignedManifest = {
    schemaVersion: "task1.r02-experiment-freeze.v1",
    stage: "R02-acceptance",
    acceptanceStatus: "HISTORICAL_R02_ATTESTED_DOWNSTREAM_GATE_REQUIRED",
    sourceCommittedAt: gitText(
      repositoryRoot,
      "show",
      "-s",
      "--format=%cI",
      R02_SOURCE_COMMIT,
    ),
    implementation: {
      sourceCommit: R02_SOURCE_COMMIT,
      sourceTree: gitText(repositoryRoot, "rev-parse", `${R02_SOURCE_COMMIT}^{tree}`),
      r01Ancestor: R01_SOURCE_COMMIT,
    },
    freezes: {
      data: {
        tag: DATA_TAG,
        tagObject: gitText(repositoryRoot, "rev-parse", DATA_TAG),
        commit: gitText(repositoryRoot, "rev-parse", `${DATA_TAG}^{}`),
        runtimeFreeze,
      },
      prompt: {
        tag: CODE_FREEZE_TAG,
        tagObject: gitText(repositoryRoot, "rev-parse", CODE_FREEZE_TAG),
        commit: gitText(repositoryRoot, "rev-parse", `${CODE_FREEZE_TAG}^{}`),
      },
    },
    sourceArtifacts,
    acceptanceOverlayArtifacts: ACCEPTANCE_OVERLAY_ARTIFACTS.map((path) => (
      overlayArtifact(repositoryRoot, path)
    )),
    commands,
    commandSetSha256: canonicalSha256(commands),
    executionContract: {
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      prepareOnly: true,
      readsOrWritesCodexAuth: false,
      modelRuns: 0,
      formalMetricEligible: false,
      candidateBaseEligible: false,
    },
    downstreamRequirement: {
      reason:
        "Historical R02 predates the repaired Measurement-v2 overcall contract; final acceptance must use the R05-compatible scorer and rerun this freeze on the common integration base.",
      requiredAncestor: "c86b154f9f597da0788592c66b93d574fd3f10f9",
      requiredScorerContract: "M0_R05_REPAIRED_OVERCALL_AND_TERMINAL_HORIZON",
      requiredGates: [
        "D0_TYPESCRIPT_42_OF_42",
        "D0_PYTHON_19_OF_19",
        "R05_RUNTIME_SMOKE_12_OF_12_READY",
        "MEASUREMENT_V2_INTEGRATION_PASS",
        "SELECTION_CONTRACT_FROZEN",
      ],
      closesOnly: "R02 historical acceptance; satisfying it does not itself create a candidate base.",
    },
  };
  return {
    ...unsignedManifest,
    manifestCanonicalSha256: canonicalSha256(unsignedManifest),
  };
}

export function writeR02ExperimentFreezeManifest(
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
): void {
  const manifest = buildR02ExperimentFreezeManifest(repositoryRoot);
  writeFileSync(
    resolve(repositoryRoot, OUTPUT_PATH),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  writeR02ExperimentFreezeManifest();
  console.log(`captured ${OUTPUT_PATH}`);
}
