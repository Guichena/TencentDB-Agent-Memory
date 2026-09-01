import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARCHIVED_TEAMS = new Set(["T05", "T06", "T13", "T14"]);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const datasetRoot = resolve(scriptDirectory, "..");
const benchRoot = resolve(datasetRoot, "..");

interface JsonRecord {
  readonly caseId?: string;
  readonly positiveCaseId?: string;
  readonly identity?: { readonly teamId?: string };
}

interface DatasetFile {
  readonly name: string;
  readonly source: string;
  readonly active: string;
  readonly archive: string;
}

const files: readonly DatasetFile[] = [
  {
    name: "provider-dev",
    source: resolve(datasetRoot, "revisions/formal-v2/provider/dev.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/provider/dev.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/provider/dev.jsonl"),
  },
  {
    name: "provider-hidden",
    source: resolve(datasetRoot, "revisions/formal-v2/provider/hidden.sealed.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/provider/hidden.sealed.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/provider/hidden.sealed.jsonl"),
  },
  {
    name: "gold-dev",
    source: resolve(datasetRoot, "measurement-v2/private/gold/dev.private.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/private/gold/dev.private.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/private/gold/dev.private.jsonl"),
  },
  {
    name: "gold-hidden",
    source: resolve(datasetRoot, "measurement-v2/private/gold/hidden.private.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/private/gold/hidden.private.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/private/gold/hidden.private.jsonl"),
  },
  {
    name: "pairs-dev",
    source: resolve(datasetRoot, "measurement-v2/private/pairs/dev.private.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/private/pairs/dev.private.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/private/pairs/dev.private.jsonl"),
  },
  {
    name: "pairs-hidden",
    source: resolve(datasetRoot, "measurement-v2/private/pairs/hidden.private.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/private/pairs/hidden.private.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/private/pairs/hidden.private.jsonl"),
  },
  {
    name: "case-bindings",
    source: resolve(benchRoot, "formal-runtime/frozen/case-bindings.jsonl"),
    active: resolve(datasetRoot, "repo-backed-v2.1/runtime/case-bindings.jsonl"),
    archive: resolve(datasetRoot, "archive/no-local-workspace-v2.1/runtime/case-bindings.jsonl"),
  },
];

function readJsonl(path: string): readonly JsonRecord[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

function teamId(record: JsonRecord): string {
  const boundTeam = record.identity?.teamId;
  if (boundTeam) return boundTeam;
  const caseId = record.caseId ?? record.positiveCaseId;
  const match = caseId?.match(/^T\d{2}/u);
  if (!match) throw new Error(`cannot determine Team for record: ${JSON.stringify(record)}`);
  return match[0];
}

function writeJsonl(path: string, records: readonly JsonRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const text = records.length === 0
    ? ""
    : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  writeFileSync(path, text, "utf8");
}

const fileCounts: Record<string, { source: number; active: number; archived: number }> = {};

for (const file of files) {
  const source = readJsonl(file.source);
  const archived = source.filter((record) => ARCHIVED_TEAMS.has(teamId(record)));
  const active = source.filter((record) => !ARCHIVED_TEAMS.has(teamId(record)));
  writeJsonl(file.active, active);
  writeJsonl(file.archive, archived);
  fileCounts[file.name] = {
    source: source.length,
    active: active.length,
    archived: archived.length,
  };
}

const selection = {
  schemaVersion: "task1.repo-backed-selection.v1",
  sourceDataset: "task1-data-formal-v2.1",
  activeDataset: "task1-data-formal-v2.1-repo-backed-640",
  reason: "T05, T06, T13 and T14 have benchmark.invalid repositories and no restorable local workspace.",
  archivedTeams: [...ARCHIVED_TEAMS],
  activeTeams: [
    "T01", "T02", "T03", "T04", "T07", "T08", "T09", "T10",
    "T11", "T12", "T15", "T16", "T17", "T18", "T19", "T20",
  ],
  counts: {
    cases: { total: 640, dev: 320, hiddenTest: 320 },
    archivedCases: { total: 160, dev: 0, hiddenTest: 160 },
    pairs: { total: 240, dev: 120, hiddenTest: 120 },
    archivedPairs: { total: 60, dev: 0, hiddenTest: 60 },
  },
  files: fileCounts,
} as const;

const selectionPath = resolve(datasetRoot, "repo-backed-v2.1/SELECTION.json");
mkdirSync(dirname(selectionPath), { recursive: true });
writeFileSync(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");

console.log(JSON.stringify(selection, null, 2));
