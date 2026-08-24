import type { ReaderSummaryArtifactProps } from "../../../domain";
import { requireDate, requireString, requireStringArray } from "./prisma-reader-summary-payload-parsers";
import type { SerializedReaderSummarySourceWindow } from "./prisma-reader-summary-payload-types";

export const normalizeReaderSummarySourceWindow = (
  value: unknown,
): ReaderSummaryArtifactProps["sourceWindow"] => {
  if (value === undefined || value === null || typeof value !== "object" ||
      Array.isArray(value)) {
    throw new Error("Reader summary artifact source window payload is invalid");
  }
  const sourceWindow = value as SerializedReaderSummarySourceWindow;
  return {
    windowId: requireString(
      sourceWindow.windowId,
      "Reader summary source window id",
    ),
    startedAt: requireDate(
      sourceWindow.startedAt,
      "Reader summary source window start",
    ),
    endedAt: requireDate(
      sourceWindow.endedAt,
      "Reader summary source window end",
    ),
    ...optionalDate(
      "periodStartedAt",
      sourceWindow.periodStartedAt,
      "Reader summary promotion period start",
    ),
    ...optionalDate(
      "periodEndedAt",
      sourceWindow.periodEndedAt,
      "Reader summary promotion period end",
    ),
    ...optionalDate(
      "ingestionCutoff",
      sourceWindow.ingestionCutoff,
      "Reader summary promotion ingestion cutoff",
    ),
    selectedFeedItemIds: requireStringArray(
      sourceWindow.selectedFeedItemIds,
      "Reader summary source window selected feed ids",
    ),
    storyClusterIds: requireStringArray(
      sourceWindow.storyClusterIds,
      "Reader summary source window story cluster ids",
    ),
  };
};

const optionalDate = <TKey extends keyof Pick<
  ReaderSummaryArtifactProps["sourceWindow"],
  "periodStartedAt" | "periodEndedAt" | "ingestionCutoff"
>>(
  key: TKey,
  value: unknown,
  label: string,
): Partial<Pick<ReaderSummaryArtifactProps["sourceWindow"], TKey>> => value === undefined
  ? {}
  : { [key]: requireDate(value, label) } as Pick<
      ReaderSummaryArtifactProps["sourceWindow"],
      TKey
    >;
