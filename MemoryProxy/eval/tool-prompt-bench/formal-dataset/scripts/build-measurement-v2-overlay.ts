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
import { canonicalSha256 as canonicalSha256V1 } from "../../worlds/formal-snapshot.js";
import {
  canonicalJsonClone,
  canonicalSha256,
} from "../../measurement-v2/canonical-json.js";
import { scoreCaseChain } from "../../measurement-v2/scorer.js";
import type {
  JsonObjectV2,
  PrivateChainGoldV2,
  RawTdaiTraceAttemptV2,
  RuntimeToolContractV2 as M0RuntimeToolContractV2,
} from "../../measurement-v2/types.js";
import {
  buildPairInvariantSha256,
  changedPairPointers,
  validateOverlayBindingObservation,
  validatePairApprovalCoverage,
  validatePairOverlay,
  type PairApprovalLedger,
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

const DATA_TAG = "task1-data-formal-v2.1";
const DATA_TAG_OBJECT = "6dcb766b0d9d831fe06cd45176da4d8d59cd0a78";
const DATA_COMMIT = "a8ae02e376f07ea7baa6a13f66aa4fb560b95ce6";
const STATUS_BLOB = "7a262b13836fd843637e74312ca5b6c9b7e43396";
const STATUS_SHA256 = "acd98947d3892047c9479287325bb502a0a892c2710c5e248c86968c0dcf22cc";
const OVERLAY_ROOT = "measurement-v2/private";
const CANONICAL_CONTRACT_ID = "task1.measurement-v2.canonical-json.v2.1";
const CANONICAL_SOURCE_PATH = "MemoryProxy/eval/tool-prompt-bench/measurement-v2/canonical-json.ts";
const CANONICAL_SOURCE_BLOB = "a9fe41894fab2d5cb997a703ff11af5d99181655";
const CANONICAL_TEST_PATH = "MemoryProxy/src/__tests__/tool-prompt-canonical-json-shared.test.ts";
const CANONICAL_TEST_BLOB = "6d10c5476956a310b6e800c6f2549dac477d4a8e";
const M1_CANONICAL_TAG = "task1-measure-m1-v2.1-pass";
const M1_CANONICAL_COMMIT = "6bb57979d6a6c81b4d800995b36b4cd718be1ab5";
const M2_CANONICAL_TAG = "task1-measure-m2-v2.1-pass";
const M2_CANONICAL_COMMIT = "6dfb0756c864fc470f85575965304c35a5892eca";
const M0_SCORER_TAG = "task1-candidate-base-v1";
const M0_SCORER_COMMIT = "fa79ab94720545e1b6034b83f9b08d83ff2d6f9c";
const M0_SOURCE_BLOBS = {
  scorer: "da935e8da2a001850a6053746935f2024dbd4e43",
  types: "57b32b1de0af0f27add4a32af26f7ff2e323d9f4",
  jsonPath: "c18db95853ff866c85aba070cdcc6a8f50e1dee9",
  normalizer: "ca9533cfb859da4a4ef594e68e01378c8ecd0c75",
} as const;
const PAIR_APPROVAL_LEDGER_PATH = `${OVERLAY_ROOT}/approvals/pair-minimality-approval-ledger.json`;
const GIT_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

interface RuntimeContractV2 {
  contractId: string;
  family: OverlayToolFamily;
  tool: string;
  endpoint: string;
  method: string;
  operation:
    | { kind: "none" }
    | { kind: "argument"; path: string; value: string };
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

function normalizedTextSha256(value: Uint8Array): string {
  return createHash("sha256")
    .update(Buffer.from(value).toString("utf8").replace(/\r\n/gu, "\n"), "utf8")
    .digest("hex");
}

function assertDataIdentity(dataTag: string, dataCommit: string): void {
  if (dataTag !== DATA_TAG || dataCommit !== DATA_COMMIT) {
    fail(`overlay builder is frozen to ${DATA_TAG}@${DATA_COMMIT}`);
  }
  if (git("cat-file", "-t", dataTag) !== "tag") fail(`${dataTag} must be an annotated tag`);
  if (git("rev-parse", dataTag) !== DATA_TAG_OBJECT) fail(`${dataTag} tag object drift`);
  const tagTarget = git("rev-parse", `${dataTag}^{}`);
  if (tagTarget !== dataCommit) fail(`${dataTag} resolves to ${tagTarget}, expected ${dataCommit}`);
  const statusPath = "MemoryProxy/eval/tool-prompt-bench/formal-dataset/DATASET-BUILD-STATUS.json";
  if (git("rev-parse", `${dataTag}:${statusPath}`) !== STATUS_BLOB) fail(`${dataTag} status blob drift`);
  const statusBytes = execFileSync("git", ["show", `${dataTag}:${statusPath}`], { cwd: GIT_ROOT });
  if (normalizedTextSha256(statusBytes) !== STATUS_SHA256) fail(`${dataTag} normalized status SHA-256 drift`);
}

function assertOverlayCanonicalContract(): void {
  const sourceBlob = git("hash-object", CANONICAL_SOURCE_PATH);
  const testBlob = git("hash-object", CANONICAL_TEST_PATH);
  if (sourceBlob !== CANONICAL_SOURCE_BLOB) {
    fail(`shared canonical source blob ${sourceBlob} != ${CANONICAL_SOURCE_BLOB}`);
  }
  if (testBlob !== CANONICAL_TEST_BLOB) {
    fail(`shared canonical test blob ${testBlob} != ${CANONICAL_TEST_BLOB}`);
  }
  const m1Commit = git("rev-parse", `${M1_CANONICAL_TAG}^{}`);
  const m2Commit = git("rev-parse", `${M2_CANONICAL_TAG}^{}`);
  if (m1Commit !== M1_CANONICAL_COMMIT) {
    fail(`${M1_CANONICAL_TAG} resolves to ${m1Commit}, expected ${M1_CANONICAL_COMMIT}`);
  }
  if (m2Commit !== M2_CANONICAL_COMMIT) {
    fail(`${M2_CANONICAL_TAG} resolves to ${m2Commit}, expected ${M2_CANONICAL_COMMIT}`);
  }
  const m0Commit = git("rev-parse", `${M0_SCORER_TAG}^{}`);
  if (m0Commit !== M0_SCORER_COMMIT) {
    fail(`${M0_SCORER_TAG} resolves to ${m0Commit}, expected ${M0_SCORER_COMMIT}`);
  }
  const m0Paths = {
    scorer: "MemoryProxy/eval/tool-prompt-bench/measurement-v2/scorer.ts",
    types: "MemoryProxy/eval/tool-prompt-bench/measurement-v2/types.ts",
    jsonPath: "MemoryProxy/eval/tool-prompt-bench/measurement-v2/json-path.ts",
    normalizer: "MemoryProxy/eval/tool-prompt-bench/measurement-v2/normalizer.ts",
  } as const;
  for (const [name, path] of Object.entries(m0Paths) as Array<[keyof typeof M0_SOURCE_BLOBS, string]>) {
    const blob = git("hash-object", path);
    if (blob !== M0_SOURCE_BLOBS[name]) fail(`M0 ${name} blob ${blob} != ${M0_SOURCE_BLOBS[name]}`);
  }
}

async function assertWorkingDataMatchesTag(
  datasetRoot: string,
  dataCommit: string,
): Promise<void> {
  const files = [
    "DATASET-BUILD-STATUS.json",
    "registry/contracts/formal-v2.json",
    "revisions/formal-v2/provider/dev.jsonl",
    "revisions/formal-v2/provider/hidden.sealed.jsonl",
    "revisions/formal-v2/snapshots/dev/scorer-gold.private.jsonl",
    "revisions/formal-v2/snapshots/dev/snapshot-input.json",
    "revisions/formal-v2/snapshots/hidden/scorer-gold.private.jsonl",
    "revisions/formal-v2/snapshots/hidden/snapshot-input.json",
  ];
  for (const relative of files) {
    const repositoryPath = `MemoryProxy/eval/tool-prompt-bench/formal-dataset/${relative}`;
    const frozen = execFileSync("git", ["show", `${dataCommit}:${repositoryPath}`], {
      cwd: GIT_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    const current = await readFile(resolve(datasetRoot, relative));
    if (normalizedTextSha256(frozen) !== normalizedTextSha256(current)) {
      fail(`${relative} differs from frozen formal-v2.1 data ${dataCommit}`);
    }
  }
  const compiler = await readFile(resolve(datasetRoot, "scripts/compile-formal-dataset.ts"), "utf8");
  if (compiler.includes("measurement-v2") || compiler.includes(OVERLAY_ROOT)) {
    fail("provider compiler must not import or read the Measurement-v2 overlay");
  }
}

function jsonValue(value: unknown): OverlayJsonValue {
  return canonicalJsonClone(value) as OverlayJsonValue;
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
  const exactCandidates = collect<{ path: string; value: OverlayJsonValue }>("exact");
  const exactByPath = new Map<string, OverlayJsonValue>();
  for (const candidate of exactCandidates) {
    const existing = exactByPath.get(candidate.path);
    if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(candidate.value)) {
      fail(`conflicting exact argument predicates at ${candidate.path}`);
    }
    exactByPath.set(candidate.path, candidate.value);
  }
  const exact = [...exactByPath.entries()].map(([path, value]) => ({ path, value }));
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
    const action = actions[0];
    const operation = action.argumentRules?.exactValues?.tool_name;
    return {
      action,
      ...(tool === "knowledge_tools_call" && typeof operation === "string"
        ? { knowledgeOperation: operation }
        : {}),
    };
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

function targetScenePath(
  annotation: PrivateCaseAnnotation,
  contract: FormalWorldContract,
): string {
  const targets = contract.assets.l2Scenes.filter((scene) => (
    annotation.gold.targetAssetIds.includes(scene.assetId)
  ));
  if (targets.length !== 1) {
    fail(`${annotation.caseId}: expected exactly one target L2 scene, found ${targets.length}`);
  }
  return targets[0].path;
}

function isConversationTerminalDowngrade(annotation: PrivateCaseAnnotation): boolean {
  return annotation.gold.expectedFollowupActions?.some((action) => (
    action.tool === "tdai_conversation_query" && action.argumentRules?.valueFromPreviousStep
  )) ?? false;
}

function isScenarioTypedBinding(annotation: PrivateCaseAnnotation): boolean {
  return annotation.gold.expectedFollowupActions?.some((action) => (
    action.tool === "tdai_read_scene" && action.argumentRules?.valueFromPreviousStep
  )) ?? false;
}

function overlaySequences(annotation: PrivateCaseAnnotation): readonly (readonly string[])[] {
  if (!isConversationTerminalDowngrade(annotation)) return annotation.gold.allowedSequences;
  for (const sequence of annotation.gold.allowedSequences) {
    if (sequence.length !== 2
      || sequence[0] !== "tdai_conversation_search"
      || sequence[1] !== "tdai_conversation_query") {
      fail(`${annotation.caseId}: conversation downgrade no longer matches the frozen legacy chain`);
    }
  }
  const followup = annotation.gold.expectedFollowupActions?.[0];
  if (followup?.tool !== "tdai_conversation_query" || !followup.argumentRules?.valueFromPreviousStep) {
    fail(`${annotation.caseId}: conversation downgrade lost its legacy valueFromPreviousStep evidence`);
  }
  // Production MemoryCore currently omits session_id from conversation/search
  // response hits, so query cannot be safely bound. Search is the terminal.
  return [["tdai_conversation_search"]];
}

function bindingsForStep(
  annotation: PrivateCaseAnnotation,
  sequence: readonly string[],
  stepIndex: number,
  contract: FormalWorldContract,
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
  if (previousTool === "tdai_scenario_ls" && tool === "tdai_read_scene") {
    targetScenePath(annotation, contract);
    return [{
      argumentPath: "path",
      priorStepId,
      responsePath: "data.entries.0.path",
      comparison: "exact",
    }];
  }
  // conversation/search does not return session_id; those nine legacy chains
  // are explicitly downgraded before step construction. Knowledge tools/list
  // does not guarantee a target-specific array index and remains constrained by
  // exact operation and argument predicates.
  return [];
}

function buildGoldStep(
  annotation: PrivateCaseAnnotation,
  sequence: readonly string[],
  stepIndex: number,
  contract: FormalWorldContract,
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
  if (stepIndex > 0
    && sequence[stepIndex - 1] === "tdai_scenario_ls"
    && action.tool === "tdai_read_scene") {
    args = mergePredicates(args, {
      exact: [{ path: "path", value: targetScenePath(annotation, contract) }],
    });
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
    bindings: bindingsForStep(annotation, sequence, stepIndex, contract),
    runtimeContractId: knowledgeOperation
      ? `knowledge_tools_call:${knowledgeOperation}`
      : runtime.id,
    terminal: stepIndex === sequence.length - 1,
  };
}

function buildGoldV2(
  annotation: PrivateCaseAnnotation,
  contract: FormalWorldContract,
): OverlayPrivateGoldV2 {
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
  const sequences = overlaySequences(annotation);
  return {
    evaluationSchemaVersion: 2,
    caseId: annotation.caseId,
    expectation: "tool",
    attemptBudget: isConversationTerminalDowngrade(annotation) ? 1 : gold.maxTdaiCalls,
    allowedSequences: sequences.map((sequence, sequenceIndex) => ({
      sequenceId: `${annotation.caseId}:sequence-${sequenceIndex + 1}`,
      steps: sequence.map((_tool, stepIndex) => buildGoldStep(annotation, sequence, stepIndex, contract)),
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
    teamId: caseInput.identity.teamId,
    comparisonDocument: jsonValue({
      identity: stableIdentity,
      snapshotId: caseInput.snapshotId,
      workspace: caseInput.workspace,
      language: caseInput.language,
      ...(caseInput.difficulty === undefined ? {} : { difficulty: caseInput.difficulty }),
      contextMessages: caseInput.contextMessages,
      query: caseInput.query,
      visibleAssetSetSha256: caseInput.visibleAssetSetSha256,
    }),
  };
}

interface PairApprovalAudit {
  ledgerPath: string;
  ledgerFileSha256: string;
  ledgerCanonicalSha256: string;
  approvedTeamCount: number;
  approvedPairCount: number;
  evidenceFileCount: number;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function buildPairApprovalLedger(
  contract: FormalWorldContract,
  datasetRoot: string,
  evidenceSourceCommit: string,
): Promise<PairApprovalLedger> {
  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  const teams = await Promise.all([...contract.teams]
    .sort((left, right) => left.teamId.localeCompare(right.teamId))
    .map(async (team) => {
      const pairIds = contract.pairs
        .filter((pair) => publicById.get(pair.positiveCaseId)?.identity.teamId === team.teamId)
        .map((pair) => pair.pairId)
        .sort();
      if (pairIds.length !== 15) fail(`${team.teamId}: expected 15 Pair approvals`);
      const evidencePath = `staging/teams/${team.teamId}/gate.json`;
      const repositoryPath = `MemoryProxy/eval/tool-prompt-bench/formal-dataset/${evidencePath}`;
      const frozenEvidence = execFileSync(
        "git",
        ["show", `${evidenceSourceCommit}:${repositoryPath}`],
        { cwd: GIT_ROOT, maxBuffer: 16 * 1024 * 1024 },
      );
      return {
        teamId: team.teamId,
        pairIds,
        pairIdsCanonicalSha256: canonicalSha256(pairIds),
        reviewStatus: "approved" as const,
        reviewer: "Task 1 formal-v2.1 Team Gate and DS09 integration review",
        evidencePath,
        evidenceFileSha256: bytesSha256(frozenEvidence),
        evidenceSourceCommit,
      };
    }));
  return {
    schemaVersion: "task1.pair-minimality-approval-ledger.v1",
    reviewCriterion: "One and only one contextMessages pointer changes; all non-allowed Pair fields remain invariant.",
    teams,
  };
}

async function validatePairApprovalEvidence(
  ledger: PairApprovalLedger,
  contract: FormalWorldContract,
  datasetRoot: string,
  ledgerPath: string,
): Promise<{ audit: PairApprovalAudit; approvalByPairId: Map<string, "approved"> }> {
  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  const expectedPairs = contract.pairs.map((pair) => ({
    pairId: pair.pairId,
    teamId: publicById.get(pair.positiveCaseId)?.identity.teamId ?? "",
  }));
  const errors = validatePairApprovalCoverage(ledger, expectedPairs);
  const approvalByPairId = new Map<string, "approved">();
  for (const team of ledger.teams) {
    const expectedPath = `staging/teams/${team.teamId}/gate.json`;
    if (team.evidencePath !== expectedPath) {
      errors.push(`${team.teamId}: evidence path ${team.evidencePath} != ${expectedPath}`);
      continue;
    }
    const evidencePath = resolve(datasetRoot, team.evidencePath);
    const repositoryPath = `MemoryProxy/eval/tool-prompt-bench/formal-dataset/${team.evidencePath}`;
    let frozenSha = "";
    let frozenBlob = "";
    try {
      const frozen = execFileSync("git", ["show", `${team.evidenceSourceCommit}:${repositoryPath}`], {
        cwd: GIT_ROOT,
        maxBuffer: 16 * 1024 * 1024,
      });
      frozenSha = bytesSha256(frozen);
      frozenBlob = git("rev-parse", `${team.evidenceSourceCommit}:${repositoryPath}`);
    } catch {
      errors.push(`${team.teamId}: approval evidence commit cannot resolve the Gate`);
    }
    if (frozenSha !== team.evidenceFileSha256) {
      errors.push(`${team.teamId}: approval evidence commit/file SHA mismatch`);
    }
    if (frozenBlob.length > 0 && git("hash-object", repositoryPath) !== frozenBlob) {
      errors.push(`${team.teamId}: working Gate does not match the frozen Git blob`);
    }
    const gate = await readJson<Record<string, unknown>>(evidencePath);
    if (gate.team_id !== team.teamId) errors.push(`${team.teamId}: Gate team_id mismatch`);
    const passed = gate.status === "pass"
      || gate.status === "passed"
      || gate.passed === true
      || gate.valid === true;
    if (!passed) errors.push(`${team.teamId}: Gate is not passed`);
    const counts = isRecord(gate.counts) ? gate.counts : {};
    const pairCount = counts.pairs ?? counts.positive_pairs;
    if (pairCount !== 15) errors.push(`${team.teamId}: Gate Pair count ${String(pairCount)} != 15`);
    const gateErrors = Array.isArray(gate.errors) ? gate.errors : [];
    if (gateErrors.length > 0) errors.push(`${team.teamId}: Gate contains errors`);
    for (const pairId of team.pairIds) approvalByPairId.set(pairId, team.reviewStatus);
  }
  return {
    audit: {
      ledgerPath: PAIR_APPROVAL_LEDGER_PATH,
      ledgerFileSha256: await fileSha256(ledgerPath),
      ledgerCanonicalSha256: canonicalSha256(ledger),
      approvedTeamCount: ledger.teams.length,
      approvedPairCount: approvalByPairId.size,
      evidenceFileCount: ledger.teams.length,
      errors,
    },
    approvalByPairId,
  };
}

function buildPairV2(
  pair: FormalWorldContract["pairs"][number],
  contract: FormalWorldContract,
  minimalityReviewStatus: "approved",
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
    minimalityReviewStatus,
    independenceKey: `${split}:${positiveCase.identity.teamId}`,
    split,
  };
  const errors = validatePairOverlay(pairV2, positive, negative);
  if (errors.length > 0) fail(errors.join("\n"));
  return { pair: pairV2, positive, negative };
}

interface PairClusterAudit {
  clusterUnit: "team";
  devClusterCount: number;
  hiddenClusterCount: number;
  totalClusterCount: number;
  pairsPerCluster: Record<string, number>;
  errors: string[];
}

function validatePairClusters(
  pairs: readonly OverlayPairContractV2[],
  contract: FormalWorldContract,
): PairClusterAudit {
  const errors: string[] = [];
  const counts = new Map<string, number>();
  for (const pair of pairs) counts.set(pair.independenceKey, (counts.get(pair.independenceKey) ?? 0) + 1);
  const expectedKeys = contract.teams.map((team) => (
    `${team.split === "dev" ? "dev" : "hidden"}:${team.teamId}`
  ));
  for (const key of expectedKeys) {
    if (counts.get(key) !== 15) errors.push(`${key}: expected 15 pairs, found ${counts.get(key) ?? 0}`);
  }
  for (const key of counts.keys()) {
    if (!expectedKeys.includes(key)) errors.push(`${key}: unexpected Pair cluster`);
  }
  const devClusterCount = [...counts.keys()].filter((key) => key.startsWith("dev:")).length;
  const hiddenClusterCount = [...counts.keys()].filter((key) => key.startsWith("hidden:")).length;
  const expectedDevClusters = contract.teams.filter((team) => team.split === "dev").length;
  const expectedHiddenClusters = contract.teams.filter((team) => team.split === "hidden_test").length;
  if (devClusterCount !== expectedDevClusters) {
    errors.push(`Dev Pair clusters expected ${expectedDevClusters}, found ${devClusterCount}`);
  }
  if (hiddenClusterCount !== expectedHiddenClusters) {
    errors.push(`Hidden Pair clusters expected ${expectedHiddenClusters}, found ${hiddenClusterCount}`);
  }
  return {
    clusterUnit: "team",
    devClusterCount,
    hiddenClusterCount,
    totalClusterCount: counts.size,
    pairsPerCluster: Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    errors,
  };
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
  if (gold.length !== 800 || new Set(gold.map((item) => item.caseId)).size !== 800) {
    errors.push(`Gold v2 requires 800 unique cases, found ${gold.length}`);
  }
  for (const item of gold) {
    if (!caseIds.has(item.caseId)) errors.push(`${item.caseId}: unknown Case`);
    const legacy = annotationById.get(item.caseId);
    if (!legacy) continue;
    if (item.evaluationSchemaVersion !== 2) errors.push(`${item.caseId}: wrong evaluationSchemaVersion`);
    const expectedAttemptBudget = isConversationTerminalDowngrade(legacy)
      ? 1
      : legacy.gold.maxTdaiCalls;
    if (item.attemptBudget !== expectedAttemptBudget) errors.push(`${item.caseId}: attempt budget drift`);
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

interface M0GoldValidationAudit {
  scorerTag: string;
  scorerCommit: string;
  scorerSourceBlob: string;
  typesSourceBlob: string;
  jsonPathSourceBlob: string;
  normalizerSourceBlob: string;
  validatedGoldCount: number;
  negativeBindingTestCount: number;
  errors: string[];
}

function setArgumentPath(target: Record<string, unknown>, path: string, value: OverlayJsonValue): void {
  const segments = path.split(".").filter(Boolean);
  let current = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }
    const next = current[segment];
    if (!isRecord(next)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  });
}

function argumentsForStep(step: OverlayGoldStep): JsonObjectV2 {
  const result: Record<string, unknown> = {};
  for (const exact of step.arguments?.exact ?? []) setArgumentPath(result, exact.path, exact.value);
  for (const required of step.arguments?.required ?? []) {
    const root = required.split(".")[0];
    if (root !== undefined && result[root] === undefined) result[root] = "__M0_VALIDATION_REQUIRED__";
  }
  return result as JsonObjectV2;
}

function validateGoldWithFrozenM0(
  gold: readonly OverlayPrivateGoldV2[],
  runtimeContracts: readonly RuntimeContractV2[],
): M0GoldValidationAudit {
  const errors: string[] = [];
  let validatedGoldCount = 0;
  let negativeBindingTestCount = 0;
  for (const item of gold) {
    try {
      scoreCaseChain({
        gold: item as PrivateChainGoldV2,
        runtimeContracts: runtimeContracts as readonly M0RuntimeToolContractV2[],
        observation: {
          evaluationSchemaVersion: 2,
          caseId: item.caseId,
          runId: `data-contract-validation:${item.caseId}`,
          variantId: DATA_TAG,
          rawTraceStatus: "complete",
          attempts: [],
        },
      });
      validatedGoldCount += 1;
    } catch (error) {
      errors.push(`${item.caseId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const scenarioTypedBindingCases = gold
    .filter((item) => item.allowedSequences.some((sequence) => (
      sequence.steps.length === 2
      && sequence.steps[0]?.tool === "tdai_scenario_ls"
      && sequence.steps[1]?.tool === "tdai_read_scene"
      && sequence.steps[1].bindings.some((binding) => binding.argumentPath === "path")
    )))
    .map((item) => item.caseId);
  for (const caseId of scenarioTypedBindingCases) {
    const item = gold.find((candidate) => candidate.caseId === caseId);
    const steps = item?.allowedSequences[0]?.steps;
    if (!item || !steps || steps.length !== 2) {
      errors.push(`${caseId}: M0 negative binding fixture is unavailable`);
      continue;
    }
    const targetPath = steps[1]?.arguments?.exact?.find((predicate) => predicate.path === "path")?.value;
    if (typeof targetPath !== "string") {
      errors.push(`${caseId}: M0 negative binding fixture has no exact path`);
      continue;
    }
    const attempts: RawTdaiTraceAttemptV2[] = [
      {
        attemptId: `${caseId}:negative-binding:1`,
        executorBound: true,
        family: steps[0].family,
        tool: steps[0].tool,
        endpoint: steps[0].endpoint,
        method: steps[0].method,
        arguments: argumentsForStep(steps[0]),
        status: 200,
        response: { data: { entries: [{ path: "wrong/path" }], total: 1 } },
      },
      {
        attemptId: `${caseId}:negative-binding:2`,
        executorBound: true,
        family: steps[1].family,
        tool: steps[1].tool,
        endpoint: steps[1].endpoint,
        method: steps[1].method,
        arguments: argumentsForStep(steps[1]),
        status: 200,
        response: { data: { path: targetPath } },
      },
    ];
    try {
      const score = scoreCaseChain({
        gold: item as PrivateChainGoldV2,
        runtimeContracts: runtimeContracts as readonly M0RuntimeToolContractV2[],
        observation: {
          evaluationSchemaVersion: 2,
          caseId,
          runId: `negative-binding:${caseId}`,
          variantId: DATA_TAG,
          rawTraceStatus: "complete",
          attempts,
        },
      });
      if (score.completeChainSuccess !== false || score.failureLayer !== "binding") {
        errors.push(`${caseId}: frozen M0 did not reject the wrong prior-output path as binding failure`);
      } else {
        negativeBindingTestCount += 1;
      }
    } catch (error) {
      errors.push(`${caseId}: M0 negative binding validation threw ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    scorerTag: M0_SCORER_TAG,
    scorerCommit: M0_SCORER_COMMIT,
    scorerSourceBlob: M0_SOURCE_BLOBS.scorer,
    typesSourceBlob: M0_SOURCE_BLOBS.types,
    jsonPathSourceBlob: M0_SOURCE_BLOBS.jsonPath,
    normalizerSourceBlob: M0_SOURCE_BLOBS.normalizer,
    validatedGoldCount,
    negativeBindingTestCount,
    errors,
  };
}

interface MemoryFollowupAudit {
  auditedCaseCount: number;
  conversationTerminalDowngradeCount: number;
  scenarioTypedBindingCount: number;
  negativeBindingTestCount: number;
  conversationTerminalDowngradeCases: readonly string[];
  scenarioTypedBindingCases: readonly string[];
  scenarioResponsePath: "data.entries.0.path";
  conversationSearchSessionIdResponsePath: null;
  errors: string[];
}

function validateMemoryFollowupAudit(
  gold: readonly OverlayPrivateGoldV2[],
  contract: FormalWorldContract,
): MemoryFollowupAudit {
  const errors: string[] = [];
  let negativeBindingTestCount = 0;
  const goldById = new Map(gold.map((item) => [item.caseId, item]));
  const legacyMemoryFollowups = contract.privateAnnotations.filter((annotation) => (
    annotation.gold.expectedFollowupActions?.some((action) => (
      action.argumentRules?.valueFromPreviousStep
      && (action.tool === "tdai_conversation_query" || action.tool === "tdai_read_scene")
    ))
  ));
  const conversationTerminalDowngradeCases = legacyMemoryFollowups
    .filter(isConversationTerminalDowngrade)
    .map((item) => item.caseId)
    .sort();
  const scenarioTypedBindingCases = legacyMemoryFollowups
    .filter(isScenarioTypedBinding)
    .map((item) => item.caseId)
    .sort();
  if (conversationTerminalDowngradeCases.length + scenarioTypedBindingCases.length
    !== legacyMemoryFollowups.length) {
    errors.push("unsupported typed Memory follow-up tool in formal-v2 contract");
  }

  for (const caseId of conversationTerminalDowngradeCases) {
    const item = goldById.get(caseId);
    const steps = item?.allowedSequences[0]?.steps ?? [];
    if (item?.attemptBudget !== 1
      || steps.length !== 1
      || steps[0]?.tool !== "tdai_conversation_search"
      || !steps[0]?.terminal) {
      errors.push(`${caseId}: unsupported conversation/query terminal was not explicitly downgraded`);
    }
  }

  for (const caseId of scenarioTypedBindingCases) {
    const annotation = contract.privateAnnotations.find((item) => item.caseId === caseId);
    const item = goldById.get(caseId);
    if (!annotation || !item) {
      errors.push(`${caseId}: missing scenario binding source`);
      continue;
    }
    const targetPath = targetScenePath(annotation, contract);
    const steps = item.allowedSequences[0]?.steps ?? [];
    const terminal = steps[1];
    const binding = terminal?.bindings.find((candidate) => candidate.argumentPath === "path");
    if (!terminal?.terminal || terminal.tool !== "tdai_read_scene" || binding === undefined) {
      errors.push(`${caseId}: typed scenario path binding is missing`);
      continue;
    }
    if (binding.responsePath !== "data.entries.0.path") {
      errors.push(`${caseId}: typed scenario path binding does not match the production response contract`);
      continue;
    }
    const exactPath = terminal.arguments?.exact?.find((candidate) => candidate.path === "path")?.value;
    if (exactPath !== targetPath) errors.push(`${caseId}: terminal exact path is not frozen to the target scene`);
    const response = jsonValue({ data: { entries: [{ path: targetPath }], total: 1 } });
    if (validateOverlayBindingObservation(binding, response, targetPath).length !== 0) {
      errors.push(`${caseId}: valid production-shaped binding observation failed`);
    }
    if (validateOverlayBindingObservation(binding, response, "wrong/path").length === 0) {
      errors.push(`${caseId}: wrong bound path was accepted`);
    } else {
      negativeBindingTestCount += 1;
    }
  }

  return {
    auditedCaseCount: legacyMemoryFollowups.length,
    conversationTerminalDowngradeCount: conversationTerminalDowngradeCases.length,
    scenarioTypedBindingCount: scenarioTypedBindingCases.length,
    negativeBindingTestCount,
    conversationTerminalDowngradeCases,
    scenarioTypedBindingCases,
    scenarioResponsePath: "data.entries.0.path",
    conversationSearchSessionIdResponsePath: null,
    errors,
  };
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
  const dataTag = option("--data-tag") ?? DATA_TAG;
  const dataCommit = option("--data-commit") ?? DATA_COMMIT;
  assertOverlayCanonicalContract();
  assertDataIdentity(dataTag, dataCommit);

  const datasetRoot = resolve(import.meta.dirname, "..");
  await assertWorkingDataMatchesTag(datasetRoot, dataCommit);
  const contractPath = resolve(datasetRoot, "registry/contracts/formal-v2.json");
  const contract = await readJson<FormalWorldContract>(contractPath);
  if (contract.world.status !== "frozen") fail("formal-v2 world is not frozen");
  if (contract.teams.length !== 20
    || contract.publicCases.length !== 800
    || contract.privateAnnotations.length !== 800
    || contract.pairs.length !== 300) {
    fail("formal-v2 count mismatch");
  }

  const teamSplit = new Map(contract.teams.map((team) => [team.teamId, team.split]));
  const caseSplit = (caseId: string): OverlaySplit => {
    const item = contract.publicCases.find((candidate) => candidate.caseId === caseId) ?? fail(`${caseId}: missing Case`);
    return teamSplit.get(item.identity.teamId) === "dev" ? "dev" : "hidden";
  };
  const allGold = contract.privateAnnotations
    .map((annotation) => buildGoldV2(annotation, contract))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const runtimeContracts = buildRuntimeContracts(allGold);
  const goldErrors = validateGoldOverlay(allGold, contract, runtimeContracts);
  const memoryFollowupAudit = validateMemoryFollowupAudit(allGold, contract);
  const m0GoldValidation = validateGoldWithFrozenM0(allGold, runtimeContracts);
  if (goldErrors.length + memoryFollowupAudit.errors.length + m0GoldValidation.errors.length > 0) {
    fail([...goldErrors, ...memoryFollowupAudit.errors, ...m0GoldValidation.errors].join("\n"));
  }

  const pairApprovalLedgerPath = resolve(datasetRoot, PAIR_APPROVAL_LEDGER_PATH);
  const pairApprovalLedger = await buildPairApprovalLedger(contract, datasetRoot, dataCommit);
  await writeJson(pairApprovalLedgerPath, pairApprovalLedger);
  const pairApproval = await validatePairApprovalEvidence(
    pairApprovalLedger,
    contract,
    datasetRoot,
    pairApprovalLedgerPath,
  );
  if (pairApproval.audit.errors.length > 0) fail(pairApproval.audit.errors.join("\n"));
  const pairs = contract.pairs.map((pair) => buildPairV2(
    pair,
    contract,
    pairApproval.approvalByPairId.get(pair.pairId) ?? fail(`${pair.pairId}: no approved ledger evidence`),
  ));
  const pairErrors = pairs.flatMap((item) => validatePairOverlay(item.pair, item.positive, item.negative));
  const pairClusterAudit = validatePairClusters(pairs.map((item) => item.pair), contract);
  if (pairErrors.length + pairClusterAudit.errors.length > 0) {
    fail([...pairErrors, ...pairClusterAudit.errors].join("\n"));
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

  const providerDevPath = resolve(datasetRoot, "revisions/formal-v2/provider/dev.jsonl");
  const providerHiddenPath = resolve(datasetRoot, "revisions/formal-v2/provider/hidden.sealed.jsonl");
  const providerDev = await readJsonl<unknown>(providerDevPath);
  const providerHidden = await readJsonl<unknown>(providerHiddenPath);
  const snapshots = Object.fromEntries(contract.snapshots.map((snapshot) => [snapshot.split, canonicalSha256V1(snapshot)]));
  const privateDev = contract.privateAnnotations.filter((item) => caseSplit(item.caseId) === "dev");
  const privateHidden = contract.privateAnnotations.filter((item) => caseSplit(item.caseId) === "hidden");
  const runtimeSourcePath = resolve(datasetRoot, "../../../src/injection/tool-prompt/runtime-contract.ts");
  const runtimeSourceRelative = "MemoryProxy/src/injection/tool-prompt/runtime-contract.ts";
  const runtimeSourceCommit = git("log", "-1", "--format=%H", "--", runtimeSourceRelative);
  if (!/^[a-f0-9]{40}$/.test(runtimeSourceCommit)) fail("RuntimeToolContract source commit is not frozen");
  const memoryRouterSourceRelative = "MemoryCore/src/gateway/v2-router.ts";
  const memoryRouterSourcePath = resolve(GIT_ROOT, memoryRouterSourceRelative);
  const memoryRouterSourceCommit = git("log", "-1", "--format=%H", "--", memoryRouterSourceRelative);
  if (!/^[a-f0-9]{40}$/.test(memoryRouterSourceCommit)) fail("MemoryCore router source commit is not frozen");
  const memoryFollowupAuditRecord = {
    schemaVersion: "task1.memory-followup-audit.v1",
    ...memoryFollowupAudit,
    reasons: {
      conversationTerminalDowngrade: "The production conversation_search response exposes id/role/content/timestamp/score but no session_id/session_key; Task 1 therefore treats the matching search result as the sufficient terminal.",
      scenarioTypedBinding: "The production scenario_ls response exposes data.entries[].path, so read_scene.path is bound to data.entries.0.path.",
    },
    productionResponseEvidence: {
      sourcePath: memoryRouterSourceRelative,
      sourceCommit: memoryRouterSourceCommit,
      sourceFileSha256: await fileSha256(memoryRouterSourcePath),
      conversationSearch:
        `data.messages[] omits session_id/session_key; search is terminal for ${memoryFollowupAudit.conversationTerminalDowngradeCount} cases`,
      scenarioList:
        `data.entries.0.path binds to read_scene.path for ${memoryFollowupAudit.scenarioTypedBindingCount} prefix-filtered cases`,
    },
  };
  const memoryFollowupContract = {
    ...memoryFollowupAuditRecord,
    strictCanonicalSha256: canonicalSha256(memoryFollowupAuditRecord),
  };
  const { errors: _pairClusterErrors, ...pairClusterContract } = pairClusterAudit;
  void _pairClusterErrors;
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
    canonicalContract: {
      canonicalContractId: CANONICAL_CONTRACT_ID,
      sourcePath: CANONICAL_SOURCE_PATH,
      sourceBlob: CANONICAL_SOURCE_BLOB,
      sharedTestPath: CANONICAL_TEST_PATH,
      sharedTestBlob: CANONICAL_TEST_BLOB,
      m1V2_1: { tag: M1_CANONICAL_TAG, commit: M1_CANONICAL_COMMIT },
      m2V2_1: { tag: M2_CANONICAL_TAG, commit: M2_CANONICAL_COMMIT },
    },
    dataFreeze: {
      tag: dataTag,
      tagObject: DATA_TAG_OBJECT,
      commit: dataCommit,
      statusBlob: STATUS_BLOB,
      statusSha256: STATUS_SHA256,
      canonicalContract: {
        canonicalContractId: "task1.formal-snapshot.canonical-json.v1",
        sourcePath: "MemoryProxy/eval/tool-prompt-bench/worlds/formal-snapshot.ts",
        sourceBlob: git("rev-parse", `${dataCommit}:MemoryProxy/eval/tool-prompt-bench/worlds/formal-snapshot.ts`),
      },
      contractPath: "registry/contracts/formal-v2.json",
      contractFileSha256: await fileSha256(contractPath),
      contractCanonicalSha256: canonicalSha256V1(contract),
      provider: {
        devCanonicalSha256: canonicalSha256V1(providerDev),
        hiddenCanonicalSha256: canonicalSha256V1(providerHidden),
        fullCanonicalSha256: canonicalSha256V1([...providerDev, ...providerHidden]),
      },
      privateAnnotations: {
        devCanonicalSha256: canonicalSha256V1(privateDev),
        hiddenCanonicalSha256: canonicalSha256V1(privateHidden),
        fullCanonicalSha256: canonicalSha256V1(contract.privateAnnotations),
      },
      pairsCanonicalSha256: canonicalSha256V1(contract.pairs),
      snapshots: {
        devCanonicalSha256: snapshots.dev,
        hiddenCanonicalSha256: snapshots.hidden_test,
      },
      caseIdsSha256: canonicalSha256V1(contract.publicCases.map((item) => item.caseId)),
      pairIdsSha256: canonicalSha256V1(contract.pairs.map((item) => item.pairId)),
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
    memoryFollowupContract,
    frozenM0GoldValidation: m0GoldValidation,
    pairMinimalityApprovalContract: pairApproval.audit,
    pairClusterContract,
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
    dataContractReady: true,
    dataOverlayGateStatus: "passed",
    realChainR01R04Status: "pending",
    measurementIntegrationReady: false,
    formalCampaignReady: false,
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
  const persistedMemoryFollowupAudit = validateMemoryFollowupAudit(persistedGold, contract);
  const persistedM0GoldValidation = validateGoldWithFrozenM0(persistedGold, runtimeContracts);
  const persistedPairApproval = await validatePairApprovalEvidence(
    pairApprovalLedger,
    contract,
    datasetRoot,
    pairApprovalLedgerPath,
  );
  const persistedPairErrors = persistedPairs.flatMap((pair) => {
    const built = pairs.find((item) => item.pair.pairId === pair.pairId);
    return built ? validatePairOverlay(pair, built.positive, built.negative) : [`${pair.pairId}: no source pair`];
  });
  const persistedPairClusterAudit = validatePairClusters(persistedPairs, contract);
  const providerText = `${await readFile(providerDevPath, "utf8")}\n${await readFile(providerHiddenPath, "utf8")}`;
  const privateLeakTokens = ["evaluationSchemaVersion", "invariantFieldsSha256", "minimalityReviewStatus"];
  const providerLeakage = privateLeakTokens.filter((token) => providerText.includes(token));
  const errors = [
    ...persistedGoldErrors,
    ...persistedPairErrors,
    ...persistedPairClusterAudit.errors,
    ...persistedMemoryFollowupAudit.errors,
    ...persistedM0GoldValidation.errors,
    ...persistedPairApproval.audit.errors,
  ];
  if (persistedGold.length !== 800) errors.push(`persisted Gold count ${persistedGold.length}`);
  if (persistedPairs.length !== 300) errors.push(`persisted Pair count ${persistedPairs.length}`);
  if (providerLeakage.length > 0) errors.push(`provider overlay leakage: ${providerLeakage.join(",")}`);
  if (persistedManifest.dataFreeze.commit !== dataCommit) errors.push("manifest data commit drift");
  const {
    strictCanonicalSha256: persistedMemoryAuditSha,
    ...persistedMemoryAuditWithoutSha
  } = persistedManifest.memoryFollowupContract;
  if (canonicalSha256(persistedMemoryAuditWithoutSha) !== persistedMemoryAuditSha) {
    errors.push("persisted Memory follow-up audit strict canonical SHA mismatch");
  }
  const knowledgeTerminalCount = persistedGold.filter((item) => item.allowedSequences.some((sequence) => (
    sequence.steps.at(-1)?.family === "knowledge"
  ))).length;
  const pairChangedPointerCount = persistedPairs.filter((pair) => (
    pair.allowedChangedPointers.length === 1
  )).length;
  const pairCausalFactorCount = persistedPairs.filter((pair) => pair.causalFactorId.length > 0).length;
  if (runtimeContracts.length !== 22) errors.push(`runtime contract count ${runtimeContracts.length} != 22`);
  if (knowledgeTerminalCount !== 60) errors.push(`knowledge terminal count ${knowledgeTerminalCount} != 60`);
  if (pairChangedPointerCount !== 300) errors.push(`single-pointer Pair count ${pairChangedPointerCount} != 300`);
  if (pairCausalFactorCount !== 300) errors.push(`Pair causal factor count ${pairCausalFactorCount} != 300`);
  const report = {
    schemaVersion: "task1.measurement-v2-overlay-validation.v1",
    valid: errors.length === 0,
    errors,
    dataTag,
    dataCommit,
    canonicalContract: persistedManifest.canonicalContract,
    counts: persistedManifest.counts,
    canonicalSha256: {
      goldV2Full: canonicalSha256(persistedGold),
      pairV2Full: canonicalSha256([...persistedPairs].sort((left, right) => left.pairId.localeCompare(right.pairId))),
      runtimeContracts: canonicalSha256(runtimeContracts),
      manifest: canonicalSha256(persistedManifest),
    },
    providerLeakageCount: providerLeakage.length,
    pairValidationErrorCount: persistedPairErrors.length,
    pairClusterAudit: persistedPairClusterAudit,
    pairMinimalityApprovalAudit: persistedPairApproval.audit,
    goldValidationErrorCount: persistedGoldErrors.length,
    frozenM0GoldValidation: persistedM0GoldValidation,
    memoryFollowupAudit: persistedManifest.memoryFollowupContract,
    contractCoverage: {
      runtimeContracts: runtimeContracts.length,
      knowledgeTerminalCases: knowledgeTerminalCount,
      pairSingleChangedPointer: pairChangedPointerCount,
      pairCausalFactor: pairCausalFactorCount,
    },
    dataOverlayGates: {
      "DS06-G01_private_gold_v2": errors.length === 0 ? "passed" : "failed",
      "DS06-G02_pair_v2": errors.length === 0 ? "passed" : "failed",
      "DS06-G03_overlay_validator": errors.length === 0 ? "passed" : "failed",
      "DS06-G04_provider_exclusion_and_schema_shape": errors.length === 0 ? "passed" : "failed",
    },
    dataContractReady: errors.length === 0,
    realChainR01R04Status: "pending",
    measurementIntegrationReady: false,
    formalCampaignReady: false,
    formalMetricEligible: false,
  };
  const reportPath = resolve(datasetRoot, "reports/DS06-MEASUREMENT-V2-OVERLAY-VALIDATION.json");
  await writeJson(reportPath, report);
  if (errors.length > 0) fail(errors.join("\n"));
  console.log(JSON.stringify({ manifestPath, reportPath, ...report }, null, 2));
}

await main();
