import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../eval/tool-prompt-bench/worlds/formal-snapshot.js";

const root = resolve(
  import.meta.dirname,
  "../../eval/tool-prompt-bench/formal-dataset",
);

async function jsonl(path: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(resolve(root, path), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("Task 1 Measurement-v2 private overlay", () => {
  it("binds all Gold and Pair records to the frozen data core", async () => {
    const manifest = JSON.parse(await readFile(
      resolve(root, "measurement-v2/private/manifest.private.json"),
      "utf8",
    )) as Record<string, any>;
    const gold = [
      ...await jsonl("measurement-v2/private/gold/dev.private.jsonl"),
      ...await jsonl("measurement-v2/private/gold/hidden.private.jsonl"),
    ].sort((left, right) => String(left.caseId).localeCompare(String(right.caseId)));
    const pairs = [
      ...await jsonl("measurement-v2/private/pairs/dev.private.jsonl"),
      ...await jsonl("measurement-v2/private/pairs/hidden.private.jsonl"),
    ].sort((left, right) => String(left.pairId).localeCompare(String(right.pairId)));

    expect(manifest.visibility).toBe("private_never_provider_visible");
    expect(manifest.dataCore.tag).toBe("task1-data-core-formal-v1");
    expect(manifest.dataCore.commit).toBe("418ecd102fa2019c139da9eebf88b163eca5a208");
    expect(manifest.counts.goldV2).toBe(640);
    expect(manifest.counts.pairV2).toBe(240);
    expect(canonicalSha256(gold)).toBe("f083f2d4c4cfa8fd083d265004c0447c81f713fd5beadf26a6aaf0fdcf9be0e2");
    expect(canonicalSha256(pairs)).toBe("518162d5a19ceb55061690a5ce328541f483913c24832efe707a97b37aa6c7bc");
    expect(gold.filter((item) => item.expectation === "no-tool")
      .every((item) => Array.isArray(item.allowedSequences) && item.allowedSequences.length === 0)).toBe(true);
    expect(new Set(pairs.map((item) => item.independenceKey)).size).toBe(240);
  });

  it("keeps private overlay fields out of provider-visible rows", async () => {
    const provider = `${await readFile(resolve(root, "provider/dev.jsonl"), "utf8")}\n${
      await readFile(resolve(root, "provider/hidden.sealed.jsonl"), "utf8")
    }`;
    for (const marker of ["evaluationSchemaVersion", "invariantFieldsSha256", "minimalityReviewStatus"]) {
      expect(provider).not.toContain(marker);
    }
  });
});
