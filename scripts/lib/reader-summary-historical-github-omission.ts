import {
  isGitHubTrendingEvidence,
  type SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";

export type HistoricalGitHubOmission = {
  readonly reason: string;
  readonly authorizedAt: Date;
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
  if (!explicitlyAllowed || reason === undefined || reason.length === 0) {
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
    params.periodEndedAt.getTime() > params.now.getTime()
  ) {
    throw new Error(
      "Historical GitHub omission is restricted to one completed exact UTC day",
    );
  }

  return { reason, authorizedAt: params.now };
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
  const retainedFeedItemIds = new Set(
    selectedEvidence.map((item) => item.feedItemId),
  );
  const clusters = selection.clusters.filter(
    (cluster) =>
      retainedFeedItemIds.has(cluster.representativeFeedItemId) &&
      cluster.providerKeys.every(
        (providerKey) =>
          providerKey.trim().toLocaleLowerCase("en-US") !==
          "github-trending-page",
      ),
  );
  const retainedClusterIds = new Set(
    clusters.map((cluster) => cluster.id),
  );

  return {
    ...selection,
    selectedEvidence,
    clusters,
    sourceWindow: {
      ...selection.sourceWindow,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: selection.sourceWindow.storyClusterIds.filter(
        (clusterId) => retainedClusterIds.has(clusterId),
      ),
    },
  };
};
