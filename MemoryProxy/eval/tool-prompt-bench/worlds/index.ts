import { W01 } from "./w01-proxy-prompt.js";
import { W02 } from "./w02-jakarta-migration.js";
import { W03 } from "./w03-frontend-perf.js";
import { compileWorldCases, compileWorldFixture } from "./compile.js";
import type { WorldEvalCase } from "./compile.js";
import type { World, WorldFixture } from "./world-schema.js";

/**
 * Dev worlds: W01, W02. Test world: W03.
 * Splitting by world, never by case, keeps held-out asset names unseen.
 */
export const WORLDS: World[] = [W01, W02, W03];

export const WORLD_FIXTURES: WorldFixture[] = WORLDS.map(compileWorldFixture);
export const WORLD_CASES: WorldEvalCase[] = WORLDS.flatMap(compileWorldCases);

export function worldOf(caseId: string): World {
  const world = WORLDS.find((candidate) => candidate.cases.some((item) => item.caseId === caseId));
  if (!world) throw new Error(`unknown world case ${caseId}`);
  return world;
}

export { W01, W02, W03 };
export type { World, WorldFixture, WorldEvalCase };
