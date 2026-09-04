import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AgentRuntimeExecutionAttestation } from
  "@social-monitor/summary/ports";
import {
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
} from "../../apps/agent-runtime/src/reader-promotion-v2-canary-contract";

export const canaryManifestPath = join(
  process.cwd(),
  "ops/release/reader-promotion-v2-production-canary.v1.json",
);
export const CANARY_MANIFEST_FORMAT =
  "reader-promotion-v2-production-canary-manifest.v1" as const;
export const CANARY_SINGLETON_ID =
  "reader-promotion-v2-production-canary-v1" as const;
export const CANARY_RECEIPT_FORMAT =
  "reader-promotion-v2-production-canary-receipt.v1" as const;
export const CANARY_STATES = Object.freeze([
  "CLAIMED", "MODEL_RUNNING", "MODEL_COMPLETED", "SUCCEEDED", "REJECTED",
] as const);
export const CANARY_OUTCOMES = Object.freeze([
  "RESPONSE", "EXPLICIT_FAILURE", "UNCERTAIN",
] as const);

export type CanaryState = typeof CANARY_STATES[number];
export type CanaryOutcome = typeof CANARY_OUTCOMES[number];
export type CanaryRelation = {
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly sameStory: boolean;
};
export type CanaryManifest = {
  readonly format: typeof CANARY_MANIFEST_FORMAT;
  readonly singletonId: typeof CANARY_SINGLETON_ID;
  readonly purpose: typeof readerPromotionV2CanaryPurpose;
  readonly model: "gpt-5.6-sol";
  readonly reasoningEffort: "high";
  readonly providerTimeoutMs: number;
  readonly reconciliationDeadlineMs: number;
  readonly schema: {
    readonly name: typeof readerPromotionV2CanarySchemaName;
    readonly version: typeof readerPromotionV2CanarySchemaVersion;
  };
  readonly relationBatch: readonly CanaryRelation[];
};

export type CanaryProvenance = {
  readonly protectedMainSha: string;
  readonly deployedReleaseSha: string;
  readonly deployedBackendSha: string;
  readonly deployedControlSha: string;
  readonly deployedRuntimeSha: string;
  readonly runtimeImageId: string;
  readonly workflow: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: number;
  readonly runtimePackageVersion: string;
  readonly runtimePackageSha256: string;
  readonly launcherSha256: string;
};

export type CanaryBinding = CanaryProvenance & {
  readonly singletonId: typeof CANARY_SINGLETON_ID;
  readonly ownerId: string;
  readonly fence: string;
  readonly manifestSha256: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly schemaSha256: string;
  readonly model: "gpt-5.6-sol";
  readonly reasoningEffort: "high";
  readonly canonicalRequestSha256: string;
  readonly reconciliationDeadline: Date;
};

export type CanaryRequestedBinding = Omit<
  CanaryBinding,
  "reconciliationDeadline"
>;

export type CanaryUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export type CanaryArtifact = {
  readonly format: "reader-promotion-v2-production-canary-artifact.v1";
  readonly manifestSha256: string;
  readonly schemaSha256: string;
  readonly canonicalRequestSha256: string;
  readonly outputSha256: string;
  readonly decisions: readonly {
    readonly leftFeedItemId: string;
    readonly rightFeedItemId: string;
    readonly sameStory: boolean;
    readonly confidenceScore: number;
  }[];
  readonly productAssertionsSha256: string;
  readonly usage: CanaryUsage;
};

export type CanaryReceipt = {
  readonly format: typeof CANARY_RECEIPT_FORMAT;
  readonly singletonId: typeof CANARY_SINGLETON_ID;
  readonly state: "SUCCEEDED" | "REJECTED";
  readonly outcome: CanaryOutcome;
  readonly protectedMainSha: string;
  readonly deployedReleaseSha: string;
  readonly deployedBackendSha: string;
  readonly deployedControlSha: string;
  readonly deployedRuntimeSha: string;
  readonly runtimeImageId: string;
  readonly manifestSha256: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly schemaSha256: string;
  readonly model: "gpt-5.6-sol";
  readonly reasoningEffort: "high";
  readonly canonicalRequestSha256: string;
  readonly workflow: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: number;
  readonly fence: string;
  readonly runtimePackageVersion: string;
  readonly runtimePackageSha256: string;
  readonly launcherSha256: string;
  readonly artifactSha256: string | null;
  readonly usage: CanaryUsage | null;
  readonly rejectionCode: string | null;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalValue(value));

export const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const canonicalSha256 = (value: unknown): string =>
  sha256(canonicalJson(value));

export const loadCanaryManifest = (
  path = canaryManifestPath,
): CanaryManifest => {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  assertManifest(parsed);
  return Object.freeze(parsed);
};

export const canaryManifestSha256 = (manifest: CanaryManifest): string =>
  canonicalSha256(manifest);
export const canarySchemaSha256 = (): string =>
  canonicalSha256(readerPromotionV2CanaryOutputSchema);

export const assertCanaryProvenance = (
  provenance: CanaryProvenance,
  targetSha: string,
): void => {
  assertSha(targetSha, "target SHA");
  for (const [name, value] of Object.entries({
    protectedMainSha: provenance.protectedMainSha,
    deployedReleaseSha: provenance.deployedReleaseSha,
    deployedBackendSha: provenance.deployedBackendSha,
    deployedControlSha: provenance.deployedControlSha,
    deployedRuntimeSha: provenance.deployedRuntimeSha,
  })) {
    assertSha(value, name);
    if (value !== targetSha) throw new Error("canary_provenance_mismatch");
  }
  if (!/^\d+$/u.test(provenance.workflowRunId) ||
      !Number.isSafeInteger(provenance.workflowRunAttempt) ||
      provenance.workflowRunAttempt <= 0 ||
      provenance.workflow !== "reader-promotion-v2-production-canary") {
    throw new Error("canary_workflow_identity_invalid");
  }
  if (!/^[0-9a-f]{64}$/u.test(provenance.runtimePackageSha256) ||
      !/^sha256:[0-9a-f]{64}$/u.test(provenance.runtimeImageId) ||
      !/^[0-9a-f]{64}$/u.test(provenance.launcherSha256) ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(
        provenance.runtimePackageVersion,
      )) throw new Error("canary_runtime_identity_invalid");
};

export const assertCanaryUsage = (usage: CanaryUsage | undefined): CanaryUsage => {
  if (usage === undefined ||
      ![usage.inputTokens, usage.outputTokens, usage.totalTokens].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) || usage.totalTokens !== usage.inputTokens + usage.outputTokens) {
    throw new Error("canary_usage_invalid");
  }
  return usage;
};

export const assertCanaryAttestation = (params: {
  readonly attestation: AgentRuntimeExecutionAttestation | undefined;
  readonly binding: CanaryBinding;
  readonly outputSha256: string;
}): AgentRuntimeExecutionAttestation => {
  const value = params.attestation;
  if (value === undefined || value.purpose !== readerPromotionV2CanaryPurpose ||
      value.model !== "gpt-5.6-sol" || value.reasoningEffort !== "high" ||
      value.selectedOutputKind !== "structured_output" ||
      value.canonicalRequestSha256 !== params.binding.canonicalRequestSha256 ||
      value.selectedOutputSha256 !== params.outputSha256 ||
      value.runtimePackageVersion !== params.binding.runtimePackageVersion ||
      value.launcherSha256 !== params.binding.launcherSha256) {
    throw new Error("canary_runtime_attestation_invalid");
  }
  return value;
};

const assertManifest: (value: unknown) => asserts value is CanaryManifest =
  (value) => {
  if (!record(value) || !exactKeys(value, [
    "format", "model", "providerTimeoutMs", "purpose", "reasoningEffort",
    "reconciliationDeadlineMs", "relationBatch", "schema", "singletonId",
  ]) || value.format !== CANARY_MANIFEST_FORMAT ||
      value.singletonId !== CANARY_SINGLETON_ID ||
      value.purpose !== readerPromotionV2CanaryPurpose ||
      value.model !== "gpt-5.6-sol" || value.reasoningEffort !== "high" ||
      value.providerTimeoutMs !== 120_000 ||
      value.reconciliationDeadlineMs !== 180_000 ||
      !record(value.schema) || !exactKeys(value.schema, ["name", "version"]) ||
      value.schema.name !== readerPromotionV2CanarySchemaName ||
      value.schema.version !== readerPromotionV2CanarySchemaVersion ||
      !Array.isArray(value.relationBatch) || value.relationBatch.length !== 3) {
    throw new Error("canary_manifest_invalid");
  }
  const exact = [
    ["cursor", "spacex", true],
    ["anthropic-watermark-x", "anthropic-watermark-reddit", true],
    ["claude-code-watermark", "claude-code-security", false],
  ] as const;
  value.relationBatch.forEach((item, index) => {
    const expected = exact[index];
    if (!record(item) || !exactKeys(item, [
      "leftFeedItemId", "leftLabel", "rightFeedItemId", "rightLabel",
      "sameStory",
    ]) || expected === undefined ||
        item.leftFeedItemId !== expected[0] ||
        item.rightFeedItemId !== expected[1] || item.sameStory !== expected[2] ||
        typeof item.leftLabel !== "string" || item.leftLabel.trim() === "" ||
        typeof item.rightLabel !== "string" || item.rightLabel.trim() === "") {
      throw new Error("canary_manifest_relation_batch_invalid");
    }
  });
};

const canonicalValue = (value: unknown): unknown => {
  if (value === null || typeof value === "string" ||
      typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) =>
    item === undefined ? null : canonicalValue(item));
  if (record(value)) return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalValue(item)]));
  throw new Error("canonical_json_invalid");
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => JSON.stringify(Object.keys(value).sort()) ===
  JSON.stringify([...expected].sort());
const assertSha = (value: string, label: string): void => {
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new Error(`${label}_invalid`);
};
