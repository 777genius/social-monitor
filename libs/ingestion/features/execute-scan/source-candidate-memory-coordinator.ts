import {
  SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
  classifySourceCandidateChange,
  sourceCandidateFingerprintSet,
  sourceCandidateRefreshExpiresAt,
  sourceCandidateScopeFingerprint,
} from "../../domain";
import type {
  FetchedSourceItem,
  SourceCandidateChangeClassification,
  SourceCandidateMemoryCandidate,
  SourceCandidateMemoryPort,
  SourceQuery,
} from "../../ports";

export type SourceCandidateProcessingScope = {
  readonly tenantId: Parameters<
    SourceCandidateMemoryPort["screen"]
  >[0]["tenantId"];
  readonly workspaceId: Parameters<
    SourceCandidateMemoryPort["screen"]
  >[0]["workspaceId"];
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly interestQuery?: string;
  readonly sourceQuery: SourceQuery;
};

export type SourceCandidateScreening = {
  readonly memoryScope: {
    readonly tenantId: SourceCandidateProcessingScope["tenantId"];
    readonly workspaceId: SourceCandidateProcessingScope["workspaceId"];
    readonly interestId: string;
    readonly sourceBindingId: string;
    readonly providerKey: string;
    readonly scopeFingerprint: string;
    readonly policyVersion: string;
  };
  readonly candidates: readonly SourceCandidateMemoryCandidate[];
  readonly classifications: readonly SourceCandidateChangeClassification[];
  readonly previousExpiresAtByExternalId: ReadonlyMap<string, Date>;
  readonly itemsToEnrich: readonly FetchedSourceItem[];
  readonly itemsForEngagementRefresh: readonly FetchedSourceItem[];
  readonly itemsToProcess: readonly FetchedSourceItem[];
  readonly suppressedExternalIds: readonly string[];
  readonly legacyFallbackExternalIds: readonly string[];
  readonly classificationReliable: boolean;
  readonly warning?: string;
};

export const screenSourceCandidates = async (params: {
  readonly memory: SourceCandidateMemoryPort;
  readonly scope: SourceCandidateProcessingScope;
  readonly items: readonly FetchedSourceItem[];
  readonly screenedAt: Date;
}): Promise<SourceCandidateScreening> => {
  const memoryScope = {
    tenantId: params.scope.tenantId,
    workspaceId: params.scope.workspaceId,
    interestId: params.scope.interestId,
    sourceBindingId: params.scope.sourceBindingId,
    providerKey: params.scope.providerKey,
    scopeFingerprint: sourceCandidateScopeFingerprint({
      policyVersion: SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
      scope: {
        interestId: params.scope.interestId,
        sourceBindingId: params.scope.sourceBindingId,
        providerKey: params.scope.providerKey,
        interestQuery: params.scope.interestQuery,
        sourceQuery: params.scope.sourceQuery,
      },
    }),
    policyVersion: SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
  };
  const candidates = params.items.map((item) => ({
    externalId: item.externalId,
    ...sourceCandidateFingerprintSet({
      candidate: item,
      providerKey: params.scope.providerKey,
      policyVersion: SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
      observedAt: params.screenedAt,
    }),
  }));
  let classifications: readonly SourceCandidateChangeClassification[] = [];
  let previousExpiresAtByExternalId: ReadonlyMap<string, Date> = new Map();
  let classificationReliable = true;
  let warning: string | undefined;
  try {
    const screened = await params.memory.screen({
      ...memoryScope,
      candidates,
      screenedAt: params.screenedAt,
    });
    const recordsByExternalId = new Map(
      (screened.records ?? screened.activeRecords).map((record) => [
        record.externalId,
        record,
      ]),
    );
    previousExpiresAtByExternalId = new Map(
      [...recordsByExternalId].map(([externalId, record]) => [
        externalId,
        record.expiresAt,
      ]),
    );
    classifications = candidates.map((candidate) =>
      classifySourceCandidateChange({
        scope: memoryScope,
        candidate,
        record: recordsByExternalId.get(candidate.externalId),
        now: params.screenedAt,
      }),
    );
  } catch {
    warning = "source_candidate_memory.read_failed";
    classificationReliable = false;
    classifications = candidates.map((candidate) => ({
      externalId: candidate.externalId,
      kind: "new" as const,
      legacyFallback: false,
    }));
  }
  const classifiedItems = params.items.map((item, index) => ({
    item,
    classification: classifications[index]!,
  }));
  const itemsToEnrich = classifiedItems
    .filter(({ classification }) =>
      ["new", "content_changed"].includes(classification.kind),
    )
    .map(({ item }) => item);
  const itemsForEngagementRefresh = classifiedItems
    .filter(({ classification }) =>
      ["engagement_changed", "observation_due"].includes(classification.kind),
    )
    .map(({ item }) => item);
  const suppressedExternalIds = classifications
    .filter((classification) => classification.kind === "unchanged")
    .map((classification) => classification.externalId);

  return {
    memoryScope,
    candidates,
    classifications,
    previousExpiresAtByExternalId,
    itemsToEnrich,
    itemsForEngagementRefresh,
    itemsToProcess: classifiedItems
      .filter(({ classification }) => classification.kind !== "unchanged")
      .map(({ item }) => item),
    suppressedExternalIds,
    legacyFallbackExternalIds: classifications
      .filter((classification) => classification.legacyFallback)
      .map((classification) => classification.externalId),
    classificationReliable,
    ...(warning === undefined ? {} : { warning }),
  };
};

export const rememberProcessedSourceCandidates = async (params: {
  readonly memory: SourceCandidateMemoryPort;
  readonly screening: SourceCandidateScreening;
  readonly processedExternalIds: ReadonlySet<string>;
  readonly rememberedAt: Date;
}): Promise<string | undefined> => {
  try {
    const classificationByExternalId = new Map(
      params.screening.classifications.map((classification) => [
        classification.externalId,
        classification,
      ]),
    );
    await params.memory.remember({
      ...params.screening.memoryScope,
      rememberedAt: params.rememberedAt,
      candidates: params.screening.candidates
        .filter((candidate) =>
          params.processedExternalIds.has(candidate.externalId),
        )
        .map((candidate) => ({
          ...candidate,
          decision: "processed" as const,
          reasonCode: "already_processed" as const,
          expiresAt: anchoredCandidateExpiry({
            candidate,
            classificationKind: classificationByExternalId.get(
              candidate.externalId,
            )?.kind,
            previousExpiresAt:
              params.screening.previousExpiresAtByExternalId.get(
                candidate.externalId,
              ),
            rememberedAt: params.rememberedAt,
          }),
        })),
    });
    return undefined;
  } catch {
    return "source_candidate_memory.write_failed";
  }
};

const anchoredCandidateExpiry = (params: {
  readonly candidate: SourceCandidateMemoryCandidate;
  readonly classificationKind?: SourceCandidateChangeClassification["kind"];
  readonly previousExpiresAt?: Date;
  readonly rememberedAt: Date;
}): Date => {
  if (
    params.classificationKind === "engagement_changed" &&
    params.previousExpiresAt !== undefined &&
    params.previousExpiresAt.getTime() > params.rememberedAt.getTime()
  ) {
    return params.previousExpiresAt;
  }
  return params.candidate.observationIntervalMs === undefined
    ? sourceCandidateRefreshExpiresAt({
        decision: "processed",
        refreshedAt: params.rememberedAt,
        policy: {
          policyVersion: SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
          processedRefreshTtlMs: 12 * 60 * 60 * 1_000,
          rejectedRefreshTtlMs: 6 * 60 * 60 * 1_000,
        },
      })
    : new Date(
        params.rememberedAt.getTime() +
          params.candidate.observationIntervalMs,
      );
};
