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
  const ingestionCutoff = optionalDate(
    "ingestionCutoff",
    sourceWindow.ingestionCutoff,
    "Reader summary promotion ingestion cutoff",
  );
  const exactIngestionCutoff = optionalExactIngestionCutoff(
    sourceWindow.exactIngestionCutoff,
    ingestionCutoff.ingestionCutoff,
  );
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
    ...ingestionCutoff,
    ...exactIngestionCutoff,
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

const optionalExactIngestionCutoff = (
  value: unknown,
  ingestionCutoff: Date | undefined,
): Pick<ReaderSummaryArtifactProps["sourceWindow"], "exactIngestionCutoff"> | Record<string, never> => {
  if (value === undefined) return {};
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) || ingestionCutoff === undefined ||
      Date.parse(value) !== ingestionCutoff.getTime()) {
    throw new Error("Reader summary exact ingestion cutoff is invalid");
  }
  return { exactIngestionCutoff: value };
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
