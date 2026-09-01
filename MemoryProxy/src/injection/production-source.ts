import { createHash } from "node:crypto";

import type {
  CompiledToolPrompt,
  PromptUnitKind,
  ToolPromptFamily,
  ToolPromptSurface,
} from "./tool-prompt/types.js";

export const PRODUCTION_PROMPT_SOURCE_SCHEMA =
  "task1.production-prompt-source-manifest.v1" as const;
export const PRODUCTION_PROMPT_SOURCE_SEGMENTER_VERSION =
  "context-block-prompt-unit-v1" as const;
export const PROVIDER_PROMPT_SOURCE_EVIDENCE_SCHEMA =
  "task1.provider-prompt-source-evidence.v1" as const;

export type ProductionPromptSourceKind =
  | "static-tool"
  | "execution-contract"
  | "dynamic-asset"
  | "runtime-binding";

export interface ProductionPromptSourceInput {
  readonly sourceId: string;
  readonly sourceKind: ProductionPromptSourceKind;
  readonly injectionBlockId: string;
  readonly text: string;
  readonly compilerVersion?: string | null;
  readonly compilerFamily?: ToolPromptFamily | null;
  readonly compilerSurface?: ToolPromptSurface | null;
  readonly promptUnitId?: string | null;
}

export interface ProductionPromptSourceSegment extends ProductionPromptSourceInput {
  readonly order: number;
  readonly startUtf8Byte: number;
  readonly endUtf8ByteExclusive: number;
  readonly sourceSha256: string;
}

export interface ProductionPromptSourceManifest {
  readonly schemaVersion: typeof PRODUCTION_PROMPT_SOURCE_SCHEMA;
  readonly segmenterVersion: typeof PRODUCTION_PROMPT_SOURCE_SEGMENTER_VERSION;
  readonly providerVisibleTextSha256: string;
  readonly providerVisibleUtf8Bytes: number;
  readonly sources: readonly ProductionPromptSourceSegment[];
  readonly canonicalSha256: string;
}

export interface ProviderPromptSourceEvidence {
  readonly schemaVersion: typeof PROVIDER_PROMPT_SOURCE_EVIDENCE_SCHEMA;
  readonly correlationId: string;
  readonly rawBodySha256: string;
  readonly sourceManifestSha256: string;
  readonly providerVisibleTextSha256: string;
  readonly bindingSha256: string;
  readonly sourceManifest: ProductionPromptSourceManifest;
}

export interface ProductionPromptBinding {
  readonly id: string;
  readonly value: string;
  readonly kind: "dynamic-asset" | "runtime-binding";
  /** Exact UTF-16 offset supplied by the renderer that owns the template. */
  readonly startUtf16Offset: number;
}

export interface ProductionPromptBindingBoundary {
  readonly before: string;
  readonly after: string;
}

export interface RenderedProductionPromptArtifact {
  readonly content: string;
  readonly productionSources: readonly ProductionPromptSourceInput[];
}

export interface CompiledPromptProductionSourceInput {
  readonly injectionBlockId: string;
  readonly compiledPrompt: CompiledToolPrompt;
  readonly bindings?: readonly ProductionPromptBinding[];
}

export class ProductionPromptSourceError extends Error {
  constructor(
    readonly code:
      | "SOURCE_IDENTITY_INVALID"
      | "SOURCE_DUPLICATE"
      | "SOURCE_COVERAGE_MISMATCH"
      | "SOURCE_HASH_MISMATCH"
      | "SOURCE_MANIFEST_INVALID"
      | "PROVIDER_BINDING_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ProductionPromptSourceError";
  }
}

/**
 * Convert the compiler's final PromptUnits to exact production source slices.
 * Runtime/dynamic values are supplied by the renderer that created the unit;
 * this function never guesses provenance from XML tags or provider text.
 */
export function buildCompiledPromptProductionSources(
  input: CompiledPromptProductionSourceInput,
): readonly ProductionPromptSourceInput[] {
  requireIdentity("injectionBlockId", input.injectionBlockId);
  const bindings = validateBindings(input.bindings ?? [], input.compiledPrompt.content);
  const consumedBindings = new Set<string>();
  let unitStart = 0;
  const sources = input.compiledPrompt.units.flatMap((unit) => {
    const unitEnd = unitStart + unit.content.length;
    const unitBindings = bindings.flatMap((binding) => {
      const bindingEnd = binding.startUtf16Offset + binding.value.length;
      if (binding.startUtf16Offset >= unitStart && bindingEnd <= unitEnd) {
        consumedBindings.add(binding.id);
        return [{ ...binding, startUtf16Offset: binding.startUtf16Offset - unitStart }];
      }
      if (binding.startUtf16Offset < unitEnd && bindingEnd > unitStart) {
        throw new ProductionPromptSourceError(
          "SOURCE_COVERAGE_MISMATCH",
          `production binding crosses PromptUnit boundary: ${binding.id}`,
        );
      }
      return [];
    });
    const result = splitSource({
      sourceId: qualified([
        "compiled",
        input.compiledPrompt.family,
        input.compiledPrompt.surface,
        input.injectionBlockId,
        unit.id,
      ]),
      sourceKind: kindForPromptUnit(unit.kind),
      injectionBlockId: input.injectionBlockId,
      text: unit.content,
      compilerVersion: input.compiledPrompt.compilerVersion,
      compilerFamily: input.compiledPrompt.family,
      compilerSurface: input.compiledPrompt.surface,
      promptUnitId: unit.id,
    }, unitBindings);
    unitStart = unitEnd;
    return result;
  });
  if (consumedBindings.size !== bindings.length) {
    throw new ProductionPromptSourceError(
      "SOURCE_COVERAGE_MISMATCH",
      "one or more renderer-owned bindings do not land in a compiled PromptUnit",
    );
  }
  if (sources.map((source) => source.text).join("") !== input.compiledPrompt.content) {
    throw new ProductionPromptSourceError(
      "SOURCE_COVERAGE_MISMATCH",
      "compiled PromptUnit sources do not reconstruct compiler content",
    );
  }
  return sources;
}

/** Split one renderer-owned source only at explicitly supplied binding values. */
export function buildRenderedPromptProductionSources(input: {
  readonly sourceId: string;
  readonly sourceKind: ProductionPromptSourceKind;
  readonly injectionBlockId: string;
  readonly text: string;
  readonly bindings?: readonly ProductionPromptBinding[];
}): readonly ProductionPromptSourceInput[] {
  return splitSource(input, validateBindings(input.bindings ?? [], input.text));
}

/**
 * Resolve runtime/dynamic values only inside renderer-owned literal bounds.
 * The returned offsets are exact; downstream segmentation never searches the
 * finished prompt for a bare value such as a short session id.
 */
export function locateBoundedProductionPromptBindings(input: {
  readonly text: string;
  readonly id: string;
  readonly value: string;
  readonly kind: "dynamic-asset" | "runtime-binding";
  readonly boundaries: readonly ProductionPromptBindingBoundary[];
}): readonly ProductionPromptBinding[] {
  requireIdentity("binding.id", input.id);
  if (input.value.length === 0 || input.boundaries.length === 0) {
    throw new ProductionPromptSourceError(
      "SOURCE_IDENTITY_INVALID",
      "bounded production bindings require a non-empty value and boundary",
    );
  }
  const offsets = new Set<number>();
  for (const boundary of input.boundaries) {
    const matchText = `${boundary.before}${input.value}${boundary.after}`;
    if (matchText.length === input.value.length) {
      throw new ProductionPromptSourceError(
        "SOURCE_IDENTITY_INVALID",
        "production binding boundary must include literal renderer context",
      );
    }
    let cursor = 0;
    while (cursor <= input.text.length - matchText.length) {
      const matchStart = input.text.indexOf(matchText, cursor);
      if (matchStart < 0) break;
      offsets.add(matchStart + boundary.before.length);
      cursor = matchStart + matchText.length;
    }
  }
  if (offsets.size === 0) {
    throw new ProductionPromptSourceError(
      "SOURCE_COVERAGE_MISMATCH",
      `renderer-owned production binding did not match its literal bounds: ${input.id}`,
    );
  }
  return [...offsets]
    .sort((left, right) => left - right)
    .map((startUtf16Offset, index) => ({
      id: `${input.id}:${index}`,
      value: input.value,
      kind: input.kind,
      startUtf16Offset,
    }));
}

/** Seal exact ordered source text after the production pipeline has landed it. */
export function sealProductionPromptSourceManifest(
  providerVisibleText: string,
  sourceInputs: readonly ProductionPromptSourceInput[],
): ProductionPromptSourceManifest {
  if (!Array.isArray(sourceInputs) || sourceInputs.length === 0) {
    throw new ProductionPromptSourceError(
      "SOURCE_MANIFEST_INVALID",
      "production source manifest requires at least one source",
    );
  }
  const seen = new Set<string>();
  let byteCursor = 0;
  const sources = sourceInputs.map((source, order): ProductionPromptSourceSegment => {
    requireIdentity("sourceId", source.sourceId);
    requireIdentity("injectionBlockId", source.injectionBlockId);
    if (seen.has(source.sourceId)) {
      throw new ProductionPromptSourceError(
        "SOURCE_DUPLICATE",
        `production source id is duplicated: ${source.sourceId}`,
      );
    }
    seen.add(source.sourceId);
    if (!isSourceKind(source.sourceKind) || typeof source.text !== "string" || source.text.length === 0) {
      throw new ProductionPromptSourceError(
        "SOURCE_MANIFEST_INVALID",
        `production source is invalid at order ${order}`,
      );
    }
    const startUtf8Byte = byteCursor;
    byteCursor += Buffer.byteLength(source.text, "utf8");
    return {
      sourceId: source.sourceId,
      sourceKind: source.sourceKind,
      injectionBlockId: source.injectionBlockId,
      text: source.text,
      compilerVersion: source.compilerVersion ?? null,
      compilerFamily: source.compilerFamily ?? null,
      compilerSurface: source.compilerSurface ?? null,
      promptUnitId: source.promptUnitId ?? null,
      order,
      startUtf8Byte,
      endUtf8ByteExclusive: byteCursor,
      sourceSha256: sha256(source.text),
    };
  });
  if (sources.map((source) => source.text).join("") !== providerVisibleText) {
    throw new ProductionPromptSourceError(
      "SOURCE_COVERAGE_MISMATCH",
      "ordered production sources must reconstruct provider-visible text byte-for-byte",
    );
  }
  const withoutCanonicalSha = {
    schemaVersion: PRODUCTION_PROMPT_SOURCE_SCHEMA,
    segmenterVersion: PRODUCTION_PROMPT_SOURCE_SEGMENTER_VERSION,
    providerVisibleTextSha256: sha256(providerVisibleText),
    providerVisibleUtf8Bytes: Buffer.byteLength(providerVisibleText, "utf8"),
    sources,
  };
  return deepFreeze({
    ...withoutCanonicalSha,
    canonicalSha256: sha256(canonicalJson(withoutCanonicalSha)),
  });
}

export function validateProductionPromptSourceManifest(
  value: ProductionPromptSourceManifest,
  expectedProviderVisibleText?: string,
): ProductionPromptSourceManifest {
  if (
    value === null
    || typeof value !== "object"
    || value.schemaVersion !== PRODUCTION_PROMPT_SOURCE_SCHEMA
    || value.segmenterVersion !== PRODUCTION_PROMPT_SOURCE_SEGMENTER_VERSION
    || !Array.isArray(value.sources)
    || value.sources.length === 0
  ) {
    throw new ProductionPromptSourceError(
      "SOURCE_MANIFEST_INVALID",
      "production source manifest schema is invalid",
    );
  }
  const rebuilt = sealProductionPromptSourceManifest(
    value.sources.map((source) => source.text).join(""),
    value.sources.map(({ order: _order, startUtf8Byte: _start, endUtf8ByteExclusive: _end, sourceSha256: _sha, ...source }) => source),
  );
  const segmentMismatch = rebuilt.sources.some((source, index) => {
    const supplied = value.sources[index];
    return supplied === undefined
      || supplied.order !== source.order
      || supplied.startUtf8Byte !== source.startUtf8Byte
      || supplied.endUtf8ByteExclusive !== source.endUtf8ByteExclusive
      || supplied.sourceSha256 !== source.sourceSha256;
  });
  if (
    segmentMismatch
    || rebuilt.sources.length !== value.sources.length
    || rebuilt.canonicalSha256 !== value.canonicalSha256
    || rebuilt.providerVisibleTextSha256 !== value.providerVisibleTextSha256
    || rebuilt.providerVisibleUtf8Bytes !== value.providerVisibleUtf8Bytes
  ) {
    throw new ProductionPromptSourceError(
      "SOURCE_HASH_MISMATCH",
      "production source manifest hashes do not match its ordered source text",
    );
  }
  if (
    expectedProviderVisibleText !== undefined
    && rebuilt.sources.map((source) => source.text).join("") !== expectedProviderVisibleText
  ) {
    throw new ProductionPromptSourceError(
      "SOURCE_COVERAGE_MISMATCH",
      "production source manifest does not bind the expected provider-visible text",
    );
  }
  return rebuilt;
}

export function wrapProductionPromptSourceManifestForCodex(
  providerVisibleInjection: string,
  innerManifest: ProductionPromptSourceManifest,
): ProductionPromptSourceManifest {
  const validated = validateProductionPromptSourceManifest(innerManifest);
  const innerText = validated.sources.map((source) => source.text).join("");
  const open = "<tdai_injections>\n";
  const close = "\n</tdai_injections>";
  if (providerVisibleInjection !== `${open}${innerText}${close}`) {
    throw new ProductionPromptSourceError(
      "SOURCE_COVERAGE_MISMATCH",
      "Codex wrapper and pipeline source text do not reconstruct the same provider bytes",
    );
  }
  return sealProductionPromptSourceManifest(providerVisibleInjection, [
    {
      sourceId: "codex-wrapper:open",
      sourceKind: "static-tool",
      injectionBlockId: "tdai-injections-wrapper",
      text: open,
    },
    ...validated.sources.map(({ order: _order, startUtf8Byte: _start, endUtf8ByteExclusive: _end, sourceSha256: _sha, ...source }) => source),
    {
      sourceId: "codex-wrapper:close",
      sourceKind: "static-tool",
      injectionBlockId: "tdai-injections-wrapper",
      text: close,
    },
  ]);
}

/** Bind one already sealed source manifest to the exact provider request. */
export function freezeProviderPromptSourceEvidence(input: {
  readonly correlationId: string;
  readonly rawBodySha256: string;
  readonly sourceManifest: ProductionPromptSourceManifest;
}): ProviderPromptSourceEvidence {
  requireIdentity("correlationId", input.correlationId);
  requireSha256("rawBodySha256", input.rawBodySha256);
  const sourceManifest = validateProductionPromptSourceManifest(input.sourceManifest);
  const withoutBinding = {
    schemaVersion: PROVIDER_PROMPT_SOURCE_EVIDENCE_SCHEMA,
    correlationId: input.correlationId,
    rawBodySha256: input.rawBodySha256,
    sourceManifestSha256: sourceManifest.canonicalSha256,
    providerVisibleTextSha256: sourceManifest.providerVisibleTextSha256,
    sourceManifest,
  };
  return deepFreeze({
    ...withoutBinding,
    bindingSha256: sha256(canonicalJson(withoutBinding)),
  });
}

export function validateProviderPromptSourceEvidence(
  value: ProviderPromptSourceEvidence,
  expected?: Readonly<{
    correlationId?: string;
    rawBodySha256?: string;
    providerVisibleText?: string;
  }>,
): ProviderPromptSourceEvidence {
  if (
    value === null
    || typeof value !== "object"
    || value.schemaVersion !== PROVIDER_PROMPT_SOURCE_EVIDENCE_SCHEMA
  ) {
    throw new ProductionPromptSourceError(
      "PROVIDER_BINDING_MISMATCH",
      "provider prompt source evidence schema is invalid",
    );
  }
  const rebuilt = freezeProviderPromptSourceEvidence({
    correlationId: value.correlationId,
    rawBodySha256: value.rawBodySha256,
    sourceManifest: value.sourceManifest,
  });
  if (
    rebuilt.bindingSha256 !== value.bindingSha256
    || rebuilt.sourceManifestSha256 !== value.sourceManifestSha256
    || rebuilt.providerVisibleTextSha256 !== value.providerVisibleTextSha256
    || (expected?.correlationId !== undefined && value.correlationId !== expected.correlationId)
    || (expected?.rawBodySha256 !== undefined && value.rawBodySha256 !== expected.rawBodySha256)
    || (
      expected?.providerVisibleText !== undefined
      && value.providerVisibleTextSha256 !== sha256(expected.providerVisibleText)
    )
  ) {
    throw new ProductionPromptSourceError(
      "PROVIDER_BINDING_MISMATCH",
      "provider prompt source evidence is not bound to the expected request bytes",
    );
  }
  if (expected?.providerVisibleText !== undefined) {
    validateProductionPromptSourceManifest(value.sourceManifest, expected.providerVisibleText);
  }
  return value;
}

function splitSource(
  source: ProductionPromptSourceInput,
  bindings: readonly ProductionPromptBinding[],
): ProductionPromptSourceInput[] {
  requireIdentity("sourceId", source.sourceId);
  requireIdentity("injectionBlockId", source.injectionBlockId);
  if (source.text.length === 0) return [];
  const output: ProductionPromptSourceInput[] = [];
  let cursor = 0;
  let fragment = 0;
  for (const binding of bindings) {
    if (binding.startUtf16Offset > cursor) {
      output.push(fragmentSource(
        source,
        source.text.slice(cursor, binding.startUtf16Offset),
        source.sourceKind,
        fragment++,
      ));
    }
    output.push(fragmentSource(
      source,
      binding.value,
      binding.kind,
      fragment++,
      binding.id,
    ));
    cursor = binding.startUtf16Offset + binding.value.length;
  }
  if (cursor < source.text.length) {
    output.push(fragmentSource(
      source,
      source.text.slice(cursor),
      source.sourceKind,
      fragment,
    ));
  }
  return output;
}

function fragmentSource(
  source: ProductionPromptSourceInput,
  text: string,
  sourceKind: ProductionPromptSourceKind,
  fragment: number,
  bindingId?: string,
): ProductionPromptSourceInput {
  return {
    ...source,
    sourceId: `${source.sourceId}:${bindingId ? `binding:${encodeURIComponent(bindingId)}` : "fragment"}:${fragment}`,
    sourceKind,
    text,
  };
}

function validateBindings(
  bindings: readonly ProductionPromptBinding[],
  text: string,
): readonly ProductionPromptBinding[] {
  const ids = new Set<string>();
  const sorted = [...bindings].sort((left, right) => (
    left.startUtf16Offset - right.startUtf16Offset
    || right.value.length - left.value.length
    || left.id.localeCompare(right.id)
  ));
  let previousEnd = 0;
  for (const binding of sorted) {
    requireIdentity("binding.id", binding.id);
    if (
      typeof binding.value !== "string"
      || binding.value.length === 0
      || ids.has(binding.id)
      || !Number.isSafeInteger(binding.startUtf16Offset)
      || binding.startUtf16Offset < previousEnd
      || text.slice(binding.startUtf16Offset, binding.startUtf16Offset + binding.value.length)
        !== binding.value
    ) {
      throw new ProductionPromptSourceError(
        "SOURCE_IDENTITY_INVALID",
        "production bindings must have unique ids and exact non-overlapping renderer offsets",
      );
    }
    ids.add(binding.id);
    previousEnd = binding.startUtf16Offset + binding.value.length;
  }
  return sorted;
}

function kindForPromptUnit(kind: PromptUnitKind): ProductionPromptSourceKind {
  if (kind === "execution-grammar") return "execution-contract";
  if (kind === "dynamic-assets") return "dynamic-asset";
  return "static-tool";
}

function isSourceKind(value: unknown): value is ProductionPromptSourceKind {
  return value === "static-tool"
    || value === "execution-contract"
    || value === "dynamic-asset"
    || value === "runtime-binding";
}

function requireIdentity(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProductionPromptSourceError(
      "SOURCE_IDENTITY_INVALID",
      `${name} must be non-empty`,
    );
  }
}

function requireSha256(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new ProductionPromptSourceError(
      "SOURCE_HASH_MISMATCH",
      `${name} must be a lowercase SHA-256`,
    );
  }
}

function qualified(parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
