import { describe, expect, it } from "vitest";

import { renderKnowledgeToolsBlock } from "../injection/injectors/knowledge-tools-injector.js";
import { wrapAvailableSkillsBlock } from "../injection/injectors/skill-injector.js";
import { renderSkillToolsBlock } from "../injection/injectors/skill-tools-injector.js";
import { MEMORY_TOOLS_GUIDE } from "../injection/injectors/tdai-profile-memory-injector.js";
import { renderTdaiMemoryToolsBlock } from "../injection/injectors/tdai-tools-injector.js";
import {
  buildCapabilitySignature,
  buildToolPromptPlaneSourceMap,
  buildToolPromptPlaneInventory,
  compileToolPrompt,
} from "../injection/tool-prompt/index.js";

const capabilitySignature = buildCapabilitySignature({
  memory: true,
  skill: true,
  knowledge: true,
  wiki: true,
  codeGraph: true,
  skillWrite: false,
  skillExtract: false,
});

function compileMemory(profile: "contract-corrected" | "protocol-compact" | "compact" | "selection-calibrated" | "capability-pruned") {
  return compileToolPrompt({
    profile,
    family: "memory",
    surface: "memory-tools",
    legacyUnits: [{
      id: "memory-tools.legacy-body",
      kind: "legacy-body",
      content: renderTdaiMemoryToolsBlock(
        "http://127.0.0.1:8096",
        "session-c3p-parity",
        "space-c3p-parity",
      ),
    }],
    capabilitySignature,
  });
}

function productionSurfaceFixtures() {
  const knowledge = renderKnowledgeToolsBlock([{
    knowledge_id: "c3p-code-graph",
    type: "code-graph" as const,
    name: "MemoryProxy",
    summary: "Indexed repository",
    service_url: "http://127.0.0.1:8421/v3",
    team_id: "team-c3p",
    user_id: null,
    repo_url: "https://github.com/TencentDB/TencentDB-Agent-Memory.git",
    branch: "main",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  }], "space-c3p", { sessionKey: "session-c3p" });
  if (!knowledge) throw new Error("knowledge fixture must render");

  return [
    {
      family: "memory" as const,
      surface: "memory-tools" as const,
      content: renderTdaiMemoryToolsBlock(
        "http://127.0.0.1:8096",
        "session-c3p",
        "space-c3p",
      ),
    },
    { family: "memory" as const, surface: "memory-guide" as const, content: MEMORY_TOOLS_GUIDE },
    {
      family: "skill" as const,
      surface: "skill-tools" as const,
      content: renderSkillToolsBlock(
        "http://127.0.0.1:8096",
        false,
        "session-c3p",
        "space-c3p",
      ),
    },
    {
      family: "skill" as const,
      surface: "skill-listing" as const,
      content: wrapAvailableSkillsBlock(
        "<available_skills>\n- c3p-fixture\n</available_skills>",
      ),
    },
    { family: "knowledge" as const, surface: "knowledge-tools" as const, content: knowledge },
  ];
}

describe("C-3P-EQ three-plane inventory", () => {
  it("records every compiled unit in order without changing provider-visible bytes", () => {
    for (const profile of [
      "contract-corrected",
      "protocol-compact",
      "compact",
      "selection-calibrated",
      "capability-pruned",
    ] as const) {
      const compiled = compileMemory(profile);
      const before = {
        content: compiled.content,
        contentSha256: compiled.contentSha256,
        unitContents: compiled.units.map((unit) => unit.content),
      };

      const inventory = buildToolPromptPlaneInventory(compiled);

      expect(inventory.profile).toBe(profile);
      expect(inventory.contentSha256).toBe(compiled.contentSha256);
      expect(inventory.memberships.map((membership) => membership.unitId)).toEqual(
        compiled.units.map((unit) => unit.id),
      );
      expect(inventory.memberships.every((membership) => membership.possiblePlanes.length > 0)).toBe(true);
      expect(compiled.units.map((unit) => unit.content).join("")).toBe(compiled.content);
      expect({
        content: compiled.content,
        contentSha256: compiled.contentSha256,
        unitContents: compiled.units.map((unit) => unit.content),
      }).toEqual(before);
    }
  });

  it("inventories every production surface under every compiled profile without mutating bytes", () => {
    for (const profile of [
      "contract-corrected",
      "protocol-compact",
      "compact",
      "selection-calibrated",
      "capability-pruned",
    ] as const) {
      for (const fixture of productionSurfaceFixtures()) {
        const compiled = compileToolPrompt({
          profile,
          family: fixture.family,
          surface: fixture.surface,
          legacyUnits: [{
            id: `${fixture.surface}.legacy-body`,
            kind: "legacy-body",
            content: fixture.content,
          }],
          capabilitySignature,
        });
        const before = compiled.content;
        const inventory = buildToolPromptPlaneInventory(compiled);

        expect(inventory.surface).toBe(fixture.surface);
        expect(inventory.profile).toBe(profile);
        expect(inventory.memberships).toHaveLength(compiled.units.length);
        expect(compiled.content).toBe(before);
        expect(inventory.contentSha256).toBe(compiled.contentSha256);
      }
    }
  });

  it("uses exact singleton membership only for mechanically separated unit kinds", () => {
    const compiled = compileToolPrompt({
      profile: "selection-calibrated",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [
        {
          id: "skill-listing.execution",
          kind: "execution-grammar",
          content: "POST JSON through the bridge.\n",
        },
        {
          id: "skill-listing.dynamic-assets",
          kind: "dynamic-assets",
          content: "<available_skills>\n- test-skill\n</available_skills>\n",
          sourceSpecIds: [],
        },
      ],
      capabilitySignature,
    });

    const inventory = buildToolPromptPlaneInventory(compiled);
    expect(inventory.memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        unitId: "skill-listing.execution",
        possiblePlanes: ["execution"],
        exact: true,
      }),
      expect.objectContaining({
        unitId: "skill-listing.dynamic-assets",
        possiblePlanes: ["runtime-binding"],
        exact: true,
      }),
    ]));
  });

  it("keeps generic policy units mixed because production guides contain execution contracts", () => {
    const compiled = compileToolPrompt({
      profile: "contract-corrected",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [{ id: "skill-listing.policy", kind: "policy", content: "when: missing workflow\npath: /search\n" }],
      capabilitySignature,
    });
    expect(buildToolPromptPlaneInventory(compiled).memberships).toEqual([
      expect.objectContaining({
        unitId: "skill-listing.policy",
        possiblePlanes: ["decision", "execution"],
        exact: false,
      }),
    ]);
  });

  it("fails closed on mixed legacy units instead of pretending they have one owner", () => {
    const inventory = buildToolPromptPlaneInventory(compileMemory("selection-calibrated"));
    const legacyMemberships = inventory.memberships.filter(
      (membership) => membership.unitKind === "legacy-body",
    );

    expect(legacyMemberships.length).toBeGreaterThan(0);
    expect(legacyMemberships.every((membership) => !membership.exact)).toBe(true);
    expect(legacyMemberships.every((membership) =>
      membership.possiblePlanes.join(",") === "decision,execution,runtime-binding"
    )).toBe(true);
    expect(inventory.exactOwnership).toBe(false);
    expect(inventory.mixedUnitIds).toEqual(legacyMemberships.map((membership) => membership.unitId));
  });

  it("is deterministic, detached, recursively frozen, and rejects tampered compiler output", () => {
    const compiled = compileMemory("capability-pruned");
    const first = buildToolPromptPlaneInventory(compiled);
    const second = buildToolPromptPlaneInventory(compiled);

    expect(first).toEqual(second);
    expect(first.inventorySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.memberships)).toBe(true);
    expect(first.memberships.every((membership) =>
      Object.isFrozen(membership) && Object.isFrozen(membership.possiblePlanes)
    )).toBe(true);

    expect(() => buildToolPromptPlaneInventory({
      ...compiled,
      content: `${compiled.content}tampered`,
    })).toThrow(/content does not equal ordered PromptUnit bytes/u);
    expect(() => buildToolPromptPlaneInventory({
      ...compiled,
      contentSha256: "0".repeat(64),
    })).toThrow(/contentSha256 mismatch/u);
  });

  it("builds an exact global source map for already-separated units", () => {
    const compiled = compileToolPrompt({
      profile: "selection-calibrated",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [
        { id: "execution", kind: "execution-grammar", content: "POST JSON\n" },
        {
          id: "assets",
          kind: "dynamic-assets",
          content: "<available_skills>\n- skill-a\n</available_skills>\n",
          sourceSpecIds: [],
        },
      ],
      capabilitySignature,
    });

    const sourceMap = buildToolPromptPlaneSourceMap(compiled, []);
    expect(sourceMap.structuralCoverageExact).toBe(true);
    expect(sourceMap.semanticOwnershipAttested).toBe(false);
    expect(sourceMap.spans).toHaveLength(compiled.units.length);
    expect(sourceMap.spans.map((span) => span.plane)).toEqual([
      "execution",
      "runtime-binding",
    ]);
    expect(sourceMap.spans[0]).toMatchObject({
      unitId: "execution",
      unitByteStart: 0,
      promptByteStart: 0,
      promptByteEnd: Buffer.byteLength("POST JSON\n"),
    });
    expect(sourceMap.spans.at(-1)?.promptByteEnd).toBe(Buffer.byteLength(compiled.content));
    expect(sourceMap.sourceMapSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(sourceMap)).toBe(true);
    expect(Object.isFrozen(sourceMap.spans)).toBe(true);
    expect(sourceMap.spans.every(Object.isFrozen)).toBe(true);
    expect(buildToolPromptPlaneSourceMap(compiled, [])).toEqual(sourceMap);
  });

  it("rejects unknown, duplicate, and overlapping mixed-unit partitions", () => {
    const compiled = compileToolPrompt({
      profile: "contract-corrected",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [{ id: "mixed-card", kind: "tool-card", content: "abcd" }],
      capabilitySignature,
    });

    expect(() => buildToolPromptPlaneSourceMap(compiled, [{
      unitId: "unknown",
      spans: [],
    }])).toThrow(/unknown unit unknown/u);

    const partition = {
      unitId: "mixed-card",
      spans: [
        { plane: "decision" as const, byteStart: 0, byteEnd: 2, provenance: "test:decision" },
        { plane: "execution" as const, byteStart: 2, byteEnd: 4, provenance: "test:execution" },
      ],
    };
    expect(() => buildToolPromptPlaneSourceMap(compiled, [partition, partition]))
      .toThrow(/duplicate plane partition/u);
    expect(() => buildToolPromptPlaneSourceMap(compiled, [{
      unitId: "mixed-card",
      spans: [
        { plane: "decision", byteStart: 0, byteEnd: 3, provenance: "test:first" },
        { plane: "execution", byteStart: 2, byteEnd: 4, provenance: "test:overlap" },
      ],
    }])).toThrow(/gap or overlap/u);
  });

  it("requires explicit gap-free byte partitions for every mixed unit", () => {
    const compiled = compileMemory("selection-calibrated");
    const inventory = buildToolPromptPlaneInventory(compiled);
    const mixed = inventory.memberships.find((membership) => !membership.exact);
    expect(mixed).toBeDefined();
    const unit = compiled.units.find((candidate) => candidate.id === mixed?.unitId);
    if (!unit || !mixed) throw new Error("test requires one mixed unit");

    expect(() => buildToolPromptPlaneSourceMap(compiled, [])).toThrow(
      new RegExp(`mixed unit ${mixed.unitId} requires exact byte spans`, "u"),
    );

    const unitByteLength = Buffer.byteLength(unit.content);
    const split = Math.max(1, Math.floor(unitByteLength / 2));
    const boundaries = (content: string): number[] => {
      const result = [0];
      for (const char of content) result.push(result.at(-1)! + Buffer.byteLength(char));
      return result;
    };
    const sourceMap = buildToolPromptPlaneSourceMap(compiled, inventory.memberships
      .filter((membership) => !membership.exact)
      .map((membership) => {
        const target = compiled.units.find((candidate) => candidate.id === membership.unitId);
        if (!target) throw new Error("missing mixed unit");
        const points = boundaries(target.content);
        if (points.length <= membership.possiblePlanes.length) throw new Error("mixed unit too short");
        const cuts = membership.possiblePlanes.map((_, index) =>
          index === membership.possiblePlanes.length - 1 ? points.at(-1)! : points[index + 1]
        );
        let start = 0;
        return {
          unitId: membership.unitId,
          spans: membership.possiblePlanes.map((plane, index) => {
            const end = cuts[index];
            const span = {
              plane,
              byteStart: start,
              byteEnd: end,
              provenance: `test:structural-${plane}`,
            };
            start = end;
            return span;
          }),
        };
      }));
    expect(sourceMap.structuralCoverageExact).toBe(true);
    expect(sourceMap.semanticOwnershipAttested).toBe(false);
    expect(sourceMap.spans.filter((span) => span.unitId === unit.id)).toHaveLength(
      mixed.possiblePlanes.length,
    );
    expect(sourceMap.spans.at(-1)?.promptByteEnd).toBe(Buffer.byteLength(compiled.content));

    expect(() => buildToolPromptPlaneSourceMap(compiled, [{
      unitId: mixed.unitId,
      spans: [
        { plane: "decision", byteStart: 0, byteEnd: split, provenance: "test:first" },
        {
          plane: "execution",
          byteStart: split + 1,
          byteEnd: unitByteLength,
          provenance: "test:gap",
        },
      ],
    }])).toThrow(/gap or overlap/u);
  });

  it("records UTF-8 byte offsets independently from JavaScript text offsets", () => {
    const compiled = compileToolPrompt({
      profile: "contract-corrected",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [{ id: "unicode-execution", kind: "execution-grammar", content: "路径A\n" }],
      capabilitySignature,
    });
    const sourceMap = buildToolPromptPlaneSourceMap(compiled, []);
    expect(sourceMap.spans).toEqual([
      expect.objectContaining({
        unitByteStart: 0,
        unitByteEnd: Buffer.byteLength("路径A\n"),
        promptByteEnd: Buffer.byteLength(compiled.content),
      }),
    ]);
  });

  it("rejects a span plane outside the mixed unit membership", () => {
    const compiled = compileToolPrompt({
      profile: "contract-corrected",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [{ id: "mixed-card", kind: "tool-card", content: "abcd" }],
      capabilitySignature,
    });
    expect(() => buildToolPromptPlaneSourceMap(compiled, [{
      unitId: "mixed-card",
      spans: [{
        plane: "runtime-binding",
        byteStart: 0,
        byteEnd: 4,
        provenance: "test:invalid-plane",
      }],
    }])).toThrow(/outside its possible plane set/u);
  });

  it("rejects UTF-8 splits and partitions that omit a declared plane", () => {
    const compiled = compileToolPrompt({
      profile: "contract-corrected",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [{ id: "mixed-card", kind: "tool-card", content: "你A" }],
      capabilitySignature,
    });
    const byteLength = Buffer.byteLength(compiled.content);

    expect(() => buildToolPromptPlaneSourceMap(compiled, [{
      unitId: "mixed-card",
      spans: [
        { plane: "decision", byteStart: 0, byteEnd: 1, provenance: "test:split-codepoint" },
        { plane: "execution", byteStart: 1, byteEnd: byteLength, provenance: "test:remainder" },
      ],
    }])).toThrow(/invalid UTF-8 boundary/u);

    expect(() => buildToolPromptPlaneSourceMap(compiled, [{
      unitId: "mixed-card",
      spans: [{
        plane: "decision",
        byteStart: 0,
        byteEnd: byteLength,
        provenance: "test:missing-execution",
      }],
    }])).toThrow(/do not cover declared planes: execution/u);
  });

  it("allows zero-byte mixed units because they own no provider-visible bytes", () => {
    const compiled = compileToolPrompt({
      profile: "contract-corrected",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [
        { id: "empty-card", kind: "tool-card", content: "" },
        { id: "execution", kind: "execution-grammar", content: "POST\n", sourceSpecIds: [] },
      ],
      capabilitySignature,
    });
    const sourceMap = buildToolPromptPlaneSourceMap(compiled, []);
    expect(sourceMap.structuralCoverageExact).toBe(true);
    expect(sourceMap.spans).toEqual([
      expect.objectContaining({ unitId: "execution", plane: "execution" }),
    ]);
  });

  it("binds inventory identity to compiler, lineage, contracts, specs, and unit provenance", () => {
    const compiled = compileMemory("capability-pruned");
    const base = buildToolPromptPlaneInventory(compiled);
    const contractDrift = buildToolPromptPlaneInventory({
      ...compiled,
      contractIds: [...compiled.contractIds, "drift-contract"],
    });
    const provenanceDrift = buildToolPromptPlaneInventory({
      ...compiled,
      units: compiled.units.map((unit, index) => index === 0
        ? { ...unit, sourceSpecIds: [...unit.sourceSpecIds, "drift-spec"] }
        : unit),
    });

    expect(contractDrift.inventorySha256).not.toBe(base.inventorySha256);
    expect(provenanceDrift.inventorySha256).not.toBe(base.inventorySha256);
  });
});
