import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareBenchmarkWorkspace,
  resolveBenchmarkCase,
  startBenchmarkMockServer,
} from "../../eval/tool-prompt-bench/codex-runner.js";
import { materializeWorkspace } from "../../eval/tool-prompt-bench/worlds/compile.js";
import type { ProjectContext } from "../../eval/tool-prompt-bench/worlds/world-schema.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "tdai-world-runner-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("shared World benchmark runner", () => {
  it("resolves both shared World cases and frozen legacy cases", () => {
    const worldCase = resolveBenchmarkCase("w01-memory-raw-wording");
    expect(worldCase.world?.worldId).toBe("W01");
    expect(worldCase.activeProject?.projectId).toBe("proxy-prompt");
    expect(worldCase.fixture.fixtureId).toBe("w01-world-fixture");

    const legacyCase = resolveBenchmarkCase("memory-dev-preference-001");
    expect(legacyCase.world).toBeUndefined();
    expect(legacyCase.activeProject).toBeUndefined();
    expect(legacyCase.fixture.fixtureId).toBe(legacyCase.item.fixtureIds[0]);
  });

  it("materializes only the active World project under its clean workspace root", () => {
    const runDir = temporaryDirectory();
    const resolvedCase = resolveBenchmarkCase("w01-memory-raw-wording");
    const prepared = prepareBenchmarkWorkspace(runDir, resolvedCase);
    const project = resolvedCase.activeProject;

    expect(project).toBeDefined();
    expect(prepared.workspaceDir).toBe(join(runDir, "workspace", project?.workspaceName ?? ""));
    expect(prepared.writtenFiles).toEqual(Object.keys(project?.files ?? {}));
    for (const [relativePath, content] of Object.entries(project?.files ?? {})) {
      const writtenPath = join(prepared.workspaceDir, relativePath);
      expect(readFileSync(writtenPath, "utf8")).toBe(`${content}\n`);
    }
  });

  it("routes World cases through the world-aware Knowledge bridge", async () => {
    const resolvedCase = resolveBenchmarkCase("w01-knowledge-callers");
    const resource = resolvedCase.world?.knowledge.find((candidate) => candidate.graph);
    expect(resource).toBeDefined();

    const server = await startBenchmarkMockServer(resolvedCase, {
      runId: "world-runner-test",
      sessionId: "world-runner-session",
    });
    try {
      const response = await fetch(`${server.baseUrl}/tools/list`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tdai-service-id": "w01",
        },
        body: JSON.stringify({ knowledge_id: resource?.knowledgeId }),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        data: {
          knowledge_id: resource?.knowledgeId,
          symbol_count: resource?.graph?.symbols.length,
          edge_count: resource?.graph?.edges.length,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("rejects malformed World file paths before writing outside the workspace", () => {
    const runDir = temporaryDirectory();
    const workspaceDir = join(runDir, "workspace");
    const project: ProjectContext = {
      projectId: "malformed-project",
      workspaceName: "malformed-project",
      repoSlug: "eval/malformed-project",
      taskDescription: "Reject path traversal.",
      summary: "Malformed fixture used by a containment test.",
      files: { "../escape.txt": "must not be written" },
    };

    expect(() => materializeWorkspace(project, workspaceDir)).toThrow(/workspace file escapes root/);
    expect(existsSync(join(runDir, "escape.txt"))).toBe(false);
  });
});
