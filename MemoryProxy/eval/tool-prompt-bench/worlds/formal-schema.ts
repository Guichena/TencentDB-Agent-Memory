/**
 * Formal V2 contract for source-grounded evaluation worlds.
 *
 * This module deliberately does not import the Pilot `world-schema.ts`.  Pilot
 * worlds are shared mock fixtures; formal worlds are recoverable Space snapshots
 * with runtime identity, asset visibility and provenance as first-class data.
 */

export type FormalSplit = "dev" | "hidden_test";
export type FormalOrigin =
  | "synthetic_agent_replay"
  | "evidence_grounded_synthesis"
  | "repo_document"
  | "repo_code";
/** Every formal asset is transformed for the TDAI role; verbatim benchmark copying is not a valid transform. */
export type FormalTransform =
  | "redacted_replay"
  | "atomic_fact_extraction"
  | "multi_session_scene_synthesis"
  | "stable_profile_derivation"
  | "skill_procedure_derivation"
  | "repo_document_snapshot"
  | "code_graph_build"
  | "paired_counterfactual"
  | "natural_negative_selection";
export type FormalFamily = "memory" | "skill" | "knowledge" | "none";
export type PairRole = "positive" | "negative";
/** A private Skill is usable by its owner; a team Skill is discoverable by teammates. */
export type SkillVisibility = "private" | "team";
export type KnowledgeVisibility = "fixed";

export interface SourceEvidence {
  sourceId: string;
  dataset: string;
  datasetRevision: string;
  datasetArtifactSha256: string;
  sourceRepoUrl: string;
  sourceRepoCommit: string;
  sourceRepoLicense: string;
  sourceTaskId?: string;
  trajectoryId?: string;
  origin: FormalOrigin;
  sourceTaskTime: string;
  trajectoryGeneratedAt: string;
  worldAsOf: string;
  evidenceLocator: string;
  evidenceSha256: string;
  transform: FormalTransform;
  transformVersion: string;
  transformInputSha256: string;
  piiScan: "passed";
  reviewStatus: "reviewed";
  reviewedBy: string;
  contentHash: string;
}

export interface RuntimePolicy {
  allowLlmWrite: false;
  allowLlmExtract: false;
  assetReflection: false;
  writeL0: false;
  archiveWriteBack: false;
}

export interface FormalWorld {
  worldId: string;
  spaceId: string;
  split: FormalSplit;
  status: "draft" | "frozen";
  worldAsOf: string;
  teamIds: readonly [string, string];
  sourceEvidenceIds: string[];
  snapshotId: string;
  leakageGroup: string;
  runtimePolicy: RuntimePolicy;
  contentHash: string;
}

export interface FormalTeam {
  teamId: string;
  worldId: string;
  name: string;
  businessAgentIds: string[];
  taskIds: string[];
  sourceEvidenceIds: string[];
  contentHash: string;
}

export interface BusinessAgent {
  agentId: string;
  teamId: string;
  name: string;
  agentDetail: {
    description: string;
    prompt: string;
    contentHash: string;
  };
  importedMemoryAgentIds: string[];
  /** Frozen native listing for the agent's own Skill assets; not a search ACL. */
  boundSkillIds: string[];
  fixedKnowledgeIds: string[];
  sourceEvidenceIds: string[];
  contentHash: string;
}

export interface WorkspaceRef {
  workspaceId: string;
  repoSlug: string;
  repoUrl: string;
  baseCommit: string;
  sourceRepoLicense: string;
  treeSha256: string;
  fileManifestSha256: string;
  state: "clean" | "dirty";
  overlayPatchSha256?: string;
  contentHash: string;
}

export interface ProjectRef {
  projectRefId: string;
  repoSlug: string;
  repoUrl: string;
  pinnedCommit: string;
  sourceEvidenceIds: string[];
  contentHash: string;
}

export interface FormalTask {
  taskId: string;
  teamId: string;
  title: string;
  description: string;
  goal: string;
  eligibleAgentIds: string[];
  projectRef: ProjectRef;
  workspace: WorkspaceRef;
  sourceEvidenceIds: string[];
  contentHash: string;
}

interface AssetBase {
  assetId: string;
  ownerAgentId: string;
  sourceEvidenceIds: string[];
  observedAt: string;
  contentHash: string;
}

export interface L0Message {
  messageId: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  sourceEvidenceIds: string[];
  observedAt: string;
  contentHash: string;
}

export interface L0Conversation extends AssetBase {
  sessionId: string;
  messages: L0Message[];
}

export interface L1Memory extends AssetBase {
  type: "persona" | "preference" | "decision" | "event" | "fact";
  content: string;
  status: "active" | "superseded" | "invalid";
  supersededBy?: string;
  validFrom: string;
  validUntil?: string;
}

export interface L2Scene extends AssetBase {
  path: string;
  summary: string;
  content: string;
  injected: boolean;
  supportingSessionIds: string[];
}

export interface L3Profile extends AssetBase {
  content: string;
  stability: "agent" | "team";
}

export interface SkillAsset extends AssetBase {
  name: string;
  version: string;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  repoCommit: string;
  /** Resolver visibility: own Skills are always usable; team Skills are shared in-team. */
  visibility: SkillVisibility;
  manifest: Array<{ path: string; sha256: string }>;
}

export interface KnowledgeBinding {
  agentId: string;
  visibility: KnowledgeVisibility;
}

export interface KnowledgeAsset extends AssetBase {
  type: "wiki" | "code_graph";
  name: string;
  repoUrl?: string;
  repoCommit?: string;
  indexVersion?: string;
  snapshotSha256: string;
  bindings: KnowledgeBinding[];
}

export interface FormalAssets {
  l0Conversations: L0Conversation[];
  l1Memories: L1Memory[];
  l2Scenes: L2Scene[];
  l3Profiles: L3Profile[];
  skills: SkillAsset[];
  knowledge: KnowledgeAsset[];
}

export interface RuntimeIdentity {
  spaceId: string;
  teamId: string;
  /** Controlled benchmark user; credentials/user keys never belong in fixtures. */
  userId: string;
  agentId: string;
  taskId: string;
  sessionId: string;
  agentSource: "codex";
}

/** Runner-safe Case input. Provider serialization must use `ProviderVisibleCase`. */
export interface PublicCaseInput {
  caseId: string;
  identity: RuntimeIdentity;
  snapshotId: string;
  workspace: WorkspaceRef;
  language: "zh" | "en";
  difficulty: "easy" | "medium" | "hard";
  contextMessages: Array<{ role: "user" | "assistant"; content: string }>;
  query: string;
  visibleAssetSetSha256: string;
  contentHash: string;
}

/** The sole Case shape that may be serialized into a provider request. */
export interface ProviderVisibleCase {
  caseId: string;
  language: "zh" | "en";
  contextMessages: Array<{ role: "user" | "assistant"; content: string }>;
  query: string;
}

export interface FormalToolCall {
  family: Exclude<FormalFamily, "none">;
  operation: string;
  endpoint: string;
  requiredFields: string[];
}

export interface FormalGold {
  route: FormalFamily;
  requiredSequences: FormalToolCall[][];
  allowedAlternativeSequences: FormalToolCall[][];
  forbiddenFamilies: Exclude<FormalFamily, "none">[];
  maxAssetCalls: number;
  goldAssetIds: string[];
  evidenceRefs: string[];
  ablationEvidence: string;
  noToolEvidence?: string;
  contentHash: string;
}

/** Private authoring/scoring data. It must never be rendered to the provider. */
export interface PrivateCaseAnnotation {
  caseId: string;
  sourceEvidenceIds: string[];
  pairId?: string;
  pairRole?: PairRole;
  gold: FormalGold;
  annotationReason: string;
  contentHash: string;
}

export interface FormalPair {
  pairId: string;
  positiveCaseId: string;
  negativeCaseId: string;
  counterfactualKind:
    | "answer_in_current_context"
    | "answer_in_workspace"
    | "knowledge_repo_or_commit_mismatch"
    | "superficial_overlap"
    | "version_or_environment_exclusion"
    | "general_knowledge"
    | "prior_tool_result_available";
  controlledDeltaSha256: string;
  currentEvidenceRefs: string[];
  contentHash: string;
}

export interface VisibleAssetSet {
  teamId: string;
  userId: string;
  agentId: string;
  assetIds: string[];
  sha256: string;
}

export interface WorldSnapshot {
  snapshotId: string;
  worldId: string;
  sourcePackSha256: string;
  visibleAssetSets: VisibleAssetSet[];
  workspaceManifestSha256: string;
  runtimePolicySha256: string;
  cacheResetRecipeSha256: string;
  contentHash: string;
}

export interface FormalRunRecord {
  runId: string;
  caseId: string;
  snapshotId: string;
  identity: RuntimeIdentity;
  visibleAssetSetSha256: string;
  runtimeConfigSha256: string;
  injectionSha256: string;
  staticToolDescriptionSha256: string;
  attemptTraceSha256: string;
  cacheResetVerified: boolean;
  recordHash: string;
}

export interface FormalWorldContract {
  world: FormalWorld;
  sourceEvidence: SourceEvidence[];
  teams: FormalTeam[];
  businessAgents: BusinessAgent[];
  tasks: FormalTask[];
  assets: FormalAssets;
  publicCases: PublicCaseInput[];
  privateAnnotations: PrivateCaseAnnotation[];
  pairs: FormalPair[];
  snapshot: WorldSnapshot;
  runRecords?: FormalRunRecord[];
}

export interface FormalValidationResult {
  valid: boolean;
  errors: string[];
}

const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_COMMIT = /^[a-f0-9]{40}$/i;
const FORMAL_TRANSFORMS = new Set<FormalTransform>([
  "redacted_replay",
  "atomic_fact_extraction",
  "multi_session_scene_synthesis",
  "stable_profile_derivation",
  "skill_procedure_derivation",
  "repo_document_snapshot",
  "code_graph_build",
  "paired_counterfactual",
  "natural_negative_selection",
]);
const PRIVATE_PUBLIC_KEYS = new Set([
  "gold", "pairId", "pairRole", "sourceEvidenceIds", "goldAssetIds",
  "requiredSequences", "allowedAlternativeSequences", "forbiddenFamilies",
  "annotationReason", "ablationEvidence", "noToolEvidence", "route", "family",
]);

function validTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function beforeOrEqual(left: string, right: string): boolean {
  return new Date(left).getTime() <= new Date(right).getTime();
}

function requireText(errors: string[], path: string, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${path} is required`);
}

function requireHash(errors: string[], path: string, value: unknown): void {
  if (typeof value !== "string" || !SHA256.test(value)) errors.push(`${path} must be a sha256`);
}

function requireCommit(errors: string[], path: string, value: unknown): void {
  if (typeof value !== "string" || !GIT_COMMIT.test(value)) errors.push(`${path} must be a 40-char git commit`);
}

function requireTimestamp(errors: string[], path: string, value: unknown): void {
  if (typeof value !== "string" || !validTimestamp(value)) errors.push(`${path} must be an ISO timestamp`);
}

function ids<T>(items: T[], getId: (item: T) => string): Set<string> {
  return new Set(items.map(getId));
}

function requireKnownRefs(errors: string[], path: string, refs: string[], known: Set<string>): void {
  if (refs.length === 0) errors.push(`${path} must not be empty`);
  for (const ref of refs) if (!known.has(ref)) errors.push(`${path} references unknown source ${ref}`);
}

function scanForPrivateKeys(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForPrivateKeys(item, `${path}[${index}]`, errors));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_PUBLIC_KEYS.has(key)) errors.push(`${path}.${key} is private and must not be provider-visible`);
    scanForPrivateKeys(child, `${path}.${key}`, errors);
  }
}

/** Runtime guard for code paths that serialize a public case to a provider. */
export function validatePublicCaseInput(input: PublicCaseInput): FormalValidationResult {
  const errors: string[] = [];
  requireText(errors, "caseId", input.caseId);
  requireText(errors, "identity.spaceId", input.identity?.spaceId);
  requireText(errors, "identity.teamId", input.identity?.teamId);
  requireText(errors, "identity.userId", input.identity?.userId);
  requireText(errors, "identity.agentId", input.identity?.agentId);
  requireText(errors, "identity.taskId", input.identity?.taskId);
  requireText(errors, "identity.sessionId", input.identity?.sessionId);
  if (input.identity?.agentSource !== "codex") errors.push("identity.agentSource must be codex");
  requireText(errors, "snapshotId", input.snapshotId);
  requireText(errors, "query", input.query);
  requireHash(errors, "visibleAssetSetSha256", input.visibleAssetSetSha256);
  requireHash(errors, "contentHash", input.contentHash);
  requireHash(errors, "workspace.treeSha256", input.workspace?.treeSha256);
  requireCommit(errors, "workspace.baseCommit", input.workspace?.baseCommit);
  scanForPrivateKeys(input, "publicCase", errors);
  return { valid: errors.length === 0, errors };
}

/**
 * Produces the provider allowlist. Workspace is only for local materialization;
 * identity is only for Session Init / headers; neither belongs in provider text.
 */
export function toProviderVisibleCase(input: PublicCaseInput): ProviderVisibleCase {
  const result = validatePublicCaseInput(input);
  if (!result.valid) throw new Error(result.errors.join("\n"));
  return structuredClone({
    caseId: input.caseId,
    language: input.language,
    contextMessages: input.contextMessages,
    query: input.query,
  });
}

function allAssets(assets: FormalAssets): AssetBase[] {
  return [
    ...assets.l0Conversations,
    ...assets.l1Memories,
    ...assets.l2Scenes,
    ...assets.l3Profiles,
    ...assets.skills,
    ...assets.knowledge,
  ];
}

function assetTeamId(asset: AssetBase, agentById: Map<string, BusinessAgent>): string | undefined {
  return agentById.get(asset.ownerAgentId)?.teamId;
}

function validateEvidence(errors: string[], source: SourceEvidence, worldAsOf: string): void {
  const prefix = `source ${source.sourceId}`;
  [
    ["dataset", source.dataset], ["datasetRevision", source.datasetRevision],
    ["sourceRepoUrl", source.sourceRepoUrl], ["sourceRepoLicense", source.sourceRepoLicense],
    ["evidenceLocator", source.evidenceLocator], ["transform", source.transform],
    ["transformVersion", source.transformVersion], ["reviewedBy", source.reviewedBy],
  ].forEach(([key, value]) => requireText(errors, `${prefix}.${key}`, value));
  requireHash(errors, `${prefix}.datasetArtifactSha256`, source.datasetArtifactSha256);
  requireCommit(errors, `${prefix}.sourceRepoCommit`, source.sourceRepoCommit);
  requireTimestamp(errors, `${prefix}.sourceTaskTime`, source.sourceTaskTime);
  requireTimestamp(errors, `${prefix}.trajectoryGeneratedAt`, source.trajectoryGeneratedAt);
  requireTimestamp(errors, `${prefix}.worldAsOf`, source.worldAsOf);
  requireHash(errors, `${prefix}.evidenceSha256`, source.evidenceSha256);
  requireHash(errors, `${prefix}.transformInputSha256`, source.transformInputSha256);
  requireHash(errors, `${prefix}.contentHash`, source.contentHash);
  if (!FORMAL_TRANSFORMS.has(source.transform)) errors.push(`${prefix}.transform is not a formal TDAI transform`);
  if (source.origin === "synthetic_agent_replay" && !source.trajectoryId) {
    errors.push(`${prefix}.trajectoryId is required for synthetic_agent_replay`);
  }
  if (validTimestamp(source.sourceTaskTime) && validTimestamp(worldAsOf) && !beforeOrEqual(source.sourceTaskTime, worldAsOf)) {
    errors.push(`${prefix}.sourceTaskTime is after worldAsOf`);
  }
  if (source.worldAsOf !== worldAsOf) errors.push(`${prefix}.worldAsOf must equal world.worldAsOf`);
  if (source.piiScan !== "passed") errors.push(`${prefix}.piiScan must be passed`);
  if (source.reviewStatus !== "reviewed") errors.push(`${prefix}.reviewStatus must be reviewed`);
}

/**
 * Validates the formal contract without touching a provider, bridge, workspace or
 * cache. Errors are accumulated so D0 source-pack work can be fixed in one pass.
 */
export function validateFormalWorldContract(contract: FormalWorldContract): FormalValidationResult {
  const errors: string[] = [];
  const { world, teams, businessAgents, tasks, assets, sourceEvidence, publicCases, privateAnnotations, pairs, snapshot } = contract;
  requireText(errors, "world.worldId", world.worldId);
  requireText(errors, "world.spaceId", world.spaceId);
  requireTimestamp(errors, "world.worldAsOf", world.worldAsOf);
  requireHash(errors, "world.contentHash", world.contentHash);
  if (world.teamIds.length !== 2 || world.teamIds[0] === world.teamIds[1]) errors.push("world must declare exactly two distinct teams");
  if (world.runtimePolicy.allowLlmWrite || world.runtimePolicy.allowLlmExtract || world.runtimePolicy.assetReflection || world.runtimePolicy.writeL0 || world.runtimePolicy.archiveWriteBack) {
    errors.push("world.runtimePolicy must disable writes, extraction, reflection, L0 writes, and archive write-back");
  }

  const sourceIds = ids(sourceEvidence, (source) => source.sourceId);
  if (sourceIds.size !== sourceEvidence.length) errors.push("source evidence ids must be unique");
  for (const source of sourceEvidence) validateEvidence(errors, source, world.worldAsOf);
  requireKnownRefs(errors, "world.sourceEvidenceIds", world.sourceEvidenceIds, sourceIds);

  const teamIds = ids(teams, (team) => team.teamId);
  if (teams.length !== 2) errors.push("formal world contract must contain exactly two teams");
  if (teamIds.size !== teams.length) errors.push("team ids must be unique");
  for (const teamId of world.teamIds) if (!teamIds.has(teamId)) errors.push(`world references unknown team ${teamId}`);
  for (const team of teams) {
    if (team.worldId !== world.worldId) errors.push(`team ${team.teamId} belongs to another world`);
    requireHash(errors, `team ${team.teamId}.contentHash`, team.contentHash);
    requireKnownRefs(errors, `team ${team.teamId}.sourceEvidenceIds`, team.sourceEvidenceIds, sourceIds);
  }

  const agentsById = new Map(businessAgents.map((agent) => [agent.agentId, agent]));
  if (agentsById.size !== businessAgents.length) errors.push("business agent ids must be unique");
  for (const agent of businessAgents) {
    if (!teamIds.has(agent.teamId)) errors.push(`agent ${agent.agentId} has unknown team`);
    if (agent.importedMemoryAgentIds.length > 2) errors.push(`agent ${agent.agentId} imports more than two memory agents`);
    if (new Set(agent.importedMemoryAgentIds).size !== agent.importedMemoryAgentIds.length) errors.push(`agent ${agent.agentId} repeats imported memory agents`);
    requireHash(errors, `agent ${agent.agentId}.contentHash`, agent.contentHash);
    requireHash(errors, `agent ${agent.agentId}.agentDetail.contentHash`, agent.agentDetail.contentHash);
    requireKnownRefs(errors, `agent ${agent.agentId}.sourceEvidenceIds`, agent.sourceEvidenceIds, sourceIds);
  }
  for (const agent of businessAgents) {
    for (const importedId of agent.importedMemoryAgentIds) {
      const imported = agentsById.get(importedId);
      if (!imported) errors.push(`agent ${agent.agentId} imports unknown agent ${importedId}`);
      else if (imported.teamId !== agent.teamId) errors.push(`agent ${agent.agentId} imports cross-team memory from ${importedId}`);
    }
  }
  for (const team of teams) {
    for (const agentId of team.businessAgentIds) {
      if (agentsById.get(agentId)?.teamId !== team.teamId) errors.push(`team ${team.teamId} has invalid agent ${agentId}`);
    }
  }

  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  if (taskById.size !== tasks.length) errors.push("task ids must be unique");
  for (const task of tasks) {
    if (!teamIds.has(task.teamId)) errors.push(`task ${task.taskId} has unknown team`);
    requireCommit(errors, `task ${task.taskId}.projectRef.pinnedCommit`, task.projectRef.pinnedCommit);
    requireHash(errors, `task ${task.taskId}.projectRef.contentHash`, task.projectRef.contentHash);
    requireCommit(errors, `task ${task.taskId}.workspace.baseCommit`, task.workspace.baseCommit);
    requireText(errors, `task ${task.taskId}.workspace.repoUrl`, task.workspace.repoUrl);
    requireText(errors, `task ${task.taskId}.workspace.sourceRepoLicense`, task.workspace.sourceRepoLicense);
    requireHash(errors, `task ${task.taskId}.workspace.treeSha256`, task.workspace.treeSha256);
    requireHash(errors, `task ${task.taskId}.workspace.fileManifestSha256`, task.workspace.fileManifestSha256);
    requireHash(errors, `task ${task.taskId}.workspace.contentHash`, task.workspace.contentHash);
    if (task.workspace.state === "dirty" && !task.workspace.overlayPatchSha256) errors.push(`task ${task.taskId} dirty workspace lacks overlayPatchSha256`);
    if (task.workspace.overlayPatchSha256) requireHash(errors, `task ${task.taskId}.workspace.overlayPatchSha256`, task.workspace.overlayPatchSha256);
    requireKnownRefs(errors, `task ${task.taskId}.sourceEvidenceIds`, task.sourceEvidenceIds, sourceIds);
    requireKnownRefs(errors, `task ${task.taskId}.projectRef.sourceEvidenceIds`, task.projectRef.sourceEvidenceIds, sourceIds);
    requireHash(errors, `task ${task.taskId}.contentHash`, task.contentHash);
    for (const agentId of task.eligibleAgentIds) if (agentsById.get(agentId)?.teamId !== task.teamId) errors.push(`task ${task.taskId} has ineligible agent ${agentId}`);
  }
  for (const team of teams) for (const taskId of team.taskIds) if (taskById.get(taskId)?.teamId !== team.teamId) errors.push(`team ${team.teamId} has invalid task ${taskId}`);

  const assetById = new Map(allAssets(assets).map((asset) => [asset.assetId, asset]));
  if (assetById.size !== allAssets(assets).length) errors.push("asset ids must be globally unique");
  for (const asset of allAssets(assets)) {
    if (!agentsById.has(asset.ownerAgentId)) errors.push(`asset ${asset.assetId} has unknown owner agent`);
    requireTimestamp(errors, `asset ${asset.assetId}.observedAt`, asset.observedAt);
    if (validTimestamp(asset.observedAt) && validTimestamp(world.worldAsOf) && !beforeOrEqual(asset.observedAt, world.worldAsOf)) errors.push(`asset ${asset.assetId} is after worldAsOf`);
    requireHash(errors, `asset ${asset.assetId}.contentHash`, asset.contentHash);
    requireKnownRefs(errors, `asset ${asset.assetId}.sourceEvidenceIds`, asset.sourceEvidenceIds, sourceIds);
  }
  for (const session of assets.l0Conversations) {
    if (session.messages.length === 0) errors.push(`L0 conversation ${session.assetId} has no messages`);
    for (const message of session.messages) {
      requireText(errors, `L0 message ${message.messageId}.content`, message.content);
      requireTimestamp(errors, `L0 message ${message.messageId}.observedAt`, message.observedAt);
      requireHash(errors, `L0 message ${message.messageId}.contentHash`, message.contentHash);
      requireKnownRefs(errors, `L0 message ${message.messageId}.sourceEvidenceIds`, message.sourceEvidenceIds, sourceIds);
      if (validTimestamp(message.observedAt) && validTimestamp(world.worldAsOf) && !beforeOrEqual(message.observedAt, world.worldAsOf)) {
        errors.push(`L0 message ${message.messageId} is after worldAsOf`);
      }
    }
  }
  const sessionIds = ids(assets.l0Conversations, (session) => session.sessionId);
  for (const scene of assets.l2Scenes) {
    for (const sessionId of scene.supportingSessionIds) if (!sessionIds.has(sessionId)) errors.push(`L2 scene ${scene.assetId} references unknown session ${sessionId}`);
  }
  for (const scene of assets.l2Scenes) if (scene.supportingSessionIds.length < 2) errors.push(`L2 scene ${scene.assetId} needs at least two supporting sessions`);
  for (const memory of assets.l1Memories) if (memory.status === "superseded" && !memory.supersededBy) errors.push(`superseded memory ${memory.assetId} lacks supersededBy`);
  for (const skill of assets.skills) {
    requireCommit(errors, `skill ${skill.assetId}.repoCommit`, skill.repoCommit);
    if (skill.visibility !== "private" && skill.visibility !== "team") errors.push(`skill ${skill.assetId} has invalid visibility`);
    for (const file of skill.manifest) requireHash(errors, `skill ${skill.assetId}.manifest ${file.path}`, file.sha256);
  }
  for (const knowledge of assets.knowledge) {
    requireHash(errors, `knowledge ${knowledge.assetId}.snapshotSha256`, knowledge.snapshotSha256);
    if (knowledge.type === "code_graph") {
      requireText(errors, `knowledge ${knowledge.assetId}.repoUrl`, knowledge.repoUrl);
      requireCommit(errors, `knowledge ${knowledge.assetId}.repoCommit`, knowledge.repoCommit);
      requireText(errors, `knowledge ${knowledge.assetId}.indexVersion`, knowledge.indexVersion);
    }
    for (const binding of knowledge.bindings) if (agentsById.get(binding.agentId)?.teamId !== assetTeamId(knowledge, agentsById)) errors.push(`knowledge ${knowledge.assetId} is bound across teams`);
  }
  const skillById = new Map(assets.skills.map((skill) => [skill.assetId, skill]));
  const knowledgeById = new Map(assets.knowledge.map((knowledge) => [knowledge.assetId, knowledge]));
  for (const agent of businessAgents) {
    if (new Set(agent.boundSkillIds).size !== agent.boundSkillIds.length) errors.push(`agent ${agent.agentId} repeats bound skills`);
    for (const skillId of agent.boundSkillIds) {
      const skill = skillById.get(skillId);
      if (!skill || skill.ownerAgentId !== agent.agentId) {
        errors.push(`agent ${agent.agentId} has invalid bound skill ${skillId}`);
      }
    }
    for (const knowledgeId of agent.fixedKnowledgeIds) {
      const knowledge = knowledgeById.get(knowledgeId);
      if (!knowledge || !knowledge.bindings.some((binding) => binding.agentId === agent.agentId)) {
        errors.push(`agent ${agent.agentId} has invalid fixed knowledge ${knowledgeId}`);
      }
    }
  }

  requireHash(errors, "snapshot.sourcePackSha256", snapshot.sourcePackSha256);
  requireHash(errors, "snapshot.workspaceManifestSha256", snapshot.workspaceManifestSha256);
  requireHash(errors, "snapshot.runtimePolicySha256", snapshot.runtimePolicySha256);
  requireHash(errors, "snapshot.cacheResetRecipeSha256", snapshot.cacheResetRecipeSha256);
  requireHash(errors, "snapshot.contentHash", snapshot.contentHash);
  if (snapshot.worldId !== world.worldId || snapshot.snapshotId !== world.snapshotId) errors.push("snapshot does not belong to world");
  const visibleByIdentity = new Map(snapshot.visibleAssetSets.map((set) => [`${set.userId}\0${set.agentId}`, set]));
  if (visibleByIdentity.size !== snapshot.visibleAssetSets.length) errors.push("snapshot has duplicate visible sets for a user/agent identity");
  for (const set of snapshot.visibleAssetSets) {
    requireText(errors, `visible asset set ${set.agentId}.userId`, set.userId);
    requireHash(errors, `visible asset set ${set.agentId}.sha256`, set.sha256);
    const agent = agentsById.get(set.agentId);
    if (!agent || agent.teamId !== set.teamId) errors.push(`visible asset set ${set.agentId} has invalid identity`);
    for (const assetId of set.assetIds) {
      const asset = assetById.get(assetId);
      if (!asset) { errors.push(`visible asset set ${set.agentId} references unknown asset ${assetId}`); continue; }
      if (!agent) continue;
      const ownerTeam = assetTeamId(asset, agentsById);
      if (ownerTeam !== agent.teamId) errors.push(`visible asset ${assetId} crosses team boundary for ${agent.agentId}`);
      if (assets.l0Conversations.includes(asset as L0Conversation)
        || assets.l1Memories.includes(asset as L1Memory)
        || assets.l2Scenes.includes(asset as L2Scene)
        || assets.l3Profiles.includes(asset as L3Profile)) {
        if (asset.ownerAgentId !== agent.agentId && !agent.importedMemoryAgentIds.includes(asset.ownerAgentId)) {
          errors.push(`visible memory asset ${assetId} is not self/imported for ${agent.agentId}`);
        }
      } else if (assets.skills.includes(asset as SkillAsset)) {
        const skill = asset as SkillAsset;
        const owner = agentsById.get(skill.ownerAgentId);
        const isOwnedByCurrentAgent = skill.ownerAgentId === agent.agentId;
        const isTeamVisible = skill.visibility === "team" && owner?.teamId === agent.teamId;
        if (!isOwnedByCurrentAgent && !isTeamVisible) {
          errors.push(`visible skill ${assetId} is neither current-agent owned nor team-visible for ${agent.agentId}`);
        }
      } else if (assets.knowledge.includes(asset as KnowledgeAsset)
        && !(asset as KnowledgeAsset).bindings.some((binding) => binding.agentId === agent.agentId)) {
        errors.push(`visible knowledge ${assetId} is not fixed for ${agent.agentId}`);
      }
    }
  }
  for (const agent of businessAgents) {
    if (![...visibleByIdentity.values()].some((set) => set.agentId === agent.agentId)) {
      errors.push(`snapshot lacks a visible asset set for ${agent.agentId}`);
    }
  }

  const publicById = new Map(publicCases.map((item) => [item.caseId, item]));
  if (publicById.size !== publicCases.length) errors.push("public case ids must be unique");
  for (const item of publicCases) {
    errors.push(...validatePublicCaseInput(item).errors.map((error) => `${item.caseId}: ${error}`));
    if (item.identity.spaceId !== world.spaceId) errors.push(`${item.caseId}: identity belongs to another space`);
    const task = taskById.get(item.identity.taskId);
    if (!task || task.teamId !== item.identity.teamId || !task.eligibleAgentIds.includes(item.identity.agentId)) errors.push(`${item.caseId}: identity cannot access task`);
    if (task && (
      item.workspace.workspaceId !== task.workspace.workspaceId
      || item.workspace.repoSlug !== task.workspace.repoSlug
      || item.workspace.baseCommit !== task.workspace.baseCommit
      || item.workspace.treeSha256 !== task.workspace.treeSha256
      || item.workspace.fileManifestSha256 !== task.workspace.fileManifestSha256
    )) {
      errors.push(`${item.caseId}: workspace does not match selected task snapshot`);
    }
    const visible = visibleByIdentity.get(`${item.identity.userId}\0${item.identity.agentId}`);
    if (!visible || visible.teamId !== item.identity.teamId || visible.userId !== item.identity.userId || visible.sha256 !== item.visibleAssetSetSha256) errors.push(`${item.caseId}: visible asset set does not match snapshot identity`);
    if (item.snapshotId !== snapshot.snapshotId) errors.push(`${item.caseId}: snapshot mismatch`);
  }

  const annotationByCase = new Map(privateAnnotations.map((item) => [item.caseId, item]));
  if (annotationByCase.size !== privateAnnotations.length) errors.push("private annotation case ids must be unique");
  for (const annotation of privateAnnotations) {
    if (!publicById.has(annotation.caseId)) errors.push(`private annotation ${annotation.caseId} has no public case`);
    requireKnownRefs(errors, `private annotation ${annotation.caseId}.sourceEvidenceIds`, annotation.sourceEvidenceIds, sourceIds);
    requireHash(errors, `private annotation ${annotation.caseId}.contentHash`, annotation.contentHash);
    requireHash(errors, `gold ${annotation.caseId}.contentHash`, annotation.gold.contentHash);
    requireKnownRefs(errors, `gold ${annotation.caseId}.evidenceRefs`, annotation.gold.evidenceRefs, sourceIds);
    if (annotation.gold.route === "none") {
      if (annotation.gold.maxAssetCalls !== 0 || annotation.gold.requiredSequences.length !== 0 || !annotation.gold.noToolEvidence) errors.push(`no-tool Gold ${annotation.caseId} is incomplete`);
    } else if (annotation.gold.requiredSequences.length === 0 || annotation.gold.goldAssetIds.length === 0 || !annotation.gold.ablationEvidence) {
      errors.push(`positive Gold ${annotation.caseId} lacks sequence, asset, or ablation evidence`);
    }
    if (Boolean(annotation.pairId) !== Boolean(annotation.pairRole)) errors.push(`private annotation ${annotation.caseId} must set pairId and pairRole together`);
  }

  const pairIds = ids(pairs, (pair) => pair.pairId);
  if (pairIds.size !== pairs.length) errors.push("pair ids must be unique");
  for (const pair of pairs) {
    const positive = publicById.get(pair.positiveCaseId);
    const negative = publicById.get(pair.negativeCaseId);
    const positiveAnnotation = annotationByCase.get(pair.positiveCaseId);
    const negativeAnnotation = annotationByCase.get(pair.negativeCaseId);
    requireHash(errors, `pair ${pair.pairId}.controlledDeltaSha256`, pair.controlledDeltaSha256);
    requireHash(errors, `pair ${pair.pairId}.contentHash`, pair.contentHash);
    requireKnownRefs(errors, `pair ${pair.pairId}.currentEvidenceRefs`, pair.currentEvidenceRefs, sourceIds);
    if (!positive || !negative || !positiveAnnotation || !negativeAnnotation) errors.push(`pair ${pair.pairId} references incomplete cases`);
    else {
      if (positiveAnnotation.pairId !== pair.pairId || positiveAnnotation.pairRole !== "positive") errors.push(`pair ${pair.pairId} positive annotation mismatch`);
      if (negativeAnnotation.pairId !== pair.pairId || negativeAnnotation.pairRole !== "negative") errors.push(`pair ${pair.pairId} negative annotation mismatch`);
      const sameScope = positive.identity.teamId === negative.identity.teamId
        && positive.identity.taskId === negative.identity.taskId
        && positive.snapshotId === negative.snapshotId
        && positive.language === negative.language;
      if (!sameScope) errors.push(`pair ${pair.pairId} does not share team, task, language, and snapshot`);
    }
  }

  for (const run of contract.runRecords ?? []) {
    if (!publicById.has(run.caseId)) errors.push(`run ${run.runId} has unknown case`);
    if (run.snapshotId !== snapshot.snapshotId) errors.push(`run ${run.runId} has wrong snapshot`);
    ["visibleAssetSetSha256", "runtimeConfigSha256", "injectionSha256", "staticToolDescriptionSha256", "attemptTraceSha256", "recordHash"].forEach((field) => requireHash(errors, `run ${run.runId}.${field}`, run[field as keyof FormalRunRecord]));
    if (!run.cacheResetVerified) errors.push(`run ${run.runId} has not verified cache reset`);
  }

  return { valid: errors.length === 0, errors };
}

export function assertFormalWorldContract(contract: FormalWorldContract): void {
  const result = validateFormalWorldContract(contract);
  if (!result.valid) throw new Error(result.errors.join("\n"));
}
