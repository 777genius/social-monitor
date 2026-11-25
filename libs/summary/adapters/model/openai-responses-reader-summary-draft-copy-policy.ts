import { readerSummaryHeadline, type ReaderSummaryNarrativeSection } from "../../domain";
import { optionalString, requiredString } from "./openai-responses-reader-summary-raw-values";
import { readerSummaryNarrativeMarkdown } from "./openai-responses-reader-summary-narrative-markdown";

/**
 * Own the provider's publication copy fallbacks. The normalizer coordinates
 * cited stories and sections; this policy preserves the historical admission
 * and precedence order without interpreting citations or provider routing.
 */
export const normalizeOpenAiReaderSummaryLeadCopy = (
  raw: Record<string, unknown>,
): { readonly headline: string; readonly legacyExecutiveSummary: string } => {
  const headline = readerSummaryHeadline(
    requiredString(raw.headline, "reader summary headline"),
  );
  const legacyExecutiveSummary =
    typeof raw.executiveSummary === "string" &&
      raw.executiveSummary.trim().length === 0
      ? ""
      : requiredString(
          raw.executiveSummary,
          "reader summary executive summary",
        );

  return { headline, legacyExecutiveSummary };
};

export const resolveOpenAiReaderSummaryPublicationCopy = (params: {
  readonly raw: Record<string, unknown>;
  readonly legacyExecutiveSummary: string;
  readonly normalizedTopStories: readonly { readonly summary: string }[];
  readonly narrativeSections: readonly ReaderSummaryNarrativeSection[];
}): { readonly noSignalReason?: string; readonly executiveSummary: string } => {
  const { raw, legacyExecutiveSummary, normalizedTopStories, narrativeSections } = params;
  const noSignalReason =
    normalizedTopStories.length === 0
      ? (optionalString(raw.noSignalReason) ??
        "OpenAI reader summary returned no domain-safe cited stories.")
      : undefined;
  const executiveSummary =
    narrativeSections.length === 0
      ? (optionalString(legacyExecutiveSummary) ??
        optionalString(normalizedTopStories[0]?.summary) ??
        noSignalReason ??
        "")
      : readerSummaryNarrativeMarkdown(narrativeSections);

  return { noSignalReason, executiveSummary };
};
