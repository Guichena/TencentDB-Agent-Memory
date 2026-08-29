import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { executeConversationSearch } from "../../../MemoryCore/src/core/tools/conversation-search.js";
import { VectorStore } from "../../../MemoryCore/src/core/store/sqlite.js";
import { SqliteSkillStore } from "../../../MemoryCore/src/core/skill/skill-store.js";
import { createToolsRoutes } from "../../../MemoryKnowledge/src/routes/tools.js";
import { compileFormalCaseInput } from "../../eval/tool-prompt-bench/worlds/formal-compile.js";
import { resolveVisibleSnapshot } from "../../eval/tool-prompt-bench/worlds/formal-visibility.js";
import type { FormalWorldContract } from "../../eval/tool-prompt-bench/worlds/formal-schema.js";

const formalRoot = resolve(process.cwd(), "eval/tool-prompt-bench/formal-dataset");
const contract = JSON.parse(readFileSync(
  resolve(formalRoot, "registry/contracts/formal-v1.json"),
  "utf8",
)) as FormalWorldContract;
const fixture = JSON.parse(readFileSync(
  resolve(formalRoot, "fixtures/T01-retrieval-pressure.json"),
  "utf8",
)) as {
  resources: Array<{
    knowledge_id: string;
    type: "code-graph" | "wiki";
    name: string;
    summary: string;
    status: string;
    service_url: string;
    repo_slug?: string;
    repo_url?: string;
    branch?: string;
  }>;
  expected_target: {
    workspace_repo_slug: string;
    knowledge_id: string;
    list_tool_names: string[];
    call: { tool_name: string; params: Record<string, unknown> };
    result: unknown;
  };
};

const identity = {
  spaceId: "space-task1-engineering",
  teamId: "T01",
  userId: "user-task1-t01-eval",
  agentId: "agent-task1-t01-general",
  taskId: "T01-TASK-UJSON-FUZZING",
};

describe("DS02 T01 retrieval-pressure pilot", () => {
  it("ranks the target L0 session first across twelve production-FTS candidates and retains a near distractor", async () => {
    const visible = resolveVisibleSnapshot(contract, identity);
    expect(visible.l0Conversations).toHaveLength(12);

    const dbPath = join(tmpdir(), `task1-ds02-memory-${randomUUID()}.sqlite`);
    const store = new VectorStore(dbPath, 0);
    try {
      store.init();
      for (const conversation of visible.l0Conversations) {
        for (const message of conversation.messages) {
          expect(store.upsertL0({
            id: message.messageId,
            sessionKey: conversation.sessionId,
            sessionId: conversation.sessionId,
            teamId: identity.teamId,
            userId: identity.userId,
            agentId: identity.agentId,
            taskId: "T01-TASK-MYPY-REGRESSION",
            role: message.role,
            messageText: message.content,
            recordedAt: message.observedAt,
            timestamp: Date.parse(message.observedAt),
          }, undefined)).toBe(true);
        }
      }

      const result = await executeConversationSearch({
        query: "ParamSpec optional bound",
        limit: 20,
        vectorStore: store,
        filter: {
          teamId: identity.teamId,
          userId: identity.userId,
          agentId: identity.agentId,
        },
      });
      expect(result.strategy).toBe("fts");
      expect(result.results[0]?.session_key).toBe("T01-L0-12");
      expect(new Set(result.results.map((item) => item.session_key))).toContain("T01-L0-07");
    } finally {
      store.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        try { rmSync(`${dbPath}${suffix}`); } catch { /* already absent */ }
      }
    }
  }, 15_000);

  it("keeps the harness Skill out of listing but returns it at rank one through production BM25 search", async () => {
    const visible = resolveVisibleSnapshot(contract, identity);
    const targetId = "T01-SKILL-FUZZING-PYTHON";
    expect(visible.listedSkills.map((item) => item.assetId)).not.toContain(targetId);
    expect(visible.teamSearchSkills.map((item) => item.assetId)).toContain(targetId);

    const db = new DatabaseSync(":memory:");
    const store = new SqliteSkillStore({ db, dimensions: 0 });
    try {
      store.init();
      for (const skill of visible.teamSearchSkills) {
        await store.appendVersion({
          skill_id: skill.assetId,
          user_id: identity.userId,
          team_id: identity.teamId,
          task_id: identity.taskId,
          owner_agent_id: skill.ownerAgentId,
          name: skill.name,
          description: skill.description,
          content: `${skill.useWhen}\n${skill.doNotUseWhen}`,
          content_hash: skill.contentHash,
          manifest: skill.manifest.map((item) => ({
            path: item.path,
            size_bytes: 1,
            mime_type: "text/markdown",
            is_executable: false,
          })),
          storage_dir: skill.name,
        });
      }
      const results = await store.searchSkills({
        team_id: identity.teamId,
        query: "Python fuzz harness ujson Atheris coverage-guided",
        topK: 3,
      });
      expect(results[0]?.skill.skill_id).toBe(targetId);
      expect(results.findIndex((item) => item.skill.skill_id === targetId)).toBeLessThan(3);
    } finally {
      store.close();
      db.close();
    }
  });

  it("binds exactly three ready Knowledge resources and executes stable list then callers through production routes", async () => {
    const visible = resolveVisibleSnapshot(contract, identity);
    expect(visible.knowledge).toHaveLength(3);
    expect(fixture.resources).toHaveLength(3);
    expect(fixture.resources.every((item) => item.status === "ready")).toBe(true);

    const matchingResources = fixture.resources.filter((item) =>
      item.repo_slug === fixture.expected_target.workspace_repo_slug);
    expect(matchingResources.map((item) => item.knowledge_id)).toEqual([fixture.expected_target.knowledge_id]);

    const target = fixture.resources.find((item) => item.knowledge_id === fixture.expected_target.knowledge_id);
    expect(target).toBeDefined();
    const row = {
      code_graph_id: fixture.expected_target.knowledge_id,
      team_id: identity.teamId,
      status: "ready",
      repo_name: target?.name ?? "ultrajson",
      repo_url: target?.repo_url ?? "https://github.com/ultrajson/ultrajson",
      summary: target?.summary ?? null,
    };
    let executed: { name: string; params: Record<string, unknown> } | undefined;
    const app = createToolsRoutes({
      wikiService: {} as never,
      wikiMgr: {} as never,
      cgService: {
        getById: (_serviceId: string, knowledgeId: string) => knowledgeId === row.code_graph_id ? row : undefined,
        get: () => row,
        dirFor: () => ".",
      } as never,
      instancePool: {
        get: () => ({
          cg: {},
          projectRoot: ".",
          handler: {
            execute: async (name: string, params: Record<string, unknown>) => {
              executed = { name, params };
              return { content: [{ text: JSON.stringify(fixture.expected_target.result) }], isError: false };
            },
          },
        }),
        set: () => undefined,
        delete: () => undefined,
      },
    });
    const headers = {
      "content-type": "application/json",
      "x-tdai-service-id": "space-task1-engineering",
    };
    const listResponse = await app.request("http://knowledge.test/list", {
      method: "POST",
      headers,
      body: JSON.stringify({ knowledge_id: fixture.expected_target.knowledge_id }),
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as { data: { status: string; tools: Array<{ name: string }> } };
    expect(listBody.data.status).toBe("ready");
    expect(listBody.data.tools.map((item) => item.name)).toEqual(fixture.expected_target.list_tool_names);

    const callResponse = await app.request("http://knowledge.test/call", {
      method: "POST",
      headers,
      body: JSON.stringify({
        knowledge_id: fixture.expected_target.knowledge_id,
        tool_name: fixture.expected_target.call.tool_name,
        params: fixture.expected_target.call.params,
      }),
    });
    expect(callResponse.status).toBe(200);
    const callBody = await callResponse.json() as { data: { text: string; isError: boolean } };
    expect(callBody.data.isError).toBe(false);
    expect(JSON.parse(callBody.data.text)).toEqual(fixture.expected_target.result);
    expect(executed).toEqual({
      name: "codegraph_callers",
      params: {
        code_graph_id: fixture.expected_target.knowledge_id,
        symbol: "JSON_DecodeObject",
      },
    });
  });

  it("compiles the three positive/negative pilot pairs with exact shortest Gold sequences", () => {
    const expected = new Map([
      ["T01-MEMORY-PARAMSPEC-004-P", ["tdai_conversation_search"]],
      ["T01-SKILL-HARNESS-002-P", ["skill_search", "skill_view_by_id"]],
      ["T01-KNOWLEDGE-DECODER-005-P", ["knowledge_tools_list", "knowledge_tools_call"]],
    ]);
    const annotationByCase = new Map(contract.privateAnnotations.map((item) => [item.caseId, item]));
    for (const [caseId, sequence] of expected) {
      expect(() => compileFormalCaseInput(contract, caseId)).not.toThrow();
      const annotation = annotationByCase.get(caseId);
      expect(annotation?.gold.allowedSequences).toEqual([sequence]);
      expect(annotation?.gold.maxTdaiCalls).toBe(sequence.length);
      const negativeId = contract.pairs.find((pair) => pair.positiveCaseId === caseId)?.negativeCaseId;
      expect(negativeId).toBeDefined();
      if (!negativeId) continue;
      expect(() => compileFormalCaseInput(contract, negativeId)).not.toThrow();
      expect(annotationByCase.get(negativeId)?.gold).toMatchObject({
        needTdaiTool: false,
        allowedSequences: [],
        maxTdaiCalls: 0,
      });
    }
  });
});
