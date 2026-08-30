import type { OverlayToolFamily } from "../formal-dataset/scripts/measurement-v2-overlay-schema.js";
import { canonicalSha256 } from "./canonical.js";
import { buildFormalCaseBindings } from "./build-case-bindings.js";
import type { FormalDataFreeze } from "./freeze.js";
import { loadPrivateMeasurementSplit } from "./private-loader.js";
import type { FormalReadText } from "./provider-loader.js";

export type SmokeNoToolKind = "paired_counterpart" | "natural";

export interface FormalSmokeTeamRule {
  readonly teamId: string;
  readonly positiveFamily: OverlayToolFamily;
  readonly noToolKind: SmokeNoToolKind;
}

export interface FormalSmokeSelectionContract {
  readonly schemaVersion: "task1.formal-dev-smoke-preregistration.v1";
  readonly split: "dev";
  readonly totalCases: 12;
  readonly casesPerTeam: 2;
  readonly teamRules: readonly FormalSmokeTeamRule[];
  readonly positiveSelection: "lexicographically_first_tool_case_in_required_family";
  readonly pairedNoToolSelection: "pair_v2_negative_counterpart_of_selected_positive";
  readonly naturalNoToolSelection: "lexicographically_first_no_tool_case_outside_pair_v2_negatives";
  readonly ordering: "team_rule_order_positive_then_no_tool";
}

export interface FormalSmokePreregistration {
  readonly caseIds: readonly string[];
  readonly selectionContract: FormalSmokeSelectionContract;
  readonly sha256: string;
  readonly formalMetricEligible: false;
}

export interface BuildFormalSmokePreregistrationInput {
  readonly freeze: FormalDataFreeze;
  readonly readText?: FormalReadText;
}

const TEAM_RULES: readonly FormalSmokeTeamRule[] = Object.freeze([
  Object.freeze({ teamId: "T01", positiveFamily: "memory", noToolKind: "paired_counterpart" }),
  Object.freeze({ teamId: "T02", positiveFamily: "memory", noToolKind: "natural" }),
  Object.freeze({ teamId: "T03", positiveFamily: "skill", noToolKind: "paired_counterpart" }),
  Object.freeze({ teamId: "T04", positiveFamily: "skill", noToolKind: "natural" }),
  Object.freeze({ teamId: "T11", positiveFamily: "knowledge", noToolKind: "paired_counterpart" }),
  Object.freeze({ teamId: "T12", positiveFamily: "knowledge", noToolKind: "natural" }),
]);

export const FORMAL_SMOKE_SELECTION_CONTRACT: FormalSmokeSelectionContract = Object.freeze({
  schemaVersion: "task1.formal-dev-smoke-preregistration.v1",
  split: "dev",
  totalCases: 12,
  casesPerTeam: 2,
  teamRules: TEAM_RULES,
  positiveSelection: "lexicographically_first_tool_case_in_required_family",
  pairedNoToolSelection: "pair_v2_negative_counterpart_of_selected_positive",
  naturalNoToolSelection: "lexicographically_first_no_tool_case_outside_pair_v2_negatives",
  ordering: "team_rule_order_positive_then_no_tool",
});

function goldFamily(gold: ReturnType<typeof loadPrivateMeasurementSplit>["gold"][number]): OverlayToolFamily | undefined {
  const families = new Set(gold.allowedSequences.map((sequence) => sequence.steps[0]?.family));
  return families.size === 1 ? [...families][0] : undefined;
}

/** Offline preregistration builder. Private labels are reduced to public case ids only. */
export function buildFormalSmokePreregistration(
  input: BuildFormalSmokePreregistrationInput,
): FormalSmokePreregistration {
  const bindings = buildFormalCaseBindings(input);
  const measurement = loadPrivateMeasurementSplit({
    freeze: input.freeze,
    split: "dev",
    readText: input.readText,
  });
  const bindingById = new Map(bindings.rows.map((binding) => [binding.caseId, binding]));
  const goldById = new Map(measurement.gold.map((gold) => [gold.caseId, gold]));
  const pairedNegativeIds = new Set(measurement.pairs.map((pair) => pair.negativeCaseId));
  const pairByPositive = new Map(measurement.pairs.map((pair) => [pair.positiveCaseId, pair]));
  const caseIds: string[] = [];

  for (const rule of TEAM_RULES) {
    const positive = measurement.gold
      .filter((gold) => gold.expectation === "tool"
        && bindingById.get(gold.caseId)?.identity.teamId === rule.teamId
        && goldFamily(gold) === rule.positiveFamily)
      .sort((left, right) => left.caseId.localeCompare(right.caseId))[0];
    if (!positive) throw new Error(`${rule.teamId}: no ${rule.positiveFamily} smoke positive`);

    let noToolCaseId: string;
    if (rule.noToolKind === "paired_counterpart") {
      const pair = pairByPositive.get(positive.caseId);
      if (!pair || goldById.get(pair.negativeCaseId)?.expectation !== "no-tool") {
        throw new Error(`${rule.teamId}: selected positive lacks a no-tool Pair v2 counterpart`);
      }
      noToolCaseId = pair.negativeCaseId;
    } else {
      const natural = measurement.gold
        .filter((gold) => gold.expectation === "no-tool"
          && bindingById.get(gold.caseId)?.identity.teamId === rule.teamId
          && !pairedNegativeIds.has(gold.caseId))
        .sort((left, right) => left.caseId.localeCompare(right.caseId))[0];
      if (!natural) throw new Error(`${rule.teamId}: no natural no-tool smoke case`);
      noToolCaseId = natural.caseId;
    }
    caseIds.push(positive.caseId, noToolCaseId);
  }

  if (caseIds.length !== 12 || new Set(caseIds).size !== 12) {
    throw new Error("formal Dev smoke preregistration must contain 12 unique case ids");
  }
  for (const caseId of caseIds) if (!bindingById.has(caseId)) throw new Error(`smoke case has no runtime binding: ${caseId}`);
  const frozenCaseIds = Object.freeze(caseIds);
  const sha256 = canonicalSha256({
    caseIds: frozenCaseIds,
    selectionContract: FORMAL_SMOKE_SELECTION_CONTRACT,
  });
  return Object.freeze({
    caseIds: frozenCaseIds,
    selectionContract: FORMAL_SMOKE_SELECTION_CONTRACT,
    sha256,
    formalMetricEligible: false as const,
  });
}

export function serializeFormalSmokePreregistration(value: FormalSmokePreregistration): string {
  return `${JSON.stringify({
    caseIds: value.caseIds,
    selectionContract: value.selectionContract,
    sha256: value.sha256,
  }, null, 2)}\n`;
}
