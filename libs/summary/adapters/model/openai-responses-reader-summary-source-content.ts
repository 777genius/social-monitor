import type { SummaryEvidenceItem } from "../../domain";
import { relevantSourceFragments } from "./openai-responses-reader-summary-source-fragments";
export { compactText } from "./openai-responses-reader-summary-source-fragments";

const expandedSourceLimit = 2_500;

export const adaptiveSourceContent = (
  item: SummaryEvidenceItem,
  sourceHydrationLimit: number,
): Record<string, unknown> | undefined => {
  const source = normalizeSourceText(item.sourceText ?? item.bodyPreview,
    sourceHydrationLimit);
  if (source === undefined) {
    return undefined;
  }
  const providerKey = item.providerKey.toLocaleLowerCase("en-US");
  const isSocial = providerKey === "x-twitter" || providerKey === "reddit";
  if (isSocial && source.length <= expandedSourceLimit) {
    return fullSourceContent("full_social_post", source);
  }
  if (source.length <= expandedSourceLimit) {
    return fullSourceContent("full_source_text", source);
  }

  const fragments = relevantSourceFragments(source, item);
  return {
    mode:
      providerKey === "rss" ? "rss_relevant_fragments" : "relevant_fragments",
    originalCharacterCount: source.length,
    includedCharacterCount: fragments.reduce(
      (total, fragment) => total + fragment.length,
      0,
    ),
    fragments,
  };
};

const fullSourceContent = (
  mode: "full_social_post" | "full_source_text",
  source: string,
) => ({
  mode,
  originalCharacterCount: source.length,
  includedCharacterCount: source.length,
  text: source,
});

export const normalizeSourceText = (value: string | undefined,
  sourceHydrationLimit: number): string | undefined => {
  const normalized = value
    ?.slice(0, sourceHydrationLimit)
    .replace(/\[([^\]]+)\]\(\s*https?:\/\/[^)\s]+\s*\)/giu, "$1")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

