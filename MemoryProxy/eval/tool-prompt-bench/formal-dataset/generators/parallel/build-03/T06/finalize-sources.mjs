import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const DATASET = join(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset");
const GEN = join(DATASET, "generators/parallel/build-03/T06");
const SOURCE = join(DATASET, "source-material/T06");
const BATCH = join(GEN, "expand-skill-01");

const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const slash = (path) => path.replaceAll("\\", "/");
const technicalBody = (buffer) => {
  const normalized = buffer.toString("utf8").replaceAll("\r\n", "\n");
  const match = normalized.match(/^---\n[\s\S]*?\n---\n/);
  return match ? normalized.slice(match[0].length) : normalized;
};

const input = await loadJson(join(GEN, "input-pack.json"));
const sourceLock = await loadJson(join(SOURCE, "source-lock.json"));
const manifest = await loadJson(join(BATCH, "adaptation-manifest.json"));
const adaptationEntries = manifest.skills ?? manifest.entries?.filter((item) => !item.resource_of) ?? [];
assert(input.team_id === "T06" && sourceLock.team_id === "T06", "T06 input/source lock mismatch");
assert(sourceLock.skills.length === 16, "expected 16 frozen Skill sources");
assert(adaptationEntries.length === 16, "expected 16 adaptation entries");

const finalized = [];
for (const pool of input.skill_pool) {
  const locked = sourceLock.skills.find((item) => item.asset_id === pool.asset_id);
  assert(locked, `missing source lock entry: ${pool.asset_id}`);
  const rawPath = join(SOURCE, locked.local_raw_path);
  const candidatePath = join(BATCH, "adapted", pool.name, "SKILL.md");
  const adaptedPath = join(SOURCE, "adapted", pool.asset_id, "SKILL.md");
  const raw = await readFile(rawPath);
  const candidate = await readFile(candidatePath);
  assert(sha256(raw) === locked.raw_file_sha256, `raw SHA mismatch: ${pool.asset_id}`);
  assert(technicalBody(raw) === technicalBody(candidate), `technical body changed: ${pool.asset_id}`);
  await mkdir(dirname(adaptedPath), { recursive: true });
  await copyFile(candidatePath, adaptedPath);

  const resources = [];
  for (const resource of locked.resources ?? []) {
    const rawResourcePath = join(SOURCE, resource.local_raw_path);
    const candidateResourcePath = join(BATCH, "adapted", pool.name, resource.path);
    const adaptedResourcePath = join(SOURCE, "adapted", pool.asset_id, resource.path);
    const rawResource = await readFile(rawResourcePath);
    const candidateResource = await readFile(candidateResourcePath);
    assert(sha256(rawResource) === resource.raw_file_sha256, `raw resource SHA mismatch: ${pool.asset_id}/${resource.path}`);
    assert(rawResource.equals(candidateResource), `resource is not byte-exact: ${pool.asset_id}/${resource.path}`);
    await mkdir(dirname(adaptedResourcePath), { recursive: true });
    await copyFile(candidateResourcePath, adaptedResourcePath);
    resources.push({ path: resource.path, sha256: sha256(candidateResource) });
  }

  const rawRelative = slash(relative(SOURCE, rawPath));
  const adaptedRelative = slash(relative(SOURCE, adaptedPath));
  const diff = spawnSync("git", ["diff", "--no-index", "--text", "--unified=3", "--", rawRelative, adaptedRelative], {
    cwd: SOURCE,
  });
  assert(diff.status === 1 && diff.stdout.length > 0, `expected a frontmatter diff for ${pool.asset_id}`);
  const diffPath = join(SOURCE, "diffs", `${pool.asset_id}.diff`);
  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, diff.stdout);
  finalized.push({
    asset_id: pool.asset_id,
    raw_sha256: sha256(raw),
    adapted_sha256: sha256(candidate),
    diff_sha256: sha256(diff.stdout),
    technical_body_preserved: true,
    resources,
  });
}

console.log(JSON.stringify({ team_id: "T06", finalized_count: finalized.length, finalized }, null, 2));
