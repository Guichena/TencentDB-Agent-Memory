import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const batchDir = resolve(process.argv[2] ?? join(scriptDir, "asset-world", "asset-world-batch-01"));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const errors = [];
const checks = [];
const check = (name, condition, detail = undefined) => {
  checks.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) errors.push(`${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
};

for (const name of ["draft.json", "manifest.json", "questions.md"]) check(`required ${name}`, existsSync(join(batchDir, name)));
const draftBytes = readFileSync(join(batchDir, "draft.json"));
const draft = JSON.parse(draftBytes.toString("utf8"));
const manifest = readJson(join(batchDir, "manifest.json"));
const input = readJson(join(scriptDir, "input-pack.json"));
const lock = readJson(join(scriptDir, "input-pack.lock.json"));
const sourceLock = readJson(join(scriptDir, "source-pack.lock.json"));

check("draft schema", draft.schema_version === "task1.luna_asset_world_draft.v1" && draft.batch_id === "t02-asset-world-batch-01" && draft.stage === "DS03" && draft.team_id === "T02");
check("manifest identity", manifest.schema_version === "task1.luna_generation_manifest.v1" && manifest.batch_id === draft.batch_id && manifest.stage === "DS03" && manifest.team_id === "T02");
check("manifest generator", manifest.generator_model === "gpt-5.6-luna" && manifest.reasoning_effort === "high" && manifest.fork_turns === "none");
check("manifest locks", manifest.input_pack_sha256 === lock.sha256 && manifest.source_pack_lock === "source-pack.lock.json" && sourceLock.frozen === true);
check("no raw output metadata", !Object.hasOwn(manifest, "raw_output_file") && !Object.hasOwn(manifest, "raw_output_sha256"));

const collections = [
  ["l0_sessions", 10], ["l1_memories", 15], ["l2_scenes", 4], ["l3_profiles", 1], ["knowledge_fixtures", 3],
];
for (const [key, count] of collections) check(`${key} count`, Array.isArray(draft[key]) && draft[key].length === count, draft[key]?.length);
check("manifest total count", manifest.actual_count === 33 && Object.entries(manifest.counts ?? {}).every(([key, value]) => draft[key]?.length === value), manifest.counts);

const requiredL0 = new Map(input.required_memory_assets.l0_sessions.map((item) => [item.asset_id, item]));
const l0Ids = new Set(draft.l0_sessions.map((item) => item.asset_id));
check("exact L0 ids", l0Ids.size === 10 && [...requiredL0.keys()].every((id) => l0Ids.has(id)), [...l0Ids]);
for (const session of draft.l0_sessions) {
  check(`${session.asset_id} message count`, session.messages?.length === 12, session.messages?.length);
  check(`${session.asset_id} alternating roles`, session.messages?.every((message, index) => message.role === (index % 2 === 0 ? "user" : "assistant")));
  check(`${session.asset_id} message text`, session.messages?.every((message) => typeof message.content === "string" && message.content.trim().length > 0));
  check(`${session.asset_id} timestamp`, !Number.isNaN(Date.parse(session.observed_at)) && Date.parse(session.observed_at) <= Date.parse("2026-08-29T23:59:59+08:00"), session.observed_at);
}

const requiredFacts = new Map(input.synthetic_world_facts.map((item) => [item.fact_id, item]));
const requiredL1 = new Map(input.required_memory_assets.l1_required_targets.map((item) => [item.asset_id, item]));
const l1ById = new Map(draft.l1_memories.map((item) => [item.asset_id, item]));
check("unique L1 ids", l1ById.size === 15);
for (const [id, requirement] of requiredL1) {
  const item = l1ById.get(id);
  const fact = requiredFacts.get(requirement.fact_id);
  check(`${id} present`, Boolean(item));
  if (!item) continue;
  check(`${id} exact fact`, item.content === fact.fact, item.content);
  check(`${id} date`, item.date === fact.date, item.date);
  check(`${id} types`, item.formal_type === requirement.formal_type && item.runtime_type === requirement.runtime_type, { formal: item.formal_type, runtime: item.runtime_type });
  check(`${id} status`, item.status === (requirement.status ?? "active"), item.status);
  if (requirement.superseded_by) check(`${id} superseded_by`, item.superseded_by === requirement.superseded_by, item.superseded_by);
}
for (const item of draft.l1_memories) {
  check(`${item.asset_id} formal type`, ["persona", "preference", "decision", "event", "fact"].includes(item.formal_type), item.formal_type);
  check(`${item.asset_id} source sessions`, Array.isArray(item.source_session_ids) && item.source_session_ids.length > 0 && item.source_session_ids.every((id) => l0Ids.has(id)), item.source_session_ids);
}

const requiredL2 = new Map(input.required_memory_assets.l2.map((item) => [item.asset_id, item]));
const l2ById = new Map(draft.l2_scenes.map((item) => [item.asset_id, item]));
check("exact L2 ids", l2ById.size === 4 && [...requiredL2.keys()].every((id) => l2ById.has(id)));
for (const [id, requirement] of requiredL2) {
  const item = l2ById.get(id);
  if (!item) continue;
  check(`${id} path`, item.path === requirement.path, item.path);
  check(`${id} supporting sessions`, item.supporting_session_ids?.length >= 2 && item.supporting_session_ids.every((sessionId) => l0Ids.has(sessionId)), item.supporting_session_ids);
  check(`${id} injected`, item.injected === true);
}

const l3 = draft.l3_profiles[0];
const chineseLength = [...(l3?.content ?? "")].filter((char) => /[\u3400-\u9fff]/.test(char)).length;
check("L3 id", l3?.asset_id === input.required_memory_assets.l3.asset_id, l3?.asset_id);
check("L3 stability", l3?.stability === "team", l3?.stability);
check("L3 Chinese length", chineseLength >= 80 && chineseLength <= 220, chineseLength);

const fixturesById = new Map(draft.knowledge_fixtures.map((item) => [item.asset_id, item]));
check("exact Knowledge ids", fixturesById.size === 3 && input.knowledge_fixtures.every((item) => fixturesById.has(item.asset_id)), [...fixturesById.keys()]);
for (const required of input.knowledge_fixtures) {
  const item = fixturesById.get(required.asset_id);
  if (!item) continue;
  check(`${required.asset_id} type/name`, item.type === required.type && item.name === required.name);
  if (required.type === "code_graph") {
    check(`${required.asset_id} repo pin`, item.repo_url === required.repo_url && item.repo_commit === required.repo_commit);
    const nodes = item.snapshot?.nodes ?? [];
    check(`${required.asset_id} target node`, nodes.some((node) => node.symbol === required.target_params.symbol && node.file === required.target_result.file && node.line === required.target_result.line), nodes);
  } else {
    check(`${required.asset_id} policy result`, JSON.stringify(item.snapshot).includes(required.target_result.summary), item.snapshot);
  }
  const toolNames = item.tools?.map((tool) => typeof tool === "string" ? tool : tool.name ?? tool.tool ?? tool.tool_name);
  check(`${required.asset_id} target tool`, toolNames?.includes(required.target_tool), toolNames);
}

const visibleProse = [
  ...draft.l0_sessions.flatMap((session) => session.messages.map((message) => message.content)),
  ...draft.l1_memories.map((item) => item.content),
  ...draft.l2_scenes.flatMap((item) => [item.summary, item.content]),
  ...draft.l3_profiles.map((item) => item.content),
  ...draft.knowledge_fixtures.flatMap((item) => [item.name, JSON.stringify(item.snapshot), JSON.stringify(item.tools)]),
].join("\n");
const leakage = [
  /gpt-5\.6-luna/i, /\bT01\b/, /\bGold\b/i,
  /benchmark\s+(?:answer|case|dataset|label|score)/i, /scor(?:e|ing)/i,
  /\bT02-(?:L[0-3]|SKILL|PAIR)\b/i, /\b(?:tdai_|skill_view|skill_search|knowledge_tools_)\w*/i,
].filter((pattern) => pattern.test(visibleProse)).map(String);
check("visible prose leakage", leakage.length === 0, leakage);
check("input pack hash", sha256(readFileSync(join(scriptDir, lock.input_pack))) === lock.sha256, lock.sha256);

const report = {
  schema_version: "task1.luna_asset_world_validation.v1",
  valid: errors.length === 0,
  team_id: "T02",
  stage: "DS03",
  batch_id: draft.batch_id,
  draft_sha256: sha256(draftBytes),
  counts: Object.fromEntries(collections.map(([key]) => [key, draft[key].length])),
  check_count: checks.length,
  checks,
  error_count: errors.length,
  errors,
};
writeFileSync(join(batchDir, "validation.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exitCode = 1;
