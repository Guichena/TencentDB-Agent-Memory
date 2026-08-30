import { describe, expect, it } from "vitest";
import {
  evaluateToolPromptCase,
  type TdaiAttempt,
} from "../../eval/tool-prompt-bench/evaluator.js";
import type {
  EvalFixture,
  ToolPromptEvalCase,
} from "../../eval/tool-prompt-bench/schema.js";

const fixture: EvalFixture = {
  fixtureId: "fixture-ds00",
  split: "dev",
  description: "DS00 minimal-chain scoring fixture",
  assets: { skills: { listed: [], teamLibrary: [] } },
};

const headers = {
  "content-type": "application/json",
  "x-tdai-service-id": "space-task1-engineering",
  "x-conversation-id": "session-ds00",
};

function skillCase(): ToolPromptEvalCase {
  return {
    caseId: "T01-SKILL-SEARCH-001-P",
    schemaVersion: "1.0",
    split: "dev",
    language: "zh",
    category: "skill_positive",
    query: "请继续处理当前的模糊测试接入。",
    source: {
      dataset: "project-authored",
      sourceId: "source-ds00",
      revision: "v1",
      license: "MIT",
      usage: "project-authored",
      adaptation: "DS00 scoring contract fixture",
    },
    capabilities: {
      chatMemory: true,
      skill: true,
      llmWiki: true,
      codeGraph: true,
      allowLlmWrite: false,
      allowLlmExtract: false,
    },
    gold: {
      needTdaiTool: true,
      family: "skill",
      allowedFirstActions: [{
        tool: "skill_search",
        endpoint: "/skill-bridge/v3/skill/search",
        argumentRules: { requiredFields: ["query"] },
      }],
      expectedFollowupActions: [{
        tool: "skill_view_by_id",
        endpoint: "/skill-bridge/v3/skill/get",
        argumentRules: { requiredFields: ["skill_id"], valueFromPreviousStep: true },
      }],
      expectedKnowledgeCalls: [],
      allowedSequences: [["skill_search", "skill_view_by_id"]],
      forbiddenTools: [],
      maxTdaiCalls: 2,
    },
    preconditions: {
      answerInCurrentContext: false,
      answerInProfileL3: false,
      scenePathInjected: false,
      goldSkillInListing: false,
      knowledgeMatchesWorkspace: false,
    },
    fixtureIds: [fixture.fixtureId],
    annotationReason: "The target Skill must be discovered and then opened.",
    groupId: "T01-SKILL-SEARCH-001",
  };
}

describe("Task 1 complete minimal-chain scoring", () => {
  it("keeps FirstRouteAt1 diagnostic while EffectiveCallRate requires the full Skill chain", () => {
    const search: TdaiAttempt = {
      tool: "skill_search",
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/search",
      method: "POST",
      body: { query: "python fuzz harness" },
      headers,
      status: 200,
      response: { data: { items: [{ skill_id: "skill-fuzzing-harness" }] } },
    };
    const partial = evaluateToolPromptCase(skillCase(), fixture, [search]);
    expect(partial.firstActionCorrect).toBe(true);
    expect(partial.effectiveCall).toBe(false);

    const view: TdaiAttempt = {
      tool: "skill_view_by_id",
      family: "skill",
      endpoint: "/skill-bridge/v3/skill/get",
      method: "POST",
      body: { skill_id: "skill-fuzzing-harness" },
      headers,
      status: 200,
      response: { data: { content: "# Fuzzing harness" } },
    };
    const complete = evaluateToolPromptCase(skillCase(), fixture, [search, view]);
    expect(complete.firstActionCorrect).toBe(true);
    expect(complete.effectiveCall).toBe(true);
    expect(complete.state).toBe("CORRECT_CALL");

    const overcalled = evaluateToolPromptCase(skillCase(), fixture, [search, view, view]);
    expect(overcalled.overcall).toBe(true);
    expect(overcalled.effectiveCall).toBe(false);
    expect(overcalled.state).toBe("EXTRA_OR_DUPLICATE_CALL");

    const wrongSequence = skillCase();
    wrongSequence.gold.allowedSequences = [["skill_search", "skill_files_read"]];
    expect(evaluateToolPromptCase(wrongSequence, fixture, [search, view]).effectiveCall).toBe(false);
  });

  it("preserves Knowledge tools/list and expectedKnowledgeCalls before counting success", () => {
    const item = skillCase();
    item.caseId = "T01-KNOWLEDGE-001-P";
    item.category = "knowledge_positive";
    item.gold = {
      needTdaiTool: true,
      family: "knowledge",
      allowedFirstActions: [{
        tool: "knowledge_tools_list",
        endpoint: "/tools/list",
        argumentRules: {
          requiredFields: ["knowledge_id"],
          exactValues: { knowledge_id: "knowledge-mypy-graph" },
        },
      }],
      expectedFollowupActions: [],
      expectedKnowledgeCalls: [{
        toolName: "search",
        paramRules: { requiredFields: ["query"] },
      }],
      allowedSequences: [["knowledge_tools_list", "knowledge_tools_call"]],
      forbiddenTools: [],
      maxTdaiCalls: 2,
    };
    const list: TdaiAttempt = {
      tool: "knowledge_tools_list", family: "knowledge", endpoint: "/tools/list", method: "POST",
      body: { knowledge_id: "knowledge-mypy-graph" }, headers, status: 200,
      response: { data: { tools: [{ name: "search", params: { query: "string" } }] } },
    };
    const partial = evaluateToolPromptCase(item, fixture, [list]);
    expect(partial.firstActionCorrect).toBe(true);
    expect(partial.effectiveCall).toBe(false);

    const call: TdaiAttempt = {
      tool: "knowledge_tools_call", family: "knowledge", endpoint: "/tools/call", method: "POST",
      body: { knowledge_id: "knowledge-mypy-graph", tool_name: "search", params: { query: "AliasPrinter StarExpr" } },
      headers, status: 200, response: { data: { results: [] } },
    };
    expect(evaluateToolPromptCase(item, fixture, [list, call]).effectiveCall).toBe(true);
  });
});
