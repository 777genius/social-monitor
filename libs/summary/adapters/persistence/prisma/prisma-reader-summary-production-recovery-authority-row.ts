import {
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryProductionRecoveryProviderKeys,
  readerSummaryProductionRecoveryRequestedUtcDates,
  type ReaderSummaryProductionRecoveryAuthorityBinding,
  type ReaderSummaryProductionRecoveryDayAuthority,
  type ReaderSummaryProductionRecoveryEvidence,
  type ReaderSummaryProductionRecoveryProviderKey,
  type ReaderSummaryProductionRecoveryRequestedUtcDate,
} from "../../../ports/reader-summary-production-recovery-authority.port";
import {
  canonicalProductionRecoveryTimestamp,
  exactRecoveryIdentity,
  exactRecoveryPositiveInteger,
  exactRecoveryRecord,
  exactRecoverySha256,
  exactRecoveryText,
  exactRecoveryUuid,
  failProductionRecovery,
  productionRecoveryExpectedCounts,
  productionRecoveryIdentity,
} from "./prisma-reader-summary-production-recovery-authority-row-primitives";

export type ProductionRecoveryScopeRow = Readonly<{
  tenantId: string;
  workspaceId: string;
  issuedAt: Date;
}>;

export type ProductionRecoveryEvidenceRow = Readonly<{
  requestedUtcDate: string;
  providerKey: string;
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  interestId: string;
  providerItemId: string;
  canonicalUrl: string;
  title: string;
  bodyPreview: string;
  sourceText: string;
  authorHandle: string | null;
  sourceContentHash: string;
  sourceProviderContentHash: string | null;
  publishedAt: Date;
  observedAt: Date;
  githubResultId: string | null;
  githubScanJobId: string | null;
  githubAttemptNumber: number | null;
  githubRepositoryIdentity: string | null;
  githubRank: number | null;
  githubCheckedAt: Date | null;
}>;

const boundaries = Object.freeze({
  stage: "pre_model" as const,
  modelCallPerformed: false as const,
  publicationPerformed: false as const,
  recollectionPerformed: false as const,
});

export const buildProductionRecoveryAuthorityBinding = (params: {
  readonly scope: ProductionRecoveryScopeRow;
  readonly rows: readonly ProductionRecoveryEvidenceRow[];
}): ReaderSummaryProductionRecoveryAuthorityBinding => {
  const tenantId = exactRecoveryUuid(params.scope.tenantId, "tenant id");
  const workspaceId = exactRecoveryUuid(
    params.scope.workspaceId,
    "workspace id",
  );
  const issuedAt = canonicalProductionRecoveryTimestamp(
    params.scope.issuedAt,
    "authority timestamp",
  );
  const { identity, recoveryId } = productionRecoveryIdentity({
    tenantId,
    workspaceId,
  });
  const seenFeedIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const days = readerSummaryProductionRecoveryRequestedUtcDates.map((date) =>
    buildDay({
      recoveryId,
      tenantId,
      workspaceId,
      date,
      rows: params.rows.filter((row) => row.requestedUtcDate === date),
      seenFeedIds,
      seenSourceIds,
      issuedAt: params.scope.issuedAt,
    }),
  ) as unknown as ReaderSummaryProductionRecoveryAuthorityBinding["days"];
  if (
    params.rows.length !==
    days.reduce(
      (count, day) =>
        count +
        day.providerCounts.reduce(
          (providerCount, provider) => providerCount + provider.count,
          0,
        ),
      0,
    )
  ) {
    failProductionRecovery(
      "contains evidence outside the exact Jul23-Jul27 scope",
    );
  }
  const canonicalRecord = {
    schemaVersion: "reader_summary.production_recovery_authority.v2",
    recoveryId,
    identity,
    tenantId,
    workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
    boundaries,
    days: days.map((day) => ({
      identity: day.identity,
      requestedUtcDate: day.requestedUtcDate,
      canonicalSha256: day.canonicalSha256,
      providerEvidenceSha256: day.providerEvidenceSha256,
      planSha256s: day.planSha256s,
    })),
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.production_recovery_authority.v2",
    recoveryId,
    identity,
    tenantId,
    workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
    canonicalSha256,
    dryRunCanonicalSha256s: [canonicalSha256, canonicalSha256],
    lease: {
      state: "CONSUMED",
      issuedAt,
      consumedAt: issuedAt,
    },
    boundaries,
    days,
  });
};

export const verifyPersistedProductionRecoveryAuthority = (
  input: unknown,
  expectedSha256: string,
): ReaderSummaryProductionRecoveryAuthorityBinding => {
  const binding = exactRecoveryRecord(input, "persisted authority") as
    unknown as ReaderSummaryProductionRecoveryAuthorityBinding;
  if (
    binding.schemaVersion !==
      "reader_summary.production_recovery_authority.v2" ||
    binding.canonicalSha256 !==
      exactRecoverySha256(expectedSha256, "authority hash") ||
    binding.dryRunCanonicalSha256s?.length !== 2 ||
    binding.dryRunCanonicalSha256s[0] !== binding.canonicalSha256 ||
    binding.dryRunCanonicalSha256s[1] !== binding.canonicalSha256 ||
    binding.lease?.state !== "CONSUMED" ||
    binding.lease.consumedAt !== binding.lease.issuedAt ||
    binding.boundaries?.stage !== "pre_model" ||
    binding.boundaries.modelCallPerformed !== false ||
    binding.boundaries.publicationPerformed !== false ||
    binding.boundaries.recollectionPerformed !== false ||
    JSON.stringify(binding.requestedUtcDates) !==
      JSON.stringify(readerSummaryProductionRecoveryRequestedUtcDates) ||
    binding.days?.length !== 5
  ) {
    failProductionRecovery("persisted authority diverged");
  }
  const rebuilt = buildProductionRecoveryAuthorityBinding({
    scope: {
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      issuedAt: new Date(binding.lease.issuedAt),
    },
    rows: binding.days.flatMap((day) =>
      readerSummaryProductionRecoveryProviderKeys.flatMap((providerKey) =>
        day.providerEvidence[providerKey].map((evidence) =>
          evidenceToRow(day.requestedUtcDate, evidence),
        ),
      ),
    ),
  });
  if (!persistedAuthoritySealMatches(rebuilt, binding)) {
    failProductionRecovery("persisted authority seal diverged");
  }
  return rebuilt;
};

const persistedAuthoritySealMatches = (
  rebuilt: ReaderSummaryProductionRecoveryAuthorityBinding,
  persisted: ReaderSummaryProductionRecoveryAuthorityBinding,
): boolean => {
  try {
    const { days: rebuiltDays, ...rebuiltAuthority } = rebuilt;
    const { days: persistedDays, ...persistedAuthority } = persisted;
    if (
      canonicalJson(rebuiltAuthority) !== canonicalJson(persistedAuthority) ||
      rebuiltDays.length !== persistedDays.length
    ) {
      return false;
    }
    return rebuiltDays.every((rebuiltDay, index) => {
      const persistedDay = persistedDays[index];
      if (persistedDay === undefined) {
        return false;
      }
      const {
        providerEvidence: rebuiltEvidence,
        ...rebuiltDayAuthority
      } = rebuiltDay;
      const {
        providerEvidence: persistedEvidence,
        ...persistedDayAuthority
      } = persistedDay;
      if (
        canonicalJson(rebuiltDayAuthority) !==
          canonicalJson(persistedDayAuthority) ||
        canonicalJson(Object.keys(rebuiltEvidence).sort()) !==
          canonicalJson(Object.keys(persistedEvidence).sort())
      ) {
        return false;
      }
      return readerSummaryProductionRecoveryProviderKeys.every(
        (providerKey) =>
          canonicalJson(rebuiltEvidence[providerKey]) ===
          canonicalJson(persistedEvidence[providerKey]),
      );
    });
  } catch {
    return false;
  }
};

const canonicalJson = (input: unknown): string =>
  canonicalizeReaderSummaryWeeklyJson(input).json;

const buildDay = (params: {
  readonly recoveryId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly date: ReaderSummaryProductionRecoveryRequestedUtcDate;
  readonly rows: readonly ProductionRecoveryEvidenceRow[];
  readonly seenFeedIds: Set<string>;
  readonly seenSourceIds: Set<string>;
  readonly issuedAt: Date;
}): ReaderSummaryProductionRecoveryDayAuthority => {
  const providerEvidence = Object.fromEntries(
    readerSummaryProductionRecoveryProviderKeys.map((providerKey) => [
      providerKey,
      params.rows
        .filter((row) => row.providerKey === providerKey)
        .map((row) => exactEvidence(row, providerKey, params)),
    ]),
  ) as unknown as Record<
    ReaderSummaryProductionRecoveryProviderKey,
    readonly ReaderSummaryProductionRecoveryEvidence[]
  >;
  const providerCounts = readerSummaryProductionRecoveryProviderKeys.map(
    (providerKey) => ({
      providerKey,
      count: providerEvidence[providerKey].length,
    }),
  );
  const expectedCounts = productionRecoveryExpectedCounts[params.date];
  for (const provider of providerCounts) {
    const expected = expectedCounts[provider.providerKey];
    if (provider.count !== expected) {
      failProductionRecovery(
        `${params.date} ${provider.providerKey} requires ${expected} DB rows (found ${provider.count})`,
      );
    }
  }
  const evidenceDigests = readerSummaryProductionRecoveryProviderKeys.map(
    (providerKey) => ({
      providerKey,
      count: providerEvidence[providerKey].length,
      sha256: canonicalizeReaderSummaryWeeklyJson(
        providerEvidence[providerKey],
      ).sha256,
    }),
  );
  const providerEvidenceSha256 =
    canonicalizeReaderSummaryWeeklyJson(evidenceDigests).sha256;
  const githubRows = providerEvidence["github-trending-page"];
  const githubEvidence =
    params.date === "2026-07-23" || params.date === "2026-07-27"
      ? {
          schemaVersion:
            "reader_summary.production_recovery_github_evidence.v2" as const,
          mode: "historical_unavailable" as const,
          providerKey: "github-trending-page" as const,
          requestedUtcDate: params.date,
          evidenceCount: 0 as const,
          authorization: {
            authorizationId:
              `reader_summary.production_recovery.github.${params.date}.v2` as
                | "reader_summary.production_recovery.github.2026-07-23.v2"
                | "reader_summary.production_recovery.github.2026-07-27.v2",
            authorizedAt: canonicalProductionRecoveryTimestamp(
              params.issuedAt,
              "authority timestamp",
            ),
            reason:
              "Historical GitHub trending evidence was not collected for this UTC day; this reviewed recovery records an explicit unavailable marker and uses no substitute data.",
          },
        }
      : {
          schemaVersion:
            "reader_summary.production_recovery_github_evidence.v2" as const,
          mode: "verified_existing" as const,
          providerKey: "github-trending-page" as const,
          requestedUtcDate: params.date,
          evidenceCount: 10 as const,
          evidenceSha256: evidenceDigests[0]!.sha256,
          scanJobIds: [
            ...new Set(githubRows.map((row) => row.github!.scanJobId)),
          ].sort(),
        };
  const period = {
    startedAt: `${params.date}T00:00:00.000Z`,
    endedAt: new Date(
      Date.parse(`${params.date}T00:00:00.000Z`) + 86_400_000,
    ).toISOString(),
    timezone: "UTC" as const,
  };
  const canonicalRecord = {
    schemaVersion: "reader_summary.production_recovery_day.v2",
    recoveryId: params.recoveryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDate: params.date,
    period,
    providerCounts,
    providerEvidenceDigests: evidenceDigests,
    providerEvidenceSha256,
    githubEvidence,
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return {
    schemaVersion: "reader_summary.production_recovery_day.v2",
    identity:
      `reader_summary.production_recovery_day.v2:${canonicalSha256}`,
    requestedUtcDate: params.date,
    period,
    providerCounts,
    providerEvidence,
    providerEvidenceSha256,
    githubEvidence,
    canonicalSha256,
    planSha256s: [canonicalSha256, canonicalSha256],
  };
};

const exactEvidence = (
  row: ProductionRecoveryEvidenceRow,
  providerKey: ReaderSummaryProductionRecoveryProviderKey,
  state: Pick<
    Parameters<typeof buildDay>[0],
    "date" | "seenFeedIds" | "seenSourceIds"
  >,
): ReaderSummaryProductionRecoveryEvidence => {
  const feedItemId = exactRecoveryUuid(row.feedItemId, "feed item id");
  const sourceItemId = exactRecoveryUuid(row.sourceItemId, "source item id");
  if (
    state.seenFeedIds.has(feedItemId) ||
    state.seenSourceIds.has(sourceItemId)
  ) {
    failProductionRecovery("evidence is duplicated across recovery dates");
  }
  state.seenFeedIds.add(feedItemId);
  state.seenSourceIds.add(sourceItemId);
  const evidence: ReaderSummaryProductionRecoveryEvidence = {
    providerKey,
    feedItemId,
    sourceItemId,
    sourceBindingId: exactRecoveryUuid(
      row.sourceBindingId,
      "source binding id",
    ),
    interestId: exactRecoveryUuid(row.interestId, "interest id"),
    providerItemId: exactRecoveryIdentity(
      row.providerItemId,
      "provider item id",
    ),
    canonicalUrl: exactRecoveryIdentity(row.canonicalUrl, "canonical URL"),
    title: exactRecoveryIdentity(row.title, "title"),
    bodyPreview: exactRecoveryText(row.bodyPreview, "body preview"),
    sourceText: exactRecoveryText(row.sourceText, "source text"),
    ...(row.authorHandle === null
      ? {}
      : {
          authorHandle: exactRecoveryIdentity(
            row.authorHandle,
            "author handle",
          ),
        }),
    sourceContentHash: exactRecoverySha256(
      row.sourceContentHash,
      "content hash",
    ),
    sourceProviderContentHash:
      row.sourceProviderContentHash === null
        ? null
        : exactRecoverySha256(
            row.sourceProviderContentHash,
            "provider content hash",
          ),
    publishedAt: canonicalProductionRecoveryTimestamp(
      row.publishedAt,
      "published timestamp",
    ),
    observedAt: canonicalProductionRecoveryTimestamp(
      row.observedAt,
      "observed timestamp",
    ),
  };
  if (providerKey !== "github-trending-page") {
    return evidence;
  }
  if (
    row.githubResultId === null ||
    row.githubScanJobId === null ||
    row.githubAttemptNumber === null ||
    row.githubRepositoryIdentity === null ||
    row.githubRank === null ||
    row.githubCheckedAt === null
  ) {
    failProductionRecovery(
      `${state.date} GitHub evidence lacks completed collection proof`,
    );
  }
  return {
    ...evidence,
    github: {
      resultId: exactRecoveryUuid(row.githubResultId, "GitHub result id"),
      scanJobId: exactRecoveryUuid(row.githubScanJobId, "GitHub scan job id"),
      scanAttemptNumber: exactRecoveryPositiveInteger(
        row.githubAttemptNumber,
        "GitHub attempt",
      ),
      repositoryIdentity: exactRecoveryIdentity(
        row.githubRepositoryIdentity,
        "GitHub repository",
      ),
      rank: exactRecoveryPositiveInteger(row.githubRank, "GitHub rank"),
      checkedAt: canonicalProductionRecoveryTimestamp(
        row.githubCheckedAt,
        "GitHub checked timestamp",
      ),
    },
  };
};

const evidenceToRow = (
  requestedUtcDate: string,
  evidence: ReaderSummaryProductionRecoveryEvidence,
): ProductionRecoveryEvidenceRow => ({
  requestedUtcDate,
  providerKey: evidence.providerKey,
  feedItemId: evidence.feedItemId,
  sourceItemId: evidence.sourceItemId,
  sourceBindingId: evidence.sourceBindingId,
  interestId: evidence.interestId,
  providerItemId: evidence.providerItemId,
  canonicalUrl: evidence.canonicalUrl,
  title: evidence.title,
  bodyPreview: evidence.bodyPreview,
  sourceText: evidence.sourceText,
  authorHandle: evidence.authorHandle ?? null,
  sourceContentHash: evidence.sourceContentHash,
  sourceProviderContentHash: evidence.sourceProviderContentHash,
  publishedAt: new Date(evidence.publishedAt),
  observedAt: new Date(evidence.observedAt),
  githubResultId: evidence.github?.resultId ?? null,
  githubScanJobId: evidence.github?.scanJobId ?? null,
  githubAttemptNumber: evidence.github?.scanAttemptNumber ?? null,
  githubRepositoryIdentity: evidence.github?.repositoryIdentity ?? null,
  githubRank: evidence.github?.rank ?? null,
  githubCheckedAt:
    evidence.github === undefined ? null : new Date(evidence.github.checkedAt),
});
