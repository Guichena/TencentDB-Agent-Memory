import { describe, expect, it } from "vitest";

import {
  FORMAL_PROMPT_FREEZE_COMMIT,
  FORMAL_PROMPT_FREEZE_TAG_OBJECT,
  inspectFormalCacheStructureFreeze,
  type FormalCacheGitRunner,
} from "../../eval/tool-prompt-bench/formal-cache-structure-gate.js";
import type { FormalExecutionReceipt } from "../../eval/tool-prompt-bench/formal-execution-runner.js";
import {
  canonicalSha256,
  utf8Sha256,
} from "../../eval/tool-prompt-bench/measurement-v2/canonical-json.js";
import type { FormalM2PreGoldEvidence } from "../../eval/tool-prompt-bench/measurement-v2/formal-m2-evidence-builder.js";

const freezeCommit = FORMAL_PROMPT_FREEZE_COMMIT;
const executionCommit = "b".repeat(40);
const tagObject = FORMAL_PROMPT_FREEZE_TAG_OBJECT;
const sha = (character: string) => character.repeat(64);
const variants = [
  ["V0", "legacy"],
  ["V0-C", "contract-corrected"],
  ["V1a", "protocol-compact"],
  ["V1", "compact"],
  ["V2", "selection-calibrated"],
  ["V3", "capability-pruned"],
] as const;

function manifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    stage: "C06",
    profileInventory: variants.map(([variant, profile], index) => ({
      variant,
      profile,
      totalInjectionTokensO200k: 1000 - index,
      totalInjectionSha256: sha(String(index + 1)),
      effectiveSystemSha256: sha(String(index + 2)),
      stablePrefixBytesFromParent: index === 0 ? 1000 : 100 + index,
      firstChangedByteFromParent: index === 0 ? null : 100 + index,
      blocks: variant === "V0-C"
        ? [
            ["skill_tools", "static_tool"],
            ["available_skills", "mixed"],
            ["knowledge_tools", "mixed"],
            ["tdai_memory_tools", "static_tool"],
            ["tdai_profile_memory", "mixed"],
          ].map(([blockId, kind]) => ({
            blockId,
            kind,
            staticTemplateSha256: sha(String(index + 3)),
          }))
        : [{
            blockId: "skill_tools",
            staticTemplateSha256: sha(String(index + 3)),
          }],
    })),
    cacheNamespaces: variants.map(([variant, profile], index) => ({
      variant,
      profile,
      hookCacheIdentity: `cache-${index}`,
    })),
    runnerProfileSmoke: variants.map(([variant, profile], index) => ({
      variant,
      profile,
      promptSha256: sha(String(index + 4)),
    })),
  });
}

function receipt(
  promptFreezeCommit: string = freezeCommit,
  runId: string = "run-a",
  caseId: string = "case-a",
): FormalExecutionReceipt {
  return {
    runId,
    caseId,
    variantId: "V3",
    codeFreeze: {
      executionCodeCommit: executionCommit,
      promptFreezeTagObject: FORMAL_PROMPT_FREEZE_TAG_OBJECT,
      promptFreezeCommit,
      promptFreezeIsAncestor: true,
      workingTreeClean: true,
    },
  } as FormalExecutionReceipt;
}

function m2Evidence(overrides: Readonly<{
  cacheReadState?: string;
  assetPrefixText?: string;
  caseId?: string;
  dynamicAssetText?: string;
  injectionSha?: string;
  ledgerInjectionSha?: string;
  moveMemoryRuntimeEarlier?: boolean;
  moveMixedDynamicEarlier?: boolean;
  moveRuntimeEarlier?: boolean;
  omitSkillRuntime?: boolean;
  reenterMappedBlock?: boolean;
  reorderMappedBlocks?: boolean;
  runId?: string;
  runtimeBindingText?: string;
  sessionContextText?: string;
}> = {}): FormalM2PreGoldEvidence {
  const runId = overrides.runId ?? "run-a";
  const caseId = overrides.caseId ?? "case-a";
  const leadingSources = [
    {
      sourceId: "wrapper-open",
      kind: "static-tool" as const,
      injectionBlockId: "tdai-injections-wrapper",
      text: "<tdai_injections>\n",
    },
    {
      sourceId: "codex-session-context",
      kind: "dynamic-asset" as const,
      injectionBlockId: "session-context",
      text: overrides.sessionContextText ?? `<session_context>${runId}</session_context>`,
    },
    {
      sourceId: "pipeline-session-tool-separator",
      kind: "static-tool" as const,
      injectionBlockId: "pipeline-separator",
      text: "\n",
    },
  ];
  const skillSources = [
    {
      sourceId: "tool-contract",
      kind: "execution-contract" as const,
      injectionBlockId: "skill-tools-injector",
      text: "Task 1 tool contract\n",
    },
    ...(overrides.omitSkillRuntime ? [] : [{
      sourceId: "session-binding",
      kind: "runtime-binding" as const,
      injectionBlockId: "skill-tools-injector",
      text: overrides.runtimeBindingText ?? `session=${runId}`,
    }]),
  ];
  if (overrides.moveRuntimeEarlier) skillSources.reverse();
  const mixedSources = [
    {
      sourceId: "asset-prefix",
      kind: "static-tool" as const,
      injectionBlockId: "skill-injector",
      text: overrides.assetPrefixText ?? "\nassets=",
    },
    {
      sourceId: "available-skills",
      kind: "dynamic-asset" as const,
      injectionBlockId: "skill-injector",
      text: overrides.dynamicAssetText ?? "typescript-testing",
    },
  ];
  if (overrides.moveMixedDynamicEarlier) mixedSources.reverse();
  const memorySources = [
    {
      sourceId: "memory-contract",
      kind: "execution-contract" as const,
      injectionBlockId: "tdai-memory-tools-injector",
      text: "Memory tool contract\n",
    },
    {
      sourceId: "memory-session-binding",
      kind: "runtime-binding" as const,
      injectionBlockId: "tdai-memory-tools-injector",
      text: `memory-session=${runId}`,
    },
  ];
  if (overrides.moveMemoryRuntimeEarlier) memorySources.reverse();
  const toolSources = overrides.reorderMappedBlocks
    ? [...mixedSources, ...skillSources, ...memorySources]
    : [...skillSources, ...mixedSources, ...memorySources];
  if (overrides.reenterMappedBlock) {
    toolSources.push({
      sourceId: "skill-reentry",
      kind: "execution-contract" as const,
      injectionBlockId: "skill-tools-injector",
      text: "re-entered skill contract",
    });
  }
  const sourceInputs = [
    ...leadingSources,
    ...toolSources,
    {
      sourceId: "wrapper-close",
      kind: "static-tool" as const,
      injectionBlockId: "tdai-injections-wrapper",
      text: "\n</tdai_injections>",
    },
  ];
  let byteCursor = 0;
  const segments = sourceInputs.map((source, order) => {
    const startUtf8Byte = byteCursor;
    byteCursor += Buffer.byteLength(source.text, "utf8");
    return {
      ...source,
      order,
      startUtf8Byte,
      endUtf8ByteExclusive: byteCursor,
      sha256: utf8Sha256(source.text),
    };
  });
  const injectionText = segments.map((segment) => segment.text).join("");
  const sourceContent = {
    schemaVersion: 1,
  };
  const sourceManifest = {
    ...sourceContent,
    canonicalSha256: canonicalSha256(sourceContent),
  };
  const injectionSha = overrides.injectionSha ?? utf8Sha256(injectionText);
  const manifestContent = {
    productionSourceManifestSha256: sha("5"),
    providerInjectionSha256: injectionSha,
    providerInjectionTokens: 123,
    providerInjectionUtf8Bytes: Buffer.byteLength(injectionText, "utf8"),
    segments: segments.map(({ text: _text, ...segment }) => segment),
  };
  const captureManifest = {
    ...manifestContent,
    canonicalSha256: canonicalSha256(manifestContent),
  };
  const ledgerContent = {
    runId,
    variantId: "V3",
    totalInjectionSha256: overrides.ledgerInjectionSha ?? injectionSha,
    totalInjectionTokens: 123,
    totalInjectionUtf8Bytes: Buffer.byteLength(injectionText, "utf8"),
    classification: {
      trustedSourceManifestSha256: sourceManifest.canonicalSha256,
      expectedSourceAttestation: {
        authority: "campaign-integration",
        sourceManifestSha256: sourceManifest.canonicalSha256,
        frozenProviderSourceManifestSha256: captureManifest.productionSourceManifestSha256,
        providerRequestBindingSha256: sha("6"),
      },
      formalCompilerClosure: { status: "ready", blocker: null, owner: "Integration" },
    },
  };
  const tokenLedger = {
    ...ledgerContent,
    canonicalSha256: canonicalSha256(ledgerContent),
  };
  const preGoldContent = {
    runId,
    caseId,
    variantId: "V3",
    runIsolation: {
      runId,
      providerCache: {
        cacheLane: "warm",
        cacheReadInputTokens: 9,
        cacheWriteInputTokens: null,
        cacheReadState: overrides.cacheReadState ?? "reported",
        cacheWriteState: "unsupported",
        telemetryUsable: true,
      },
    },
    tokenCapture: {
      segments,
      manifest: captureManifest,
      sourceManifest,
      tokenLedger,
    },
    requestUsageLedger: {
      status: "ready",
      blockers: [],
      ledger: {
        runId,
        aggregateProviderUsage: {
          cacheReadInputTokens: 9,
          cacheWriteInputTokens: null,
        },
        requests: [{
          requestId: `request-${runId}`,
          providerUsage: {
            fieldStates: {
              cacheReadInputTokens: overrides.cacheReadState ?? "reported",
              cacheWriteInputTokens: "unsupported",
            },
            normalized: {
              cacheReadInputTokens: 9,
              cacheWriteInputTokens: null,
            },
          },
        }],
      },
    },
  };
  return {
    ...preGoldContent,
    canonicalSha256: canonicalSha256(preGoldContent),
  } as unknown as FormalM2PreGoldEvidence;
}

function gitRunner(overrides: Partial<Record<string, { exitCode: number; stdout?: string }>> = {}): FormalCacheGitRunner {
  return async (args) => {
    const key = args.join(" ");
    const override = overrides[key];
    if (override) return { exitCode: override.exitCode, stdout: override.stdout ?? "", stderr: "" };
    if (key === "rev-parse refs/tags/task1-code-freeze") {
      return { exitCode: 0, stdout: `${tagObject}\n`, stderr: "" };
    }
    if (key === "cat-file -t refs/tags/task1-code-freeze") {
      return { exitCode: 0, stdout: "tag\n", stderr: "" };
    }
    if (key === "rev-parse task1-code-freeze^{commit}") {
      return { exitCode: 0, stdout: `${freezeCommit}\n`, stderr: "" };
    }
    if (key.startsWith("show ")) return { exitCode: 0, stdout: manifest(), stderr: "" };
    throw new Error(`unexpected Git call: ${key}`);
  };
}

describe("formal cache structure gate", () => {
  it("binds the baseline manifest and each run's observed provider injection/cache evidence", async () => {
    const gate = await inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence(),
        m2Evidence({ runId: "run-b", caseId: "case-b" }),
      ],
      runGit: gitRunner(),
    });
    expect(gate).toMatchObject({
      schemaVersion: "task1.formal-cache-structure-gate.v1",
      passed: true,
      promptFreezeTag: "task1-code-freeze",
      promptFreezeTagObject: tagObject,
      promptFreezeCommit: freezeCommit,
    });
    expect(gate.variants).toHaveLength(6);
    expect(gate.observedRuns).toEqual(expect.arrayContaining([expect.objectContaining({
      runId: "run-a",
      providerInjectionTokensO200k: 123,
      requestCacheUsage: [{
        requestId: "request-run-a",
        cacheReadInputTokens: 9,
        cacheWriteInputTokens: null,
      }],
    })]));
    expect(gate.invariants.currentCandidatePrefixInvariantVerified).toBe(true);
    expect(gate.currentCandidatePrefixes).toEqual([expect.objectContaining({
      variantId: "V3",
      runIds: ["run-a", "run-b"],
      firstChangedByte: expect.any(Number),
      firstVariableSourceUtf8Byte: expect.any(Number),
      commonPrefixSourceLayoutSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      nonVariableSourceLayoutSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      survivingV0CBlockOrder: ["skill_tools", "available_skills", "tdai_memory_tools"],
    })]);
    expect(gate.variants[5]).toMatchObject({
      variantId: "V3",
      profileId: "capability-pruned",
      totalInjectionTokensO200k: 995,
    });
  });

  it("rejects a caller-selected Prompt freeze even when it is an ancestor", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt("d".repeat(40))],
      m2PreGoldEvidence: [m2Evidence()],
      runGit: gitRunner(),
    })).rejects.toThrow(/does not use task1-code-freeze/i);
  });

  it("allows the production-leading session context to vary before the V0-C tool seam", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({ sessionContextText: "<session_context>team-a</session_context>" }),
        m2Evidence({
          runId: "run-b",
          caseId: "case-b",
          sessionContextText: "<session_context>another-team-with-longer-context</session_context>",
        }),
      ],
      runGit: gitRunner(),
    })).resolves.toMatchObject({
      passed: true,
      currentCandidatePrefixes: [expect.objectContaining({
        survivingV0CBlockOrder: ["skill_tools", "available_skills", "tdai_memory_tools"],
      })],
    });
  });

  it("rejects static Prompt drift hidden behind a varying leading session context", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({
          sessionContextText: "<session_context>team-a</session_context>",
          assetPrefixText: "\nassets=stable-a",
        }),
        m2Evidence({
          runId: "run-b",
          caseId: "case-b",
          sessionContextText: "<session_context>another-team-with-longer-context</session_context>",
          assetPrefixText: "\nassets=drifted-b",
        }),
      ],
      runGit: gitRunner(),
    })).rejects.toThrow(/non-variable production Prompt sources differ/i);
  });

  it("allows only dynamic Prompt sources to differ behind a varying session context", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({
          sessionContextText: "<session_context>team-a</session_context>",
          dynamicAssetText: "typescript-testing",
        }),
        m2Evidence({
          runId: "run-b",
          caseId: "case-b",
          sessionContextText: "<session_context>another-team-with-longer-context</session_context>",
          dynamicAssetText: "react-performance",
        }),
      ],
      runGit: gitRunner(),
    })).resolves.toMatchObject({ passed: true });
  });

  it("allows a V0-C mixed block to put dynamic assets before its stable fragment", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({ moveMixedDynamicEarlier: true }),
        m2Evidence({ runId: "run-b", caseId: "case-b", moveMixedDynamicEarlier: true }),
      ],
      runGit: gitRunner(),
    })).resolves.toMatchObject({ passed: true });
  });

  it("allows the first mapped variable to differ when the surviving block order is unchanged", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence(),
        m2Evidence({ runId: "run-b", caseId: "case-b", omitSkillRuntime: true }),
      ],
      runGit: gitRunner(),
    })).resolves.toMatchObject({ passed: true });
  });

  it("rejects a later V0-C static_tool block moving all runtime content before stable text", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({ moveMemoryRuntimeEarlier: true }),
        m2Evidence({ runId: "run-b", caseId: "case-b", moveMemoryRuntimeEarlier: true }),
      ],
      runGit: gitRunner(),
    })).rejects.toThrow(/precedes stable content in V0-C block tdai_memory_tools/i);
  });

  it.each([
    ["reorders", { reorderMappedBlocks: true }, /do not preserve V0-C order/i],
    ["re-enters", { reenterMappedBlock: true }, /re-enters after another block/i],
  ])("rejects a candidate that %s a mapped V0-C block", async (_label, candidate, error) => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence(candidate),
        m2Evidence({ ...candidate, runId: "run-b", caseId: "case-b" }),
      ],
      runGit: gitRunner(),
    })).rejects.toThrow(error);
  });

  it("rejects a moved annotated Prompt tag object", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      m2PreGoldEvidence: [m2Evidence()],
      runGit: gitRunner({
        "rev-parse refs/tags/task1-code-freeze": {
          exitCode: 0,
          stdout: `${"d".repeat(40)}\n`,
        },
      }),
    })).rejects.toThrow(/Prompt freeze tag object drift/i);
  });

  it("rejects a lightweight Prompt freeze tag", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      m2PreGoldEvidence: [m2Evidence()],
      runGit: gitRunner({
        "cat-file -t refs/tags/task1-code-freeze": {
          exitCode: 0,
          stdout: "commit\n",
        },
      }),
    })).rejects.toThrow(/expected annotated tag object/i);
  });

  it("allows Prompt-owned source changes after the baseline freeze", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence(),
        m2Evidence({ runId: "run-b", caseId: "case-b" }),
      ],
      runGit: gitRunner(),
    })).resolves.toMatchObject({ passed: true });
  });

  it("rejects a dynamic/runtime source moving earlier in one current-candidate run", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence(),
        m2Evidence({
          runId: "run-b",
          caseId: "case-b",
          moveRuntimeEarlier: true,
        }),
      ],
      runGit: gitRunner(),
    })).rejects.toThrow(/precedes stable content in V0-C block skill_tools/i);
  });

  it("rejects every run consistently moving variable content before its surviving V0-C block", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({ moveRuntimeEarlier: true }),
        m2Evidence({
          runId: "run-b",
          caseId: "case-b",
          moveRuntimeEarlier: true,
        }),
      ],
      runGit: gitRunner(),
    })).rejects.toThrow(/precedes stable content in V0-C block skill_tools/i);
  });

  it("does not assign a stable byte change at a dynamic end-exclusive boundary to that dynamic source", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [
        receipt(),
        receipt(freezeCommit, "run-b", "case-b"),
      ],
      m2PreGoldEvidence: [
        m2Evidence({
          runtimeBindingText: "session=stable",
          assetPrefixText: "A",
          sessionContextText: "<session_context>stable</session_context>",
        }),
        m2Evidence({
          runId: "run-b",
          caseId: "case-b",
          runtimeBindingText: "session=stable",
          assetPrefixText: "B",
          sessionContextText: "<session_context>stable</session_context>",
        }),
      ],
      runGit: gitRunner(),
    })).rejects.toThrow(/non-variable production Prompt sources differ/i);
  });

  it("requires more than one run to prove the current-candidate common prefix", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      m2PreGoldEvidence: [m2Evidence()],
      runGit: gitRunner(),
    })).rejects.toThrow(/requires at least two runs/i);
  });

  it("rejects missing or internally inconsistent observed cache/injection evidence", async () => {
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      m2PreGoldEvidence: [],
      runGit: gitRunner(),
    })).rejects.toThrow(/requires M2 pre-Gold evidence/i);
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      m2PreGoldEvidence: [m2Evidence({ cacheReadState: "missing" })],
      runGit: gitRunner(),
    })).rejects.toThrow(/cache usage evidence is incomplete/i);
    await expect(inspectFormalCacheStructureFreeze({
      repositoryRoot: "D:/repo",
      executions: [receipt()],
      m2PreGoldEvidence: [m2Evidence({ ledgerInjectionSha: sha("7") })],
      runGit: gitRunner(),
    })).rejects.toThrow(/injection\/source attestation mismatch/i);
  });
});
