import { describe, expect, it } from "vitest";

import {
  evaluateFormalExecutionPreflight,
  type FormalExecutionPreflightInput,
} from "../../eval/tool-prompt-bench/formal-execution-preflight.js";

const VISIBLE_ASSET_SET_SHA256 =
  "4bc4f16956d42fab61e3ec2bbba32a7a3200f8f78b1cc4f0089c20b123f1e455";
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
        },
        {
          logicalAssetId: "memory-l1-a",
          family: "memory",
          subtype: "l1",
          runtimeLocator: { kind: "asset-id", assetId: "runtime-memory-l1-a" },
        },
        {
          logicalAssetId: "memory-l2-a",
          family: "memory",
          subtype: "l2",
          runtimeLocator: { kind: "scenario-path", path: "runtime/scenario/a" },
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
        },
        {
          logicalAssetId: "skill-a",
          family: "skill",
          subtype: "skill",
          runtimeLocator: { kind: "asset-id", assetId: "runtime-skill-a" },
        },
        {
          logicalAssetId: "knowledge-a",
          family: "knowledge",
          subtype: "wiki",
          runtimeLocator: { kind: "asset-id", assetId: "runtime-knowledge-a" },
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
          items: [{ subtype: "l1", runtimeLocator: { kind: "asset-id", assetId: "runtime-memory-l1-a" } }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "memory",
          requestPath: "/v3/scenario/read",
          httpStatus: 200,
          envelopeCode: 0,
          items: [{ subtype: "l2", runtimeLocator: { kind: "scenario-path", path: "runtime/scenario/a" } }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "memory",
          requestPath: "/v3/core/read",
          httpStatus: 200,
          envelopeCode: 0,
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
          items: [{ subtype: "skill", runtimeLocator: { kind: "asset-id", assetId: "runtime-skill-a" } }],
        },
        {
          ...RUNTIME_ASSET_OBSERVATION_IDENTITY,
          family: "knowledge",
          requestPath: "/v3/meta/agent-fixed-asset/list-with-detail",
          httpStatus: 200,
          envelopeCode: 0,
          items: [{ subtype: "wiki", runtimeLocator: { kind: "asset-id", assetId: "runtime-knowledge-a" } }],
        },
      ],
    },
    effectiveWriteConfig: {
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
    expect(Object.isFrozen(receipt.checks)).toBe(true);
    expect(receipt.checks.every(Object.isFrozen)).toBe(true);
  });

  it("accepts imported Memory only when its explicit source Agent is in the selected Team", () => {
    const input = validInput();
    const importedAgentId = "agent-runtime-distractor";
    const imported = evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: {
        ...input.identityMapping,
        assetLocators: input.identityMapping.assetLocators.map((mapping) => (
          mapping.logicalAssetId === "memory-l1-a"
            ? { ...mapping, sourceAgentId: importedAgentId }
            : mapping
        )),
      },
      assetInventory: {
        sources: input.assetInventory.sources.map((source) => (
          source.requestPath === "/v3/atomic/query"
            ? { ...source, agentId: importedAgentId }
            : source
        )),
      },
    });
    expect(imported.ready).toBe(true);

    const foreign = evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: {
        ...input.identityMapping,
        assetLocators: input.identityMapping.assetLocators.map((mapping) => (
          mapping.logicalAssetId === "memory-l1-a"
            ? { ...mapping, sourceAgentId: "agent-runtime-foreign" }
            : mapping
        )),
      },
      assetInventory: {
        sources: input.assetInventory.sources.map((source) => (
          source.requestPath === "/v3/atomic/query"
            ? { ...source, agentId: "agent-runtime-foreign" }
            : source
        )),
      },
    });
    expect(foreign.ready).toBe(false);
    expect(foreign.checks).toContainEqual({ id: "visible-assets", status: "fail" });
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

  it("fails when a logical asset locator does not match the observed read-back item", () => {
    const input = validInput();
    const receipt = evaluateFormalExecutionPreflight({
      ...input,
      identityMapping: {
        ...input.identityMapping,
        assetLocators: input.identityMapping.assetLocators.map((mapping) => (
          mapping.logicalAssetId === "memory-l1-a"
            ? { ...mapping, runtimeLocator: { kind: "asset-id", assetId: "runtime-memory-other" } as const }
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

  it("rejects a read-back observation without a valid request path", () => {
    const input = validInput();
    const receipt = evaluateFormalExecutionPreflight({
      ...input,
      assetInventory: {
        ...input.assetInventory,
        sources: [
          { ...input.assetInventory.sources[0], requestPath: "/not-a-real-tool" },
          ...input.assetInventory.sources.slice(1),
        ],
      },
    });
    expect(receipt.ready).toBe(false);
    expect(receipt.checks).toContainEqual({ id: "visible-assets", status: "fail" });
  });
});
