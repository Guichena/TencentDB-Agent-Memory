import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const first = path.join(root, "skill", "skill-batch-01");
const second = path.join(root, "skill", "skill-batch-02");
const draft = JSON.parse(await readFile(path.join(first, "draft.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(first, "manifest.json"), "utf8"));
if (draft.pairs.length !== 6) throw new Error("expected six Luna-authored skill pairs before split");
const halves = [draft.pairs.slice(0, 3), draft.pairs.slice(3)];
await mkdir(second, { recursive: true });
for (let index = 0; index < halves.length; index += 1) {
  const outDir = index === 0 ? first : second;
  const batchId = `t12-skill-batch-0${index + 1}`;
  await writeFile(path.join(outDir, "draft.json"), JSON.stringify({ ...draft, batch_id: batchId, pairs: halves[index] }, null, 2) + "\n");
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ ...manifest, batch_id: batchId, actual_count: 3 }, null, 2) + "\n");
  await writeFile(path.join(outDir, "questions.md"), "# Sol review questions\n\nNo unresolved schema questions. Sol must still review frozen-source fidelity, route uniqueness, visibility, and final Gold.\n");
}
