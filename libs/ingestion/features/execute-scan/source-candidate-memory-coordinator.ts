import {
  SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
  sourceCandidateFingerprint,
  sourceCandidateRefreshExpiresAt,
  sourceCandidateScopeFingerprint,
} from "../../domain";
import type {
  FetchedSourceItem,
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
  readonly itemsToProcess: readonly FetchedSourceItem[];
  readonly suppressedExternalIds: readonly string[];
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
    fingerprint: sourceCandidateFingerprint({
      candidate: item,
      policyVersion: SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
    }),
  }));
  const candidateExternalIds = new Set(
    candidates.map((candidate) => candidate.externalId),
  );
  let suppressedExternalIds: readonly string[] = [];
  let warning: string | undefined;
  try {
    const screened = await params.memory.screen({
      ...memoryScope,
      candidates,
      screenedAt: params.screenedAt,
    });
    suppressedExternalIds = [
      ...new Set(
        screened.suppressedExternalIds.filter((externalId) =>
          candidateExternalIds.has(externalId),
        ),
      ),
    ];
  } catch {
    warning = "source_candidate_memory.read_failed";
  }
  const suppressed = new Set(suppressedExternalIds);

  return {
    memoryScope,
    candidates,
    itemsToProcess: params.items.filter(
      (item) => !suppressed.has(item.externalId),
    ),
    suppressedExternalIds,
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
          expiresAt: sourceCandidateRefreshExpiresAt({
            decision: "processed",
            refreshedAt: params.rememberedAt,
            policy: {
              policyVersion: SOURCE_CANDIDATE_MEMORY_POLICY_VERSION,
              processedRefreshTtlMs: 12 * 60 * 60 * 1_000,
              rejectedRefreshTtlMs: 6 * 60 * 60 * 1_000,
            },
          }),
        })),
    });
    return undefined;
  } catch {
    return "source_candidate_memory.write_failed";
  }
};
