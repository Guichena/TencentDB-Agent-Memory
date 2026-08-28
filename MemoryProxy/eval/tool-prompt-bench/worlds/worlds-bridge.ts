/**
 * World-aware Mock Bridge.
 *
 * The frozen mock-bridge.ts synthesizes Knowledge answers from a resource summary:
 * `callers` returns the repo slug, `read_page` echoes the summary. That is enough to
 * score tool selection, but it means no Knowledge case has real content behind it.
 *
 * This wrapper resolves the Knowledge family from authored graph and page data, and
 * delegates every Memory and Skill endpoint to the frozen bridge unchanged, so both
 * paths stay identical to production for the families it does not touch.
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createToolPromptMockBridge } from "../mock-bridge.js";
import type { ToolPromptMockBridge } from "../mock-bridge.js";
import type { EvalFixture } from "../schema.js";
import type { CodeGraphData, WikiPage, WorldKnowledge } from "./world-schema.js";

export interface WorldBridgeOptions {
  runId?: string;
  sessionId?: string;
}

function envelope(data: unknown): Record<string, unknown> {
  return { code: 0, message: "ok", request_id: "tool-prompt-bench", data };
}

function errorEnvelope(message: string): Record<string, unknown> {
  return { code: 40001, message, request_id: "tool-prompt-bench" };
}

function terms(query: unknown): string[] {
  return typeof query === "string"
    ? query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1)
    : [];
}

function score(value: unknown, probe: string[]): number {
  const text = JSON.stringify(value).toLowerCase();
  return probe.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
}

function graphSearch(graph: CodeGraphData, query: unknown): unknown {
  const probe = terms(query);
  const matches = graph.symbols
    .map((symbol) => ({ symbol, hits: score(symbol, probe) }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((entry) => entry.symbol);
  return { matches: matches.length > 0 ? matches : graph.symbols.slice(0, 3) };
}

function callersOf(graph: CodeGraphData, target: unknown): unknown {
  const symbol = String(target ?? "");
  const edges = graph.edges.filter((edge) => edge.to === symbol);
  return {
    symbol,
    callers: edges.map((edge) => ({
      symbol: edge.from,
      file: edge.file,
      line: edge.line,
      signature: graph.symbols.find((candidate) => candidate.symbol === edge.from)?.signature ?? null,
    })),
    total: edges.length,
  };
}

function calleesOf(graph: CodeGraphData, target: unknown): unknown {
  const symbol = String(target ?? "");
  const edges = graph.edges.filter((edge) => edge.from === symbol);
  return {
    symbol,
    callees: edges.map((edge) => ({
      symbol: edge.to,
      file: edge.file,
      line: edge.line,
      signature: graph.symbols.find((candidate) => candidate.symbol === edge.to)?.signature ?? null,
    })),
    total: edges.length,
  };
}

/** Transitive callers, which is what an impact question actually asks for. */
function impactOf(graph: CodeGraphData, target: unknown): unknown {
  const symbol = String(target ?? "");
  const seen = new Set<string>();
  const queue = [symbol];
  const affected: Array<{ symbol: string; file: string; depth: number }> = [];
  let depth = 0;
  while (queue.length > 0 && depth < 6) {
    const level = queue.splice(0, queue.length);
    depth++;
    for (const current of level) {
      for (const edge of graph.edges.filter((candidate) => candidate.to === current)) {
        if (seen.has(edge.from)) continue;
        seen.add(edge.from);
        affected.push({ symbol: edge.from, file: edge.file, depth });
        queue.push(edge.from);
      }
    }
  }
  return { symbol, affected, total: affected.length };
}

function wikiSearch(pages: WikiPage[], query: unknown): unknown {
  const probe = terms(query);
  const ranked = pages
    .map((page) => ({ page, hits: score(page, probe) }))
    .sort((a, b) => b.hits - a.hits);
  const hit = ranked.filter((entry) => entry.hits > 0);
  const selected = (hit.length > 0 ? hit : ranked.slice(0, 2)).slice(0, 5);
  return {
    results: selected.map((entry) => ({
      ref: entry.page.ref,
      title: entry.page.title,
      snippet: entry.page.body.split("\n").filter(Boolean)[0]?.slice(0, 160) ?? "",
    })),
  };
}

function readPages(pages: WikiPage[], refs: unknown): unknown {
  const wanted = Array.isArray(refs) ? refs.map(String) : [];
  return {
    items: wanted.map((ref) => {
      const page = pages.find((candidate) => candidate.ref === ref);
      return page
        ? { ref, title: page.title, content: page.body }
        : { ref, error: "page not found" };
    }),
  };
}

function knowledgeRequiredFields(resource: WorldKnowledge, toolName: string): string[] {
  const tool = resource.tools.find((candidate) => candidate.name === toolName);
  if (!tool) return [];
  return Object.entries(tool.params)
    .filter(([, definition]) => definition.required === true)
    .map(([field]) => field);
}

/**
 * Build a bridge whose Knowledge endpoints read the world's authored content.
 * `knowledge` is the world's typed resources; the fixture still backs every other family.
 */
export function createWorldMockBridge(
  fixture: EvalFixture,
  knowledge: WorldKnowledge[],
  options: WorldBridgeOptions = {},
): ToolPromptMockBridge {
  const inner = createToolPromptMockBridge(fixture, options);
  const app = new Hono();
  const byId = new Map(knowledge.map((resource) => [resource.knowledgeId, resource]));

  const record = (
    endpoint: string,
    body: Record<string, unknown> | undefined,
    headers: Record<string, string>,
    status: number,
    response: unknown,
    malformedReason?: string,
  ): void => {
    inner.attempts.push({
      intentId: headers["x-tdai-eval-intent-id"],
      runId: headers["x-tdai-eval-run-id"] ?? options.runId,
      sessionId: headers["x-tdai-eval-session-id"] ?? options.sessionId,
      timestamp: new Date().toISOString(),
      tool: endpoint === "/tools/list" ? "knowledge_tools_list" : "knowledge_tools_call",
      family: "knowledge",
      endpoint,
      method: "POST",
      body,
      headers,
      status,
      response,
      ...(malformedReason ? { malformedReason } : {}),
    });
  };

  app.post("/tools/list", async (c) => {
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      const response = errorEnvelope("invalid JSON body");
      record("/tools/list", undefined, headers, 400, response, "invalid JSON body");
      return c.json(response, 400);
    }
    if (!c.req.header("x-tdai-service-id")) {
      const response = errorEnvelope("x-tdai-service-id is required");
      record("/tools/list", body, headers, 400, response);
      return c.json(response, 400);
    }
    const resource = typeof body.knowledge_id === "string" ? byId.get(body.knowledge_id) : undefined;
    if (!resource) {
      const response = errorEnvelope("knowledge resource not found");
      record("/tools/list", body, headers, 400, response);
      return c.json(response, 400);
    }
    const response = envelope({
      knowledge_id: resource.knowledgeId,
      type: resource.type,
      name: resource.name,
      summary: resource.summary,
      ...(resource.repoSlug ? { repo_slug: resource.repoSlug } : {}),
      ...(resource.branch ? { branch: resource.branch } : {}),
      tools: resource.tools,
      ...(resource.graph ? { symbol_count: resource.graph.symbols.length, edge_count: resource.graph.edges.length } : {}),
      ...(resource.pages ? { page_count: resource.pages.length } : {}),
    });
    record("/tools/list", body, headers, 200, response);
    return c.json(response);
  });

  app.post("/tools/call", async (c) => {
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      const response = errorEnvelope("invalid JSON body");
      record("/tools/call", undefined, headers, 400, response, "invalid JSON body");
      return c.json(response, 400);
    }
    const fail = (message: string, status: 400 | 403 = 400): Response => {
      const response = errorEnvelope(message);
      record("/tools/call", body, headers, status, response);
      return c.json(response, status);
    };
    if (!c.req.header("x-tdai-service-id")) return fail("x-tdai-service-id is required");
    if (typeof body.knowledge_id !== "string" || typeof body.tool_name !== "string"
      || !body.params || typeof body.params !== "object") {
      return fail("knowledge_id, tool_name, and params are required");
    }
    const resource = byId.get(body.knowledge_id);
    if (!resource) return fail("knowledge resource not found");
    if (!resource.tools.some((tool) => tool.name === body.tool_name)) return fail("knowledge tool not found", 403);
    const params = body.params as Record<string, unknown>;
    for (const field of knowledgeRequiredFields(resource, body.tool_name)) {
      if (!(field in params)) return fail(`${field} is required`);
    }

    let data: unknown;
    if (resource.type === "code-graph") {
      const graph = resource.graph;
      if (!graph) return fail("code-graph resource has no indexed content");
      if (body.tool_name === "search") data = graphSearch(graph, params.query);
      else if (body.tool_name === "callers") data = callersOf(graph, params.symbol);
      else if (body.tool_name === "callees") data = calleesOf(graph, params.symbol);
      else if (body.tool_name === "impact") data = impactOf(graph, params.symbol);
      else return fail("unsupported code-graph tool", 403);
    } else {
      const pages = resource.pages;
      if (!pages) return fail("wiki resource has no pages");
      if (body.tool_name === "search") data = wikiSearch(pages, params.query);
      else if (body.tool_name === "read_page") data = readPages(pages, params.refs);
      else return fail("unsupported wiki tool", 403);
    }

    const response = envelope(data);
    record("/tools/call", body, headers, 200, response);
    return c.json(response);
  });

  // Memory and Skill endpoints stay on the frozen bridge.
  app.all("*", (c) => inner.app.fetch(c.req.raw));

  return {
    app,
    attempts: inner.attempts,
    reset: () => inner.reset(),
  };
}

export interface RunningWorldMockServer {
  baseUrl: string;
  bridge: ToolPromptMockBridge;
  close(): Promise<void>;
}

/** Serve a world bridge on a random loopback port, mirroring startToolPromptMockServer. */
export async function startWorldMockServer(
  fixture: EvalFixture,
  knowledge: WorldKnowledge[],
  context: { runId: string; sessionId: string },
): Promise<RunningWorldMockServer> {
  const bridge = createWorldMockBridge(fixture, knowledge, context);
  let server: ServerType;
  const address = await new Promise<{ port: number }>((resolve, reject) => {
    try {
      server = serve({ fetch: bridge.app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => resolve({ port: info.port }));
      server.once("error", reject);
    } catch (error) {
      reject(error);
    }
  });
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    bridge,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
