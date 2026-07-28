import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import {
  buildReaderSummaryPeriod,
  StoryClusteringService,
  type ReaderSummaryGitHubProjectionItem,
  type ReaderSummaryPeriod,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";
import type {
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryDayAuthority,
  ReaderSummaryProductionRecoveryEvidence,
  ReaderSummaryProductionRecoveryProviderKey,
  ReaderSummaryProductionRecoveryRequestedUtcDate,
} from "@social-monitor/summary/ports";
import {
  readerSummaryProductionRecoveryExpectedProviderCounts,
  readerSummaryProductionRecoveryProviderKeys,
  readerSummaryProductionRecoveryRequestedUtcDates,
} from "@social-monitor/summary/ports";
import {
  tenantId,
  workspaceId,
  type Clock,
} from "@social-monitor/shared-kernel";

export const readerSummaryProductionRecoveryDates =
  readerSummaryProductionRecoveryRequestedUtcDates;

export type ReaderSummaryProductionRecoveryDate =
  ReaderSummaryProductionRecoveryRequestedUtcDate;

export type ReaderSummaryProductionRecoveryPlan = Readonly<{
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  canonicalSha256: string;
  dryRunCanonicalSha256s: readonly [string, string];
  days: readonly ReaderSummaryProductionRecoveryDayPlan[];
}>;

export type ReaderSummaryProductionRecoveryDayPlan = Readonly<{
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  canonicalSha256: string;
  providerEvidenceSha256: string;
  providerCounts: Readonly<Record<ReaderSummaryProductionRecoveryProviderKey, number>>;
  totalEvidenceCount: number;
  primaryEvidenceCount: number;
  githubEvidenceCount: number;
  githubMode: "historical_unavailable" | "verified_existing";
}>;

export type ProductionRecoveryEvidenceSelectionInput = Readonly<{
  binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  maxPrimaryEvidenceItems: number;
  feedItems: FeedItemReadRepositoryPort;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  clock: Clock;
}>;

type EnrichedEvidence = Readonly<{
  authority: ReaderSummaryProductionRecoveryEvidence;
  title: string;
  bodyPreview: string;
  sourceText?: string;
  authorHandle?: string;
  interestId: string;
}>;

export const buildReaderSummaryProductionRecoveryPlan = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): ReaderSummaryProductionRecoveryPlan => {
  assertAuthorityBinding(binding);
  const days = binding.days.map(dayPlan);
  return {
    recoveryId: binding.recoveryId,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    canonicalSha256: binding.canonicalSha256,
    dryRunCanonicalSha256s: binding.dryRunCanonicalSha256s,
    days,
  };
};

export const dayAuthority = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): ReaderSummaryProductionRecoveryDayAuthority => {
  const day = binding.days.find(
    (candidate) => candidate.requestedUtcDate === requestedUtcDate,
  );
  if (day === undefined) {
    throw new Error(
      `Reader summary production recovery lacks ${requestedUtcDate} authority`,
    );
  }
  return day;
};

export const periodForRecoveryDate = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): ReaderSummaryPeriod => {
  const startedAt = new Date(`${requestedUtcDate}T00:00:00.000Z`);
  const endedAt = new Date(startedAt.getTime() + 86_400_000);
  return buildReaderSummaryPeriod({
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
  });
};

export const buildRecoveryEvidenceSelection = async (
  input: ProductionRecoveryEvidenceSelectionInput,
): Promise<SummaryEvidenceSelection> => {
  const day = dayAuthority(input.binding, input.requestedUtcDate);
  const period = periodForRecoveryDate(input.requestedUtcDate);
  const primaryAuthority = primaryEvidenceRows(day).slice(
    0,
    input.maxPrimaryEvidenceItems,
  );
  const primary = primaryAuthority.map((authority) => ({
    authority,
    title: authority.title,
    bodyPreview: authority.bodyPreview,
    sourceText: authority.sourceText,
    authorHandle: authority.authorHandle,
    interestId: authority.interestId,
  }));
  const primaryItems = primary.map((item, index) =>
    toSummaryEvidenceItem(item, index, false),
  );
  const clustered = new StoryClusteringService(input.clock).cluster({
    identity: {
      tenantId: tenantId(input.binding.tenantId),
      workspaceId: workspaceId(input.binding.workspaceId),
      scope: { type: "workspace" },
    },
    items: primaryItems,
    limit: input.maxPrimaryEvidenceItems,
  });
  const githubItems = await verifiedGitHubSupplementalEvidence({
    binding: input.binding,
    day,
    period,
    githubProjectionReader: input.githubProjectionReader,
  });
  const selectedEvidence = [...clustered.selectedEvidence, ...githubItems];

  return {
    ...clustered,
    sourceWindow: {
      ...clustered.sourceWindow,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
    },
    selectedEvidence,
  };
};

export const recoveryProvenanceForDay = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
) => {
  const day = dayAuthority(binding, requestedUtcDate);
  return {
    schemaVersion: "reader_summary.summary_only_recovery_provenance.v1" as const,
    mode: "summary-only" as const,
    collectionUtcPeriod: {
      startedAt: day.period.startedAt,
      endedAt: day.period.endedAt,
      timezone: day.period.timezone,
    },
    priorCollectionProof: {
      sourceAttempt: {
        artifactFormat: "reader-summary-production-recovery-authority-v2",
        sha256: binding.canonicalSha256,
      },
      collectionArtifact: {
        artifactFormat: "reader-summary-production-recovery-day-v2",
        sha256: day.canonicalSha256,
      },
      collectionQualityReport: {
        artifactFormat: "reader-summary-production-recovery-evidence-v2",
        sha256: day.providerEvidenceSha256,
      },
    },
    regenerationInputManifest: {
      artifactFormat: "reader-summary-production-recovery-plan-v2",
      sha256: day.canonicalSha256,
      datasetSha256: day.providerEvidenceSha256,
    },
  };
};

const assertAuthorityBinding = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): void => {
  if (
    binding.schemaVersion !== "reader_summary.production_recovery_authority.v2" ||
    JSON.stringify(binding.requestedUtcDates) !==
      JSON.stringify(readerSummaryProductionRecoveryDates) ||
    binding.boundaries.stage !== "pre_model" ||
    binding.boundaries.modelCallPerformed ||
    binding.boundaries.publicationPerformed ||
    binding.boundaries.recollectionPerformed ||
    binding.lease.state !== "CONSUMED" ||
    binding.dryRunCanonicalSha256s[0] !== binding.canonicalSha256 ||
    binding.dryRunCanonicalSha256s[1] !== binding.canonicalSha256 ||
    binding.days.length !== 4
  ) {
    throw new Error(
      "Reader summary production recovery authority is not exact pre-model Jul23-Jul26 scope",
    );
  }
  for (const expectedDate of readerSummaryProductionRecoveryDates) {
    dayPlan(dayAuthority(binding, expectedDate));
  }
};

const dayPlan = (
  day: ReaderSummaryProductionRecoveryDayAuthority,
): ReaderSummaryProductionRecoveryDayPlan => {
  const providerCounts = Object.fromEntries(
    day.providerCounts.map((count) => [count.providerKey, count.count]),
  ) as Record<ReaderSummaryProductionRecoveryProviderKey, number>;
  const allRows = readerSummaryProductionRecoveryProviderKeys.flatMap(
    (providerKey) => day.providerEvidence[providerKey],
  );
  const expectedCounts =
    readerSummaryProductionRecoveryExpectedProviderCounts[
      day.requestedUtcDate
    ];
  for (const providerKey of readerSummaryProductionRecoveryProviderKeys) {
    if (
      providerCounts[providerKey] !==
        day.providerEvidence[providerKey].length ||
      providerCounts[providerKey] !== expectedCounts[providerKey]
    ) {
      throw new Error(
        `Reader summary production recovery ${day.requestedUtcDate} provider counts are not exact`,
      );
    }
  }
  const githubRows = day.providerEvidence["github-trending-page"];
  if (
    githubRows.length !== day.githubEvidence.evidenceCount ||
    day.planSha256s[0] !== day.canonicalSha256 ||
    day.planSha256s[1] !== day.canonicalSha256 ||
    githubRows.some((row) => row.github === undefined) ||
    (day.requestedUtcDate === "2026-07-23"
      ? day.githubEvidence.mode !== "historical_unavailable"
      : day.githubEvidence.mode !== "verified_existing")
  ) {
    throw new Error(
      `Reader summary production recovery ${day.requestedUtcDate} requires two identical plan hashes and verified existing GitHub evidence`,
    );
  }
  return {
    requestedUtcDate: day.requestedUtcDate,
    canonicalSha256: day.canonicalSha256,
    providerEvidenceSha256: day.providerEvidenceSha256,
    providerCounts,
    totalEvidenceCount: allRows.length,
    primaryEvidenceCount: allRows.length - githubRows.length,
    githubEvidenceCount: githubRows.length,
    githubMode: day.githubEvidence.mode,
  };
};

const primaryEvidenceRows = (
  day: ReaderSummaryProductionRecoveryDayAuthority,
): readonly ReaderSummaryProductionRecoveryEvidence[] =>
  readerSummaryProductionRecoveryProviderKeys.flatMap((providerKey) =>
    providerKey === "github-trending-page"
      ? []
      : day.providerEvidence[providerKey],
  );

const toSummaryEvidenceItem = (
  item: EnrichedEvidence,
  index: number,
  supplementalGitHub: boolean,
): SummaryEvidenceItem => ({
  feedItemId: item.authority.feedItemId,
  sourceItemId: item.authority.sourceItemId,
  sourceBindingId: item.authority.sourceBindingId,
  interestId: item.interestId,
  providerKey: item.authority.providerKey,
  providerName: providerName(item.authority.providerKey),
  canonicalUrl: item.authority.canonicalUrl,
  title: item.title,
  bodyPreview: item.bodyPreview,
  ...(item.sourceText === undefined ? {} : { sourceText: item.sourceText }),
  ...(item.authorHandle === undefined ? {} : { authorHandle: item.authorHandle }),
  publishedAt: new Date(item.authority.publishedAt),
  observedAt: new Date(item.authority.observedAt),
  score: supplementalGitHub ? 0 : Math.max(0.1, 2 - index / 1_000),
  whyImportant: supplementalGitHub
    ? ["Supplemental GitHub recovery evidence; not eligible for summary or top-read."]
    : ["Selected from immutable DB-derived production recovery authority."],
  contentQuality: supplementalGitHub
    ? {
        qualityScore: 0,
        interestRelevanceScore: 0,
        engagementIntegrityScore: 1,
        eligibleForSummary: false,
        eligibleForTopRead: false,
        needsLlmReview: false,
        decision: "supplemental_only",
        flags: ["github_supplemental_only"],
        reason: "GitHub recovery evidence is supplemental only.",
      }
    : {
        qualityScore: 1,
        interestRelevanceScore: 1,
        engagementIntegrityScore: 1,
        eligibleForSummary: true,
        eligibleForTopRead: true,
        needsLlmReview: false,
        decision: "allow",
        flags: [],
        reason: "DB-owned production recovery authority selected this item.",
      },
});

const verifiedGitHubSupplementalEvidence = async (params: {
  binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  day: ReaderSummaryProductionRecoveryDayAuthority;
  period: ReaderSummaryPeriod;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
}): Promise<readonly SummaryEvidenceItem[]> => {
  if (params.day.githubEvidence.mode === "historical_unavailable") {
    return [];
  }
  const projection = await params.githubProjectionReader.read({
    tenantId: tenantId(params.binding.tenantId),
    workspaceId: workspaceId(params.binding.workspaceId),
    dayStartedAt: params.period.startedAt,
    dayEndedAt: params.period.endedAt,
    observedThrough: new Date(params.binding.lease.consumedAt),
  });
  const verified = verifyProjectionAgainstAuthority(params.day, projection.items);
  const eligibleBindingIds = [...new Set(verified.map((item) => item.sourceBindingId))].sort();
  if (
    projection.pageCount < 1 ||
    JSON.stringify([...projection.eligibleBindingIds].sort()) !==
      JSON.stringify(eligibleBindingIds)
  ) {
    throw new Error(
      `Reader summary production recovery ${params.day.requestedUtcDate} GitHub binding eligibility diverged`,
    );
  }
  return verified.map((item, index) =>
    toSummaryEvidenceItem(
      {
        authority: authorityByFeedItem(params.day).get(item.feedItemId)!,
        title: authorityByFeedItem(params.day).get(item.feedItemId)!.title,
        bodyPreview:
          authorityByFeedItem(params.day).get(item.feedItemId)!.bodyPreview,
        sourceText:
          authorityByFeedItem(params.day).get(item.feedItemId)!.sourceText,
        authorHandle:
          authorityByFeedItem(params.day).get(item.feedItemId)!.authorHandle,
        interestId:
          authorityByFeedItem(params.day).get(item.feedItemId)!.interestId,
      },
      index,
      true,
    ),
  ).map((item, index) => ({
    ...item,
    providerMetricLabels: [
      {
        label: "GitHub Trending Today",
        value: `#${verified[index]!.rank}, +${verified[index]!.starsGained} stars today`,
      },
    ],
    readerActionKind: "watch_repository" as const,
  }));
};

const verifyProjectionAgainstAuthority = (
  day: ReaderSummaryProductionRecoveryDayAuthority,
  projectionItems: readonly ReaderSummaryGitHubProjectionItem[],
): readonly ReaderSummaryGitHubProjectionItem[] => {
  const authority = authorityByFeedItem(day);
  const rows = [...projectionItems]
    .filter((item) => authority.has(item.feedItemId))
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
  if (rows.length !== day.githubEvidence.evidenceCount) {
    throw new Error(
      `Reader summary production recovery ${day.requestedUtcDate} GitHub projection is incomplete`,
    );
  }
  for (const row of rows) {
    const expected = authority.get(row.feedItemId);
    const github = expected?.github;
    if (
      expected === undefined ||
      github === undefined ||
      row.sourceItemId !== expected.sourceItemId ||
      row.sourceBindingId !== expected.sourceBindingId ||
      row.providerKey !== "github-trending-page" ||
      row.scanJobId !== github.scanJobId ||
      row.canonicalUrl !== expected.canonicalUrl ||
      row.repositoryFullName !== github.repositoryIdentity ||
      row.rank !== github.rank ||
      row.checkedAt?.toISOString() !== github.checkedAt ||
      row.publishedAt.toISOString() !== expected.publishedAt ||
      row.observedAt.toISOString() !== expected.observedAt ||
      row.sourceContentHash !== expected.sourceContentHash ||
      row.sourceProviderContentHash !== expected.sourceProviderContentHash ||
      row.metadataKind !== "github_trending_page_repository" ||
      row.window !== "daily" ||
      row.fetchStartedAt === undefined ||
      row.starsGained === undefined
    ) {
      throw new Error(
        `Reader summary production recovery ${day.requestedUtcDate} GitHub projection diverged from authority`,
      );
    }
  }
  return rows;
};

const authorityByFeedItem = (
  day: ReaderSummaryProductionRecoveryDayAuthority,
): ReadonlyMap<string, ReaderSummaryProductionRecoveryEvidence> =>
  new Map(
    day.providerEvidence["github-trending-page"].map((row) => [
      row.feedItemId,
      row,
    ]),
  );

const providerName = (
  providerKey: ReaderSummaryProductionRecoveryProviderKey,
): string => {
  switch (providerKey) {
    case "github-trending-page":
      return "GitHub Trending";
    case "hacker-news":
      return "Hacker News";
    case "reddit":
      return "Reddit";
    case "rss":
      return "RSS";
    case "x-twitter":
      return "X";
  }
};
