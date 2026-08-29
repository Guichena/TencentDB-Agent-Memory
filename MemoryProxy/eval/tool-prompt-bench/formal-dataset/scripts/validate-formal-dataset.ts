import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileFormalProvenanceSummary,
  compileFormalSplitInputs,
} from "../../worlds/formal-compile.js";
import {
  validateFormalWorldContract,
  type FormalSplit,
  type FormalWorldContract,
} from "../../worlds/formal-schema.js";
import { canonicalSha256 } from "../../worlds/formal-snapshot.js";

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
    if (actualDelta !== pair.controlledDeltaSha256) {
      errors.push(`${pair.pairId}: controlledDeltaSha256 mismatch`);
    }
  }
  return errors;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  console.error("usage: tsx validate-formal-dataset.ts --contract <formal-world.json> [--split dev|hidden_test] [--report report.json]");
  process.exit(2);
}

async function main(): Promise<void> {
  const contractPath = option("--contract");
  const requestedSplit = option("--split") as FormalSplit | undefined;
  if (!contractPath || (requestedSplit && requestedSplit !== "dev" && requestedSplit !== "hidden_test")) usage();
  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8")) as FormalWorldContract;
  const validation = validateFormalWorldContract(contract);
  const splits: FormalSplit[] = requestedSplit ? [requestedSplit] : ["dev", "hidden_test"];
  const compiled = validation.valid
    ? splits.flatMap((split) => compileFormalSplitInputs(contract, split))
    : [];
  const providerText = compiled.map((item) => JSON.stringify(item.provider)).join("\n");
  const privateMarkers = [
    "allowedFirstActions", "expectedFollowupActions", "expectedKnowledgeCalls",
    "allowedSequences", "targetAssetIds", "informationGap", "annotationReason",
    "provenanceKind", "generatorModel", "batchId", "contentRefs", "sourceRepoUrl",
  ];
  const leakedMarkers = privateMarkers.filter((marker) => providerText.includes(marker));
  const pairIntegrityErrors = validation.valid ? validatePairIntegrity(contract) : [];
  const teamCounts = Object.fromEntries(contract.teams.map((team) => [
    team.teamId,
    compiled.filter((item) => item.sessionInit.registration.team_id === team.teamId).length,
  ]));
  const errors = [...validation.errors, ...pairIntegrityErrors];
  if (leakedMarkers.length > 0) errors.push(`provider leakage markers: ${leakedMarkers.join(", ")}`);
  const invalidSequenceCount = errors.filter((error) => /sequence|follow-up expectation/i.test(error)).length;
  const missingSourceRefCount = errors.filter((error) =>
    /unknown source|sourceEvidenceIds must not be empty|evidenceRefs must not be empty|lacks current_anchor evidence/i.test(error)).length;
  const pairsByTeam = Object.fromEntries(contract.teams.map((team) => [
    team.teamId,
    contract.pairs.filter((pair) => {
      const positive = contract.publicCases.find((item) => item.caseId === pair.positiveCaseId);
      return positive?.identity.teamId === team.teamId;
    }).length,
  ]));
  const report = {
    schema_version: "task1.formal_dataset_validation.v2",
    valid: errors.length === 0,
    errors,
    splits,
    case_count: compiled.length,
    team_case_counts: teamCounts,
    pair_count: contract.pairs.length,
    pairs_by_team: pairsByTeam,
    pair_integrity_error_count: pairIntegrityErrors.length,
    pair_integrity_errors: pairIntegrityErrors,
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

await main();
