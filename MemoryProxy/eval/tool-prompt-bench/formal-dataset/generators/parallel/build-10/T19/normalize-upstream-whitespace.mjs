import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../../../../..");
const targets = [
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T19/repos/wshobson__agents/LICENSE.upstream",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T19/repos/zoom__skills/skills/oauth/SKILL.md",
];

for (const relativePath of targets) {
  const path = resolve(repoRoot, relativePath);
  const archivePath = `${path}.raw.gz`;
  const raw = existsSync(archivePath) ? gunzipSync(readFileSync(archivePath)) : readFileSync(path);
  writeFileSync(archivePath, gzipSync(raw, { level: 9, mtime: 0 }));
  const normalized = raw.toString("utf8")
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n");
  writeFileSync(path, normalized, "utf8");
}
