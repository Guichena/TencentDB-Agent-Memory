import { describe, expect, it } from "vitest";

import { renderTdaiMemoryToolsBlock } from "../injection/injectors/tdai-tools-injector.js";
import {
  buildCapabilitySignature,
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
      expect(inventory.memberships.every((membership) => membership.planes.length > 0)).toBe(true);
      expect(compiled.units.map((unit) => unit.content).join("")).toBe(compiled.content);
      expect({
        content: compiled.content,
        contentSha256: compiled.contentSha256,
        unitContents: compiled.units.map((unit) => unit.content),
      }).toEqual(before);
    }
  });

  it("uses exact singleton membership for already-separated unit kinds", () => {
    const compiled = compileToolPrompt({
      profile: "selection-calibrated",
      family: "skill",
      surface: "skill-listing",
      legacyUnits: [
        {
          id: "skill-listing.policy",
          kind: "policy",
          content: "Choose only a clearly matching skill.\n",
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
        unitId: "skill-listing.policy",
        planes: ["decision"],
        exact: true,
      }),
      expect.objectContaining({
        unitId: "skill-listing.dynamic-assets",
        planes: ["runtime-binding"],
        exact: true,
      }),
    ]));
  });

  it("fails closed on mixed legacy units instead of pretending they have one owner", () => {
    const inventory = buildToolPromptPlaneInventory(compileMemory("selection-calibrated"));
    const legacyMemberships = inventory.memberships.filter(
      (membership) => membership.unitKind === "legacy-body",
    );

    expect(legacyMemberships.length).toBeGreaterThan(0);
    expect(legacyMemberships.every((membership) => !membership.exact)).toBe(true);
    expect(legacyMemberships.every((membership) =>
      membership.planes.join(",") === "decision,execution,runtime-binding"
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
      Object.isFrozen(membership) && Object.isFrozen(membership.planes)
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
});
