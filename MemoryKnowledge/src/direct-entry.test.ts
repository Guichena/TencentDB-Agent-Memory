import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isDirectModuleExecution } from "./direct-entry.js";

describe("isDirectModuleExecution", () => {
  it("recognizes the current platform path after file-URL normalization", () => {
    const entryPath = fileURLToPath(import.meta.url);

    expect(isDirectModuleExecution(pathToFileURL(entryPath).href, entryPath)).toBe(true);
  });

  it("rejects a missing or different argv entry", () => {
    const entryPath = fileURLToPath(import.meta.url);

    expect(isDirectModuleExecution(import.meta.url, undefined)).toBe(false);
    expect(isDirectModuleExecution(import.meta.url, `${entryPath}.other`)).toBe(false);
  });
});
