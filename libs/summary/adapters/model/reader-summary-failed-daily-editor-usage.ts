import type { ReaderSummaryModelEstimate } from "../../ports";

const failedDailyEditorUsageByError = new WeakMap<object, ReaderSummaryModelEstimate>();

/** Preserve the original provider error/classification while retaining spent usage. */
export const attachFailedDailyEditorUsage = (
  error: unknown, usage: ReaderSummaryModelEstimate,
): void => {
  if (error !== null && typeof error === "object") {
    failedDailyEditorUsageByError.set(error, usage);
  }
};

export const readFailedDailyEditorUsage = (error: unknown):
  ReaderSummaryModelEstimate | undefined =>
  error !== null && typeof error === "object"
    ? failedDailyEditorUsageByError.get(error)
    : undefined;
