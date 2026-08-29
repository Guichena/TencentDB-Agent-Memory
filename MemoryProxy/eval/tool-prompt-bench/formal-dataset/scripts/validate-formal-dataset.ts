import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFormalProvenanceSummary, compileFormalSplitInputs } from "../../worlds/formal-compile.js";
import {
  validateFormalWorldContract,
  type FormalSplit,
  type FormalWorldContract,
} from "../../worlds/formal-schema.js";
import { canonicalJson, canonicalSha256 } from "../../worlds/formal-snapshot.js";

const DEV_TEAMS = ["T01", "T02", "T03", "T04", "T11", "T12"] as const;
const HIDDEN_TEAMS = ["T05", "T06", "T07", "T08", "T09", "T10", "T13", "T14", "T15", "T16"] as const;
const ALL_TEAMS = [...DEV_TEAMS, ...HIDDEN_TEAMS].sort((a, b) => a.localeCompare(b));
const DISCOVERY_TOOLS = new Set([
  "knowledge_tools_list", "skill_search", "tdai_conversation_search",
  "tdai_memory_search", "tdai_scenario_ls",
]);
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_COMMIT = /^[a-f0-9]{40}$/i;

function legacyDraftDeltaSha256(input: {
  positiveDeltaMessage: unknown;
  negativeDeltaMessage: unknown;
  query: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    positive_delta_message: input.positiveDeltaMessage,
    negative_delta_message: input.negativeDeltaMessage,
    query: input.query,
  }), "utf8").digest("hex");
}

function validatePairIntegrity(contract: FormalWorldContract): string[] {
  const errors: string[] = [];
  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  for (const pair of contract.pairs) {
    const positive = publicById.get(pair.positiveCaseId);
    const negative = publicById.get(pair.negativeCaseId);
    if (!positive || !negative) continue;
    const { sessionId: positiveSessionId, ...positiveIdentity } = positive.identity;
    const { sessionId: negativeSessionId, ...negativeIdentity } = negative.identity;
    void positiveSessionId;
    void negativeSessionId;
    const sameFrozenFields = canonicalSha256({
      identity: positiveIdentity,
      snapshotId: positive.snapshotId,
      workspace: positive.workspace,
      language: positive.language,
      difficulty: positive.difficulty,
      query: positive.query,
      visibleAssetSetSha256: positive.visibleAssetSetSha256,
    }) === canonicalSha256({
      identity: negativeIdentity,
      snapshotId: negative.snapshotId,
      workspace: negative.workspace,
      language: negative.language,
      difficulty: negative.difficulty,
      query: negative.query,
      visibleAssetSetSha256: negative.visibleAssetSetSha256,
    });
    if (!sameFrozenFields) errors.push(`${pair.pairId}: positive/negative frozen fields differ`);
    if (positive.contextMessages.length !== negative.contextMessages.length) {
      errors.push(`${pair.pairId}: positive/negative context lengths differ`);
      continue;
    }
    const changedIndexes = positive.contextMessages.flatMap((message, index) =>
      canonicalSha256(message) === canonicalSha256(negative.contextMessages[index]) ? [] : [index]);
    if (changedIndexes.length !== 1) {
      errors.push(`${pair.pairId}: expected exactly one registered context delta, found ${changedIndexes.length}`);
      continue;
    }
    const changedIndex = changedIndexes[0];
    const actualDelta = legacyDraftDeltaSha256({
      positiveDeltaMessage: positive.contextMessages[changedIndex],
      negativeDeltaMessage: negative.contextMessages[changedIndex],
      query: positive.query,
    });
    if (actualDelta !== pair.controlledDeltaSha256) errors.push(`${pair.pairId}: controlledDeltaSha256 mismatch`);
  }
  return errors;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated].sort((a, b) => a.localeCompare(b));
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizedCopyText(value: string): string {
  return normalizeText(value)
    .replace(/\bt(?:0[1-9]|1[0-6])\b/gi, "<team>")
    .replace(/\b(?:agent|team|task|session|user)-task1-[a-z0-9-]+\b/gi, "<identity>")
    .replace(/\b(?:case|pair)[-_]?[a-z0-9-]+\b/gi, "<case>");
}

function ngrams(value: string, width = 12): Set<string> {
  const tokens = normalizeText(value).match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const result = new Set<string>();
  for (let index = 0; index + width <= tokens.length; index += 1) {
    result.add(tokens.slice(index, index + width).join(" "));
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function expectExactSet(errors: string[], label: string, actual: readonly string[], expected: readonly string[]): void {
  const a = [...actual].sort((left, right) => left.localeCompare(right));
  const e = [...expected].sort((left, right) => left.localeCompare(right));
  if (canonicalJson(a) !== canonicalJson(e)) errors.push(`${label} expected [${e.join(", ")}], got [${a.join(", ")}]`);
}

function expectCount(errors: string[], label: string, actual: number, expected: number): void {
  if (actual !== expected) errors.push(`${label} expected ${expected}, got ${actual}`);
}

function validateCrossSplitCopies(contract: FormalWorldContract): string[] {
  const errors: string[] = [];
  const splitByTeam = new Map(contract.teams.map((team) => [team.teamId, team.split]));
  const dev = contract.publicCases.filter((item) => splitByTeam.get(item.identity.teamId) === "dev");
  const hidden = contract.publicCases.filter((item) => splitByTeam.get(item.identity.teamId) === "hidden_test");
  const devQueries = new Map(dev.map((item) => [normalizeText(item.query), item.caseId]));
  const devQueryHashes = new Map(dev.map((item) => [canonicalSha256(normalizeText(item.query)), item.caseId]));
  const devContexts = new Map(dev.map((item) => [canonicalSha256(item.contextMessages), item.caseId]));
  const devCopies = new Map(dev.map((item) => [canonicalSha256(normalizedCopyText(JSON.stringify({
    language: item.language, contextMessages: item.contextMessages, query: item.query,
  }))), item.caseId]));
  for (const item of hidden) {
    const queryKey = normalizeText(item.query);
    const queryMatch = devQueries.get(queryKey) ?? devQueryHashes.get(canonicalSha256(queryKey));
    if (queryMatch) errors.push(`cross-split duplicate query: ${queryMatch} / ${item.caseId}`);
    const contextMatch = devContexts.get(canonicalSha256(item.contextMessages));
    if (contextMatch) errors.push(`cross-split duplicate context: ${contextMatch} / ${item.caseId}`);
    const copyMatch = devCopies.get(canonicalSha256(normalizedCopyText(JSON.stringify({
      language: item.language, contextMessages: item.contextMessages, query: item.query,
    }))));
    if (copyMatch) errors.push(`cross-Team renamed-copy case: ${copyMatch} / ${item.caseId}`);
  }

  const toGramItems = (items: typeof dev) => items.map((item) => ({
    caseId: item.caseId,
    grams: ngrams(`${item.contextMessages.map((message) => message.content).join(" ")} ${item.query}`),
  })).filter((item) => item.grams.size >= 8);
  for (const left of toGramItems(dev)) {
    for (const right of toGramItems(hidden)) {
      if (jaccard(left.grams, right.grams) >= 0.9) {
        errors.push(`cross-split high-order n-gram copy: ${left.caseId} / ${right.caseId}`);
      }
    }
  }

  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  const templates: Record<FormalSplit, Map<string, string>> = { dev: new Map(), hidden_test: new Map() };
  for (const pair of contract.pairs) {
    const positive = publicById.get(pair.positiveCaseId);
    const negative = publicById.get(pair.negativeCaseId);
    if (!positive || !negative) continue;
    const changedIndex = positive.contextMessages.findIndex((message, index) =>
      canonicalSha256(message) !== canonicalSha256(negative.contextMessages[index]));
    const template = canonicalSha256(normalizedCopyText(JSON.stringify({
      counterfactualKind: pair.counterfactualKind,
      query: positive.query,
      positiveDelta: positive.contextMessages[changedIndex],
      negativeDelta: negative.contextMessages[changedIndex],
    })));
    templates[splitByTeam.get(positive.identity.teamId)!].set(template, pair.pairId);
  }
  for (const [template, hiddenPairId] of templates.hidden_test) {
    const devPairId = templates.dev.get(template);
    if (devPairId) errors.push(`cross-split duplicate pair template: ${devPairId} / ${hiddenPairId}`);
  }
  return errors;
}

/** Contract-only formal-v1 freeze checks. Exported for direct success/count-drift tests. */
export function validateFormalV1Freeze(contract: FormalWorldContract, requestedSplit?: FormalSplit): string[] {
  const errors: string[] = [];
  const expectedTeams = requestedSplit === "dev" ? DEV_TEAMS : ALL_TEAMS;
  expectExactSet(errors, "formal-v1 Team set", contract.teams.map((team) => team.teamId), expectedTeams);
  if (contract.world.spaceId !== "space-task1-engineering") {
    errors.push(`formal-v1 Space expected space-task1-engineering, got ${contract.world.spaceId}`);
  }
  expectExactSet(errors, "world.teamIds", contract.world.teamIds, contract.teams.map((team) => team.teamId));

  const idsToCheck: Array<[string, string[]]> = [
    ["Case", contract.publicCases.map((item) => item.caseId)],
    ["private annotation", contract.privateAnnotations.map((item) => item.caseId)],
    ["Pair", contract.pairs.map((item) => item.pairId)],
    ["source", contract.sourceEvidence.map((item) => item.sourceId)],
    ["Team", contract.teams.map((item) => item.teamId)],
    ["Agent", contract.businessAgents.map((item) => item.agentId)],
    ["Task", contract.tasks.map((item) => item.taskId)],
    ["Asset", [...contract.assets.l0Conversations, ...contract.assets.l1Memories,
      ...contract.assets.l2Scenes, ...contract.assets.l3Profiles,
      ...contract.assets.skills, ...contract.assets.knowledge].map((item) => item.assetId)],
  ];
  for (const [label, ids] of idsToCheck) {
    const repeated = duplicates(ids);
    if (repeated.length > 0) errors.push(`${label} ids are not unique: ${repeated.join(", ")}`);
  }

  const annotationById = new Map(contract.privateAnnotations.map((item) => [item.caseId, item]));
  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  const pairReferences = new Map<string, number>();
  for (const pair of contract.pairs) {
    for (const caseId of [pair.positiveCaseId, pair.negativeCaseId]) {
      pairReferences.set(caseId, (pairReferences.get(caseId) ?? 0) + 1);
    }
    const positive = annotationById.get(pair.positiveCaseId);
    const negative = annotationById.get(pair.negativeCaseId);
    if (positive?.pairId !== pair.pairId || positive.pairRole !== "positive") {
      errors.push(`${pair.pairId}: positive annotation is not a bijective positive pair member`);
    }
    if (negative?.pairId !== pair.pairId || negative.pairRole !== "negative") {
      errors.push(`${pair.pairId}: negative annotation is not a bijective negative pair member`);
    }
  }
  for (const annotation of contract.privateAnnotations.filter((item) => item.pairId)) {
    if ((pairReferences.get(annotation.caseId) ?? 0) !== 1) {
      errors.push(`${annotation.caseId}: paired Case must occur in exactly one Pair`);
    }
  }

  for (const team of contract.teams) {
    const cases = contract.publicCases.filter((item) => item.identity.teamId === team.teamId);
    const annotations = cases.flatMap((item) => {
      const annotation = annotationById.get(item.caseId);
      return annotation ? [annotation] : [];
    });
    const positives = annotations.filter((item) => item.gold.needTdaiTool);
    const family = (name: "memory" | "skill" | "knowledge") =>
      positives.filter((item) => item.gold.family === name).length;
    const discovery = positives.filter((item) =>
      item.gold.allowedFirstActions.some((action) => DISCOVERY_TOOLS.has(action.tool))).length;
    expectCount(errors, `${team.teamId} Cases`, cases.length, 40);
    expectCount(errors, `${team.teamId} annotations`, annotations.length, 40);
    expectCount(errors, `${team.teamId} Pairs`, contract.pairs.filter((pair) =>
      publicById.get(pair.positiveCaseId)?.identity.teamId === team.teamId).length, 15);
    expectCount(errors, `${team.teamId} Memory positives`, family("memory"), 6);
    expectCount(errors, `${team.teamId} Skill positives`, family("skill"), 6);
    expectCount(errors, `${team.teamId} Knowledge positives`, family("knowledge"), 3);
    expectCount(errors, `${team.teamId} paired negatives`, annotations.filter((item) => item.pairRole === "negative").length, 15);
    expectCount(errors, `${team.teamId} natural negatives`, annotations.filter((item) => !item.pairId).length, 10);
    expectCount(errors, `${team.teamId} discovery positives`, discovery, 10);
    expectCount(errors, `${team.teamId} direct positives`, positives.length - discovery, 5);
  }

  const selectedTeamIds = new Set(requestedSplit
    ? contract.teams.filter((team) => team.split === requestedSplit).map((team) => team.teamId)
    : contract.teams.map((team) => team.teamId));
  const selectedCases = contract.publicCases.filter((item) => selectedTeamIds.has(item.identity.teamId));
  const selectedAnnotations = selectedCases.flatMap((item) => {
    const annotation = annotationById.get(item.caseId);
    return annotation ? [annotation] : [];
  });
  const selectedPositives = selectedAnnotations.filter((item) => item.gold.needTdaiTool);
  const selectedPairs = contract.pairs.filter((pair) =>
    selectedTeamIds.has(publicById.get(pair.positiveCaseId)?.identity.teamId ?? ""));
  const multiplier = requestedSplit === "dev" ? DEV_TEAMS.length
    : requestedSplit === "hidden_test" ? HIDDEN_TEAMS.length : ALL_TEAMS.length;
  const label = requestedSplit ?? "full";
  expectCount(errors, `${label} Cases`, selectedCases.length, multiplier * 40);
  expectCount(errors, `${label} Pairs`, selectedPairs.length, multiplier * 15);
  expectCount(errors, `${label} Memory positives`, selectedPositives.filter((item) => item.gold.family === "memory").length, multiplier * 6);
  expectCount(errors, `${label} Skill positives`, selectedPositives.filter((item) => item.gold.family === "skill").length, multiplier * 6);
  expectCount(errors, `${label} Knowledge positives`, selectedPositives.filter((item) => item.gold.family === "knowledge").length, multiplier * 3);
  expectCount(errors, `${label} paired negatives`, selectedAnnotations.filter((item) => item.pairRole === "negative").length, multiplier * 15);
  expectCount(errors, `${label} natural negatives`, selectedAnnotations.filter((item) => !item.pairId).length, multiplier * 10);
  const discovery = selectedPositives.filter((item) =>
    item.gold.allowedFirstActions.some((action) => DISCOVERY_TOOLS.has(action.tool))).length;
  expectCount(errors, `${label} discovery positives`, discovery, multiplier * 10);
  expectCount(errors, `${label} direct positives`, selectedPositives.length - discovery, multiplier * 5);

  if (!requestedSplit && contract.teams.length === ALL_TEAMS.length) errors.push(...validateCrossSplitCopies(contract));
  return errors;
}

interface StagedFragment {
  generatorBatchRefs?: unknown[];
  externalImports?: Array<Record<string, unknown>>;
}

function firstText(item: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) if (typeof item[key] === "string" && String(item[key]).trim()) return String(item[key]);
  return undefined;
}

async function validateStagedFreeze(datasetRoot: string, teamIds: readonly string[]): Promise<string[]> {
  const errors: string[] = [];
  const batchOwners = new Map<string, string>();
  for (const teamId of teamIds) {
    const path = resolve(datasetRoot, "staging", "teams", teamId, "team-fragment.json");
    let fragment: StagedFragment;
    try {
      fragment = JSON.parse(await readFile(path, "utf8")) as StagedFragment;
    } catch (error) {
      errors.push(`${teamId}: cannot read staged fragment: ${String(error)}`);
      continue;
    }
    for (const raw of fragment.generatorBatchRefs ?? []) {
      const batchId = typeof raw === "string" ? raw
        : raw && typeof raw === "object"
          ? firstText(raw as Record<string, unknown>, ["batchId", "batch_id"])
          : undefined;
      if (!batchId) {
        errors.push(`${teamId}: generator batch reference lacks an id`);
        continue;
      }
      const owner = batchOwners.get(batchId);
      if (owner) errors.push(`generator batch id ${batchId} is shared by ${owner} and ${teamId}`);
      else batchOwners.set(batchId, teamId);
    }
    for (const [index, item] of (fragment.externalImports ?? []).entries()) {
      const prefix = `${teamId} externalImports[${index}]`;
      const repository = firstText(item, ["repository", "repository_url", "repositoryUrl"]);
      const revision = firstText(item, ["commit", "commit_sha", "revision", "commitSha", "repositoryCommit"]);
      const sourcePath = firstText(item, ["path", "upstreamPath", "sourcePath"]);
      const license = firstText(item, ["license", "license_spdx"]);
      const hash = firstText(item, ["rawSha256", "raw_sha256", "rawFileSha256", "sha256"]);
      if (!repository) errors.push(`${prefix}: repository is required`);
      if (!revision || !GIT_COMMIT.test(revision)) errors.push(`${prefix}: pinned 40-char revision is required`);
      if (!sourcePath) errors.push(`${prefix}: source path is required`);
      if (!license) errors.push(`${prefix}: license is required`);
      if (!hash || !SHA256.test(hash)) errors.push(`${prefix}: source file sha256 is required`);
    }
  }
  return errors;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error("usage: tsx validate-formal-dataset.ts --contract <formal-world.json> [--split dev|hidden_test] [--freeze-contract formal-v1] [--report report.json]");
  process.exit(2);
}

async function main(): Promise<void> {
  const contractPath = option("--contract");
  const requestedSplit = option("--split") as FormalSplit | undefined;
  const freezeContract = option("--freeze-contract");
  if (!contractPath
    || (requestedSplit && requestedSplit !== "dev" && requestedSplit !== "hidden_test")
    || (freezeContract && freezeContract !== "formal-v1")) usage();
  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8")) as FormalWorldContract;
  const validation = validateFormalWorldContract(contract);
  const splits: FormalSplit[] = requestedSplit ? [requestedSplit] : ["dev", "hidden_test"];
  const compiled = validation.valid ? splits.flatMap((split) => compileFormalSplitInputs(contract, split)) : [];
  const providerText = compiled.map((item) => JSON.stringify(item.provider)).join("\n");
  const privateMarkers = [
    "allowedFirstActions", "expectedFollowupActions", "expectedKnowledgeCalls",
    "allowedSequences", "targetAssetIds", "informationGap", "annotationReason",
    "provenanceKind", "generatorModel", "batchId", "contentRefs", "sourceRepoUrl",
  ];
  const leakedMarkers = privateMarkers.filter((marker) => providerText.includes(marker));
  const pairIntegrityErrors = validation.valid ? validatePairIntegrity(contract) : [];
  const freezeErrors = freezeContract === "formal-v1" && validation.valid ? [
    ...validateFormalV1Freeze(contract, requestedSplit),
    ...await validateStagedFreeze(resolve(import.meta.dirname, ".."), contract.teams.map((team) => team.teamId)),
  ] : [];
  const teamCounts = Object.fromEntries(contract.teams.map((team) => [team.teamId,
    compiled.filter((item) => item.sessionInit.registration.team_id === team.teamId).length]));
  const errors = [...validation.errors, ...pairIntegrityErrors, ...freezeErrors];
  if (leakedMarkers.length > 0) errors.push(`provider leakage markers: ${leakedMarkers.join(", ")}`);
  const invalidSequenceCount = errors.filter((error) => /sequence|follow-up expectation/i.test(error)).length;
  const missingSourceRefCount = errors.filter((error) =>
    /unknown source|sourceEvidenceIds must not be empty|evidenceRefs must not be empty|lacks current_anchor evidence/i.test(error)).length;
  const pairsByTeam = Object.fromEntries(contract.teams.map((team) => [team.teamId,
    contract.pairs.filter((pair) => contract.publicCases.find((item) =>
      item.caseId === pair.positiveCaseId)?.identity.teamId === team.teamId).length]));
  const report = {
    schema_version: freezeContract === "formal-v1" ? "task1.formal_dataset_validation.v3" : "task1.formal_dataset_validation.v2",
    freeze_contract: freezeContract ?? null,
    valid: errors.length === 0,
    errors,
    splits,
    case_count: compiled.length,
    team_case_counts: teamCounts,
    pair_count: requestedSplit
      ? contract.pairs.filter((pair) => compiled.some((item) => item.provider.caseId === pair.positiveCaseId)).length
      : contract.pairs.length,
    pairs_by_team: pairsByTeam,
    pair_integrity_error_count: pairIntegrityErrors.length,
    pair_integrity_errors: pairIntegrityErrors,
    freeze_error_count: freezeErrors.length,
    freeze_errors: freezeErrors,
    provider_leakage_count: leakedMarkers.length,
    invalid_sequence_count: invalidSequenceCount,
    missing_source_ref_count: missingSourceRefCount,
    provenance: validation.valid ? compileFormalProvenanceSummary(contract) : null,
    provider_sha256: canonicalSha256(compiled.map((item) => item.provider)),
    snapshot_sha256: Object.fromEntries(contract.snapshots.map((snapshot) => [snapshot.split, canonicalSha256(snapshot)])),
  };
  const reportPath = option("--report");
  if (reportPath) await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
