import type { ReaderSummaryModelEstimate } from "../../ports";

const failedDailyEditorUsage = Symbol("failed-daily-editor-usage");
type UsageBearingError = { readonly [failedDailyEditorUsage]?: ReaderSummaryModelEstimate };

/** Preserve the original provider error/classification while retaining spent usage. */
export const attachFailedDailyEditorUsage = (
  error: unknown, usage: ReaderSummaryModelEstimate,
): void => {
  if (error !== null && typeof error === "object" && Object.isExtensible(error)) {
    Object.defineProperty(error, failedDailyEditorUsage, { value: usage });
  }
};

export const readFailedDailyEditorUsage = (error: unknown):
  ReaderSummaryModelEstimate | undefined =>
  error !== null && typeof error === "object"
    ? (error as UsageBearingError)[failedDailyEditorUsage]
    : undefined;
