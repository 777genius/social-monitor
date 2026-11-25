import { createHash } from "node:crypto";

export type ReaderSummarySemanticCorpusContract = {
  readonly selectedFeedItemCount: number;
  readonly selectedFeedItemFingerprint: string;
};

export const buildReaderSummarySemanticCorpusContract = (
  selectedFeedItemIds: readonly string[],
): ReaderSummarySemanticCorpusContract => ({
  selectedFeedItemCount: selectedFeedItemIds.length,
  selectedFeedItemFingerprint: `sha256:${createHash("sha256")
    .update([...selectedFeedItemIds].sort().join("\n"))
    .digest("hex")}`,
});

export const assertReaderSummarySemanticCorpusMatches = (params: {
  readonly actual: ReaderSummarySemanticCorpusContract;
  readonly expected: ReaderSummarySemanticCorpusContract;
}): void => {
  if (
    params.actual.selectedFeedItemCount ===
      params.expected.selectedFeedItemCount &&
    params.actual.selectedFeedItemFingerprint ===
      params.expected.selectedFeedItemFingerprint
  ) {
    return;
  }

  throw new Error(
    [
      "Semantic gold corpus does not match the artifact source window.",
      `Expected ${params.expected.selectedFeedItemCount} items (${params.expected.selectedFeedItemFingerprint}).`,
      `Received ${params.actual.selectedFeedItemCount} items (${params.actual.selectedFeedItemFingerprint}).`,
      "Refresh the reviewed gold set before interpreting semantic metrics.",
    ].join(" "),
  );
};
