import {
  buildSourceEngagementMetrics,
  type SourceItem,
} from "../../domain";
import type {
  SavedSourceItemRef,
  SourceEngagementSample,
} from "../../ports";
import type { SourceCandidateScreening } from "./source-candidate-memory-coordinator";

export const prepareSourceEngagementSamples = (params: {
  readonly providerKey: string;
  readonly persistedItems: readonly SourceItem[];
  readonly savedItems: readonly SavedSourceItemRef[];
  readonly candidateScreening: SourceCandidateScreening;
}): {
  readonly sourceItemsForFullProjection: readonly SourceItem[];
  readonly engagementSamples: readonly SourceEngagementSample[];
} => {
  const savedRefByExternalId = aggregateSavedRefs(params.savedItems);
  const persistedByExternalId = new Map(
    params.persistedItems.map((item) => [item.toSnapshot().externalId, item]),
  );
  const classificationByExternalId = new Map(
    params.candidateScreening.classifications.map((classification) => [
      classification.externalId,
      classification,
    ]),
  );
  const sourceItemsForFullProjection = [...persistedByExternalId.values()];
  const fullProjectionExternalIds = new Set(
    sourceItemsForFullProjection.map((item) => item.toSnapshot().externalId),
  );
  const engagementRefreshByExternalId = new Map(
    params.candidateScreening.itemsForEngagementRefresh.map((item) => [
      item.externalId,
      item,
    ]),
  );
  const engagementSamples = [
    ...[...persistedByExternalId.values()].map((item): SourceEngagementSample | undefined => {
      const snapshot = item.toSnapshot();
      const engagement = reliableEngagement(params.providerKey, snapshot.metadata);
      const ref = savedRefByExternalId.get(snapshot.externalId);
      const classification = classificationByExternalId.get(
        snapshot.externalId,
      );
      const carriesFullCandidateChange =
        ref?.mutationKind !== "unchanged" ||
        classification?.kind === "new" ||
        classification?.kind === "content_changed";
      return engagement === undefined ||
        ref === undefined ||
        !carriesFullCandidateChange
        ? undefined
        : {
            externalId: snapshot.externalId,
            sourceItemId: snapshot.id,
            publishedAt: snapshot.publishedAt,
            ...engagement,
            refreshReadModels: !fullProjectionExternalIds.has(
              snapshot.externalId,
            ),
          };
    }),
    ...[...engagementRefreshByExternalId.values()].map(
      (item): SourceEngagementSample | undefined => {
        const engagement = reliableEngagement(
          params.providerKey,
          item.metadata,
        );
        return engagement === undefined
          ? undefined
          : {
              externalId: item.externalId,
              publishedAt: item.publishedAt,
              ...engagement,
              refreshReadModels:
                classificationByExternalId.get(item.externalId)?.kind ===
                "engagement_changed",
            };
      },
    ),
  ].filter((sample): sample is SourceEngagementSample => sample !== undefined);

  return { sourceItemsForFullProjection, engagementSamples };
};

const mutationPriority: Readonly<Record<SavedSourceItemRef["mutationKind"], number>> = {
  unchanged: 0,
  content_updated: 1,
  inserted: 2,
};

const aggregateSavedRefs = (
  refs: readonly SavedSourceItemRef[],
): ReadonlyMap<string, SavedSourceItemRef> => {
  const aggregated = new Map<string, SavedSourceItemRef>();
  for (const ref of refs) {
    const current = aggregated.get(ref.externalId);
    if (
      current === undefined ||
      mutationPriority[ref.mutationKind] > mutationPriority[current.mutationKind]
    ) {
      aggregated.set(ref.externalId, ref);
    }
  }
  return aggregated;
};

const reliableEngagement = (
  providerKey: string,
  metadata: Parameters<typeof buildSourceEngagementMetrics>[0]["metadata"],
): Pick<
  SourceEngagementSample,
  "metrics" | "metricsFingerprint" | "providerMetadataPatch"
> | undefined => {
  const engagement = buildSourceEngagementMetrics({ providerKey, metadata });
  if (
    engagement.metrics === null ||
    engagement.metricsFingerprint === undefined ||
    !engagement.qualityFlags.metadataKindKnown ||
    engagement.qualityFlags.invalidMetricValue ||
    engagement.qualityFlags.conflictingAliases
  ) {
    return undefined;
  }
  return {
    metrics: engagement.metrics,
    metricsFingerprint: engagement.metricsFingerprint,
    providerMetadataPatch: engagement.providerMetadataPatch,
  };
};
