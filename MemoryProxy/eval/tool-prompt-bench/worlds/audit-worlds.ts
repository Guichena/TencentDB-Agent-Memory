/**
 * Audit the two properties a shared world must have but a per-case fixture never tests:
 *
 * 1. Answer uniqueness. With every sub-scene's assets loaded at once, the gold asset
 *    must still win its own retrieval. A tie means the case has two valid answers
 *    and the Gold is wrong, not the model.
 * 2. Token split. Static tool descriptions are the optimization target; the dynamic
 *    asset listing grows with world size. Reporting them together would let a large
 *    world hide the saving being measured.
 *
 *   npx tsx eval/tool-prompt-bench/worlds/audit-worlds.ts
 */
import { randomUUID } from "node:crypto";
import { get_encoding } from "tiktoken";
import { startWorldMockServer } from "./worlds-bridge.js";
import { renderFixturePrompt } from "../prompt-harness.js";
import { compileWorldCases, compileWorldFixture } from "./compile.js";
import { WORLDS } from "./index.js";
import type { World, WorldCase } from "./world-schema.js";

interface RankRow {
  caseId: string;
  probe: string;
  goldRank: number;
  goldScore: number;
  runnerUp: string;
  runnerUpScore: number;
  margin: number;
  /** True when a tie is the point of the case rather than a defect. */
  expectedTie?: boolean;
}

const problems: string[] = [];
const ranks: RankRow[] = [];

function tokens(text: string): number {
  const encoding = get_encoding("o200k_base");
  try {
    return encoding.encode(text).length;
  } finally {
    encoding.free();
  }
}

/** Mirror of the bridge's ranking, so the audit measures the real retrieval order. */
function scoreOf(value: unknown, terms: string[]): number {
  const text = JSON.stringify(value).toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function termsOf(query: unknown): string[] {
  return typeof query === "string"
    ? query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1)
    : [];
}

function rankAssets(
  item: WorldCase,
  probe: string,
  assets: Array<{ id: string; value: unknown }>,
  goldIds: string[],
): void {
  const terms = termsOf(probe);
  const scored = assets
    .map((asset) => ({ ...asset, score: scoreOf(asset.value, terms) }))
    .sort((a, b) => b.score - a.score);
  const goldIndex = scored.findIndex((asset) => goldIds.includes(asset.id));
  if (goldIndex === -1) {
    problems.push(`${item.caseId}: gold asset is absent from the ranked candidate set`);
    return;
  }
  const gold = scored[goldIndex]!;
  const runnerUp = scored.find((asset) => !goldIds.includes(asset.id));
  const row: RankRow = {
    caseId: item.caseId,
    probe,
    goldRank: goldIndex + 1,
    goldScore: gold.score,
    runnerUp: runnerUp?.id ?? "none",
    runnerUpScore: runnerUp?.score ?? 0,
    margin: gold.score - (runnerUp?.score ?? 0),
  };
  ranks.push(row);

  // A case that asks the model to choose between competing records is supposed to
  // retrieve all of them. There the requirement is deciding metadata, not a rank gap.
  if (item.disambiguateBy) {
    const tied = scored.filter((asset) => asset.score === gold.score).map((asset) => asset.id);
    if (tied.length < 2) {
      problems.push(`${item.caseId}: declares disambiguateBy but retrieval returns no competing record`);
    }
    row.expectedTie = true;
    return;
  }
  if (row.goldRank !== 1) {
    problems.push(`${item.caseId}: gold ranks ${row.goldRank} behind ${scored[0]!.id} for probe "${probe}"`);
  } else if (row.margin <= 0) {
    problems.push(`${item.caseId}: gold ties with ${row.runnerUp} (both ${row.goldScore}) for probe "${probe}"`);
  } else if (row.goldScore === 0) {
    problems.push(`${item.caseId}: probe "${probe}" matches nothing; the query language does not match the asset language`);
  }
}

function auditRetrieval(world: World): void {
  const fixture = compileWorldFixture(world);
  for (const item of world.cases) {
    const first = item.gold.firstAction;
    if (!first) continue;
    const probe = first.argumentRules?.stringContainsAny?.query?.[0];
    if (!probe || !item.goldAssetIds?.length) continue;

    if (first.tool === "tdai_memory_search") {
      rankAssets(
        item,
        probe,
        (fixture.assets.atomicMemories ?? []).map((memory) => ({ id: String(memory.memory_id), value: memory })),
        item.goldAssetIds,
      );
    } else if (first.tool === "tdai_conversation_search") {
      rankAssets(
        item,
        probe,
        (fixture.assets.conversations ?? []).map((session) => ({ id: String(session.session_id), value: session })),
        item.goldAssetIds,
      );
    } else if (first.tool === "skill_search") {
      rankAssets(
        item,
        probe,
        (fixture.assets.skills?.teamLibrary ?? []).map((skill) => ({ id: String(skill.skill_id), value: skill })),
        item.goldAssetIds,
      );
    }
  }
}

/** Split the rendered prompt into the static description cost and the dynamic asset cost. */
async function auditTokens(world: World): Promise<Record<string, number>> {
  const fixture = compileWorldFixture(world);
  const compiled = compileWorldCases(world);
  const runId = randomUUID();
  const sessionId = randomUUID();
  const server = await startWorldMockServer(fixture, world.knowledge, { runId, sessionId });
  try {
    const item = compiled[0]!;
    const full = await renderFixturePrompt(item, fixture, {
      bridgeBaseUrl: server.baseUrl,
      sessionId,
      spaceId: "tool-prompt-bench",
    });
    // Re-render with the asset lists emptied: what remains is the static description cost.
    const bare = await renderFixturePrompt(item, {
      ...fixture,
      assets: { skills: { listed: [], teamLibrary: [] }, knowledge: [], atomicMemories: [], conversations: [], scenes: [], sceneIndex: [], profileL3: [] },
    }, {
      bridgeBaseUrl: server.baseUrl,
      sessionId,
      spaceId: "tool-prompt-bench",
    });
    const total = tokens(full.prompt);
    const staticTokens = tokens(bare.prompt);
    return {
      totalInjection: total,
      staticToolDescriptions: staticTokens,
      dynamicWorldAssets: total - staticTokens,
    };
  } finally {
    await server.close();
  }
}

for (const world of WORLDS) auditRetrieval(world);

const tokenReport: Record<string, Record<string, number>> = {};
for (const world of WORLDS) tokenReport[world.worldId] = await auditTokens(world);

console.log("\n=== retrieval margin (gold vs best distractor) ===");
for (const row of ranks) {
  const status = row.expectedTie ? "tie " : row.goldRank === 1 && row.margin > 0 && row.goldScore > 0 ? "ok  " : "FAIL";
  console.log(
    `${status} ${row.caseId.padEnd(28)} `
    + `probe=${row.probe.padEnd(14)} gold=${row.goldScore} runnerUp=${row.runnerUp}(${row.runnerUpScore}) margin=${row.margin}`,
  );
}

console.log("\n=== injection token split ===");
for (const [worldId, report] of Object.entries(tokenReport)) {
  const share = ((report.dynamicWorldAssets / report.totalInjection) * 100).toFixed(1);
  console.log(
    `${worldId}: total=${report.totalInjection} static=${report.staticToolDescriptions} `
    + `dynamic=${report.dynamicWorldAssets} (${share}% of injection is world assets)`,
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.length} uniqueness problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${ranks.length} ranked probes put the gold asset first with a positive margin`);
}
