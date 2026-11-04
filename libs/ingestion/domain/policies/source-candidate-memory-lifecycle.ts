import type {
  SourceCandidateChangeClassification,
  SourceCandidateChangeKind,
  SourceCandidateMemoryCandidate,
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryScope,
} from './source-candidate-memory-policy';

/** Identity/observation policy: treat cache fingerprints and TTL as separate concerns. */
export const sourceCandidateObservationIntervalMs = (params: {
  readonly publishedAt: Date;
  readonly observedAt: Date;
}): number => {
  assertValidDate(params.publishedAt, "Published at");
  assertValidDate(params.observedAt, "Observed at");
  const ageMs = Math.max(
    0,
    params.observedAt.getTime() - params.publishedAt.getTime(),
  );

  if (ageMs < 6 * 60 * 60 * 1_000) {
    return 30 * 60 * 1_000;
  }
  if (ageMs < 24 * 60 * 60 * 1_000) {
    return 60 * 60 * 1_000;
  }
  if (ageMs < 72 * 60 * 60 * 1_000) {
    return 3 * 60 * 60 * 1_000;
  }
  if (ageMs < 7 * 24 * 60 * 60 * 1_000) {
    return 12 * 60 * 60 * 1_000;
  }
  return 24 * 60 * 60 * 1_000;
};

export const classifySourceCandidateChange = (params: {
  readonly scope: SourceCandidateMemoryScope;
  readonly candidate: SourceCandidateMemoryCandidate;
  readonly record?: SourceCandidateMemoryRecord;
  readonly now: Date;
}): SourceCandidateChangeClassification => {
  assertValidDate(params.now, "Classification time");
  const record = params.record;
  if (
    record === undefined ||
    !sameScope(record, params.scope) ||
    record.externalId !== params.candidate.externalId
  ) {
    return classification(params.candidate.externalId, "new", false);
  }

  const isLegacy =
    record.schemaVersion < 2 || record.contentFingerprint === null;
  if (isLegacy) {
    if (
      record.fingerprint === params.candidate.fingerprint &&
      record.expiresAt.getTime() > params.now.getTime()
    ) {
      return classification(params.candidate.externalId, "unchanged", true);
    }
    return classification(
      params.candidate.externalId,
      "content_changed",
      true,
    );
  }

  if (record.contentFingerprint !== params.candidate.contentFingerprint) {
    return classification(
      params.candidate.externalId,
      "content_changed",
      false,
    );
  }

  const candidateTracksEngagement =
    params.candidate.engagementFingerprint !== undefined;
  const recordTracksEngagement = record.engagementFingerprint !== null;
  if (!candidateTracksEngagement || !recordTracksEngagement) {
    return record.expiresAt.getTime() > params.now.getTime() &&
      !candidateTracksEngagement &&
      !recordTracksEngagement
      ? classification(params.candidate.externalId, "unchanged", false)
      : classification(params.candidate.externalId, "content_changed", false);
  }

  if (
    record.engagementFingerprint !== params.candidate.engagementFingerprint
  ) {
    return classification(
      params.candidate.externalId,
      "engagement_changed",
      false,
    );
  }
  if (record.expiresAt.getTime() <= params.now.getTime()) {
    return classification(
      params.candidate.externalId,
      "observation_due",
      false,
    );
  }
  return classification(params.candidate.externalId, "unchanged", false);
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

const classification = (
  externalId: string,
  kind: SourceCandidateChangeKind,
  legacyFallback: boolean,
): SourceCandidateChangeClassification => ({
  externalId,
  kind,
  legacyFallback,
});

const assertValidDate = (value: Date, label: string): void => {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
};
