/** Deployment requirement resolvers for the local server_team Formal restore. */
import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { canonicalSha256 } from "../formal-runtime/canonical.js";
import type {
  ProductionRestoreRequirementResolver,
} from "./production-restore-executor.js";
import type {
  RestorePlanRequirement,
} from "./restore-plan-contract.js";

export type ServerTeamRequirementErrorCode =
  | "MAPPING_NOT_FOUND"
  | "INVALID_REQUIREMENT"
  | "SKILL_PACKAGE_NOT_FOUND"
  | "SKILL_PACKAGE_INVALID"
  | "OBSOLETE_KNOWLEDGE_REQUIREMENT";

export class ServerTeamRequirementError extends Error {
  constructor(
    readonly code: ServerTeamRequirementErrorCode,
    readonly requirementId: string,
    message: string,
  ) {
    super(`server_team requirement [${code}] ${requirementId}: ${message}`);
    this.name = "ServerTeamRequirementError";
  }
}

export interface ServerTeamMemoryImportInput {
  readonly requirementId: string;
  readonly formalAssetId: string;
  readonly expectedAssetContentHash: string;
  readonly isolation: Readonly<{
    team_id: string;
    user_id: string;
    agent_id: string;
  }>;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type ServerTeamMemoryImportHook = (
  input: ServerTeamMemoryImportInput,
) => Promise<unknown>;

export interface ServerTeamRequirementResolverConfig {
  readonly serviceIdsByDatasetSpaceId: Readonly<Record<string, string>>;
  readonly authUserIdsByDatasetUserId: Readonly<Record<string, string>>;
  /** Candidate directories whose root contains the manifest's SKILL.md. */
  readonly skillPackageRoots: readonly string[];
  readonly importMemoryL1: ServerTeamMemoryImportHook;
  readonly importMemoryL2: ServerTeamMemoryImportHook;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function error(
  code: ServerTeamRequirementErrorCode,
  requirement: RestorePlanRequirement,
  message: string,
): never {
  throw new ServerTeamRequirementError(code, requirement.requirementId, message);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requirementActionId(prefix: string, logicalId: string): string {
  return `${prefix}-${canonicalSha256({ prefix, logicalId }).slice(0, 20)}`;
}

function mappingDatasetId(
  requirement: RestorePlanRequirement,
  prefix: string,
  mappings: Readonly<Record<string, string>>,
): string {
  const matches = Object.keys(mappings).filter((logicalId) =>
    requirementActionId(prefix, logicalId) === requirement.requirementId
  );
  if (matches.length !== 1) {
    return error("MAPPING_NOT_FOUND", requirement, `expected exactly one ${prefix} mapping`);
  }
  const datasetId = matches[0]!;
  if (mappings[datasetId]!.trim().length === 0) {
    return error("MAPPING_NOT_FOUND", requirement, `${datasetId} maps to an empty runtime id`);
  }
  return datasetId;
}

function safeManifestPath(
  requirement: RestorePlanRequirement,
  root: string,
  manifestPath: string,
): string {
  if (!manifestPath || isAbsolute(manifestPath) || manifestPath.includes("\\")
    || manifestPath.split("/").some((part) => part === ".." || part === "")) {
    return error("SKILL_PACKAGE_INVALID", requirement, `unsafe manifest path ${manifestPath}`);
  }
  const rootPath = resolve(root);
  const filePath = resolve(rootPath, ...manifestPath.split("/"));
  const rel = relative(rootPath, filePath);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    return error("SKILL_PACKAGE_INVALID", requirement, `manifest path escapes package root`);
  }
  return filePath;
}

async function loadMatchingSkillPackage(
  requirement: RestorePlanRequirement,
  roots: readonly string[],
): Promise<Readonly<{
  values: Readonly<Record<string, unknown>>;
  evidence: unknown;
}>> {
  const manifest = requirement.manifest;
  if (!requirement.formalAssetId || !manifest?.length) {
    return error("SKILL_PACKAGE_INVALID", requirement, "formalAssetId and manifest are required");
  }
  const entry = manifest.find((item) => item.path === "SKILL.md");
  if (!entry) return error("SKILL_PACKAGE_INVALID", requirement, "manifest must contain SKILL.md");

  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const root = roots[rootIndex]!;
    const files: Array<{ path: string; bytes: Buffer }> = [];
    let matched = true;
    for (const item of manifest) {
      try {
        const bytes = await readFile(safeManifestPath(requirement, root, item.path));
        if (sha256(bytes) !== item.sha256) {
          matched = false;
          break;
        }
        files.push({ path: item.path, bytes });
      } catch (cause) {
        if (cause instanceof ServerTeamRequirementError) throw cause;
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    const entryFile = files.find((file) => file.path === "SKILL.md")!;
    if (!isUtf8(entryFile.bytes)) {
      return error("SKILL_PACKAGE_INVALID", requirement, "SKILL.md must be UTF-8");
    }
    const resources = files
      .filter((file) => file.path !== "SKILL.md")
      .map((file) => isUtf8(file.bytes)
        ? {
          path: file.path,
          content: file.bytes.toString("utf8"),
          encoding: "utf-8" as const,
        }
        : {
          path: file.path,
          content: file.bytes.toString("base64"),
          encoding: "base64" as const,
        });
    return {
      values: {
        verified_skill_entry_content: entryFile.bytes.toString("utf8"),
        verified_skill_resources: resources,
      },
      evidence: {
        formalAssetId: requirement.formalAssetId,
        manifestEntries: manifest.length,
        matchedRootIndex: rootIndex,
        manifestSha256: canonicalSha256(manifest),
      },
    };
  }

  return error("SKILL_PACKAGE_NOT_FOUND", requirement, "no candidate root matches the frozen manifest");
}

function resolvedMemoryImport(
  requirement: RestorePlanRequirement,
  resolveValue: <T>(value: T) => T,
): ServerTeamMemoryImportInput {
  if (!requirement.formalAssetId || !requirement.expectedAssetContentHash
    || !requirement.runtimeIsolation || !requirement.importPayload) {
    return error(
      "INVALID_REQUIREMENT",
      requirement,
      "memory import requires asset id, expected hash, isolation, and payload",
    );
  }
  const isolation = resolveValue(requirement.runtimeIsolation) as unknown;
  const payload = resolveValue(requirement.importPayload) as unknown;
  if (!isRecord(isolation) || typeof isolation.team_id !== "string"
    || typeof isolation.user_id !== "string" || typeof isolation.agent_id !== "string"
    || !isRecord(payload)) {
    return error("INVALID_REQUIREMENT", requirement, "resolved memory import shape is invalid");
  }
  return {
    requirementId: requirement.requirementId,
    formalAssetId: requirement.formalAssetId,
    expectedAssetContentHash: requirement.expectedAssetContentHash,
    isolation: {
      team_id: isolation.team_id,
      user_id: isolation.user_id,
      agent_id: isolation.agent_id,
    },
    payload,
  };
}

/** Build the six-kind plan resolver; Knowledge snapshots are intentionally absent in R05 plans. */
export function createServerTeamRequirementResolver(
  config: ServerTeamRequirementResolverConfig,
): ProductionRestoreRequirementResolver {
  return async (requirement, context) => {
    if (requirement.kind === "space_service_mapping") {
      const datasetId = mappingDatasetId(
        requirement,
        "require-space-service",
        config.serviceIdsByDatasetSpaceId,
      );
      return {
        values: {},
        evidence: { mapping: "space_service", datasetId, verified: true },
      };
    }
    if (requirement.kind === "auth_user_mapping") {
      const datasetId = mappingDatasetId(
        requirement,
        "require-auth-user",
        config.authUserIdsByDatasetUserId,
      );
      return {
        values: {},
        evidence: { mapping: "auth_user", datasetId, verified: true },
      };
    }
    if (requirement.kind === "skill_package_bytes") {
      return loadMatchingSkillPackage(requirement, config.skillPackageRoots);
    }
    if (requirement.kind === "memory_l1_import") {
      return {
        values: {},
        evidence: await config.importMemoryL1(resolvedMemoryImport(requirement, context.resolve)),
      };
    }
    if (requirement.kind === "memory_l2_import") {
      return {
        values: {},
        evidence: await config.importMemoryL2(resolvedMemoryImport(requirement, context.resolve)),
      };
    }
    return error(
      "OBSOLETE_KNOWLEDGE_REQUIREMENT",
      requirement,
      "R05 restores a real Knowledge shell because frozen snapshot bytes do not exist",
    );
  };
}
