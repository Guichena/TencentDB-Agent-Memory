import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [
  batchArg,
  expectedFamily,
  expectedCountArg,
  expectedTeam = "T01",
  expectedStage = "DS02",
] = process.argv.slice(2);
if (!batchArg || !expectedFamily || !expectedCountArg) {
  throw new Error(
    "usage: node validate-luna-batch.mjs <batch-dir> <family> <expected-count> [expected-team] [expected-stage]",
  );
}

const expectedCount = Number(expectedCountArg);
const batchDir = resolve(batchArg);
const draftPath = resolve(batchDir, "draft.json");
const manifestPath = resolve(batchDir, "manifest.json");
const questionsPath = resolve(batchDir, "questions.md");
const errors = [];

for (const path of [draftPath, manifestPath, questionsPath]) {
  if (!existsSync(path)) errors.push(`missing required output: ${path}`);
}

let draftBytes = Buffer.alloc(0);
let draft = {};
let manifest = {};
try {
  draftBytes = readFileSync(draftPath);
  draft = JSON.parse(draftBytes.toString("utf8"));
} catch (error) {
  errors.push(`draft.json is not readable JSON: ${String(error)}`);
}
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  errors.push(`manifest.json is not readable JSON: ${String(error)}`);
}

const leakagePatterns = [
  /\btdai_(?:memory|conversation|atomic|scenario|read)[a-z_]*\b/i,
  /\bskill_(?:search|view|view_by_id|files_read)\b/i,
  /\bknowledge_tools_(?:list|call)\b/i,
  /\b(?:T01-(?:L0|SKILL)-[A-Z0-9-]+|cg-t01[a-z0-9]+|wiki-t01[a-z0-9]+)\b/i,
  /\bGold\b/i,
  /判分(?:理由|依据)?/,
  /\bMemory\s+L[0-3]\b/i,
];

const allowedActions = {
  memory: new Set([
    "tdai_memory_search",
    "tdai_atomic_query",
    "tdai_conversation_search",
    "tdai_conversation_query",
    "tdai_scenario_ls",
    "tdai_read_scene",
  ]),
  skill: new Set(["skill_search", "skill_view", "skill_view_by_id", "skill_files_read"]),
  knowledge: new Set(["knowledge_tools_list", "knowledge_tools_call"]),
};

const isNaturalNegative = expectedFamily === "natural-negative";
const records = isNaturalNegative ? draft.cases : draft.pairs;

if (draft.schema_version !== (isNaturalNegative
  ? "task1.luna_natural_negative_draft.v1"
  : "task1.luna_pair_draft.v1")) {
  errors.push("unexpected draft schema_version");
}
if (draft.stage !== expectedStage || draft.team_id !== expectedTeam) {
  errors.push(
    `draft stage/team mismatch; expected ${expectedStage}/${expectedTeam}, got ${String(draft.stage)}/${String(draft.team_id)}`,
  );
}
if (!isNaturalNegative && draft.family !== expectedFamily) errors.push(`draft family mismatch: ${String(draft.family)}`);

if (isNaturalNegative && !Array.isArray(draft.cases)) {
  errors.push("draft cases must be an array");
} else if (isNaturalNegative) {
  if (draft.cases.length !== expectedCount) errors.push(`expected ${expectedCount} cases, got ${draft.cases.length}`);
  const ids = new Set();
  for (const [index, item] of draft.cases.entries()) {
    const label = `cases[${index}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof item.draft_case_id !== "string" || !item.draft_case_id) errors.push(`${label} lacks draft_case_id`);
    if (ids.has(item.draft_case_id)) errors.push(`${label} duplicates draft_case_id ${item.draft_case_id}`);
    ids.add(item.draft_case_id);
    if (item.external_source_ids !== undefined && !Array.isArray(item.external_source_ids)) {
      errors.push(`${label} external_source_ids must be an array when present`);
    }
    if (!Array.isArray(item.context_messages) || item.context_messages.length < 2) errors.push(`${label} needs at least two context messages`);
    if (typeof item.query !== "string" || !item.query.trim()) errors.push(`${label} lacks query`);
    if (typeof item.why_current_context_is_sufficient !== "string" || !item.why_current_context_is_sufficient.trim()) {
      errors.push(`${label} lacks why_current_context_is_sufficient`);
    }
    if (!Array.isArray(item.visible_distractor_ids_author_only)) errors.push(`${label} lacks visible_distractor_ids_author_only`);
    if (item.source_fact_map !== undefined && !Array.isArray(item.source_fact_map)) {
      errors.push(`${label} source_fact_map must be an array when present`);
    }
    if (!Array.isArray(item.sol_review_questions)) errors.push(`${label} lacks sol_review_questions`);

    const providerText = [
      ...(item.context_messages ?? []).map((message) => message?.content ?? ""),
      item.query ?? "",
    ].join("\n");
    for (const pattern of leakagePatterns) {
      if (pattern.test(providerText)) errors.push(`${label} provider-visible leakage matches ${String(pattern)}`);
    }
  }
} else if (!Array.isArray(draft.pairs)) {
  errors.push("draft pairs must be an array");
} else {
  if (draft.pairs.length !== expectedCount) errors.push(`expected ${expectedCount} pairs, got ${draft.pairs.length}`);
  if (draft.pairs.length > 5) errors.push("pair batch exceeds the five-pair limit");
  const ids = new Set();
  for (const [index, pair] of draft.pairs.entries()) {
    const label = `pairs[${index}]`;
    if (!pair || typeof pair !== "object") {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof pair.draft_pair_id !== "string" || !pair.draft_pair_id) errors.push(`${label} lacks draft_pair_id`);
    if (ids.has(pair.draft_pair_id)) errors.push(`${label} duplicates draft_pair_id ${pair.draft_pair_id}`);
    ids.add(pair.draft_pair_id);
    if (pair.external_source_ids !== undefined && !Array.isArray(pair.external_source_ids)) {
      errors.push(`${label} external_source_ids must be an array when present`);
    }
    if (pair.source_ids !== undefined && !Array.isArray(pair.source_ids)) {
      errors.push(`${label} legacy source_ids must be an array when present`);
    }
    if (!Array.isArray(pair.shared_context_messages) || pair.shared_context_messages.length < 2) {
      errors.push(`${label} needs at least two shared context messages`);
      continue;
    }
    if (pair.changed_message_index !== pair.shared_context_messages.length) {
      errors.push(`${label} changed_message_index must point to the appended delta`);
    }
    if (typeof pair.query !== "string" || !pair.query.trim()) errors.push(`${label} lacks query`);
    const positiveDelta = pair.positive?.delta_message;
    const negativeDelta = pair.negative?.delta_message;
    if (!positiveDelta?.content || !negativeDelta?.content) errors.push(`${label} lacks a delta message`);
    if (positiveDelta?.content === negativeDelta?.content) errors.push(`${label} Positive and Negative deltas are identical`);
    if (pair.positive?.private_proposal?.route !== expectedFamily) errors.push(`${label} Positive route mismatch`);
    if (pair.negative?.private_proposal?.route !== "none") errors.push(`${label} Negative route must be none`);
    if (!Array.isArray(pair.positive?.private_proposal?.target_asset_ids)
      || pair.positive.private_proposal.target_asset_ids.length === 0) {
      errors.push(`${label} lacks target_asset_ids`);
    }
    const sequences = pair.positive?.private_proposal?.allowed_sequence_candidates;
    if (!Array.isArray(sequences) || sequences.length === 0) {
      errors.push(`${label} lacks allowed_sequence_candidates`);
    } else {
      for (const sequence of sequences) {
        if (!Array.isArray(sequence) || sequence.length === 0) {
          errors.push(`${label} contains an empty sequence`);
          continue;
        }
        for (const action of sequence) {
          if (!allowedActions[expectedFamily]?.has(action)) errors.push(`${label} contains invalid ${expectedFamily} action ${String(action)}`);
        }
      }
    }
    if (pair.source_fact_map !== undefined && !Array.isArray(pair.source_fact_map)) {
      errors.push(`${label} source_fact_map must be an array when present`);
    }

    const providerText = [
      ...pair.shared_context_messages.map((message) => message?.content ?? ""),
      positiveDelta?.content ?? "",
      negativeDelta?.content ?? "",
      pair.query ?? "",
    ].join("\n");
    for (const pattern of leakagePatterns) {
      if (pattern.test(providerText)) errors.push(`${label} provider-visible leakage matches ${String(pattern)}`);
    }
  }
}

const actualSha = createHash("sha256").update(draftBytes).digest("hex");
if (manifest.schema_version !== "task1.luna_generation_manifest.v1") errors.push("unexpected manifest schema_version");
if (manifest.generator_model !== "gpt-5.6-luna") errors.push("manifest generator_model mismatch");
if (manifest.reasoning_effort !== "high") errors.push("manifest reasoning_effort mismatch");
if (manifest.prompt_version !== "task1.luna-batch.v1") errors.push("manifest prompt_version mismatch");
if (manifest.raw_output_file !== undefined && manifest.raw_output_file !== "draft.json") {
  errors.push("manifest raw_output_file must be draft.json when present");
}
if (manifest.raw_output_sha256 !== undefined && manifest.raw_output_sha256 !== actualSha) {
  errors.push(`manifest raw_output_sha256 mismatch; expected ${actualSha}`);
}
if (manifest.actual_count !== expectedCount) errors.push("manifest actual_count mismatch");
if (manifest.external_source_ids !== undefined && !Array.isArray(manifest.external_source_ids)) {
  errors.push("manifest external_source_ids must be an array when present");
}
if (Number.isNaN(Date.parse(manifest.generated_at))) errors.push("manifest generated_at is not ISO-8601 parseable");

const report = {
  schema_version: "task1.luna_batch_validation.v1",
  valid: errors.length === 0,
  batch_dir: batchDir,
  expected_stage: expectedStage,
  expected_team: expectedTeam,
  family: expectedFamily,
  expected_count: expectedCount,
  actual_count: Array.isArray(records) ? records.length : 0,
  raw_output_sha256: actualSha,
  error_count: errors.length,
  errors,
};
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length > 0 ? 1 : 0);
