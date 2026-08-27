import {
  readExactDayCollectionArtifact,
  readerSummaryDailyCollectionArtifactPath,
} from "./reader-summary-clean-real-day-collection-artifact";
import { readerSummaryProductionHistoryScope } from "./reader-summary-daily-maintenance-scope";

export const productionHistoryCollection = (params: {
  readonly directory: string | undefined;
  readonly collectionDate: string;
  readonly evaluatedAt: Date;
}): Readonly<{ path: string; arguments: readonly string[] }> | null => {
  if (params.directory === undefined) return null;
  const path = readerSummaryDailyCollectionArtifactPath({
    directory: params.directory,
    collectionDate: params.collectionDate,
  });
  if (params.collectionDate === previousUtcDate(params.evaluatedAt)) {
    return {
      path,
      arguments: [
        "--production-scheduled-scope",
        "--exact-date-artifact-directory",
        params.directory,
      ],
    };
  }
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

const previousUtcDate = (evaluatedAt: Date): string => {
  const value = new Date(evaluatedAt);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};
