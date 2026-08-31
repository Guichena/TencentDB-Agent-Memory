import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../../../../..");
const targets = [
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T20/repos/NVIDIA__skills/LICENSE.upstream",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T20/repos/NVIDIA__skills/skills/vss-search-archive/SKILL.md",
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T20/repos/opensearch-project__opensearch-agent-skills/LICENSE.upstream",
];

for (const relativePath of targets) {
  const path = resolve(repoRoot, relativePath);
  const archivePath = `${path}.raw.gz`;
  const raw = existsSync(archivePath) ? gunzipSync(readFileSync(archivePath)) : readFileSync(path);
  writeFileSync(archivePath, gzipSync(raw, { level: 9, mtime: 0 }));
  const normalized = raw.toString("utf8")
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "\n");
  writeFileSync(path, normalized, "utf8");
}
