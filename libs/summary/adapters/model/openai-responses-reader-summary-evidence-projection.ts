import type { SummaryEvidenceItem } from "../../domain";
import { adaptiveSourceContent, compactText } from "./openai-responses-reader-summary-source-content";
import { acceptedReaderPresentation } from "./openai-responses-reader-summary-verified-presentation";
import { compactConversationContext } from "./openai-responses-reader-summary-conversation-context";
import { isReaderSummaryPreviewCoveredByHydratedSource } from "./openai-responses-reader-summary-preview-coverage";
import { projectReaderSummaryContentQuality } from "./openai-responses-reader-summary-content-quality-projection";

export { acceptedReaderPresentation } from "./openai-responses-reader-summary-verified-presentation";
export { compactConversationContext } from "./openai-responses-reader-summary-conversation-context";

export const compactStringArray = (
  values: readonly string[],
  maxItems: number,
  maxLength: number,
): readonly string[] =>
  values.slice(0, maxItems).map((value) => compactText(value, maxLength));


const baselineTextLimit = 600;

export const projectReaderSummaryPromptEvidenceItem = (
  item: SummaryEvidenceItem,
  index: number,
  expanded: boolean,
  citationId: string,
  sourceHydrationLimit: number,
  verifiedV3Presentation: boolean,
): Record<string, unknown> => {
  const baselineSource = item.sourceText ?? item.bodyPreview;
  const preview = baselineSource === undefined
    ? undefined : compactText(baselineSource, baselineTextLimit);
  const sourceContent = expanded ? adaptiveSourceContent(item, sourceHydrationLimit) : undefined;
  const covered = isReaderSummaryPreviewCoveredByHydratedSource(preview, sourceContent);

  return {
    index: index + 1,
    citationId,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    evidenceTier: expanded ? "expanded_candidate" : "baseline",
    title: compactText(item.title, baselineTextLimit),
    bodyPreview: covered ? undefined : preview,
    sourceContent,
    acceptedReaderPresentation: verifiedV3Presentation
      ? acceptedReaderPresentation(item) : undefined,
    canonicalUrl: item.canonicalUrl,
    authorHandle: item.authorHandle,
    publishedAt: item.publishedAt.toISOString(),
    observedAt: item.observedAt.toISOString(),
    score: item.score,
    providerMetrics: item.providerMetricLabels?.slice(0, 8),
    whyImportant: compactStringArray(item.whyImportant, 3, 160),
    contentQuality: projectReaderSummaryContentQuality(item),
    conversationContext:
      item.conversationContext === undefined
        ? undefined
        : compactConversationContext(item.conversationContext),
  };
};
