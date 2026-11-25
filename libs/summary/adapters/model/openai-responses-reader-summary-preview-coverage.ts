/**
 * A preview is redundant only when its exact transmitted UTF-16 string is
 * wholly inside the hydrated text or one admitted fragment. Never infer
 * coverage from raw/untransmitted source, adjacent fragments or normalization.
 */
export const isReaderSummaryPreviewCoveredByHydratedSource = (
  preview: string | undefined,
  sourceContent: Readonly<Record<string, unknown>> | undefined,
): boolean => {
  if (preview === undefined || preview.length === 0 || sourceContent === undefined) {
    return false;
  }

  const parts: readonly unknown[] = typeof sourceContent.text === "string"
    ? [sourceContent.text]
    : Array.isArray(sourceContent.fragments) ? sourceContent.fragments : [];
  return parts.some((part) => typeof part === "string" && part.includes(preview));
};
