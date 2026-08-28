import { describe, expect, it } from "vitest";
import {
  assertFormalReadOnlyRuntimePolicy,
  assertSnapshotDeterminism,
  canonicalJson,
  canonicalSha256,
  FORMAL_READ_ONLY_RUNTIME_POLICY,
  freezeWorldSnapshot,
} from "../../eval/tool-prompt-bench/worlds/formal-snapshot.js";
import { resolveVisibleSnapshot } from "../../eval/tool-prompt-bench/worlds/formal-visibility.js";
import type { FormalWorldContract } from "../../eval/tool-prompt-bench/worlds/formal-schema.js";

const contract = {
  world: { spaceId: "space" }, teams: [{ teamId: "team" }],
  businessAgents: [{ agentId: "agent", teamId: "team", importedMemoryAgentIds: [], boundSkillIds: [], fixedKnowledgeIds: ["k"] }],
  tasks: [{ taskId: "task", teamId: "team", eligibleAgentIds: ["agent"] }],
  assets: {
    l0Conversations: [],
    l1Memories: [{ assetId: "m", ownerAgentId: "agent" }],
    l2Scenes: [], l3Profiles: [],
    skills: [{ assetId: "s", ownerAgentId: "agent", visibility: "private" }],
    knowledge: [{ assetId: "k", ownerAgentId: "agent", bindings: [{ agentId: "agent", visibility: "fixed" }] }],
  },
} as unknown as FormalWorldContract;

describe("Formal V2 snapshots", () => {
  it("canonicalizes key order and produces deterministic snapshot hashes", () => {
    expect(canonicalJson({ z: [2, 1], a: { y: true, b: null } })).toBe('{"a":{"b":null,"y":true},"z":[2,1]}');
    expect(canonicalSha256({ b: 2, a: 1 })).toBe(canonicalSha256({ a: 1, b: 2 }));
    const build = () => freezeWorldSnapshot({
      snapshotId: "snapshot-1", sourcePackHash: "source-hash",
      visibleAssets: resolveVisibleSnapshot(contract, { spaceId: "space", teamId: "team", userId: "user", agentId: "agent", taskId: "task" }),
      workspace: { files: { "src/a.ts": "export const a = 1;" }, repo: "example/repo" },
      overlay: { mounts: ["docs"] }, injection: { textSha256: "injection-hash", tokenCount: 10 },
      resetRecipe: { method: "restore", version: 1 },
    });
    expect(assertSnapshotDeterminism(build).snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects write, extract, reflection, archive/write-back, and reset drift", () => {
    expect(() => assertFormalReadOnlyRuntimePolicy({ ...FORMAL_READ_ONLY_RUNTIME_POLICY, allowLlmExtract: true } as never)).toThrow(/allowLlmExtract=false/);
    expect(() => assertFormalReadOnlyRuntimePolicy({ ...FORMAL_READ_ONLY_RUNTIME_POLICY, assetReflection: true } as never)).toThrow(/assetReflection=false/);
    expect(() => assertFormalReadOnlyRuntimePolicy({ ...FORMAL_READ_ONLY_RUNTIME_POLICY, archiveWriteBack: true } as never)).toThrow(/archiveWriteBack=false/);
    expect(() => assertFormalReadOnlyRuntimePolicy({ ...FORMAL_READ_ONLY_RUNTIME_POLICY, resetSnapshotBeforeCase: false } as never)).toThrow(/resetSnapshotBeforeCase=true/);
  });
});
