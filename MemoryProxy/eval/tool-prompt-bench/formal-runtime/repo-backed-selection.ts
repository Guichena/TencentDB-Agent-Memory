export const ARCHIVED_NO_WORKSPACE_TEAMS = Object.freeze([
  "T05",
  "T06",
  "T13",
  "T14",
] as const);

const archivedTeams = new Set<string>(ARCHIVED_NO_WORKSPACE_TEAMS);

export const REPO_BACKED_DATASET_REVISION = "formal-v2.1-repo-backed-640" as const;

export const REPO_BACKED_COUNTS = Object.freeze({
  total: 640,
  dev: 320,
  hiddenTest: 320,
} as const);

export function isRepoBackedTeam(teamId: string): boolean {
  return !archivedTeams.has(teamId);
}
