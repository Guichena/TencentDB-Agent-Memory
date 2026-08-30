import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createServerTeamRequirementResolver,
  discoverFrozenSkillPackageRoots,
  ServerTeamRequirementError,
} from "../../eval/tool-prompt-bench/formal-assets/server-team-production-requirements.js";
import type {
  RestorePlanRequirement,
  RuntimeValueRef,
} from "../../eval/tool-prompt-bench/formal-assets/restore-plan-contract.js";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/formal-runtime/canonical.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requirement(
  requirementId: string,
  kind: RestorePlanRequirement["kind"],
  input: Partial<RestorePlanRequirement> = {},
): RestorePlanRequirement {
  return {
    requirementId,
    kind,
    blocking: true,
    reason: "test requirement",
    ...input,
  };
}

const ref = ($runtimeRef: string, logicalId: string, actionId?: string): RuntimeValueRef => ({
  $runtimeRef,
  logicalId,
  ...(actionId ? { actionId } : {}),
});

function mappingRequirementId(prefix: string, logicalId: string): string {
  return `${prefix}-${canonicalSha256({ prefix, logicalId }).slice(0, 20)}`;
}

describe("server_team production requirements", () => {
  it("verifies Space and auth-user mappings without serializing mapped values", async () => {
    const resolver = createServerTeamRequirementResolver({
      serviceIdsByDatasetSpaceId: { "SPACE-01": "runtime-service" },
      authUserIdsByDatasetUserId: { "USER-01": "runtime-user" },
      skillPackageRoots: [],
      importMemoryL1: vi.fn(),
      importMemoryL2: vi.fn(),
    });

    const space = await resolver(
      requirement(mappingRequirementId("require-space-service", "SPACE-01"), "space_service_mapping"),
      { resolve: (value) => value },
    );
    const user = await resolver(
      requirement(mappingRequirementId("require-auth-user", "USER-01"), "auth_user_mapping"),
      { resolve: (value) => value },
    );

    expect(space).toEqual({
      values: {},
      evidence: { mapping: "space_service", datasetId: "SPACE-01", verified: true },
    });
    expect(user).toEqual({
      values: {},
      evidence: { mapping: "auth_user", datasetId: "USER-01", verified: true },
    });
    expect(JSON.stringify([space, user])).not.toContain("runtime-service");
    expect(JSON.stringify([space, user])).not.toContain("runtime-user");
  });

  it("passes resolved L1/L2 payloads and isolation to the deployment import hooks", async () => {
    const importMemoryL1 = vi.fn(async () => ({ imported: true, contentSha256: "1".repeat(64) }));
    const importMemoryL2 = vi.fn(async () => ({ imported: true, contentSha256: "2".repeat(64) }));
    const resolver = createServerTeamRequirementResolver({
      serviceIdsByDatasetSpaceId: {},
      authUserIdsByDatasetUserId: {},
      skillPackageRoots: [],
      importMemoryL1,
      importMemoryL2,
    });
    const runtimeValues: Record<string, string> = {
      runtime_team_id: "team-runtime",
      resolved_auth_user_id: "user-runtime",
      runtime_agent_id: "agent-runtime",
    };
    const resolve = <T>(value: T): T => {
      const walk = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(walk);
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.$runtimeRef === "string") return runtimeValues[record.$runtimeRef];
          return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, walk(child)]));
        }
        return item;
      };
      return walk(value) as T;
    };
    const isolation = {
      team_id: ref("runtime_team_id", "TEAM-01", "team-create"),
      user_id: ref("resolved_auth_user_id", "USER-01"),
      agent_id: ref("runtime_agent_id", "AGENT-01", "agent-create"),
    };
    const l1 = requirement("req-l1", "memory_l1_import", {
      formalAssetId: "MEM-L1",
      expectedAssetContentHash: "1".repeat(64),
      runtimeIsolation: isolation,
      importPayload: { id: "MEM-L1", content: "remember this" },
    });
    const l2 = requirement("req-l2", "memory_l2_import", {
      formalAssetId: "MEM-L2",
      expectedAssetContentHash: "2".repeat(64),
      runtimeIsolation: isolation,
      importPayload: { path: "scenes/a.md", content: "scene" },
    });

    expect(await resolver(l1, { resolve })).toEqual({
      values: {},
      evidence: { imported: true, contentSha256: "1".repeat(64) },
    });
    expect(await resolver(l2, { resolve })).toEqual({
      values: {},
      evidence: { imported: true, contentSha256: "2".repeat(64) },
    });
    expect(importMemoryL1).toHaveBeenCalledWith({
      requirementId: "req-l1",
      formalAssetId: "MEM-L1",
      expectedAssetContentHash: "1".repeat(64),
      isolation: {
        team_id: "team-runtime",
        user_id: "user-runtime",
        agent_id: "agent-runtime",
      },
      payload: { id: "MEM-L1", content: "remember this" },
    });
    expect(importMemoryL2).toHaveBeenCalledWith(expect.objectContaining({
      requirementId: "req-l2",
      payload: { path: "scenes/a.md", content: "scene" },
    }));
  });

  it("loads a hash-matched frozen Skill package and keeps bytes out of evidence", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "task1-skill-package-"));
    tempRoots.push(packageRoot);
    await mkdir(join(packageRoot, "references"), { recursive: true });
    const entry = "---\nname: demo\ndescription: demo\n---\n# Demo\n";
    const resource = "reference text\n";
    await writeFile(join(packageRoot, "SKILL.md"), entry, "utf8");
    await writeFile(join(packageRoot, "references", "a.md"), resource, "utf8");

    const resolver = createServerTeamRequirementResolver({
      serviceIdsByDatasetSpaceId: {},
      authUserIdsByDatasetUserId: {},
      skillPackageRoots: [packageRoot],
      importMemoryL1: vi.fn(),
      importMemoryL2: vi.fn(),
    });
    const result = await resolver(requirement("req-skill", "skill_package_bytes", {
      formalAssetId: "SKILL-01",
      manifest: [
        { path: "SKILL.md", sha256: sha256(entry) },
        { path: "references/a.md", sha256: sha256(resource) },
      ],
    }), { resolve: (value) => value });

    expect(result.values).toEqual({
      verified_skill_entry_content: entry,
      verified_skill_resources: [{
        path: "references/a.md",
        content: resource,
        encoding: "utf-8",
      }],
    });
    expect(result.evidence).toEqual({
      formalAssetId: "SKILL-01",
      manifestEntries: 2,
      matchedRootIndex: 0,
      manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(result.evidence)).not.toContain(entry);
    expect(JSON.stringify(result.evidence)).not.toContain(resource);
  });

  it("fails closed when Skill bytes do not match or an obsolete Knowledge snapshot requirement appears", async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "task1-skill-package-"));
    tempRoots.push(packageRoot);
    await writeFile(join(packageRoot, "SKILL.md"), "wrong", "utf8");
    const resolver = createServerTeamRequirementResolver({
      serviceIdsByDatasetSpaceId: {},
      authUserIdsByDatasetUserId: {},
      skillPackageRoots: [packageRoot],
      importMemoryL1: vi.fn(),
      importMemoryL2: vi.fn(),
    });

    await expect(resolver(requirement("req-skill", "skill_package_bytes", {
      formalAssetId: "SKILL-01",
      manifest: [{ path: "SKILL.md", sha256: sha256("expected") }],
    }), { resolve: (value) => value })).rejects.toMatchObject({
      code: "SKILL_PACKAGE_NOT_FOUND",
      requirementId: "req-skill",
    });

    await expect(resolver(requirement(
      "req-knowledge",
      "knowledge_snapshot_import",
    ), { resolve: (value) => value })).rejects.toBeInstanceOf(ServerTeamRequirementError);
  });

  it("discovers only adapted Skill package roots from a frozen data checkout", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "task1-data-root-"));
    tempRoots.push(dataRoot);
    const adapted = join(
      dataRoot,
      "MemoryProxy",
      "eval",
      "tool-prompt-bench",
      "formal-dataset",
      "source-material",
      "T01",
      "skills",
      "demo",
      "adapted",
    );
    const raw = join(
      dataRoot,
      "MemoryProxy",
      "eval",
      "tool-prompt-bench",
      "formal-dataset",
      "source-material",
      "T01",
      "skills",
      "demo",
      "raw",
    );
    await mkdir(adapted, { recursive: true });
    await mkdir(raw, { recursive: true });
    await writeFile(join(adapted, "SKILL.md"), "adapted", "utf8");
    await writeFile(join(raw, "SKILL.md"), "raw", "utf8");

    await expect(discoverFrozenSkillPackageRoots(dataRoot)).resolves.toEqual([adapted]);
  });
});
