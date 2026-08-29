import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dataset = path.join(root, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const material = path.join(dataset, "source-material/T10");
const candidates = JSON.parse(await readFile(path.join(dataset, "generators/parallel/build-05/T10/trial/skill/skill-trial-01/asset-candidates.json"), "utf8")).candidates;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const manifest = [];

for (const candidate of candidates) {
  const rawPath = path.join(material, candidate.checked_in_path.replaceAll("/", path.sep));
  const rawBytes = await readFile(rawPath);
  if (sha256(rawBytes) !== candidate.raw_sha256) throw new Error(`raw hash mismatch for ${candidate.name}`);
  const lines = rawBytes.toString("utf8").split("\n");
  if (lines[0] !== "---") throw new Error(`missing frontmatter for ${candidate.name}`);
  const close = lines.indexOf("---", 1);
  const descriptionIndex = lines.findIndex((line, index) => index > 0 && index < close && line.startsWith("description:"));
  if (close < 0 || descriptionIndex < 0) throw new Error(`invalid frontmatter for ${candidate.name}`);
  const replacement = [
    `description: ${JSON.stringify(candidate.description)}`,
    `use_when: ${JSON.stringify(candidate.use_when)}`,
    `do_not_use_when: ${JSON.stringify(candidate.do_not_use_when)}`,
  ];
  const adaptedLines = [...lines];
  adaptedLines.splice(descriptionIndex, 1, ...replacement);
  const adapted = adaptedLines.join("\n");
  const adaptedDirectory = path.join(material, "adapted", candidate.name);
  await mkdir(adaptedDirectory, { recursive: true });
  await writeFile(path.join(adaptedDirectory, "SKILL.md"), adapted, "utf8");

  for (const resource of candidate.resource_paths ?? []) {
    const resourceBytes = await readFile(path.join(material, resource.checked_in_path.replaceAll("/", path.sep)));
    if (sha256(resourceBytes) !== resource.raw_sha256) throw new Error(`resource hash mismatch for ${candidate.name}/${resource.path}`);
    const target = path.join(adaptedDirectory, resource.path.replaceAll("/", path.sep));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, resourceBytes);
  }

  const adaptedClose = close + 2;
  const rawBody = lines.slice(close + 1).join("\n");
  const adaptedBody = adaptedLines.slice(adaptedClose + 1).join("\n");
  if (rawBody !== adaptedBody) throw new Error(`body changed for ${candidate.name}`);
  const oldFrontmatter = lines.slice(0, close + 1);
  const newFrontmatter = adaptedLines.slice(0, adaptedClose + 1);
  const patchLines = [
    `--- a/${candidate.checked_in_path}`,
    `+++ b/adapted/${candidate.name}/SKILL.md`,
    `@@ -1,${oldFrontmatter.length} +1,${newFrontmatter.length} @@`,
    ...oldFrontmatter.map((line, index) => index === descriptionIndex ? `-${line}` : ` ${line}`),
  ];
  patchLines.splice(4 + descriptionIndex, 0, ...replacement.map((line) => `+${line}`));
  await mkdir(path.join(material, "diffs"), { recursive: true });
  await writeFile(path.join(material, "diffs", `${candidate.name}.patch`), `${patchLines.join("\n")}\n`, "utf8");
  manifest.push({
    asset_id: candidate.asset_id,
    name: candidate.name,
    raw_path: candidate.checked_in_path,
    raw_sha256: candidate.raw_sha256,
    adapted_path: `adapted/${candidate.name}/SKILL.md`,
    adapted_sha256: sha256(Buffer.from(adapted, "utf8")),
    core_body_sha256: sha256(Buffer.from(rawBody, "utf8")),
    diff_path: `diffs/${candidate.name}.patch`,
    resource_paths: (candidate.resource_paths ?? []).map((resource) => ({ ...resource, adapted_path: `adapted/${candidate.name}/${resource.path}` })),
  });
}

await writeFile(path.join(material, "adaptation-manifest.json"), `${JSON.stringify({
  schema_version: "task1.skill_adaptation_manifest.v1",
  team_id: "T10",
  policy: "Only neutral discovery metadata changed; package bodies and resources are preserved.",
  skills: manifest,
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ team_id: "T10", adapted: manifest.length, resources: manifest.flatMap((item) => item.resource_paths).length }, null, 2));
