import { readerSummaryArtifactFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  isReaderFacingQualityTopRead,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayTopReadEntry,
} from "@social-monitor/summary/domain";

import { actualDayProjectionSha256 } from "./reader-summary-multi-day-quality-report";

export function readerSummaryMultiDayActualDayFromRecord(
  collectionDate: string,
  record: Parameters<typeof readerSummaryArtifactFromPrisma>[0],
): ReaderSummaryMultiDayActualDay {
  const snapshot = readerSummaryArtifactFromPrisma(record).toSnapshot();
  const citationById = new Map(
    snapshot.citationMap.map((citation) => [citation.citationId, citation]),
  );
  const topReadEntries = projectReaderSummaryMultiDayTopReadEntries({
    collectionDate,
    topReads: (snapshot.content?.topReads ?? []).map((topRead) => ({
      citationIds: topRead.citationIds,
      qualityEligible: isReaderFacingQualityTopRead(topRead),
    })),
    citationFeedItemIdByCitationId: new Map(
      [...citationById].map(([citationId, citation]) => [
        citationId,
        citation.feedItemId,
      ]),
    ),
  });

  return {
    collectionDate,
    modelVersion: record.modelVersion,
    promptVersion: record.promptVersion,
    rankingPolicyVersion: snapshot.lineage.rankingPolicyVersion ?? "unknown",
    storyClusters: snapshot.storyClusters.map((cluster) => ({
      id: cluster.id,
      representativeFeedItemId: cluster.representativeFeedItemId,
      duplicateFeedItemIds: cluster.duplicateFeedItemIds,
      providerKeys: cluster.providerKeys,
    })),
    topReadEntries,
    narrativeSections: (snapshot.content?.narrativeSections ?? []).map(
      (section) => ({
        kind: section.kind,
        ...(section.storyClusterId === undefined
          ? {}
          : { storyClusterId: section.storyClusterId }),
        citationFeedItemIds: section.citationIds
          .map((citationId) => citationById.get(citationId)?.feedItemId)
          .filter(
            (feedItemId): feedItemId is string => feedItemId !== undefined,
          ),
      }),
    ),
  };
}

export function actualDayAndProjectionFromRecord(
  collectionDate: string,
  record: Parameters<typeof readerSummaryArtifactFromPrisma>[0],
): {
  readonly actualDay: ReaderSummaryMultiDayActualDay;
  readonly actualDayProjectionSha256: string;
} {
  const actualDay = readerSummaryMultiDayActualDayFromRecord(
    collectionDate,
    record,
  );
  return {
    actualDay,
    actualDayProjectionSha256: actualDayProjectionSha256(actualDay),
  };
}

export function projectReaderSummaryMultiDayTopReadEntries(params: {
  readonly collectionDate: string;
  readonly topReads: readonly {
    readonly citationIds: readonly string[];
    readonly qualityEligible: boolean;
  }[];
  readonly citationFeedItemIdByCitationId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryMultiDayTopReadEntry[] {
  return params.topReads.map((topRead, index) => {
    const rank = index + 1;
    if (topRead.citationIds.length === 0) {
      throw new Error(
        `Reviewed top-read card ${rank} for ${params.collectionDate} has no citations`,
      );
    }
    const citationFeedItemIds = topRead.citationIds.map((citationId) => {
      const feedItemId = params.citationFeedItemIdByCitationId.get(citationId);
      if (feedItemId === undefined) {
        throw new Error(
          `Reviewed top-read card ${rank} for ${params.collectionDate} references unresolved citation ${citationId}`,
        );
      }
      return feedItemId;
    });
    return {
      citationFeedItemIds,
      qualityEligible: topRead.qualityEligible,
    };
  });
}
