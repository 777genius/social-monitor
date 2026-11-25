export const readerSummaryHeadlinesEquivalent = (
  sourceTitle: string,
  headline: string,
): boolean => {
  const normalizedTitle = normalizeReaderText(sourceTitle);
  return normalizedTitle.length > 0 &&
    normalizedTitle === normalizeReaderText(headline);
};

const normalizeReaderText = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[*_`#~[\]<>]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
