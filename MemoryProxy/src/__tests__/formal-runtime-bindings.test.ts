import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFormalCaseBindings,
  serializeFormalCaseBindings,
} from "../../eval/tool-prompt-bench/formal-runtime/build-case-bindings.js";
import {
  canonicalJson,
  canonicalSha256,
  loadFormalCaseBindings,
  resolveFormalDataFreeze,
} from "../../eval/tool-prompt-bench/formal-runtime/index.js";

const FORBIDDEN_BINDING_KEYS = new Set([
  "query",
  "contextMessages",
  "gold",
  "pair",
  "pairId",
  "pairRole",
  "evidence",
  "evidenceRefs",
  "sourceEvidenceIds",
  "privateAnnotations",
]);

function collectKeys(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, result));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      result.add(key);
      collectKeys(child, result);
    }
  }
  return result;
}

describe("Task 1 formal runtime case bindings", () => {
  it("deterministically joins all provider cases into a Gold-blind runtime binding", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const reads: string[] = [];
    const built = buildFormalCaseBindings({
      freeze,
      readText: (path) => {
        reads.push(path);
        return readFileSync(path, "utf8");
      },
    });

    expect(built).toMatchObject({
      count: 800,
      splitCounts: { dev: 320, hiddenTest: 480 },
      formalMetricEligible: false,
    });
    expect(new Set(built.rows.map((row) => row.caseId)).size).toBe(800);
    expect(built.rows.map((row) => row.caseId)).toEqual(
      [...built.rows.map((row) => row.caseId)].sort(),
    );
    expect(serializeFormalCaseBindings(built.rows)).toBe(
      serializeFormalCaseBindings(built.rows.map((row) => structuredClone(row))),
    );

    const allKeys = collectKeys(built.rows);
    for (const key of FORBIDDEN_BINDING_KEYS) expect(allKeys.has(key), key).toBe(false);
    expect(Object.keys(built.rows[0] ?? {}).sort()).toEqual([
      "caseId",
      "identity",
      "snapshotId",
      "split",
      "visibleAssetSetSha256",
      "workspace",
    ]);
    expect(Object.keys(built.rows[0]?.identity ?? {}).sort()).toEqual([
      "agentId",
      "agentSource",
      "sessionSeed",
      "spaceId",
      "taskId",
      "teamId",
      "userId",
    ]);
    for (const row of built.rows) {
      expect(row.identity.taskId).toMatch(/^task-[a-f0-9]{32}$/u);
      expect(row.identity.sessionSeed).toMatch(/^session-[a-f0-9]{32}$/u);
      expect(JSON.stringify(row.identity)).not.toMatch(/(?:^|[-_/])(positive|negative|memory|skill|knowledge|legacy|v[0-9]+|p|n)(?:$|[-_/])/iu);
    }
    const pairedPositive = built.rows.find((row) => row.caseId === "T01-KNOWLEDGE-014-P");
    const pairedNegative = built.rows.find((row) => row.caseId === "T01-KNOWLEDGE-014-N");
    expect(pairedPositive?.identity.taskId).toBe(pairedNegative?.identity.taskId);
    expect(pairedPositive?.identity.sessionSeed).not.toBe(pairedNegative?.identity.sessionSeed);

    expect(reads.map((path) => basename(path)).sort()).toEqual([
      "DATASET-BUILD-STATUS.json",
      "dev.jsonl",
      "formal-v2.json",
      "hidden.sealed.jsonl",
    ]);
    expect(reads.some((path) => /measurement-v2[\\/]private/u.test(path))).toBe(false);
  });

  it("loads a frozen split immutably and authorizes hidden before opening the file", () => {
    const freeze = resolveFormalDataFreeze({ repositoryRoot: process.cwd() });
    const built = buildFormalCaseBindings({ freeze });
    const serialized = serializeFormalCaseBindings(built.rows);
    const reads: string[] = [];
    const dev = loadFormalCaseBindings({
      freeze,
      split: "dev",
      readText: (path) => {
        reads.push(path);
        return serialized;
      },
    });

    expect(dev).toMatchObject({
      split: "dev",
      count: 320,
      totalCount: 800,
      fileSha256: built.fileSha256,
      canonicalSha256: built.canonicalSha256,
      formalMetricEligible: false,
    });
    expect(Object.isFrozen(dev.rows)).toBe(true);
    expect(Object.isFrozen(dev.rows[0])).toBe(true);
    expect(Object.isFrozen(dev.rows[0]?.identity)).toBe(true);
    expect(Object.isFrozen(dev.rows[0]?.workspace)).toBe(true);
    expect(reads).toHaveLength(1);

    reads.length = 0;
    expect(() => loadFormalCaseBindings({
      freeze,
      split: "hidden_test",
      readText: (path) => {
        reads.push(path);
        return serialized;
      },
    })).toThrow(/hidden_test binding access is not authorized/);
    expect(reads).toEqual([]);

    expect(canonicalJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
    expect(canonicalSha256({ z: 1, a: 2 })).toBe(canonicalSha256({ a: 2, z: 1 }));
  });
});
