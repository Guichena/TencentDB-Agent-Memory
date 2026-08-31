import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const teamRoot = path.join(
  root,
  "MemoryProxy/eval/tool-prompt-bench/formal-dataset",
);
const materialRoot = path.join(teamRoot, "source-material/T09");
const candidatesPath = path.join(
  teamRoot,
  "generators/parallel/build-05/T09/trial/skill/skill-trial-01/asset-candidates.json",
);

const candidates = JSON.parse(await readFile(candidatesPath, "utf8")).candidates;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const yamlString = (value) => JSON.stringify(value);
const manifest = [];

for (const candidate of candidates) {
  const rawRelative = candidate.checked_in_path.replaceAll("/", path.sep);
  const rawPath = path.join(materialRoot, rawRelative);
  const raw = await readFile(rawPath, "utf8");
  const rawBytes = await readFile(rawPath);
  if (sha256(rawBytes) !== candidate.raw_sha256) {
    throw new Error(`raw hash mismatch for ${candidate.name}`);
  }

  const lines = raw.split("\n");
  if (lines[0] !== "---") throw new Error(`missing frontmatter: ${candidate.name}`);
  const close = lines.indexOf("---", 1);
  if (close < 0) throw new Error(`unterminated frontmatter: ${candidate.name}`);
  const descriptionIndex = lines.findIndex(
    (line, index) => index > 0 && index < close && line.startsWith("description:"),
  );
  if (descriptionIndex < 0) throw new Error(`missing description: ${candidate.name}`);

  const adaptedLines = [...lines];
  adaptedLines.splice(
    descriptionIndex,
    1,
    `description: ${yamlString(candidate.description)}`,
    `use_when: ${yamlString(candidate.use_when)}`,
    `do_not_use_when: ${yamlString(candidate.do_not_use_when)}`,
  );
  const adapted = adaptedLines.join("\n");
  const adaptedDirectory = path.join(materialRoot, "adapted", candidate.name);
  const adaptedPath = path.join(adaptedDirectory, "SKILL.md");
  await mkdir(adaptedDirectory, { recursive: true });
  await writeFile(adaptedPath, adapted, "utf8");

  for (const resource of candidate.resource_paths ?? []) {
    const rawResourcePath = path.join(
      materialRoot,
      resource.checked_in_path.replaceAll("/", path.sep),
    );
    const resourceBytes = await readFile(rawResourcePath);
    if (sha256(resourceBytes) !== resource.raw_sha256) {
      throw new Error(`resource hash mismatch for ${candidate.name}/${resource.path}`);
    }
    const adaptedResourcePath = path.join(
      adaptedDirectory,
      resource.path.replaceAll("/", path.sep),
    );
    await mkdir(path.dirname(adaptedResourcePath), { recursive: true });
    await writeFile(adaptedResourcePath, resourceBytes);
  }

  const oldFrontmatter = lines.slice(0, close + 1);
  const adaptedClose = close + 2;
  const newFrontmatter = adaptedLines.slice(0, adaptedClose + 1);
  const patch = [
    `--- a/${candidate.checked_in_path}`,
    `+++ b/adapted/${candidate.name}/SKILL.md`,
    `@@ -1,${oldFrontmatter.length} +1,${newFrontmatter.length} @@`,
    ...oldFrontmatter.map((line, index) => {
      if (index === descriptionIndex) return `-${line}`;
      return ` ${line}`;
    }),
  ];
  patch.splice(
    4 + descriptionIndex,
    0,
    `+description: ${yamlString(candidate.description)}`,
    `+use_when: ${yamlString(candidate.use_when)}`,
    `+do_not_use_when: ${yamlString(candidate.do_not_use_when)}`,
  );
  const diffDirectory = path.join(materialRoot, "diffs");
  await mkdir(diffDirectory, { recursive: true });
  await writeFile(path.join(diffDirectory, `${candidate.name}.patch`), `${patch.join("\n")}\n`);

  const rawBody = lines.slice(close + 1).join("\n");
  const adaptedBody = adaptedLines.slice(adaptedClose + 1).join("\n");
  if (rawBody !== adaptedBody) throw new Error(`body changed for ${candidate.name}`);
  manifest.push({
    asset_id: candidate.asset_id,
    name: candidate.name,
    raw_path: candidate.checked_in_path,
    raw_sha256: candidate.raw_sha256,
    adapted_path: `adapted/${candidate.name}/SKILL.md`,
    adapted_sha256: sha256(Buffer.from(adapted, "utf8")),
    core_body_sha256: sha256(Buffer.from(rawBody, "utf8")),
    diff_path: `diffs/${candidate.name}.patch`,
    resource_paths: (candidate.resource_paths ?? []).map((resource) => ({
      ...resource,
      adapted_path: `adapted/${candidate.name}/${resource.path}`,
    })),
  });
}

await writeFile(
  path.join(materialRoot, "adaptation-manifest.json"),
  `${JSON.stringify(
    {
      schema_version: "task1.skill_adaptation_manifest.v1",
      team_id: "T09",
      policy: "Only neutral discovery metadata changed; package bodies and resources are preserved.",
      skills: manifest,
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ adapted: manifest.length, manifest: "source-material/T09/adaptation-manifest.json" }));
