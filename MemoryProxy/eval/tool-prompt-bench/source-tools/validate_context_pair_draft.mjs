#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: node validate_context_pair_draft.mjs <draft.json>");
  process.exit(2);
}

const draft = JSON.parse(readFileSync(inputPath, "utf8"));
const errors = [];
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const utf8Bytes = (value) => Buffer.byteLength(value, "utf8");
const toolCue = /\b(?:tdai_[a-z_]+|skill_(?:search|view|view_by_id|files_read)|knowledge_tools_[a-z_]+)\b/i;

function require(condition, message) {
  if (!condition) errors.push(message);
}

function expectedRange(bucket) {
  if (bucket === "short_2_to_4") return [2, 4];
  if (bucket === "medium_6_to_10") return [6, 10];
  if (bucket === "long_12_to_18") return [12, 18];
  return undefined;
}

require(draft.schema_version === "task1.context_pair_draft.v1", "unsupported schema_version");
require(draft.metric_eligible === false, "draft must remain metric_eligible=false until formal import and review");
require(Array.isArray(draft.pairs) && draft.pairs.length > 0, "pairs must not be empty");

const assetSnapshot = {
  history_session_refs: draft.history_session_refs,
  visible_skill_pool: draft.visible_skill_pool,
  fixed_knowledge_pool: draft.fixed_knowledge_pool,
};
require(sha256(assetSnapshot) === draft.asset_snapshot_sha256, "asset_snapshot_sha256 mismatch");

const listedSkillById = new Map(
  draft.visible_skill_pool.map((skill) => [skill.skill_id, skill]),
);
const caseIds = new Set();

for (const pair of draft.pairs) {
  const prefix = pair.pair_id ?? "pair-without-id";
  require(pair.changed_message_index === pair.shared_context_messages.length,
    `${prefix}: changed_message_index must point immediately after shared context`);
  require(sha256(pair.shared_context_messages) === pair.shared_context_sha256,
    `${prefix}: shared_context_sha256 mismatch`);
  require(sha256({
    positive_delta_message: pair.positive.delta_message,
    negative_delta_message: pair.negative.delta_message,
    query: pair.query,
  }) === pair.delta_sha256, `${prefix}: delta_sha256 mismatch`);

  const range = expectedRange(pair.context_bucket);
  require(Boolean(range), `${prefix}: unknown context_bucket ${pair.context_bucket}`);
  if (range) {
    require(pair.shared_context_messages.length >= range[0] && pair.shared_context_messages.length <= range[1],
      `${prefix}: shared context length does not match ${pair.context_bucket}`);
  }

  require(pair.positive.delta_message.role === pair.negative.delta_message.role,
    `${prefix}: positive/negative delta roles differ`);
  require(pair.positive.gold.route === pair.family,
    `${prefix}: positive route must match pair family`);
  require(pair.negative.gold.route === "none", `${prefix}: paired negative must route to none`);
  require(pair.negative.gold.first_action === null, `${prefix}: no-tool negative must have null first_action`);
  require(pair.negative.gold.max_tdai_calls === 0, `${prefix}: no-tool negative must allow zero TDAI calls`);

  for (const side of ["positive", "negative"]) {
    const caseId = pair[side].case_id;
    require(!caseIds.has(caseId), `${prefix}: duplicate case_id ${caseId}`);
    caseIds.add(caseId);

    const providerVisible = {
      case_id: caseId,
      context_messages: [...pair.shared_context_messages, pair[side].delta_message],
      query: pair.query,
    };
    const serialized = JSON.stringify(providerVisible);
    const expectedStats = {
      context_message_count: providerVisible.context_messages.length,
      context_utf8_bytes: utf8Bytes(JSON.stringify(providerVisible.context_messages)),
      query_utf8_bytes: utf8Bytes(pair.query),
    };
    require(JSON.stringify(pair[side].provider_visible_stats) === JSON.stringify(expectedStats),
      `${prefix}/${side}: provider_visible_stats mismatch`);
    require(!toolCue.test(serialized), `${prefix}/${side}: provider-visible input leaks a TDAI tool name`);

    for (const skill of draft.visible_skill_pool) {
      require(!serialized.includes(skill.name),
        `${prefix}/${side}: provider-visible input leaks Skill name ${skill.name}`);
    }
  }

  const positiveBytes = pair.positive.provider_visible_stats.context_utf8_bytes;
  const negativeBytes = pair.negative.provider_visible_stats.context_utf8_bytes;
  const byteRatio = Math.max(positiveBytes, negativeBytes) / Math.min(positiveBytes, negativeBytes);
  require(byteRatio <= 1.1, `${prefix}: paired context byte ratio ${byteRatio.toFixed(3)} exceeds 1.1`);

  const first = pair.positive.gold.first_action;
  if (first?.tool === "skill_view") {
    const target = listedSkillById.get(pair.target_asset_id);
    require(Boolean(target), `${prefix}: target Skill is absent from visible_skill_pool`);
    require(target?.listed === true, `${prefix}: direct skill_view target must be listed`);
    require(first.arguments?.skill_name === target?.name,
      `${prefix}: skill_view argument does not match target Skill name`);
  }

  if (first?.tool === "tdai_conversation_search") {
    require(Array.isArray(pair.target_history_session_ids) && pair.target_history_session_ids.length > 0,
      `${prefix}: conversation-search pair needs target_history_session_ids`);
    const knownSessions = new Set(draft.history_session_refs.map((session) => session.session_id));
    for (const sessionId of pair.target_history_session_ids ?? []) {
      require(knownSessions.has(sessionId), `${prefix}: unknown target history session ${sessionId}`);
    }
  }
}

require(draft.draft_summary.pair_count === draft.pairs.length, "draft_summary.pair_count mismatch");
require(draft.draft_summary.case_count === caseIds.size, "draft_summary.case_count mismatch");

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`validated ${draft.pairs.length} pairs / ${caseIds.size} cases`);
console.log(`asset snapshot ${draft.asset_snapshot_sha256}`);
