import { describe, expect, it } from "vitest";

import {
  evaluateFormalExecutionPreflight,
  type FormalExecutionPreflightInput,
} from "../../eval/tool-prompt-bench/formal-execution-preflight.js";

const VISIBLE_ASSET_SET_SHA256 =
  "4bc4f16956d42fab61e3ec2bbba32a7a3200f8f78b1cc4f0089c20b123f1e455";
const L0_READ_BACK_SHA256 = "c".repeat(64);
const L1_READ_BACK_SHA256 = "d".repeat(64);
const L2_READ_BACK_SHA256 = "e".repeat(64);
const L3_READ_BACK_SHA256 = "f".repeat(64);
const SKILL_READ_BACK_SHA256 = "1".repeat(64);
const KNOWLEDGE_READ_BACK_SHA256 = "2".repeat(64);
const RUNTIME_ASSET_OBSERVATION_IDENTITY = {
  serviceId: "space-runtime-a",
  resolvedUserId: "auth-user-a",
  teamId: "team-runtime-a",
  agentId: "agent-runtime-a",
} as const;

function validInput(): FormalExecutionPreflightInput {
  return {
    expected: {
      datasetUserId: "dataset-user-a",
      spaceId: "space-a",
      teamId: "team-a",
      agentId: "agent-a",
      taskId: "task-a",
      sessionId: "session-opaque-a",
      agentSource: "codex",
      visibleAssetSetSha256: VISIBLE_ASSET_SET_SHA256,
    },
    identityMapping: {
      sourceArtifactSha256: "a".repeat(64),
      logicalIdentity: {
        datasetUserId: "dataset-user-a",
        spaceId: "space-a",
        teamId: "team-a",
        agentId: "agent-a",
        taskId: "task-a",
      },
      runtimeIdentity: {
        resolvedAuthUserId: "auth-user-a",
        spaceId: "space-runtime-a",
        teamId: "team-runtime-a",
        agentId: "agent-runtime-a",
        taskId: "task-runtime-a",
      },
      assetLocators: [
        {
          logicalAssetId: "memory-l0-a",
          family: "memory",
          subtype: "l0",
          runtimeLocator: {
            kind: "conversation-message",
            sessionId: "runtime-conversation-a",
            messageIds: ["runtime-message-1", "runtime-message-2"],
          },
          readBackReceiptSha256: L0_READ_BACK_SHA256,
        },
        {
          logicalAssetId: "memory-l1-a",
          family: "memory",
          subtype: "l1",
          runtimeLocator: { kind: "asset-id", assetId: "runtime-memory-l1-a" },
          readBackReceiptSha256: L1_READ_BACK_SHA256,
        },
        {
          logicalAssetId: "memory-l2-a",
          family: "memory",
          subtype: "l2",
          runtimeLocator: { kind: "scenario-path", path: "runtime/scenario/a" },
          readBackReceiptSha256: L2_READ_BACK_SHA256,
        },
        {
          logicalAssetId: "memory-l3-a",
          family: "memory",
          subtype: "l3",
          runtimeLocator: {
            kind: "core-scope",
            spaceId: "space-runtime-a",
            teamId: "team-runtime-a",
            userId: "auth-user-a",
            agentId: "agent-runtime-a",
          },
          readBackReceiptSha256: L3_READ_BACK_SHA256,
        },
        {
          logicalAssetId: "skill-a",
          family: "skill",
          subtype: "skill",
          runtimeLocator: { kind: "asset-id", assetId: "runtime-skill-a" },
          readBackReceiptSha256: SKILL_READ_BACK_SHA256,
        },
        {
          logicalAssetId: "knowledge-a",
          family: "knowledge",
          subtype: "wiki",
          runtimeLocator: { kind: "asset-id", assetId: "runtime-knowledge-a" },
          readBackReceiptSha256: KNOWLEDGE_READ_BACK_SHA256,
        },
      ],
    },
    authVerify: {
      serviceId: "space-runtime-a",
      httpStatus: 200,
      envelopeCode: 0,
      responseValid: true,
      resolvedUserId: "auth-user-a",
    },
    metadata: {
      serviceId: "space-runtime-a",
      resolvedUserId: "auth-user-a",
      httpStatus: 200,
      envelopeCode: 0,
      teams: [{
        teamId: "team-runtime-a",
        agentIds: ["agent-runtime-a", "agent-runtime-distractor"],
        taskIds: ["task-runtime-a", "task-runtime-distractor"],
      }],
    },
    session: {
      request: {
        sessionId: "session-opaque-a",
        spaceId: "space-runtime-a",
        teamId: "team-runtime-a",
        userId: "auth-user-a",
        agentId: "agent-runtime-a",
        taskId: "task-runtime-a",
        agentSource: "codex",
      },
      response: {
        httpStatus: 200,
        envelopeCode: 0,
        sessionId: "session-opaque-a",
        spaceId: "space-runtime-a",
        teamId: "team-runtime-a",
        userId: "auth-user-a",
        agentId: "agent-runtime-a",
        taskId: "task-runtime-a",
        agentSource: "codex",
      },
    },
    assetInventory: {
      sources: [
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "memory",
          requestPath: "/v3/conversation/query",
          httpStatus: 200,
          envelopeCode: 0,
          contentSha256: "3".repeat(64),
          receiptSha256: L0_READ_BACK_SHA256,
          items: [{
            subtype: "l0",
            runtimeLocator: {
              kind: "conversation-message",
              sessionId: "runtime-conversation-a",
              messageIds: ["runtime-message-1", "runtime-message-2"],
            },
          }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "memory",
          requestPath: "/v3/atomic/query",
          httpStatus: 200,
          envelopeCode: 0,
          contentSha256: "4".repeat(64),
          receiptSha256: L1_READ_BACK_SHA256,
          items: [{ subtype: "l1", runtimeLocator: { kind: "asset-id", assetId: "runtime-memory-l1-a" } }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "memory",
          requestPath: "/v3/scenario/read",
          httpStatus: 200,
          envelopeCode: 0,
          contentSha256: "5".repeat(64),
          receiptSha256: L2_READ_BACK_SHA256,
          items: [{ subtype: "l2", runtimeLocator: { kind: "scenario-path", path: "runtime/scenario/a" } }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "memory",
          requestPath: "/v3/core/read",
          httpStatus: 200,
          envelopeCode: 0,
          contentSha256: "6".repeat(64),
          receiptSha256: L3_READ_BACK_SHA256,
          items: [{
            subtype: "l3",
            runtimeLocator: {
              kind: "core-scope",
              spaceId: "space-runtime-a",
              teamId: "team-runtime-a",
              userId: "auth-user-a",
              agentId: "agent-runtime-a",
            },
          }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "skill",
          requestPath: "/v3/skill/listing",
          httpStatus: 200,
          envelopeCode: 0,
          contentSha256: "7".repeat(64),
          receiptSha256: SKILL_READ_BACK_SHA256,
          items: [{ subtype: "skill", runtimeLocator: { kind: "asset-id", assetId: "runtime-skill-a" } }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "knowledge",
          requestPath: "/v3/meta/agent-fixed-asset/list-with-detail",
          httpStatus: 200,
          envelopeCode: 0,
          contentSha256: "8".repeat(64),
          receiptSha256: KNOWLEDGE_READ_BACK_SHA256,
          items: [{ subtype: "wiki", runtimeLocator: { kind: "asset-id", assetId: "runtime-knowledge-a" } }],
        },
      ],
    },
    effectiveWriteConfig: {
      configFingerprintSha256: "b".repeat(64),
      extractionEnabled: false,
      extractionExtractorIds: [],
      tdaiL0WriteEnabled: false,
      skillLlmWriteEnabled: false,
      analyseMarkerEnabled: false,
      assetReflectionEnabled: false,
      archiveWriteBackEnabled: false,
    },
    sessionNamespace: {
      sessionId: "session-opaque-a",
      preRegistrationLookups: [
        { layer: "l1", matchedSessionIds: [] },
        { layer: "l2a", matchedSessionIds: [] },
        { layer: "l2b", matchedSessionIds: [] },
        { layer: "history-scan", matchedSessionIds: [] },
      ],
    },
  };
}

describe("formal execution identity and asset preflight", () => {
  it("emits a ready receipt only from mutually consistent source observations", () => {
    const receipt = evaluateFormalExecutionPreflight(validInput());

    expect(receipt).toEqual({
      schemaVersion: "task1.formal-execution-preflight-receipt.v1",
      ready: true,
      logicalIdentity: {
        datasetUserId: "dataset-user-a",
        spaceId: "space-a",
        teamId: "team-a",
        agentId: "agent-a",
        taskId: "task-a",
      },
      runtimeIdentity: {
        resolvedAuthUserId: "auth-user-a",
        spaceId: "space-runtime-a",
        teamId: "team-runtime-a",
        agentId: "agent-runtime-a",
        taskId: "task-runtime-a",
      },
      sessionId: "session-opaque-a",
      agentSource: "codex",
      visibleAssetSetSha256: VISIBLE_ASSET_SET_SHA256,
      visibleAssetCount: 6,
      identityMappingSourceSha256: "a".repeat(64),
      effectiveConfigSha256: "b".repeat(64),
      assetReadBackReceipts: [
        { receiptSha256: "1".repeat(64), contentSha256: "7".repeat(64) },
        { receiptSha256: "2".repeat(64), contentSha256: "8".repeat(64) },
        { receiptSha256: "c".repeat(64), contentSha256: "3".repeat(64) },
        { receiptSha256: "d".repeat(64), contentSha256: "4".repeat(64) },
        { receiptSha256: "e".repeat(64), contentSha256: "5".repeat(64) },
        { receiptSha256: "f".repeat(64), contentSha256: "6".repeat(64) },
      ],
      checks: [
        { id: "auth-user-mapping", status: "pass" },
        { id: "metadata-identity", status: "pass" },
        { id: "session-identity", status: "pass" },
        { id: "visible-assets", status: "pass" },
        { id: "write-side-disabled", status: "pass" },
        { id: "fresh-session-namespace", status: "pass" },
      ],
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.logicalIdentity)).toBe(true);
    expect(Object.isFrozen(receipt.runtimeIdentity)).toBe(true);
    expect(Object.isFrozen(receipt.assetReadBackReceipts)).toBe(true);
    expect(receipt.assetReadBackReceipts.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(receipt.checks)).toBe(true);
    expect(receipt.checks.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    {
      name: "an unexpected extra asset",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        {
          ...sources[0],
          items: [
            ...sources[0].items,
            { subtype: "l1", runtimeLocator: { kind: "asset-id" as const, assetId: "runtime-extra" } },
          ],
        },
        ...sources.slice(1),
      ],
    },
    {
      name: "a duplicate within one response",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        { ...sources[0], items: [...sources[0].items, sources[0].items[0]] },
        ...sources.slice(1),
      ],
    },
    {
      name: "a duplicate across response sources",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        sources[0],
        sources[1],
        sources[2],
        sources[3],
        { ...sources[4], items: [...sources[4].items, sources[1].items[0]] },
        sources[5],
      ],
    },
    {
      name: "an HTTP failure",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        sources[0],
        { ...sources[1], httpStatus: 503 },
        ...sources.slice(2),
      ],
    },
    {
      name: "a business-envelope failure",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        sources[0],
        sources[1],
        { ...sources[2], envelopeCode: 50001 },
        ...sources.slice(3),
      ],
    },
    {
      name: "a write endpoint presented as read-back evidence",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        { ...sources[0], requestPath: "/v3/conversation/add" },
        ...sources.slice(1),
      ],
    },
    {
      name: "a read-back request under a different runtime Team",
      change: (sources: FormalExecutionPreflightInput["assetInventory"]["sources"]) => [
        { ...sources[0], teamId: "team-runtime-other" },
        ...sources.slice(1),
      ],
    },
  ])("fails visible-assets for $name", ({ change }) => {
    const input = validInput();
    const receipt = evaluateFormalExecutionPreflight({
      ...input,
      assetInventory: {
        ...input.assetInventory,
        sources: change(input.assetInventory.sources),
      },
    });

    expect(receipt.ready).toBe(false);
    expect(receipt.checks).toContainEqual({ id: "visible-assets", status: "fail" });
  });

  it("fails when a logical asset locator is not bound to the observed read-back receipt", () => {
    const input = validInput();
    const receipt = evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: {
        ...input.identityMapping,
        assetLocators: input.identityMapping.assetLocators.map((mapping) => (
          mapping.logicalAssetId === "memory-l1-a"
            ? { ...mapping, readBackReceiptSha256: "9".repeat(64) }
            : mapping
        )),
      },
    });

    expect(receipt.ready).toBe(false);
    expect(receipt.checks).toContainEqual({ id: "visible-assets", status: "fail" });
  });

  it("fails identity mapping when any logical identity differs from the frozen binding", () => {
    const input = validInput();
    const receipt = evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: {
        ...input.identityMapping,
        logicalIdentity: { ...input.identityMapping.logicalIdentity, taskId: "task-logical-other" },
      },
    });

    expect(receipt.ready).toBe(false);
    expect(receipt.checks).toContainEqual({ id: "auth-user-mapping", status: "fail" });
  });

  it("fails every independent Gate on contradictory observations despite caller verdict fields", () => {
    const input = validInput();
    const receipt = evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: {
        ...input.identityMapping,
        runtimeIdentity: {
          ...input.identityMapping.runtimeIdentity,
          resolvedAuthUserId: "auth-user-other",
        },
        ready: true,
      } as FormalExecutionPreflightInput["identityMapping"],
      metadata: {
        ...input.metadata,
        teams: [{
          teamId: "team-runtime-a",
          agentIds: ["agent-runtime-other"],
          taskIds: ["task-runtime-a"],
        }],
        ready: true,
      } as FormalExecutionPreflightInput["metadata"],
      session: {
        ...input.session,
        response: { ...input.session.response, taskId: "task-runtime-other" },
        ready: true,
      } as FormalExecutionPreflightInput["session"],
      assetInventory: {
        ...input.assetInventory,
        sources: input.assetInventory.sources.slice(0, 2),
        ready: true,
      } as FormalExecutionPreflightInput["assetInventory"],
      effectiveWriteConfig: {
        ...input.effectiveWriteConfig,
        tdaiL0WriteEnabled: true,
        writeSideDisabled: true,
      } as FormalExecutionPreflightInput["effectiveWriteConfig"],
      sessionNamespace: {
        ...input.sessionNamespace,
        preRegistrationLookups: input.sessionNamespace.preRegistrationLookups.map((lookup) => (
          lookup.layer === "l2b"
            ? { ...lookup, matchedSessionIds: ["session-opaque-a"] }
            : lookup
        )),
        fresh: true,
      } as FormalExecutionPreflightInput["sessionNamespace"],
    });

    expect(receipt.ready).toBe(false);
    expect(receipt.checks).toEqual([
      { id: "auth-user-mapping", status: "fail" },
      { id: "metadata-identity", status: "fail" },
      { id: "session-identity", status: "fail" },
      { id: "visible-assets", status: "fail" },
      { id: "write-side-disabled", status: "fail" },
      { id: "fresh-session-namespace", status: "fail" },
    ]);
  });

  it("does not read or retain an attached credential field", () => {
    const input = validInput();
    for (const observed of [
      input.authVerify,
      input.identityMapping.logicalIdentity,
      input.identityMapping.runtimeIdentity,
      input.session.request,
      input.session.response,
      input.assetInventory.sources[0],
      input.assetInventory.sources[0].items[0].runtimeLocator,
      input.effectiveWriteConfig,
      input.sessionNamespace.preRegistrationLookups[0],
    ]) {
      Object.defineProperty(observed, "Authorization", {
        enumerable: true,
        get(): never {
          throw new Error("secret getter must not be read");
        },
      });
    }

    const receipt = evaluateFormalExecutionPreflight(input);

    expect(receipt.ready).toBe(true);
    expect(JSON.stringify(receipt)).not.toMatch(/userKey|Authorization|sk-mem|secret/u);
  });

  it("rejects a non-hash identity-mapping source receipt", () => {
    const input = validInput();

    expect(() => evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: { ...input.identityMapping, sourceArtifactSha256: "not-a-hash" },
    })).toThrow(/identityMapping\.sourceArtifactSha256 must be a SHA-256/u);
  });

  it("rejects a read-back observation without an exact response-content hash", () => {
    const input = validInput();
    expect(() => evaluateFormalExecutionPreflight({
      ...input,
      assetInventory: {
        ...input.assetInventory,
        sources: [
          { ...input.assetInventory.sources[0], contentSha256: "missing" },
          ...input.assetInventory.sources.slice(1),
        ],
      },
    })).toThrow(/contentSha256 must be a SHA-256/u);
  });
});
