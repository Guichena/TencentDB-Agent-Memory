import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalSha256, exactUtf8Sha256 } from "./canonical.js";
import type {
  FormalSmokePreregistration,
  FormalSmokeSelectionContract,
  FormalSmokeTeamRule,
} from "./build-smoke-preregistration.js";
import type { FormalDataFreeze } from "./freeze.js";
import type { FormalReadText } from "./provider-loader.js";
import { loadFormalRuntimeFreezeManifest } from "./runtime-freeze.js";

export interface LoadFormalSmokePreregistrationInput {
  readonly freeze: FormalDataFreeze;
  readonly readText?: FormalReadText;
}

const ROOT_KEYS = new Set(["caseIds", "selectionContract", "sha256"]);
const CONTRACT_KEYS = new Set([
  "casesPerTeam",
  "naturalNoToolSelection",
  "ordering",
  "pairedNoToolSelection",
  "positiveSelection",
  "schemaVersion",
  "split",
  "teamRules",
  "totalCases",
]);
const RULE_KEYS = new Set(["noToolKind", "positiveFamily", "teamId"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new Error(`${label} has unexpected key: ${key}`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`${label} is missing key: ${key}`);
}

function parseRule(value: unknown, index: number): FormalSmokeTeamRule {
  const row = record(value, `smoke team rule ${index + 1}`);
  exactKeys(row, RULE_KEYS, `smoke team rule ${index + 1}`);
  if (typeof row.teamId !== "string" || !/^T[0-9]{2}$/u.test(row.teamId)) throw new Error("smoke team rule teamId is invalid");
  if (row.positiveFamily !== "memory" && row.positiveFamily !== "skill" && row.positiveFamily !== "knowledge") throw new Error("smoke team rule family is invalid");
  if (row.noToolKind !== "paired_counterpart" && row.noToolKind !== "natural") throw new Error("smoke team rule no-tool kind is invalid");
  return Object.freeze({
    teamId: row.teamId,
    positiveFamily: row.positiveFamily,
    noToolKind: row.noToolKind,
  });
}

function parseContract(value: unknown): FormalSmokeSelectionContract {
  const row = record(value, "smoke selection contract");
  exactKeys(row, CONTRACT_KEYS, "smoke selection contract");
  if (row.schemaVersion !== "task1.formal-dev-smoke-preregistration.v1"
    || row.split !== "dev"
    || row.totalCases !== 12
    || row.casesPerTeam !== 2
    || row.positiveSelection !== "lexicographically_first_tool_case_in_required_family"
    || row.pairedNoToolSelection !== "pair_v2_negative_counterpart_of_selected_positive"
    || row.naturalNoToolSelection !== "lexicographically_first_no_tool_case_outside_pair_v2_negatives"
    || row.ordering !== "team_rule_order_positive_then_no_tool"
    || !Array.isArray(row.teamRules)
    || row.teamRules.length !== 6) {
    throw new Error("smoke selection contract is invalid");
  }
  return Object.freeze({
    schemaVersion: row.schemaVersion,
    split: row.split,
    totalCases: row.totalCases,
    casesPerTeam: row.casesPerTeam,
    teamRules: Object.freeze(row.teamRules.map(parseRule)),
    positiveSelection: row.positiveSelection,
    pairedNoToolSelection: row.pairedNoToolSelection,
    naturalNoToolSelection: row.naturalNoToolSelection,
    ordering: row.ordering,
  });
}

/** Public smoke loader. Its dependency graph contains no private Measurement import. */
export function loadFormalSmokePreregistration(
  input: LoadFormalSmokePreregistrationInput,
): FormalSmokePreregistration {
  const readText = input.readText ?? ((path: string) => readFileSync(path, "utf8"));
  const manifest = loadFormalRuntimeFreezeManifest({ freeze: input.freeze, readText });
  const path = resolve(input.freeze.datasetRoot, "..", "formal-runtime", "frozen", "dev-smoke-preregistration.json");
  const rawText = readText(path);
  if (exactUtf8Sha256(rawText) !== manifest.artifacts.devSmokePreregistration.fileSha256) {
    throw new Error("smoke preregistration file hash does not match runtime freeze manifest");
  }
  const root = record(JSON.parse(rawText) as unknown, "smoke preregistration");
  exactKeys(root, ROOT_KEYS, "smoke preregistration");
  if (!Array.isArray(root.caseIds)
    || root.caseIds.length !== 12
    || root.caseIds.some((caseId) => typeof caseId !== "string" || caseId.length === 0)
    || new Set(root.caseIds).size !== 12) {
    throw new Error("smoke preregistration caseIds must be 12 unique strings");
  }
  if (typeof root.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(root.sha256)) {
    throw new Error("smoke preregistration sha256 is invalid");
  }
  const caseIds = Object.freeze([...root.caseIds] as string[]);
  const selectionContract = parseContract(root.selectionContract);
  const expectedSha256 = canonicalSha256({ caseIds, selectionContract });
  if (root.sha256 !== expectedSha256) throw new Error("smoke preregistration hash mismatch");
  if (root.sha256 !== manifest.artifacts.devSmokePreregistration.selectionCanonicalSha256) {
    throw new Error("smoke preregistration selection hash does not match runtime freeze manifest");
  }
  return Object.freeze({
    caseIds,
    selectionContract,
    sha256: root.sha256,
    formalMetricEligible: false as const,
  });
}
