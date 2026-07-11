import { createHash } from "node:crypto";

import type {
  JsonObject,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

export const SOURCE_CANDIDATE_MEMORY_POLICY_VERSION =
  "source-candidate-memory-v1";

export type SourceCandidateMemoryDecision = "processed" | "rejected";

export type SourceCandidateMemoryReasonCode =
  | "already_processed"
  | "ranked_out"
  | "below_threshold"
  | "author_diversity"
  | "outside_window"
  | "invalid_payload"
  | "low_relevance"
  | "muted"
  | "provider_duplicate";

export type SourceCandidateMemoryScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly scopeFingerprint: string;
  readonly policyVersion: string;
};

export type SourceCandidateMemoryCandidate = {
  readonly externalId: string;
  readonly fingerprint: string;
};

export type SourceCandidateMemoryRecord = SourceCandidateMemoryScope & {
  readonly externalId: string;
  readonly fingerprint: string;
  readonly decision: SourceCandidateMemoryDecision;
  readonly reasonCode: SourceCandidateMemoryReasonCode;
  readonly expiresAt: Date;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly seenCount: number;
};

export type SourceCandidateFingerprintInput = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly metadata?: JsonObject;
};

export type SourceCandidateRefreshPolicy = {
  readonly policyVersion: string;
  readonly processedRefreshTtlMs: number;
  readonly rejectedRefreshTtlMs: number;
};

export type SourceCandidateScopeFingerprintInput = {
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly interestQuery?: string;
  readonly sourceQuery: {
    readonly mode: string;
    readonly query: string;
    readonly parameters?: JsonObject;
  };
};

export const sourceCandidateScopeFingerprint = (params: {
  readonly scope: SourceCandidateScopeFingerprintInput;
  readonly policyVersion: string;
}): string =>
  createHash("sha256")
    .update(
      stableJson({
        policyVersion: requiredText(params.policyVersion, "Policy version"),
        interestId: requiredText(params.scope.interestId, "Interest id"),
        sourceBindingId: requiredText(
          params.scope.sourceBindingId,
          "Source binding id",
        ),
        providerKey: requiredText(params.scope.providerKey, "Provider key"),
        interestQuery: params.scope.interestQuery?.trim() ?? null,
        sourceQuery: params.scope.sourceQuery,
      }),
    )
    .digest("hex");

export const sourceCandidateFingerprint = (params: {
  readonly candidate: SourceCandidateFingerprintInput;
  readonly policyVersion: string;
}): string =>
  createHash("sha256")
    .update(
      stableJson({
        policyVersion: requiredText(params.policyVersion, "Policy version"),
        externalId: params.candidate.externalId,
        canonicalUrl: params.candidate.canonicalUrl,
        title: params.candidate.title,
        body: params.candidate.body,
        authorHandle: params.candidate.authorHandle ?? null,
        publishedAt: params.candidate.publishedAt.toISOString(),
        metadata: params.candidate.metadata ?? null,
      }),
    )
    .digest("hex");

export const sourceCandidateRefreshExpiresAt = (params: {
  readonly decision: SourceCandidateMemoryDecision;
  readonly refreshedAt: Date;
  readonly policy: SourceCandidateRefreshPolicy;
}): Date => {
  requiredText(params.policy.policyVersion, "Policy version");
  const ttlMs =
    params.decision === "processed"
      ? params.policy.processedRefreshTtlMs
      : params.policy.rejectedRefreshTtlMs;

  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("Source candidate memory TTL must be a positive integer");
  }

  const expiresAt = new Date(params.refreshedAt.getTime() + ttlMs);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("Source candidate memory expiry must be a valid date");
  }

  return expiresAt;
};

export const sourceCandidateMemoryRecordIsActive = (params: {
  readonly record: SourceCandidateMemoryRecord;
  readonly scope: SourceCandidateMemoryScope;
  readonly candidate: SourceCandidateMemoryCandidate;
  readonly now: Date;
}): boolean =>
  sameScope(params.record, params.scope) &&
  params.record.externalId === params.candidate.externalId &&
  params.record.fingerprint === params.candidate.fingerprint &&
  params.record.expiresAt.getTime() > params.now.getTime();

const sameScope = (
  record: SourceCandidateMemoryRecord,
  scope: SourceCandidateMemoryScope,
): boolean =>
  record.tenantId === scope.tenantId &&
  record.workspaceId === scope.workspaceId &&
  record.interestId === scope.interestId &&
  record.sourceBindingId === scope.sourceBindingId &&
  record.providerKey === scope.providerKey &&
  record.scopeFingerprint === scope.scopeFingerprint &&
  record.policyVersion === scope.policyVersion;

const stableJson = (value: unknown): string => JSON.stringify(canonical(value));

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }

  return value;
};

const requiredText = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
  return normalized;
};
