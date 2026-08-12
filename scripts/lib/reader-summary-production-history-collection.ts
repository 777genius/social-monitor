import {
  readExactDayCollectionArtifact,
  readerSummaryDailyCollectionArtifactPath,
} from "./reader-summary-clean-real-day-collection-artifact";
import { readerSummaryProductionHistoryScope } from "./reader-summary-daily-maintenance-scope";

export const productionHistoryCollection = (params: {
  readonly directory: string | undefined;
  readonly collectionDate: string;
}): Readonly<{ path: string; arguments: readonly string[] }> | null => {
  if (params.directory === undefined) return null;
  const path = readerSummaryDailyCollectionArtifactPath({
    directory: params.directory,
    collectionDate: params.collectionDate,
  });
  const existing = readExactDayCollectionArtifact({
    path,
    collectionDate: params.collectionDate,
    expectedScope: readerSummaryProductionHistoryScope,
  });
  return {
    path,
    arguments: [
      ...(existing !== null
        ? ["--production-history-retry"]
        : ["--allow-unproven-existing-window", "--production-history-scope"]),
      "--artifact-directory",
      params.directory,
    ],
  };
};
