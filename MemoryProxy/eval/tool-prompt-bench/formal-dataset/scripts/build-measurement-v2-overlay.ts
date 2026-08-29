import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AllowedToolAction, ArgumentRules } from "../../schema.js";
import { RUNTIME_TOOL_CONTRACTS } from "../../../../src/injection/tool-prompt/runtime-contract.js";
import type {
  FormalWorldContract,
  PrivateCaseAnnotation,
  PublicCaseInput,
} from "../../worlds/formal-schema.js";
import { canonicalJson, canonicalSha256 } from "../../worlds/formal-snapshot.js";
import {
  buildPairInvariantSha256,
  changedPairPointers,
  validatePairOverlay,
  type OverlayArgumentPredicate,
  type OverlayBindingPredicate,
  type OverlayGoldStep,
  type OverlayJsonValue,
  type OverlayPairCaseProjection,
  type OverlayPairContractV2,
  type OverlayPrivateGoldV2,
  type OverlaySplit,
  type OverlayToolFamily,
} from "./measurement-v2-overlay-schema.js";

const CORE_TAG = "task1-data-core-formal-v1";
const CORE_COMMIT = "418ecd102fa2019c139da9eebf88b163eca5a208";
const OVERLAY_ROOT = "measurement-v2/private";
const GIT_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

interface RuntimeContractV2 {
  contractId: string;
  family: OverlayToolFamily;
  tool: string;
  endpoint: string;
  method: string;
  operation: { kind: "none" } | { kind: "argument"; path: string; value: string };
  acceptedStatusCodes: number[];
}

interface FileIdentity {
  path: string;
  count: number;
  fileSha256: string;
  canonicalSha256: string;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const content = await readFile(path, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(path: string, rows: readonly unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function bytesSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: GIT_ROOT, encoding: "utf8" }).trim();
}

function assertCoreIdentity(coreTag: string, coreCommit: string): void {
  if (coreTag !== CORE_TAG || coreCommit !== CORE_COMMIT) {
    fail(`overlay builder is frozen to ${CORE_TAG}@${CORE_COMMIT}`);
  }
  const tagTarget = git("rev-parse", `${coreTag}^{}`);
  if (tagTarget !== coreCommit) fail(`${coreTag} resolves to ${tagTarget}, expected ${coreCommit}`);
  git("merge-base", "--is-ancestor", coreCommit, "HEAD");
}

async function assertWorkingCoreMatchesTag(
  datasetRoot: string,
  coreCommit: string,
): Promise<void> {
  const files = [
    "registry/contracts/formal-v1.json",
    "provider/dev.jsonl",
    "provider/hidden.sealed.jsonl",
    "snapshots/dev/scorer-gold.private.jsonl",
    "snapshots/dev/snapshot-input.json",
    "snapshots/hidden/scorer-gold.private.jsonl",
    "snapshots/hidden/snapshot-input.json",
  ];
  for (const relative of files) {
    const repositoryPath = `MemoryProxy/eval/tool-prompt-bench/formal-dataset/${relative}`;
    const frozen = execFileSync("git", ["show", `${coreCommit}:${repositoryPath}`], {
      cwd: GIT_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    const current = await readFile(resolve(datasetRoot, relative));
    if (bytesSha256(frozen) !== bytesSha256(current)) {
      fail(`${relative} differs from frozen data core ${coreCommit}`);
    }
  }
  const compiler = await readFile(resolve(datasetRoot, "scripts/compile-formal-dataset.ts"), "utf8");
  if (compiler.includes("measurement-v2") || compiler.includes(OVERLAY_ROOT)) {
    fail("provider compiler must not import or read the Measurement-v2 overlay");
  }
}

function jsonValue(value: unknown): OverlayJsonValue {
  return JSON.parse(JSON.stringify(value)) as OverlayJsonValue;
}

function argumentPredicate(rules?: ArgumentRules, prefix = ""): OverlayArgumentPredicate | undefined {
  if (!rules) return undefined;
  const path = (value: string): string => prefix ? `${prefix}.${value}` : value;
  const predicate: OverlayArgumentPredicate = {};
  if (rules.requiredFields && rules.requiredFields.length > 0) {
    predicate.required = rules.requiredFields.map(path);
  }
  if (rules.forbiddenFields && rules.forbiddenFields.length > 0) {
    predicate.forbidden = rules.forbiddenFields.map(path);
  }
  if (rules.exactValues && Object.keys(rules.exactValues).length > 0) {
    predicate.exact = Object.entries(rules.exactValues)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ path: path(key), value: jsonValue(value) }));
  }
  if (rules.stringContainsAny && Object.keys(rules.stringContainsAny).length > 0) {
    predicate.stringContainsAny = Object.entries(rules.stringContainsAny)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => ({ path: path(key), values: [...values] }));
  }
  return Object.keys(predicate).length > 0 ? predicate : undefined;
}

function mergePredicates(
  ...predicates: Array<OverlayArgumentPredicate | undefined>
): OverlayArgumentPredicate | undefined {
  const collect = <T>(key: keyof OverlayArgumentPredicate): T[] => predicates
    .flatMap((predicate) => (predicate?.[key] ?? []) as T[]);
  const required = collect<string>("required");
  const forbidden = collect<string>("forbidden");
  const exact = collect<{ path: string; value: OverlayJsonValue }>("exact");
  const stringContainsAny = collect<{ path: string; values: string[] }>("stringContainsAny");
  return required.length + forbidden.length + exact.length + stringContainsAny.length === 0 ? undefined : {
    ...(required.length > 0 ? { required: [...new Set(required)] } : {}),
    ...(forbidden.length > 0 ? { forbidden: [...new Set(forbidden)] } : {}),
    ...(exact.length > 0 ? { exact } : {}),
    ...(stringContainsAny.length > 0 ? { stringContainsAny } : {}),
  };
}

function baseRuntime(tool: string) {
  const matches = RUNTIME_TOOL_CONTRACTS.filter((contract) => contract.id === tool);
  if (matches.length !== 1) fail(`tool ${tool} does not resolve to exactly one RuntimeToolContract`);
  return matches[0];
}

function actionForStep(
  annotation: PrivateCaseAnnotation,
  sequence: readonly string[],
  stepIndex: number,
): { action: AllowedToolAction; knowledgeOperation?: string } {
  const gold = annotation.gold;
  const tool = sequence[stepIndex];
  if (stepIndex === 0) {
    const actions = gold.allowedFirstActions.filter((candidate) => candidate.tool === tool);
    if (actions.length !== 1) fail(`${annotation.caseId}: first step ${tool} is ambiguous`);
    return { action: actions[0] };
  }
  if (tool === "knowledge_tools_call") {
    const priorKnowledgeSteps = sequence.slice(1, stepIndex)
      .filter((candidate) => candidate === "knowledge_tools_call").length;
    const expectation = gold.expectedKnowledgeCalls?.[priorKnowledgeSteps];
    if (!expectation) fail(`${annotation.caseId}: missing Knowledge call ${priorKnowledgeSteps}`);
    return {
      action: {
        tool,
        endpoint: "/tools/call",
        argumentRules: expectation.paramRules,
      },
      knowledgeOperation: expectation.toolName,
    };
  }
  const action = gold.expectedFollowupActions?.[stepIndex - 1];
  if (!action || action.tool !== tool) fail(`${annotation.caseId}: follow-up ${stepIndex} does not match ${tool}`);
  return { action };
}

function bindingsForStep(
  sequence: readonly string[],
  stepIndex: number,
): OverlayBindingPredicate[] {
  if (stepIndex === 0) return [];
  const previousTool = sequence[stepIndex - 1];
  const tool = sequence[stepIndex];
  const priorStepId = `step-${stepIndex}`;
  if (previousTool === "skill_search" && tool === "skill_view_by_id") {
    return [{
      argumentPath: "skill_id",
      priorStepId,
      responsePath: "data.items.0.skill_id",
      comparison: "exact",
    }];
  }
  if (previousTool === "skill_view" && tool === "skill_files_read") {
    return [{
      argumentPath: "skill_id",
      priorStepId,
      responsePath: "data.skill_id",
      comparison: "exact",
    }];
  }
  // conversation/search does not return session_id; scenario/ls and tools/list
  // do not guarantee a target-specific array index. Those chains are frozen by
  // exact terminal arguments instead of inventing a response binding.
  return [];
}

function buildGoldStep(
  annotation: PrivateCaseAnnotation,
  sequence: readonly string[],
  stepIndex: number,
): OverlayGoldStep {
  const { action, knowledgeOperation } = actionForStep(annotation, sequence, stepIndex);
  const runtime = baseRuntime(action.tool);
  if (runtime.path !== action.endpoint) {
    fail(`${annotation.caseId}: ${action.tool} endpoint ${action.endpoint} != production ${runtime.path}`);
  }
  let args = argumentPredicate(action.argumentRules);
  if (knowledgeOperation) {
    const first = annotation.gold.allowedFirstActions[0];
    const knowledgeId = first.argumentRules?.exactValues?.knowledge_id;
    if (typeof knowledgeId !== "string") fail(`${annotation.caseId}: Knowledge id is not frozen`);
    args = mergePredicates(
      {
        required: ["knowledge_id", "tool_name", "params"],
        exact: [
          { path: "knowledge_id", value: knowledgeId },
          { path: "tool_name", value: knowledgeOperation },
        ],
      },
      argumentPredicate(action.argumentRules, "params"),
    );
  }
  return {
    stepId: `step-${stepIndex + 1}`,
    family: runtime.family as OverlayToolFamily,
    tool: action.tool,
    endpoint: action.endpoint,
    method: runtime.method,
    operation: knowledgeOperation
      ? { kind: "exact", value: knowledgeOperation }
      : { kind: "none" },
    ...(args ? { arguments: args } : {}),
    bindings: bindingsForStep(sequence, stepIndex),
    runtimeContractId: knowledgeOperation
      ? `knowledge_tools_call:${knowledgeOperation}`
      : runtime.id,
    terminal: stepIndex === sequence.length - 1,
  };
}

function buildGoldV2(annotation: PrivateCaseAnnotation): OverlayPrivateGoldV2 {
  const gold = annotation.gold;
  if (!gold.needTdaiTool) {
    if (gold.allowedSequences.length !== 0) fail(`${annotation.caseId}: no-tool legacy sequence is non-empty`);
    return {
      evaluationSchemaVersion: 2,
      caseId: annotation.caseId,
      expectation: "no-tool",
      attemptBudget: gold.maxTdaiCalls,
      allowedSequences: [],
    };
  }
  if (gold.allowedSequences.length === 0) fail(`${annotation.caseId}: positive Gold has no sequence`);
  return {
    evaluationSchemaVersion: 2,
    caseId: annotation.caseId,
    expectation: "tool",
    attemptBudget: gold.maxTdaiCalls,
    allowedSequences: gold.allowedSequences.map((sequence, sequenceIndex) => ({
      sequenceId: `${annotation.caseId}:sequence-${sequenceIndex + 1}`,
      steps: sequence.map((_tool, stepIndex) => buildGoldStep(annotation, sequence, stepIndex)),
    })),
  };
}

function pairSplit(caseInput: PublicCaseInput, contract: FormalWorldContract): OverlaySplit {
  const team = contract.teams.find((candidate) => candidate.teamId === caseInput.identity.teamId);
  if (!team) fail(`${caseInput.caseId}: missing Team`);
  return team.split === "dev" ? "dev" : "hidden";
}

function pairProjection(caseInput: PublicCaseInput, split: OverlaySplit): OverlayPairCaseProjection {
  const { sessionId: _sessionId, ...stableIdentity } = caseInput.identity;
  void _sessionId;
  return {
    caseId: caseInput.caseId,
    split,
    comparisonDocument: jsonValue({
      identity: stableIdentity,
      snapshotId: caseInput.snapshotId,
      workspace: caseInput.workspace,
      language: caseInput.language,
      difficulty: caseInput.difficulty,
      contextMessages: caseInput.contextMessages,
      query: caseInput.query,
      visibleAssetSetSha256: caseInput.visibleAssetSetSha256,
    }),
  };
}

function buildPairV2(
  pair: FormalWorldContract["pairs"][number],
  contract: FormalWorldContract,
): { pair: OverlayPairContractV2; positive: OverlayPairCaseProjection; negative: OverlayPairCaseProjection } {
  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  const positiveCase = publicById.get(pair.positiveCaseId) ?? fail(`${pair.pairId}: missing positive`);
  const negativeCase = publicById.get(pair.negativeCaseId) ?? fail(`${pair.pairId}: missing negative`);
  const split = pairSplit(positiveCase, contract);
  if (pairSplit(negativeCase, contract) !== split) fail(`${pair.pairId}: cross-split pair`);
  const positive = pairProjection(positiveCase, split);
  const negative = pairProjection(negativeCase, split);
  const changedIndexes = positiveCase.contextMessages.flatMap((message, index) =>
    canonicalSha256(message) === canonicalSha256(negativeCase.contextMessages[index]) ? [] : [index]);
  if (changedIndexes.length !== 1) fail(`${pair.pairId}: expected one changed context message`);
  const allowedChangedPointers = [`/contextMessages/${changedIndexes[0]}`];
  const changed = changedPairPointers(positive.comparisonDocument, negative.comparisonDocument).sort();
  const invariant = buildPairInvariantSha256(
    positive.comparisonDocument,
    negative.comparisonDocument,
    allowedChangedPointers,
  );
  const pairV2: OverlayPairContractV2 = {
    schemaVersion: "2",
    pairId: pair.pairId,
    positiveCaseId: pair.positiveCaseId,
    negativeCaseId: pair.negativeCaseId,
    causalFactorId: `task1:${pair.counterfactualKind}`,
    allowedChangedPointers,
    invariantProjectionSchemaVersion: "pair-invariant-projection-v2",
    invariantFieldsSha256: invariant.sha256,
    changedPointerCount: changed.length,
    minimalityReviewStatus: "approved",
    independenceKey: `${split}:${pair.pairId}`,
    split,
  };
  const errors = validatePairOverlay(pairV2, positive, negative);
  if (errors.length > 0) fail(errors.join("\n"));
  return { pair: pairV2, positive, negative };
}

function buildRuntimeContracts(gold: readonly OverlayPrivateGoldV2[]): RuntimeContractV2[] {
  const referenced = new Set(gold.flatMap((item) => item.allowedSequences)
    .flatMap((sequence) => sequence.steps).map((step) => step.runtimeContractId));
  return [...referenced].sort().map((contractId) => {
    if (contractId.startsWith("knowledge_tools_call:")) {
      const value = contractId.slice("knowledge_tools_call:".length);
      const runtime = baseRuntime("knowledge_tools_call");
      return {
        contractId,
        family: "knowledge",
        tool: runtime.id,
        endpoint: runtime.path,
        method: runtime.method,
        operation: { kind: "argument", path: "tool_name", value },
        acceptedStatusCodes: [200],
      };
    }
    const runtime = baseRuntime(contractId);
    return {
      contractId,
      family: runtime.family as OverlayToolFamily,
      tool: runtime.id,
      endpoint: runtime.path,
      method: runtime.method,
      operation: { kind: "none" },
      acceptedStatusCodes: [200],
    };
  });
}

function validateGoldOverlay(
  gold: readonly OverlayPrivateGoldV2[],
  contract: FormalWorldContract,
  runtimeContracts: readonly RuntimeContractV2[],
): string[] {
  const errors: string[] = [];
  const caseIds = new Set(contract.publicCases.map((item) => item.caseId));
  const annotationById = new Map(contract.privateAnnotations.map((item) => [item.caseId, item]));
  const runtimeById = new Map(runtimeContracts.map((item) => [item.contractId, item]));
  if (gold.length !== 640 || new Set(gold.map((item) => item.caseId)).size !== 640) {
    errors.push(`Gold v2 requires 640 unique cases, found ${gold.length}`);
  }
  for (const item of gold) {
    if (!caseIds.has(item.caseId)) errors.push(`${item.caseId}: unknown Case`);
    const legacy = annotationById.get(item.caseId);
    if (!legacy) continue;
    if (item.evaluationSchemaVersion !== 2) errors.push(`${item.caseId}: wrong evaluationSchemaVersion`);
    if (item.attemptBudget !== legacy.gold.maxTdaiCalls) errors.push(`${item.caseId}: attempt budget drift`);
    if (item.expectation === "no-tool") {
      if (legacy.gold.needTdaiTool || item.allowedSequences.length !== 0) {
        errors.push(`${item.caseId}: invalid no-tool Gold`);
      }
      continue;
    }
    if (!legacy.gold.needTdaiTool || item.allowedSequences.length === 0) {
      errors.push(`${item.caseId}: invalid tool Gold`);
      continue;
    }
    for (const sequence of item.allowedSequences) {
      if (sequence.steps.length === 0) errors.push(`${item.caseId}: empty sequence`);
      sequence.steps.forEach((step, index) => {
        if (step.terminal !== (index === sequence.steps.length - 1)) {
          errors.push(`${item.caseId}: terminal marker mismatch`);
        }
        const runtime = runtimeById.get(step.runtimeContractId);
        if (!runtime) errors.push(`${item.caseId}: missing runtime contract ${step.runtimeContractId}`);
        else if (runtime.tool !== step.tool || runtime.endpoint !== step.endpoint || runtime.method !== step.method) {
          errors.push(`${item.caseId}: runtime contract mismatch for ${step.runtimeContractId}`);
        }
        for (const binding of step.bindings) {
          if (!sequence.steps.some((candidate) => candidate.stepId === binding.priorStepId)) {
            errors.push(`${item.caseId}: binding references missing ${binding.priorStepId}`);
          }
        }
      });
    }
  }
  return errors;
}

async function identity(
  path: string,
  relativePath: string,
  rows: readonly unknown[],
): Promise<FileIdentity> {
  return {
    path: relativePath,
    count: rows.length,
    fileSha256: await fileSha256(path),
    canonicalSha256: canonicalSha256(rows),
  };
}

async function main(): Promise<void> {
  const coreTag = option("--core-tag") ?? CORE_TAG;
  const coreCommit = option("--core-commit") ?? CORE_COMMIT;
  assertCoreIdentity(coreTag, coreCommit);

  const datasetRoot = resolve(import.meta.dirname, "..");
  await assertWorkingCoreMatchesTag(datasetRoot, coreCommit);
  const contractPath = resolve(datasetRoot, "registry/contracts/formal-v1.json");
  const contract = await readJson<FormalWorldContract>(contractPath);
  if (contract.world.status !== "frozen") fail("formal-v1 world is not frozen");
  if (contract.publicCases.length !== 640 || contract.privateAnnotations.length !== 640 || contract.pairs.length !== 240) {
    fail("formal-v1 core count mismatch");
  }

  const teamSplit = new Map(contract.teams.map((team) => [team.teamId, team.split]));
  const caseSplit = (caseId: string): OverlaySplit => {
    const item = contract.publicCases.find((candidate) => candidate.caseId === caseId) ?? fail(`${caseId}: missing Case`);
    return teamSplit.get(item.identity.teamId) === "dev" ? "dev" : "hidden";
  };
  const allGold = contract.privateAnnotations.map(buildGoldV2).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const runtimeContracts = buildRuntimeContracts(allGold);
  const goldErrors = validateGoldOverlay(allGold, contract, runtimeContracts);
  if (goldErrors.length > 0) fail(goldErrors.join("\n"));

  const pairs = contract.pairs.map((pair) => buildPairV2(pair, contract));
  const pairErrors = pairs.flatMap((item) => validatePairOverlay(item.pair, item.positive, item.negative));
  if (pairErrors.length > 0) fail(pairErrors.join("\n"));
  if (new Set(pairs.map((item) => item.pair.independenceKey)).size !== 240) {
    fail("Pair v2 independenceKey values are not globally unique");
  }

  const root = resolve(datasetRoot, OVERLAY_ROOT);
  const goldDev = allGold.filter((item) => caseSplit(item.caseId) === "dev");
  const goldHidden = allGold.filter((item) => caseSplit(item.caseId) === "hidden");
  const pairDev = pairs.filter((item) => item.pair.split === "dev").map((item) => item.pair);
  const pairHidden = pairs.filter((item) => item.pair.split === "hidden").map((item) => item.pair);
  const goldDevPath = resolve(root, "gold/dev.private.jsonl");
  const goldHiddenPath = resolve(root, "gold/hidden.private.jsonl");
  const pairDevPath = resolve(root, "pairs/dev.private.jsonl");
  const pairHiddenPath = resolve(root, "pairs/hidden.private.jsonl");
  const runtimePath = resolve(root, "runtime-contracts.private.json");
  await writeJsonl(goldDevPath, goldDev);
  await writeJsonl(goldHiddenPath, goldHidden);
  await writeJsonl(pairDevPath, pairDev);
  await writeJsonl(pairHiddenPath, pairHidden);
  await writeJson(runtimePath, runtimeContracts);

  const providerDevPath = resolve(datasetRoot, "provider/dev.jsonl");
  const providerHiddenPath = resolve(datasetRoot, "provider/hidden.sealed.jsonl");
  const providerDev = await readJsonl<unknown>(providerDevPath);
  const providerHidden = await readJsonl<unknown>(providerHiddenPath);
  const snapshots = Object.fromEntries(contract.snapshots.map((snapshot) => [snapshot.split, canonicalSha256(snapshot)]));
  const privateDev = contract.privateAnnotations.filter((item) => caseSplit(item.caseId) === "dev");
  const privateHidden = contract.privateAnnotations.filter((item) => caseSplit(item.caseId) === "hidden");
  const runtimeSourcePath = resolve(datasetRoot, "../../../src/injection/tool-prompt/runtime-contract.ts");
  const runtimeSourceRelative = "MemoryProxy/src/injection/tool-prompt/runtime-contract.ts";
  const runtimeSourceCommit = git("log", "-1", "--format=%H", "--", runtimeSourceRelative);
  if (!/^[a-f0-9]{40}$/.test(runtimeSourceCommit)) fail("RuntimeToolContract source commit is not frozen");
  const outputIdentities = {
    goldDev: await identity(goldDevPath, `${OVERLAY_ROOT}/gold/dev.private.jsonl`, goldDev),
    goldHidden: await identity(goldHiddenPath, `${OVERLAY_ROOT}/gold/hidden.private.jsonl`, goldHidden),
    pairDev: await identity(pairDevPath, `${OVERLAY_ROOT}/pairs/dev.private.jsonl`, pairDev),
    pairHidden: await identity(pairHiddenPath, `${OVERLAY_ROOT}/pairs/hidden.private.jsonl`, pairHidden),
    runtimeContracts: await identity(
      runtimePath,
      `${OVERLAY_ROOT}/runtime-contracts.private.json`,
      runtimeContracts,
    ),
  };
  const manifest = {
    schemaVersion: "task1.measurement-v2-overlay-manifest.v1",
    evaluationSchemaVersion: 2,
    visibility: "private_never_provider_visible",
    dataCore: {
      tag: coreTag,
      commit: coreCommit,
      contractPath: "registry/contracts/formal-v1.json",
      contractFileSha256: await fileSha256(contractPath),
      contractCanonicalSha256: canonicalSha256(contract),
      provider: {
        devCanonicalSha256: canonicalSha256(providerDev),
        hiddenCanonicalSha256: canonicalSha256(providerHidden),
        fullCanonicalSha256: canonicalSha256([...providerDev, ...providerHidden]),
      },
      privateAnnotations: {
        devCanonicalSha256: canonicalSha256(privateDev),
        hiddenCanonicalSha256: canonicalSha256(privateHidden),
        fullCanonicalSha256: canonicalSha256(contract.privateAnnotations),
      },
      pairsCanonicalSha256: canonicalSha256(contract.pairs),
      snapshots: {
        devCanonicalSha256: snapshots.dev,
        hiddenCanonicalSha256: snapshots.hidden_test,
      },
      caseIdsSha256: canonicalSha256(contract.publicCases.map((item) => item.caseId)),
      pairIdsSha256: canonicalSha256(contract.pairs.map((item) => item.pairId)),
    },
    runtimeContractEvidence: {
      sourcePath: runtimeSourceRelative,
      sourceCommit: runtimeSourceCommit,
      sourceFileSha256: await fileSha256(runtimeSourcePath),
      adaptedRuntimeContractsCanonicalSha256: canonicalSha256(runtimeContracts),
      successfulHttpStatusEvidence: [
        "MemoryProxy/src/__tests__/formal-evaluator-contract.test.ts",
        "MemoryProxy/src/injection/tool-prompt/runtime-contract.ts",
      ],
    },
    overlays: outputIdentities,
    counts: {
      goldV2: allGold.length,
      goldV2Dev: goldDev.length,
      goldV2Hidden: goldHidden.length,
      pairV2: pairs.length,
      pairV2Dev: pairDev.length,
      pairV2Hidden: pairHidden.length,
      runtimeContracts: runtimeContracts.length,
    },
    providerExclusion: {
      overlayRoot: OVERLAY_ROOT,
      providerCompilerImportsOverlay: false,
      providerLeakageCount: 0,
      providerDevFileSha256: await fileSha256(providerDevPath),
      providerHiddenFileSha256: await fileSha256(providerHiddenPath),
    },
    measurementV2Ready: true,
    formalMetricEligible: false,
  };
  const manifestPath = resolve(root, "manifest.private.json");
  await writeJson(manifestPath, manifest);

  // Read the persisted artifacts again: the Gate validates files, not in-memory drafts.
  const persistedGold = [
    ...await readJsonl<OverlayPrivateGoldV2>(goldDevPath),
    ...await readJsonl<OverlayPrivateGoldV2>(goldHiddenPath),
  ].sort((left, right) => left.caseId.localeCompare(right.caseId));
  const persistedPairs = [
    ...await readJsonl<OverlayPairContractV2>(pairDevPath),
    ...await readJsonl<OverlayPairContractV2>(pairHiddenPath),
  ];
  const persistedManifest = await readJson<typeof manifest>(manifestPath);
  const persistedGoldErrors = validateGoldOverlay(persistedGold, contract, runtimeContracts);
  const persistedPairErrors = persistedPairs.flatMap((pair) => {
    const built = pairs.find((item) => item.pair.pairId === pair.pairId);
    return built ? validatePairOverlay(pair, built.positive, built.negative) : [`${pair.pairId}: no source pair`];
  });
  const providerText = `${await readFile(providerDevPath, "utf8")}\n${await readFile(providerHiddenPath, "utf8")}`;
  const privateLeakTokens = ["evaluationSchemaVersion", "invariantFieldsSha256", "minimalityReviewStatus"];
  const providerLeakage = privateLeakTokens.filter((token) => providerText.includes(token));
  const errors = [...persistedGoldErrors, ...persistedPairErrors];
  if (persistedGold.length !== 640) errors.push(`persisted Gold count ${persistedGold.length}`);
  if (persistedPairs.length !== 240) errors.push(`persisted Pair count ${persistedPairs.length}`);
  if (providerLeakage.length > 0) errors.push(`provider overlay leakage: ${providerLeakage.join(",")}`);
  if (persistedManifest.dataCore.commit !== coreCommit) errors.push("manifest core commit drift");
  const report = {
    schemaVersion: "task1.measurement-v2-overlay-validation.v1",
    valid: errors.length === 0,
    errors,
    coreTag,
    coreCommit,
    counts: persistedManifest.counts,
    canonicalSha256: {
      goldV2Full: canonicalSha256(persistedGold),
      pairV2Full: canonicalSha256([...persistedPairs].sort((left, right) => left.pairId.localeCompare(right.pairId))),
      runtimeContracts: canonicalSha256(runtimeContracts),
      manifest: canonicalSha256(persistedManifest),
    },
    providerLeakageCount: providerLeakage.length,
    pairValidationErrorCount: persistedPairErrors.length,
    goldValidationErrorCount: persistedGoldErrors.length,
    r01_r04: {
      R01_private_gold_v2: errors.length === 0 ? "cleared" : "blocked",
      R02_pair_v2: errors.length === 0 ? "cleared" : "blocked",
      R03_overlay_validator: errors.length === 0 ? "cleared" : "blocked",
      R04_provider_exclusion_and_m0_m1_compatibility: errors.length === 0 ? "cleared" : "blocked",
    },
    measurementV2Ready: errors.length === 0,
    formalMetricEligible: false,
  };
  const reportPath = resolve(datasetRoot, "reports/DS06-MEASUREMENT-V2-OVERLAY-VALIDATION.json");
  await writeJson(reportPath, report);
  if (errors.length > 0) fail(errors.join("\n"));
  console.log(JSON.stringify({ manifestPath, reportPath, ...report }, null, 2));
}

await main();
