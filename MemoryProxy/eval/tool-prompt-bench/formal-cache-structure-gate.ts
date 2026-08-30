import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { FormalExecutionReceipt } from "./formal-execution-runner.js";

export const FORMAL_PROMPT_FREEZE_TAG = "task1-code-freeze" as const;
export const FORMAL_CACHE_STRUCTURE_GATE_SCHEMA =
  "task1.formal-cache-structure-gate.v1" as const;

const CODE_FREEZE_MANIFEST_PATH =
  "MemoryProxy/eval/tool-prompt-bench/variants/code-freeze/code-freeze-manifest.json";
const PROMPT_OWNERSHIP_PATHS = [
  "MemoryProxy/src/injection",
  "MemoryProxy/src/session/context-injector.ts",
  "MemoryProxy/eval/tool-prompt-bench/variant-profiles.ts",
] as const;
const EXPECTED_VARIANTS = [
  ["V0", "legacy"],
  ["V0-C", "contract-corrected"],
  ["V1a", "protocol-compact"],
  ["V1", "compact"],
  ["V2", "selection-calibrated"],
  ["V3", "capability-pruned"],
] as const;

export interface FormalCacheGitResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type FormalCacheGitRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<FormalCacheGitResult>;

export interface FormalCacheStructureGateReceipt {
  readonly schemaVersion: typeof FORMAL_CACHE_STRUCTURE_GATE_SCHEMA;
  readonly passed: true;
  readonly promptFreezeTag: typeof FORMAL_PROMPT_FREEZE_TAG;
  readonly promptFreezeTagObject: string;
  readonly promptFreezeCommit: string;
  readonly taggedManifestPath: typeof CODE_FREEZE_MANIFEST_PATH;
  readonly taggedManifestSha256: string;
  readonly promptOwnershipPaths: typeof PROMPT_OWNERSHIP_PATHS;
  readonly executionCommits: readonly string[];
  readonly invariants: Readonly<{
    allRunsUseTaggedPromptFreeze: true;
    promptOwnershipPathsUnchangedAfterFreeze: true;
    frozenProfilesComplete: true;
    cacheNamespacesUnique: true;
    staticTemplateHashesPresent: true;
    adjacentPrefixMeasurementsPresent: true;
  }>;
  readonly variants: readonly Readonly<{
    readonly variantId: string;
    readonly profileId: string;
    readonly totalInjectionTokensO200k: number;
    readonly totalInjectionSha256: string;
    readonly effectiveSystemSha256: string;
    readonly stablePrefixBytesFromParent: number;
    readonly firstChangedByteFromParent: number | null;
    readonly cacheNamespace: string;
    readonly runnerPromptSha256: string;
    readonly staticTemplateSha256: readonly string[];
  }>[];
}

export interface InspectFormalCacheStructureFreezeInput {
  readonly repositoryRoot: string;
  readonly executions: readonly FormalExecutionReceipt[];
  readonly runGit?: FormalCacheGitRunner;
}

/**
 * Hard cache-structure Gate for a sealed campaign.
 *
 * Runtime cache-hit counts are timing-dependent, so this Gate instead proves
 * that every run uses the immutable C06 Prompt freeze and that no Prompt-owned
 * source path changed between that freeze and the execution commit. The tagged
 * C06 manifest supplies per-Variant static-template hashes, cache namespaces,
 * injection tokens, and adjacent-prefix measurements for the result bundle.
 */
export async function inspectFormalCacheStructureFreeze(
  input: InspectFormalCacheStructureFreezeInput,
): Promise<FormalCacheStructureGateReceipt> {
  if (input.executions.length === 0) throw new Error("cache structure Gate requires executions");
  const cwd = resolve(input.repositoryRoot);
  const runGit = input.runGit ?? runGitCommand;
  const tagObject = await gitCommitish(
    runGit,
    cwd,
    ["rev-parse", `refs/tags/${FORMAL_PROMPT_FREEZE_TAG}`],
    "Prompt freeze tag object",
  );
  const freezeCommit = await gitCommitish(
    runGit,
    cwd,
    ["rev-parse", `${FORMAL_PROMPT_FREEZE_TAG}^{}`],
    "Prompt freeze commit",
  );
  const executionCommits = [...new Set(input.executions.map((execution) => {
    const codeFreeze = execution.codeFreeze;
    const executionCommit = commit("execution code commit", codeFreeze.executionCodeCommit);
    if (commit("execution Prompt freeze", codeFreeze.promptFreezeCommit) !== freezeCommit) {
      throw new Error(`formal execution does not use ${FORMAL_PROMPT_FREEZE_TAG}`);
    }
    if (codeFreeze.promptFreezeIsAncestor !== true || codeFreeze.workingTreeClean !== true) {
      throw new Error("formal execution code freeze receipt is not eligible");
    }
    return executionCommit;
  }))].sort();

  for (const executionCommit of executionCommits) {
    const diff = await runGit([
      "diff",
      "--quiet",
      `${freezeCommit}..${executionCommit}`,
      "--",
      ...PROMPT_OWNERSHIP_PATHS,
    ], cwd);
    if (diff.exitCode === 1) {
      throw new Error("Prompt ownership paths changed after the immutable Prompt freeze");
    }
    if (diff.exitCode !== 0) {
      throw new Error(`unable to verify Prompt ownership paths: ${diff.stderr.trim()}`);
    }
  }

  const show = await runGit([
    "show",
    `${freezeCommit}:${CODE_FREEZE_MANIFEST_PATH}`,
  ], cwd);
  if (show.exitCode !== 0) {
    throw new Error(`unable to read tagged code-freeze manifest: ${show.stderr.trim()}`);
  }
  const manifestText = show.stdout;
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText) as unknown;
  } catch (error) {
    throw new Error("tagged code-freeze manifest is not valid JSON", { cause: error });
  }
  const variants = parseManifest(manifest);
  return Object.freeze({
    schemaVersion: FORMAL_CACHE_STRUCTURE_GATE_SCHEMA,
    passed: true as const,
    promptFreezeTag: FORMAL_PROMPT_FREEZE_TAG,
    promptFreezeTagObject: tagObject,
    promptFreezeCommit: freezeCommit,
    taggedManifestPath: CODE_FREEZE_MANIFEST_PATH,
    taggedManifestSha256: sha256(manifestText),
    promptOwnershipPaths: PROMPT_OWNERSHIP_PATHS,
    executionCommits,
    invariants: Object.freeze({
      allRunsUseTaggedPromptFreeze: true as const,
      promptOwnershipPathsUnchangedAfterFreeze: true as const,
      frozenProfilesComplete: true as const,
      cacheNamespacesUnique: true as const,
      staticTemplateHashesPresent: true as const,
      adjacentPrefixMeasurementsPresent: true as const,
    }),
    variants,
  });
}

function parseManifest(raw: unknown): FormalCacheStructureGateReceipt["variants"] {
  const manifest = record("code-freeze manifest", raw);
  if (manifest.schemaVersion !== 1 || manifest.stage !== "C06") {
    throw new Error("tagged code-freeze manifest is not the C06 schema");
  }
  const inventory = keyedRows("profileInventory", manifest.profileInventory);
  const namespaces = keyedRows("cacheNamespaces", manifest.cacheNamespaces);
  const smoke = keyedRows("runnerProfileSmoke", manifest.runnerProfileSmoke);
  const namespaceValues = new Set<string>();
  const promptHashes = new Set<string>();
  const rows = EXPECTED_VARIANTS.map(([variantId, profileId], index) => {
    const profile = exactVariantProfile("profileInventory", inventory, variantId, profileId);
    const namespace = exactVariantProfile("cacheNamespaces", namespaces, variantId, profileId);
    const runner = exactVariantProfile("runnerProfileSmoke", smoke, variantId, profileId);
    const cacheNamespace = nonBlank(`${variantId}.hookCacheIdentity`, namespace.hookCacheIdentity);
    if (namespaceValues.has(cacheNamespace)) throw new Error("cache namespaces must be unique");
    namespaceValues.add(cacheNamespace);
    const runnerPromptSha256 = digest(`${variantId}.runnerPromptSha256`, runner.promptSha256);
    if (promptHashes.has(runnerPromptSha256)) throw new Error("runner Prompt hashes must be unique");
    promptHashes.add(runnerPromptSha256);
    const blocks = array(`${variantId}.blocks`, profile.blocks);
    if (blocks.length === 0) throw new Error(`${variantId}.blocks must not be empty`);
    const staticTemplateSha256 = blocks.map((block, blockIndex) => digest(
      `${variantId}.blocks[${blockIndex}].staticTemplateSha256`,
      record(`${variantId}.blocks[${blockIndex}]`, block).staticTemplateSha256,
    ));
    const stablePrefix = nonNegativeInteger(
      `${variantId}.stablePrefixBytesFromParent`,
      profile.stablePrefixBytesFromParent,
    );
    const firstChanged = profile.firstChangedByteFromParent === null
      ? null
      : nonNegativeInteger(`${variantId}.firstChangedByteFromParent`, profile.firstChangedByteFromParent);
    if (index === 0 && firstChanged !== null) throw new Error("V0 must not have a parent diff");
    if (index > 0 && firstChanged === null) throw new Error(`${variantId} must have a parent diff`);
    if (firstChanged !== null && stablePrefix !== firstChanged) {
      throw new Error(`${variantId} stable prefix does not equal its first changed byte`);
    }
    return Object.freeze({
      variantId,
      profileId,
      totalInjectionTokensO200k: nonNegativeInteger(
        `${variantId}.totalInjectionTokensO200k`,
        profile.totalInjectionTokensO200k,
      ),
      totalInjectionSha256: digest(`${variantId}.totalInjectionSha256`, profile.totalInjectionSha256),
      effectiveSystemSha256: digest(`${variantId}.effectiveSystemSha256`, profile.effectiveSystemSha256),
      stablePrefixBytesFromParent: stablePrefix,
      firstChangedByteFromParent: firstChanged,
      cacheNamespace,
      runnerPromptSha256,
      staticTemplateSha256: Object.freeze(staticTemplateSha256),
    });
  });
  if (inventory.size !== EXPECTED_VARIANTS.length
    || namespaces.size !== EXPECTED_VARIANTS.length
    || smoke.size !== EXPECTED_VARIANTS.length) {
    throw new Error("tagged code-freeze manifest contains an unexpected Variant set");
  }
  return Object.freeze(rows);
}

function keyedRows(label: string, value: unknown): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const [index, item] of array(label, value).entries()) {
    const row = record(`${label}[${index}]`, item);
    const variant = nonBlank(`${label}[${index}].variant`, row.variant);
    if (result.has(variant)) throw new Error(`${label} contains duplicate Variant ${variant}`);
    result.set(variant, row);
  }
  return result;
}

function exactVariantProfile(
  label: string,
  rows: ReadonlyMap<string, Record<string, unknown>>,
  variant: string,
  profile: string,
): Record<string, unknown> {
  const row = rows.get(variant);
  if (!row || row.profile !== profile) throw new Error(`${label} mapping mismatch for ${variant}`);
  return row;
}

async function gitCommitish(
  runGit: FormalCacheGitRunner,
  cwd: string,
  args: readonly string[],
  label: string,
): Promise<string> {
  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) throw new Error(`unable to resolve ${label}: ${result.stderr.trim()}`);
  return commit(label, result.stdout.trim());
}

function runGitCommand(args: readonly string[], cwd: string): Promise<FormalCacheGitResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn("git", [...args], { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (exitCode) => resolveCommand({ exitCode, stdout, stderr }));
  });
}

function record(label: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(label: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function nonBlank(label: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-blank`);
  return value;
}

function digest(label: string, value: unknown): string {
  const text = nonBlank(label, value).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error(`${label} must be SHA-256`);
  return text;
}

function commit(label: string, value: unknown): string {
  const text = nonBlank(label, value).toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(text)) throw new Error(`${label} must be a 40-character Git commit`);
  return text;
}

function nonNegativeInteger(label: string, value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
