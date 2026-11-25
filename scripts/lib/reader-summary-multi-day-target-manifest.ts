import type { ReaderSummaryMultiDayGenerationProfile } from "@social-monitor/summary/domain";

import { dailyPeriodKey } from "./reader-summary-quality-eval-support";

export type TargetManifestV2 = {
  readonly schemaVersion: 2;
  readonly artifactFormat: "reader-summary-multi-day-quality-target-manifest-v2";
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly scope: TargetManifestScopeV2;
  readonly targets: readonly TargetManifestV2Target[];
};

export type TargetManifestV3 = {
  readonly schemaVersion: 3;
  readonly artifactFormat: "reader-summary-multi-day-quality-target-manifest-v3";
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly scope: TargetManifestScopeV3;
  readonly targets: readonly TargetManifestV3Target[];
};

export type TargetManifestV4 = {
  readonly schemaVersion: 4;
  readonly artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4";
  readonly databaseFingerprint: string;
  readonly capturedAt: string;
  readonly currentAtCapture: true;
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly scope: TargetManifestScopeV4;
  readonly targets: readonly TargetManifestV4Target[];
};

export type TargetManifest =
  | TargetManifestV2
  | TargetManifestV3
  | TargetManifestV4;

type TargetManifestScopeV2 = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: "workspace";
  readonly scopeKey: string;
};

export type TargetManifestScopeV3 = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: "workspace";
  readonly scopeKey: "workspace";
};

export type TargetManifestScopeV4 = TargetManifestScopeV3;

export type TargetManifestV2Target = {
  readonly collectionDate: string;
  readonly artifactId: string;
  readonly periodKey: string;
  readonly artifactPayloadSha256: string;
  readonly actualDayProjectionSha256: string;
};

export type TargetManifestV3Target = {
  readonly collectionDate: string;
  readonly periodKey: string;
  readonly publicationId: string;
  readonly artifactId: string;
  readonly reportSha256: string;
  readonly proofSha256: string;
  readonly exactProofSha256: string;
  readonly artifactPayloadSha256: string;
  readonly actualDayProjectionSha256: string;
};

export type TargetManifestV4Target = TargetManifestV3Target;

const v2ManifestKeys = [
  "schemaVersion",
  "artifactFormat",
  "generationProfile",
  "scope",
  "targets",
] as const;
const v3ManifestKeys = [
  "schemaVersion",
  "artifactFormat",
  "generationProfile",
  "scope",
  "targets",
] as const;
const v4ManifestKeys = [
  "schemaVersion",
  "artifactFormat",
  "databaseFingerprint",
  "capturedAt",
  "currentAtCapture",
  "generationProfile",
  "scope",
  "targets",
] as const;
const scopeKeys = ["tenantId", "workspaceId", "scopeType", "scopeKey"] as const;
const v2TargetKeys = [
  "collectionDate",
  "artifactId",
  "periodKey",
  "artifactPayloadSha256",
  "actualDayProjectionSha256",
] as const;
const v3TargetKeys = [
  "collectionDate",
  "periodKey",
  "publicationId",
  "artifactId",
  "reportSha256",
  "proofSha256",
  "exactProofSha256",
  "artifactPayloadSha256",
  "actualDayProjectionSha256",
] as const;

export function validateTargetManifestV2(
  value: unknown,
  goldDates: readonly string[],
  label = "target manifest",
): TargetManifestV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, v2ManifestKeys) ||
    value.schemaVersion !== 2 ||
    value.artifactFormat !== "reader-summary-multi-day-quality-target-manifest-v2" ||
    !isGenerationProfile(value.generationProfile) ||
    !isRecord(value.scope) ||
    !hasExactKeys(value.scope, scopeKeys) ||
    value.scope.scopeType !== "workspace" ||
    !isUuid(value.scope.tenantId) ||
    !isUuid(value.scope.workspaceId) ||
    value.scope.scopeKey !== `workspace:${String(value.scope.workspaceId)}` ||
    !Array.isArray(value.targets)
  ) {
    throw new Error(`${label} has an unsupported v2 contract`);
  }
  validateTargets({
    targets: value.targets,
    expectedKeys: v2TargetKeys,
    goldDates,
    label,
    validateTarget: (target) =>
      isDate(target.collectionDate) &&
      isUuid(target.artifactId) &&
      isSha256(target.artifactPayloadSha256) &&
      isSha256(target.actualDayProjectionSha256) &&
      target.periodKey === dailyPeriodKey(String(target.collectionDate)),
  });
  return value as unknown as TargetManifestV2;
}

export function validateTargetManifestV3(
  value: unknown,
  goldDates: readonly string[],
  label = "target manifest",
): TargetManifestV3 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, v3ManifestKeys) ||
    value.schemaVersion !== 3 ||
    value.artifactFormat !== "reader-summary-multi-day-quality-target-manifest-v3" ||
    !isGenerationProfile(value.generationProfile) ||
    !isRecord(value.scope) ||
    !hasExactKeys(value.scope, scopeKeys) ||
    value.scope.scopeType !== "workspace" ||
    value.scope.scopeKey !== "workspace" ||
    !isUuid(value.scope.tenantId) ||
    !isUuid(value.scope.workspaceId) ||
    !Array.isArray(value.targets) ||
    value.targets.length < 5
  ) {
    throw new Error(`${label} has an unsupported v3 contract`);
  }
  validateTargets({
    targets: value.targets,
    expectedKeys: v3TargetKeys,
    goldDates,
    label,
    validateTarget: (target) =>
      isDate(target.collectionDate) &&
      isUuid(target.publicationId) &&
      isUuid(target.artifactId) &&
      [
        target.reportSha256,
        target.proofSha256,
        target.exactProofSha256,
        target.artifactPayloadSha256,
        target.actualDayProjectionSha256,
      ].every(isSha256) &&
      target.proofSha256 === target.exactProofSha256 &&
      target.periodKey === dailyPeriodKey(String(target.collectionDate)),
  });
  assertStrictlySortedDates(value.targets, label);
  assertUniqueIds(value.targets, "publicationId", "publication ids", label);
  return value as unknown as TargetManifestV3;
}

export function validateTargetManifestV4(
  value: unknown,
  goldDates: readonly string[],
  label = "target manifest",
): TargetManifestV4 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, v4ManifestKeys) ||
    value.schemaVersion !== 4 ||
    value.artifactFormat !== "reader-summary-multi-day-quality-target-manifest-v4" ||
    !isDatabaseFingerprint(value.databaseFingerprint) ||
    !isExactTimestamp(value.capturedAt) ||
    value.currentAtCapture !== true ||
    !isGenerationProfile(value.generationProfile) ||
    !isRecord(value.scope) ||
    !hasExactKeys(value.scope, scopeKeys) ||
    value.scope.scopeType !== "workspace" ||
    value.scope.scopeKey !== "workspace" ||
    !isUuid(value.scope.tenantId) ||
    !isUuid(value.scope.workspaceId) ||
    !Array.isArray(value.targets) ||
    value.targets.length < 5
  ) {
    throw new Error(`${label} has an unsupported v4 contract`);
  }
  validateTargets({
    targets: value.targets,
    expectedKeys: v3TargetKeys,
    goldDates,
    label,
    validateTarget: (target) =>
      isDate(target.collectionDate) &&
      isUuid(target.publicationId) &&
      isUuid(target.artifactId) &&
      [
        target.reportSha256,
        target.proofSha256,
        target.exactProofSha256,
        target.artifactPayloadSha256,
        target.actualDayProjectionSha256,
      ].every(isSha256) &&
      target.proofSha256 === target.exactProofSha256 &&
      target.periodKey === dailyPeriodKey(String(target.collectionDate)),
  });
  assertStrictlySortedDates(value.targets, label);
  assertUniqueIds(value.targets, "publicationId", "publication ids", label);
  return value as unknown as TargetManifestV4;
}

function validateTargets(params: {
  readonly targets: readonly unknown[];
  readonly expectedKeys: readonly string[];
  readonly goldDates: readonly string[];
  readonly label: string;
  readonly validateTarget: (target: Record<string, unknown>) => boolean;
}): void {
  const dates = new Set<string>();
  const artifactIds = new Set<string>();
  for (const target of params.targets) {
    if (
      !isRecord(target) ||
      !hasExactKeys(target, params.expectedKeys) ||
      !params.validateTarget(target)
    ) {
      throw new Error(`${params.label} contains an invalid target binding`);
    }
    const date = String(target.collectionDate);
    const artifactId = String(target.artifactId);
    if (dates.has(date)) {
      throw new Error(`${params.label} contains duplicate collection dates`);
    }
    if (artifactIds.has(artifactId)) {
      throw new Error(`${params.label} contains duplicate artifact ids`);
    }
    dates.add(date);
    artifactIds.add(artifactId);
  }
  if (
    params.targets.length !== params.goldDates.length ||
    params.goldDates.some((date) => !dates.has(date))
  ) {
    throw new Error(
      `${params.label} must bind exactly one artifact for every gold day`,
    );
  }
}

function assertStrictlySortedDates(
  targets: readonly Record<string, unknown>[],
  label: string,
): void {
  for (let index = 1; index < targets.length; index += 1) {
    const previous = String(targets[index - 1]?.collectionDate);
    const current = String(targets[index]?.collectionDate);
    if (previous >= current) {
      throw new Error(`${label} target dates must be strictly sorted ascending`);
    }
  }
}

function assertUniqueIds(
  targets: readonly Record<string, unknown>[],
  key: string,
  description: string,
  label: string,
): void {
  const values = targets.map((target) => String(target[key]));
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate ${description}`);
  }
}

function isGenerationProfile(
  value: unknown,
): value is ReaderSummaryMultiDayGenerationProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "modelVersion",
      "promptVersion",
      "rankingPolicyVersion",
    ]) &&
    [value.modelVersion, value.promptVersion, value.rankingPolicyVersion].every(
      isNonEmptyString,
    )
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isDatabaseFingerprint(value: unknown): value is string {
  return typeof value === "string" &&
    /^postgres-sha256:[0-9a-f]{64}$/u.test(value);
}

function isExactTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
