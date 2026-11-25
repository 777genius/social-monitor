import type { ReaderSummaryCitation } from "../../domain";

/** Resolve provider and canonical URL exclusively from the first known citation. */
export const findTrustedReaderCitation = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryCitation | undefined =>
  citationIds
    .map((citationId) => citationById.get(citationId))
    .find(Boolean);
