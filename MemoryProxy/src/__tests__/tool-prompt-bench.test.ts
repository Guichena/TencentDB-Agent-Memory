import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES, FIXTURES } from "../../eval/tool-prompt-bench/case-definitions.js";
import { evaluateToolPromptCase } from "../../eval/tool-prompt-bench/evaluator.js";
import { createToolPromptMockBridge } from "../../eval/tool-prompt-bench/mock-bridge.js";
import { renderFixturePrompt } from "../../eval/tool-prompt-bench/prompt-harness.js";
import {
  executeCurlCommand,
  parseCurlCommand,
  startToolPromptMockServer,
} from "../../eval/tool-prompt-bench/protocol-harness.js";
import {
  auditCodexPromptInput,
  buildCodexInvocation,
  buildCodexProfile,
  codexProcessInfrastructureError,
  isolateCodexEnvironment,
  resolveCodexInvocation,
} from "../../eval/tool-prompt-bench/codex-runner.js";
import { aggregateScores, scoreTraceRecords } from "../../eval/tool-prompt-bench/score.js";
import type { AllowedToolAction, ArgumentRules } from "../../eval/tool-prompt-bench/schema.js";

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function firstNestedValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedValue(item, key);
      if (found !== undefined) return found;
    }
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record[key] !== undefined) return record[key];
    for (const item of Object.values(record)) {
      const found = firstNestedValue(item, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function bodyFromRules(
  rules: ArgumentRules | undefined,
  previousResponse?: unknown,
  fixture?: (typeof FIXTURES)[number],
): Record<string, unknown> {
  const body = { ...(rules?.exactValues ?? {}) };
  for (const field of rules?.requiredFields ?? []) {
    if (body[field] !== undefined) continue;
    if (field === "query") body[field] = rules?.stringContainsAny?.query?.[0] ?? "fixture query";
    else if (field === "refs") body[field] = [firstNestedValue(previousResponse, "ref")];
    else if (field === "path") body[field] = firstNestedValue(previousResponse, "path") ?? fixture?.assets.scenes?.[0]?.path;
    else throw new Error(`test Gold cannot synthesize required field ${field}`);
  }
  return body;
}

describe("TDAI-ToolPromptBench dataset", () => {
  it("contains the registered 60/40 split and family quotas", () => {
    expect(CASES).toHaveLength(100);
    expect(FIXTURES).toHaveLength(100);

    const expected = {
      dev: { memory: 15, skill: 15, knowledge: 10, noTool: 20, total: 60 },
      test: { memory: 10, skill: 10, knowledge: 6, noTool: 14, total: 40 },
    };

    for (const split of ["dev", "test"] as const) {
      const cases = CASES.filter((item) => item.split === split);
      expect({
        memory: cases.filter((item) => item.gold.family === "memory").length,
        skill: cases.filter((item) => item.gold.family === "skill").length,
        knowledge: cases.filter((item) => item.gold.family === "knowledge").length,
        noTool: cases.filter((item) => !item.gold.needTdaiTool).length,
        total: cases.length,
      }).toEqual(expected[split]);
    }
  });

  it("keeps ids, queries, and split groups unique", () => {
    expect(new Set(CASES.map((item) => item.caseId)).size).toBe(CASES.length);
    expect(new Set(CASES.map((item) => item.query.toLowerCase().replace(/\s+/g, " ").trim())).size).toBe(CASES.length);

    const groupSplits = new Map<string, string>();
    for (const item of CASES) {
      const prior = groupSplits.get(item.groupId);
      expect(prior === undefined || prior === item.split).toBe(true);
      groupSplits.set(item.groupId, item.split);
    }
  });

  it("gives every positive case an executable Gold and every negative case a distractor", () => {
    const fixtureById = new Map(FIXTURES.map((fixture) => [fixture.fixtureId, fixture]));

    for (const item of CASES) {
      const fixture = fixtureById.get(item.fixtureIds[0]);
      expect(fixture?.split).toBe(item.split);

      if (item.gold.needTdaiTool) {
        expect(item.gold.family).not.toBeNull();
        expect(item.gold.allowedFirstActions.length).toBeGreaterThan(0);
        expect(item.gold.allowedSequences.length).toBeGreaterThan(0);
      } else {
        expect(item.gold.family).toBeNull();
        expect(item.gold.allowedFirstActions).toEqual([]);
        expect(item.gold.maxTdaiCalls).toBe(0);
        expect(Boolean(
          fixture?.assets.atomicMemories?.length
          || fixture?.assets.skills?.listed.length
          || fixture?.assets.knowledge?.length,
        )).toBe(true);
      }
    }
  });

  it("matches the current V0 extraction surface and covers injected L3 no-call decisions", () => {
    const fixtureById = new Map(FIXTURES.map((fixture) => [fixture.fixtureId, fixture]));
    const profileCases = CASES.filter((item) => item.preconditions.answerInProfileL3);

    expect(CASES.every((item) => item.capabilities.allowLlmExtract)).toBe(true);
    expect(profileCases.length).toBeGreaterThanOrEqual(3);
    for (const item of profileCases) {
      expect(item.gold.needTdaiTool).toBe(false);
      expect(item.preconditions.answerInCurrentContext).toBe(false);
      const fixture = fixtureById.get(item.fixtureIds[0]);
      expect(fixture?.assets.profileL3?.length).toBeGreaterThan(0);
    }
  });

  it("renders one fixture through the production injection pipeline and V0 renderers", async () => {
    const item = CASES.find((candidate) => candidate.preconditions.answerInProfileL3);
    expect(item).toBeDefined();
    if (!item) return;
    const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const rendered = await renderFixturePrompt(item, fixture, {
      bridgeBaseUrl: "http://127.0.0.1:43127",
      sessionId: "eval-session-001",
      spaceId: "eval-space",
    });

    expect(rendered.prompt).toContain("<skill_tools>");
    expect(rendered.prompt).toContain('<tool name="skill_extract">');
    expect(rendered.prompt).toContain("<available_skills>");
    expect(rendered.prompt).toContain("<knowledge_tools>");
    expect(rendered.prompt).toContain("<tdai_memory_tools>");
    expect(rendered.prompt).toContain("<tdai_profile_memory>");
    expect(rendered.prompt).toContain(fixture.assets.profileL3?.[0]);
    expect(rendered.prompt).toContain("http://127.0.0.1:43127");
    expect(rendered.promptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect((rendered.body.messages as Array<{ content: string }>)[0].content).toBe(rendered.prompt);
  });

  it("safely executes an allowed curl intent and correlates it with the bridge call", async () => {
    const item = CASES.find((candidate) => (
      candidate.gold.family === "memory"
      && candidate.gold.allowedFirstActions[0]?.tool === "tdai_memory_search"
    ));
    expect(item).toBeDefined();
    if (!item) return;
    const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const server = await startToolPromptMockServer(fixture, {
      runId: "run-safe-curl-001",
      sessionId: "session-safe-curl-001",
    });
    try {
      const command = `curl -sfk -X POST ${server.baseUrl}/memory-bridge/v3/atomic/search `
        + `-H 'Content-Type: application/json' -H 'x-tdai-service-id: eval-space' `
        + `-H 'x-conversation-id: session-safe-curl-001' -d '{"query":"TypeScript 测试框架 之前"}'`;
      const result = await executeCurlCommand(command, {
        allowedBaseUrl: server.baseUrl,
        runId: "run-safe-curl-001",
        sessionId: "session-safe-curl-001",
      });

      expect(result.intent.error).toBeUndefined();
      expect(result.response?.status).toBe(200);
      expect(server.bridge.attempts).toHaveLength(1);
      expect(server.bridge.attempts[0]).toMatchObject({
        intentId: result.intent.intentId,
        runId: "run-safe-curl-001",
        sessionId: "session-safe-curl-001",
        method: "POST",
      });
      expect(server.bridge.attempts[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await server.close();
    }
  });

  it("records a hallucinated TDAI endpoint as a false call", async () => {
    const item = CASES.find((candidate) => !candidate.gold.needTdaiTool);
    expect(item).toBeDefined();
    if (!item) return;
    const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const server = await startToolPromptMockServer(fixture, {
      runId: "run-wrong-endpoint-001",
      sessionId: "session-wrong-endpoint-001",
    });
    try {
      const response = await fetch(`${server.baseUrl}/memory-bridge/v3/atomic/hallucinated`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tdai-service-id": "eval-space",
          "x-conversation-id": "session-wrong-endpoint-001",
        },
        body: "{}",
      });
      expect(response.status).toBe(404);
      expect(server.bridge.attempts).toHaveLength(1);
      expect(server.bridge.attempts[0]).toMatchObject({
        family: "memory",
        tool: "unknown_memory_endpoint",
        endpoint: "/memory-bridge/v3/atomic/hallucinated",
        malformedReason: "unsupported TDAI endpoint",
      });
      expect(evaluateToolPromptCase(item, fixture, server.bridge.attempts)).toMatchObject({
        falseCall: true,
        state: "TDAI_INTENT_MALFORMED",
      });
    } finally {
      await server.close();
    }
  });

  it("rejects shell syntax and off-origin curl before any request is sent", () => {
    expect(() => parseCurlCommand(
      "curl -X POST http://127.0.0.1:43127/tools/list -d '{}' ; echo unsafe",
      "http://127.0.0.1:43127",
    )).toThrow(/shell operator/i);
    expect(() => parseCurlCommand(
      "curl -X POST https://example.com/tools/list -d '{}'",
      "http://127.0.0.1:43127",
    )).toThrow(/origin/i);
  });

  it("builds a fresh ephemeral Codex invocation without inherited task state", () => {
    const invocation = buildCodexInvocation({
      workspaceDir: "D:/eval/run-001/workspace",
      model: "gpt-test",
      profileName: "tdai-eval",
    });
    expect(invocation.args).toEqual([
      "exec",
      "--ephemeral",
      "--ignore-rules",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--cd",
      "D:/eval/run-001/workspace",
      "--model",
      "gpt-test",
      "--profile",
      "tdai-eval",
      "-",
    ]);
    const resolved = resolveCodexInvocation(invocation, {
      platform: "win32",
      appData: "C:/Users/eval/AppData/Roaming",
      nodeExecutable: "C:/Program Files/nodejs/node.exe",
      pathExists: () => true,
    });
    expect(resolved.executable).toBe("C:/Program Files/nodejs/node.exe");
    expect(resolved.args[0]).toBe(join(
      "C:/Users/eval/AppData/Roaming",
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    ));

    const env = isolateCodexEnvironment({
      PATH: "test-path",
      HOME: "C:/Users/example",
      USERPROFILE: "C:/Users/example",
      CODEX_THREAD_ID: "must-not-leak",
      CODEX_SESSION_ID: "must-not-leak",
      CODEX_PERMISSION_PROFILE: "must-not-leak",
      CODEX_HOME: "old-home",
    }, "D:/eval/run-001/codex-home");
    expect(env).toMatchObject({
      PATH: "test-path",
      CODEX_HOME: "D:/eval/run-001/codex-home",
      CODEX_SQLITE_HOME: join("D:/eval/run-001/codex-home", "sqlite"),
      HOME: "D:/eval/run-001/codex-home",
      USERPROFILE: "D:/eval/run-001/codex-home",
    });
    expect(env.CODEX_THREAD_ID).toBeUndefined();
    expect(env.CODEX_SESSION_ID).toBeUndefined();
    expect(env.CODEX_PERMISSION_PROFILE).toBeUndefined();
  });

  it("puts the fixture prompt in Codex developer instructions without embedding credentials", () => {
    const profile = buildCodexProfile({
      developerInstructions: "<tdai_injections>\nV0 PROMPT\n</tdai_injections>",
      providerBaseUrl: "http://127.0.0.1:8096/codex/eval-space/v1",
      reasoningEffort: "medium",
      verbosity: "medium",
    });
    expect(profile).toContain('developer_instructions = "<tdai_injections>\\nV0 PROMPT\\n</tdai_injections>"');
    expect(profile).toContain('base_url = "http://127.0.0.1:8096/codex/eval-space/v1"');
    expect(profile).toContain('wire_api = "responses"');
    expect(profile).toContain('model_reasoning_effort = "medium"');
    expect(profile).toContain('model_verbosity = "medium"');
    expect(profile.indexOf('model_provider = "custom"')).toBeLessThan(profile.indexOf("[features]"));
    expect(profile).toContain("[skills]\ninclude_instructions = false");
    expect(profile).not.toMatch(/api[_-]?key|secret|bearer/i);
  });

  it("audits the complete Codex prompt and rejects client skill contamination", () => {
    const expected = "<tdai_memory_tools>fixed benchmark prompt</tdai_memory_tools>";
    const clean = JSON.stringify([{
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: expected }],
    }]);
    expect(auditCodexPromptInput(clean, expected)).toEqual({
      sha256: createHash("sha256").update(clean).digest("hex"),
      messageCount: 1,
      skillsInstructionsPresent: false,
    });

    const contaminated = JSON.stringify([{
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: `${expected}\n<skills_instructions>personal</skills_instructions>` }],
    }]);
    expect(() => auditCodexPromptInput(contaminated, expected)).toThrow(/skill instructions/i);
  });

  it("classifies a non-zero Codex exit as infrastructure failure", () => {
    expect(codexProcessInfrastructureError({ timedOut: false, exitCode: 1 })).toBe("Codex runner exited with code 1");
    expect(codexProcessInfrastructureError({ timedOut: true, exitCode: null })).toBe("Codex runner timed out");
    expect(codexProcessInfrastructureError({ timedOut: false, exitCode: 0 })).toBeUndefined();
  });

  it("keeps generated JSONL synchronized with the TypeScript definitions", () => {
    const root = resolve(process.cwd(), "eval", "tool-prompt-bench");
    const generatedCases = [
      ...readJsonl(resolve(root, "cases", "dev.jsonl")),
      ...readJsonl(resolve(root, "cases", "test.jsonl")),
    ];
    const generatedFixtures = readJsonl(resolve(root, "fixtures", "fixtures.jsonl"));
    const orderedCases = [
      ...CASES.filter((item) => item.split === "dev"),
      ...CASES.filter((item) => item.split === "test"),
    ];
    const serializableCases = JSON.parse(JSON.stringify(orderedCases));
    const serializableFixtures = JSON.parse(JSON.stringify(FIXTURES));

    expect(generatedCases).toEqual(serializableCases);
    expect(generatedFixtures).toEqual(serializableFixtures);
  });

  it("freezes all published dataset inputs with reproducible hashes", () => {
    const root = resolve(process.cwd(), "eval", "tool-prompt-bench");
    const manifest = JSON.parse(readFileSync(resolve(root, "dataset-manifest.json"), "utf8")) as {
      files: Record<string, { sha256: string; bytes: number }>;
    };

    expect(Object.keys(manifest.files).sort()).toEqual([
      "cases/dev.jsonl",
      "cases/smoke-case-ids.json",
      "cases/test.jsonl",
      "fixtures/fixtures.jsonl",
      "sources/manifest.json",
    ]);
    for (const [relativePath, expected] of Object.entries(manifest.files)) {
      const content = readFileSync(resolve(root, relativePath));
      expect(content.byteLength).toBe(expected.bytes);
      expect(createHash("sha256").update(content).digest("hex")).toBe(expected.sha256);
    }
  });

  it("makes every multi-step Gold executable from prior fixture responses", () => {
    const fixtureById = new Map(FIXTURES.map((fixture) => [fixture.fixtureId, fixture]));

    for (const item of CASES.filter((candidate) => candidate.gold.needTdaiTool)) {
      const sequence = item.gold.allowedSequences[0];
      const fixture = fixtureById.get(item.fixtureIds[0]);
      expect(fixture).toBeDefined();

      if (item.gold.family === "knowledge") {
        expect(item.gold.expectedKnowledgeCalls).toHaveLength(sequence.length - 1);
        const knowledgeId = item.gold.allowedFirstActions[0].argumentRules?.exactValues?.knowledge_id;
        const resource = fixture?.assets.knowledge?.find((candidate) => candidate.knowledge_id === knowledgeId);
        const toolNames = Array.isArray(resource?.tools)
          ? resource.tools.map((tool) => typeof tool === "object" && tool ? tool.name : undefined)
          : [];
        for (const call of item.gold.expectedKnowledgeCalls ?? []) expect(toolNames).toContain(call.toolName);
      } else {
        expect(item.gold.expectedFollowupActions ?? []).toHaveLength(sequence.length - 1);
        for (const [index, followup] of (item.gold.expectedFollowupActions ?? []).entries()) {
          expect(followup.tool).toBe(sequence[index + 1]);
          expect(followup.argumentRules?.valueFromPreviousStep).toBe(true);
        }
      }
    }
  });

  it("keeps task-selection cues natural and hard-negative assets non-empty", () => {
    const explicitSkillCue = /\b(?:skill_search|skill_view|skill_files_read|available_skills|listed skill|search the team library|open the listed)\b/i;
    const fixtureById = new Map(FIXTURES.map((fixture) => [fixture.fixtureId, fixture]));

    for (const item of CASES) {
      if (item.category === "skill_positive") expect(item.query).not.toMatch(explicitSkillCue);
      if (!item.gold.needTdaiTool) {
        expect(item.gold.allowedSequences).toEqual([]);
        const fixture = fixtureById.get(item.fixtureIds[0]);
        expect(Boolean(
          fixture?.assets.atomicMemories?.length
          || fixture?.assets.skills?.listed.length
          || fixture?.assets.knowledge?.length,
        )).toBe(true);
      }
    }
  });

  it("executes and scores the Gold sequence for all 100 cases", async () => {
    const fixtureById = new Map(FIXTURES.map((fixture) => [fixture.fixtureId, fixture]));
    const headers = {
      "content-type": "application/json",
      "x-tdai-service-id": "svc-tool-prompt-bench",
      "x-conversation-id": "session-tool-prompt-bench",
    };

    for (const item of CASES) {
      const fixture = fixtureById.get(item.fixtureIds[0]);
      expect(fixture).toBeDefined();
      if (!fixture) continue;
      const bridge = createToolPromptMockBridge(fixture);

      if (!item.gold.needTdaiTool) {
        const result = evaluateToolPromptCase(item, fixture, bridge.attempts);
        expect(result.state, item.caseId).toBe("NO_TDAI_INTENT");
        expect(result.falseCall, item.caseId).toBe(false);
        continue;
      }

      const sequence = item.gold.allowedSequences[0];
      let previousResponse: unknown;
      for (const [index] of sequence.entries()) {
        let action: AllowedToolAction;
        let body: Record<string, unknown>;
        if (index === 0) {
          action = item.gold.allowedFirstActions[0];
          body = bodyFromRules(action.argumentRules, undefined, fixture);
        } else if (item.gold.family === "knowledge") {
          const expectation = item.gold.expectedKnowledgeCalls?.[index - 1];
          const knowledgeId = item.gold.allowedFirstActions[0].argumentRules?.exactValues?.knowledge_id;
          if (!expectation || typeof knowledgeId !== "string") throw new Error(`${item.caseId}: incomplete Knowledge Gold`);
          action = { tool: "knowledge_tools_call", endpoint: "/tools/call" };
          body = {
            knowledge_id: knowledgeId,
            tool_name: expectation.toolName,
            params: bodyFromRules(expectation.paramRules, previousResponse, fixture),
          };
        } else {
          action = item.gold.expectedFollowupActions?.[index - 1] as AllowedToolAction;
          body = bodyFromRules(action.argumentRules, previousResponse, fixture);
        }
        const response = await bridge.app.request(`http://mock.local${action.endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        previousResponse = await response.json();
      }

      const result = evaluateToolPromptCase(item, fixture, bridge.attempts);
      expect(result.state, item.caseId).toBe("CORRECT_CALL");
      expect(result.effectiveCall, item.caseId).toBe(true);
      expect(result.executionValid, item.caseId).toBe(true);
      expect(result.overcall, item.caseId).toBe(false);
    }
  });

  it("keeps infrastructure failures out of accuracy denominators", () => {
    const negative = CASES.find((item) => !item.gold.needTdaiTool);
    const positive = CASES.find((item) => item.gold.needTdaiTool);
    expect(negative).toBeDefined();
    expect(positive).toBeDefined();
    if (!negative || !positive) return;

    const scored = scoreTraceRecords([
      { caseId: negative.caseId, runId: "negative-clean", attempts: [] },
      {
        caseId: positive.caseId,
        runId: "infra-failure",
        attempts: [{
          tool: positive.gold.allowedFirstActions[0].tool,
          family: positive.gold.family!,
          endpoint: positive.gold.allowedFirstActions[0].endpoint,
          method: "POST",
          infrastructureError: "runner timeout",
        }],
      },
    ]);
    expect(aggregateScores(scored)).toMatchObject({
      total: 2,
      infrastructureErrors: 1,
      positiveCases: 0,
      negativeCases: 1,
      falseCallRate: 0,
    });
  });

  it("separates first-tool selection from argument validity", () => {
    const item = CASES.find((candidate) => candidate.gold.family === "memory" && candidate.gold.allowedFirstActions[0].tool === "tdai_memory_search");
    expect(item).toBeDefined();
    if (!item) return;
    const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const action = item.gold.allowedFirstActions[0];
    const result = evaluateToolPromptCase(item, fixture, [{
      tool: action.tool,
      family: "memory",
      endpoint: action.endpoint,
      method: "POST",
      body: {},
      headers: {
        "content-type": "application/json",
        "x-tdai-service-id": "svc-tool-prompt-bench",
        "x-conversation-id": "session-tool-prompt-bench",
      },
      status: 400,
    }]);
    expect(result.firstActionCorrect).toBe(true);
    expect(result.argumentValid).toBe(false);
    expect(result.effectiveCall).toBe(false);
    expect(result.state).toBe("CORRECT_ENDPOINT_INVALID_ARGS");
  });

  it("does not count an executable-looking call with a failed response as effective", () => {
    const item = CASES.find((candidate) => (
      candidate.gold.family === "memory"
      && candidate.gold.allowedFirstActions[0].tool === "tdai_memory_search"
    ));
    expect(item).toBeDefined();
    if (!item) return;
    const fixture = FIXTURES.find((candidate) => candidate.fixtureId === item.fixtureIds[0]);
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const action = item.gold.allowedFirstActions[0];
    const result = evaluateToolPromptCase(item, fixture, [{
      tool: action.tool,
      family: "memory",
      endpoint: action.endpoint,
      method: "POST",
      body: bodyFromRules(action.argumentRules, undefined, fixture),
      headers: {
        "content-type": "application/json",
        "x-tdai-service-id": "svc-tool-prompt-bench",
        "x-conversation-id": "session-tool-prompt-bench",
      },
      status: 400,
    }]);
    expect(result.argumentValid).toBe(true);
    expect(result.executionValid).toBe(false);
    expect(result.effectiveCall).toBe(false);
    expect(result.state).not.toBe("CORRECT_CALL");
  });
});
