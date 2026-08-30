/** Loadable production restore adapter for the local server_team deployment. */
import type { FormalAssetRestoreAdapter } from "./restore-plan-runtime.js";
import type { FormalAssetRestorePlan } from "./restore-plan-contract.js";
import {
  executeProductionRestorePlan,
  type ProductionAssetRestoreReceipt,
  type ProductionRestoreRuntimeBindings,
} from "./production-restore-executor.js";
import { createServerTeamProductionTransport } from "./server-team-production-transport.js";
import {
  createServerTeamRequirementResolver,
  discoverFrozenSkillPackageRoots,
} from "./server-team-production-requirements.js";
import { createServerTeamMemoryImportHooks } from "./server-team-memory-import-client.js";

export class ServerTeamProductionAdapterConfigError extends Error {
  readonly code = "INVALID_SERVER_TEAM_PRODUCTION_ADAPTER_CONFIG" as const;

  constructor(message: string) {
    super(`server_team production adapter config: ${message}`);
    this.name = "ServerTeamProductionAdapterConfigError";
  }
}

type Environment = Readonly<Record<string, string | undefined>>;

export interface ExecuteServerTeamProductionRestoreOptions {
  readonly env: Environment;
  readonly fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
}

interface RuntimeConfig {
  readonly memoryCoreBaseUrl: string;
  readonly memoryKnowledgeBaseUrl: string;
  readonly userKey: string;
  readonly runtimeServiceId: string;
  readonly runtimeAuthUserId: string;
  readonly frozenDataRoot: string;
}

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ServerTeamProductionAdapterConfigError(`${name} is required`);
  return value;
}

function runtimeConfig(env: Environment): RuntimeConfig {
  return {
    memoryCoreBaseUrl: required(env, "TDAI_FORMAL_MEMORY_CORE_URL"),
    memoryKnowledgeBaseUrl: required(env, "TDAI_FORMAL_MEMORY_KNOWLEDGE_URL"),
    userKey: required(env, "TDAI_EVAL_USER_KEY"),
    runtimeServiceId: required(env, "TDAI_FORMAL_RUNTIME_SERVICE_ID"),
    runtimeAuthUserId: required(env, "TDAI_FORMAL_RUNTIME_AUTH_USER_ID"),
    frozenDataRoot: required(env, "TDAI_FORMAL_DATA_ROOT"),
  };
}

function runtimeBindings(
  plan: FormalAssetRestorePlan,
  config: RuntimeConfig,
): ProductionRestoreRuntimeBindings {
  const datasetSpaceId = plan.identityMappings.space.datasetSpaceId;
  if (!datasetSpaceId) {
    throw new ServerTeamProductionAdapterConfigError("plan has no dataset Space mapping");
  }
  if (plan.identityMappings.users.length === 0) {
    throw new ServerTeamProductionAdapterConfigError("plan has no dataset user mappings");
  }
  return {
    serviceIdsByDatasetSpaceId: { [datasetSpaceId]: config.runtimeServiceId },
    authUserIdsByDatasetUserId: Object.fromEntries(
      plan.identityMappings.users.map((mapping) => [
        mapping.datasetUserId,
        config.runtimeAuthUserId,
      ]),
    ),
    // Production ids are derived after Team/Agent creation by the executor.
    chatMemoryAssetIdsByDatasetAgentId: {},
  };
}

/** Compose and execute restore without starting either service or running a model. */
export async function executeServerTeamProductionRestore(
  plan: FormalAssetRestorePlan,
  options: ExecuteServerTeamProductionRestoreOptions,
): Promise<ProductionAssetRestoreReceipt> {
  const config = runtimeConfig(options.env);
  const bindings = runtimeBindings(plan, config);
  const skillPackageRoots = await discoverFrozenSkillPackageRoots(config.frozenDataRoot);
  const transport = createServerTeamProductionTransport({
    memoryCoreBaseUrl: config.memoryCoreBaseUrl,
    memoryKnowledgeBaseUrl: config.memoryKnowledgeBaseUrl,
    userKey: config.userKey,
    serviceIdsByDatasetSpaceId: bindings.serviceIdsByDatasetSpaceId,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const datasetUserId = plan.identityMappings.users[0]!.datasetUserId;
  const memoryHooks = createServerTeamMemoryImportHooks({
    transport,
    datasetSpaceId: plan.identityMappings.space.datasetSpaceId,
    datasetUserId,
  });
  const resolveRequirement = createServerTeamRequirementResolver({
    serviceIdsByDatasetSpaceId: bindings.serviceIdsByDatasetSpaceId,
    authUserIdsByDatasetUserId: bindings.authUserIdsByDatasetUserId,
    skillPackageRoots,
    importMemoryL1: memoryHooks.importMemoryL1,
    importMemoryL2: memoryHooks.importMemoryL2,
  });
  return executeProductionRestorePlan({
    plan,
    bindings,
    resolveRequirement,
    transport,
  });
}

/** Export name required by restore-plan-runtime.ts dynamic adapter boundary. */
export const executeFormalAssetRestorePlan: FormalAssetRestoreAdapter["executeFormalAssetRestorePlan"] =
  async (plan) => executeServerTeamProductionRestore(plan, { env: process.env });
