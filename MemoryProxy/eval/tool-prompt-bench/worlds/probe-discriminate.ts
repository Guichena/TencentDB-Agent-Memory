/**
 * For each conversation_search case, score every candidate session against a set of
 * candidate probes and report which probe puts the intended session first with the
 * largest margin. Used to pick discriminating probe terms after content changes.
 */
import { WORLDS } from "./index.js";
import { compileWorldFixture } from "./compile.js";

function terms(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1);
}

function score(value: unknown, probe: string[]): number {
  const text = JSON.stringify(value).toLowerCase();
  return probe.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
}

const CANDIDATES: Record<string, string[]> = {
  "sess-w01-cache-safety": ["越过前缀", "前缀边界"],
  "sess-w02-descriptor": ["version attribute"],
};

/** Memory probes: check that a superseded pair outranks unrelated records. */
const MEMORY_PAIRS: Array<{ world: string; pair: string[]; probes: string[] }> = [
  {
    world: "W01",
    pair: ["mem-proxy-v1-scope-final", "mem-proxy-v1-scope-superseded"],
    probes: ["压缩", "先压缩", "V1"],
  },
  {
    world: "W03",
    pair: ["mem-w03-table-strategy-final", "mem-w03-table-strategy-superseded"],
    probes: ["memo", "表格", "全量 memo"],
  },
];

for (const entry of MEMORY_PAIRS) {
  const world = WORLDS.find((candidate) => candidate.worldId === entry.world)!;
  const memories = compileWorldFixture(world).assets.atomicMemories ?? [];
  console.log(`\n=== ${entry.world} superseded pair ===`);
  for (const probe of entry.probes) {
    const scored = memories
      .map((memory) => ({ id: String(memory.memory_id), hits: score(memory, terms(probe)) }))
      .sort((a, b) => b.hits - a.hits);
    const pairScores = entry.pair.map((id) => scored.find((row) => row.id === id)!.hits);
    const outsider = scored.find((row) => !entry.pair.includes(row.id))!;
    const margin = Math.min(...pairScores) - outsider.hits;
    const flag = margin > 0 ? "ok  " : "bad ";
    console.log(
      `  ${flag} probe=${probe.padEnd(12)} pair=[${pairScores.join(",")}] `
      + `bestOutsider=${outsider.id}(${outsider.hits}) margin=${margin}`,
    );
  }
}

for (const world of WORLDS) {
  const fixture = compileWorldFixture(world);
  const sessions = fixture.assets.conversations ?? [];
  for (const [sessionId, probes] of Object.entries(CANDIDATES)) {
    if (!sessions.some((session) => session.session_id === sessionId)) continue;
    console.log(`\n=== ${sessionId} (${world.worldId}) ===`);
    for (const probe of probes) {
      const scored = sessions
        .map((session) => ({ id: String(session.session_id), hits: score(session, terms(probe)) }))
        .sort((a, b) => b.hits - a.hits);
      const goldIndex = scored.findIndex((entry) => entry.id === sessionId);
      const gold = scored[goldIndex]!;
      const runnerUp = scored.find((entry) => entry.id !== sessionId)!;
      const margin = gold.hits - runnerUp.hits;
      const flag = goldIndex === 0 && margin > 0 && gold.hits > 0 ? "ok  " : "bad ";
      console.log(
        `  ${flag} probe=${probe.padEnd(20)} rank=${goldIndex + 1} gold=${gold.hits} `
        + `runnerUp=${runnerUp.id}(${runnerUp.hits}) margin=${margin}`,
      );
    }
  }
}
