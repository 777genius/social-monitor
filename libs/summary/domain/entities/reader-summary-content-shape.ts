import type { ReaderSummaryContent } from "./reader-summary-artifact";
import { isGitHubTrendingProvider } from "../value-objects/reader-summary-provider-identity";

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
    if (
      (content.selectedPosts ?? []).some(
        (item) => !isGitHubTrendingProvider(item),
      )
    ) {
      throw new Error(
        "No-signal reader summary content may include only supplemental GitHub selected posts",
      );
    }
    if (content.sourceMix.length > 0) {
      throw new Error(
        "No-signal reader summary content must not include source mix",
      );
    }
    if (content.claimBoard.length > 0) {
      throw new Error(
        "No-signal reader summary content must not include claim board",
      );
    }
    if ((content.topicMap?.nodes ?? []).length > 0) {
      throw new Error(
        "No-signal reader summary content must not include topic map nodes",
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
