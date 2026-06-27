import type { ReaderSummaryContent } from "./reader-summary-artifact";

export const assertReaderSummaryContentShape = (
  content: ReaderSummaryContent,
): void => {
  const isNoSignal =
    content.qualityState.status === "no_signal" ||
    content.qualityState.flags.includes("no_signal");

  if (isNoSignal) {
    if (content.topReads.length > 0) {
      throw new Error(
        "No-signal reader summary content must not include top reads",
      );
    }
    if (content.sourceMix.length > 0) {
      throw new Error(
        "No-signal reader summary content must not include source mix",
      );
    }

    return;
  }

  if (content.topReads.length === 0) {
    throw new Error(
      "Reader summary content with signal must include top reads",
    );
  }
  if (content.sourceMix.length === 0) {
    throw new Error(
      "Reader summary content with signal must include source mix",
    );
  }
};
