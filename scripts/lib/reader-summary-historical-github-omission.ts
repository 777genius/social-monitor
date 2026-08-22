import { createHash } from "node:crypto";

import {
  isGitHubTrendingEvidence,
  type StoryCluster,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";

import { noRawSecretFragments } from "./yesterday-social-replay-support";

export type HistoricalGitHubOmission = {
  readonly reason: string;
  readonly authorizedAt: Date;
  readonly readerQuality: "limited_sources";
};

export const resolveHistoricalGitHubOmission = (params: {
  readonly argv: readonly string[];
  readonly reason?: string;
  readonly cadence: string;
  readonly timezone: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly now: Date;
}): HistoricalGitHubOmission | undefined => {
  const explicitlyAllowed = params.argv.includes(
    "--allow-historical-github-omission",
  );
  const reason = params.reason?.trim();
  if (!explicitlyAllowed && reason === undefined) {
    return undefined;
  }
  if (
    !explicitlyAllowed ||
    reason === undefined ||
    reason.length < 20 ||
    reason.length > 500 ||
    /[\r\n]/u.test(reason) ||
    !noRawSecretFragments(reason)
  ) {
    throw new Error(
      "Historical GitHub omission requires both --allow-historical-github-omission and DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON",
    );
  }
  const expectedEnd = new Date(
    params.periodStartedAt.getTime() + 24 * 60 * 60 * 1_000,
  );
  if (
    params.cadence !== "daily" ||
    params.timezone !== "UTC" ||
    params.periodStartedAt.getUTCHours() !== 0 ||
    params.periodStartedAt.getUTCMinutes() !== 0 ||
    params.periodStartedAt.getUTCSeconds() !== 0 ||
    params.periodStartedAt.getUTCMilliseconds() !== 0 ||
    params.periodEndedAt.getTime() !== expectedEnd.getTime() ||
    params.periodEndedAt.getTime() >
      Date.UTC(
        params.now.getUTCFullYear(),
        params.now.getUTCMonth(),
        params.now.getUTCDate(),
      )
  ) {
    throw new Error(
      "Historical GitHub omission is restricted to one completed exact UTC day",
    );
  }

  return { reason, authorizedAt: params.now, readerQuality: "limited_sources" };
};

export class HistoricalGitHubOmissionEvidenceSelector
  implements ReaderSummaryEvidenceSelectorPort
{
  constructor(
    private readonly delegate: ReaderSummaryEvidenceSelectorPort,
  ) {}

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ): Promise<SummaryEvidenceSelection> {
    return omitGitHubEvidence(await this.delegate.select(params));
  }
}

export const omitGitHubEvidence = (
  selection: SummaryEvidenceSelection,
): SummaryEvidenceSelection => {
  const selectedEvidence = selection.selectedEvidence.filter(
    (item) => !isGitHubTrendingEvidence(item),
  );
  const evidenceById = new Map(
    selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusteredFeedItemIds = new Set<string>();
  const clusters = selection.clusters.flatMap((cluster) => {
    const evidence = clusterEvidence(cluster, evidenceById);
    evidence.forEach((item) => clusteredFeedItemIds.add(item.feedItemId));
    return evidence.length === 0 ? [] : [rebuildRetainedCluster(evidence)];
  });
  for (const item of selectedEvidence) {
    if (!clusteredFeedItemIds.has(item.feedItemId)) {
      clusters.push(rebuildRetainedCluster([item]));
    }
  }
  const publishedTimes = selectedEvidence.map((item) =>
    item.publishedAt.getTime(),
  );
  const startedAt = publishedTimes.length === 0
    ? new Date(0)
    : new Date(Math.min(...publishedTimes));
  const latestPublishedAt = publishedTimes.length === 0
    ? 0
    : Math.max(...publishedTimes);
  const endedAt = new Date(
    latestPublishedAt > startedAt.getTime()
      ? latestPublishedAt
      : startedAt.getTime() + 1,
  );

  return {
    rankingPolicyVersion: "historical_github_omission_v1",
    ...(selection.personalization === undefined
      ? {}
      : { personalization: selection.personalization }),
    selectedEvidence,
    clusters,
    sourceWindow: {
      windowId: `historical-github-omission:${stableDigest([
        ...selectedEvidence.map((item) => item.feedItemId),
        ...clusters.map((cluster) => cluster.id),
      ])}`,
      startedAt,
      endedAt,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
  };
};

const clusterEvidence = (
  cluster: StoryCluster,
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly SummaryEvidenceItem[] =>
  [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]
    .flatMap((feedItemId) => {
      const evidence = evidenceById.get(feedItemId);
      return evidence === undefined ? [] : [evidence];
    });

const rebuildRetainedCluster = (
  retainedEvidence: readonly SummaryEvidenceItem[],
): StoryCluster => {
  const evidence = [...retainedEvidence].sort(compareRetainedEvidence);
  const representative = evidence[0];
  if (representative === undefined) {
    throw new Error("Historical omission cluster requires retained evidence");
  }
  const observedTimes = evidence.map((item) => item.observedAt.getTime());
  const baseScore = Math.max(
    0,
    ...evidence.map((item) => Number.isFinite(item.score) ? item.score : 0),
  );
  const clusterIdentity = stableDigest(
    evidence
      .map((item) =>
        [
          item.feedItemId,
          item.sourceItemId,
          item.sourceBindingId,
          item.providerKey,
          item.canonicalUrl,
        ].join("\u0000"),
      )
      .sort(),
  );
  const storyIdentity = stableDigest([
    representative.providerKey,
    representative.sourceItemId,
    representative.canonicalUrl,
    representative.title,
  ]);

  return {
    id: `historical-retained:${clusterIdentity}`,
    storyKey: `historical-retained:${storyIdentity}`,
    rankingPolicyVersion: "historical_github_omission_v1",
    representativeFeedItemId: representative.feedItemId,
    duplicateFeedItemIds: evidence.slice(1).map((item) => item.feedItemId),
    interestIds: uniqueSorted(evidence.map((item) => item.interestId)),
    providerKeys: uniqueSorted(evidence.map((item) => item.providerKey)),
    score: baseScore,
    signalBreakdown: {
      baseScore,
      crossProviderSupport: 0,
      sameProviderSupport: 0,
      providerDiversityBoost: 0,
      interestDiversityBoost: 0,
      freshnessBoost: 0,
      totalScore: baseScore,
    },
    observedAtRange: {
      startedAt: new Date(Math.min(...observedTimes)),
      endedAt: new Date(Math.max(...observedTimes) + 1),
    },
    whyImportant: uniqueStable(
      evidence.flatMap((item) => item.whyImportant),
    ),
  };
};

const compareRetainedEvidence = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number =>
  right.score - left.score ||
  right.observedAt.getTime() - left.observedAt.getTime() ||
  left.feedItemId.localeCompare(right.feedItemId);

const stableDigest = (values: readonly string[]): string =>
  createHash("sha256").update(values.join("\u0000")).digest("hex");

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort();

const uniqueStable = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];
