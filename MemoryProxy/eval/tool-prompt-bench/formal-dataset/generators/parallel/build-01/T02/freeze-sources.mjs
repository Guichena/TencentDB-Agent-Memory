import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const formalDir = join(scriptDir, "..", "..", "..", "..");
const sharedDir = join(formalDir, "source-material", "shared", "skills");
const outputDir = join(formalDir, "source-material", "T02");
const inputPack = JSON.parse(readFileSync(join(scriptDir, "input-pack.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const canonicalSha256 = (value) => sha256(JSON.stringify(stable(value)));

function listFiles(root, cursor = root) {
  return readdirSync(cursor, { withFileTypes: true }).flatMap((entry) => {
    const path = join(cursor, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path).replaceAll("\\", "/")];
  });
}
function rawBase(repo) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repo);
  if (!match) throw new Error(`unsupported GitHub URL: ${repo}`);
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}`;
}
async function download(url, destination, expectedSha256 = undefined) {
  const response = await fetch(url, { headers: { "user-agent": "tencentdb-agent-memory-dataset-freezer" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (expectedSha256 && actual !== expectedSha256) throw new Error(`SHA mismatch for ${url}: ${actual} != ${expectedSha256}`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return { sha256: actual, byte_length: bytes.length };
}

mkdirSync(join(outputDir, "skills"), { recursive: true });
mkdirSync(join(outputDir, "licenses"), { recursive: true });
mkdirSync(join(outputDir, "workspaces"), { recursive: true });
cpSync(join(sharedDir, "_licenses", "skillsbench", "LICENSE"), join(outputDir, "licenses", "Apache-2.0.txt"));
cpSync(join(sharedDir, "_licenses", "awesomeCopilot", "LICENSE"), join(outputDir, "licenses", "MIT.txt"));

const skillManifest = { schema_version: "task1.team_skill_sources.v1", team_id: "T02", frozen: true, sources: [] };
for (const pin of inputPack.skill_source_pins) {
  const packageDir = join(outputDir, "skills", pin.name);
  const rawDir = join(packageDir, "raw");
  const adaptedDir = join(packageDir, "adapted");
  const sharedAdapted = join(sharedDir, pin.name);
  const adaptedFiles = pin.package_files ?? (existsSync(sharedAdapted) ? listFiles(sharedAdapted) : ["SKILL.md"]);
  const mainDir = pin.path.slice(0, pin.path.lastIndexOf("/") + 1);
  const rawFiles = [];
  for (const relPath of adaptedFiles) {
    const sourcePath = `${mainDir}${relPath}`;
    const url = `${rawBase(pin.repo)}/${pin.revision}/${sourcePath}`;
    const expected = relPath === "SKILL.md" ? pin.raw_sha256 : undefined;
    const result = await download(url, join(rawDir, ...relPath.split("/")), expected);
    rawFiles.push({ path: relPath, source_path: sourcePath, url, ...result });
  }
  if (existsSync(sharedAdapted)) cpSync(sharedAdapted, adaptedDir, { recursive: true });
  else cpSync(rawDir, adaptedDir, { recursive: true });
  const adaptedFilesWithHashes = listFiles(adaptedDir).map((relPath) => {
    const bytes = readFileSync(join(adaptedDir, ...relPath.split("/")));
    return { path: relPath, sha256: sha256(bytes), byte_length: bytes.length };
  });
  const diff = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--", rawDir, adaptedDir], {
    encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  });
  if (![0, 1].includes(diff.status)) throw new Error(`${pin.name}: git diff failed: ${diff.stderr}`);
  writeFileSync(join(packageDir, "adaptation.diff"), diff.stdout || "# No semantic adaptation delta.\n");
  const metadata = {
    schema_version: "task1.github_skill_source.v1",
    team_id: "T02",
    name: pin.name,
    repository_url: pin.repo,
    revision: pin.revision,
    source_path: pin.path,
    license_spdx: pin.license,
    license_file: pin.name === "jupyter-notebook" ? "raw/LICENSE.txt" : `../../licenses/${pin.license}.txt`,
    visibility: pin.visibility,
    description: pin.description,
    use_when: pin.use_when,
    do_not_use_when: pin.do_not_use_when,
    main_raw_sha256: pin.raw_sha256,
    raw_files: rawFiles,
    adapted_files: adaptedFilesWithHashes,
    adaptation_diff: "adaptation.diff",
    frozen: true,
  };
  writeFileSync(join(packageDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  skillManifest.sources.push({
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
skillManifest.sources.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(outputDir, "skill-sources.json"), `${JSON.stringify(skillManifest, null, 2)}\n`);

const projectManifest = { schema_version: "task1.team_project_sources.v1", team_id: "T02", frozen: true, projects: [] };
for (const project of inputPack.project_streams) {
  const projectName = project.repo_slug.replaceAll("/", "__");
  const projectDir = join(outputDir, "workspaces", projectName);
  const frozenFiles = [];
  for (const file of project.files) {
    const url = `${rawBase(project.repo_url)}/${project.commit}/${file.path}`;
    const result = await download(url, join(projectDir, "raw", ...file.path.split("/")), file.sha256);
    frozenFiles.push({ path: file.path, url, ...result });
  }
  const fileManifestSha256 = canonicalSha256(frozenFiles.map(({ path, sha256: hash, byte_length }) => ({ path, sha256: hash, byte_length })));
  const treeSha256 = canonicalSha256({ repo_slug: project.repo_slug, commit: project.commit, files: frozenFiles.map((file) => ({ path: file.path, sha256: file.sha256 })) });
  const metadata = {
    schema_version: "task1.github_workspace_source.v1",
    team_id: "T02",
    task_id: project.task_id,
    title: project.title,
    repository_url: project.repo_url,
    repo_slug: project.repo_slug,
    revision: project.commit,
    commit_time: project.commit_time,
    license_spdx: project.license,
    files: frozenFiles,
    file_manifest_sha256: fileManifestSha256,
    tree_sha256: treeSha256,
    frozen: true,
  };
  writeFileSync(join(projectDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  projectManifest.projects.push({
    task_id: project.task_id,
    repo_slug: project.repo_slug,
    package_path: `workspaces/${projectName}`,
    revision: project.commit,
    license_spdx: project.license,
    file_manifest_sha256: fileManifestSha256,
    tree_sha256: treeSha256,
    metadata_sha256: sha256(readFileSync(join(projectDir, "metadata.json"))),
  });
}
writeFileSync(join(outputDir, "project-sources.json"), `${JSON.stringify(projectManifest, null, 2)}\n`);
console.log(JSON.stringify({ skill_sources: skillManifest.sources.length, project_sources: projectManifest.projects.length, output: outputDir }, null, 2));
