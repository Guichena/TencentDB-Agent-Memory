/**
 * Replay every world gold sequence against the real Mock Bridge.
 *
 * This proves each gold answer is actually reachable from the shared world fixture,
 * and that the shared fixture does not make a second asset equally valid. Run:
 *
 *   npx tsx eval/tool-prompt-bench/worlds/smoke-worlds.ts
 */
import { randomUUID } from "node:crypto";
import { startWorldMockServer } from "./worlds-bridge.js";
import { renderFixturePrompt } from "../prompt-harness.js";
import { evaluateToolPromptCase } from "../evaluator.js";
import { compileWorldCases, compileWorldFixture, projectOf } from "./compile.js";
import { WORLDS } from "./index.js";
import type { AllowedToolAction } from "../schema.js";
import type { World, WorldCase } from "./world-schema.js";

interface Failure { caseId: string; detail: string }

const failures: Failure[] = [];
let requests = 0;
let scoredPositive = 0;
let scoredAbstention = 0;

/** Build a request body from the gold argument rules, the way a compliant model would. */
function bodyFor(action: AllowedToolAction, previous: unknown): Record<string, unknown> {
  const rules = action.argumentRules ?? {};
  const body: Record<string, unknown> = { ...(rules.exactValues ?? {}) };
  for (const field of rules.requiredFields ?? []) {
    if (field in body) continue;
    const terms = rules.stringContainsAny?.[field];
    if (terms?.length) {
      body[field] = terms[0];
      continue;
    }
    if (field === "refs") {
      body[field] = refsFrom(previous);
      continue;
    }
    failures.push({ caseId: action.tool, detail: `no way to synthesize required field ${field}` });
  }
  return body;
}

function refsFrom(previous: unknown): unknown[] {
  const data = (previous as { data?: { results?: Array<{ ref?: string }> } })?.data;
  const results = data?.results ?? [];
  return results.map((result) => result.ref).filter(Boolean);
}

function headersFor(family: string | null, sessionId: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-tdai-service-id": "tool-prompt-bench",
    ...(family === "knowledge" ? {} : { "x-conversation-id": sessionId }),
  };
}

async function post(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; payload: unknown }> {
  requests++;
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: unknown = text;
  try { payload = JSON.parse(text); } catch { /* keep text */ }
  return { status: response.status, payload };
}

/**
 * Confirm the gold asset is reachable somewhere in the executed chain.
 *
 * The final step often returns only content: a manifest read returns a file body,
 * a conversation query returns messages with no session id, a knowledge call
 * returns matches. So the whole transcript is checked, plus a content probe for
 * assets whose id never appears in any response.
 */
function assertGoldPresent(world: World, item: WorldCase, transcript: unknown[]): void {
  if (!item.goldAssetIds?.length) return;
  const serialized = JSON.stringify(transcript);
  if (item.goldAssetIds.some((assetId) => serialized.includes(assetId))) return;

  const probes = item.goldAssetIds.flatMap((assetId) => contentProbes(world, assetId));
  if (probes.length > 0 && probes.some((probe) => serialized.includes(probe))) return;
  failures.push({
    caseId: item.caseId,
    detail: `gold asset ${item.goldAssetIds.join(", ")} is not reachable in the executed chain`,
  });
}

/** A distinctive substring of the asset's own body, for id-less responses. */
function contentProbes(world: World, assetId: string): string[] {
  const session = world.conversations.find((candidate) => candidate.sessionId === assetId);
  if (session) return session.messages.map((message) => message.content.slice(0, 24));
  const scene = world.scenes.find((candidate) => candidate.path === assetId);
  if (scene) return [scene.content.split("\n").filter(Boolean)[0]!.slice(0, 24)];
  const skill = world.skills.find((candidate) => candidate.skillId === assetId);
  if (skill) return Object.values(skill.files ?? {}).map((body) => body.slice(0, 24));
  const memory = world.memories.find((candidate) => candidate.memoryId === assetId);
  if (memory) return [memory.content.slice(0, 24)];
  const knowledge = world.knowledge.find((candidate) => candidate.knowledgeId === assetId);
  if (knowledge) return [knowledge.repoSlug ?? knowledge.name];
  return [];
}

for (const world of WORLDS) {
  const fixture = compileWorldFixture(world);
  const compiled = compileWorldCases(world);
  const runId = randomUUID();
  const sessionId = randomUUID();
  const server = await startWorldMockServer(fixture, world.knowledge, { runId, sessionId });

  try {
    for (const item of world.cases) {
      const compiledCase = compiled.find((candidate) => candidate.caseId === item.caseId)!;
      // The prompt must render for every case, with the shared world's asset volume.
      const rendered = await renderFixturePrompt(compiledCase, fixture, {
        bridgeBaseUrl: server.baseUrl,
        sessionId,
        spaceId: "tool-prompt-bench",
      });
      if (!rendered.prompt.includes("<available_skills>")) {
        failures.push({ caseId: item.caseId, detail: "rendered prompt has no skill listing" });
      }
      const project = projectOf(world, item.activeProject);
      if (!project.files || Object.keys(project.files).length === 0) {
        failures.push({ caseId: item.caseId, detail: `active project ${project.projectId} has no workspace files` });
      }

      // A no-tool case must score as a clean abstention when nothing is called.
      if (!item.gold.family) {
        server.bridge.reset();
        const abstained = evaluateToolPromptCase(compiledCase, fixture, server.bridge.attempts);
        if (abstained.state !== "NO_TDAI_INTENT" || abstained.falseCall) {
          failures.push({ caseId: item.caseId, detail: `abstention scores ${abstained.state}, falseCall=${abstained.falseCall}` });
        } else {
          scoredAbstention++;
        }
        continue;
      }

      server.bridge.reset();
      const headers = headersFor(item.gold.family, sessionId);
      let previous: unknown;
      const transcript: unknown[] = [];

      const steps: AllowedToolAction[] = [item.gold.firstAction!, ...(item.gold.followupActions ?? [])];
      for (const step of steps) {
        const result = await post(server.baseUrl, step.endpoint, bodyFor(step, previous), headers);
        if (result.status !== 200) {
          failures.push({ caseId: item.caseId, detail: `${step.tool} returned ${result.status}: ${JSON.stringify(result.payload).slice(0, 200)}` });
          break;
        }
        previous = result.payload;
        transcript.push(result.payload);
      }

      for (const call of item.gold.knowledgeCalls ?? []) {
        const knowledgeId = item.gold.firstAction!.argumentRules?.exactValues?.knowledge_id;
        const params: Record<string, unknown> = {};
        for (const field of call.paramRules.requiredFields ?? []) {
          const terms = call.paramRules.stringContainsAny?.[field];
          params[field] = field === "refs" ? refsFrom(previous) : terms?.[0] ?? "probe";
        }
        const result = await post(
          server.baseUrl,
          "/tools/call",
          { knowledge_id: knowledgeId, tool_name: call.toolName, params },
          headers,
        );
        if (result.status !== 200) {
          failures.push({ caseId: item.caseId, detail: `${call.toolName} returned ${result.status}: ${JSON.stringify(result.payload).slice(0, 200)}` });
          break;
        }
        previous = result.payload;
        transcript.push(result.payload);
      }

      assertGoldPresent(world, item, transcript);

      // The frozen scorer must accept the compiled world case and rate the gold
      // sequence a correct call. If it does not, the Gold is unreachable in practice.
      const scored = evaluateToolPromptCase(compiledCase, fixture, server.bridge.attempts);
      if (scored.state !== "CORRECT_CALL") {
        failures.push({ caseId: item.caseId, detail: `scorer returned ${scored.state} for the gold sequence` });
      } else {
        scoredPositive++;
      }
      if (!scored.effectiveCall || !scored.firstActionCorrect || !scored.argumentValid || !scored.executionValid) {
        failures.push({
          caseId: item.caseId,
          detail: `gold sequence scored effective=${scored.effectiveCall} first=${scored.firstActionCorrect} args=${scored.argumentValid} exec=${scored.executionValid}`,
        });
      }
      if (scored.overcall) failures.push({ caseId: item.caseId, detail: "gold sequence is counted as an overcall" });
    }
  } finally {
    await server.close();
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} failure(s) across ${requests} bridge requests:`);
  for (const failure of failures) console.error(`  ${failure.caseId}: ${failure.detail}`);
  process.exitCode = 1;
} else {
  const cases = WORLDS.reduce((total, world) => total + world.cases.length, 0);
  console.log(
    `${cases} world cases: ${scoredPositive} gold sequences scored CORRECT_CALL, `
    + `${scoredAbstention} no-tool cases scored NO_TDAI_INTENT, ${requests} bridge requests`,
  );
}
