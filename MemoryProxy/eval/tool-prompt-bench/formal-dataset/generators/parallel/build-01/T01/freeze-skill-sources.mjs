import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = join(scriptDir, "..", "..", "..", "..");
const sharedDir = join(formalDir, "source-material", "shared", "skills");
const outputDir = join(formalDir, "source-material", "T01");
const inputPack = JSON.parse(readFileSync(join(scriptDir, "input-pack.json"), "utf8"));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function listFiles(root, cursor = root) {
  return readdirSync(cursor, { withFileTypes: true }).flatMap((entry) => {
    const path = join(cursor, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path).replaceAll("\\", "/")];
  });
}

function rawBase(repo) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repo);
  if (!match) throw new Error(`unsupported GitHub repo URL: ${repo}`);
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}`;
}

async function download(url, destination) {
  const response = await fetch(url, { headers: { "user-agent": "tencentdb-agent-memory-dataset-freezer" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return { sha256: sha256(bytes), byte_length: bytes.length };
}

mkdirSync(join(outputDir, "skills"), { recursive: true });
mkdirSync(join(outputDir, "licenses"), { recursive: true });
cpSync(join(sharedDir, "_licenses", "skillsbench", "LICENSE"), join(outputDir, "licenses", "Apache-2.0.txt"));
cpSync(join(sharedDir, "_licenses", "awesomeCopilot", "LICENSE"), join(outputDir, "licenses", "MIT.txt"));

const teamManifest = {
  schema_version: "task1.team_skill_sources.v1",
  team_id: "T01",
  frozen: true,
  sources: [],
};

for (const pin of inputPack.skill_source_pins) {
  const packageDir = join(outputDir, "skills", pin.name);
  const adaptedSource = join(sharedDir, pin.name);
  if (!statSync(adaptedSource).isDirectory()) throw new Error(`missing adapted source: ${adaptedSource}`);
  const adaptedDir = join(packageDir, "adapted");
  cpSync(adaptedSource, adaptedDir, { recursive: true });

  const mainDir = pin.path.slice(0, pin.path.lastIndexOf("/") + 1);
  const adaptedFiles = listFiles(adaptedDir);
  const rawFiles = [];
  for (const relPath of adaptedFiles) {
    const sourcePath = `${mainDir}${relPath}`;
    const url = `${rawBase(pin.repo)}/${pin.revision}/${sourcePath}`;
    const result = await download(url, join(packageDir, "raw", relPath));
    rawFiles.push({ path: relPath, source_path: sourcePath, url, ...result });
  }
  const mainRaw = rawFiles.find((file) => file.path === "SKILL.md");
  if (!mainRaw || mainRaw.sha256 !== pin.raw_sha256) {
    throw new Error(`${pin.name}: main raw SHA mismatch; expected ${pin.raw_sha256}, got ${mainRaw?.sha256}`);
  }
  const adaptedFilesWithHashes = listFiles(adaptedDir).map((relPath) => {
    const bytes = readFileSync(join(adaptedDir, relPath));
    return { path: relPath, sha256: sha256(bytes), byte_length: bytes.length };
  });
  const diffPath = join(packageDir, "adaptation.diff");
  const diff = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--", join(packageDir, "raw"), adaptedDir], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (![0, 1].includes(diff.status)) throw new Error(`${pin.name}: git diff failed: ${diff.stderr}`);
  writeFileSync(diffPath, diff.stdout || "# No adaptation delta.\n");

  const metadata = {
    schema_version: "task1.github_skill_source.v1",
    team_id: "T01",
    name: pin.name,
    repository_url: pin.repo,
    revision: pin.revision,
    source_path: pin.path,
    license_spdx: pin.license,
    license_file: `../../licenses/${pin.license}.txt`,
    visibility: pin.visibility,
    main_raw_sha256: pin.raw_sha256,
    raw_files: rawFiles,
    adapted_files: adaptedFilesWithHashes,
    adaptation_diff: "adaptation.diff",
    frozen: true,
  };
  writeFileSync(join(packageDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  teamManifest.sources.push({
    name: pin.name,
    repository_url: pin.repo,
    revision: pin.revision,
    source_path: pin.path,
    license_spdx: pin.license,
    main_raw_sha256: pin.raw_sha256,
    package_path: `skills/${pin.name}`,
    metadata_sha256: sha256(readFileSync(join(packageDir, "metadata.json"))),
  });
}

teamManifest.sources.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(outputDir, "skill-sources.json"), `${JSON.stringify(teamManifest, null, 2)}\n`);
console.log(JSON.stringify({ outputDir, sourceCount: teamManifest.sources.length }, null, 2));
