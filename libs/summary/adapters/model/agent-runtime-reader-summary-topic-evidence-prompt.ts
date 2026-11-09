import type { ReaderSummaryTopicLabelerInput } from "../../ports";

export const buildAgentRuntimeTopicEvidenceSamples = (params: {
  readonly candidate: ReaderSummaryTopicLabelerInput["candidates"][number];
  readonly clusterById: ReadonlyMap<
    string,
    ReaderSummaryTopicLabelerInput["clusters"][number]
  >;
  readonly evidenceByFeedItemId: ReadonlyMap<
    string,
    ReaderSummaryTopicLabelerInput["selectedEvidence"][number]
  >;
}): readonly Record<string, unknown>[] => {
  const cluster = params.clusterById.get(params.candidate.storyClusterId);
  const feedItemIds = uniqueStrings([
    cluster?.representativeFeedItemId,
    ...(cluster?.duplicateFeedItemIds ?? []),
  ]);

  return feedItemIds
    .map((feedItemId) => params.evidenceByFeedItemId.get(feedItemId))
    .filter(
      (
        item,
      ): item is ReaderSummaryTopicLabelerInput["selectedEvidence"][number] =>
        item !== undefined,
    )
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      providerKey: item.providerKey,
      authorHandle: item.authorHandle,
      publishedAt: item.publishedAt.toISOString(),
      bodyPreview: truncatePromptText(item.bodyPreview, 320),
      whyImportant: item.whyImportant.slice(0, 2),
    }));
};

/** Bind only selected evidence from each candidate's own story cluster. */
export const buildAgentRuntimeTopicPromptNodes = (
  input: Pick<ReaderSummaryTopicLabelerInput, "clusters" | "selectedEvidence">,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
) => {
  const evidenceByFeedItemId = new Map(
    input.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusterById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  return candidates.map((candidate) => ({
    nodeId: candidate.nodeId,
    fallbackLabel: candidate.fallbackLabel,
    summary: candidate.summary,
    score: candidate.score,
    evidenceCount: candidate.evidenceCount,
    providerKeys: candidate.providerKeys,
    interestIds: candidate.interestIds,
    keywords: candidate.keywords,
    labelCandidates: candidate.labelCandidates.map((labelCandidate) => ({
      label: labelCandidate.label,
      source: labelCandidate.source,
      score: labelCandidate.score,
      evidenceFeedItemIds: labelCandidate.evidenceFeedItemIds,
      rationale: labelCandidate.rationale,
    })),
    evidenceSamples: buildAgentRuntimeTopicEvidenceSamples({
      candidate,
      clusterById,
      evidenceByFeedItemId,
    }),
  }));
};

const uniqueStrings = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values
      .map((value) => value?.trim())
      .filter(
        (value): value is string => value !== undefined && value.length > 0,
      ),
  ),
];

const truncatePromptText = (
  value: string | undefined,
  maxLength: number,
): string | undefined => {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trim()}...`;
};
